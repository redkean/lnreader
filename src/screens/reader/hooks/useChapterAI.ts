import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type WebView from 'react-native-webview';

import type { ChapterInfo, NovelInfo } from '@database/types';
import {
  getChapterSummary,
  getGlossaryForPrompt,
  saveChapterCleanupIndex,
  saveChapterSummary,
  upsertGlossaryTerms,
} from '@database/queries/AIQueries';
import { getAISettings, useAISettings } from '@hooks/persisted/useAISettings';
import { showToast } from '@utils/showToast';
import { runWhenIdle } from '@utils/runWhenIdle';
import {
  analyzeChapter,
  buildRecap,
  cleanChapterHtml,
  hashChapterText,
  processChapter,
  readCleanupSidecar,
  setParagraphReverted,
  writeCleanupSidecar,
  type AICleanupSidecar,
} from '@services/ai';

export type AIEditDetail = {
  index: number;
  original: string;
  cleaned: string;
};

export type ChapterAIRun = 'cleanup' | 'summary' | 'recap' | undefined;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Everything the reader needs to show, run and toggle the AI passes for the
 * chapter on screen. Results are written through the same storage the
 * background job uses, so a chapter cleaned here is not cleaned again later.
 */
export default function useChapterAI(
  webViewRef: RefObject<WebView | null>,
  novel: NovelInfo,
  chapter: ChapterInfo,
  chapterText: string,
) {
  const settings = useAISettings();
  const [sidecar, setSidecar] = useState<AICleanupSidecar>();
  const [contentHash, setContentHash] = useState('');
  const [showCleaned, setShowCleaned] = useState(settings.preferCleaned);
  const [showEdits, setShowEdits] = useState(settings.showEdits);
  const [running, setRunning] = useState<ChapterAIRun>();
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<string>();
  const [recap, setRecap] = useState<string>();
  const [editDetail, setEditDetail] = useState<AIEditDetail>();

  const abortRef = useRef<AbortController | undefined>(undefined);
  const chapterIdRef = useRef(chapter.id);

  const enabled = settings.enabled;

  /** Cancels whatever is in flight; used on chapter change and unmount. */
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = undefined;
    setRunning(undefined);
    setProgress(0);
  }, []);

  useEffect(() => cancel, [cancel]);

  // Reload everything that is keyed to the chapter's text.
  useEffect(() => {
    chapterIdRef.current = chapter.id;
    setSidecar(undefined);
    setSummary(undefined);
    setRecap(undefined);
    setEditDetail(undefined);
    setContentHash('');

    if (!enabled || !chapterText) {
      return;
    }

    const hash = hashChapterText(chapterText);
    let cancelled = false;
    setContentHash(hash);
    setSummary(getChapterSummary(chapter.id, hash)?.summary);

    readCleanupSidecar(novel.pluginId, chapter.novelId, chapter.id, hash).then(
      loaded => {
        if (!cancelled && chapterIdRef.current === chapter.id) {
          setSidecar(loaded);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [chapter.id, chapter.novelId, chapterText, enabled, novel.pluginId]);

  useEffect(() => {
    setShowCleaned(settings.preferCleaned);
    setShowEdits(settings.showEdits);
  }, [settings.preferCleaned, settings.showEdits]);

  /**
   * Replayed on load as well as pushed on change: an injection that lands
   * before the document is ready is dropped by the WebView.
   */
  const hydrateScript = useMemo(() => {
    if (!sidecar) {
      return 'window.aiCleanup?.clear?.(); true;';
    }
    return `window.aiCleanup?.hydrate?.(${JSON.stringify({
      paragraphs: sidecar.paragraphs,
      reverted: sidecar.reverted,
      enabled: showCleaned,
      showEdits,
    })}); true;`;
  }, [sidecar, showCleaned, showEdits]);

  const hydrateScriptRef = useRef(hydrateScript);
  useEffect(() => {
    hydrateScriptRef.current = hydrateScript;
    webViewRef.current?.injectJavaScript(hydrateScript);
  }, [hydrateScript, webViewRef]);

  const runCleanup = useCallback(
    async (force = false) => {
      if (!enabled || running) {
        return;
      }
      const current = getAISettings();
      const controller = new AbortController();
      abortRef.current = controller;
      setRunning('cleanup');
      setProgress(0);

      try {
        const existing = await readCleanupSidecar(
          novel.pluginId,
          chapter.novelId,
          chapter.id,
        );
        const result = await cleanChapterHtml(
          {
            html: chapterText,
            contentHash,
            model: current.model.trim(),
            glossary: current.glossaryEnabled
              ? getGlossaryForPrompt(
                  chapter.novelId,
                  chapter.chapterNumber ?? 0,
                )
              : [],
            paragraphsPerBatch: current.paragraphsPerBatch,
            reverted: force ? [] : existing?.reverted,
          },
          update =>
            setProgress(
              update.totalParagraphs === 0
                ? 0
                : update.completedParagraphs / update.totalParagraphs,
            ),
          controller.signal,
        );

        await writeCleanupSidecar(
          novel.pluginId,
          chapter.novelId,
          chapter.id,
          result.sidecar,
        );
        await saveChapterCleanupIndex({
          chapterId: chapter.id,
          novelId: chapter.novelId,
          contentHash,
          model: current.model.trim(),
          paragraphCount: result.sidecar.paragraphs.length,
          changedCount: result.changedCount,
        });

        if (chapterIdRef.current === chapter.id) {
          setSidecar(result.sidecar);
          setShowCleaned(true);
        }
      } catch (error) {
        showToast(errorMessage(error));
      } finally {
        abortRef.current = undefined;
        setRunning(undefined);
        setProgress(0);
      }
    },
    [
      chapter.chapterNumber,
      chapter.id,
      chapter.novelId,
      chapterText,
      contentHash,
      enabled,
      novel.pluginId,
      running,
    ],
  );

  const runSummary = useCallback(
    async (force = false) => {
      if (!enabled || running) {
        return;
      }
      const cached = force
        ? undefined
        : getChapterSummary(chapter.id, contentHash);
      if (cached) {
        setSummary(cached.summary);
        return;
      }

      const current = getAISettings();
      const controller = new AbortController();
      abortRef.current = controller;
      setRunning('summary');

      try {
        const { analysis } = await analyzeChapter(
          {
            novelName: novel.name,
            chapterName: chapter.name,
            html: chapterText,
            knownTerms: current.glossaryEnabled
              ? getGlossaryForPrompt(
                  chapter.novelId,
                  chapter.chapterNumber ?? 0,
                )
              : [],
          },
          controller.signal,
        );

        await saveChapterSummary({
          chapterId: chapter.id,
          novelId: chapter.novelId,
          contentHash,
          summary: analysis.summary,
          model: current.model.trim(),
        });
        if (current.glossaryEnabled) {
          await upsertGlossaryTerms(chapter.novelId, analysis.terms, {
            chapterId: chapter.id,
            chapterNumber: chapter.chapterNumber ?? 0,
          });
        }

        if (chapterIdRef.current === chapter.id) {
          setSummary(analysis.summary);
        }
      } catch (error) {
        showToast(errorMessage(error));
      } finally {
        abortRef.current = undefined;
        setRunning(undefined);
      }
    },
    [
      chapter.chapterNumber,
      chapter.id,
      chapter.name,
      chapter.novelId,
      chapterText,
      contentHash,
      enabled,
      novel.name,
      running,
    ],
  );

  const runRecap = useCallback(async () => {
    if (!enabled || running) {
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning('recap');

    try {
      const result = await buildRecap(
        {
          novelId: chapter.novelId,
          novelName: novel.name,
          position: chapter.position ?? 0,
          chapterCount: getAISettings().recapChapterCount,
        },
        controller.signal,
      );
      if (chapterIdRef.current === chapter.id) {
        setRecap(result.recap);
      }
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      abortRef.current = undefined;
      setRunning(undefined);
    }
  }, [
    chapter.id,
    chapter.novelId,
    chapter.position,
    enabled,
    novel.name,
    running,
  ]);

  const revertParagraph = useCallback(
    async (index: number) => {
      const updated = await setParagraphReverted(
        novel.pluginId,
        chapter.novelId,
        chapter.id,
        index,
        true,
      );
      if (updated && chapterIdRef.current === chapter.id) {
        setSidecar(updated);
      }
      setEditDetail(undefined);
    },
    [chapter.id, chapter.novelId, novel.pluginId],
  );

  const toggleCleaned = useCallback(() => setShowCleaned(value => !value), []);
  const toggleEdits = useCallback(() => setShowEdits(value => !value), []);
  const clearEditDetail = useCallback(() => setEditDetail(undefined), []);
  const clearRecap = useCallback(() => setRecap(undefined), []);

  /**
   * Warms the next chapter while this one is being read, so a reader moving
   * forward never waits for a provider round trip.
   */
  const prefetchChapterAI = useCallback(
    (next?: ChapterInfo) => {
      const current = getAISettings();
      if (!next || !current.enabled || !current.prefetchNextChapter) {
        return;
      }
      runWhenIdle(() => {
        processChapter({
          novel,
          chapter: next,
        }).catch(() => {
          // A failed prefetch is retried when the chapter is actually opened.
        });
      });
    },
    [novel],
  );

  const handleAIMessage = useCallback(
    (type: string, data: unknown) => {
      switch (type) {
        case 'ai-edit-tap': {
          const payload = data as Partial<AIEditDetail> | undefined;
          if (typeof payload?.index === 'number') {
            setEditDetail({
              index: payload.index,
              original: payload.original ?? '',
              cleaned: payload.cleaned ?? '',
            });
          }
          return true;
        }
        case 'ai-revert-paragraph': {
          const payload = data as { index?: number } | undefined;
          if (typeof payload?.index === 'number') {
            void revertParagraph(payload.index);
          }
          return true;
        }
        default:
          return false;
      }
    },
    [revertParagraph],
  );

  /**
   * Memoised: this object is spread into the chapter context, and a new
   * identity on every render would re-render the WebView, appbar and drawer
   * that the context is deliberately kept stable for.
   */
  return useMemo(
    () => ({
      aiEnabled: enabled,
      aiHasCleaned: Boolean(sidecar?.paragraphs.length),
      aiShowCleaned: showCleaned,
      aiShowEdits: showEdits,
      aiRunning: running,
      aiProgress: progress,
      aiSummary: summary,
      aiRecap: recap,
      aiEditDetail: editDetail,
      aiChangedCount: sidecar?.paragraphs.length ?? 0,
      aiHydrateScriptRef: hydrateScriptRef,
      clearAIEditDetail: clearEditDetail,
      clearAIRecap: clearRecap,
      cancelAIRun: cancel,
      handleAIMessage,
      prefetchChapterAI,
      revertParagraph,
      runCleanup,
      runRecap,
      runSummary,
      toggleAICleaned: toggleCleaned,
      toggleAIEdits: toggleEdits,
    }),
    [
      cancel,
      clearEditDetail,
      clearRecap,
      editDetail,
      enabled,
      handleAIMessage,
      prefetchChapterAI,
      progress,
      recap,
      revertParagraph,
      runCleanup,
      runRecap,
      runSummary,
      running,
      showCleaned,
      showEdits,
      sidecar,
      summary,
      toggleCleaned,
      toggleEdits,
    ],
  );
}
