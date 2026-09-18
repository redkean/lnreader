import { preservePunctuationStyle } from '../punctuation';

describe('preservePunctuationStyle', () => {
  it('keeps the original when only the punctuation style changed', () => {
    const original = '"Stop," he said - and she didn\'t...';
    const cleaned = '“Stop,” he said — and she didn’t…';

    expect(preservePunctuationStyle(original, cleaned)).toBe(original);
  });

  it("keeps a real fix but writes it with the chapter's punctuation", () => {
    const original = '"he go home," she said';
    const cleaned = '“He went home,” she said.';

    expect(preservePunctuationStyle(original, cleaned)).toBe(
      '"He went home," she said.',
    );
  });

  it('leaves typographic punctuation the chapter already uses', () => {
    const original = '“he go home,” she said';
    const cleaned = '“He went home,” she said.';

    expect(preservePunctuationStyle(original, cleaned)).toBe(cleaned);
  });

  it('passes an unchanged paragraph through', () => {
    expect(preservePunctuationStyle('Same text.', 'Same text.')).toBe(
      'Same text.',
    );
  });
});
