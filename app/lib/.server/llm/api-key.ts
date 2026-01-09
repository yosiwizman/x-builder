import { env } from 'node:process';
import type { LLMProvider } from './providers';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
}

/**
 * Get LLM configuration from request headers or environment variables.
 *
 * Priority:
 * 1. BYOK headers (X-LLM-Provider, X-LLM-API-Key, X-LLM-Model)
 * 2. Environment variables (ANTHROPIC_API_KEY as fallback)
 *
 * @returns LLMConfig if configured, null if no valid config found
 */
export function getLLMConfig(request: Request, cloudflareEnv: Env): LLMConfig | null {
  // check for BYOK headers first
  const headerProvider = request.headers.get('X-LLM-Provider');
  const headerApiKey = request.headers.get('X-LLM-API-Key');
  const headerModel = request.headers.get('X-LLM-Model');

  if (headerProvider && headerApiKey) {
    return {
      provider: headerProvider as LLMProvider,
      apiKey: headerApiKey,
      model: headerModel || getDefaultModel(headerProvider as LLMProvider),
    };
  }

  // fallback to environment variables (Anthropic only for backward compatibility)
  const envApiKey = env.ANTHROPIC_API_KEY || cloudflareEnv.ANTHROPIC_API_KEY;

  if (envApiKey) {
    return {
      provider: 'anthropic',
      apiKey: envApiKey,
      model: 'claude-3-5-sonnet-20240620',
    };
  }

  return null;
}

/**
 * Get default model for a provider.
 */
function getDefaultModel(provider: LLMProvider): string {
  switch (provider) {
    case 'openrouter': {
      return 'anthropic/claude-3.5-sonnet';
    }

    case 'openai': {
      return 'gpt-4o';
    }

    case 'anthropic': {
      return 'claude-3-5-sonnet-20240620';
    }

    default: {
      return 'claude-3-5-sonnet-20240620';
    }
  }
}

/**
 * Legacy function for backward compatibility.
 *
 * @deprecated Use getLLMConfig instead.
 */
export function getAPIKey(cloudflareEnv: Env): string {
  return env.ANTHROPIC_API_KEY || cloudflareEnv.ANTHROPIC_API_KEY || '';
}
