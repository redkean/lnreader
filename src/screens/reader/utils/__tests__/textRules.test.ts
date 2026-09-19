/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Exercises `assets/reader/js/textRules.js` against a real DOM, because that is
 * the whole point of the file: the rules the reader writes are rendered text,
 * and they have to land on markup that never looks like it. A TreeWalker and a
 * Range are not worth faking, so this runs in jsdom rather than the RN default.
 */
type TextRules = {
  normalize(value: unknown): string;
  apply(root: Element, from: string, to?: string): boolean;
  applyToHtml(html: string, rules: { from: string; to?: string }[]): string;
};

const source = readFileSync(
  join(process.cwd(), 'assets/reader/js/textRules.js'),
  'utf8',
);

new Function(source).call(globalThis);

const textRules = (globalThis as unknown as { textRules: TextRules }).textRules;

/** The chapter element the reader's rules are applied inside. */
const chapterWith = (html: string): Element => {
  document.body.innerHTML = `<div id="LNReader-chapter">${html}</div>`;
  return document.querySelector('#LNReader-chapter') as Element;
};

describe('textRules.normalize', () => {
  it('collapses every kind of whitespace the way layout does', () => {
    expect(textRules.normalize('  a \n\t b c  ')).toBe('a b c');
  });

  it('treats a missing rule as empty', () => {
    expect(textRules.normalize(undefined)).toBe('');
    expect(textRules.normalize(null)).toBe('');
  });
});

describe('textRules.apply', () => {
  it('removes text that the markup splits across tags', () => {
    // What bionic reading does to every word in the chapter.
    const chapter = chapterWith(
      '<p>Story. <b>If</b> you find any <b>err</b>ors, tell us.</p>',
    );

    expect(
      textRules.apply(chapter, 'If you find any errors, tell us.', ''),
    ).toBe(true);
    expect(chapter.textContent?.trim()).toBe('Story.');
  });

  it('matches a rule across the whitespace the source wrote as a newline', () => {
    const chapter = chapterWith('<p>read\n   more   at\nfoo.net</p>');

    expect(textRules.apply(chapter, 'read more at foo.net', '')).toBe(true);
    expect(chapter.textContent?.trim()).toBe('');
  });

  it('matches text the markup holds as an entity', () => {
    const chapter = chapterWith('<p>Tom &amp; Jerry &nbsp;laughed</p>');

    expect(textRules.apply(chapter, 'Tom & Jerry laughed', '')).toBe(true);
    expect(chapter.textContent?.trim()).toBe('');
  });

  it('replaces every occurrence', () => {
    const chapter = chapterWith('<p>Rin said</p><p>Rin left</p>');

    expect(textRules.apply(chapter, 'Rin', 'Lin')).toBe(true);
    expect(chapter.textContent).toBe('Lin saidLin left');
  });

  it('never matches across a paragraph boundary', () => {
    const chapter = chapterWith('<p>the end</p><p>of it</p>');

    expect(textRules.apply(chapter, 'end of', '')).toBe(false);
    expect(chapter.textContent).toBe('the endof it');
  });

  it('never matches across a line break', () => {
    const chapter = chapterWith('<p>the end<br>of it</p>');

    expect(textRules.apply(chapter, 'end of', '')).toBe(false);
  });

  it('keeps the surrounding markup a partial match sits in', () => {
    const chapter = chapterWith('<p><em>Keep this. Drop that.</em></p>');

    expect(textRules.apply(chapter, 'Drop that.', '')).toBe(true);
    expect(chapter.innerHTML).toBe('<p><em>Keep this. </em></p>');
  });

  it('reports no change when the rule does not match', () => {
    const chapter = chapterWith('<p>Story.</p>');

    expect(textRules.apply(chapter, 'absent', '')).toBe(false);
    expect(chapter.innerHTML).toBe('<p>Story.</p>');
  });

  it('ignores an empty rule', () => {
    const chapter = chapterWith('<p>Story.</p>');

    expect(textRules.apply(chapter, '   ', '')).toBe(false);
  });

  it('applies a replacement that contains its own rule only once', () => {
    const chapter = chapterWith('<p>ha</p>');

    expect(textRules.apply(chapter, 'ha', 'haha')).toBe(true);
    expect(chapter.textContent).toBe('haha');
  });

  it('leaves script and style text alone', () => {
    const chapter = chapterWith('<script>var ad = 1;</script><p>Story.</p>');

    expect(textRules.apply(chapter, 'var ad = 1;', '')).toBe(false);
  });
});

describe('textRules.applyToHtml', () => {
  it('applies the rules to a markup string and returns it', () => {
    expect(
      textRules.applyToHtml('<p>Story. <b>Ad</b> here.</p>', [
        { from: 'Ad here.', to: '' },
      ]),
    ).toBe('<p>Story. <b></b></p>');
  });

  it('returns the markup untouched when nothing matched', () => {
    const html = '<p>Story.</p>';

    expect(textRules.applyToHtml(html, [{ from: 'absent', to: '' }])).toBe(
      html,
    );
    expect(textRules.applyToHtml(html, [])).toBe(html);
  });
});
