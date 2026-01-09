import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';

/**
 * Publish API endpoint.
 *
 * Architecture: Pages (API) -> HTTP -> R2 Worker -> R2.
 *
 * Cloudflare Pages cannot bind R2 buckets directly via UI.
 * All R2 access happens exclusively through the R2 Worker via HTTP.
 */

type PublishProvider = 'pages' | 'r2_worker';

interface PublishRequest {
  files: Record<string, string>;
  projectName?: string;
  provider?: PublishProvider;
}

interface CloudflareEnv {
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  R2_SITES_WORKER_URL?: string;

  /** token required from clients for r2_worker provider */
  PUBLISH_TOKEN?: string;

  /** internal token for Pages -> Worker communication */
  R2_SITES_WORKER_TOKEN?: string;
  PUBLISH_RETENTION_COUNT?: string;
}

/**
 * Supports two providers:
 * - "pages" (default): Cloudflare Pages Direct Upload API (no auth required)
 * - "r2_worker": Upload to R2 via HTTP, served by Worker (requires X-Publish-Token)
 *
 * Request body:
 * - files: Record<string, string> - file path to content mapping
 * - projectName?: string - project name (default: 'x-builder-preview')
 * - provider?: 'pages' | 'r2_worker' - publish target (default: 'pages')
 *
 * Headers (r2_worker only):
 * - X-Publish-Token: required auth token for r2_worker provider
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
      // r2_worker requires client auth token
      const authError = validatePublishToken(request, env);

      if (authError) {
        return authError;
      }

      return handleR2Publish(env, files, projectName);
    }

    // default: pages provider (no additional auth required)
    return handlePagesPublish(env, files, projectName);
  } catch (error) {
    console.error('Publish error:', error);

    return json({ error: 'Internal server error during publish' }, { status: 500 });
  }
}

/**
 * Validate client publish token for r2_worker provider.
 */
function validatePublishToken(request: Request, env: CloudflareEnv): Response | null {
  const expectedToken = env.PUBLISH_TOKEN;

  if (!expectedToken) {
    return json({ error: 'Server misconfigured: PUBLISH_TOKEN not set.' }, { status: 500 });
  }

  const providedToken = request.headers.get('X-Publish-Token');

  if (!providedToken) {
    return json(
      { error: 'Missing X-Publish-Token header. Authentication required for r2_worker provider.' },
      { status: 401 },
    );
  }

  if (providedToken !== expectedToken) {
    return json({ error: 'Invalid X-Publish-Token. Authentication failed.' }, { status: 401 });
  }

  return null; // valid
}

/**
 * Publish to R2 via HTTP call to Worker.
 *
 * Architecture: Pages -> HTTP -> R2 Worker -> R2.
 * Pages cannot bind R2 directly; all R2 access goes through the Worker.
 */
async function handleR2Publish(
  env: CloudflareEnv,
  files: Record<string, string>,
  projectName: string,
): Promise<Response> {
  const workerUrl = env.R2_SITES_WORKER_URL;
  const internalToken = env.R2_SITES_WORKER_TOKEN;

  if (!workerUrl) {
    return json({ error: 'R2 worker URL not configured. Set R2_SITES_WORKER_URL.' }, { status: 500 });
  }

  if (!internalToken) {
    return json({ error: 'Internal worker token not configured. Set R2_SITES_WORKER_TOKEN.' }, { status: 500 });
  }

  // call Worker upload endpoint with internal auth
  const uploadUrl = `${workerUrl.replace(/\/$/, '')}/upload`;

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${internalToken}`,
    },
    body: JSON.stringify({
      files,
      projectId: projectName,
    }),
  });

  const uploadResult = (await uploadResponse.json()) as {
    success?: boolean;
    url?: string;
    deploymentId?: string;
    error?: string;
    errors?: string[];
  };

  if (!uploadResponse.ok || !uploadResult.success) {
    return json(
      {
        error: uploadResult.error || 'Upload to R2 Worker failed',
        errors: uploadResult.errors,
      },
      { status: uploadResponse.status || 500 },
    );
  }

  // schedule retention cleanup (best effort, don't fail publish)
  try {
    const retentionCount = getRetentionCount(env.PUBLISH_RETENTION_COUNT);
    const cleanupUrl = `${workerUrl.replace(/\/$/, '')}/cleanup`;

    await fetch(cleanupUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${internalToken}`,
      },
      body: JSON.stringify({
        projectId: projectName,
        retentionCount,
      }),
    });
  } catch (err) {
    console.error('Retention cleanup error (non-fatal):', err);
  }

  return json({
    success: true,
    url: uploadResult.url,
    deploymentId: uploadResult.deploymentId,
    provider: 'r2_worker',
  });
}

/** Parse retention count from env or use default */
function getRetentionCount(envValue?: string): number {
  const DEFAULT = 5;

  if (!envValue) {
    return DEFAULT;
  }

  const parsed = parseInt(envValue, 10);

  return isNaN(parsed) || parsed < 1 ? DEFAULT : parsed;
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
