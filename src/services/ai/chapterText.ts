import NativeFile from '@modules/native-file';
import { fetchChapter } from '@services/plugin/fetch';
import { sanitizeChapterText } from '@screens/reader/utils/sanitizeChapterText';
import { NOVEL_STORAGE } from '@utils/Storages';
import type { ChapterInfo, NovelInfo } from '@database/types';

/**
 * Render-ready chapter HTML for work that runs outside the reader. Mirrors the
 * reader's own load path - downloaded file first, plugin second, sanitised
 * either way - so a chapter hashes and cleans to the same text whether it was
 * processed in a background job or on screen.
 */
export const loadChapterHtmlForAI = async (
  novel: Pick<NovelInfo, 'pluginId' | 'name'>,
  chapter: Pick<ChapterInfo, 'id' | 'novelId' | 'name' | 'path'>,
): Promise<string> => {
  const filePath = `${NOVEL_STORAGE}/${novel.pluginId}/${chapter.novelId}/${chapter.id}/index.html`;
  let text: string;
  try {
    text = await NativeFile.readFile(filePath);
  } catch {
    text = await fetchChapter(novel.pluginId, chapter.path);
  }

  return sanitizeChapterText(novel.pluginId, novel.name, chapter.name, text);
};
