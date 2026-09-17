import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useNavigation } from '@react-navigation/native';

import { Button, List, SwitchItem } from '@components';
import { useTheme } from '@hooks/persisted';
import { useAISettings } from '@hooks/persisted/useAISettings';
import { getString } from '@i18n/translations';
import { showToast } from '@utils/showToast';
import { useChapterContext } from '../../ChapterContext';

/**
 * The reader's AI controls. Everything here acts on the chapter on screen -
 * bulk runs across many chapters are started from the novel screen, where the
 * chapter selection already lives.
 */
const AITab: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const settings = useAISettings();
  const {
    novel,
    aiEnabled,
    aiHasCleaned,
    aiShowCleaned,
    aiShowEdits,
    aiRunning,
    aiProgress,
    aiSummary,
    aiChangedCount,
    cancelAIRun,
    runCleanup,
    runRecap,
    runSummary,
    toggleAICleaned,
    toggleAIEdits,
  } = useChapterContext();

  const openSettings = useCallback(() => {
    navigation.navigate('MoreStack', {
      screen: 'SettingsStack',
      params: { screen: 'AISettings' },
    });
  }, [navigation]);

  const openGlossary = useCallback(() => {
    navigation.navigate('MoreStack', {
      screen: 'Glossary',
      params: { novelId: novel.id, novelName: novel.name },
    });
  }, [navigation, novel.id, novel.name]);

  const busyLabel = useMemo(() => {
    switch (aiRunning) {
      case 'cleanup':
        return getString('aiSettings.cleaning');
      case 'summary':
        return getString('aiSettings.summarizing');
      case 'recap':
        return getString('aiSettings.recapping');
      default:
        return undefined;
    }
  }, [aiRunning]);

  if (!aiEnabled) {
    return (
      <BottomSheetScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.notice, { color: theme.onSurfaceVariant }]}>
          {getString('aiSettings.notConfigured')}
        </Text>
        <Button
          title={getString('aiSettings.title')}
          mode="contained"
          onPress={openSettings}
        />
      </BottomSheetScrollView>
    );
  }

  return (
    <BottomSheetScrollView contentContainerStyle={styles.container}>
      {busyLabel ? (
        <View style={styles.busy}>
          <ActivityIndicator color={theme.primary} />
          <Text style={{ color: theme.onSurface }}>
            {aiRunning === 'cleanup' && aiProgress > 0
              ? `${busyLabel} ${Math.round(aiProgress * 100)}%`
              : busyLabel}
          </Text>
          <Button
            title={getString('aiSettings.cancel')}
            mode="text"
            onPress={cancelAIRun}
          />
        </View>
      ) : null}

      <List.SubHeader theme={theme}>
        {getString('aiSettings.cleanup')}
      </List.SubHeader>
      {aiHasCleaned ? (
        <>
          <List.Item
            title={
              aiShowCleaned
                ? getString('aiSettings.showOriginal')
                : getString('aiSettings.showCleaned')
            }
            description={getString('aiSettings.changedParagraphs', {
              count: aiChangedCount,
            })}
            onPress={toggleAICleaned}
            theme={theme}
          />
          <SwitchItem
            label={getString('aiSettings.showEdits')}
            value={aiShowEdits}
            onPress={toggleAIEdits}
            theme={theme}
            style={styles.switch}
          />
        </>
      ) : (
        <Text style={[styles.notice, { color: theme.onSurfaceVariant }]}>
          {getString('aiSettings.noCleanedText')}
        </Text>
      )}
      <List.Item
        title={
          aiHasCleaned
            ? getString('aiSettings.cleanChapterAgain')
            : getString('aiSettings.cleanChapter')
        }
        onPress={() => {
          if (aiRunning) {
            return;
          }
          void runCleanup(aiHasCleaned);
        }}
        theme={theme}
      />

      <List.SubHeader theme={theme}>
        {getString('aiSettings.summary')}
      </List.SubHeader>
      {aiSummary ? (
        <Text style={[styles.summary, { color: theme.onSurface }]}>
          {aiSummary}
        </Text>
      ) : null}
      <List.Item
        title={getString('aiSettings.summarizeChapter')}
        onPress={() => {
          if (aiRunning) {
            return;
          }
          void runSummary(Boolean(aiSummary));
        }}
        theme={theme}
      />
      <List.Item
        title={getString('aiSettings.showRecap', {
          count: settings.recapChapterCount,
        })}
        onPress={() => {
          if (aiRunning) {
            return;
          }
          if (!settings.summaryEnabled) {
            showToast(getString('aiSettings.noSummaries'));
            return;
          }
          void runRecap();
        }}
        theme={theme}
      />

      <List.SubHeader theme={theme}>
        {getString('aiSettings.glossaryTitle')}
      </List.SubHeader>
      <List.Item
        title={getString('aiSettings.openGlossary')}
        description={getString('aiSettings.glossarySpoilerNote')}
        onPress={openGlossary}
        theme={theme}
      />
    </BottomSheetScrollView>
  );
};

export default React.memo(AITab);

const styles = StyleSheet.create({
  container: { paddingBottom: 24 },
  switch: { paddingHorizontal: 16 },
  notice: { paddingHorizontal: 16, paddingVertical: 8 },
  summary: { paddingHorizontal: 16, paddingVertical: 8, lineHeight: 20 },
  busy: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
