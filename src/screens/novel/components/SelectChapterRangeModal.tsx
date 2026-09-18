import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { HelperText, TextInput } from 'react-native-paper';

import { Dialog } from '@components';
import { NovelInfo } from '@database/types';
import { getPageChapterIdsInRange } from '@database/queries/ChapterQueries';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import { useNovelValue } from '../NovelContext';

interface SelectChapterRangeModalProps {
  visible: boolean;
  hideModal: () => void;
  novel: NovelInfo;
  onSelect: (chapterIds: number[]) => void;
}

const parseBound = (value: string, fallback: number) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : NaN;
};

const SelectChapterRangeModal = ({
  visible,
  hideModal,
  novel,
  onSelect,
}: SelectChapterRangeModalProps) => {
  const theme = useTheme();
  const batchInformation = useNovelValue('batchInformation');
  const novelSettings = useNovelValue('novelSettings');
  const pages = useNovelValue('pages');
  const pageIndex = useNovelValue('pageIndex');

  const totalChapters = batchInformation.totalChapters ?? -1;
  const hasKnownMax = totalChapters >= 1;

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState(false);
  const requestIdRef = useRef(0);

  const inputTheme = useMemo(() => ({ colors: theme }), [theme]);

  const range = useMemo(() => {
    const start = parseBound(from, 1);
    const end = parseBound(
      to,
      hasKnownMax ? totalChapters : Number.MAX_SAFE_INTEGER,
    );

    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      return null;
    }

    if (start < 1 || end < start) {
      return null;
    }

    if (hasKnownMax && (start > totalChapters || end > totalChapters)) {
      return null;
    }

    return { start, end };
  }, [from, hasKnownMax, to, totalChapters]);

  const onDismiss = () => {
    requestIdRef.current += 1;
    hideModal();
    setFrom('');
    setTo('');
    setError('');
    setSelecting(false);
  };

  const onSubmit = async () => {
    if (!range || selecting) {
      return;
    }

    const requestId = ++requestIdRef.current;
    setError('');
    setSelecting(true);
    try {
      const chapterIds = await getPageChapterIdsInRange(
        novel.id,
        range.start,
        range.end,
        novelSettings.filter,
        pages[pageIndex],
        novelSettings.excludedScanlators,
      );
      if (requestId !== requestIdRef.current) {
        return;
      }

      onSelect(chapterIds);
      onDismiss();
    } catch (selectError) {
      if (requestId === requestIdRef.current) {
        setError(
          selectError instanceof Error
            ? selectError.message
            : String(selectError),
        );
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setSelecting(false);
      }
    }
  };

  const hasInput = Boolean(from.trim() || to.trim());
  const rangeError = error || (hasInput && !range ? 'invalid' : '');
  const errorMessage =
    error || getString('novelScreen.selectRange.error.invalidRange');

  return (
    <Dialog.Root visible={visible} onDismiss={onDismiss} testID="select-range">
      <Dialog.Header>
        <Dialog.Title>
          {getString('novelScreen.selectRange.title')}
        </Dialog.Title>
        <Dialog.Description>
          {getString('novelScreen.selectRange.description')}
        </Dialog.Description>
      </Dialog.Header>
      <Dialog.Content>
        <View style={styles.rangeInputs}>
          <TextInput
            error={Boolean(rangeError)}
            keyboardType="number-pad"
            label={getString('novelScreen.selectRange.from')}
            mode="outlined"
            onChangeText={value => {
              setFrom(value);
              setError('');
            }}
            placeholder="1"
            returnKeyType="next"
            style={styles.rangeInput}
            testID="select-range-from"
            theme={inputTheme}
            value={from}
          />
          <TextInput
            error={Boolean(rangeError)}
            keyboardType="number-pad"
            label={getString('novelScreen.selectRange.to')}
            mode="outlined"
            onChangeText={value => {
              setTo(value);
              setError('');
            }}
            onSubmitEditing={() => void onSubmit()}
            placeholder={hasKnownMax ? `${totalChapters}` : undefined}
            returnKeyType="done"
            style={styles.rangeInput}
            testID="select-range-to"
            theme={inputTheme}
            value={to}
          />
        </View>
        {rangeError ? (
          <HelperText type="error">{errorMessage}</HelperText>
        ) : (
          <HelperText type="info">
            {getString('novelScreen.selectRange.toLatestHint')}
          </HelperText>
        )}
      </Dialog.Content>
      <Dialog.Actions>
        <Dialog.Action onPress={onDismiss} title={getString('common.cancel')} />
        <Dialog.Action
          disabled={!range || selecting}
          loading={selecting}
          onPress={() => void onSubmit()}
          title={getString('novelScreen.selectRange.select')}
        />
      </Dialog.Actions>
    </Dialog.Root>
  );
};

export default SelectChapterRangeModal;

const styles = StyleSheet.create({
  rangeInput: {
    flex: 1,
  },
  rangeInputs: {
    flexDirection: 'row',
    gap: 12,
  },
});
