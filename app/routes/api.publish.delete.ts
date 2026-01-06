import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';

import { deleteDeployment } from '~/lib/.server/r2';

interface DeleteRequest {
  projectId: string;
  deploymentId: string;
}

interface DeleteEnv {
  SITES_BUCKET?: R2Bucket;
  PUBLISH_ADMIN_TOKEN?: string;
}

const PROJECT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const DEPLOYMENT_ID_PATTERN = /^deploy-\d+-[a-z0-9]+$/;

/**
 * Admin endpoint to delete R2 deployments.
 *
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

  // validate R2 bucket
  const bucket = env.SITES_BUCKET;

  if (!bucket) {
    return json({ error: 'R2 bucket not configured. Set SITES_BUCKET binding.' }, { status: 500 });
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

    // perform deletion
    const result = await deleteDeployment(bucket, projectId, deploymentId);

    return json({
      success: true,
      deletedCount: result.deletedCount,
      projectId: result.projectId,
      deploymentId: result.deploymentId,
    });
  } catch (error) {
    console.error('Delete error:', error);

    return json({ error: 'Internal server error during delete' }, { status: 500 });
  }
}
