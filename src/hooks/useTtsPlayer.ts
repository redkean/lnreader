import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getNextChapter,
  getPrevChapter,
  markChapterRead,
  updateChapterProgress,
} from '@database/queries/ChapterQueries';
import { insertHistory } from '@database/queries/HistoryQueries';
import { ChapterInfo, NovelInfo } from '@database/types';
import { useChapterReaderSettings, useLibrarySettings } from '@hooks/persisted';
import { keyContract } from '@hooks/persisted/useNovel/store-helper/keyContract';
import { novelPersistence } from '@hooks/persisted/useNovel/store-helper/persistence';
import { defaultNovelSettings } from '@hooks/persisted/useNovel/types';
import NativeFile from '@modules/native-file';
import {
  Tts,
  TtsPlaybackState,
  TtsProgress,
  TtsSession,
  TtsSettings,
} from '@modules/nitro-tts';
import { sanitizeChapterText } from '@screens/reader/utils/sanitizeChapterText';
import { extractTtsParagraphs } from '@screens/reader/utils/ttsParagraphs';
import { toNativeTtsSettings } from '@screens/reader/utils/ttsSettings';
import { getAISettings } from '@hooks/persisted/useAISettings';
import { hashChapterText, readCleanupSidecar } from '@services/ai';
import { fetchChapter } from '@services/plugin/fetch';
import { getMMKVObject } from '@utils/mmkv/mmkv';
import { runWhenIdle } from '@utils/runWhenIdle';
import { NOVEL_STORAGE } from '@utils/Storages';

const EMPTY_PROGRESS: TtsProgress = { index: 0, total: 0, paragraphId: '' };

/** Start fetching the next chapter once the queue is this far along. */
const PREFETCH_THRESHOLD = 0.8;

export interface TtsPlayerTrack {
  novel: NovelInfo;
  chapter: ChapterInfo;
}

/**
 * The cleaned paragraphs to speak instead of the chapter's own, keyed by
 * readable-node index. Playback follows the reader's preference: with cleaned
 * text hidden, or a sidecar written against different source text, the
 * chapter is spoken as it was translated. Paragraphs the reader reverted stay
 * original too.
 */
const cleanedParagraphsFor = async (
  novel: NovelInfo,
  chapter: ChapterInfo,
  html: string,
): Promise<Map<number, string> | undefined> => {
  const settings = getAISettings();
  if (!settings.enabled || !settings.preferCleaned) {
    return undefined;
  }
  const sidecar = await readCleanupSidecar(
    novel.pluginId,
    chapter.novelId,
    chapter.id,
    hashChapterText(html),
  );
  if (!sidecar) {
    return undefined;
  }
  const reverted = new Set(sidecar.reverted);
  const cleaned = new Map<number, string>();
  for (const paragraph of sidecar.paragraphs) {
    if (!reverted.has(paragraph.index)) {
      cleaned.set(paragraph.index, paragraph.cleaned);
    }
  }
  return cleaned.size ? cleaned : undefined;
};

const excludedScanlatorsFor = (novel: NovelInfo): string[] =>
  getMMKVObject<{ excludedScanlators?: string[] }>(
    keyContract.settings({ pluginId: novel.pluginId, novelPath: novel.path }),
  )?.excludedScanlators ??
  defaultNovelSettings.excludedScanlators ??
  [];

/**
 * Owns the app-wide TTS queue.
 *
 * The reader cannot own it: its WebView stops being laid out once the screen
 * turns off, so `innerText` yields nothing and the queue for the next chapter
 * comes back empty. Paragraphs are parsed from chapter HTML here instead, on
 * the JS thread that the playback foreground service keeps alive, so a chapter
 * boundary is crossed with the screen off.
 */
