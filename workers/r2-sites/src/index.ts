/**
 * R2 Sites Worker - serves static files from R2 bucket.
 *
 * URL Pattern: /sites/{projectId}/{deploymentId}/{...filePath}
 *
 * Features:
 * - Deterministic serving: files available immediately after upload
 * - index.html fallback for directory paths
 * - Correct content-type headers
 * - Cache-Control and ETag support
 * - 304 Not Modified for conditional requests
 */

export interface Env {
  SITES_BUCKET: R2Bucket;
  ENVIRONMENT: string;
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

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const startTime = Date.now();

    // health check endpoint
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          environment: env.ENVIRONMENT,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // only handle GET requests for sites
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    // serve static files: /sites/{projectId}/{deploymentId}/{filePath}
    if (url.pathname.startsWith('/sites/')) {
      return handleServe(request, env, url.pathname, startTime);
    }

    return new Response('Not Found', { status: 404 });
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
