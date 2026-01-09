# X Builder

[![CI](https://github.com/yosiwizman/x-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/yosiwizman/x-builder/actions/workflows/ci.yml)

AI-powered full-stack web development in the browser.

> **Based on [Bolt.new](https://github.com/stackblitz/bolt.new)** - the open-source AI web development agent by StackBlitz.

## Production

🚀 **Live URL**: https://x-builder-staging.pages.dev

**Status**: Production (Cloudflare Pages)

> **Note**: Custom domain can be added later without downtime.

## About

X Builder is a white-label fork of Bolt.new that allows you to prompt, run, edit, and deploy full-stack applications directly from your browser.

### Features

- **Full-Stack in the Browser**: Integrates AI models with an in-browser development environment powered by **StackBlitz's WebContainers**
  - Install and run npm tools and libraries (Vite, Next.js, etc.)
  - Run Node.js servers
  - Interact with third-party APIs
  - Deploy to production from chat

- **AI with Environment Control**: AI models have complete control over the filesystem, node server, package manager, terminal, and browser console

## 2-Minute Demo: Enable AI on Staging

X Builder uses **BYOK (Bring Your Own Key)** - you provide your own LLM API key.

### Quick Start

1. **Open staging**: https://x-builder-staging.pages.dev
2. **Open Settings**: Hover on the left edge to reveal the sidebar, click **Settings** (gear icon)
3. **Select Provider**: Choose OpenRouter (recommended), OpenAI, or Anthropic
4. **Enter API Key**: Paste your key (keys start with `sk-or-`, `sk-`, or `sk-ant-`)
5. **Save**: Click Save button
6. **Test**: Type a prompt like "Create a simple counter component in React" and press Enter

### Get an API Key

| Provider | Get Key | Key Prefix |
|----------|---------|------------|
| OpenRouter | https://openrouter.ai/keys | `sk-or-` |
| OpenAI | https://platform.openai.com/api-keys | `sk-` |
| Anthropic | https://console.anthropic.com/settings/keys | `sk-ant-` |

> **Recommended**: OpenRouter gives access to multiple models (Claude, GPT-4, etc.) with a single key.

### What You'll See

- **Success**: AI generates code, files appear in the editor, preview updates live
- **401 Error**: Check your API key in Settings
- **Rate Limit**: Wait a moment or check your provider's usage limits

### Key Security

- Keys are stored in your browser's localStorage (never on our servers)
- Keys are sent only to the LLM provider via secure HTTPS
- Keys are never logged or exposed in error messages

## Tips and Tricks

- **Be specific about your stack**: Mention frameworks/libraries in your initial prompt
- **Use the enhance prompt icon**: Refine your prompt with AI assistance before submitting
- **Scaffold basics first**: Establish the foundation before adding advanced features
- **Batch simple instructions**: Combine multiple simple tasks in one message

## Technical Notes

### Security

X Builder uses token-based authentication for sensitive operations.

#### Authentication Tokens

| Token | Header | Purpose | Required For |
|-------|--------|---------|-------------|
| `PUBLISH_TOKEN` | `X-Publish-Token` | Client auth for r2_worker | `POST /api/publish` with `provider=r2_worker` |
| `PUBLISH_ADMIN_TOKEN` | `X-Publish-Admin-Token` | Admin operations | `POST /api/publish/delete` |
| `R2_SITES_WORKER_TOKEN` | `Authorization: Bearer` | Internal Pages→Worker | Protected Worker endpoints |

#### Environment Setup

**Pages Project** (set in Cloudflare Dashboard for Preview/Production):
```
PUBLISH_TOKEN=<client-publish-token>
PUBLISH_ADMIN_TOKEN=<admin-delete-token>
R2_SITES_WORKER_TOKEN=<internal-shared-secret>
```

**R2 Worker** (set via wrangler secret):
```bash
wrangler secret put R2_SITES_WORKER_TOKEN --env staging
```

#### Public vs Protected Endpoints

**Public** (no auth required):
- `GET /api/publish` with default `pages` provider
- `GET /health` on R2 Worker
- `GET /sites/*` static file serving
- `GET /deployments/*` list deployments

**Protected** (requires token):
- `POST /api/publish` with `provider=r2_worker` → requires `X-Publish-Token`
- `POST /api/publish/delete` → requires `X-Publish-Admin-Token`
- Worker: `POST /upload`, `POST /delete`, `POST /cleanup` → require `Authorization: Bearer`

### Publish Providers

X Builder supports two publish providers:

#### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    PAGES PROVIDER                        │
│  Pages App  ──────> Cloudflare Pages API                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  R2 WORKER PROVIDER                       │
│  Pages App  ──HTTP──> R2 Worker  ─────> R2 Bucket          │
└─────────────────────────────────────────────────────────┘
```

> **Important**: Cloudflare Pages cannot bind R2 buckets via the dashboard UI.
> R2 access is handled exclusively by the R2 Worker via HTTP.

#### 1. Cloudflare Pages (default)

Deploys projects to Cloudflare Pages via Direct Upload API.

**Environment Variables**:
- `CLOUDFLARE_API_TOKEN` - API token with Pages permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

> **Note**: Pages deployments may experience propagation delays (known 500 errors after deploy).

#### 2. R2 Worker (opt-in, deterministic)

Deploys projects to R2 via HTTP, served by a dedicated Worker. This provider is **deterministic**: files are available immediately after upload.

**Environment Variables** (set on Pages project):
- `R2_SITES_WORKER_URL` - Base URL of the R2 Worker
- `PUBLISH_TOKEN` - Client auth token for `provider=r2_worker` requests
- `PUBLISH_ADMIN_TOKEN` - Admin token for `/api/publish/delete` endpoint
- `R2_SITES_WORKER_TOKEN` - Internal token for Pages -> Worker communication
- `PUBLISH_RETENTION_COUNT` - Number of deployments to keep (default: 5)

**Environment Variables** (set on R2 Worker):
- `R2_SITES_WORKER_TOKEN` - Must match the Pages value for authentication

**Usage**:
```bash
# Publish via R2 (requires X-Publish-Token)
curl -X POST https://your-app/api/publish \
  -H "Content-Type: application/json" \
  -H "X-Publish-Token: your-publish-token" \
  -d '{"files": {...}, "projectName": "my-app", "provider": "r2_worker"}'

# Delete deployment (requires X-Publish-Admin-Token)
curl -X POST https://your-app/api/publish/delete \
  -H "Content-Type: application/json" \
  -H "X-Publish-Admin-Token: your-admin-token" \
  -d '{"projectId": "my-app", "deploymentId": "deploy-123-abc"}'
```

**R2 Worker Setup**:
```bash
# Create R2 bucket
wrangler r2 bucket create x-builder-sites

# Set internal auth token on Worker (same value as Pages R2_SITES_WORKER_TOKEN)
wrangler secret put R2_SITES_WORKER_TOKEN --env staging

# Deploy R2 Worker
cd workers/r2-sites
npm run deploy
```

**R2 Worker Endpoints**:
- `GET /health` - Health check (public)
- `GET /sites/{projectId}/{deploymentId}/{path}` - Serve static files (public)
- `POST /upload` - Upload files (protected: requires Bearer token)
- `POST /delete` - Delete deployment (protected: requires Bearer token)
- `GET /deployments/{projectId}` - List deployments (public)
- `POST /cleanup` - Retention cleanup (protected: requires Bearer token)

**Components**:
- `app/routes/api.publish.ts` - API endpoint (routes to provider via HTTP)
- `app/routes/api.publish.delete.ts` - Admin delete endpoint (calls Worker via HTTP)
- `workers/r2-sites/` - R2 Worker (handles all R2 operations)
- `app/lib/stores/publish.ts` - State management for publish status
- `app/components/workbench/PublishButton.client.tsx` - UI button component

### Security

The R2 Worker publish path uses a two-layer authentication model:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Client  ──X-Publish-Token──> Pages API ──Bearer Token──> R2 Worker │
└─────────────────────────────────────────────────────────────────────┘
```

**Layer 1: Client -> Pages API**
- Default `pages` provider: No auth required (uses server-side Cloudflare credentials)
- `r2_worker` provider: Requires `X-Publish-Token` header
- Delete endpoint: Requires `X-Publish-Admin-Token` header

**Layer 2: Pages API -> R2 Worker**
- All write operations (upload/delete/cleanup) require `Authorization: Bearer <token>`
- Public endpoints (`/health`, `/sites/*`, `/deployments/*`) need no auth

**Required Secrets**:

| Secret | Where | Purpose |
|--------|-------|----------|
| `PUBLISH_TOKEN` | Pages | Client auth for r2_worker provider |
| `PUBLISH_ADMIN_TOKEN` | Pages | Client auth for delete endpoint |
| `R2_SITES_WORKER_TOKEN` | Pages + Worker | Internal Pages->Worker auth |

### Cross-Origin Isolation

X Builder requires `crossOriginIsolated` to be enabled for WebContainers (SharedArrayBuffer). This is achieved via HTTP headers:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless`

These headers are set in:
- `public/_headers` - Cloudflare Pages static headers
- `app/entry.server.tsx` - Server-side rendering
- `functions/[[path]].ts` - Cloudflare Pages Functions
- `vite.config.ts` - Development server

To verify: Open DevTools console and check `self.crossOriginIsolated === true`

## Development

### Prerequisites

- Node.js 20.15.1+
- pnpm 9.4.0+

### Setup

```bash
pnpm install
pnpm run dev
```

### Scripts

- `pnpm run dev` - Start development server
- `pnpm run build` - Build for production
- `pnpm run lint` - Run ESLint
- `pnpm run typecheck` - Run TypeScript checks
- `pnpm test` - Run tests
- `pnpm smoke:publish <site-url>` - Smoke test the publish API

Examples:
```bash
# Contract mode - verify API contract only (no auth needed)
pnpm smoke:publish https://x-builder-staging.pages.dev

# E2E mode (Pages provider) - no auth needed
pnpm smoke:publish https://x-builder-staging.pages.dev --e2e

# E2E mode (R2 provider) - requires publish token
pnpm smoke:publish https://x-builder-staging.pages.dev --e2e --r2 --publish-token=YOUR_TOKEN

# Or use environment variable
PUBLISH_TOKEN=YOUR_TOKEN pnpm smoke:publish https://x-builder-staging.pages.dev --e2e --r2

# Full R2 E2E with worker health check
pnpm smoke:publish https://x-builder-staging.pages.dev --e2e --r2 --publish-token=YOUR_TOKEN --worker-url=https://x-builder-r2-sites-staging.x-builder-staging.workers.dev
```
# R2 E2E mode - deploy via R2 Worker (requires token)
pnpm smoke:publish https://x-builder-staging.pages.dev --e2e --r2 --publish-token=YOUR_TOKEN

# R2 E2E mode with Worker health check
pnpm smoke:publish https://x-builder-staging.pages.dev --e2e --r2 \
  --publish-token=YOUR_TOKEN \
  --worker-url=https://x-builder-r2-sites-staging.x-builder-staging.workers.dev
```

### Deployment

Production deploys automatically from `main` branch via GitHub Actions to Cloudflare Pages.

Required GitHub Secrets:
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token with Pages edit permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

### Release Process

```
1. Create a Pull Request with your changes
2. CI runs automatically (lint, typecheck, tests)
3. CI must pass before merge is allowed
4. Merge PR to main
5. Auto-deploy to production (Cloudflare Pages)
```

**Safeguards**:
- Branch protection requires PR reviews
- All CI checks must pass
- Direct pushes to `main` are blocked
- Linear history enforced

## Attribution

This project is based on [Bolt.new](https://github.com/stackblitz/bolt.new) by [StackBlitz](https://stackblitz.com/), licensed under MIT.
