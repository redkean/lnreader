/** Provider calls that take longer than this are almost always a dead socket. */
const REQUEST_TIMEOUT_MS = 120_000;

export class AIRequestError extends Error {
  readonly status?: number;
  /** Whether retrying the same request could plausibly succeed. */
  readonly retryable: boolean;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AIRequestError';
    this.status = status;
    this.retryable =
      status === undefined || status === 408 || status === 429 || status >= 500;
  }
}

const abortMessage = (signal?: AbortSignal | null) =>
  signal?.aborted ? 'Cancelled' : 'Request timed out';

export const postJson = async <T>(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      // The body usually carries the useful part of a provider error, but it
      // is unbounded, so only the head of it is surfaced.
      const detail = await response.text().catch(() => '');
      throw new AIRequestError(
        `${response.status} ${response.statusText}${
          detail ? `: ${detail.slice(0, 300)}` : ''
        }`,
        response.status,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AIRequestError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AIRequestError(abortMessage(signal));
    }
    throw new AIRequestError(
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
};
