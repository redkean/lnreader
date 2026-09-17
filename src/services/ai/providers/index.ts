import type { AIProvider, AIProviderId } from '../types';
import { anthropicProvider } from './anthropic';
import { geminiProvider } from './gemini';
import { customProvider, openAIProvider } from './openai';

export const AI_PROVIDERS: Record<AIProviderId, AIProvider> = {
  openai: openAIProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  custom: customProvider,
};

export const AI_PROVIDER_LIST = Object.values(AI_PROVIDERS);

export const getAIProvider = (id: AIProviderId): AIProvider =>
  AI_PROVIDERS[id] ?? openAIProvider;

export { AIRequestError } from './http';
