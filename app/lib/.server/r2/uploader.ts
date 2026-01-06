/**
 * R2 uploader for publishing static sites.
 */

import { getMimeType } from './mime-types';
import type { DeploymentManifest, R2PublishRequest, R2PublishResult } from './types';

/**
 * Build R2 object key from project/deployment/file path.
 */
export function buildR2Key(projectId: string, deploymentId: string, filePath: string): string {
  return `${projectId}/${deploymentId}/${filePath}`;
}

/**
 * Generate a unique deployment ID.
 */
export function generateDeploymentId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);

  return `deploy-${timestamp}-${random}`;
}

/**
 * Upload files to R2 bucket.
 */
export async function uploadToR2(
  bucket: R2Bucket,
  request: R2PublishRequest,
  workerBaseUrl: string,
): Promise<R2PublishResult> {
  const { files, projectId, deploymentId } = request;
  const uploadedFiles: string[] = [];
  const errors: string[] = [];

  // upload each file to R2
  for (const [filePath, content] of Object.entries(files)) {
    const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const r2Key = buildR2Key(projectId, deploymentId, normalizedPath);

    try {
      const mimeType = getMimeType(normalizedPath);

      await bucket.put(r2Key, content, {
        httpMetadata: {
          contentType: mimeType,
        },
        customMetadata: {
          uploadedAt: new Date().toISOString(),
          projectId,
          deploymentId,
        },
      });

      uploadedFiles.push(normalizedPath);
    } catch (err) {
      errors.push(`${normalizedPath}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  // write deployment manifest for tracking
  const manifest: DeploymentManifest = {
    projectId,
    deploymentId,
    files: uploadedFiles,
    createdAt: new Date().toISOString(),
    fileCount: uploadedFiles.length,
  };

  const manifestKey = buildR2Key(projectId, deploymentId, '_manifest.json');

  await bucket.put(manifestKey, JSON.stringify(manifest), {
    httpMetadata: { contentType: 'application/json' },
  });

  // construct the deployment URL
  const baseUrl = workerBaseUrl.replace(/\/$/, '');
  const url = `${baseUrl}/sites/${projectId}/${deploymentId}/index.html`;

  return {
    success: errors.length === 0,
    projectId,
    deploymentId,
    url,
    uploadedFiles,
    errors: errors.length > 0 ? errors : undefined,
  };
}
