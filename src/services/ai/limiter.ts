/**
 * Minimal FIFO concurrency gate. Providers rate-limit aggressively, and a
 * range job would otherwise fire one request per chapter at once.
 */
export const createLimiter = (limit: number) => {
  const queue: (() => void)[] = [];
  let active = 0;
  const max = Math.max(1, Math.floor(limit));

  const release = () => {
    active -= 1;
    queue.shift()?.();
  };

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) {
      await new Promise<void>(resolve => queue.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
};

export type Limiter = ReturnType<typeof createLimiter>;
