import { getRecapSummaries } from '@database/queries/AIQueries';
import { requestAI } from './client';
import { buildRecapPrompt, RECAP_SYSTEM_PROMPT } from './prompts';
import type { AIUsage } from './types';

export class NoSummariesError extends Error {
  constructor() {
    super('No chapter summaries available yet');
    this.name = 'NoSummariesError';
  }
}

/**
 * Folds the cached summaries of the chapters leading up to the current one
 * into a "previously on". Nothing here re-reads chapter text: the summaries
 * were paid for once, which is what makes a recap almost free.
 */
export const buildRecap = async (
  args: {
    novelId: number;
    novelName: string;
    /** Position of the chapter being read; nothing after it is included. */
    position: number;
    chapterCount: number;
  },
  signal?: AbortSignal,
): Promise<{ recap: string; chapters: number; usage?: AIUsage }> => {
  const summaries = getRecapSummaries(
    args.novelId,
    args.position,
    args.chapterCount,
  );
  if (!summaries.length) {
    throw new NoSummariesError();
  }

  const response = await requestAI({
    messages: [
      { role: 'system', content: RECAP_SYSTEM_PROMPT },
      { role: 'user', content: buildRecapPrompt(args.novelName, summaries) },
    ],
    maxOutputTokens: 700,
    temperature: 0.3,
    signal,
  });

  const recap = response.text.trim();
  if (!recap) {
    throw new Error('Model returned an empty recap');
  }

  return { recap, chapters: summaries.length, usage: response.usage };
};
