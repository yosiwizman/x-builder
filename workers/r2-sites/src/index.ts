/**
 * R2 Sites Worker - serves static files from R2 bucket.
 *
 * Architecture: Pages (API) -> HTTP -> R2 Worker -> R2.
 *
 * Cloudflare Pages cannot bind R2 buckets directly.
 * All R2 access happens exclusively through this Worker via HTTP.
 *
 * Endpoints:
 * - GET  /health                                    - Health check (public)
 * - GET  /sites/{projectId}/{deploymentId}/{path}   - Serve static files (public)
 * - POST /upload                                    - Upload files to R2 (protected)
 * - POST /delete                                    - Delete deployment (protected)
 * - GET  /deployments/{projectId}                   - List deployments (public)
 * - POST /cleanup                                   - Retention cleanup (protected)
 *
 * Security:
 * - Public endpoints: /health, /sites/*, /deployments/*
 * - Protected endpoints require: Authorization: Bearer <R2_SITES_WORKER_TOKEN>
 *
 * Features:
 * - Deterministic serving: files available immediately after upload
 * - index.html fallback for directory paths
 * - Correct content-type headers
 * - Cache-Control and ETag support
 */

export interface Env {
  SITES_BUCKET: R2Bucket;
  ENVIRONMENT: string;
  /** internal token for Pages -> Worker authentication */
  R2_SITES_WORKER_TOKEN?: string;
}

const MIME_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  txt: 'text/plain; charset=utf-8',
  xml: 'application/xml',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  pdf: 'application/pdf',
  wasm: 'application/wasm',
  map: 'application/json',
};

function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';

  return MIME_TYPES[ext] || 'application/octet-stream';
}

interface RouteParams {
  projectId: string;
  deploymentId: string;
  filePath: string;
}

function parseRoute(pathname: string): RouteParams | null {
  const match = pathname.match(/^\/sites\/([^/]+)\/([^/]+)\/(.+)$/);

  if (!match) {
    return null;
  }

  return {
    projectId: match[1],
    deploymentId: match[2],
    filePath: match[3],
  };
}

function buildR2Key(projectId: string, deploymentId: string, filePath: string): string {
  return `${projectId}/${deploymentId}/${filePath}`;
}

/**
 * Validate internal Bearer token for protected operations.
 * Protected endpoints: /upload, /delete, /cleanup.
 */
function validateInternalToken(request: Request, env: Env): Response | null {
  const expectedToken = env.R2_SITES_WORKER_TOKEN;

  if (!expectedToken) {
    return jsonResponse({ error: 'Server misconfigured: R2_SITES_WORKER_TOKEN not set.' }, 500);
  }

  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header.' }, 401);
  }

  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Invalid Authorization header format. Expected: Bearer <token>' }, 401);
  }

  const providedToken = authHeader.slice(7); // remove 'Bearer '

  if (providedToken !== expectedToken) {
    return jsonResponse({ error: 'Invalid token. Authentication failed.' }, 401);
  }

  return null; // valid
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Generate unique deployment ID */
function generateDeploymentId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);

  return `deploy-${timestamp}-${random}`;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const startTime = Date.now();

    // health check endpoint
    if (url.pathname === '/health') {
      return jsonResponse({
        status: 'ok',
        environment: env.ENVIRONMENT,
        timestamp: new Date().toISOString(),
      });
    }

    // POST /upload - upload files to R2 (protected)
    if (request.method === 'POST' && url.pathname === '/upload') {
      const authError = validateInternalToken(request, env);

      if (authError) {
        return authError;
      }

      return handleUpload(request, env);
    }

    // POST /delete - delete deployment (protected)
    if (request.method === 'POST' && url.pathname === '/delete') {
      const authError = validateInternalToken(request, env);

      if (authError) {
        return authError;
      }

      return handleDelete(request, env);
    }

    // GET /deployments/{projectId} - list deployments (public)
    if (request.method === 'GET' && url.pathname.startsWith('/deployments/')) {
      const projectId = url.pathname.replace('/deployments/', '');

      return handleListDeployments(env, projectId);
    }

    // POST /cleanup - retention cleanup (protected)
    if (request.method === 'POST' && url.pathname === '/cleanup') {
      const authError = validateInternalToken(request, env);

      if (authError) {
        return authError;
      }

      return handleCleanup(request, env);
    }

    // GET /sites/{projectId}/{deploymentId}/{filePath} - serve files
    if (request.method === 'GET' && url.pathname.startsWith('/sites/')) {
      return handleServe(request, env, url.pathname, startTime);
    }

    return jsonResponse({ error: 'Not Found' }, 404);
  },
};

