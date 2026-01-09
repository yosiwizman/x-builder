/**
 * Structured error codes for LLM operations.
 * Used by both server (API routes) and client (UI) for consistent error handling.
 */
export const LLM_ERROR_CODES = {
  NO_LLM_CONFIG: 'NO_LLM_CONFIG',
  INVALID_PROVIDER: 'INVALID_PROVIDER',
  INVALID_API_KEY: 'INVALID_API_KEY',
  MODEL_ERROR: 'MODEL_ERROR',
  RATE_LIMIT: 'RATE_LIMIT',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type LLMErrorCode = (typeof LLM_ERROR_CODES)[keyof typeof LLM_ERROR_CODES];

export interface LLMErrorResponse {
  error: string;
  code: LLMErrorCode;
  provider?: string;
  model?: string;
  retryable?: boolean;
}

/**
 * User-friendly error messages for each error code.
 */
export const LLM_ERROR_MESSAGES: Record<LLMErrorCode, string> = {
  NO_LLM_CONFIG: 'No LLM provider configured. Add your API key in Settings to get started.',
  INVALID_PROVIDER: 'Invalid LLM provider. Supported providers: OpenRouter, OpenAI, Anthropic.',
  INVALID_API_KEY: 'Your API key was rejected by the provider. Please check your key in Settings.',
  MODEL_ERROR: 'The selected model is unavailable or not supported. Try a different model in Settings.',
  RATE_LIMIT: 'Rate limit exceeded. Please wait a moment and try again.',
  PROVIDER_ERROR: 'The LLM provider returned an error. Please try again.',
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
};

/**
 * Determine if an error is retryable.
 */
export function isRetryableError(code: LLMErrorCode): boolean {
  const retryableCodes: LLMErrorCode[] = [
    LLM_ERROR_CODES.RATE_LIMIT,
    LLM_ERROR_CODES.PROVIDER_ERROR,
    LLM_ERROR_CODES.NETWORK_ERROR,
  ];

  return retryableCodes.includes(code);
}

/**
 * Determine if an error requires Settings to fix.
 */
export function requiresSettings(code: LLMErrorCode): boolean {
  const settingsCodes: LLMErrorCode[] = [
    LLM_ERROR_CODES.NO_LLM_CONFIG,
    LLM_ERROR_CODES.INVALID_PROVIDER,
    LLM_ERROR_CODES.INVALID_API_KEY,
    LLM_ERROR_CODES.MODEL_ERROR,
  ];

  return settingsCodes.includes(code);
}

/**
 * Parse an upstream provider error to determine the error code.
 * Inspects error messages for common patterns.
 */
export function parseProviderError(errorMessage: string, statusCode?: number): LLMErrorCode {
  const lowerMessage = errorMessage.toLowerCase();

  // check for auth/key errors
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    lowerMessage.includes('invalid api key') ||
    lowerMessage.includes('incorrect api key') ||
    lowerMessage.includes('authentication') ||
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('invalid_api_key') ||
    lowerMessage.includes('invalid x-api-key')
  ) {
    return LLM_ERROR_CODES.INVALID_API_KEY;
  }

  // check for rate limit
  if (
    statusCode === 429 ||
    lowerMessage.includes('rate limit') ||
    lowerMessage.includes('rate_limit') ||
    lowerMessage.includes('too many requests') ||
    lowerMessage.includes('quota')
  ) {
    return LLM_ERROR_CODES.RATE_LIMIT;
  }

  // check for model errors
  if (
    lowerMessage.includes('model not found') ||
    lowerMessage.includes('model_not_found') ||
    lowerMessage.includes('does not exist') ||
    lowerMessage.includes('invalid model') ||
    lowerMessage.includes('unsupported model') ||
    lowerMessage.includes('not available')
  ) {
    return LLM_ERROR_CODES.MODEL_ERROR;
  }

  // check for network errors
  if (
    lowerMessage.includes('network') ||
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('connection')
  ) {
    return LLM_ERROR_CODES.NETWORK_ERROR;
  }

  // default to provider error for other 4xx/5xx
  if (statusCode && statusCode >= 400) {
    return LLM_ERROR_CODES.PROVIDER_ERROR;
  }

  return LLM_ERROR_CODES.UNKNOWN_ERROR;
}

/**
 * Create a structured error response object.
 */
export function createLLMErrorResponse(
  code: LLMErrorCode,
  provider?: string,
  model?: string,
  customMessage?: string,
): LLMErrorResponse {
  return {
    error: customMessage || LLM_ERROR_MESSAGES[code],
    code,
    provider,
    model,
    retryable: isRetryableError(code),
  };
}
