import { useCallback } from 'react';
import { useMMKVObject } from 'react-native-mmkv';

import {
  mergePronunciations,
  type PronunciationMap,
} from '@screens/reader/utils/pronunciations';
import { getMMKVObject } from '@utils/mmkv/mmkv';

export const TTS_PRONUNCIATIONS = 'TTS_PRONUNCIATIONS';

/** Identifies a novel the same way its other per-novel MMKV keys do. */
export interface PronunciationNovel {
  pluginId: string;
  path: string;
}

export type PronunciationScope = 'novel' | 'global';

export const novelPronunciationsKey = (novel: PronunciationNovel): string =>
  `${TTS_PRONUNCIATIONS}_${novel.pluginId}_${novel.path}`;

/** Everything playback should apply for `novel`, its own entries winning. */
export const getPronunciations = (
  novel?: PronunciationNovel,
): PronunciationMap =>
  mergePronunciations(
    getMMKVObject<PronunciationMap>(TTS_PRONUNCIATIONS),
    novel
      ? getMMKVObject<PronunciationMap>(novelPronunciationsKey(novel))
      : undefined,
  );

const EMPTY: PronunciationMap = {};

/** Drops any entry for `word`, whatever its case. */
const without = (map: PronunciationMap, word: string): PronunciationMap => {
  const lower = word.toLowerCase();
  return Object.fromEntries(
    Object.entries(map).filter(([key]) => key.toLowerCase() !== lower),
  );
};

export const usePronunciations = (novel: PronunciationNovel) => {
  const [global = EMPTY, setGlobal] =
    useMMKVObject<PronunciationMap>(TTS_PRONUNCIATIONS);
  const [novelMap = EMPTY, setNovelMap] = useMMKVObject<PronunciationMap>(
    novelPronunciationsKey(novel),
  );

  // Updaters read the stored map rather than this render's copy, so a rename
  // (a remove then a set in one handler) does not resurrect the old word.
  const setEntry = useCallback(
    (word: string, sayAs: string, scope: PronunciationScope) => {
      const key = word.replace(/\s+/g, ' ').trim();
      if (!key) {
        return;
      }
      const add = (map: PronunciationMap = EMPTY) => ({
        ...without(map, key),
        [key]: sayAs,
      });
      const drop = (map: PronunciationMap = EMPTY) => without(map, key);
      // An entry lives in exactly one scope; saving it to one moves it out of
      // the other.
      if (scope === 'novel') {
        setNovelMap(add);
        setGlobal(drop);
      } else {
        setGlobal(add);
        setNovelMap(drop);
      }
    },
    [setGlobal, setNovelMap],
  );

  const removeEntry = useCallback(
    (word: string, scope: PronunciationScope) => {
      const drop = (map: PronunciationMap = EMPTY) => without(map, word);
      if (scope === 'novel') {
        setNovelMap(drop);
      } else {
        setGlobal(drop);
      }
    },
    [setGlobal, setNovelMap],
  );

  return { global, novel: novelMap, setEntry, removeEntry };
};
