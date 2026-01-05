# X Builder

[![CI](https://github.com/yosiwizman/x-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/yosiwizman/x-builder/actions/workflows/ci.yml)

AI-powered full-stack web development in the browser.

> **Based on [Bolt.new](https://github.com/stackblitz/bolt.new)** - the open-source AI web development agent by StackBlitz.

## Staging

🚀 **Staging URL**: https://x-builder-staging.pages.dev

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

### Deployment

Staging deploys automatically from `main` branch via GitHub Actions to Cloudflare Pages.

Required GitHub Secrets:
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token with Pages edit permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

## Attribution

This project is based on [Bolt.new](https://github.com/stackblitz/bolt.new) by [StackBlitz](https://stackblitz.com/), licensed under MIT.
