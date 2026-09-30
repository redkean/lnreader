import {
  getAISettings,
  isAIConfigured,
  type AISettings,
} from '@hooks/persisted/useAISettings';
import { sleep } from '@utils/sleep';
import { AIRequestError, getAIProvider } from './providers';
import { createLimiter, type Limiter } from './limiter';
import { recordAIRequest, type AIRequestStatus } from './requestLog';
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
    // Timed from here rather than from the call: time spent waiting behind
    // the concurrency gate says nothing about the provider.
    const startedAt = Date.now();
    let attempts = 0;
    const log = (outcome: {
      status: AIRequestStatus;
      error?: unknown;
      usage?: AIUsage;
    }) =>
      recordAIRequest({
        ...(request.context ?? { kind: 'test' }),
        startedAt,
        durationMs: Date.now() - startedAt,
        provider: config.provider,
        model: config.model,
        attempts,
        status: outcome.status,
        usage: outcome.usage,
        error:
          outcome.error === undefined
            ? undefined
            : outcome.error instanceof Error
            ? outcome.error.message
            : String(outcome.error),
      });
    const fail = (error: unknown): never => {
      // A request cancelled while still queued never reached the provider;
      // cancelling a long job would bury the log under those.
      if (attempts === 0) {
        throw error;
      }
      log({
        status: request.signal?.aborted ? 'cancelled' : 'error',
        error,
      });
      throw error;
    };

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (request.signal?.aborted) {
        return fail(new AIRequestError('Cancelled'));
      }
      attempts = attempt + 1;
      try {
        const response = await provider.send(config, request);
        return {
          ...response,
          logId: log({ status: 'success', usage: response.usage }),
        };
      } catch (error) {
        const retryable =
          error instanceof AIRequestError &&
          error.retryable &&
          !request.signal?.aborted;
        if (!retryable || attempt === MAX_ATTEMPTS - 1) {
          return fail(error);
        }
        await sleep(BASE_BACKOFF_MS * 2 ** attempt);
      }
    }

    // Unreachable: the last attempt either returns or fails above.
    return fail(new AIRequestError('Request failed'));
  });
};
