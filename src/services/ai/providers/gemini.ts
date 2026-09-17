import type { AIProvider, AIProviderConfig, AIRequest } from '../types';
import { postJson } from './http';

type GenerateContentResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
};

const send = async (config: AIProviderConfig, request: AIRequest) => {
  const baseUrl = (
    config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
  ).replace(/\/+$/, '');
  const system = request.messages
    .filter(message => message.role === 'system')
    .map(message => message.content)
    .join('\n\n');

  const json = await postJson<GenerateContentResponse>(
    `${baseUrl}/models/${encodeURIComponent(
      config.model,
    )}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
    {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: request.messages
        .filter(message => message.role !== 'system')
        .map(message => ({ role: 'user', parts: [{ text: message.content }] })),
      generationConfig: {
        maxOutputTokens: request.maxOutputTokens,
        temperature: request.temperature ?? 0.2,
      },
    },
    {},
    request.signal,
  );

  return {
    text: (json.candidates?.[0]?.content?.parts ?? [])
      .map(part => part.text ?? '')
      .join(''),
    usage: json.usageMetadata && {
      inputTokens: json.usageMetadata.promptTokenCount ?? 0,
      outputTokens: json.usageMetadata.candidatesTokenCount ?? 0,
    },
  };
};

export const geminiProvider: AIProvider = {
  id: 'gemini',
  label: 'Google Gemini',
  defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  defaultModel: 'gemini-2.5-flash',
  requiresApiKey: true,
  send,
};
