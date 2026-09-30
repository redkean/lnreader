import { getString } from '@i18n/translations';
import { getNovelById } from '@database/queries/NovelQueries';
import type {
  BackgroundTaskExecutionContext,
  TaskProgressUpdater,
} from '@services/backgroundTasks/contracts';
import { processChapter, type ChapterAIPasses } from './processChapter';
import type { AIUsage } from './types';

export type AIChapterJobItem = {
  chapterId: number;
  chapterName: string;
  chapterNumber?: number | null;
  /** Only needed when the chapter is not downloaded and must be refetched. */
  path?: string;
};

export type AIProcessChaptersData = {
  novelId: number;
  novelName: string;
  chapters: AIChapterJobItem[];
  passes: ChapterAIPasses;
};

type Checkpoint = {
  nextIndex: number;
  failures: string[];
  usage: AIUsage;
};

export const parseAICheckpoint = (
  checkpoint: string | undefined,
  chapterCount: number,
): Checkpoint => {
  const empty: Checkpoint = {
    nextIndex: 0,
    failures: [],
    usage: { inputTokens: 0, outputTokens: 0 },
  };
  if (!checkpoint) {
    return empty;
  }

  try {
    const parsed = JSON.parse(checkpoint) as Partial<Checkpoint>;
    return {
      nextIndex:
        typeof parsed.nextIndex === 'number' &&
        Number.isInteger(parsed.nextIndex)
          ? Math.min(Math.max(parsed.nextIndex, 0), chapterCount)
          : 0,
      failures: Array.isArray(parsed.failures)
        ? parsed.failures.filter(
            (failure): failure is string => typeof failure === 'string',
          )
        : [],
      usage: {
        inputTokens: parsed.usage?.inputTokens ?? 0,
        outputTokens: parsed.usage?.outputTokens ?? 0,
      },
    };
  } catch {
    return empty;
  }
};

/**
 * Runs the AI passes over a range of chapters. Progress is checkpointed after
 * every chapter, so cancelling or killing the app loses at most the chapter in
 * flight - everything already paid for stays on disk.
 */
export const processChapters = async (
  data: AIProcessChaptersData,
  setMeta: TaskProgressUpdater,
  context: BackgroundTaskExecutionContext,
) => {
  const { chapters } = data;
  if (!chapters.length) {
    return;
  }

  const novel = getNovelById(data.novelId);
  if (!novel) {
    throw new Error(`Novel not found: ${data.novelName}`);
  }

  const checkpoint = parseAICheckpoint(context.checkpoint, chapters.length);
  const failures = [...checkpoint.failures];
  const usage = { ...checkpoint.usage };

  for (let index = checkpoint.nextIndex; index < chapters.length; index++) {
    const chapter = chapters[index];
    setMeta(meta => ({
      ...meta,
      isRunning: true,
      progress: index / chapters.length,
      progressText: `${index + 1}/${chapters.length} · ${chapter.chapterName}`,
    }));

    try {
      const result = await processChapter({
        novel,
        chapter: {
          id: chapter.chapterId,
          novelId: data.novelId,
          name: chapter.chapterName,
          path: chapter.path ?? '',
          chapterNumber: chapter.chapterNumber ?? null,
        },
        passes: data.passes,
      });
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
    } catch (error) {
      failures.push(
        `${chapter.chapterName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    await context.updateCheckpoint(
      JSON.stringify({ nextIndex: index + 1, failures, usage }),
    );
  }

  setMeta(meta => ({
    ...meta,
    progress: 1,
    isRunning: false,
    completionText: getString('aiSettings.jobFinished', {
      chapters: chapters.length - failures.length,
      tokens: usage.inputTokens + usage.outputTokens,
    }),
  }));

  if (failures.length) {
    throw new Error(
      `${failures.length} of ${
        chapters.length
      } chapters failed:\n${failures.join('\n')}`,
    );
  }
};
