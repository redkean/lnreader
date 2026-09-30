import { addUsage, requestAI } from './client';
import { diffParagraph } from './diff';
import { parseJsonResponse } from './json';
import {
  chunkParagraphs,
  extractCleanupParagraphs,
  selectCleanableParagraphs,
} from './paragraphs';
import { buildCleanupPrompt, CLEANUP_SYSTEM_PROMPT } from './prompts';
import { CLEANUP_SCHEMA } from './schemas';
import { preservePunctuationStyle } from './punctuation';
import { estimateTokens } from './cost';
import { markAIRequestRejected } from './requestLog';
import type {
  AICleanedParagraph,
  AICleanupSidecar,
  AIGlossaryTerm,
  AIParagraph,
  AIRequestContext,
  AIUsage,
} from './types';

/**
 * A response the cleanup pass cannot use. Retried, then split, then given up
 * on - one unusable batch never fails the whole chapter.
 */
export class CleanupResponseError extends Error {}

export class ParagraphCountMismatchError extends CleanupResponseError {
  constructor(expected: number, received: number) {
    super(`Model returned ${received} paragraphs, expected ${expected}`);
    this.name = 'ParagraphCountMismatchError';
  }
}

export class UnparseableResponseError extends CleanupResponseError {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'UnparseableResponseError';
  }
}

type CleanupResult = {
  text: string;
  /** The model judged the whole paragraph to be non-story content. */
  removed: boolean;
};

/**
 * Enforces the one-paragraph-in, one-paragraph-out contract. Everything
 * downstream - the diff, the reader's paragraph indices, the TTS queue - is
 * anchored to paragraph position, so a batch that merged or split paragraphs
 * is rejected rather than written back misaligned. A paragraph the model drops
 * keeps its slot and comes back empty rather than missing.
 */
const parseCleanupBatch = (
  batch: AIParagraph[],
  responseText: string,
): Map<number, CleanupResult> => {
  let parsed: unknown;
  try {
    parsed = parseJsonResponse<unknown>(responseText);
  } catch (error) {
    // Dialogue-heavy prose makes models drop a closing brace or leave a quote
    // bare; the batch is worth asking for again rather than losing.
    throw new UnparseableResponseError(error);
  }
  // Structured output is rooted in an object; a provider without it answers
  // the prompt with the bare array.
  const entries =
    !Array.isArray(parsed) && parsed && typeof parsed === 'object'
      ? (parsed as { paragraphs?: unknown }).paragraphs
      : parsed;
  if (!Array.isArray(entries)) {
    throw new ParagraphCountMismatchError(batch.length, 0);
  }
  if (entries.length !== batch.length) {
    throw new ParagraphCountMismatchError(batch.length, entries.length);
  }

  const expected = new Set(batch.map(paragraph => paragraph.index));
  const result = new Map<number, CleanupResult>();

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      throw new ParagraphCountMismatchError(batch.length, entries.length);
    }
    const record = entry as Record<string, unknown>;
    const index = typeof record.i === 'number' ? record.i : undefined;
    const text = typeof record.t === 'string' ? record.t : undefined;
    if (index === undefined || text === undefined || !expected.has(index)) {
      throw new ParagraphCountMismatchError(batch.length, entries.length);
    }
    const trimmed = text.trim();
    // A provider without structured output answers the prompt's fields and
    // may leave `d` off entirely; an empty paragraph is the same verdict as
    // the flag, so it is read as one rather than written back as a blank line.
    result.set(index, {
      text: record.d === true ? '' : trimmed,
      removed: record.d === true || trimmed.length === 0,
    });
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
  context?: AIRequestContext,
): Promise<{ cleaned: Map<number, CleanupResult>; usage?: AIUsage }> => {
  const prompt = buildCleanupPrompt(batch, glossary);
  const response = await requestAI({
    messages: [
      { role: 'system', content: CLEANUP_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    // Cleaned prose is about as long as the original; the headroom covers the
    // JSON envelope and a model that runs slightly long.
    maxOutputTokens: Math.ceil(estimateTokens(prompt) * 1.4) + 600,
    schema: CLEANUP_SCHEMA,
    signal,
    context,
  });

  try {
    return {
      cleaned: parseCleanupBatch(batch, response.text),
      usage: response.usage,
    };
  } catch (error) {
    markAIRequestRejected(response.logId, error);
    throw error;
  }
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
  context?: AIRequestContext,
): Promise<Map<number, CleanupResult>> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await sendBatch(batch, glossary, signal, context);
      usage.current = addUsage(usage.current, result.usage);
      return result.cleaned;
    } catch (error) {
      if (!(error instanceof CleanupResponseError)) {
        throw error;
      }
    }
  }

  if (batch.length === 1) {
    // Out of options for this paragraph: it stays as the author's text.
    return new Map();
  }

  const merged = new Map<number, CleanupResult>();
  for (const paragraph of batch) {
    const single = await cleanBatch(
      [paragraph],
      glossary,
      usage,
      signal,
      context,
    );
    single.forEach((result, index) => merged.set(index, result));
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
    /** Names the chapter in the request log. */
    novelName?: string;
    chapterName?: string;
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
  const context: AIRequestContext = {
    kind: 'cleanup',
    novelName: args.novelName,
    chapterName: args.chapterName,
  };
  const usage = { current: { inputTokens: 0, outputTokens: 0 } };
  const paragraphs: AICleanedParagraph[] = [];
  let completed = 0;

  for (const batch of batches) {
    if (signal?.aborted) {
      throw new Error('Cancelled');
    }
    const cleaned = await cleanBatch(
      batch,
      args.glossary,
      usage,
      signal,
      context,
    );

    for (const paragraph of batch) {
      const returned = cleaned.get(paragraph.index);
      if (returned === undefined) {
        continue;
      }
      // A dropped paragraph is a deletion of the whole thing: the diff below
      // turns it into one op holding the original, which is what the reader
      // shows when the caret standing in for it is tapped.
      const text = returned.removed
        ? ''
        : preservePunctuationStyle(paragraph.text, returned.text);
      if (text === paragraph.text) {
        continue;
      }
      paragraphs.push({
        index: paragraph.index,
        original: paragraph.text,
        cleaned: text,
        ops: diffParagraph(paragraph.text, text),
        ...(returned.removed ? { removed: true } : {}),
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
