/**
 * R2 publish provider types.
 */

export type PublishProvider = 'pages' | 'r2_worker';

export interface R2PublishRequest {
  files: Record<string, string>;
  projectId: string;
  deploymentId: string;
}

export interface R2PublishResult {
  success: boolean;
  projectId: string;
  deploymentId: string;
  url: string;
  uploadedFiles: string[];
  errors?: string[];
}

export interface R2DeleteRequest {
  projectId: string;
  deploymentId: string;
}

export interface R2DeleteResult {
  success: boolean;
  deletedCount: number;
  projectId: string;
  deploymentId: string;
}

export interface DeploymentManifest {
  projectId: string;
  deploymentId: string;
  files: string[];
  createdAt: string;
  fileCount: number;
}

export interface R2Env {
  SITES_BUCKET: R2Bucket;
  R2_SITES_WORKER_URL?: string;
  PUBLISH_ADMIN_TOKEN?: string;
  PUBLISH_RETENTION_COUNT?: string;
}
