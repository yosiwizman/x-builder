import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';

/**
 * Admin endpoint to delete R2 deployments.
 *
 * Architecture: Pages (API) -> HTTP -> R2 Worker -> R2.
 *
 * Cloudflare Pages cannot bind R2 buckets directly.
 * Deletion is performed via HTTP call to the R2 Worker.
 */

interface DeleteRequest {
  projectId: string;
  deploymentId: string;
}

interface DeleteEnv {
  R2_SITES_WORKER_URL?: string;

  /** admin token required from clients for delete operations */
  PUBLISH_ADMIN_TOKEN?: string;

  /** internal token for Pages -> Worker communication */
  R2_SITES_WORKER_TOKEN?: string;
}

const PROJECT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const DEPLOYMENT_ID_PATTERN = /^deploy-\d+-[a-z0-9]+$/;

/**
 * Requires X-Publish-Admin-Token header for authentication.
 *
 * Request body:
 * - projectId: string - project identifier
 * - deploymentId: string - deployment identifier
 */
export async function action({ context, request }: ActionFunctionArgs) {
  const env = context.cloudflare.env as DeleteEnv;

  // validate admin token
  const adminToken = env.PUBLISH_ADMIN_TOKEN;

  if (!adminToken) {
    return json({ error: 'Admin token not configured. Set PUBLISH_ADMIN_TOKEN.' }, { status: 500 });
  }

  const providedToken = request.headers.get('X-Publish-Admin-Token');

  if (!providedToken || providedToken !== adminToken) {
    return json({ error: 'Unauthorized. Invalid or missing admin token.' }, { status: 401 });
  }

  // validate R2 Worker URL and internal token
  const workerUrl = env.R2_SITES_WORKER_URL;
  const internalToken = env.R2_SITES_WORKER_TOKEN;

  if (!workerUrl) {
    return json({ error: 'R2 worker URL not configured. Set R2_SITES_WORKER_URL.' }, { status: 500 });
  }

  if (!internalToken) {
    return json({ error: 'Internal worker token not configured. Set R2_SITES_WORKER_TOKEN.' }, { status: 500 });
  }

  try {
    const body = await request.json<DeleteRequest>();
    const { projectId, deploymentId } = body;

    // validate projectId
    if (!projectId || typeof projectId !== 'string') {
      return json({ error: 'Missing or invalid projectId' }, { status: 400 });
    }

    if (!PROJECT_ID_PATTERN.test(projectId)) {
      return json({ error: 'Invalid projectId format. Use alphanumeric, dash, or underscore.' }, { status: 400 });
    }

    // validate deploymentId
    if (!deploymentId || typeof deploymentId !== 'string') {
      return json({ error: 'Missing or invalid deploymentId' }, { status: 400 });
    }

    if (!DEPLOYMENT_ID_PATTERN.test(deploymentId)) {
      return json({ error: 'Invalid deploymentId format. Expected deploy-{timestamp}-{random}.' }, { status: 400 });
    }

    // call R2 Worker delete endpoint with internal auth
    const deleteUrl = `${workerUrl.replace(/\/$/, '')}/delete`;

    const deleteResponse = await fetch(deleteUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${internalToken}`,
      },
      body: JSON.stringify({ projectId, deploymentId }),
    });

    const result = (await deleteResponse.json()) as {
      success?: boolean;
      deletedCount?: number;
      error?: string;
    };

    if (!deleteResponse.ok || !result.success) {
      return json({ error: result.error || 'Delete failed' }, { status: deleteResponse.status || 500 });
    }

    return json({
      success: true,
      deletedCount: result.deletedCount,
      projectId,
      deploymentId,
    });
  } catch (error) {
    console.error('Delete error:', error);

    return json({ error: 'Internal server error during delete' }, { status: 500 });
  }
}
