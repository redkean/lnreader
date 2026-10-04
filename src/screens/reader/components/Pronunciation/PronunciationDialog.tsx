import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { HelperText, TextInput } from 'react-native-paper';
import * as Speech from 'expo-speech';

import { Button, Checkbox, Dialog } from '@components';
import { useTtsPlayerContext } from '@components/Context/TtsPlayerContext';
import { useChapterReaderSettings, useTheme } from '@hooks/persisted';
import {
  type PronunciationNovel,
  type PronunciationScope,
  usePronunciations,
} from '@hooks/persisted/usePronunciations';
import { getString } from '@i18n/translations';

interface PronunciationDialogProps {
  visible: boolean;
  /** The word to edit; empty to add a new entry. */
  word: string;
  novel: PronunciationNovel;
  onDismiss: () => void;
}

const findEntry = (
  map: Record<string, string>,
  word: string,
): [string, string] | undefined => {
  const lower = word.toLowerCase();
  return Object.entries(map).find(([key]) => key.toLowerCase() === lower);
};

const findInitial = (
  pronunciations: ReturnType<typeof usePronunciations>,
  initialWord: string,
) => {
  const trimmed = initialWord.replace(/\s+/g, ' ').trim();
  const novelEntry = findEntry(pronunciations.novel, trimmed);
  const globalEntry = novelEntry
    ? undefined
    : findEntry(pronunciations.global, trimmed);
  const entry = novelEntry ?? globalEntry;
  const scope: PronunciationScope = globalEntry ? 'global' : 'novel';
  return {
    word: entry?.[0] ?? trimmed,
    sayAs: entry?.[1] ?? '',
    scope,
    existing: entry ? { word: entry[0], scope } : undefined,
  };
};

/**
 * Mounted only while open, so each opening starts from the stored entry
 * rather than whatever was typed the last time.
 */
const PronunciationForm = ({
  word: initialWord,
  novel,
  onDismiss,
}: Omit<PronunciationDialogProps, 'visible'>) => {
  const theme = useTheme();
  const { tts } = useChapterReaderSettings();
  const { pause, state } = useTtsPlayerContext();
  const pronunciations = usePronunciations(novel);

  const [initial] = useState(() => findInitial(pronunciations, initialWord));
  const { existing } = initial;
  const [word, setWord] = useState(initial.word);
  const [sayAs, setSayAs] = useState(initial.sayAs);
  const [scope, setScope] = useState<PronunciationScope>(initial.scope);
  const [error, setError] = useState<string>();

  const close = () => {
    Speech.stop();
    onDismiss();
  };

  const preview = () => {
    const text = sayAs.trim() || word.trim();
    if (!text) {
      return;
    }
    // Two engines talking over each other make the preview useless.
    if (state === 'playing') {
      pause();
    }
    Speech.stop();
    Speech.speak(text, {
      voice: tts?.voice?.identifier,
      pitch: tts?.pitch || 1,
      rate: tts?.rate || 1,
    });
  };

  const save = () => {
    const key = word.replace(/\s+/g, ' ').trim();
    if (!key) {
      setError(getString('readerScreen.pronunciation.enterWord'));
      return;
    }
    if (!sayAs.trim()) {
      setError(getString('readerScreen.pronunciation.enterSayAs'));
      return;
    }
    // Renaming the word leaves no stale entry behind under the old one.
    if (existing && existing.word.toLowerCase() !== key.toLowerCase()) {
      pronunciations.removeEntry(existing.word, existing.scope);
    }
    pronunciations.setEntry(key, sayAs.trim(), scope);
    close();
  };

  const remove = () => {
    if (existing) {
      pronunciations.removeEntry(existing.word, existing.scope);
    }
    close();
  };

  const inputTheme = { colors: { background: theme.surface } };

  return (
    <Dialog.Root visible onDismiss={close}>
      <Dialog.Header>
        <Dialog.Title>
          {getString('readerScreen.pronunciation.title')}
        </Dialog.Title>
        <Dialog.Description>
          {getString('readerScreen.pronunciation.sayAsHint')}
        </Dialog.Description>
      </Dialog.Header>
      <Dialog.Content>
        <TextInput
          label={getString('readerScreen.pronunciation.word')}
          value={word}
          onChangeText={setWord}
          autoCorrect={false}
          mode="outlined"
          style={styles.input}
          theme={inputTheme}
        />
        <View style={styles.sayAsRow}>
          <TextInput
            label={getString('readerScreen.pronunciation.sayAs')}
            value={sayAs}
            onChangeText={setSayAs}
            testID="pronunciation-say-as"
            autoCorrect={false}
            autoFocus={!!word}
            mode="outlined"
            style={styles.sayAsInput}
            theme={inputTheme}
          />
          <Button
            accessibilityLabel={getString('readerScreen.pronunciation.preview')}
            icon="play"
            mode="text"
            onPress={preview}
            title={getString('readerScreen.pronunciation.preview')}
          />
        </View>
        {error ? (
          <HelperText type="error" visible>
            {error}
          </HelperText>
        ) : null}
        <Checkbox
          label={getString('readerScreen.pronunciation.novelOnly')}
          status={scope === 'novel'}
          onPress={() => setScope(scope === 'novel' ? 'global' : 'novel')}
          theme={theme}
        />
      </Dialog.Content>
      <Dialog.Actions>
        {existing ? (
          <Dialog.Action tone="danger" onPress={remove}>
            {getString('common.delete')}
          </Dialog.Action>
        ) : null}
        <Dialog.Action onPress={close}>
          {getString('common.cancel')}
        </Dialog.Action>
        <Dialog.Action onPress={save}>{getString('common.save')}</Dialog.Action>
      </Dialog.Actions>
    </Dialog.Root>
  );
};

const PronunciationDialog = ({ visible, ...props }: PronunciationDialogProps) =>
  visible ? <PronunciationForm key={props.word} {...props} /> : null;

export default PronunciationDialog;

const styles = StyleSheet.create({
  input: { marginBottom: 12 },
  sayAsInput: { flex: 1 },
  sayAsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
});
