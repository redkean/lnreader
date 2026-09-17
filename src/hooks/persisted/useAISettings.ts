import { useMMKVObject } from 'react-native-mmkv';
import { getMMKVObject } from '@utils/mmkv/mmkv';
import type { AIProviderId } from '@services/ai/types';

export const AI_SETTINGS = 'AI_SETTINGS';

export interface AISettings {
  /** Master switch. Nothing contacts a provider while this is false. */
  enabled: boolean;
  provider: AIProviderId;
  apiKey: string;
  model: string;
  /** Base URL override, required for the `custom` provider. */
  baseUrl: string;

  /** Rewrite machine-translated prose when a chapter is opened or downloaded. */
  cleanupEnabled: boolean;
  /** Summarise chapters, which also feeds the recap and the glossary. */
  summaryEnabled: boolean;
  /** Collect characters, places and terms while summarising. */
  glossaryEnabled: boolean;

  /** Run the enabled passes as part of the chapter download job. */
  runOnDownload: boolean;
  /** Queue the next chapter's passes while the current one is being read. */
  prefetchNextChapter: boolean;

  /** Show cleaned text instead of the original when a chapter has both. */
  preferCleaned: boolean;
  /** Highlight what cleanup changed while cleaned text is shown. */
  showEdits: boolean;

  /** Upper bound on a single range job, so a mistap cannot spend unbounded. */
  maxChaptersPerJob: number;
  /** Parallel provider requests. Above ~3 most providers start rate limiting. */
  concurrency: number;
  /** Paragraphs sent per cleanup request. */
  paragraphsPerBatch: number;
  /** Chapters folded into a recap. */
  recapChapterCount: number;
}

export const initialAISettings: AISettings = {
  enabled: false,
  provider: 'openai',
  apiKey: '',
  model: '',
  baseUrl: '',

  cleanupEnabled: false,
  summaryEnabled: true,
  glossaryEnabled: true,

  runOnDownload: false,
  prefetchNextChapter: true,

  preferCleaned: true,
  showEdits: true,

  maxChaptersPerJob: 50,
  concurrency: 2,
  paragraphsPerBatch: 12,
  recapChapterCount: 5,
};

/**
 * Reads the settings without subscribing. Background tasks and the download
 * service run outside React, so they cannot use the hook.
 */
export const getAISettings = (): AISettings => ({
  ...initialAISettings,
  ...getMMKVObject<AISettings>(AI_SETTINGS),
});

/** Whether a provider call can be made at all. */
export const isAIConfigured = (settings: AISettings = getAISettings()) =>
  settings.enabled &&
  settings.model.trim().length > 0 &&
  (settings.apiKey.trim().length > 0 || settings.provider === 'custom');

export const useAISettings = () => {
  const [aiSettings = initialAISettings, setSettings] =
    useMMKVObject<AISettings>(AI_SETTINGS);

  const setAISettings = (values: Partial<AISettings>) =>
    setSettings({ ...initialAISettings, ...aiSettings, ...values });

  return {
    ...initialAISettings,
    ...aiSettings,
    setAISettings,
  };
};
