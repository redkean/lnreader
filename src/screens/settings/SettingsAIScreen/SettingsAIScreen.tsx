import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';

import { Appbar, Button, List, SafeAreaView } from '@components';
import { useTheme } from '@hooks/persisted';
import { useAISettings } from '@hooks/persisted/useAISettings';
import { getString } from '@i18n/translations';
import { showToast } from '@utils/showToast';
import {
  AI_PROVIDER_LIST,
  getAIProvider,
  requestAI,
  type AIProviderId,
} from '@services/ai';
import type { SettingsStackParamList } from '@navigators/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import SettingSwitch from '../components/SettingSwitch';
import NumberSettingModal from './NumberSettingModal';

type AISettingsProps = NativeStackScreenProps<
  SettingsStackParamList,
  'AISettings'
>;

type NumberSetting = {
  key:
    | 'maxChaptersPerJob'
    | 'concurrency'
    | 'paragraphsPerBatch'
    | 'recapChapterCount';
  label: string;
  min: number;
  max: number;
};

const NUMBER_SETTINGS: NumberSetting[] = [
  {
    key: 'maxChaptersPerJob',
    label: 'aiSettings.maxChaptersPerJob',
    min: 1,
    max: 500,
  },
  { key: 'concurrency', label: 'aiSettings.concurrency', min: 1, max: 6 },
  {
    key: 'paragraphsPerBatch',
    label: 'aiSettings.paragraphsPerBatch',
    min: 1,
    max: 40,
  },
  {
    key: 'recapChapterCount',
    label: 'aiSettings.recapChapterCount',
    min: 1,
    max: 30,
  },
];

