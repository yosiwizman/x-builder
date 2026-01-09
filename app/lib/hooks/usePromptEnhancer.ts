import { useState } from 'react';
import type { LLMErrorResponse } from '~/lib/llm-errors';
import { setLLMError } from '~/lib/stores/llm-error';
import { getProviderHeaders } from '~/lib/stores/providers';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('usePromptEnhancement');

export function usePromptEnhancer() {
  const [enhancingPrompt, setEnhancingPrompt] = useState(false);
  const [promptEnhanced, setPromptEnhanced] = useState(false);

  const resetEnhancer = () => {
    setEnhancingPrompt(false);
    setPromptEnhanced(false);
  };

  const enhancePrompt = async (input: string, setInput: (value: string) => void) => {
    setEnhancingPrompt(true);
    setPromptEnhanced(false);

    try {
      const response = await fetch('/api/enhancer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getProviderHeaders(),
        },
        body: JSON.stringify({
          message: input,
        }),
      });

      // handle error responses
      if (!response.ok) {
        await handleEnhancerError(response);
        setEnhancingPrompt(false);

        return;
      }

      const reader = response.body?.getReader();

      const originalInput = input;

      if (reader) {
        const decoder = new TextDecoder();

        let _input = '';
        let _error;

        try {
          setInput('');

          while (true) {
            const { value, done } = await reader.read();

            if (done) {
              break;
            }

            _input += decoder.decode(value);

            logger.trace('Set input', _input);

            setInput(_input);
          }
        } catch (error) {
          _error = error;
          setInput(originalInput);
        } finally {
          if (_error) {
            logger.error(_error);
          }

          setEnhancingPrompt(false);
          setPromptEnhanced(true);

          setTimeout(() => {
            setInput(_input);
          });
        }
      } else {
        setEnhancingPrompt(false);
      }
    } catch (error) {
      logger.error('Enhancer fetch failed:', error);
      setEnhancingPrompt(false);

      // set a generic network error
      setLLMError({
        error: 'Network error. Please check your connection and try again.',
        code: 'NETWORK_ERROR',
        retryable: true,
      });
    }
  };

  return { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer };
}

/**
 * Handle error response from the enhancer API.
 */
async function handleEnhancerError(response: Response): Promise<void> {
  try {
    const data = await response.json();

    if (data && typeof data === 'object' && 'code' in data) {
      setLLMError(data as LLMErrorResponse);

      return;
    }
  } catch {
    // failed to parse JSON
  }

  // create fallback error based on status
  if (response.status === 401) {
    setLLMError({
      error: 'No LLM provider configured. Add your API key in Settings to get started.',
      code: 'NO_LLM_CONFIG',
      retryable: false,
    });
  } else if (response.status === 429) {
    setLLMError({
      error: 'Rate limit exceeded. Please wait a moment and try again.',
      code: 'RATE_LIMIT',
      retryable: true,
    });
  } else {
    setLLMError({
      error: 'Failed to enhance prompt. Please try again.',
      code: 'UNKNOWN_ERROR',
      retryable: true,
    });
  }
}
