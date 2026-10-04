import { applyPronunciations, mergePronunciations } from '../pronunciations';

describe('applyPronunciations', () => {
  it('rewrites whole words, ignoring case', () => {
    expect(
      applyPronunciations('Xiao bowed. XIAO smiled, xiao left.', {
        Xiao: 'Shyao',
      }),
    ).toBe('Shyao bowed. Shyao smiled, Shyao left.');
  });

  it('leaves words that only contain the entry alone', () => {
    expect(applyPronunciations('Qi and Qing and Qilin', { Qi: 'Chee' })).toBe(
      'Chee and Qing and Qilin',
    );
  });

  it('treats accented letters as part of a word', () => {
    expect(applyPronunciations('Zoé and Zo', { Zo: 'Zoh' })).toBe(
      'Zoé and Zoh',
    );
  });

  it('treats combining accents and Vietnamese letters as part of a word', () => {
    expect(
      applyPronunciations('Jose\u0301 and Nguyễn', { Jose: 'Ho', Nguy: 'x' }),
    ).toBe('Jose\u0301 and Nguyễn');
  });

  it('prefers the longest overlapping entry', () => {
    expect(
      applyPronunciations('Xiao Yan met Xiao Li.', {
        Xiao: 'Shyao',
        'Xiao Yan': 'Shyao Yen',
      }),
    ).toBe('Shyao Yen met Shyao Li.');
  });

  it('falls back to a shorter entry where the longer one is not a whole word', () => {
    expect(
      applyPronunciations('Xiao Yanzi', {
        Xiao: 'Shyao',
        'Xiao Yan': 'Shyao Yen',
      }),
    ).toBe('Shyao Yanzi');
  });

  it('matches a multi-word entry across any whitespace', () => {
    expect(applyPronunciations('Xiao\n Yan', { 'Xiao Yan': 'Shyao Yen' })).toBe(
      'Shyao Yen',
    );
  });

  it('needs no boundary on a side that ends in punctuation', () => {
    expect(
      applyPronunciations('Lv.99 Tanaka-san', {
        'Lv.': 'Level',
        '-san': 'san',
      }),
    ).toBe('Level 99 Tanaka san');
  });

  it('matches inside text without word spaces', () => {
    expect(applyPronunciations('他是萧炎。', { 萧炎: 'Xiao Yan' })).toBe(
      '他是Xiao Yan。',
    );
  });

  it('never feeds one entry into another', () => {
    expect(applyPronunciations('Qi', { Qi: 'Chee', Chee: 'wrong' })).toBe(
      'Chee',
    );
  });

  it('treats regex characters in an entry literally', () => {
    expect(applyPronunciations('a+b and ab', { 'a+b': 'a plus b' })).toBe(
      'a plus b and ab',
    );
  });

  it('returns the text unchanged with no entries', () => {
    expect(applyPronunciations('Xiao', {})).toBe('Xiao');
  });
});

describe('mergePronunciations', () => {
  it('lets a later map override an earlier one regardless of case', () => {
    expect(
      mergePronunciations({ xiao: 'Zow', Qi: 'Chee' }, { Xiao: 'Shyao' }),
    ).toEqual({ Qi: 'Chee', Xiao: 'Shyao' });
  });

  it('skips missing maps and blank words', () => {
    expect(
      mergePronunciations(undefined, { '  ': 'x', ' Qi ': 'Chee' }),
    ).toEqual({ Qi: 'Chee' });
  });
});
