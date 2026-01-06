/**
 * R2 Worker Spike - Minimal static site server from R2
 *
 * URL Pattern: /sites/{projectId}/{deploymentId}/{...filePath}
 *
 * This is a SPIKE to evaluate:
 * 1. Feasibility of serving static sites from R2
 * 2. Determinism: upload → URL available → HTTP 200
 * 3. Basic latency (TTFB) and cache behavior
 *
 * NOT FOR PRODUCTION - No auth, no retention, no delete API yet.
 */

export interface Env {
  SITES_BUCKET: R2Bucket;
  ENVIRONMENT: string;
}

interface UploadManifest {
  files: Record<string, string>; // path -> base64 content
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
};

function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function parseRoute(pathname: string): { projectId: string; deploymentId: string; filePath: string } | null {
  // Expected: /sites/{projectId}/{deploymentId}/{...filePath}
  const match = pathname.match(/^\/sites\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return {
    projectId: match[1],
    deploymentId: match[2],
    filePath: match[3],
  };
}

function buildR2Key(projectId: string, deploymentId: string, filePath: string): string {
  return `${projectId}/${deploymentId}/${filePath}`;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const startTime = Date.now();

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Upload endpoint for testing: POST /upload/{projectId}/{deploymentId}
    if (request.method === 'POST' && url.pathname.startsWith('/upload/')) {
      return handleUpload(request, env, url.pathname);
    }

    // Serve static files: GET /sites/{projectId}/{deploymentId}/{filePath}
    if (request.method === 'GET' && url.pathname.startsWith('/sites/')) {
      return handleServe(request, env, ctx, url.pathname, startTime);
    }

    // List deployments for debugging: GET /list/{projectId}
    if (request.method === 'GET' && url.pathname.startsWith('/list/')) {
      return handleList(env, url.pathname);
    }

    return new Response('Not Found', { status: 404 });
  },
};

async function handleUpload(request: Request, env: Env, pathname: string): Promise<Response> {
  // Parse: /upload/{projectId}/{deploymentId}
  const match = pathname.match(/^\/upload\/([^/]+)\/([^/]+)$/);
  if (!match) {
    return new Response(JSON.stringify({ error: 'Invalid upload path. Expected /upload/{projectId}/{deploymentId}' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const [, projectId, deploymentId] = match;

  try {
    const manifest: UploadManifest = await request.json();

    if (!manifest.files || Object.keys(manifest.files).length === 0) {
      return new Response(JSON.stringify({ error: 'No files in manifest' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const uploadedFiles: string[] = [];
    const errors: string[] = [];

    // Upload each file to R2
    for (const [filePath, base64Content] of Object.entries(manifest.files)) {
      const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
      const r2Key = buildR2Key(projectId, deploymentId, normalizedPath);

      try {
        // Decode base64 content
        const content = Uint8Array.from(atob(base64Content), (c) => c.charCodeAt(0));
        const mimeType = getMimeType(normalizedPath);

        await env.SITES_BUCKET.put(r2Key, content, {
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

    // Write deployment manifest for determinism verification
    const manifestKey = buildR2Key(projectId, deploymentId, '_manifest.json');
    await env.SITES_BUCKET.put(
      manifestKey,
      JSON.stringify({
        projectId,
        deploymentId,
        files: uploadedFiles,
        createdAt: new Date().toISOString(),
        fileCount: uploadedFiles.length,
      }),
      {
        httpMetadata: { contentType: 'application/json' },
      },
    );

    return new Response(
      JSON.stringify({
        success: true,
        projectId,
        deploymentId,
        uploadedFiles,
        errors: errors.length > 0 ? errors : undefined,
        baseUrl: `/sites/${projectId}/${deploymentId}/`,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Upload failed',
        details: err instanceof Error ? err.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

async function handleServe(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathname: string,
  startTime: number,
): Promise<Response> {
  const route = parseRoute(pathname);

  if (!route) {
    return new Response('Invalid path. Expected /sites/{projectId}/{deploymentId}/{filePath}', { status: 400 });
  }

  const { projectId, deploymentId, filePath } = route;

  // Try exact path first, then index.html for directories
  const pathsToTry = [filePath];
  if (!filePath.includes('.')) {
    pathsToTry.push(filePath.endsWith('/') ? `${filePath}index.html` : `${filePath}/index.html`);
  }

  for (const tryPath of pathsToTry) {
    const r2Key = buildR2Key(projectId, deploymentId, tryPath);
    const object = await env.SITES_BUCKET.get(r2Key);

    if (object) {
      const headers = new Headers();

      // Set content type
      const contentType = object.httpMetadata?.contentType || getMimeType(tryPath);
      headers.set('Content-Type', contentType);

      // Set cache headers (1 hour for immutable deployments)
      headers.set('Cache-Control', 'public, max-age=3600, immutable');

      // Set ETag for cache validation
      headers.set('ETag', object.etag);

      // Add timing header for latency measurement
      headers.set('X-Response-Time', `${Date.now() - startTime}ms`);
      headers.set('X-R2-Key', r2Key);

      // Handle conditional requests
      const ifNoneMatch = request.headers.get('If-None-Match');
      if (ifNoneMatch === object.etag) {
        return new Response(null, { status: 304, headers });
      }

      return new Response(object.body, { headers });
    }
  }

  // Not found
  return new Response(`File not found: ${filePath}`, {
    status: 404,
    headers: {
      'Content-Type': 'text/plain',
      'X-Response-Time': `${Date.now() - startTime}ms`,
    },
  });
}

async function handleList(env: Env, pathname: string): Promise<Response> {
  // Parse: /list/{projectId}
  const match = pathname.match(/^\/list\/([^/]+)$/);
  if (!match) {
    return new Response(JSON.stringify({ error: 'Invalid list path. Expected /list/{projectId}' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const [, projectId] = match;

  try {
    const listed = await env.SITES_BUCKET.list({ prefix: `${projectId}/` });

    const deployments = new Map<string, { files: string[]; size: number }>();

    for (const obj of listed.objects) {
      // Extract deploymentId from key: {projectId}/{deploymentId}/{filePath}
      const parts = obj.key.split('/');
      if (parts.length >= 3) {
        const deploymentId = parts[1];
        if (!deployments.has(deploymentId)) {
          deployments.set(deploymentId, { files: [], size: 0 });
        }
        const deployment = deployments.get(deploymentId)!;
        deployment.files.push(parts.slice(2).join('/'));
        deployment.size += obj.size;
      }
    }

    return new Response(
      JSON.stringify({
        projectId,
        deployments: Object.fromEntries(deployments),
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'List failed',
        details: err instanceof Error ? err.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
