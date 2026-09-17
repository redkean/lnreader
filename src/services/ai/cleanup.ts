import { addUsage, requestAI } from './client';
import { diffParagraph } from './diff';
import { parseJsonResponse } from './json';
import {
  chunkParagraphs,
  extractCleanupParagraphs,
  selectCleanableParagraphs,
} from './paragraphs';
import { buildCleanupPrompt, CLEANUP_SYSTEM_PROMPT } from './prompts';
import { estimateTokens } from './cost';
import type {
  AICleanedParagraph,
  AICleanupSidecar,
  AIGlossaryTerm,
  AIParagraph,
  AIUsage,
} from './types';

export class ParagraphCountMismatchError extends Error {
  constructor(expected: number, received: number) {
    super(`Model returned ${received} paragraphs, expected ${expected}`);
    this.name = 'ParagraphCountMismatchError';
  }
}

/**
 * Enforces the one-paragraph-in, one-paragraph-out contract. Everything
 * downstream - the diff, the reader's paragraph indices, the TTS queue - is
 * anchored to paragraph position, so a batch that merged or split paragraphs
 * is rejected rather than written back misaligned.
 */
const parseCleanupBatch = (
  batch: AIParagraph[],
  responseText: string,
): Map<number, string> => {
  const parsed = parseJsonResponse<unknown>(responseText);
  if (!Array.isArray(parsed)) {
    throw new ParagraphCountMismatchError(batch.length, 0);
  }
  if (parsed.length !== batch.length) {
    throw new ParagraphCountMismatchError(batch.length, parsed.length);
  }

  const expected = new Set(batch.map(paragraph => paragraph.index));
  const result = new Map<number, string>();

  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') {
      throw new ParagraphCountMismatchError(batch.length, parsed.length);
    }
    const record = entry as Record<string, unknown>;
    const index = typeof record.i === 'number' ? record.i : undefined;
    const text = typeof record.t === 'string' ? record.t : undefined;
    if (index === undefined || text === undefined || !expected.has(index)) {
      throw new ParagraphCountMismatchError(batch.length, parsed.length);
    }
    result.set(index, text.trim());
  }

  if (result.size !== batch.length) {
    throw new ParagraphCountMismatchError(batch.length, result.size);
  }

  return result;
};

const sendBatch = async (
  batch: AIParagraph[],
  glossary: AIGlossaryTerm[],
  signal?: AbortSignal,
): Promise<{ cleaned: Map<number, string>; usage?: AIUsage }> => {
  const prompt = buildCleanupPrompt(batch, glossary);
  const response = await requestAI({
    messages: [
      { role: 'system', content: CLEANUP_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    // Cleaned prose is about as long as the original; the headroom covers the
    // JSON envelope and a model that runs slightly long.
    maxOutputTokens: Math.ceil(estimateTokens(prompt) * 1.4) + 600,
    signal,
  });

  return {
    cleaned: parseCleanupBatch(batch, response.text),
    usage: response.usage,
  };
};

/**
 * Cleans one batch, degrading rather than failing: a batch the model cannot
 * return in shape is retried once, then split into single-paragraph requests
 * so one bad paragraph cannot cost the reader the other eleven.
 */
const cleanBatch = async (
  batch: AIParagraph[],
  glossary: AIGlossaryTerm[],
  usage: { current: AIUsage },
  signal?: AbortSignal,
): Promise<Map<number, string>> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await sendBatch(batch, glossary, signal);
      usage.current = addUsage(usage.current, result.usage);
      return result.cleaned;
    } catch (error) {
      if (!(error instanceof ParagraphCountMismatchError)) {
        throw error;
      }
    }
  }

  if (batch.length === 1) {
    // Out of options for this paragraph: it stays as the author's text.
    return new Map();
  }

  const merged = new Map<number, string>();
  for (const paragraph of batch) {
    const single = await cleanBatch([paragraph], glossary, usage, signal);
    single.forEach((text, index) => merged.set(index, text));
  }
  return merged;
};

export type CleanupProgress = {
  completedParagraphs: number;
  totalParagraphs: number;
};

export const cleanChapterHtml = async (
  args: {
    html: string;
    contentHash: string;
    model: string;
    glossary: AIGlossaryTerm[];
    paragraphsPerBatch: number;
    /** Kept so a re-run kept the reader's per-paragraph reverts. */
    reverted?: number[];
  },
  onProgress?: (progress: CleanupProgress) => void,
  signal?: AbortSignal,
): Promise<{
  sidecar: AICleanupSidecar;
  usage: AIUsage;
  changedCount: number;
}> => {
  const all = extractCleanupParagraphs(args.html);
  const cleanable = selectCleanableParagraphs(all);
  if (!cleanable.length) {
    throw new Error('Chapter has no readable text to clean');
  }

  const batches = chunkParagraphs(cleanable, args.paragraphsPerBatch);
  const usage = { current: { inputTokens: 0, outputTokens: 0 } };
  const paragraphs: AICleanedParagraph[] = [];
  let completed = 0;

  for (const batch of batches) {
    if (signal?.aborted) {
      throw new Error('Cancelled');
    }
    const cleaned = await cleanBatch(batch, args.glossary, usage, signal);

    for (const paragraph of batch) {
      const text = cleaned.get(paragraph.index);
      if (text === undefined || text === paragraph.text) {
        continue;
      }
      paragraphs.push({
        index: paragraph.index,
        original: paragraph.text,
        cleaned: text,
        ops: diffParagraph(paragraph.text, text),
      });
    }

    completed += batch.length;
    onProgress?.({
      completedParagraphs: completed,
      totalParagraphs: cleanable.length,
    });
  }

  return {
    sidecar: {
      version: 1,
      contentHash: args.contentHash,
      model: args.model,
      createdAt: new Date().toISOString(),
      paragraphs,
      reverted: args.reverted ?? [],
    },
    usage: usage.current,
    changedCount: paragraphs.length,
  };
};
