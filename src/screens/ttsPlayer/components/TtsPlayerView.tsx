import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { IconButton } from 'react-native-paper';

import { Appbar, Menu, SafeAreaView, Slider } from '@components';
import { useTtsPlayerContext } from '@components/Context/TtsPlayerContext';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';

const SLEEP_TIMER_OPTIONS = [15, 30, 45, 60];

/**
 * The paragraph card is sized for this many lines and never grows or shrinks,
 * so the transport controls below it hold still while playback moves from a
 * one-line paragraph to a long one.
 */
const PARAGRAPH_LINES = 6;
const PARAGRAPH_LINE_HEIGHT = 22;
const PARAGRAPH_PADDING = 16;

const formatRemaining = (endsAt: number, now: number): string => {
  const totalSeconds = Math.max(Math.round((endsAt - now) / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

interface TtsPlayerViewProps {
  /** Closes the player: pops the screen, or hides the reader overlay. */
  onClose: () => void;
}

/**
 * The on-the-go player UI. Rendered both as its own screen (reached from the
 * more tab) and in place of the reader, so the two stay in sync by
 * construction.
 */
const TtsPlayerView = ({ onClose }: TtsPlayerViewProps) => {
  const theme = useTheme();
  const {
    chapter,
    error,
    isActive,
    novel,
    paragraphs,
    pause,
    play,
    progress,
    replay,
    seekTo,
    setSleepTimer,
    skipChapter,
    skipNext,
    skipPrevious,
    sleepTimerEndsAt,
    state,
    stop,
  } = useTtsPlayerContext();

  const [now, setNow] = useState(() => Date.now());
  const [timerMenuVisible, setTimerMenuVisible] = useState(false);

  useEffect(() => {
    if (sleepTimerEndsAt === null) {
      return;
    }
    const interval = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(interval);
  }, [sleepTimerEndsAt]);

  const remaining = useMemo(
    () =>
      sleepTimerEndsAt === null ? null : formatRemaining(sleepTimerEndsAt, now),
    [now, sleepTimerEndsAt],
  );

  const currentParagraph = useMemo(
    () => paragraphs[progress.index] ?? '',
    [paragraphs, progress.index],
  );

  const isPlaying = state === 'playing';

  const pickSleepTimer = (minutes: number | null) => {
    setTimerMenuVisible(false);
    setSleepTimer(minutes);
  };

  return (
    <SafeAreaView excludeTop style={{ backgroundColor: theme.background }}>
      <Appbar
        title={getString('ttsPlayer.title')}
        handleGoBack={onClose}
        theme={theme}
      />
      {!isActive ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>
            {getString('ttsPlayer.nothingPlaying')}
          </Text>
        </View>
      ) : (
        <View style={styles.body}>
          <ScrollView
            contentContainerStyle={styles.trackContent}
            style={styles.track}
          >
            {novel?.cover ? (
              <Image
                source={{ uri: novel.cover }}
                style={styles.cover}
                resizeMode="cover"
              />
            ) : null}

            <Text
              style={[styles.novelName, { color: theme.onSurface }]}
              numberOfLines={2}
            >
              {novel?.name}
            </Text>
            <Text
              style={[styles.chapterName, { color: theme.onSurfaceVariant }]}
              numberOfLines={2}
            >
              {chapter?.name}
            </Text>

            <View
              style={[
                styles.paragraphCard,
                { backgroundColor: theme.surfaceVariant },
              ]}
            >
              <Text
                style={[styles.paragraph, { color: theme.onSurfaceVariant }]}
                numberOfLines={PARAGRAPH_LINES}
              >
                {currentParagraph}
              </Text>
            </View>

            {error ? (
              <Text style={[styles.error, { color: theme.error }]}>
                {error}
              </Text>
            ) : null}
          </ScrollView>

          {/* Pinned: nothing above it may change this block's height. */}
          <View style={styles.controls}>
            <Slider
              value={progress.index}
              min={0}
              max={Math.max(progress.total - 1, 0)}
              step={1}
              onSlidingComplete={seekTo}
            />
            <View style={styles.statusRow}>
              <Text
                style={[styles.counter, { color: theme.onSurfaceVariant }]}
                numberOfLines={1}
              >
                {`${Math.min(progress.index + 1, progress.total)} / ${
                  progress.total
                }`}
              </Text>
              <Text
                style={[styles.counter, { color: theme.onSurfaceVariant }]}
                numberOfLines={1}
              >
                {remaining
                  ? getString('ttsPlayer.sleepingIn', { time: remaining })
                  : ''}
              </Text>
            </View>

            <View style={styles.transport}>
              <IconButton
                icon="skip-backward"
                iconColor={theme.onSurface}
                onPress={() => skipChapter('PREV')}
                accessibilityLabel={getString('ttsPlayer.previousChapter')}
              />
              <IconButton
                icon="skip-previous"
                iconColor={theme.onSurface}
                onPress={skipPrevious}
                accessibilityLabel={getString('ttsPlayer.previousParagraph')}
              />
              <IconButton
                icon={isPlaying ? 'pause-circle' : 'play-circle'}
                size={64}
                iconColor={theme.primary}
                disabled={state === 'loading'}
                onPress={isPlaying ? pause : play}
                accessibilityLabel={getString(
                  isPlaying ? 'ttsPlayer.pause' : 'ttsPlayer.play',
                )}
              />
              <IconButton
                icon="skip-next"
                iconColor={theme.onSurface}
                onPress={skipNext}
                accessibilityLabel={getString('ttsPlayer.nextParagraph')}
              />
              <IconButton
                icon="skip-forward"
                iconColor={theme.onSurface}
                onPress={() => skipChapter('NEXT')}
                accessibilityLabel={getString('ttsPlayer.nextChapter')}
              />
            </View>

            <View style={styles.secondaryRow}>
              <IconButton
                icon="replay"
                iconColor={theme.onSurfaceVariant}
                onPress={replay}
                accessibilityLabel={getString('ttsPlayer.replayParagraph')}
              />
              <IconButton
                icon="stop"
                iconColor={theme.onSurfaceVariant}
                onPress={stop}
                accessibilityLabel={getString('ttsPlayer.stop')}
              />
              {/* The timer lives in a menu so its options never push the
                  transport controls around. */}
              <Menu
                visible={timerMenuVisible}
                onDismiss={() => setTimerMenuVisible(false)}
                anchor={
                  <IconButton
                    icon={
                      sleepTimerEndsAt === null ? 'timer-outline' : 'timer-sand'
                    }
                    iconColor={
                      sleepTimerEndsAt === null
                        ? theme.onSurfaceVariant
                        : theme.primary
                    }
                    onPress={() => setTimerMenuVisible(true)}
                    accessibilityLabel={getString('ttsPlayer.sleepTimer')}
                  />
                }
              >
                <Menu.Item
                  title={getString('ttsPlayer.sleepTimerOff')}
                  onPress={() => pickSleepTimer(null)}
                  titleStyle={
                    sleepTimerEndsAt === null
                      ? { color: theme.primary }
                      : undefined
                  }
                />
                {SLEEP_TIMER_OPTIONS.map(minutes => (
                  <Menu.Item
                    key={minutes}
                    title={getString('ttsPlayer.minutes', { minutes })}
                    onPress={() => pickSleepTimer(minutes)}
                  />
                ))}
              </Menu>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

export default TtsPlayerView;

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  chapterName: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  controls: {
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  counter: {
    fontSize: 12,
  },
  cover: {
    borderRadius: 8,
    height: 240,
    marginBottom: 24,
    width: 160,
  },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  error: {
    fontSize: 13,
    marginTop: 16,
    textAlign: 'center',
  },
  novelName: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  paragraph: {
    fontSize: 15,
    lineHeight: PARAGRAPH_LINE_HEIGHT,
  },
  paragraphCard: {
    borderRadius: 12,
    height: PARAGRAPH_LINES * PARAGRAPH_LINE_HEIGHT + PARAGRAPH_PADDING * 2,
    marginTop: 20,
    padding: PARAGRAPH_PADDING,
    width: '100%',
  },
  secondaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 20,
    justifyContent: 'space-between',
    marginTop: 4,
  },
  track: {
    flex: 1,
  },
  trackContent: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  transport: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
});
