import { describe, expect, it } from 'vitest';
import {
  createLLMErrorResponse,
  isRetryableError,
  LLM_ERROR_CODES,
  LLM_ERROR_MESSAGES,
  parseProviderError,
  requiresSettings,
} from '~/lib/llm-errors';

describe('LLM Error Utilities', () => {
  describe('LLM_ERROR_CODES', () => {
    it('should have all expected error codes', () => {
      expect(LLM_ERROR_CODES.NO_LLM_CONFIG).toBe('NO_LLM_CONFIG');
      expect(LLM_ERROR_CODES.INVALID_PROVIDER).toBe('INVALID_PROVIDER');
      expect(LLM_ERROR_CODES.INVALID_API_KEY).toBe('INVALID_API_KEY');
      expect(LLM_ERROR_CODES.MODEL_ERROR).toBe('MODEL_ERROR');
      expect(LLM_ERROR_CODES.RATE_LIMIT).toBe('RATE_LIMIT');
      expect(LLM_ERROR_CODES.PROVIDER_ERROR).toBe('PROVIDER_ERROR');
      expect(LLM_ERROR_CODES.NETWORK_ERROR).toBe('NETWORK_ERROR');
      expect(LLM_ERROR_CODES.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR');
    });
  });

  describe('LLM_ERROR_MESSAGES', () => {
    it('should have messages for all error codes', () => {
      for (const code of Object.values(LLM_ERROR_CODES)) {
        expect(LLM_ERROR_MESSAGES[code]).toBeDefined();
        expect(typeof LLM_ERROR_MESSAGES[code]).toBe('string');
        expect(LLM_ERROR_MESSAGES[code].length).toBeGreaterThan(0);
      }
    });
  });

  describe('isRetryableError', () => {
    it('should return true for retryable errors', () => {
      expect(isRetryableError(LLM_ERROR_CODES.RATE_LIMIT)).toBe(true);
      expect(isRetryableError(LLM_ERROR_CODES.PROVIDER_ERROR)).toBe(true);
      expect(isRetryableError(LLM_ERROR_CODES.NETWORK_ERROR)).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      expect(isRetryableError(LLM_ERROR_CODES.NO_LLM_CONFIG)).toBe(false);
      expect(isRetryableError(LLM_ERROR_CODES.INVALID_PROVIDER)).toBe(false);
      expect(isRetryableError(LLM_ERROR_CODES.INVALID_API_KEY)).toBe(false);
      expect(isRetryableError(LLM_ERROR_CODES.MODEL_ERROR)).toBe(false);
    });
  });

  describe('requiresSettings', () => {
    it('should return true for errors that need settings', () => {
      expect(requiresSettings(LLM_ERROR_CODES.NO_LLM_CONFIG)).toBe(true);
      expect(requiresSettings(LLM_ERROR_CODES.INVALID_PROVIDER)).toBe(true);
      expect(requiresSettings(LLM_ERROR_CODES.INVALID_API_KEY)).toBe(true);
      expect(requiresSettings(LLM_ERROR_CODES.MODEL_ERROR)).toBe(true);
    });

    it('should return false for errors that do not need settings', () => {
      expect(requiresSettings(LLM_ERROR_CODES.RATE_LIMIT)).toBe(false);
      expect(requiresSettings(LLM_ERROR_CODES.PROVIDER_ERROR)).toBe(false);
      expect(requiresSettings(LLM_ERROR_CODES.NETWORK_ERROR)).toBe(false);
      expect(requiresSettings(LLM_ERROR_CODES.UNKNOWN_ERROR)).toBe(false);
    });
  });

  describe('parseProviderError', () => {
    it('should detect auth errors from status code', () => {
      expect(parseProviderError('Some error', 401)).toBe(LLM_ERROR_CODES.INVALID_API_KEY);
      expect(parseProviderError('Some error', 403)).toBe(LLM_ERROR_CODES.INVALID_API_KEY);
    });

    it('should detect auth errors from message', () => {
      expect(parseProviderError('Invalid API key provided')).toBe(LLM_ERROR_CODES.INVALID_API_KEY);
      expect(parseProviderError('incorrect api key')).toBe(LLM_ERROR_CODES.INVALID_API_KEY);
      expect(parseProviderError('Authentication failed')).toBe(LLM_ERROR_CODES.INVALID_API_KEY);
      expect(parseProviderError('Unauthorized request')).toBe(LLM_ERROR_CODES.INVALID_API_KEY);
    });

    it('should detect rate limit errors', () => {
      expect(parseProviderError('Rate limit exceeded', 429)).toBe(LLM_ERROR_CODES.RATE_LIMIT);
      expect(parseProviderError('Too many requests')).toBe(LLM_ERROR_CODES.RATE_LIMIT);
      expect(parseProviderError('quota exceeded')).toBe(LLM_ERROR_CODES.RATE_LIMIT);
    });

    it('should detect model errors', () => {
      expect(parseProviderError('model not found')).toBe(LLM_ERROR_CODES.MODEL_ERROR);
      expect(parseProviderError('The model does not exist')).toBe(LLM_ERROR_CODES.MODEL_ERROR);
      expect(parseProviderError('unsupported model')).toBe(LLM_ERROR_CODES.MODEL_ERROR);
      expect(parseProviderError('model is not available')).toBe(LLM_ERROR_CODES.MODEL_ERROR);
    });

    it('should detect network errors', () => {
      expect(parseProviderError('network error occurred')).toBe(LLM_ERROR_CODES.NETWORK_ERROR);
      expect(parseProviderError('ECONNREFUSED')).toBe(LLM_ERROR_CODES.NETWORK_ERROR);
      expect(parseProviderError('connection timeout')).toBe(LLM_ERROR_CODES.NETWORK_ERROR);
    });

    it('should return PROVIDER_ERROR for 4xx/5xx without specific pattern', () => {
      expect(parseProviderError('Something went wrong', 500)).toBe(LLM_ERROR_CODES.PROVIDER_ERROR);
      expect(parseProviderError('Bad request', 400)).toBe(LLM_ERROR_CODES.PROVIDER_ERROR);
    });

    it('should return UNKNOWN_ERROR when no pattern matches', () => {
      expect(parseProviderError('Something unexpected happened')).toBe(LLM_ERROR_CODES.UNKNOWN_ERROR);
    });
  });

  describe('createLLMErrorResponse', () => {
    it('should create error response with default message', () => {
      const response = createLLMErrorResponse(LLM_ERROR_CODES.NO_LLM_CONFIG);

      expect(response).toEqual({
        error: LLM_ERROR_MESSAGES.NO_LLM_CONFIG,
        code: LLM_ERROR_CODES.NO_LLM_CONFIG,
        provider: undefined,
        model: undefined,
        retryable: false,
      });
    });

    it('should create error response with provider and model', () => {
      const response = createLLMErrorResponse(LLM_ERROR_CODES.MODEL_ERROR, 'openai', 'gpt-5-turbo');

      expect(response).toEqual({
        error: LLM_ERROR_MESSAGES.MODEL_ERROR,
        code: LLM_ERROR_CODES.MODEL_ERROR,
        provider: 'openai',
        model: 'gpt-5-turbo',
        retryable: false,
      });
    });

    it('should create error response with custom message', () => {
      const customMessage = 'Custom error message';
      const response = createLLMErrorResponse(LLM_ERROR_CODES.PROVIDER_ERROR, 'anthropic', undefined, customMessage);

      expect(response.error).toBe(customMessage);
      expect(response.retryable).toBe(true);
    });

    it('should set retryable correctly based on error code', () => {
      expect(createLLMErrorResponse(LLM_ERROR_CODES.RATE_LIMIT).retryable).toBe(true);
      expect(createLLMErrorResponse(LLM_ERROR_CODES.NETWORK_ERROR).retryable).toBe(true);
      expect(createLLMErrorResponse(LLM_ERROR_CODES.PROVIDER_ERROR).retryable).toBe(true);
      expect(createLLMErrorResponse(LLM_ERROR_CODES.NO_LLM_CONFIG).retryable).toBe(false);
      expect(createLLMErrorResponse(LLM_ERROR_CODES.INVALID_API_KEY).retryable).toBe(false);
    });
  });
});
