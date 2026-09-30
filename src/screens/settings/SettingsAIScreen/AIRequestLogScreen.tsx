import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import dayjs from 'dayjs';
import { useMMKVObject } from 'react-native-mmkv';

import {
  Appbar,
  ConfirmationDialog,
  EmptyView,
  IconButtonV2,
  SafeAreaView,
} from '@components';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import type { AIRequestLogScreenProps } from '@navigators/types';
// Imported from the modules rather than the service barrel, which pulls in
// the chapter sanitiser and the database layer a log viewer has no use for.
import { formatTokenCount } from '@services/ai/cost';
import {
  AI_REQUEST_LOG_KEY,
  clearAIRequestLog,
  type AIRequestLogEntry,
} from '@services/ai/requestLog';
import type { AIRequestKind } from '@services/ai/types';
import { showToast } from '@utils/showToast';

const KIND_LABELS: Record<AIRequestKind, 'aiSettings.requestKindCleanup'> = {
  cleanup: 'aiSettings.requestKindCleanup',
  summary: 'aiSettings.requestKindSummary' as 'aiSettings.requestKindCleanup',
  recap: 'aiSettings.requestKindRecap' as 'aiSettings.requestKindCleanup',
  test: 'aiSettings.requestKindTest' as 'aiSettings.requestKindCleanup',
};

const formatDuration = (durationMs: number) =>
  durationMs < 1000
    ? `${durationMs} ms`
    : `${(durationMs / 1000).toFixed(1)} s`;

const describeEntry = (entry: AIRequestLogEntry) =>
  [
    `${getString(KIND_LABELS[entry.kind])}${
      entry.chapterName ? ` · ${entry.chapterName}` : ''
    }`,
    entry.novelName,
    `${dayjs(entry.startedAt).format('LLL')} · ${entry.provider} · ${
      entry.model
    }`,
    entry.error,
  ]
    .filter(Boolean)
    .join('\n');

const AIRequestLogScreen = ({ navigation }: AIRequestLogScreenProps) => {
  const theme = useTheme();
  const [log] = useMMKVObject<AIRequestLogEntry[]>(AI_REQUEST_LOG_KEY);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const entries = useMemo(
    () =>
      errorsOnly
        ? (log ?? []).filter(entry => entry.status === 'error')
        : log ?? [],
    [errorsOnly, log],
  );

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('aiSettings.requestLog')}
        handleGoBack={navigation.goBack}
        theme={theme}
      >
        {log?.length ? (
          <>
            <IconButtonV2
              name={errorsOnly ? 'filter' : 'filter-outline'}
              accessibilityLabel={getString(
                errorsOnly
                  ? 'aiSettings.requestLogShowAll'
                  : 'aiSettings.requestLogErrorsOnly',
              )}
              onPress={() => setErrorsOnly(value => !value)}
              color={errorsOnly ? theme.primary : theme.onSurface}
              theme={theme}
            />
            <IconButtonV2
              name="delete-sweep-outline"
              accessibilityLabel={getString('aiSettings.requestLogClear')}
              onPress={() => setConfirmClear(true)}
              color={theme.onSurface}
              theme={theme}
            />
          </>
        ) : null}
      </Appbar>

      <FlatList
        contentContainerStyle={styles.list}
        data={entries}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const failed = item.status === 'error';
          return (
            <View style={styles.entry}>
              <View style={styles.row}>
                <View style={styles.details}>
                  <Text style={{ color: theme.onSurface }}>
                    {`${getString(KIND_LABELS[item.kind])}${
                      item.chapterName ? ` · ${item.chapterName}` : ''
                    }`}
                  </Text>
                  {item.novelName ? (
                    <Text style={{ color: theme.onSurfaceVariant }}>
                      {item.novelName}
                    </Text>
                  ) : null}
                  <Text
                    style={[styles.meta, { color: theme.onSurfaceVariant }]}
                  >
                    {[
                      dayjs(item.startedAt).format('LLL'),
                      item.model,
                      formatDuration(item.durationMs),
                      item.usage
                        ? getString('aiSettings.requestTokens', {
                            input: formatTokenCount(item.usage.inputTokens),
                            output: formatTokenCount(item.usage.outputTokens),
                          })
                        : undefined,
                      item.attempts > 1
                        ? getString('aiSettings.requestAttempts', {
                            count: item.attempts,
                          })
                        : undefined,
                      item.status === 'cancelled'
                        ? getString('aiSettings.requestCancelled')
                        : undefined,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {failed ? (
                  <IconButtonV2
                    name="content-copy"
                    accessibilityLabel={`${getString('aiSettings.copyError')} ${
                      item.chapterName ?? ''
                    }`.trim()}
                    onPress={() =>
                      Clipboard.setStringAsync(describeEntry(item)).then(() =>
                        showToast(
                          getString('common.copiedToClipboard', { name: '' }),
                        ),
                      )
                    }
                    theme={theme}
                  />
                ) : null}
              </View>
              {failed ? (
                <Text selectable style={[styles.error, { color: theme.error }]}>
                  {item.error}
                </Text>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyView
            description={getString(
              log?.length
                ? 'aiSettings.requestLogNoErrors'
                : 'aiSettings.requestLogEmpty',
            )}
            theme={theme}
          />
        }
      />

      <ConfirmationDialog
        title={getString('aiSettings.requestLogClear')}
        message={getString('aiSettings.requestLogClearConfirm')}
        visible={confirmClear}
        confirmLabel={getString('common.clear')}
        onDismiss={() => setConfirmClear(false)}
        onConfirm={clearAIRequestLog}
      />
    </SafeAreaView>
  );
};

export default AIRequestLogScreen;

const styles = StyleSheet.create({
  list: { flexGrow: 1, paddingBottom: 40 },
  entry: { paddingHorizontal: 16, paddingVertical: 12 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  details: { flex: 1 },
  meta: { fontSize: 12, marginTop: 2 },
  error: { marginTop: 8 },
});