async function handleServe(
  request: Request,
  env: Env,
  pathname: string,
  startTime: number,
): Promise<Response> {
  const route = parseRoute(pathname);

  if (!route) {
    return new Response('Invalid path. Expected /sites/{projectId}/{deploymentId}/{filePath}', {
      status: 400,
    });
  }

  const { projectId, deploymentId, filePath } = route;

  // try exact path first, then index.html for directory-like paths
  const pathsToTry = [filePath];

  if (!filePath.includes('.')) {
    // might be a directory, try index.html
    const withIndex = filePath.endsWith('/') ? `${filePath}index.html` : `${filePath}/index.html`;
    pathsToTry.push(withIndex);
  }

  for (const tryPath of pathsToTry) {
    const r2Key = buildR2Key(projectId, deploymentId, tryPath);
    const object = await env.SITES_BUCKET.get(r2Key);

    if (object) {
      const headers = new Headers();

      // content type from stored metadata or inferred
      const contentType = object.httpMetadata?.contentType || getMimeType(tryPath);
      headers.set('Content-Type', contentType);

      // cache headers - deployments are immutable
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');

      // ETag for cache validation
      headers.set('ETag', object.etag);

      // timing header for debugging
      headers.set('X-Response-Time', `${Date.now() - startTime}ms`);

      // handle conditional requests (If-None-Match)
      const ifNoneMatch = request.headers.get('If-None-Match');

      if (ifNoneMatch === object.etag) {
        return new Response(null, { status: 304, headers });
      }

      // CORS headers for cross-origin access
      headers.set('Access-Control-Allow-Origin', '*');

      return new Response(object.body, { headers });
    }
  }

  // file not found
  return new Response(`File not found: ${filePath}`, {
    status: 404,
    headers: {
      'Content-Type': 'text/plain',
      'X-Response-Time': `${Date.now() - startTime}ms`,
    },
  });
}

// === Upload Handler ===

interface UploadRequest {
  files: Record<string, string>;
  projectId: string;
  deploymentId?: string;
}

interface DeploymentManifest {
  projectId: string;
  deploymentId: string;
  files: string[];
  createdAt: string;
  fileCount: number;
}

