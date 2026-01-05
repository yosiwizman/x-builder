import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';

interface PublishRequest {
  files: Record<string, string>;
  projectName?: string;
}

interface CloudflareEnv {
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
}

/**
 * MVP Publish API endpoint.
 *
 * Publishes project files to Cloudflare Pages via Direct Upload API.
 *
 * NOTE: The Cloudflare Pages Direct Upload API uses FormData with:
 * - A "manifest" field containing JSON object mapping file paths to empty strings
 * - Individual file fields where field name is the file path and value is file content
 */
export async function action({ context, request }: ActionFunctionArgs) {
  const env = context.cloudflare.env as CloudflareEnv;

  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;

  if (!apiToken || !accountId) {
    return json(
      { error: 'Cloudflare credentials not configured. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.' },
      { status: 500 },
    );
  }

  try {
    const { files, projectName = 'x-builder-preview' } = await request.json<PublishRequest>();

    if (!files || Object.keys(files).length === 0) {
      return json({ error: 'No files provided for publishing' }, { status: 400 });
    }

    /**
     * Create a deployment using Cloudflare Pages Direct Upload.
     *
     * Step 1: Create the project if it doesn't exist.
     */
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

    /**
     * Step 2: Create a deployment with direct upload.
     *
     * Cloudflare Pages Direct Upload expects:
     * - manifest: JSON object with file paths as keys, empty strings as values
     * - individual files: FormData parts with file path as field name
     */
    const formData = new FormData();

    // build manifest with empty string values (per CF API spec)
    const manifest: Record<string, string> = {};

    for (const [filePath, content] of Object.entries(files)) {
      // normalize path to include leading slash (required by CF Pages)
      const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
      manifest[normalizedPath] = '';

      // add file content - use path as field name
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
    });
  } catch (error) {
    console.error('Publish error:', error);
    return json({ error: 'Internal server error during publish' }, { status: 500 });
  }
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
