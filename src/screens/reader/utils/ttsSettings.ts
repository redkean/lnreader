import type { TtsSettings } from '@modules/nitro-tts';
import type { ChapterReaderSettings } from '@hooks/persisted/useSettings';

export const toNativeTtsSettings = (
  settings: ChapterReaderSettings['tts'],
): TtsSettings => ({
  engineName: settings?.engine?.name,
  voiceIdentifier: settings?.voice?.identifier,
  rate: settings?.rate ?? 1,
  pitch: settings?.pitch ?? 1,
});
