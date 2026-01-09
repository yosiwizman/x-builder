import { atom } from 'nanostores';
import type { LLMErrorCode, LLMErrorResponse } from '~/lib/llm-errors';
import { isRetryableError, LLM_ERROR_CODES, LLM_ERROR_MESSAGES, requiresSettings } from '~/lib/llm-errors';

export interface LLMErrorState {
  error: LLMErrorResponse | null;
  timestamp: number | null;
}

// main error state store
export const llmErrorStore = atom<LLMErrorState>({
  error: null,
  timestamp: null,
});

/**
 * Set an LLM error in the store.
 */
export function setLLMError(error: LLMErrorResponse): void {
  llmErrorStore.set({
    error,
    timestamp: Date.now(),
  });
}

/**
 * Clear the LLM error state.
 */
export function clearLLMError(): void {
  llmErrorStore.set({
    error: null,
    timestamp: null,
  });
}

/**
 * Parse an API error response and set the error state.
 * Returns the parsed error or null if parsing failed.
 */
export async function parseLLMErrorResponse(response: Response): Promise<LLMErrorResponse | null> {
  try {
    const data = await response.json();

    if (data && typeof data === 'object' && 'code' in data) {
      const error = data as LLMErrorResponse;
      setLLMError(error);

      return error;
    }
  } catch {
    // failed to parse JSON, create a generic error
  }

  // create a fallback error based on status code
  const fallbackError: LLMErrorResponse = {
    error: getErrorMessageFromStatus(response.status),
    code: getErrorCodeFromStatus(response.status),
    retryable: response.status >= 500,
  };

  setLLMError(fallbackError);

  return fallbackError;
}

/**
 * Get user-friendly error message for display.
 */
export function getErrorMessage(error: LLMErrorResponse | null): string {
  if (!error) {
    return '';
  }

  return error.error || LLM_ERROR_MESSAGES[error.code] || 'An unexpected error occurred.';
}

/**
 * Check if the error requires Settings to fix.
 */
export function errorRequiresSettings(error: LLMErrorResponse | null): boolean {
  if (!error) {
    return false;
  }

  return requiresSettings(error.code);
}

/**
 * Check if the error is retryable.
 */
export function errorIsRetryable(error: LLMErrorResponse | null): boolean {
  if (!error) {
    return false;
  }

  return isRetryableError(error.code);
}

/**
 * Get error code from HTTP status.
 */
function getErrorCodeFromStatus(status: number): LLMErrorCode {
  switch (status) {
    case 401:
    case 403: {
      return LLM_ERROR_CODES.NO_LLM_CONFIG;
    }

    case 429: {
      return LLM_ERROR_CODES.RATE_LIMIT;
    }

    default: {
      return LLM_ERROR_CODES.UNKNOWN_ERROR;
    }
  }
}

/**
 * Get error message from HTTP status.
 */
function getErrorMessageFromStatus(status: number): string {
  switch (status) {
    case 401: {
      return LLM_ERROR_MESSAGES.NO_LLM_CONFIG;
    }

    case 403: {
      return LLM_ERROR_MESSAGES.INVALID_API_KEY;
    }

    case 429: {
      return LLM_ERROR_MESSAGES.RATE_LIMIT;
    }

    default: {
      return LLM_ERROR_MESSAGES.UNKNOWN_ERROR;
    }
  }
}
