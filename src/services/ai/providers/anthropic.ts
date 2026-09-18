import type { AIProvider, AIProviderConfig, AIRequest } from '../types';
import { postJson } from './http';
import { isSchemaRejection } from './schema';

type MessagesResponse = {
  content?: { type?: string; text?: string; input?: unknown }[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

const send = async (config: AIProviderConfig, request: AIRequest) => {
  const baseUrl = (config.baseUrl || 'https://api.anthropic.com/v1').replace(
    /\/+$/,
    '',
  );
  const system = request.messages
    .filter(message => message.role === 'system')
    .map(message => message.content)
    .join('\n\n');

  const body = {
    model: config.model,
    max_tokens: request.maxOutputTokens,
    temperature: request.temperature ?? 0.2,
    ...(system ? { system } : {}),
    messages: request.messages
      .filter(message => message.role !== 'system')
      .map(message => ({ role: 'user', content: message.content })),
  };

  // Anthropic has no response-format field; a forced tool call is how a
  // schema is imposed, and the model fills the tool input instead of writing
  // JSON into prose.
  const tool = request.schema && {
    tools: [
      {
        name: request.schema.name,
        description: request.schema.description,
        input_schema: request.schema.schema,
      },
    ],
    tool_choice: { type: 'tool', name: request.schema.name },
  };

  const post = (withSchema: boolean) =>
    postJson<MessagesResponse>(
      `${baseUrl}/messages`,
      withSchema ? { ...body, ...tool } : body,
      {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        // Required for direct browser-style requests; React Native's fetch is
        // treated the same way by the API.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      request.signal,
    );

  const json = await (tool
    ? post(true).catch(error => {
        if (!isSchemaRejection(error)) {
          throw error;
        }
        return post(false);
      })
    : post(false));

  const toolUse = (json.content ?? []).find(
    block => block.type === 'tool_use' && block.input !== undefined,
  );

  return {
    text: toolUse
      ? JSON.stringify(toolUse.input)
      : (json.content ?? [])
          .filter(block => block.type === 'text')
          .map(block => block.text ?? '')
          .join(''),
    usage: json.usage && {
      inputTokens: json.usage.input_tokens ?? 0,
      outputTokens: json.usage.output_tokens ?? 0,
    },
  };
};

export const anthropicProvider: AIProvider = {
  id: 'anthropic',
  label: 'Anthropic',
  defaultBaseUrl: 'https://api.anthropic.com/v1',
  defaultModel: 'claude-opus-5',
  requiresApiKey: true,
  send,
};
