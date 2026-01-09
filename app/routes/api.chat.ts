import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { getLLMConfig } from '~/lib/.server/llm/api-key';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS } from '~/lib/.server/llm/constants';
import { CONTINUE_PROMPT } from '~/lib/.server/llm/prompts';
import { isValidProvider, redactApiKey } from '~/lib/.server/llm/providers';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';
import { createLLMErrorResponse, LLM_ERROR_CODES, type LLMErrorCode, parseProviderError } from '~/lib/llm-errors';

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
}

/**
 * Chat API endpoint.
 *
 * Supports BYOK (Bring Your Own Key) via headers:
 * - X-LLM-Provider: openrouter | openai | anthropic
 * - X-LLM-API-Key: your API key
 * - X-LLM-Model: (optional) model name
 *
 * Falls back to server-side ANTHROPIC_API_KEY env var if no headers provided.
 * Returns 401 if no valid configuration is found.
 */
async function chatAction({ context, request }: ActionFunctionArgs) {
  // get LLM configuration from headers or env
  const llmConfig = getLLMConfig(request, context.cloudflare.env);

  // validate configuration
  if (!llmConfig) {
    return json(createLLMErrorResponse(LLM_ERROR_CODES.NO_LLM_CONFIG), { status: 401 });
  }

  // validate provider
  if (!isValidProvider(llmConfig.provider)) {
    return json(createLLMErrorResponse(LLM_ERROR_CODES.INVALID_PROVIDER, llmConfig.provider), { status: 400 });
  }

  // log provider info (never log API key!)
  console.log(
    `[Chat] Provider: ${llmConfig.provider}, Model: ${llmConfig.model}, Key: ${redactApiKey(llmConfig.apiKey)}`,
  );

  const { messages } = await request.json<{ messages: Messages }>();

  const stream = new SwitchableStream();

  try {
    const options: StreamingOptions = {
      toolChoice: 'none',
      onFinish: async ({ text: content, finishReason }) => {
        if (finishReason !== 'length') {
          return stream.close();
        }

        if (stream.switches >= MAX_RESPONSE_SEGMENTS) {
          throw Error('Cannot continue message: Maximum segments reached');
        }

        const switchesLeft = MAX_RESPONSE_SEGMENTS - stream.switches;

        console.log(`Reached max token limit (${MAX_TOKENS}): Continuing message (${switchesLeft} switches left)`);

        messages.push({ role: 'assistant', content });
        messages.push({ role: 'user', content: CONTINUE_PROMPT });

        const result = await streamText(messages, llmConfig, options);

        return stream.switchSource(result.toAIStream());
      },
    };

    const result = await streamText(messages, llmConfig, options);

    stream.switchSource(result.toAIStream());

    return new Response(stream.readable, {
      status: 200,
      headers: {
        contentType: 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    // redact any API keys in error messages
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const redactedMessage = redactApiKeyFromError(errorMessage);

    console.error('[Chat] Error:', redactedMessage);

    // parse the error to determine the appropriate error code
    const errorCode = parseProviderError(errorMessage, extractStatusCode(error));

    return json(createLLMErrorResponse(errorCode, llmConfig.provider, llmConfig.model), {
      status: getHttpStatus(errorCode),
    });
  }
}

/**
 * Redact potential API keys from error messages.
 * Matches common key patterns: sk-*, sk-or-*, sk-ant-*, etc.
 */
function redactApiKeyFromError(message: string): string {
  return message.replace(/sk-[a-zA-Z0-9_-]{10,}/g, '[REDACTED_KEY]');
}

/**
 * Extract HTTP status code from an error object.
 */
function extractStatusCode(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    if ('status' in error && typeof error.status === 'number') {
      return error.status;
    }

    if ('statusCode' in error && typeof error.statusCode === 'number') {
      return error.statusCode;
    }
  }

  return undefined;
}

/**
 * Map LLM error code to HTTP status code.
 */
function getHttpStatus(code: LLMErrorCode): number {
  switch (code) {
    case LLM_ERROR_CODES.NO_LLM_CONFIG:
    case LLM_ERROR_CODES.INVALID_API_KEY: {
      return 401;
    }

    case LLM_ERROR_CODES.INVALID_PROVIDER:
    case LLM_ERROR_CODES.MODEL_ERROR: {
      return 400;
    }

    case LLM_ERROR_CODES.RATE_LIMIT: {
      return 429;
    }

    default: {
      return 500;
    }
  }
}
