import * as Speech from 'expo-speech';
import type { ReactNode } from 'react';

import { fireEvent, render, screen } from '@test-utils';

import PronunciationDialog from '../PronunciationDialog';

const mockStore: Record<string, unknown> = {};
const mockPause = jest.fn();
let mockPlayerState = 'idle';

jest.mock('react-native-mmkv', () => {
  const { useState } = jest.requireActual('react');
  return {
    ...jest.requireActual('react-native-mmkv'),
    useMMKVObject: (key: string) => {
      const [value, setValue] = useState(mockStore[key]);
      return [
        value,
        (next: unknown) => {
          const resolved =
            typeof next === 'function' ? next(mockStore[key]) : next;
          mockStore[key] = resolved;
          setValue(resolved);
        },
      ];
    },
  };
});

jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
}));

jest.mock('@components/Context/TtsPlayerContext', () => ({
  useTtsPlayerContext: () => ({ pause: mockPause, state: mockPlayerState }),
}));

jest.mock('@hooks/persisted', () => ({
  useChapterReaderSettings: () => ({ tts: { rate: 1.5, pitch: 1 } }),
  useTheme: () => ({}),
}));

jest.mock('@components/AppErrorBoundary/AppErrorBoundary', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('@screens/novel/NovelContext', () => ({
  NovelContextProvider: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  const { View } = jest.requireActual('react-native');
  const frame = { height: 800, width: 400, x: 0, y: 0 };
  const insets = { bottom: 0, left: 0, right: 0, top: 0 };

  return {
    SafeAreaFrameContext: ReactModule.createContext(frame),
    SafeAreaInsetsContext: ReactModule.createContext(insets),
    SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
    SafeAreaView: ({ children, ...props }: { children: ReactNode }) =>
      ReactModule.createElement(View, props, children),
    initialWindowMetrics: { frame, insets },
    useSafeAreaFrame: () => frame,
    useSafeAreaInsets: () => insets,
  };
});

jest.mock('@i18n/translations', () => ({
  getString: (key: string) => key,
}));

const novel = { pluginId: 'plugin', path: '/novel' };
const NOVEL_KEY = 'TTS_PRONUNCIATIONS_plugin_/novel';
const GLOBAL_KEY = 'TTS_PRONUNCIATIONS';

const openDialog = (word: string) => {
  const onDismiss = jest.fn();
  render(
    <PronunciationDialog
      visible
      word={word}
      novel={novel}
      onDismiss={onDismiss}
    />,
  );
  return onDismiss;
};

describe('PronunciationDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayerState = 'idle';
    for (const key of Object.keys(mockStore)) {
      delete mockStore[key];
    }
  });

  it('saves the selected word for this novel', () => {
    const onDismiss = openDialog('  Xiao ');

    expect(screen.getByDisplayValue('Xiao')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('pronunciation-say-as'), 'Shyao');
    fireEvent.press(screen.getByText('common.save'));

    expect(mockStore[NOVEL_KEY]).toEqual({ Xiao: 'Shyao' });
    expect(onDismiss).toHaveBeenCalled();
  });

  it('saves for every novel when the novel-only box is cleared', () => {
    openDialog('Lv.');

    fireEvent.changeText(screen.getByTestId('pronunciation-say-as'), 'Level ');
    fireEvent.press(screen.getByText('readerScreen.pronunciation.novelOnly'));
    fireEvent.press(screen.getByText('common.save'));

    expect(mockStore[GLOBAL_KEY]).toEqual({ 'Lv.': 'Level' });
  });

  it('opens an existing entry and deletes it', () => {
    mockStore[GLOBAL_KEY] = { Qi: 'Chee' };
    openDialog('qi');

    expect(screen.getByDisplayValue('Qi')).toBeTruthy();
    expect(screen.getByDisplayValue('Chee')).toBeTruthy();
    fireEvent.press(screen.getByText('common.delete'));

    expect(mockStore[GLOBAL_KEY]).toEqual({});
  });

  it('renames an entry without leaving the old word behind', () => {
    mockStore[GLOBAL_KEY] = { Xiao: 'Shyao' };
    openDialog('Xiao');

    fireEvent.changeText(screen.getByDisplayValue('Xiao'), 'Xiao Yan');
    fireEvent.changeText(
      screen.getByTestId('pronunciation-say-as'),
      'Shyao Yen',
    );
    fireEvent.press(screen.getByText('readerScreen.pronunciation.novelOnly'));
    fireEvent.press(screen.getByText('common.save'));

    expect(mockStore[GLOBAL_KEY]).toEqual({});
    expect(mockStore[NOVEL_KEY]).toEqual({ 'Xiao Yan': 'Shyao Yen' });
  });

  it('refuses to save without a pronunciation', () => {
    const onDismiss = openDialog('Xiao');

    fireEvent.press(screen.getByText('common.save'));

    expect(
      screen.getByText('readerScreen.pronunciation.enterSayAs'),
    ).toBeTruthy();
    expect(mockStore[NOVEL_KEY]).toBeUndefined();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('pauses narration before previewing with the reader voice settings', () => {
    mockPlayerState = 'playing';
    openDialog('Xiao');

    fireEvent.changeText(screen.getByTestId('pronunciation-say-as'), 'Shyao');
    fireEvent.press(screen.getByText('readerScreen.pronunciation.preview'));

    expect(mockPause).toHaveBeenCalled();
    expect(Speech.speak).toHaveBeenCalledWith(
      'Shyao',
      expect.objectContaining({ rate: 1.5 }),
    );
  });
});
