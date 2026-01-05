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
 * TODO: The Cloudflare Pages Direct Upload API requires a multi-step process:
 * 1. Create upload session
 * 2. Upload files as form data
 * 3. Create deployment
 * This MVP implementation provides the endpoint structure - full implementation
 * may need adjustment based on actual API requirements.
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
     * Note: This uses the simplified deployment endpoint.
     * For larger projects, the multi-part upload flow should be used.
     */
    const formData = new FormData();

    // add manifest
    const manifest: Record<string, string> = {};

    for (const [filePath, content] of Object.entries(files)) {
      const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
      const hash = await hashContent(content);
      manifest[normalizedPath] = hash;

      // add file as blob
      formData.append(hash, new Blob([content], { type: 'application/octet-stream' }), normalizedPath);
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
 * Simple hash function for file content (used for manifest).
 */
async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
