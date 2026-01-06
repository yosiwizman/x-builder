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

### MVP Publish (Cloudflare Pages)

X Builder includes an MVP publish feature that deploys projects directly to Cloudflare Pages.

**Components**:
- `app/lib/stores/publish.ts` - State management for publish status
- `app/routes/api.publish.ts` - API endpoint for Cloudflare Pages deployment
- `app/components/workbench/PublishButton.client.tsx` - UI button component

**Environment Variables** (for publish to work at runtime):
- `CLOUDFLARE_API_TOKEN` - API token with Pages permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

> **TODO**: The Cloudflare Pages Direct Upload API implementation may need adjustment
> based on actual API requirements for production use.

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
- `pnpm smoke:publish <site-url>` - Smoke test the publish API endpoint

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
