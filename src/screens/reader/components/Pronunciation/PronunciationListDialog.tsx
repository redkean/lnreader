import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Dialog } from '@components';
import { useTheme } from '@hooks/persisted';
import {
  type PronunciationNovel,
  usePronunciations,
} from '@hooks/persisted/usePronunciations';
import { getString } from '@i18n/translations';
import PronunciationDialog from './PronunciationDialog';

interface PronunciationListDialogProps {
  visible: boolean;
  novel: PronunciationNovel;
  onDismiss: () => void;
}

const byWord = ([a]: [string, string], [b]: [string, string]) =>
  a.localeCompare(b);

const PronunciationListDialog = ({
  visible,
  novel,
  onDismiss,
}: PronunciationListDialogProps) => {
  const theme = useTheme();
  const pronunciations = usePronunciations(novel);
  // `undefined` while browsing the list; a word (empty for a new entry) while
  // the editor is open in its place.
  const [editing, setEditing] = useState<string>();

  // An editor left open must not greet the next opening of the list.
  const close = () => {
    setEditing(undefined);
    onDismiss();
  };

  const sections = [
    {
      title: getString('readerScreen.pronunciation.thisNovel'),
      entries: Object.entries(pronunciations.novel).sort(byWord),
    },
    {
      title: getString('readerScreen.pronunciation.allNovels'),
      entries: Object.entries(pronunciations.global).sort(byWord),
    },
  ].filter(section => section.entries.length > 0);

  return (
    <>
      <Dialog.Root visible={visible && editing === undefined} onDismiss={close}>
        <Dialog.Header>
          <Dialog.Title>
            {getString('readerScreen.pronunciation.titlePlural')}
          </Dialog.Title>
        </Dialog.Header>
        <Dialog.ScrollArea>
          <ScrollView style={styles.list}>
            {sections.length === 0 ? (
              <Text style={[styles.empty, { color: theme.onSurfaceVariant }]}>
                {getString('readerScreen.pronunciation.empty')}
              </Text>
            ) : (
              sections.map(section => (
                <View key={section.title}>
                  <Text style={[styles.sectionTitle, { color: theme.primary }]}>
                    {section.title}
                  </Text>
                  {section.entries.map(([word, sayAs]) => (
                    <Pressable
                      key={word}
                      accessibilityRole="button"
                      android_ripple={{ color: theme.rippleColor }}
                      onPress={() => setEditing(word)}
                      style={styles.row}
                    >
                      <Text
                        style={[styles.word, { color: theme.onSurface }]}
                        numberOfLines={1}
                      >
                        {word}
                      </Text>
                      <Text
                        style={[
                          styles.sayAs,
                          { color: theme.onSurfaceVariant },
                        ]}
                        numberOfLines={1}
                      >
                        {sayAs}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ))
            )}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Dialog.Action onPress={() => setEditing('')}>
            {getString('readerScreen.pronunciation.add')}
          </Dialog.Action>
          <Dialog.Action onPress={close}>
            {getString('common.close')}
          </Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>
      <PronunciationDialog
        visible={visible && editing !== undefined}
        word={editing ?? ''}
        novel={novel}
        onDismiss={() => setEditing(undefined)}
      />
    </>
  );
};

export default PronunciationListDialog;

const styles = StyleSheet.create({
  empty: {
    fontSize: 14,
    paddingHorizontal: 24,
    paddingVertical: 20,
    textAlign: 'center',
  },
  list: { maxHeight: 360 },
  row: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  sayAs: { flex: 1, fontSize: 16, textAlign: 'right' },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  word: { flexShrink: 1, fontSize: 16 },
});
