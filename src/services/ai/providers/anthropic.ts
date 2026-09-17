import type { AIProvider, AIProviderConfig, AIRequest } from '../types';
import { postJson } from './http';

type MessagesResponse = {
  content?: { type?: string; text?: string }[];
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

  const json = await postJson<MessagesResponse>(
    `${baseUrl}/messages`,
    {
      model: config.model,
      max_tokens: request.maxOutputTokens,
      temperature: request.temperature ?? 0.2,
      ...(system ? { system } : {}),
      messages: request.messages
        .filter(message => message.role !== 'system')
        .map(message => ({ role: 'user', content: message.content })),
    },
    {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      // Required for direct browser-style requests; React Native's fetch is
      // treated the same way by the API.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    request.signal,
  );

  return {
    text: (json.content ?? [])
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
