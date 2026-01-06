import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';

import {
  cleanupOldDeployments,
  generateDeploymentId,
  getRetentionCount,
  uploadToR2,
  type PublishProvider,
} from '~/lib/.server/r2';

interface PublishRequest {
  files: Record<string, string>;
  projectName?: string;
  provider?: PublishProvider;
}

interface CloudflareEnv {
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  SITES_BUCKET?: R2Bucket;
  R2_SITES_WORKER_URL?: string;
  PUBLISH_RETENTION_COUNT?: string;
}

/**
 * Publish API endpoint.
 *
 * Supports two providers:
 * - "pages" (default): Cloudflare Pages Direct Upload API
 * - "r2_worker": Upload to R2, served by Worker
 *
 * Request body:
 * - files: Record<string, string> - file path to content mapping
 * - projectName?: string - project name (default: 'x-builder-preview')
 * - provider?: 'pages' | 'r2_worker' - publish target (default: 'pages')
 */
export async function action({ context, request }: ActionFunctionArgs) {
  const env = context.cloudflare.env as CloudflareEnv;

  try {
    const body = await request.json<PublishRequest>();
    const { files, projectName = 'x-builder-preview', provider = 'pages' } = body;

    if (!files || Object.keys(files).length === 0) {
      return json({ error: 'No files provided for publishing' }, { status: 400 });
    }

    // route to appropriate provider
    if (provider === 'r2_worker') {
      return handleR2Publish(env, files, projectName);
    }

    // default: pages provider
    return handlePagesPublish(env, files, projectName);
  } catch (error) {
    console.error('Publish error:', error);

    return json({ error: 'Internal server error during publish' }, { status: 500 });
  }
}

/**
 * Publish to R2 via Worker.
 */
async function handleR2Publish(
  env: CloudflareEnv,
  files: Record<string, string>,
  projectName: string,
): Promise<Response> {
  const bucket = env.SITES_BUCKET;
  const workerUrl = env.R2_SITES_WORKER_URL;

  if (!bucket) {
    return json({ error: 'R2 bucket not configured. Set SITES_BUCKET binding.' }, { status: 500 });
  }

  if (!workerUrl) {
    return json({ error: 'R2 worker URL not configured. Set R2_SITES_WORKER_URL.' }, { status: 500 });
  }

  const deploymentId = generateDeploymentId();

  const result = await uploadToR2(bucket, { files, projectId: projectName, deploymentId }, workerUrl);

  // schedule retention cleanup (best effort, don't fail publish)
  try {
    const retentionCount = getRetentionCount(env.PUBLISH_RETENTION_COUNT);
    await cleanupOldDeployments(bucket, projectName, retentionCount);
  } catch (err) {
    console.error('Retention cleanup error (non-fatal):', err);
  }

  if (!result.success) {
    return json(
      {
        error: 'Some files failed to upload',
        errors: result.errors,
        url: result.url,
        deploymentId: result.deploymentId,
      },
      { status: 207 },
    );
  }

  return json({
    success: true,
    url: result.url,
    deploymentId: result.deploymentId,
    provider: 'r2_worker',
  });
}

/**
 * Publish to Cloudflare Pages (existing behavior).
 */
async function handlePagesPublish(
  env: CloudflareEnv,
  files: Record<string, string>,
  projectName: string,
): Promise<Response> {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;

  if (!apiToken || !accountId) {
    return json(
      { error: 'Cloudflare credentials not configured. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.' },
      { status: 500 },
    );
  }

  // step 1: create the project if it doesn't exist
  const projectResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectName,
      production_branch: 'main',
    }),
  });

  // project might already exist (409), which is fine
  if (!projectResponse.ok && projectResponse.status !== 409) {
    const errorData = await projectResponse.json();
    console.error('Failed to create project:', errorData);
  }

  // step 2: create a deployment with direct upload
  const formData = new FormData();
  const manifest: Record<string, string> = {};

  for (const [filePath, content] of Object.entries(files)) {
    const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    manifest[normalizedPath] = '';

    const contentType = getContentType(normalizedPath);
    formData.append(normalizedPath, new Blob([content], { type: contentType }), normalizedPath);
  }

  formData.append('manifest', JSON.stringify(manifest));

  const deployResponse = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
      body: formData,
    },
  );

  if (!deployResponse.ok) {
    const errorData = await deployResponse.json();
    console.error('Deployment failed:', errorData);

    return json({ error: 'Deployment failed. Check server logs for details.' }, { status: deployResponse.status });
  }

  const deployResult = (await deployResponse.json()) as {
    result?: { url?: string; id?: string };
  };
  const deploymentUrl = deployResult.result?.url || `https://${projectName}.pages.dev`;

  return json({
    success: true,
    url: deploymentUrl,
    deploymentId: deployResult.result?.id,
    provider: 'pages',
  });
}

/**
 * Get content type based on file extension.
 */
function getContentType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    mjs: 'application/javascript',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    txt: 'text/plain',
    xml: 'application/xml',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}
