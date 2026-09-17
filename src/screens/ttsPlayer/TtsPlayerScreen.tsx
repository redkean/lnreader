import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { IconButton } from 'react-native-paper';

import { Appbar, Button, SafeAreaView, Slider } from '@components';
import { useTtsPlayerContext } from '@components/Context/TtsPlayerContext';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import { TtsPlayerScreenProps } from '@navigators/types';

const SLEEP_TIMER_OPTIONS = [15, 30, 45, 60];

const formatRemaining = (endsAt: number, now: number): string => {
  const totalSeconds = Math.max(Math.round((endsAt - now) / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const TtsPlayerScreen = ({ navigation }: TtsPlayerScreenProps) => {
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

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('ttsPlayer.title')}
        handleGoBack={navigation.goBack}
        theme={theme}
      />
      {!isActive ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>
            {getString('ttsPlayer.nothingPlaying')}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
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
              numberOfLines={6}
            >
              {currentParagraph}
            </Text>
          </View>

          <Slider
            value={progress.index}
            min={0}
            max={Math.max(progress.total - 1, 0)}
            step={1}
            onSlidingComplete={seekTo}
          />
          <Text style={[styles.counter, { color: theme.onSurfaceVariant }]}>
            {`${Math.min(progress.index + 1, progress.total)} / ${
              progress.total
            }`}
          </Text>

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
          </View>

          <Text style={[styles.sectionTitle, { color: theme.onSurface }]}>
            {getString('ttsPlayer.sleepTimer')}
          </Text>
          <View style={styles.timerRow}>
            <Button
              title={getString('ttsPlayer.sleepTimerOff')}
              mode={sleepTimerEndsAt === null ? 'contained' : 'outlined'}
              onPress={() => setSleepTimer(null)}
            />
            {SLEEP_TIMER_OPTIONS.map(minutes => (
              <Button
                key={minutes}
                title={getString('ttsPlayer.minutes', { minutes })}
                mode="outlined"
                onPress={() => setSleepTimer(minutes)}
              />
            ))}
          </View>
          {remaining ? (
            <Text style={[styles.counter, { color: theme.onSurfaceVariant }]}>
              {getString('ttsPlayer.sleepingIn', { time: remaining })}
            </Text>
          ) : null}

          {error ? (
            <Text style={[styles.error, { color: theme.error }]}>{error}</Text>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

export default TtsPlayerScreen;

const styles = StyleSheet.create({
  chapterName: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  content: {
    alignItems: 'center',
    padding: 16,
    paddingBottom: 32,
  },
  counter: {
    fontSize: 12,
    marginTop: 4,
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
    lineHeight: 22,
  },
  paragraphCard: {
    borderRadius: 12,
    marginTop: 20,
    padding: 16,
    width: '100%',
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  sectionTitle: {
    alignSelf: 'flex-start',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  timerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 12,
  },
  transport: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
});
