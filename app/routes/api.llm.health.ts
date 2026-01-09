import { type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { env } from 'node:process';

/**
 * LLM Health endpoint.
 *
 * `GET /api/llm/health`
 *
 * Returns:
 * - ok: true (always)
 * - serverConfigured: true if ANTHROPIC_API_KEY is set on server
 * - byokSupported: true (BYOK is always supported)
 * - supportedProviders: list of supported providers
 *
 * Does NOT expose any secrets.
 */
export async function loader({ context }: LoaderFunctionArgs) {
  const cloudflareEnv = context.cloudflare.env as { ANTHROPIC_API_KEY?: string };

  // check if server has Anthropic key configured (without exposing it)
  const serverConfigured = !!(env.ANTHROPIC_API_KEY || cloudflareEnv.ANTHROPIC_API_KEY);

  return json({
    ok: true,
    serverConfigured,
    byokSupported: true,
    supportedProviders: ['openrouter', 'openai', 'anthropic'],
    timestamp: new Date().toISOString(),
  });
}
