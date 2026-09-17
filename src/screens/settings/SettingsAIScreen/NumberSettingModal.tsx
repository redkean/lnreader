import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { TextInput } from 'react-native-paper';

import { Dialog } from '@components/Dialog';
import { getString } from '@i18n/translations';
import type { ThemeColors } from '@theme/types';

type NumberSettingModalProps = {
  visible: boolean;
  title: string;
  value: number;
  min: number;
  max: number;
  theme: ThemeColors;
  onDismiss: () => void;
  onSave: (value: number) => void;
};

const NumberSettingModal = ({
  visible,
  title,
  value,
  min,
  max,
  theme,
  onDismiss,
  onSave,
}: NumberSettingModalProps) => {
  const [text, setText] = useState(String(value));

  const parsed = Number.parseInt(text, 10);
  const valid = Number.isFinite(parsed) && parsed >= min && parsed <= max;

  return (
    <Dialog.Root visible={visible} onDismiss={onDismiss}>
      <Dialog.Header>
        <Dialog.Title>{title}</Dialog.Title>
      </Dialog.Header>
      <Dialog.Content>
        <TextInput
          mode="outlined"
          keyboardType="number-pad"
          value={text}
          onChangeText={setText}
          error={!valid}
          label={`${min} – ${max}`}
          style={styles.input}
          theme={{ colors: { background: theme.surface } }}
        />
      </Dialog.Content>
      <Dialog.Actions>
        <Dialog.Action onPress={onDismiss}>
          {getString('common.cancel')}
        </Dialog.Action>
        <Dialog.Action disabled={!valid} onPress={() => onSave(parsed)}>
          {getString('common.save')}
        </Dialog.Action>
      </Dialog.Actions>
    </Dialog.Root>
  );
};

export default NumberSettingModal;

const styles = StyleSheet.create({
  input: { marginBottom: 8 },
});