async function handleUpload(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as UploadRequest;
    const { files, projectId, deploymentId: providedDeploymentId } = body;

    if (!files || Object.keys(files).length === 0) {
      return jsonResponse({ error: 'No files provided' }, 400);
    }

    if (!projectId) {
      return jsonResponse({ error: 'projectId is required' }, 400);
    }

    const deploymentId = providedDeploymentId || generateDeploymentId();
    const uploadedFiles: string[] = [];
    const errors: string[] = [];

    // upload each file
    for (const [filePath, content] of Object.entries(files)) {
      const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
      const r2Key = buildR2Key(projectId, deploymentId, normalizedPath);

      try {
        const mimeType = getMimeType(normalizedPath);

        await env.SITES_BUCKET.put(r2Key, content, {
          httpMetadata: { contentType: mimeType },
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

    // write manifest
    const manifest: DeploymentManifest = {
      projectId,
      deploymentId,
      files: uploadedFiles,
      createdAt: new Date().toISOString(),
      fileCount: uploadedFiles.length,
    };

    const manifestKey = buildR2Key(projectId, deploymentId, '_manifest.json');

    await env.SITES_BUCKET.put(manifestKey, JSON.stringify(manifest), {
      httpMetadata: { contentType: 'application/json' },
    });

    // construct URL (use request origin for base)
    const origin = new URL(request.url).origin;
    const url = `${origin}/sites/${projectId}/${deploymentId}/index.html`;

    if (errors.length > 0) {
      return jsonResponse(
        {
          success: false,
          projectId,
          deploymentId,
          url,
          uploadedFiles,
          errors,
        },
        207,
      );
    }

    return jsonResponse({
      success: true,
      projectId,
      deploymentId,
      url,
      uploadedFiles,
    });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Upload failed' }, 500);
  }
}

// === Delete Handler ===

interface DeleteRequest {
  projectId: string;
  deploymentId: string;
}

async function handleDelete(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as DeleteRequest;
    const { projectId, deploymentId } = body;

    if (!projectId || !deploymentId) {
      return jsonResponse({ error: 'projectId and deploymentId are required' }, 400);
    }

    const prefix = `${projectId}/${deploymentId}/`;
    const listed = await env.SITES_BUCKET.list({ prefix });

    let deletedCount = 0;

    for (const obj of listed.objects) {
      try {
        await env.SITES_BUCKET.delete(obj.key);
        deletedCount++;
      } catch {
        // continue on error
      }
    }

    return jsonResponse({
      success: true,
      deletedCount,
      projectId,
      deploymentId,
    });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Delete failed' }, 500);
  }
}

// === List Deployments Handler ===

async function handleListDeployments(env: Env, projectId: string): Promise<Response> {
  if (!projectId) {
    return jsonResponse({ error: 'projectId is required' }, 400);
  }

  try {
    const manifests: DeploymentManifest[] = [];
    const prefix = `${projectId}/`;

    const listed = await env.SITES_BUCKET.list({ prefix });
    const manifestKeys = listed.objects.filter((obj) => obj.key.endsWith('/_manifest.json')).map((obj) => obj.key);

    for (const key of manifestKeys) {
      try {
        const obj = await env.SITES_BUCKET.get(key);

        if (obj) {
          const text = await obj.text();
          const manifest = JSON.parse(text) as DeploymentManifest;
          manifests.push(manifest);
        }
      } catch {
        // skip invalid
      }
    }

    // sort newest first
    manifests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return jsonResponse({ projectId, deployments: manifests });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'List failed' }, 500);
  }
}

// === Cleanup Handler ===

interface CleanupRequest {
  projectId: string;
  retentionCount?: number;
}

const DEFAULT_RETENTION_COUNT = 5;

async function handleCleanup(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as CleanupRequest;
    const { projectId, retentionCount = DEFAULT_RETENTION_COUNT } = body;

    if (!projectId) {
      return jsonResponse({ error: 'projectId is required' }, 400);
    }

    // list deployments
    const manifests: DeploymentManifest[] = [];
    const prefix = `${projectId}/`;
    const listed = await env.SITES_BUCKET.list({ prefix });
    const manifestKeys = listed.objects.filter((obj) => obj.key.endsWith('/_manifest.json')).map((obj) => obj.key);

    for (const key of manifestKeys) {
      try {
        const obj = await env.SITES_BUCKET.get(key);

        if (obj) {
          const text = await obj.text();
          manifests.push(JSON.parse(text) as DeploymentManifest);
        }
      } catch {
        // skip
      }
    }

    manifests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (manifests.length <= retentionCount) {
      return jsonResponse({ projectId, deletedCount: 0, message: 'Nothing to clean up' });
    }

    const toDelete = manifests.slice(retentionCount);
    let deletedCount = 0;

    for (const deployment of toDelete) {
      const delPrefix = `${projectId}/${deployment.deploymentId}/`;
      const delListed = await env.SITES_BUCKET.list({ prefix: delPrefix });

      for (const obj of delListed.objects) {
        try {
          await env.SITES_BUCKET.delete(obj.key);
          deletedCount++;
        } catch {
          // continue
        }
      }
    }

    return jsonResponse({
      projectId,
      deletedDeployments: toDelete.map((d) => d.deploymentId),
      deletedFileCount: deletedCount,
    });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Cleanup failed' }, 500);
  }
}
