import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Dialog } from '@components/Dialog';
import { useTheme } from '@hooks/persisted';
import { getAISettings } from '@hooks/persisted/useAISettings';
import { getString } from '@i18n/translations';
import { backgroundTasks } from '@services/backgroundTasks';
// Imported from the module rather than the service barrel: the barrel pulls in
// the chapter sanitiser and the database layer, neither of which an estimate
// needs.
import {
  addEstimates,
  estimateChapterJob,
  formatTokenCount,
  type AIJobEstimate,
} from '@services/ai/cost';
import NativeFile from '@modules/native-file';
import { NOVEL_STORAGE } from '@utils/Storages';
import type { ChapterInfo, NovelInfo } from '@database/types';

type AIJobDialogProps = {
  novel: NovelInfo;
  chapters: ChapterInfo[];
  onDismiss: () => void;
};

/** Chapters read to size the job. Reading them all would cost more than it saves. */
const SAMPLE_SIZE = 3;

/** Stand-in length when nothing is downloaded yet, in characters. */
const ASSUMED_CHAPTER_LENGTH = 12_000;

const AIJobDialog = ({ novel, chapters, onDismiss }: AIJobDialogProps) => {
  const theme = useTheme();
  const settings = getAISettings();
  const [estimate, setEstimate] = useState<AIJobEstimate>();

  const capped = chapters.slice(0, settings.maxChaptersPerJob);
  const passes = {
    cleanup: settings.cleanupEnabled,
    analysis: settings.summaryEnabled,
  };

  useEffect(() => {
    let cancelled = false;

    const sample = capped
      .filter(chapter => chapter.isDownloaded)
      .slice(0, SAMPLE_SIZE);

    const measure = async () => {
      // The raw downloaded file is a good enough proxy for chapter size, and
      // reading it avoids sanitising three chapters just to show a number.
      const lengths = await Promise.all(
        sample.map(chapter =>
          NativeFile.readFile(
            `${NOVEL_STORAGE}/${novel.pluginId}/${chapter.novelId}/${chapter.id}/index.html`,
          )
            .then(html => html.length)
            .catch(() => 0),
        ),
      );
      const measured = lengths.filter(length => length > 0);
      const average = measured.length
        ? measured.reduce((total, length) => total + length, 0) /
          measured.length
        : ASSUMED_CHAPTER_LENGTH;

      const perChapter = estimateChapterJob(
        'x'.repeat(Math.round(average)),
        passes,
      );
      const total = capped.reduce<AIJobEstimate>(
        accumulated => addEstimates(accumulated, perChapter),
        { chapters: 0, inputTokens: 0, outputTokens: 0 },
      );

      if (!cancelled) {
        setEstimate(total);
      }
    };

    void measure();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = () => {
    backgroundTasks.enqueue({
      name: 'AI_PROCESS_CHAPTERS',
      data: {
        novelId: novel.id,
        novelName: novel.name,
        passes,
        chapters: capped.map(chapter => ({
          chapterId: chapter.id,
          chapterName: chapter.name,
          chapterNumber: chapter.chapterNumber,
          path: chapter.path,
        })),
      },
    });
    onDismiss();
  };

  return (
    <Dialog.Root visible onDismiss={onDismiss}>
      <Dialog.Header>
        <Dialog.Title>
          {getString('aiSettings.estimateTitle', { count: capped.length })}
        </Dialog.Title>
      </Dialog.Header>
      <Dialog.Content>
        <View style={styles.body}>
          <Text style={{ color: theme.onSurface }}>
            {estimate
              ? getString('aiSettings.estimateBody', {
                  input: formatTokenCount(estimate.inputTokens),
                  output: formatTokenCount(estimate.outputTokens),
                })
              : '…'}
          </Text>
          {capped.length < chapters.length ? (
            <Text style={[styles.note, { color: theme.onSurfaceVariant }]}>
              {getString('aiSettings.estimateCapped', { count: capped.length })}
            </Text>
          ) : null}
        </View>
      </Dialog.Content>
      <Dialog.Actions>
        <Dialog.Action onPress={onDismiss}>
          {getString('common.cancel')}
        </Dialog.Action>
        <Dialog.Action disabled={!estimate} onPress={run}>
          {getString('aiSettings.run')}
        </Dialog.Action>
      </Dialog.Actions>
    </Dialog.Root>
  );
};

export default AIJobDialog;

const styles = StyleSheet.create({
  body: { gap: 8 },
  note: { fontSize: 12 },
});
