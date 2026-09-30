import { getAISettings } from '@hooks/persisted/useAISettings';
import { requestAI } from '../client';
import { AIRequestError, getAIProvider } from '../providers';
import {
  clearAIRequestLog,
  getAIRequestLog,
  markAIRequestRejected,
  recordAIRequest,
} from '../requestLog';

let mockStore: Record<string, unknown> = {};

jest.mock('@utils/mmkv/mmkv', () => ({
  getMMKVObject: jest.fn((key: string) => mockStore[key]),
  setMMKVObject: jest.fn((key: string, value: unknown) => {
    mockStore[key] = value;
  }),
}));

jest.mock('@utils/sleep', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@hooks/persisted/useAISettings', () => ({
  getAISettings: jest.fn(),
  isAIConfigured: () => true,
}));

jest.mock('../providers', () => {
  const actual =
    jest.requireActual<typeof import('../providers')>('../providers');
  const send = jest.fn();
  return {
    ...actual,
    getAIProvider: () => ({ defaultBaseUrl: 'https://example.test', send }),
  };
});

const settings = {
  provider: 'openai',
  apiKey: 'key',
  model: 'model-x',
  baseUrl: '',
  concurrency: 1,
} as ReturnType<typeof getAISettings>;

const send = jest.mocked(getAIProvider('openai').send);

const request = {
  messages: [{ role: 'user' as const, content: 'hello' }],
  maxOutputTokens: 16,
  context: {
    kind: 'cleanup' as const,
    novelName: 'Novel',
    chapterName: 'Chapter 7',
  },
};

describe('AI request log', () => {
  beforeEach(() => {
    mockStore = {};
    jest.clearAllMocks();
  });

  it('records what a successful request was for and what it cost', async () => {
    send.mockResolvedValue({
      text: 'ok',
      usage: { inputTokens: 120, outputTokens: 30 },
    });

    const response = await requestAI(request, settings);

    expect(getAIRequestLog()).toEqual([
      expect.objectContaining({
        id: response.logId,
        kind: 'cleanup',
        novelName: 'Novel',
        chapterName: 'Chapter 7',
        model: 'model-x',
        status: 'success',
        attempts: 1,
        usage: { inputTokens: 120, outputTokens: 30 },
      }),
    ]);
  });

  it('keeps the provider error of a request that ran out of retries', async () => {
    send.mockRejectedValue(new AIRequestError('429 Too Many Requests', 429));

    await expect(requestAI(request, settings)).rejects.toThrow('429');

    expect(getAIRequestLog()).toEqual([
      expect.objectContaining({
        status: 'error',
        attempts: 3,
        error: '429 Too Many Requests',
      }),
    ]);
  });

  it('logs a request the reader cancelled as cancelled, not failed', async () => {
    const controller = new AbortController();
    send.mockImplementation(async () => {
      controller.abort();
      throw new AIRequestError('Cancelled');
    });

    await expect(
      requestAI({ ...request, signal: controller.signal }, settings),
    ).rejects.toThrow('Cancelled');

    expect(getAIRequestLog()[0]).toMatchObject({
      status: 'cancelled',
      attempts: 1,
    });
  });

  it('turns an answered request into a failure when its response is rejected', async () => {
    send.mockResolvedValue({ text: 'not json' });
    const response = await requestAI(request, settings);

    markAIRequestRejected(response.logId, new Error('Unparseable response'));

    expect(getAIRequestLog()[0]).toMatchObject({
      status: 'error',
      error: 'Unparseable response',
    });
  });

  it('drops the oldest entries past the cap and clears on request', () => {
    for (let index = 0; index < 205; index++) {
      recordAIRequest({
        kind: 'summary',
        startedAt: index,
        durationMs: 1,
        provider: 'openai',
        model: 'model-x',
        status: 'success',
        attempts: 1,
      });
    }

    const log = getAIRequestLog();
    expect(log).toHaveLength(200);
    expect(log[0].startedAt).toBe(204);
    expect(log[199].startedAt).toBe(5);

    clearAIRequestLog();
    expect(getAIRequestLog()).toEqual([]);
  });
});
