import { atom, computed } from 'nanostores';

export type LLMProvider = 'openrouter' | 'openai' | 'anthropic';

export interface ProviderConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
}

const STORAGE_KEY = 'x-builder-llm-provider';

// default models per provider
export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openrouter: 'anthropic/claude-3.5-sonnet',
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20240620',
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
