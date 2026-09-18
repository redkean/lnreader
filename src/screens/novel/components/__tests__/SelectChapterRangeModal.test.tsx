import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import SelectChapterRangeModal from '../SelectChapterRangeModal';
import { NovelInfo } from '@database/types';
import { ThemeColors } from '@theme/types';

const mockUseNovelValue = jest.fn();
const mockGetPageChapterIdsInRange = jest.fn();
const mockHideModal = jest.fn();
const mockOnSelect = jest.fn();

jest.mock('../../NovelContext', () => ({
  useNovelValue: (key: string) => mockUseNovelValue(key),
}));

jest.mock('@database/queries/ChapterQueries', () => ({
  getPageChapterIdsInRange: (...args: unknown[]) =>
    mockGetPageChapterIdsInRange(...args),
}));

jest.mock('@i18n/translations', () => ({
  getString: (key: string) => key,
}));

jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: {
    supportedAbis: jest.fn().mockResolvedValue(['arm64-v8a']),
  },
}));

jest.mock('@hooks/persisted', () => ({
  useTheme: () =>
    ({
      error: '#b3261e',
      onSurface: '#111111',
      onSurfaceVariant: '#222222',
      outlineVariant: '#333333',
      primary: '#444444',
      scrim: '#000000',
      surface: '#555555',
      surfaceContainerHigh: '#666666',
    } as ThemeColors),
}));

const novel = { id: 7 } as NovelInfo;

const renderModal = () =>
  render(
    <SelectChapterRangeModal
      visible
      hideModal={mockHideModal}
      novel={novel}
      onSelect={mockOnSelect}
    />,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockUseNovelValue.mockImplementation((key: string) => {
    switch (key) {
      case 'batchInformation':
        return { totalChapters: 120 };
      case 'novelSettings':
        return { filter: ['unread'], excludedScanlators: ['scan'] };
      case 'pages':
        return ['1', '2'];
      case 'pageIndex':
        return 1;
      default:
        return undefined;
    }
  });
  mockGetPageChapterIdsInRange.mockResolvedValue([11, 12, 13]);
});

describe('SelectChapterRangeModal', () => {
  it('selects the whole novel when both bounds are left empty', async () => {
    renderModal();

    fireEvent.press(screen.getByText('novelScreen.selectRange.select'));

    await waitFor(() =>
      expect(mockGetPageChapterIdsInRange).toHaveBeenCalledWith(
        7,
        1,
        120,
        ['unread'],
        '2',
        ['scan'],
      ),
    );
    expect(mockOnSelect).toHaveBeenCalledWith([11, 12, 13]);
    expect(mockHideModal).toHaveBeenCalled();
  });

  it('passes the typed chapter numbers through unchanged', async () => {
    renderModal();

    fireEvent.changeText(screen.getByTestId('select-range-from'), '50');
    fireEvent.changeText(screen.getByTestId('select-range-to'), '80');
    fireEvent.press(screen.getByText('novelScreen.selectRange.select'));

    await waitFor(() =>
      expect(mockGetPageChapterIdsInRange).toHaveBeenCalledWith(
        7,
        50,
        80,
        ['unread'],
        '2',
        ['scan'],
      ),
    );
  });

  it('rejects a reversed range', async () => {
    renderModal();

    fireEvent.changeText(screen.getByTestId('select-range-from'), '80');
    fireEvent.changeText(screen.getByTestId('select-range-to'), '50');

    expect(
      screen.getByText('novelScreen.selectRange.error.invalidRange'),
    ).toBeTruthy();

    fireEvent.press(screen.getByText('novelScreen.selectRange.select'));

    await waitFor(() =>
      expect(mockGetPageChapterIdsInRange).not.toHaveBeenCalled(),
    );
    expect(mockOnSelect).not.toHaveBeenCalled();
  });

  it('rejects a bound past the last chapter', async () => {
    renderModal();

    fireEvent.changeText(screen.getByTestId('select-range-to'), '121');

    expect(
      screen.getByText('novelScreen.selectRange.error.invalidRange'),
    ).toBeTruthy();

    fireEvent.press(screen.getByText('novelScreen.selectRange.select'));

    await waitFor(() =>
      expect(mockGetPageChapterIdsInRange).not.toHaveBeenCalled(),
    );
  });

  it('allows any upper bound when the chapter total is unknown', async () => {
    mockUseNovelValue.mockImplementation((key: string) => {
      switch (key) {
        case 'batchInformation':
          return { totalChapters: -1 };
        case 'novelSettings':
          return { filter: undefined, excludedScanlators: undefined };
        case 'pages':
          return ['1'];
        case 'pageIndex':
          return 0;
        default:
          return undefined;
      }
    });
    renderModal();

    fireEvent.changeText(screen.getByTestId('select-range-from'), '500');
    fireEvent.press(screen.getByText('novelScreen.selectRange.select'));

    await waitFor(() =>
      expect(mockGetPageChapterIdsInRange).toHaveBeenCalledWith(
        7,
        500,
        Number.MAX_SAFE_INTEGER,
        undefined,
        '1',
        undefined,
      ),
    );
  });
});
