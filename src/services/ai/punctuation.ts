/**
 * Typographic characters a model likes to "improve" into: curly quotes, en/em
 * dashes and a single-glyph ellipsis. Folding them back to their plain
 * equivalents lets a paragraph be compared for real changes rather than for
 * restyling.
 */
const FOLDED: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '‛': "'",
  '′': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '‟': '"',
  '″': '"',
  '–': '-',
  '—': '-',
  '―': '-',
  '…': '...',
};

const FOLDABLE = new RegExp(`[${Object.keys(FOLDED).join('')}]`, 'g');

/** Same text with every typographic variant reduced to its plain form. */
export const foldPunctuation = (value: string): string =>
  value.replace(FOLDABLE, match => FOLDED[match]);

/**
 * The cleanup pass is for broken prose, not for typesetting. A model that
 * swaps the chapter's straight quotes for curly ones - or its hyphens for em
 * dashes - changes every line of dialogue and buries the fixes the reader
 * asked for, so that restyling is undone here:
 *
 * - a paragraph whose only change is punctuation style keeps the original;
 * - a paragraph with real fixes keeps them, but any typographic character the
 *   original never used is folded back to the plain form the chapter writes.
 */
export const preservePunctuationStyle = (
  original: string,
  cleaned: string,
): string => {
  if (original === cleaned) {
    return cleaned;
  }
  if (foldPunctuation(original) === foldPunctuation(cleaned)) {
    return original;
  }
  return cleaned.replace(FOLDABLE, match =>
    original.includes(match) ? match : FOLDED[match],
  );
};