const AISettings = ({ navigation }: AISettingsProps) => {
  const theme = useTheme();
  const settings = useAISettings();
  const { setAISettings } = settings;
  const [testing, setTesting] = useState(false);
  const [numberSetting, setNumberSetting] = useState<NumberSetting>();

  const provider = getAIProvider(settings.provider);

  const selectProvider = useCallback(
    (id: AIProviderId) => {
      const next = getAIProvider(id);
      setAISettings({
        provider: id,
        // The model belongs to the provider, so carrying it across would send
        // an unknown model name to a different API.
        model: next.defaultModel,
        baseUrl: '',
      });
    },
    [setAISettings],
  );

  const testConnection = useCallback(async () => {
    setTesting(true);
    try {
      await requestAI({
        messages: [{ role: 'user', content: 'Reply with the word: ok' }],
        maxOutputTokens: 16,
      });
      showToast(getString('aiSettings.testSuccess', { model: settings.model }));
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  }, [settings.model]);

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('aiSettings.title')}
        handleGoBack={navigation.goBack}
        theme={theme}
      />
      <ScrollView contentContainerStyle={styles.paddingBottom}>
        <List.Section>
          <SettingSwitch
            label={getString('aiSettings.enable')}
            description={getString('aiSettings.enableDescription')}
            value={settings.enabled}
            onPress={() => setAISettings({ enabled: !settings.enabled })}
            theme={theme}
          />
          <View style={styles.notice}>
            <Text style={{ color: theme.onSurfaceVariant }}>
              {getString('aiSettings.privacyWarning')}
            </Text>
          </View>

          <List.SubHeader theme={theme}>
            {getString('aiSettings.provider')}
          </List.SubHeader>
          <View style={styles.providerRow}>
            {AI_PROVIDER_LIST.map(entry => (
              <Button
                key={entry.id}
                title={entry.label}
                mode={settings.provider === entry.id ? 'contained' : 'outlined'}
                onPress={() => selectProvider(entry.id)}
              />
            ))}
          </View>

          <View style={styles.field}>
            <TextInput
              mode="outlined"
              label={getString('aiSettings.apiKey')}
              value={settings.apiKey}
              onChangeText={apiKey => setAISettings({ apiKey })}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              theme={{ colors: { background: theme.surface } }}
            />
            <Text style={[styles.hint, { color: theme.onSurfaceVariant }]}>
              {getString('aiSettings.apiKeyDescription')}
            </Text>
          </View>

          <View style={styles.field}>
            <TextInput
              mode="outlined"
              label={getString('aiSettings.model')}
              value={settings.model}
              placeholder={provider.defaultModel}
              onChangeText={model => setAISettings({ model })}
              autoCapitalize="none"
              autoCorrect={false}
              theme={{ colors: { background: theme.surface } }}
            />
          </View>

          <View style={styles.field}>
            <TextInput
              mode="outlined"
              label={getString('aiSettings.baseUrl')}
              value={settings.baseUrl}
              placeholder={provider.defaultBaseUrl}
              onChangeText={baseUrl => setAISettings({ baseUrl })}
              autoCapitalize="none"
              autoCorrect={false}
              theme={{ colors: { background: theme.surface } }}
            />
            <Text style={[styles.hint, { color: theme.onSurfaceVariant }]}>
              {getString('aiSettings.baseUrlDescription')}
            </Text>
          </View>

          <View style={styles.field}>
            <Button
              title={getString('aiSettings.testConnection')}
              mode="contained"
              disabled={!settings.enabled || testing}
              onPress={testConnection}
            />
          </View>

          <List.SubHeader theme={theme}>
            {getString('aiSettings.features')}
          </List.SubHeader>
          <SettingSwitch
            label={getString('aiSettings.cleanup')}
            description={getString('aiSettings.cleanupDescription')}
            value={settings.cleanupEnabled}
            onPress={() =>
              setAISettings({ cleanupEnabled: !settings.cleanupEnabled })
            }
            theme={theme}
          />
          <SettingSwitch
            label={getString('aiSettings.summary')}
            description={getString('aiSettings.summaryDescription')}
            value={settings.summaryEnabled}
            onPress={() =>
              setAISettings({ summaryEnabled: !settings.summaryEnabled })
            }
            theme={theme}
          />
          <SettingSwitch
            label={getString('aiSettings.glossary')}
            description={getString('aiSettings.glossaryDescription')}
            value={settings.glossaryEnabled}
            onPress={() =>
              setAISettings({ glossaryEnabled: !settings.glossaryEnabled })
            }
            theme={theme}
          />

          <List.SubHeader theme={theme}>
            {getString('aiSettings.automation')}
          </List.SubHeader>
          <SettingSwitch
            label={getString('aiSettings.runOnDownload')}
            description={getString('aiSettings.runOnDownloadDescription')}
            value={settings.runOnDownload}
            onPress={() =>
              setAISettings({ runOnDownload: !settings.runOnDownload })
            }
            theme={theme}
          />
          <SettingSwitch
            label={getString('aiSettings.prefetchNextChapter')}
            value={settings.prefetchNextChapter}
            onPress={() =>
              setAISettings({
                prefetchNextChapter: !settings.prefetchNextChapter,
              })
            }
            theme={theme}
          />

          <List.SubHeader theme={theme}>
            {getString('aiSettings.reader')}
          </List.SubHeader>
          <SettingSwitch
            label={getString('aiSettings.preferCleaned')}
            value={settings.preferCleaned}
            onPress={() =>
              setAISettings({ preferCleaned: !settings.preferCleaned })
            }
            theme={theme}
          />
          <SettingSwitch
            label={getString('aiSettings.showEdits')}
            value={settings.showEdits}
            onPress={() => setAISettings({ showEdits: !settings.showEdits })}
            theme={theme}
          />

          <List.SubHeader theme={theme}>
            {getString('aiSettings.limits')}
          </List.SubHeader>
          {NUMBER_SETTINGS.map(setting => (
            <List.Item
              key={setting.key}
              title={getString(setting.label as 'aiSettings.concurrency')}
              description={String(settings[setting.key])}
              onPress={() => setNumberSetting(setting)}
              theme={theme}
            />
          ))}
        </List.Section>
      </ScrollView>

      {numberSetting ? (
        <NumberSettingModal
          visible
          title={getString(numberSetting.label as 'aiSettings.concurrency')}
          value={settings[numberSetting.key]}
          min={numberSetting.min}
          max={numberSetting.max}
          theme={theme}
          onDismiss={() => setNumberSetting(undefined)}
          onSave={value => {
            setAISettings({ [numberSetting.key]: value });
            setNumberSetting(undefined);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
};

export default AISettings;

const styles = StyleSheet.create({
  paddingBottom: { paddingBottom: 40 },
  notice: { paddingHorizontal: 16, paddingVertical: 8 },
  providerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
  },
  field: { paddingHorizontal: 16, paddingTop: 12 },
  hint: { fontSize: 12, paddingTop: 4 },
});
