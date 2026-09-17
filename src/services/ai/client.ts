import {
  getAISettings,
  isAIConfigured,
  type AISettings,
} from '@hooks/persisted/useAISettings';
import { sleep } from '@utils/sleep';
import { AIRequestError, getAIProvider } from './providers';
import { createLimiter, type Limiter } from './limiter';
import type { AIRequest, AIResponse, AIUsage } from './types';

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1500;

let limiter: Limiter | undefined;
let limiterConcurrency = 0;

const getLimiter = (concurrency: number) => {
  if (!limiter || limiterConcurrency !== concurrency) {
    limiter = createLimiter(concurrency);
    limiterConcurrency = concurrency;
  }
  return limiter;
};

export class AINotConfiguredError extends Error {
  constructor() {
    super('AI features are not configured');
    this.name = 'AINotConfiguredError';
  }
}

export const addUsage = (a: AIUsage, b?: AIUsage): AIUsage =>
  b
    ? {
        inputTokens: a.inputTokens + b.inputTokens,
        outputTokens: a.outputTokens + b.outputTokens,
      }
    : a;

/**
 * Sends one request through the configured provider, serialised behind the
 * shared concurrency gate and retried on transient failures.
 */
export const requestAI = async (
  request: AIRequest,
  settings: AISettings = getAISettings(),
): Promise<AIResponse> => {
  if (!isAIConfigured(settings)) {
    throw new AINotConfiguredError();
  }

  const provider = getAIProvider(settings.provider);
  const config = {
    provider: settings.provider,
    apiKey: settings.apiKey.trim(),
    model: settings.model.trim(),
    baseUrl: settings.baseUrl.trim() || provider.defaultBaseUrl,
  };

  return getLimiter(settings.concurrency)(async () => {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (request.signal?.aborted) {
        throw new AIRequestError('Cancelled');
      }
      try {
        return await provider.send(config, request);
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof AIRequestError &&
          error.retryable &&
          !request.signal?.aborted;
        if (!retryable || attempt === MAX_ATTEMPTS - 1) {
          throw error;
        }
        await sleep(BASE_BACKOFF_MS * 2 ** attempt);
      }
    }

    throw lastError;
  });
};
