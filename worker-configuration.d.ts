interface Env {
  ANTHROPIC_API_KEY: string;

  // cloudflare Pages publish (existing)
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;

  // R2 publish provider
  SITES_BUCKET?: R2Bucket;
  R2_SITES_WORKER_URL?: string;
  PUBLISH_ADMIN_TOKEN?: string;
  PUBLISH_RETENTION_COUNT?: string;
}
