import NativeFile from '@modules/native-file';
import { NOVEL_STORAGE } from '@utils/Storages';
import type { AICleanupSidecar } from './types';

export const getChapterFolder = (
  pluginId: string,
  novelId: number,
  chapterId: number,
) => `${NOVEL_STORAGE}/${pluginId}/${novelId}/${chapterId}`;

export const getCleanupPath = (
  pluginId: string,
  novelId: number,
  chapterId: number,
) => `${getChapterFolder(pluginId, novelId, chapterId)}/cleaned.json`;

/**
 * Reads the cleaned sidecar, or returns undefined when it is missing, corrupt,
 * or was written against different source text. Callers treat all three the
 * same way: fall back to the original.
 */
export const readCleanupSidecar = async (
  pluginId: string,
  novelId: number,
  chapterId: number,
  contentHash?: string,
): Promise<AICleanupSidecar | undefined> => {
  try {
    const raw = await NativeFile.readFile(
      getCleanupPath(pluginId, novelId, chapterId),
    );
    const sidecar = JSON.parse(raw) as AICleanupSidecar;
    if (sidecar.version !== 1 || !Array.isArray(sidecar.paragraphs)) {
      return undefined;
    }
    if (contentHash && sidecar.contentHash !== contentHash) {
      return undefined;
    }
    return { ...sidecar, reverted: sidecar.reverted ?? [] };
  } catch {
    return undefined;
  }
};

export const writeCleanupSidecar = async (
  pluginId: string,
  novelId: number,
  chapterId: number,
  sidecar: AICleanupSidecar,
): Promise<void> => {
  const folder = getChapterFolder(pluginId, novelId, chapterId);
  // The chapter may not be downloaded, in which case the folder is ours to
  // create. Chapter deletion unlinks the whole folder, so the sidecar shares
  // the download's lifecycle either way.
  await NativeFile.mkdir(folder);
  await NativeFile.writeFile(`${folder}/cleaned.json`, JSON.stringify(sidecar));
};

export const deleteCleanupSidecar = async (
  pluginId: string,
  novelId: number,
  chapterId: number,
): Promise<void> => {
  try {
    await NativeFile.unlink(getCleanupPath(pluginId, novelId, chapterId));
  } catch {
    // Nothing to delete.
  }
};

/** Marks a paragraph as one the reader always wants shown as the original. */
export const setParagraphReverted = async (
  pluginId: string,
  novelId: number,
  chapterId: number,
  paragraphIndex: number,
  reverted: boolean,
): Promise<AICleanupSidecar | undefined> => {
  const sidecar = await readCleanupSidecar(pluginId, novelId, chapterId);
  if (!sidecar) {
    return undefined;
  }
  const next = new Set(sidecar.reverted);
  if (reverted) {
    next.add(paragraphIndex);
  } else {
    next.delete(paragraphIndex);
  }
  const updated = { ...sidecar, reverted: [...next].sort((a, b) => a - b) };
  await writeCleanupSidecar(pluginId, novelId, chapterId, updated);
  return updated;
};
