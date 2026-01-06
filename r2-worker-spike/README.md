# R2 Worker Spike

**SPIKE - DO NOT MERGE WITHOUT EXPLICIT APPROVAL**

This is an isolated spike to evaluate R2 + Worker as an alternative to Cloudflare Pages for static site hosting.

## Objectives

1. **Feasibility**: Can we serve static sites from R2 via a Worker?
2. **Determinism**: Does upload → URL available → HTTP 200 work reliably?
3. **Latency**: What's the TTFB compared to Pages?
4. **Gaps**: What's missing for production?

## URL Pattern

```
/sites/{projectId}/{deploymentId}/{filePath}
```

Example: `/sites/my-app/deploy-123/index.html`

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/upload/{projectId}/{deploymentId}` | Upload files (JSON body with base64 content) |
| GET | `/sites/{projectId}/{deploymentId}/{path}` | Serve static file |
| GET | `/list/{projectId}` | List deployments (debug) |

## Local Development

```bash
cd r2-worker-spike
pnpm install
pnpm dev
```

Wrangler will create a local R2 mock in `.wrangler/state/`.

## Testing Determinism

With the worker running locally:

```bash
npx tsx test/determinism.ts
```

Or against deployed worker:

```bash
WORKER_URL=https://x-builder-r2-spike.<subdomain>.workers.dev npx tsx test/determinism.ts
```

## Deploy (for testing only)

```bash
# Create R2 bucket first
pnpm create-bucket

# Deploy worker
pnpm deploy
```

## What This Spike Does NOT Include

- Authentication/authorization
- Retention policies
- Delete API
- Custom domains
- Integration with main x-builder publish flow
- Error pages (404.html, etc.)
- Compression (gzip/brotli)
- Range requests for large files

## Files

- `wrangler.toml` - Worker configuration with R2 binding
- `src/index.ts` - Minimal Worker implementation
- `test/determinism.ts` - Test script for verifying determinism
