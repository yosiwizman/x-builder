/**
 * R2 retention and cleanup utilities.
 */

import type { DeploymentManifest, R2DeleteResult } from './types';

const DEFAULT_RETENTION_COUNT = 5;

/**
 * Parse retention count from environment or use default.
 */
export function getRetentionCount(envValue?: string): number {
  if (!envValue) {
    return DEFAULT_RETENTION_COUNT;
  }

  const parsed = parseInt(envValue, 10);

  return isNaN(parsed) || parsed < 1 ? DEFAULT_RETENTION_COUNT : parsed;
}

/**
 * List all deployments for a project, sorted by creation time (newest first).
 */
export async function listDeployments(bucket: R2Bucket, projectId: string): Promise<DeploymentManifest[]> {
  const manifests: DeploymentManifest[] = [];
  const prefix = `${projectId}/`;

  // list all objects with the project prefix
  const listed = await bucket.list({ prefix });

  // find all manifest files
  const manifestKeys = listed.objects.filter((obj) => obj.key.endsWith('/_manifest.json')).map((obj) => obj.key);

  // fetch each manifest
  for (const key of manifestKeys) {
    try {
      const obj = await bucket.get(key);

      if (obj) {
        const text = await obj.text();
        const manifest = JSON.parse(text) as DeploymentManifest;
        manifests.push(manifest);
      }
    } catch {
      // skip invalid manifests
    }
  }

  // sort by createdAt descending (newest first)
  manifests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return manifests;
}

/**
 * Delete all objects for a specific deployment.
 */
export async function deleteDeployment(
  bucket: R2Bucket,
  projectId: string,
  deploymentId: string,
): Promise<R2DeleteResult> {
  const prefix = `${projectId}/${deploymentId}/`;
  const listed = await bucket.list({ prefix });

  let deletedCount = 0;

  // delete all objects with this prefix
  for (const obj of listed.objects) {
    try {
      await bucket.delete(obj.key);
      deletedCount++;
    } catch {
      // continue on error
    }
  }

  return {
    success: true,
    deletedCount,
    projectId,
    deploymentId,
  };
}

/**
 * Clean up old deployments, keeping only the most recent N.
 *
 * Returns the number of deployments deleted.
 */
export async function cleanupOldDeployments(
  bucket: R2Bucket,
  projectId: string,
  retentionCount: number,
): Promise<number> {
  const deployments = await listDeployments(bucket, projectId);

  // if we have fewer deployments than retention count, nothing to do
  if (deployments.length <= retentionCount) {
    return 0;
  }

  // delete deployments beyond the retention count
  const toDelete = deployments.slice(retentionCount);
  let deletedCount = 0;

  for (const deployment of toDelete) {
    await deleteDeployment(bucket, projectId, deployment.deploymentId);
    deletedCount++;
  }

  return deletedCount;
}
