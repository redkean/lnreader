import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import type { AIProviderId, AIRequestContext, AIUsage } from './types';

export const AI_REQUEST_LOG_KEY = 'AI_REQUEST_LOG';

/** Oldest entries fall off past this; the log is a diagnostic, not a ledger. */
const MAX_ENTRIES = 200;

export type AIRequestStatus = 'success' | 'error' | 'cancelled';

export type AIRequestLogEntry = AIRequestContext & {
  id: string;
  startedAt: number;
  durationMs: number;
  provider: AIProviderId;
  model: string;
  status: AIRequestStatus;
  /** Provider attempts spent, including the one that settled the request. */
  attempts: number;
  error?: string;
  usage?: AIUsage;
};

export const getAIRequestLog = (): AIRequestLogEntry[] => {
  try {
    const log = getMMKVObject<AIRequestLogEntry[]>(AI_REQUEST_LOG_KEY);
    return Array.isArray(log) ? log : [];
  } catch {
    return [];
  }
};

/** Logging is a diagnostic: it must never be what fails an AI request. */
const writeLog = (log: AIRequestLogEntry[]) => {
  try {
    setMMKVObject(AI_REQUEST_LOG_KEY, log);
  } catch {
    // Dropped entry; the request itself is unaffected.
  }
};

/** Newest first, so the screen renders the stored order as is. */
export const recordAIRequest = (
  entry: Omit<AIRequestLogEntry, 'id'>,
): string => {
  const id = `${entry.startedAt}-${Math.random().toString(36).slice(2)}`;
  writeLog([{ ...entry, id }, ...getAIRequestLog()].slice(0, MAX_ENTRIES));
  return id;
};

/**
 * A request the provider answered can still be unusable - JSON that does not
 * parse, a paragraph count that does not match. The caller only finds that
 * out after the fact, so it marks the entry it was handed.
 */
export const markAIRequestRejected = (
  id: string | undefined,
  error: unknown,
) => {
  if (!id) {
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  writeLog(
    getAIRequestLog().map(entry =>
      entry.id === id ? { ...entry, status: 'error', error: message } : entry,
    ),
  );
};

export const clearAIRequestLog = () => writeLog([]);