export const useTtsPlayer = () => {
  const readerSettings = useChapterReaderSettings();
  const { incognitoMode } = useLibrarySettings();

  const sessionRef = useRef<TtsSession | null>(null);
  const sessionPromiseRef = useRef<Promise<TtsSession> | null>(null);
  const subscriptionsRef = useRef<{ remove(): void }[]>([]);
  const queueCacheRef = useRef(new Map<number, Promise<string[]>>());
  const prefetchedIdsRef = useRef(new Set<number>());
  const trackRef = useRef<TtsPlayerTrack | null>(null);
  const advancingRef = useRef(false);
  const prefetchedForRef = useRef<number | null>(null);

  const [track, setTrack] = useState<TtsPlayerTrack | null>(null);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [state, setState] = useState<TtsPlaybackState>('idle');
  const [progress, setProgress] = useState<TtsProgress>(EMPTY_PROGRESS);
  const [error, setError] = useState<string | null>(null);
  const [sleepTimerEndsAt, setSleepTimerEndsAt] = useState<number | null>(null);

  const settingsRef = useRef(readerSettings);
  useEffect(() => {
    settingsRef.current = readerSettings;
  }, [readerSettings]);

  const incognitoRef = useRef(incognitoMode);
  useEffect(() => {
    incognitoRef.current = incognitoMode;
  }, [incognitoMode]);

  /**
   * Mirror the writes the reader makes when a chapter is opened. The player
   * crosses chapter boundaries on its own, with no reader mounted, so without
   * these Resume keeps pointing at whichever chapter was last opened by hand.
   *
   * Scheduled off the critical path and failure-tolerant: nothing here is
   * needed to start speaking, and neither write may take playback down.
   */
  const recordChapterOpened = useCallback(
    (novel: NovelInfo, chapter: ChapterInfo) => {
      if (incognitoRef.current) {
        return;
      }
      runWhenIdle(() => {
        void insertHistory(chapter.id).catch(() => undefined);
        try {
          novelPersistence.writeLastRead(
            { pluginId: novel.pluginId, novelPath: novel.path },
            chapter,
          );
        } catch {
          // Resume just stays where it was; the queue keeps playing.
        }
      });
    },
    [],
  );

  const ensureSession = useCallback(async () => {
    if (sessionRef.current) {
      return sessionRef.current;
    }
    if (!sessionPromiseRef.current) {
      sessionPromiseRef.current = Tts.createSession()
        .then(session => {
          sessionRef.current = session;
          subscriptionsRef.current = [
            session.addOnStateChangedListener(setState),
            session.addOnProgressChangedListener(setProgress),
            session.addOnErrorListener(setError),
          ];
          return session;
        })
        .catch(cause => {
          sessionPromiseRef.current = null;
          throw cause;
        });
    }
    return sessionPromiseRef.current;
  }, []);

  const loadChapterParagraphs = useCallback(
    (novel: NovelInfo, chapter: ChapterInfo): Promise<string[]> => {
      const cached = queueCacheRef.current.get(chapter.id);
      if (cached) {
        return cached;
      }

      const pending = (async () => {
        const filePath = `${NOVEL_STORAGE}/${novel.pluginId}/${chapter.novelId}/${chapter.id}/index.html`;
        let text: string;
        try {
          text = await NativeFile.readFile(filePath);
        } catch {
          text = await fetchChapter(novel.pluginId, chapter.path);
        }
        const html = sanitizeChapterText(
          novel.pluginId,
          novel.name,
          chapter.name,
          text,
        );
        return extractTtsParagraphs(
          html,
          await cleanedParagraphsFor(novel, chapter, html),
        );
      })();

      queueCacheRef.current.set(chapter.id, pending);
      pending.catch(() => queueCacheRef.current.delete(chapter.id));

      return pending;
    },
    [],
  );

  const resolveAdjacent = useCallback(
    async (
      current: TtsPlayerTrack,
      direction: 'NEXT' | 'PREV',
    ): Promise<ChapterInfo | undefined> => {
      const { chapter, novel } = current;
      const query = direction === 'NEXT' ? getNextChapter : getPrevChapter;
      return query(
        chapter.novelId,
        chapter.position ?? 0,
        chapter.page ?? '',
        excludedScanlatorsFor(novel),
      );
    },
    [],
  );

  const playChapter = useCallback(
    async (novel: NovelInfo, chapter: ChapterInfo, startIndex = 0) => {
      setError(null);
      const next: TtsPlayerTrack = { novel, chapter };
      trackRef.current = next;
      prefetchedForRef.current = null;
      setTrack(next);
      recordChapterOpened(novel, chapter);

      // A chapter started by hand is rebuilt: cleanup may have run since it
      // was last read, and the queue has to speak what the reader now shows.
      // A chapter the player prefetched for itself keeps its warm queue.
      if (!prefetchedIdsRef.current.delete(chapter.id)) {
        queueCacheRef.current.delete(chapter.id);
      }

      try {
        const queue = await loadChapterParagraphs(novel, chapter);
        if (trackRef.current?.chapter.id !== chapter.id) {
          return;
        }
        if (queue.length === 0) {
          setError('No readable paragraphs were found in this chapter.');
          return;
        }

        setParagraphs(queue);

        const session = await ensureSession();
        await session.load(
          queue.map((text, index) => ({ id: String(index), text })),
          Math.min(Math.max(startIndex, 0), queue.length - 1),
          {
            novelName: novel.name,
            chapterName: chapter.name,
            coverUri: novel.cover || undefined,
          },
          toNativeTtsSettings(settingsRef.current.tts),
        );
        await session.play();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [ensureSession, loadChapterParagraphs, recordChapterOpened],
  );

  const skipChapter = useCallback(
    async (direction: 'NEXT' | 'PREV') => {
      const current = trackRef.current;
      if (!current) {
        return false;
      }
      const adjacent = await resolveAdjacent(current, direction);
      if (!adjacent) {
        return false;
      }
      await playChapter(current.novel, adjacent);
      return true;
    },
    [playChapter, resolveAdjacent],
  );

  const run = useCallback(
    (operation: (session: TtsSession) => Promise<void>) => {
      void (async () => {
        try {
          await operation(await ensureSession());
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })();
    },
    [ensureSession],
  );

  const stop = useCallback(() => {
    trackRef.current = null;
    setTrack(null);
    setParagraphs([]);
    setProgress(EMPTY_PROGRESS);
    setSleepTimerEndsAt(null);
    run(session => session.stop());
  }, [run]);

  // Crossing a chapter boundary is the whole point of the player, so it is
  // driven by native completion rather than by anything in the reader.
  useEffect(() => {
    if (state !== 'completed' || advancingRef.current) {
      return;
    }
    const current = trackRef.current;
    if (!current) {
      return;
    }

    advancingRef.current = true;
    void (async () => {
      try {
        if (!incognitoRef.current) {
          await markChapterRead(current.chapter.id);
        }
        const advanced = await skipChapter('NEXT');
        if (!advanced) {
          stop();
        }
      } finally {
        advancingRef.current = false;
      }
    })();
  }, [state, skipChapter, stop]);

  // Keep the next chapter warm so the boundary costs no network round trip.
  useEffect(() => {
    const current = trackRef.current;
    if (!current || progress.total === 0) {
      return;
    }
    if (prefetchedForRef.current === current.chapter.id) {
      return;
    }
    if ((progress.index + 1) / progress.total < PREFETCH_THRESHOLD) {
      return;
    }

    prefetchedForRef.current = current.chapter.id;
    void (async () => {
      const upcoming = await resolveAdjacent(current, 'NEXT');
      if (upcoming) {
        prefetchedIdsRef.current.add(upcoming.id);
        loadChapterParagraphs(current.novel, upcoming).catch(() => {
          prefetchedIdsRef.current.delete(upcoming.id);
        });
      }
    })();
  }, [progress, loadChapterParagraphs, resolveAdjacent]);

  useEffect(() => {
    const current = trackRef.current;
    if (!current || progress.total === 0 || incognitoRef.current) {
      return;
    }
    void updateChapterProgress(
      current.chapter.id,
      Math.round(((progress.index + 1) / progress.total) * 100),
    );
  }, [progress]);

  useEffect(() => {
    if (sleepTimerEndsAt === null) {
      return;
    }
    const remaining = sleepTimerEndsAt - Date.now();
    const timer = setTimeout(() => {
      setSleepTimerEndsAt(null);
      run(session => session.pause());
    }, Math.max(remaining, 0));

    return () => clearTimeout(timer);
  }, [sleepTimerEndsAt, run]);

  useEffect(() => {
    const subscriptions = subscriptionsRef.current;
    return () => {
      subscriptions.forEach(subscription => subscription.remove());
      subscriptionsRef.current = [];
    };
  }, []);

  return useMemo(
    () => ({
      error,
      isActive: track !== null,
      novel: track?.novel,
      chapter: track?.chapter,
      paragraphs,
      progress,
      sleepTimerEndsAt,
      state,
      pause: () => run(session => session.pause()),
      play: () => run(session => session.play()),
      playChapter,
      replay: () => run(session => session.replayCurrent()),
      seekTo: (index: number) => run(session => session.seekTo(index)),
      setSleepTimer: (minutes: number | null) =>
        setSleepTimerEndsAt(
          minutes === null ? null : Date.now() + minutes * 60_000,
        ),
      skipChapter,
      skipNext: () => run(session => session.skipNext()),
      skipPrevious: () => run(session => session.skipPrevious()),
      stop,
      updateSettings: (settings?: TtsSettings) =>
        run(session =>
          session.updateSettings(
            settings ?? toNativeTtsSettings(settingsRef.current.tts),
          ),
        ),
    }),
    [
      error,
      paragraphs,
      playChapter,
      progress,
      run,
      skipChapter,
      sleepTimerEndsAt,
      state,
      stop,
      track,
    ],
  );
};

export type TtsPlayerApi = ReturnType<typeof useTtsPlayer>;
