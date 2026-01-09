import { streamText as _streamText, convertToCoreMessages } from 'ai';
import { type LLMConfig } from '~/lib/.server/llm/api-key';
import { getModel, getProviderHeaders } from '~/lib/.server/llm/providers';
import { MAX_TOKENS } from './constants';
import { getSystemPrompt } from './prompts';

interface ToolResult<Name extends string, Args, Result> {
  toolCallId: string;
  toolName: Name;
  args: Args;
  result: Result;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolInvocations?: ToolResult<string, unknown, unknown>[];
}

export type Messages = Message[];

export type StreamingOptions = Omit<Parameters<typeof _streamText>[0], 'model'>;

/**
 * Stream text from an LLM using the provided configuration.
 *
 * Supports multiple providers via BYOK:
 * - OpenRouter (recommended for flexibility)
 * - OpenAI
 * - Anthropic
 */
export function streamText(messages: Messages, config: LLMConfig, options?: StreamingOptions) {
  const model = getModel(config);
  const providerHeaders = getProviderHeaders(config.provider);

  return _streamText({
    model,
    system: getSystemPrompt(),
    maxTokens: MAX_TOKENS,
    headers: providerHeaders,
    messages: convertToCoreMessages(messages),
    ...options,
  });
}
