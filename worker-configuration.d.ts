interface Env {
  ANTHROPIC_API_KEY: string;

  /** cloudflare Pages publish (existing) */
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;

  /**
   * R2 publish provider (via HTTP to Worker, NOT direct R2 binding).
   * Cloudflare Pages cannot bind R2 buckets via UI.
   * All R2 access happens through the R2 Worker via HTTP.
   */
  R2_SITES_WORKER_URL?: string;
  PUBLISH_ADMIN_TOKEN?: string;
  PUBLISH_RETENTION_COUNT?: string;
}
