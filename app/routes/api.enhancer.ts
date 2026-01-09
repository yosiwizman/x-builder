import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { StreamingTextResponse, parseStreamPart } from 'ai';
import { getLLMConfig } from '~/lib/.server/llm/api-key';
import { redactApiKey } from '~/lib/.server/llm/providers';
import { streamText } from '~/lib/.server/llm/stream-text';
import { createLLMErrorResponse, LLM_ERROR_CODES, type LLMErrorCode, parseProviderError } from '~/lib/llm-errors';
import { stripIndents } from '~/utils/stripIndent';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function action(args: ActionFunctionArgs) {
  return enhancerAction(args);
}

async function enhancerAction({ context, request }: ActionFunctionArgs) {
  const { message } = await request.json<{ message: string }>();

  // get LLM config from headers or env
  const llmConfig = getLLMConfig(request, context.cloudflare.env);

  if (!llmConfig) {
    return json(createLLMErrorResponse(LLM_ERROR_CODES.NO_LLM_CONFIG), { status: 401 });
  }

  console.log(
    `[Enhancer] Provider: ${llmConfig.provider}, Model: ${llmConfig.model}, Key: ${redactApiKey(llmConfig.apiKey)}`,
  );

  try {
    const result = await streamText(
      [
        {
          role: 'user',
          content: stripIndents`
          I want you to improve the user prompt that is wrapped in \`<original_prompt>\` tags.

          IMPORTANT: Only respond with the improved prompt and nothing else!

          <original_prompt>
            ${message}
          </original_prompt>
        `,
        },
      ],
      llmConfig,
    );

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const processedChunk = decoder
          .decode(chunk)
          .split('\n')
          .filter((line) => line !== '')
          .map(parseStreamPart)
          .map((part) => part.value)
          .join('');

        controller.enqueue(encoder.encode(processedChunk));
      },
    });

    const transformedStream = result.toAIStream().pipeThrough(transformStream);

    return new StreamingTextResponse(transformedStream);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // redact any API keys from logs
    const redactedMessage = errorMessage.replace(/sk-[a-zA-Z0-9_-]{10,}/g, '[REDACTED_KEY]');
    console.error('[Enhancer] Error:', redactedMessage);

    // parse the error to determine the appropriate error code
    const errorCode = parseProviderError(errorMessage, extractStatusCode(error));

    return json(createLLMErrorResponse(errorCode, llmConfig.provider, llmConfig.model), {
      status: getHttpStatus(errorCode),
    });
  }
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
