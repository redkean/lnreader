/**
 * Shared utilities for custom code snippets and text manipulation.
 *
 * These were duplicated across multiple files — centralize here.
 */

/** A single code snippet entry */
export type CodeSnippet = {
  name: string;
  code: string;
  lang: 'js' | 'css';
  active: boolean;
};

/**
 * Build a concatenated CSS string from active snippets.
 */
export const composeCSS = (snippets: CodeSnippet[]): string =>
  snippets
    .filter(s => s.active)
    .map(s => s.code)
    .join('\n');

/**
 * Build a concatenated JS string from active snippets,
 * each wrapped in try/catch so one failure doesn't stop the rest.
 */
export const composeJS = (snippets: CodeSnippet[]): string =>
  snippets
    .filter(s => s.active)
    .map(
      s => `
        try {
          ${s.code}
        } catch (error) {
          alert(\`Error executing ${JSON.stringify(s.name)}:\n\` + error);
        }
        `,
    )
    .join('\n');

/**
 * Safely apply a RegExp match to a text string.
 *
 * The match is expected to have been produced by /^\/(.*)\/([gmiyuvsd]*)$/.
 * Returns the original text when the pattern is invalid or the match fails.
 */
export const safeApplyRegex = (
  match: RegExpMatchArray,
  text: string,
  replacement: string = '',
): string => {
  const validFlags = new Set(['g', 'm', 'i', 'y', 'u', 'v', 's', 'd']);
  const flags = match[2] ?? '';
  const hasInvalidFlags = [...flags].some(f => !validFlags.has(f));
  if (hasInvalidFlags) {
    /* eslint-disable-next-line no-console */
    console.warn('Invalid regex flags:', match[0]);
    return text;
  }
  try {
    const r = new RegExp(match[1], flags);
    return text.replace(r, replacement);
  } catch {
    /* eslint-disable-next-line no-console */
    console.warn('Invalid regex pattern:', match[0]);
  }
  return text;
};

/**
 * Test whether `input` looks like a `/pattern/flags` regex string.
 */
const isRegexString = (input: string): RegExpMatchArray | null =>
  input.match(/^\/(.*)\/([gmiyuvsd]*)$/);

/**
 * Apply the `/pattern/flags` remove-text and replace-text entries to `html`.
 *
 * Literal entries are deliberately left alone here. A literal rule is text the
 * reader selected off the page, so it holds rendered text - no tags, entities
 * already decoded, whitespace collapsed - and matching it against markup misses
 * whenever the two differ, which is most chapters: bionic reading wraps the
 * first half of every word in `<b>`, AI cleanup wraps its edits in `<mark>`,
 * and the source indents its paragraphs across newlines. Those rules are
 * applied inside the reader instead, against the text itself, by
 * `assets/reader/js/textRules.js`.
 */
export const applyTextModifications = (
  html: string,
  removeText: string[],
  replaceText: Record<string, string>,
): string => {
  let result = html;

  for (const text of removeText) {
    const m = isRegexString(text);
    if (m) {
      result = safeApplyRegex(m, result);
    }
  }

  for (const [text, replacement] of Object.entries(replaceText)) {
    if (!text) continue;
    const m = isRegexString(text);
    if (m) {
      result = safeApplyRegex(m, result, replacement);
    }
  }

  return result;
};
