interface Env {
  /** LLM API keys (server-side fallback, BYOK preferred) */
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;

  /** cloudflare Pages publish (existing) */
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;

  /**
   * R2 publish provider (via HTTP to Worker, NOT direct R2 binding).
   * Cloudflare Pages cannot bind R2 buckets via UI.
   * All R2 access happens through the R2 Worker via HTTP.
   */
  R2_SITES_WORKER_URL?: string;

  /** client auth token required for provider=r2_worker */
  PUBLISH_TOKEN?: string;

  /** admin token required for /api/publish/delete endpoint */
  PUBLISH_ADMIN_TOKEN?: string;

  /** internal token for Pages -> R2 Worker communication */
  R2_SITES_WORKER_TOKEN?: string;
  PUBLISH_RETENTION_COUNT?: string;
}
