import { describe, expect, it } from 'vitest';
import { getLLMConfig } from '~/lib/.server/llm/api-key';
import { DEFAULT_MODELS, isValidProvider, POPULAR_MODELS, redactApiKey } from '~/lib/.server/llm/providers';

describe('api.chat BYOK', () => {
  describe('getLLMConfig', () => {
    const createMockRequest = (headers: Record<string, string> = {}) => {
      return {
        headers: {
          get: (name: string) => headers[name] || null,
        },
      } as unknown as Request;
    };

    const createMockEnv = (anthropicKey?: string): Env => {
      return {
        ANTHROPIC_API_KEY: anthropicKey,
      } as Env;
    };

    // use test tokens that are obviously fake
    const MOCK_OR_KEY = 'test_or_mock_key_12345';
    const MOCK_OAI_KEY = 'test_oai_mock_key_12345';
    const MOCK_ANT_KEY = 'test_ant_mock_key_12345';
    const MOCK_HEADER_KEY = 'test_header_key_12345';
    const MOCK_ENV_KEY = 'test_env_key_123456789';

    it('should return null when no headers and no env var', () => {
      const request = createMockRequest();
      const env = createMockEnv();

      const config = getLLMConfig(request, env);

      expect(config).toBeNull();
    });

    it('should return config from headers when provided', () => {
      const request = createMockRequest({
        'X-LLM-Provider': 'openrouter',
        'X-LLM-API-Key': MOCK_OR_KEY,
        'X-LLM-Model': 'anthropic/claude-3.5-sonnet',
      });
      const env = createMockEnv();

      const config = getLLMConfig(request, env);

      expect(config).toEqual({
        provider: 'openrouter',
        apiKey: MOCK_OR_KEY,
        model: 'anthropic/claude-3.5-sonnet',
      });
    });

    it('should use default model when X-LLM-Model is not provided', () => {
      const request = createMockRequest({
        'X-LLM-Provider': 'openai',
        'X-LLM-API-Key': MOCK_OAI_KEY,
      });
      const env = createMockEnv();

      const config = getLLMConfig(request, env);

      expect(config).toEqual({
        provider: 'openai',
        apiKey: MOCK_OAI_KEY,
        model: DEFAULT_MODELS.openai,
      });
    });

    it('should use custom model when X-LLM-Model is provided', () => {
      const customModel = 'gpt-4.1-mini';
      const request = createMockRequest({
        'X-LLM-Provider': 'openai',
        'X-LLM-API-Key': MOCK_OAI_KEY,
        'X-LLM-Model': customModel,
      });
      const env = createMockEnv();

      const config = getLLMConfig(request, env);

      expect(config).toEqual({
        provider: 'openai',
        apiKey: MOCK_OAI_KEY,
        model: customModel,
      });
    });

    it('should use default models for each provider', () => {
      // OPENROUTER
      const orReq = createMockRequest({
        'X-LLM-Provider': 'openrouter',
        'X-LLM-API-Key': MOCK_OR_KEY,
      });
      expect(getLLMConfig(orReq, createMockEnv())?.model).toBe(DEFAULT_MODELS.openrouter);

      // OPENAI
      const oaiReq = createMockRequest({
        'X-LLM-Provider': 'openai',
        'X-LLM-API-Key': MOCK_OAI_KEY,
      });
      expect(getLLMConfig(oaiReq, createMockEnv())?.model).toBe(DEFAULT_MODELS.openai);

      // ANTHROPIC
      const antReq = createMockRequest({
        'X-LLM-Provider': 'anthropic',
        'X-LLM-API-Key': MOCK_ANT_KEY,
      });
      expect(getLLMConfig(antReq, createMockEnv())?.model).toBe(DEFAULT_MODELS.anthropic);
    });

    it('should prioritize headers over env vars', () => {
      const request = createMockRequest({
        'X-LLM-Provider': 'openrouter',
        'X-LLM-API-Key': MOCK_HEADER_KEY,
      });
      const env = createMockEnv(MOCK_ENV_KEY);

      const config = getLLMConfig(request, env);

      expect(config?.provider).toBe('openrouter');
      expect(config?.apiKey).toBe(MOCK_HEADER_KEY);
    });

    it('should fallback to env var when no headers', () => {
      const request = createMockRequest();
      const env = createMockEnv(MOCK_ANT_KEY);

      const config = getLLMConfig(request, env);

      expect(config).toEqual({
        provider: 'anthropic',
        apiKey: MOCK_ANT_KEY,
        model: DEFAULT_MODELS.anthropic,
      });
    });

    it('should require both provider and key in headers', () => {
      // only provider, no key
      const request1 = createMockRequest({
        'X-LLM-Provider': 'openrouter',
      });
      expect(getLLMConfig(request1, createMockEnv())).toBeNull();

      // only key, no provider
      const request2 = createMockRequest({
        'X-LLM-API-Key': MOCK_OR_KEY,
      });
      expect(getLLMConfig(request2, createMockEnv())).toBeNull();
    });
  });

  describe('isValidProvider', () => {
    it('should return true for valid providers', () => {
      expect(isValidProvider('openrouter')).toBe(true);
      expect(isValidProvider('openai')).toBe(true);
      expect(isValidProvider('anthropic')).toBe(true);
    });

    it('should return false for invalid providers', () => {
      expect(isValidProvider('invalid')).toBe(false);
      expect(isValidProvider('')).toBe(false);
      expect(isValidProvider('OPENAI')).toBe(false);
    });
  });

  describe('redactApiKey', () => {
    it('should redact long keys showing only prefix and suffix', () => {
      const key = 'test_mock_key_abcdefghij';
      const redacted = redactApiKey(key);

      expect(redacted).toBe('test_m...ghij');
      expect(redacted.length).toBeLessThan(key.length);
    });

    it('should fully redact short keys', () => {
      expect(redactApiKey('short')).toBe('[REDACTED]');
      expect(redactApiKey('')).toBe('[REDACTED]');
    });

    it('should never expose the full key', () => {
      const keys = ['test_key_abcdefghijklmnopqrstuvwxyz', 'another_test_mock_key_123456', 'third_mock_test_key_xyz'];

      for (const key of keys) {
        const redacted = redactApiKey(key);
        expect(redacted.length).toBeLessThan(key.length);
        expect(redacted).toContain('...');
      }
    });
  });

  describe('POPULAR_MODELS', () => {
    it('should have popular models for each provider', () => {
      expect(POPULAR_MODELS.openrouter.length).toBeGreaterThan(0);
      expect(POPULAR_MODELS.openai.length).toBeGreaterThan(0);
      expect(POPULAR_MODELS.anthropic.length).toBeGreaterThan(0);
    });

    it('should include default model in popular models', () => {
      expect(POPULAR_MODELS.openrouter).toContain(DEFAULT_MODELS.openrouter);
      expect(POPULAR_MODELS.openai).toContain(DEFAULT_MODELS.openai);
      expect(POPULAR_MODELS.anthropic).toContain(DEFAULT_MODELS.anthropic);
    });
  });

  describe('API key redaction in errors', () => {
    const redactApiKeyFromError = (message: string): string => {
      // match common API key patterns (test with "test_" prefix for safety)
      return message.replace(/test_[a-zA-Z0-9_-]{10,}/g, '[REDACTED_KEY]');
    };

    it('should redact API keys from error messages', () => {
      const errorWithKey = 'Invalid API key: test_abcdefghij1234567890';
      const redacted = redactApiKeyFromError(errorWithKey);

      expect(redacted).toBe('Invalid API key: [REDACTED_KEY]');
      expect(redacted).not.toContain('abcdefghij');
    });

    it('should handle multiple keys in error message', () => {
      const errorWithKeys = 'Tried test_first1234567890 and test_second0987654321';
      const redacted = redactApiKeyFromError(errorWithKeys);

      expect(redacted).toBe('Tried [REDACTED_KEY] and [REDACTED_KEY]');
    });

    it('should not redact non-key text', () => {
      const normalError = 'Connection timeout after 30 seconds';
      const redacted = redactApiKeyFromError(normalError);

      expect(redacted).toBe(normalError);
    });
  });
});
