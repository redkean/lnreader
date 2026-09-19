/**
 * The reader's remove/replace rules, applied where there is no DOM to apply
 * them to.
 *
 * `assets/reader/js/textRules.js` does this on screen, over the chapter's live
 * markup. Playback cannot: the WebView stops being laid out once the screen
 * turns off, so the speech queue is parsed from the chapter's HTML instead, and
 * the rules have to be applied to the text that comes out of it. Both sides
 * normalise a rule the same way - `textRules.test.ts` holds them to it - so a
 * rule that hides a translator's note on the page also keeps it out of the
 * speech queue.
 */

const REGEX_RULE = /^\/(.*)\/([gmiyuvsd]*)$/;

/** One remove (`to` empty) or replace rule. */
export type TextRule = {
  from: string;
  to: string;
};

/**
 * Whether the rule is a `/pattern/flags` one. Those are matched against the
 * markup, as the custom-code settings page documents them, so they are applied
 * to the chapter's HTML rather than to the text extracted from it.
 */
export const isRegexRule = (value: string): boolean => REGEX_RULE.test(value);

/** Mirrors `normalize` in `assets/reader/js/textRules.js`. */
export const normalizeRule = (value: string): string =>
  value.replace(/[\s\u00a0]+/g, ' ').trim();

/** The saved rules that are matched against text rather than markup. */
export const plainTextRules = (
  removeText: string[] | undefined,
  replaceText: Record<string, string> | undefined,
): TextRule[] => {
  const rules: TextRule[] = [];

  for (const from of removeText ?? []) {
    if (typeof from === 'string' && from && !isRegexRule(from)) {
      rules.push({ from, to: '' });
    }
  }
  for (const [from, to] of Object.entries(replaceText ?? {})) {
    if (from && !isRegexRule(from)) {
      rules.push({ from, to: typeof to === 'string' ? to : '' });
    }
  }

  return rules;
};

const applyToLine = (line: string, rules: TextRule[]): string => {
  let result = normalizeRule(line);

  for (const rule of rules) {
    const needle = normalizeRule(rule.from);
    if (!needle || !result.includes(needle)) {
      continue;
    }
    // A replacement holding its own rule would match itself for ever, so it is
    // applied once - the same bargain the reader's own matcher strikes.
    result = normalizeRule(rule.to).includes(needle)
      ? result.replace(needle, rule.to)
      : result.split(needle).join(rule.to);
  }

  return result;
};

/**
 * Applies the rules to one paragraph's text, line by line: the reader holds a
 * rule to a single line, so a rule must not match across a `<br>` here either.
 */
export const applyTextRules = (text: string, rules: TextRule[]): string =>
  rules.length
    ? text
        .split('\n')
        .map(line => applyToLine(line, rules))
        .join('\n')
    : text;
