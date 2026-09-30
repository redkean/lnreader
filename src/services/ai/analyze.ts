import { requestAI } from './client';
import { parseJsonResponse } from './json';
import { extractCleanupParagraphs } from './paragraphs';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt } from './prompts';
import { markAIRequestRejected } from './requestLog';
import { ANALYSIS_SCHEMA } from './schemas';
import type {
  AIChapterAnalysis,
  AIGlossaryKind,
  AIGlossaryTerm,
  AIUsage,
} from './types';

const GLOSSARY_KINDS: AIGlossaryKind[] = [
  'character',
  'place',
  'term',
  'skill',
];

/** Chapters longer than this are analysed from their opening and closing. */
const MAX_ANALYSIS_CHARS = 24_000;

const coerceTerms = (value: unknown): AIGlossaryTerm[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap(entry => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    const record = entry as Record<string, unknown>;
    const canonical =
      typeof record.canonical === 'string' ? record.canonical.trim() : '';
    if (!canonical) {
      return [];
    }
    const kind = GLOSSARY_KINDS.includes(record.kind as AIGlossaryKind)
      ? (record.kind as AIGlossaryKind)
      : 'term';
    const aliases = Array.isArray(record.aliases)
      ? record.aliases
          .filter((alias): alias is string => typeof alias === 'string')
          .map(alias => alias.trim())
          .filter(alias => alias.length > 0 && alias !== canonical)
      : [];
    const note =
      typeof record.note === 'string' && record.note.trim()
        ? record.note.trim()
        : undefined;
    return [{ canonical, kind, aliases, note }];
  });
};

export const chapterPlainText = (html: string): string =>
  extractCleanupParagraphs(html)
    .map(paragraph => paragraph.text)
    .filter(Boolean)
    .join('\n\n');

/**
 * Very long chapters are sent head-and-tail rather than truncated: the end of
 * a chapter is what a recap needs most, and dropping it silently would produce
 * a summary that stops mid-scene.
 */
const fitToBudget = (text: string): string => {
  if (text.length <= MAX_ANALYSIS_CHARS) {
    return text;
  }
  const half = Math.floor(MAX_ANALYSIS_CHARS / 2);
  return `${text.slice(0, half)}\n\n[...]\n\n${text.slice(-half)}`;
};

/**
 * One call that returns both the chapter summary and the new glossary terms.
 * They are extracted together because the model has already read the chapter -
 * a second pass would double the cost of the cheapest feature in the app.
 */
export const analyzeChapter = async (
  args: {
    novelName: string;
    chapterName: string;
    html: string;
    knownTerms: AIGlossaryTerm[];
  },
  signal?: AbortSignal,
): Promise<{ analysis: AIChapterAnalysis; usage?: AIUsage }> => {
  const text = fitToBudget(chapterPlainText(args.html));
  if (!text.trim()) {
    throw new Error('Chapter has no readable text to summarise');
  }

  const response = await requestAI({
    messages: [
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildAnalysisPrompt(
          args.novelName,
          args.chapterName,
          text,
          args.knownTerms,
        ),
      },
    ],
    maxOutputTokens: 1200,
    schema: ANALYSIS_SCHEMA,
    signal,
    context: {
      kind: 'summary',
      novelName: args.novelName,
      chapterName: args.chapterName,
    },
  });

  try {
    const parsed = parseJsonResponse<Record<string, unknown>>(response.text);
    const summary =
      typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    if (!summary) {
      throw new Error('Model returned no summary');
    }

    return {
      analysis: { summary, terms: coerceTerms(parsed.terms) },
      usage: response.usage,
    };
  } catch (error) {
    markAIRequestRejected(response.logId, error);
    throw error;
  }
};
