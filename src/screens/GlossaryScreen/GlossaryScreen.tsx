import { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';

import {
  Appbar,
  EmptyView,
  IconButtonV2,
  List,
  SafeAreaView,
} from '@components';
import { Dialog } from '@components/Dialog';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import {
  deleteGlossaryTerm,
  deleteNovelGlossary,
  getNovelGlossary,
  updateGlossaryTerm,
} from '@database/queries/AIQueries';
import type { NovelGlossaryRow } from '@database/schema';
import type { AIGlossaryKind } from '@services/ai';
import type { GlossaryScreenProps } from '@navigators/types';

const KIND_ORDER: AIGlossaryKind[] = ['character', 'place', 'skill', 'term'];

const KIND_LABELS: Record<AIGlossaryKind, 'aiSettings.glossaryKindTerm'> = {
  character:
    'aiSettings.glossaryKindCharacter' as 'aiSettings.glossaryKindTerm',
  place: 'aiSettings.glossaryKindPlace' as 'aiSettings.glossaryKindTerm',
  skill: 'aiSettings.glossaryKindSkill' as 'aiSettings.glossaryKindTerm',
  term: 'aiSettings.glossaryKindTerm',
};

const parseAliases = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((alias): alias is string => typeof alias === 'string')
      : [];
  } catch {
    return [];
  }
};

const GlossaryScreen = ({ navigation, route }: GlossaryScreenProps) => {
  const theme = useTheme();
  const { novelId, novelName } = route.params;

  const [terms, setTerms] = useState(() => getNovelGlossary(novelId));
  const [editing, setEditing] = useState<NovelGlossaryRow>();
  const [editText, setEditText] = useState('');
  const [editNote, setEditNote] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const reload = useCallback(
    () => setTerms(getNovelGlossary(novelId)),
    [novelId],
  );

  const sections = useMemo(
    () =>
      KIND_ORDER.map(kind => ({
        kind,
        title: getString(KIND_LABELS[kind]),
        data: terms.filter(term => term.kind === kind),
      })).filter(section => section.data.length > 0),
    [terms],
  );

  const openEditor = useCallback((term: NovelGlossaryRow) => {
    setEditing(term);
    setEditText(term.canonical);
    setEditNote(term.note ?? '');
  }, []);

  const saveEditor = useCallback(async () => {
    if (!editing) {
      return;
    }
    await updateGlossaryTerm(editing.id, {
      canonical: editText.trim() || editing.canonical,
      note: editNote.trim() || null,
    });
    setEditing(undefined);
    reload();
  }, [editNote, editText, editing, reload]);

  const removeTerm = useCallback(async () => {
    if (!editing) {
      return;
    }
    await deleteGlossaryTerm(editing.id);
    setEditing(undefined);
    reload();
  }, [editing, reload]);

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('aiSettings.glossaryTitle')}
        handleGoBack={navigation.goBack}
        theme={theme}
      >
        {terms.length ? (
          <IconButtonV2
            name="delete-sweep-outline"
            accessibilityLabel={getString('aiSettings.clearGlossary')}
            onPress={() => setConfirmClear(true)}
            color={theme.onSurface}
            theme={theme}
          />
        ) : null}
      </Appbar>

      {terms.length === 0 ? (
        <EmptyView
          theme={theme}
          description={getString('aiSettings.glossaryEmpty')}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => String(item.id)}
          ListHeaderComponent={
            <Text style={[styles.header, { color: theme.onSurfaceVariant }]}>
              {`${novelName} · ${getString('aiSettings.glossarySpoilerNote')}`}
            </Text>
          }
          renderSectionHeader={({ section }) => (
            <List.SubHeader theme={theme}>{section.title}</List.SubHeader>
          )}
          renderItem={({ item }) => {
            const aliases = parseAliases(item.aliases);
            return (
              <List.Item
                title={item.canonical}
                description={[
                  item.note,
                  aliases.length
                    ? getString('aiSettings.glossaryAliases', {
                        aliases: aliases.join(', '),
                      })
                    : undefined,
                ]
                  .filter(Boolean)
                  .join('\n')}
                onPress={() => openEditor(item)}
                theme={theme}
              />
            );
          }}
        />
      )}

      <Dialog.Root
        visible={Boolean(editing)}
        onDismiss={() => setEditing(undefined)}
      >
        <Dialog.Header>
          <Dialog.Title>{getString('aiSettings.editTerm')}</Dialog.Title>
        </Dialog.Header>
        <Dialog.Content>
          <TextInput
            mode="outlined"
            label={getString('aiSettings.glossaryKindTerm')}
            value={editText}
            onChangeText={setEditText}
            style={styles.input}
            theme={{ colors: { background: theme.surface } }}
          />
          <TextInput
            mode="outlined"
            label={getString('aiSettings.editTerm')}
            value={editNote}
            onChangeText={setEditNote}
            multiline
            style={styles.input}
            theme={{ colors: { background: theme.surface } }}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Dialog.Action tone="danger" onPress={removeTerm}>
            {getString('aiSettings.deleteTerm')}
          </Dialog.Action>
          <Dialog.Action onPress={saveEditor}>
            {getString('common.save')}
          </Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>

      <Dialog.Root
        visible={confirmClear}
        onDismiss={() => setConfirmClear(false)}
      >
        <Dialog.Header>
          <Dialog.Title>{getString('aiSettings.clearGlossary')}</Dialog.Title>
        </Dialog.Header>
        <Dialog.Content>
          <View style={styles.input}>
            <Text style={{ color: theme.onSurface }}>
              {getString('aiSettings.clearGlossaryConfirm')}
            </Text>
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          <Dialog.Action onPress={() => setConfirmClear(false)}>
            {getString('common.cancel')}
          </Dialog.Action>
          <Dialog.Action
            tone="danger"
            onPress={async () => {
              await deleteNovelGlossary(novelId);
              setConfirmClear(false);
              reload();
            }}
          >
            {getString('aiSettings.clearGlossary')}
          </Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>
    </SafeAreaView>
  );
};

export default GlossaryScreen;

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingVertical: 12, fontSize: 12 },
  input: { marginBottom: 12 },
});
