import {
  getChapterSummary,
  getGlossaryForPrompt,
  saveChapterCleanupIndex,
  saveChapterSummary,
  upsertGlossaryTerms,
} from '@database/queries/AIQueries';
import {
  getAISettings,
  isAIConfigured,
  type AISettings,
} from '@hooks/persisted/useAISettings';
import type { ChapterInfo, NovelInfo } from '@database/types';
import { analyzeChapter } from './analyze';
import { loadChapterHtmlForAI } from './chapterText';
import { AINotConfiguredError } from './client';
import { cleanChapterHtml, type CleanupProgress } from './cleanup';
import { hashChapterText } from './paragraphs';
import { readCleanupSidecar, writeCleanupSidecar } from './storage';
import type { AIUsage } from './types';

export type ChapterAIPasses = {
  cleanup: boolean;
  analysis: boolean;
};

export type ProcessChapterResult = {
  contentHash: string;
  usage: AIUsage;
  cleaned: boolean;
  summarized: boolean;
  /** True when every enabled pass was already cached for this text. */
  skipped: boolean;
};

export const resolvePasses = (
  settings: AISettings,
  overrides?: Partial<ChapterAIPasses>,
): ChapterAIPasses => ({
  cleanup: overrides?.cleanup ?? settings.cleanupEnabled,
  analysis: overrides?.analysis ?? settings.summaryEnabled,
});

/**
 * Runs the enabled passes for a single chapter and persists the results.
 * Every pass is keyed by the chapter's content hash, so re-running over a
 * chapter that has not changed costs nothing.
 */
export const processChapter = async (
  args: {
    novel: Pick<NovelInfo, 'id' | 'pluginId' | 'name'>;
    chapter: Pick<
      ChapterInfo,
      'id' | 'novelId' | 'name' | 'path' | 'chapterNumber'
    >;
    passes?: Partial<ChapterAIPasses>;
    /** Reprocess even when a cached result for this text exists. */
    force?: boolean;
    html?: string;
  },
  onProgress?: (progress: CleanupProgress) => void,
  signal?: AbortSignal,
): Promise<ProcessChapterResult> => {
  const settings = getAISettings();
  if (!isAIConfigured(settings)) {
    throw new AINotConfiguredError();
  }

  const passes = resolvePasses(settings, args.passes);
  const usage: AIUsage = { inputTokens: 0, outputTokens: 0 };
  if (!passes.cleanup && !passes.analysis) {
    return {
      contentHash: '',
      usage,
      cleaned: false,
      summarized: false,
      skipped: true,
    };
  }

  const html =
    args.html ?? (await loadChapterHtmlForAI(args.novel, args.chapter));
  const contentHash = hashChapterText(html);
  const chapterNumber = args.chapter.chapterNumber ?? 0;
  const model = settings.model.trim();

  let cleaned = false;
  let summarized = false;

  if (passes.analysis) {
    const existing = args.force
      ? undefined
      : getChapterSummary(args.chapter.id, contentHash);
    if (!existing) {
      const knownTerms = settings.glossaryEnabled
        ? getGlossaryForPrompt(args.novel.id, chapterNumber)
        : [];
      const { analysis, usage: analysisUsage } = await analyzeChapter(
        {
          novelName: args.novel.name,
          chapterName: args.chapter.name,
          html,
          knownTerms,
        },
        signal,
      );

      await saveChapterSummary({
        chapterId: args.chapter.id,
        novelId: args.novel.id,
        contentHash,
        summary: analysis.summary,
        model,
      });
      if (settings.glossaryEnabled) {
        await upsertGlossaryTerms(args.novel.id, analysis.terms, {
          chapterId: args.chapter.id,
          chapterNumber,
        });
      }

      usage.inputTokens += analysisUsage?.inputTokens ?? 0;
      usage.outputTokens += analysisUsage?.outputTokens ?? 0;
      summarized = true;
    }
  }

  if (passes.cleanup) {
    const existing = await readCleanupSidecar(
      args.novel.pluginId,
      args.chapter.novelId,
      args.chapter.id,
      contentHash,
    );
    if (args.force || !existing) {
      const result = await cleanChapterHtml(
        {
          html,
          contentHash,
          model,
          // Cleanup is told the names the reader has already met so it can
          // normalise spellings without leaking anything from later chapters.
          glossary: settings.glossaryEnabled
            ? getGlossaryForPrompt(args.novel.id, chapterNumber)
            : [],
          paragraphsPerBatch: settings.paragraphsPerBatch,
          reverted: existing?.reverted,
          novelName: args.novel.name,
          chapterName: args.chapter.name,
        },
        onProgress,
        signal,
      );

      await writeCleanupSidecar(
        args.novel.pluginId,
        args.chapter.novelId,
        args.chapter.id,
        result.sidecar,
      );
      await saveChapterCleanupIndex({
        chapterId: args.chapter.id,
        novelId: args.novel.id,
        contentHash,
        model,
        paragraphCount: result.sidecar.paragraphs.length,
        changedCount: result.changedCount,
      });

      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
      cleaned = true;
    }
  }

  return {
    contentHash,
    usage,
    cleaned,
    summarized,
    skipped: !cleaned && !summarized,
  };
};
