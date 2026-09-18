import type { AIProvider, AIProviderConfig, AIRequest } from '../types';
import { postJson } from './http';
import { isSchemaRejection } from './schema';

type ChatCompletionResponse = {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/**
 * OpenAI's chat-completions shape, which is also what OpenRouter, Together,
 * LM Studio, Ollama and most self-hosted runtimes speak. `custom` reuses this
 * adapter with a user-supplied base URL.
 */
const send = async (config: AIProviderConfig, request: AIRequest) => {
  const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(
    /\/+$/,
    '',
  );
  const system = request.messages
    .filter(message => message.role === 'system')
    .map(message => message.content)
    .join('\n\n');
  const body = {
    model: config.model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...request.messages
        .filter(message => message.role !== 'system')
        .map(message => ({ role: 'user', content: message.content })),
    ],
    max_completion_tokens: request.maxOutputTokens,
    temperature: request.temperature ?? 0.2,
  };

  // Strict mode makes the model's own decoder enforce the shape, which is the
  // only thing that reliably stops dialogue quotes from arriving unescaped.
  const responseFormat = request.schema && {
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: request.schema.name,
        description: request.schema.description,
        schema: request.schema.schema,
        strict: true,
      },
    },
  };

  const post = (withSchema: boolean) =>
    postJson<ChatCompletionResponse>(
      `${baseUrl}/chat/completions`,
      withSchema ? { ...body, ...responseFormat } : body,
      {
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      request.signal,
    );

  const json = await (responseFormat
    ? post(true).catch(error => {
        if (!isSchemaRejection(error)) {
          throw error;
        }
        return post(false);
      })
    : post(false));

  return {
    text: json.choices?.[0]?.message?.content ?? '',
    usage: json.usage && {
      inputTokens: json.usage.prompt_tokens ?? 0,
      outputTokens: json.usage.completion_tokens ?? 0,
    },
  };
};

export const openAIProvider: AIProvider = {
  id: 'openai',
  label: 'OpenAI',
  defaultBaseUrl: 'https://api.openai.com/v1',
  defaultModel: 'gpt-4.1-mini',
  requiresApiKey: true,
  send,
};

export const customProvider: AIProvider = {
  id: 'custom',
  label: 'Custom (OpenAI-compatible)',
  defaultBaseUrl: 'http://localhost:11434/v1',
  defaultModel: '',
  requiresApiKey: false,
  send,
};
