import {
  chunkParagraphs,
  extractCleanupParagraphs,
  hashChapterText,
  selectCleanableParagraphs,
} from '../paragraphs';

describe('extractCleanupParagraphs', () => {
  it('indexes every readable node, blank ones included', () => {
    const paragraphs = extractCleanupParagraphs(
      '<p>First</p><p></p><p>Third</p>',
    );

    // The blank paragraph keeps its slot: the reader writes cleaned text back
    // by index into the same node list.
    expect(paragraphs.map(paragraph => paragraph.index)).toEqual([0, 1]);
    expect(paragraphs.map(paragraph => paragraph.text)).toEqual([
      'First',
      'Third',
    ]);
  });

  it('keeps punctuation spacing intact', () => {
    const [paragraph] = extractCleanupParagraphs('<p>"Wait ," he said .</p>');

    expect(paragraph.text).toBe('"Wait ," he said .');
  });

  it('collapses runs of whitespace', () => {
    const [paragraph] = extractCleanupParagraphs('<p>a   b\n\n  c</p>');

    expect(paragraph.text).toBe('a b\nc');
  });
});

describe('selectCleanableParagraphs', () => {
  it('drops blank paragraphs without renumbering the rest', () => {
    const selected = selectCleanableParagraphs([
      { index: 0, text: 'kept' },
      { index: 1, text: '' },
      { index: 2, text: 'also kept' },
    ]);

    expect(selected.map(paragraph => paragraph.index)).toEqual([0, 2]);
  });
});

describe('chunkParagraphs', () => {
  it('splits into batches of the requested size', () => {
    const paragraphs = Array.from({ length: 5 }, (_, index) => ({
      index,
      text: String(index),
    }));

    expect(chunkParagraphs(paragraphs, 2).map(batch => batch.length)).toEqual([
      2, 2, 1,
    ]);
  });

  it('never produces an empty batch for a zero size', () => {
    expect(chunkParagraphs([{ index: 0, text: 'a' }], 0)).toHaveLength(1);
  });
});

describe('hashChapterText', () => {
  it('is stable for the same text', () => {
    expect(hashChapterText('chapter one')).toBe(hashChapterText('chapter one'));
  });

  it('changes when the text changes', () => {
    expect(hashChapterText('chapter one')).not.toBe(
      hashChapterText('chapter two'),
    );
  });
});
