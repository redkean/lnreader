import { diffParagraph } from '../diff';

describe('diffParagraph', () => {
  it('returns no ops for identical text', () => {
    expect(diffParagraph('He walked home.', 'He walked home.')).toEqual([]);
  });

  it('marks a replaced word at its offset in the cleaned text', () => {
    const original = 'He was go to the store.';
    const cleaned = 'He went to the store.';
    const ops = diffParagraph(original, cleaned);

    expect(ops).toHaveLength(1);
    expect(cleaned.substr(ops[0].start, ops[0].length)).toBe('went');
    expect(ops[0].original).toBe('was go');
  });

  it('records an insertion with the text it added', () => {
    const ops = diffParagraph('She opened door.', 'She opened the door.');

    expect(ops).toHaveLength(1);
    expect('She opened the door.'.substr(ops[0].start, ops[0].length)).toBe(
      'the ',
    );
    expect(ops[0].original).toBe('');
  });

  it('records a deletion as a zero-length op carrying the removed text', () => {
    const ops = diffParagraph('He very quickly ran.', 'He quickly ran.');

    expect(ops).toHaveLength(1);
    expect(ops[0].length).toBe(0);
    expect(ops[0].original).toContain('very');
  });

  it('ignores differences that are only whitespace', () => {
    expect(diffParagraph('One  two', 'One two')).toEqual([]);
  });

  it('keeps every op inside the bounds of the cleaned text', () => {
    const original = 'the boy he go quick to school, and he is happy';
    const cleaned = 'The boy went quickly to school, and he was happy.';
    const ops = diffParagraph(original, cleaned);

    expect(ops.length).toBeGreaterThan(0);
    for (const op of ops) {
      expect(op.start).toBeGreaterThanOrEqual(0);
      expect(op.start + op.length).toBeLessThanOrEqual(cleaned.length);
    }
  });
});
