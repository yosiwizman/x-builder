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

## Tips and Tricks

- **Be specific about your stack**: Mention frameworks/libraries in your initial prompt
- **Use the enhance prompt icon**: Refine your prompt with AI assistance before submitting
- **Scaffold basics first**: Establish the foundation before adding advanced features
- **Batch simple instructions**: Combine multiple simple tasks in one message

## Technical Notes

### Publish Providers

X Builder supports two publish providers:

#### 1. Cloudflare Pages (default)

Deploys projects to Cloudflare Pages via Direct Upload API.

**Environment Variables**:
- `CLOUDFLARE_API_TOKEN` - API token with Pages permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

> **Note**: Pages deployments may experience propagation delays (known 500 errors after deploy).

#### 2. R2 Worker (opt-in, deterministic)

Deploys projects to R2, served by a dedicated Worker. This provider is **deterministic**: files are available immediately after upload.

**Environment Variables**:
- `SITES_BUCKET` - R2 bucket binding (configured in wrangler.toml)
- `R2_SITES_WORKER_URL` - Base URL of the R2 serving worker (e.g., `https://x-builder-r2-sites.your-subdomain.workers.dev`)
- `PUBLISH_ADMIN_TOKEN` - Admin token for delete endpoint (optional)
- `PUBLISH_RETENTION_COUNT` - Number of deployments to keep per project (default: 5)

**Usage**:
```bash
# Publish via R2 (add provider param)
curl -X POST https://your-app/api/publish \
  -H "Content-Type: application/json" \
  -d '{"files": {...}, "projectName": "my-app", "provider": "r2_worker"}'

# Delete deployment (admin)
curl -X POST https://your-app/api/publish/delete \
  -H "Content-Type: application/json" \
  -H "X-Publish-Admin-Token: your-token" \
  -d '{"projectId": "my-app", "deploymentId": "deploy-123-abc"}'
```

**R2 Worker Setup**:
```bash
# Create R2 bucket
wrangler r2 bucket create x-builder-sites

# Deploy R2 serving worker
cd workers/r2-sites
pnpm install
pnpm deploy
```

**Components**:
- `app/lib/stores/publish.ts` - State management for publish status
- `app/routes/api.publish.ts` - API endpoint (supports both providers)
- `app/routes/api.publish.delete.ts` - Admin delete endpoint (R2 only)
- `app/lib/.server/r2/` - R2 upload and retention modules
- `workers/r2-sites/` - R2 static file serving worker
- `app/components/workbench/PublishButton.client.tsx` - UI button component

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
- `pnpm smoke:publish <site-url>` - Smoke test the publish API endpoint (contract mode)
- `pnpm smoke:publish <site-url> --e2e` - Full end-to-end publish test (deploys and verifies)

Examples:
```bash
# Contract mode - verify API contract only
pnpm smoke:publish https://x-builder-staging.pages.dev

# E2E mode - deploy minimal site and verify it serves HTML
pnpm smoke:publish https://x-builder-staging.pages.dev --e2e
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
