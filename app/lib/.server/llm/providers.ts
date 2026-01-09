import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';

export type LLMProvider = 'openrouter' | 'openai' | 'anthropic';

export interface ProviderConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
}

// default models per provider
export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openrouter: 'anthropic/claude-3.5-sonnet',
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20240620',
};

/**
 * Create an LLM model instance based on provider and API key.
 *
 * Supports:
 * - OpenRouter: Uses OpenAI-compatible API with custom base URL
 * - OpenAI: Native OpenAI API
 * - Anthropic: Native Anthropic API
 */
export function getModel(config: ProviderConfig) {
  const { provider, apiKey, model } = config;

  switch (provider) {
    case 'openrouter': {
      // openRouter uses OpenAI-compatible API
      const openrouter = createOpenAI({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        headers: {
          'HTTP-Referer': 'https://x-builder-staging.pages.dev',
          'X-Title': 'X Builder',
        },
      });

      return openrouter(model || DEFAULT_MODELS.openrouter);
    }

    case 'openai': {
      const openai = createOpenAI({
        apiKey,
      });

      return openai(model || DEFAULT_MODELS.openai);
    }

    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey,
      });

      return anthropic(model || DEFAULT_MODELS.anthropic);
    }

    default: {
      throw new Error(`Unknown provider: ${provider}`);
    }
  }
}

/**
 * Validate that a provider string is valid.
 */
export function isValidProvider(provider: string): provider is LLMProvider {
  return ['openrouter', 'openai', 'anthropic'].includes(provider);
}

/**
 * Get additional headers required for specific providers.
 * Used for Anthropic beta features.
 */
export function getProviderHeaders(provider: LLMProvider): Record<string, string> {
  if (provider === 'anthropic') {
    return {
      'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15',
    };
  }

  return {};
}

/**
 * Redact API key for logging (never log full keys).
 */
export function redactApiKey(key: string): string {
  if (!key || key.length < 12) {
    return '[REDACTED]';
  }

  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}
