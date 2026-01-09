import { atom, computed } from 'nanostores';

export type LLMProvider = 'openrouter' | 'openai' | 'anthropic';

export interface ProviderConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
}

const STORAGE_KEY = 'x-builder-llm-provider';

// default models per provider (updated Jan 2026)
export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openrouter: 'openai/gpt-4.1',
  openai: 'gpt-4.1',
  anthropic: 'claude-sonnet-4-20250514',
};

// popular models per provider for UI suggestions
export const POPULAR_MODELS: Record<LLMProvider, string[]> = {
  openrouter: [
    'openai/gpt-4.1',
    'openai/gpt-4.1-mini',
    'anthropic/claude-sonnet-4-20250514',
    'anthropic/claude-3.5-sonnet',
    'google/gemini-2.5-pro-preview-06-05',
    'meta-llama/llama-4-maverick',
  ],
  openai: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o3-mini', 'gpt-4o'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
};

// load from localStorage
function loadConfig(): ProviderConfig | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // invalid JSON, ignore
  }

  return null;
}

// save to localStorage
function saveConfig(config: ProviderConfig | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (config) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// main store
export const providerStore = atom<ProviderConfig | null>(null);

// initialize from localStorage (call on client mount)
export function initProviderStore(): void {
  const config = loadConfig();

  if (config) {
    providerStore.set(config);
  }
}

// set provider config
export function setProviderConfig(config: ProviderConfig | null): void {
  providerStore.set(config);
  saveConfig(config);
}

// clear provider config
export function clearProviderConfig(): void {
  providerStore.set(null);
  saveConfig(null);
}

// computed: is provider configured?
export const isProviderConfigured = computed(providerStore, (config) => {
  return config !== null && config.apiKey.length > 0;
});

// get headers for API calls (never log these!)
export function getProviderHeaders(): Record<string, string> {
  const config = providerStore.get();

  if (!config || !config.apiKey) {
    return {};
  }

  return {
    'X-LLM-Provider': config.provider,
    'X-LLM-API-Key': config.apiKey,
    'X-LLM-Model': config.model || DEFAULT_MODELS[config.provider],
  };
}

// validate API key format (basic check)
export function validateApiKey(provider: LLMProvider, key: string): boolean {
  if (!key || key.length < 10) {
    return false;
  }

  switch (provider) {
    case 'openrouter': {
      return key.startsWith('sk-or-');
    }

    case 'openai': {
      return key.startsWith('sk-');
    }

    case 'anthropic': {
      return key.startsWith('sk-ant-');
    }

    default: {
      return true;
    }
  }
}

// redact API key for display (show first 8 + last 4 chars)
export function redactApiKey(key: string): string {
  if (!key || key.length < 16) {
    return '****';
  }

  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}
