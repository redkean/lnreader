import type { AIDiffOp } from './types';

/** Words and the whitespace between them, so offsets stay exact. */
const tokenize = (value: string): string[] =>
  value.length === 0 ? [] : value.split(/(\s+)/).filter(token => token !== '');

/**
 * Longest common subsequence over tokens. Paragraphs are a few hundred tokens
 * at most, so the quadratic table is cheaper than pulling in a diff library.
 */
const lcsTable = (a: string[], b: string[]) => {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
};

const isWhitespace = (value: string) => value.trim().length === 0;

/**
 * Word-level diff of a cleaned paragraph against its original, expressed in
 * offsets into the *cleaned* text so the reader can highlight the result
 * without re-diffing. Whitespace-only differences are dropped: they are
 * invisible to the reader and would otherwise mark every reflowed paragraph.
 */
export const diffParagraph = (
  original: string,
  cleaned: string,
): AIDiffOp[] => {
  if (original === cleaned) {
    return [];
  }

  const a = tokenize(original);
  const b = tokenize(cleaned);
  const table = lcsTable(a, b);

  const ops: AIDiffOp[] = [];
  let position = 0;
  let i = 0;
  let j = 0;

  /** Accumulates a run of edits so one rewritten phrase is one highlight. */
  let pending: AIDiffOp | undefined;
  const flush = () => {
    if (pending) {
      const changed =
        !isWhitespace(cleaned.substr(pending.start, pending.length)) ||
        !isWhitespace(pending.original);
      if (changed) {
        ops.push(pending);
      }
      pending = undefined;
    }
  };
  const extend = (insertedLength: number, removed: string) => {
    if (!pending) {
      pending = { start: position, length: 0, original: '' };
    }
    pending.length += insertedLength;
    pending.original += removed;
  };

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      flush();
      position += b[j].length;
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      extend(0, a[i]);
      i++;
    } else {
      extend(b[j].length, '');
      position += b[j].length;
      j++;
    }
  }
  while (i < a.length) {
    extend(0, a[i]);
    i++;
  }
  while (j < b.length) {
    extend(b[j].length, '');
    position += b[j].length;
    j++;
  }
  flush();

  return ops;
};
