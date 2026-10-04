/**
 * Spoken-only rewrites: a word as the page shows it, mapped to how the speech
 * engine should say it. Unlike the reader's replace rules these never touch
 * the page, so a name can be respelled for the engine ("Xiao" -> "Shyao")
 * while the reader still shows it as written.
 */
export type PronunciationMap = Record<string, string>;

/**
 * Letters and digits that continue a word. Characters outside it - spaces,
 * punctuation, and caseless scripts such as CJK, which do not separate words
 * with spaces at all - count as a boundary.
 */
const WORD_CHAR =
  '0-9A-Za-z\\u00aa\\u00b5\\u00ba\\u00c0-\\u00d6\\u00d8-\\u00f6\\u00f8-\\u02af\\u0370-\\u03ff\\u0400-\\u052f\\u0300-\\u036f\\u1e00-\\u1eff';
const STARTS_WORD = new RegExp(`^[${WORD_CHAR}]`);
const ENDS_WORD = new RegExp(`[${WORD_CHAR}]$`);

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeWord = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

/** Global entries first, then the novel's own, which win on a clash. */
export const mergePronunciations = (
  ...maps: (PronunciationMap | undefined)[]
): PronunciationMap => {
  const merged: PronunciationMap = {};
  for (const map of maps) {
    for (const [word, sayAs] of Object.entries(map ?? {})) {
      const key = normalizeWord(word);
      if (key && typeof sayAs === 'string') {
        // Case-insensitive matching means "xiao" and "Xiao" are one entry.
        for (const existing of Object.keys(merged)) {
          if (existing.toLowerCase() === key.toLowerCase()) {
            delete merged[existing];
          }
        }
        merged[key] = sayAs;
      }
    }
  }
  return merged;
};

export type PronunciationMatcher = (text: string) => string;

const identity: PronunciationMatcher = text => text;

/**
 * Compiles the entries into one pass over the text. Matching is
 * case-insensitive and whole-word: "Qi" does not touch "Qing". The longest
 * entry wins where two overlap, so "Xiao Yan" is spoken as its own entry
 * rather than as "Xiao" followed by "Yan". Replacements are not re-scanned, so
 * an entry can never feed another.
 */
export const compilePronunciations = (
  map: PronunciationMap,
): PronunciationMatcher => {
  const entries = Object.entries(map)
    .map(([word, sayAs]) => [normalizeWord(word), sayAs] as const)
    .filter(([word]) => word.length > 0)
    .sort(([a], [b]) => b.length - a.length);
  if (entries.length === 0) {
    return identity;
  }

  const lookup = new Map(
    entries.map(([word, sayAs]) => [word.toUpperCase(), sayAs]),
  );
  const alternatives = entries.map(([word]) => {
    // A boundary is only required on a side where the entry itself ends in a
    // letter: "-san" must still match in "Tanaka-san", and "Lv." in "Lv.99".
    const before = STARTS_WORD.test(word) ? `(?<![${WORD_CHAR}])` : '';
    const after = ENDS_WORD.test(word) ? `(?![${WORD_CHAR}])` : '';
    // The page wraps text however it likes, so any run of whitespace matches
    // the single space an entry is stored with.
    const body = word.split(' ').map(escapeRegExp).join('\\s+');
    return `${before}${body}${after}`;
  });
  const pattern = new RegExp(alternatives.join('|'), 'gi');

  return text =>
    text.replace(pattern, (match: string, offset: number) => {
      const sayAs = lookup.get(normalizeWord(match).toUpperCase());
      if (sayAs === undefined) {
        return match;
      }
      // An entry that ends in punctuation sits flush against its neighbour
      // ("Lv.99"); a respelling ending in a letter would fuse with it
      // ("Level99"), so it gets the space the reader never had to type.
      const before = text[offset - 1] ?? '';
      const after = text[offset + match.length] ?? '';
      const lead = ENDS_WORD.test(before) && STARTS_WORD.test(sayAs) ? ' ' : '';
      const trail = STARTS_WORD.test(after) && ENDS_WORD.test(sayAs) ? ' ' : '';
      return `${lead}${sayAs}${trail}`;
    });
};

export const applyPronunciations = (
  text: string,
  map: PronunciationMap,
): string => compilePronunciations(map)(text);
