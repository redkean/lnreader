import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { Dialog } from '@components/Dialog';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import { showToast } from '@utils/showToast';
import { useChapterContext } from '../ChapterContext';

/**
 * What the reader surfaces outside the bottom sheet: what a highlighted edit
 * changed, the recap the reader asked for, and why a run failed.
 */
const AIDialogs = () => {
  const theme = useTheme();
  const {
    aiEditDetail,
    aiError,
    aiRecap,
    clearAIEditDetail,
    clearAIError,
    revertParagraph,
    clearAIRecap,
  } = useChapterContext();

  return (
    <>
      <Dialog.Root
        visible={Boolean(aiEditDetail)}
        onDismiss={clearAIEditDetail}
      >
        <Dialog.Header>
          <Dialog.Title>{getString('aiSettings.editCleaned')}</Dialog.Title>
        </Dialog.Header>
        <Dialog.Content>
          <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
            {getString('aiSettings.editOriginal')}
          </Text>
          <Text style={[styles.body, { color: theme.onSurface }]}>
            {aiEditDetail?.original || getString('aiSettings.editDeleted')}
          </Text>
          <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
            {getString('aiSettings.editCleaned')}
          </Text>
          <Text style={[styles.body, { color: theme.onSurface }]}>
            {aiEditDetail?.cleaned || getString('aiSettings.editDeleted')}
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Dialog.Action onPress={clearAIEditDetail}>
            {getString('common.cancel')}
          </Dialog.Action>
          <Dialog.Action
            onPress={() => {
              if (aiEditDetail) {
                void revertParagraph(aiEditDetail.index);
              }
            }}
          >
            {getString('aiSettings.revertParagraph')}
          </Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>

      <Dialog.Root visible={Boolean(aiRecap)} onDismiss={clearAIRecap}>
        <Dialog.Header>
          <Dialog.Title>{getString('aiSettings.recapTitle')}</Dialog.Title>
        </Dialog.Header>
        <Dialog.Content>
          <ScrollView style={styles.recap}>
            <Text style={[styles.body, { color: theme.onSurface }]}>
              {aiRecap}
            </Text>
          </ScrollView>
        </Dialog.Content>
        <Dialog.Actions>
          <Dialog.Action onPress={clearAIRecap}>
            {getString('common.ok')}
          </Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>

      <Dialog.Root visible={Boolean(aiError)} onDismiss={clearAIError}>
        <Dialog.Header>
          <Dialog.Title>{getString('aiSettings.errorTitle')}</Dialog.Title>
        </Dialog.Header>
        <Dialog.Content>
          <ScrollView style={styles.recap}>
            <Text selectable style={[styles.body, { color: theme.onSurface }]}>
              {aiError}
            </Text>
          </ScrollView>
        </Dialog.Content>
        <Dialog.Actions>
          <Dialog.Action
            onPress={() => {
              if (aiError) {
                void Clipboard.setStringAsync(aiError).then(() =>
                  showToast(
                    getString('common.copiedToClipboard', { name: '' }),
                  ),
                );
              }
            }}
          >
            {getString('aiSettings.copyError')}
          </Dialog.Action>
          <Dialog.Action onPress={clearAIError}>
            {getString('common.ok')}
          </Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>
    </>
  );
};

export default React.memo(AIDialogs);

const styles = StyleSheet.create({
  label: { fontSize: 12, marginBottom: 4, marginTop: 8 },
  body: { fontSize: 15, lineHeight: 21 },
  recap: { maxHeight: 320 },
});
