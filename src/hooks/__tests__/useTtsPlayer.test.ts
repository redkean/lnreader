import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ChapterInfo, NovelInfo } from '@database/types';
import {
  getNextChapter,
  markChapterRead,
} from '@database/queries/ChapterQueries';
import { insertHistory } from '@database/queries/HistoryQueries';
import { novelPersistence } from '@hooks/persisted/useNovel/store-helper/persistence';
import { Tts, TtsPlaybackState } from '@modules/nitro-tts';
import { useTtsPlayer } from '@hooks/useTtsPlayer';

const mockLibrarySettings = { incognitoMode: false };
const mockStateListeners: ((state: TtsPlaybackState) => void)[] = [];

jest.mock('@hooks/persisted', () => ({
  useChapterReaderSettings: () => ({ tts: {} }),
  useLibrarySettings: () => mockLibrarySettings,
}));

jest.mock('@database/queries/ChapterQueries', () => ({
  getNextChapter: jest.fn().mockResolvedValue(undefined),
  getPrevChapter: jest.fn().mockResolvedValue(undefined),
  markChapterRead: jest.fn().mockResolvedValue(undefined),
  updateChapterProgress: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@database/queries/HistoryQueries', () => ({
  insertHistory: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@hooks/persisted/useNovel/store-helper/persistence', () => ({
  novelPersistence: { writeLastRead: jest.fn() },
}));

jest.mock('@hooks/persisted/useAISettings', () => ({
  getAISettings: () => ({ enabled: false, preferCleaned: false }),
}));

jest.mock('@services/ai', () => ({
  hashChapterText: jest.fn(() => 'hash'),
  readCleanupSidecar: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@services/plugin/fetch', () => ({
  fetchChapter: jest.fn().mockResolvedValue('<p>chapter</p>'),
}));

jest.mock('@screens/reader/utils/sanitizeChapterText', () => ({
  sanitizeChapterText: jest.fn((_p, _n, _c, text: string) => text),
}));

jest.mock('@screens/reader/utils/ttsParagraphs', () => ({
  extractTtsParagraphs: jest.fn(() => ['first', 'second']),
}));

jest.mock('@screens/reader/utils/ttsSettings', () => ({
  toNativeTtsSettings: jest.fn(() => ({})),
}));

jest.mock('@utils/runWhenIdle', () => ({
  runWhenIdle: (task: () => void) => {
    task();
    return () => {};
  },
}));

jest.mock('@modules/nitro-tts', () => ({
  Tts: { createSession: jest.fn() },
}));

const novel = {
  id: 1,
  pluginId: 'plugin',
  path: '/novel',
  name: 'Novel',
  cover: '',
} as NovelInfo;

const chapterAt = (id: number, position: number) =>
  ({
    id,
    novelId: 1,
    name: `Chapter ${position}`,
    path: `/chapter/${id}`,
    position,
    page: '',
  } as ChapterInfo);

const chapter500 = chapterAt(500, 500);
const chapter501 = chapterAt(501, 501);

const createSession = () => ({
  addOnStateChangedListener: jest.fn((listener: () => void) => {
    mockStateListeners.push(listener);
    return { remove: jest.fn() };
  }),
  addOnProgressChangedListener: jest.fn(() => ({ remove: jest.fn() })),
  addOnErrorListener: jest.fn(() => ({ remove: jest.fn() })),
  load: jest.fn().mockResolvedValue(undefined),
  play: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
});

describe('useTtsPlayer persistence', () => {
  beforeEach(() => {
    // The `rn` project config does not inherit the root `clearMocks` option.
    jest.clearAllMocks();
    mockLibrarySettings.incognitoMode = false;
    mockStateListeners.length = 0;
    (Tts.createSession as jest.Mock).mockResolvedValue(createSession());
  });

  it('records history and last read for the chapter it starts speaking', async () => {
    const { result } = renderHook(() => useTtsPlayer());

    await act(async () => {
      await result.current.playChapter(novel, chapter500);
    });

    expect(insertHistory).toHaveBeenCalledWith(500);
    expect(novelPersistence.writeLastRead).toHaveBeenCalledWith(
      { pluginId: 'plugin', novelPath: '/novel' },
      chapter500,
    );
  });

  it('moves history and last read onto the next chapter at a boundary', async () => {
    (getNextChapter as jest.Mock).mockResolvedValue(chapter501);
    const { result } = renderHook(() => useTtsPlayer());

    await act(async () => {
      await result.current.playChapter(novel, chapter500);
    });

    await act(async () => {
      mockStateListeners.forEach(listener => listener('completed'));
    });

    await waitFor(() => expect(insertHistory).toHaveBeenCalledWith(501));
    expect(markChapterRead).toHaveBeenCalledWith(500);
    expect(novelPersistence.writeLastRead).toHaveBeenLastCalledWith(
      { pluginId: 'plugin', novelPath: '/novel' },
      chapter501,
    );
  });

  it('writes nothing in incognito mode', async () => {
    mockLibrarySettings.incognitoMode = true;
    (getNextChapter as jest.Mock).mockResolvedValue(chapter501);
    const { result } = renderHook(() => useTtsPlayer());

    await act(async () => {
      await result.current.playChapter(novel, chapter500);
    });

    await act(async () => {
      mockStateListeners.forEach(listener => listener('completed'));
    });

    await waitFor(() => expect(getNextChapter).toHaveBeenCalled());
    expect(insertHistory).not.toHaveBeenCalled();
    expect(novelPersistence.writeLastRead).not.toHaveBeenCalled();
    expect(markChapterRead).not.toHaveBeenCalled();
  });
});
