import { cleanChapterHtml } from '../cleanup';
import { requestAI } from '../client';

jest.mock('../client', () => ({
  requestAI: jest.fn(),
  addUsage: jest.requireActual('../client').addUsage,
}));

const mockedRequest = requestAI as jest.MockedFunction<typeof requestAI>;

const html = '<p>he go home</p><p>she was happy</p><p>they is here</p>';

const respondWith = (
  handler: (paragraphs: { i: number; t: string }[]) => unknown,
) => {
  mockedRequest.mockImplementation(async request => {
    const prompt = request.messages[request.messages.length - 1].content;
    const payload = JSON.parse(
      prompt.slice(prompt.indexOf('['), prompt.lastIndexOf(']') + 1),
    ) as { i: number; t: string }[];
    return { text: JSON.stringify(handler(payload)) };
  });
};

const run = (paragraphsPerBatch = 10) =>
  cleanChapterHtml({
    html,
    contentHash: 'hash',
    model: 'test-model',
    glossary: [],
    paragraphsPerBatch,
  });

beforeEach(() => {
  mockedRequest.mockReset();
});

describe('cleanChapterHtml', () => {
  it('keeps only the paragraphs the model actually changed', async () => {
    respondWith(paragraphs =>
      paragraphs.map(paragraph =>
        paragraph.i === 0 ? { i: 0, t: 'He went home.' } : paragraph,
      ),
    );

    const { sidecar, changedCount } = await run();

    expect(changedCount).toBe(1);
    expect(sidecar.paragraphs).toHaveLength(1);
    expect(sidecar.paragraphs[0]).toMatchObject({
      index: 0,
      original: 'he go home',
      cleaned: 'He went home.',
    });
    expect(sidecar.paragraphs[0].ops.length).toBeGreaterThan(0);
  });

  it('ignores a paragraph the model only restyled', async () => {
    respondWith(paragraphs =>
      paragraphs.map(paragraph => ({
        i: paragraph.i,
        t: paragraph.t.replace(/"([^"]*)"/g, '\u201c$1\u201d'),
      })),
    );

    const { sidecar, changedCount } = await cleanChapterHtml({
      html: '<p>"stop," he said</p>',
      contentHash: 'hash',
      model: 'test-model',
      glossary: [],
      paragraphsPerBatch: 10,
    });

    expect(changedCount).toBe(0);
    expect(sidecar.paragraphs).toHaveLength(0);
  });

  it('reads the object shape structured output returns', async () => {
    mockedRequest.mockImplementation(async request => {
      const prompt = request.messages[request.messages.length - 1].content;
      const payload = JSON.parse(
        prompt.slice(prompt.indexOf('['), prompt.lastIndexOf(']') + 1),
      ) as { i: number; t: string }[];
      return {
        text: JSON.stringify({
          paragraphs: payload.map(paragraph =>
            paragraph.i === 0 ? { i: 0, t: 'He went home.' } : paragraph,
          ),
        }),
      };
    });

    const { sidecar, changedCount } = await run();

    expect(changedCount).toBe(1);
    expect(sidecar.paragraphs[0].cleaned).toBe('He went home.');
  });

  it('asks the provider for the cleanup schema', async () => {
    respondWith(paragraphs => paragraphs);

    await run();

    expect(mockedRequest.mock.calls[0][0].schema?.name).toBe(
      'cleaned_paragraphs',
    );
  });

  it('retries a batch whose paragraph count does not match', async () => {
    let attempt = 0;
    mockedRequest.mockImplementation(async () => {
      attempt++;
      // First attempt merges three paragraphs into one, which would
      // misalign every index after it.
      return attempt === 1
        ? { text: JSON.stringify([{ i: 0, t: 'all three merged' }]) }
        : {
            text: JSON.stringify([
              { i: 0, t: 'He went home.' },
              { i: 1, t: 'she was happy' },
              { i: 2, t: 'they is here' },
            ]),
          };
    });

    const { sidecar } = await run();

    expect(attempt).toBe(2);
    expect(sidecar.paragraphs.map(paragraph => paragraph.index)).toEqual([0]);
  });

  it('retries a batch that came back as unparseable JSON', async () => {
    let attempt = 0;
    mockedRequest.mockImplementation(async request => {
      attempt++;
      if (attempt === 1) {
        return { text: '[{"i":0,"t":""Run!""' };
      }
      const prompt = request.messages[request.messages.length - 1].content;
      const payload = JSON.parse(
        prompt.slice(prompt.indexOf('['), prompt.lastIndexOf(']') + 1),
      ) as { i: number; t: string }[];
      return {
        text: JSON.stringify(
          payload.map(paragraph =>
            paragraph.i === 0 ? { i: 0, t: 'He went home.' } : paragraph,
          ),
        ),
      };
    });

    const { changedCount } = await run();

    expect(attempt).toBe(2);
    expect(changedCount).toBe(1);
  });

  it('falls back to single paragraphs when a batch keeps coming back wrong', async () => {
    const seen: number[][] = [];
    mockedRequest.mockImplementation(async request => {
      const prompt = request.messages[request.messages.length - 1].content;
      const payload = JSON.parse(
        prompt.slice(prompt.indexOf('['), prompt.lastIndexOf(']') + 1),
      ) as { i: number; t: string }[];
      seen.push(payload.map(entry => entry.i));

      if (payload.length > 1) {
        // Always the wrong shape for a multi-paragraph batch.
        return { text: JSON.stringify([{ i: payload[0].i, t: 'merged' }]) };
      }
      return {
        text: JSON.stringify([
          { i: payload[0].i, t: `cleaned ${payload[0].i}` },
        ]),
      };
    });

    const { sidecar } = await run();

    // Two failed batch attempts, then one request per paragraph.
    expect(seen.slice(0, 2)).toEqual([
      [0, 1, 2],
      [0, 1, 2],
    ]);
    expect(seen.slice(2)).toEqual([[0], [1], [2]]);
    expect(sidecar.paragraphs.map(paragraph => paragraph.index)).toEqual([
      0, 1, 2,
    ]);
  });

  it('leaves a paragraph untouched when even a single request is unusable', async () => {
    mockedRequest.mockResolvedValue({ text: JSON.stringify([]) });

    const { sidecar, changedCount } = await run();

    expect(changedCount).toBe(0);
    expect(sidecar.paragraphs).toHaveLength(0);
  });

  it('rejects a response that renumbers paragraphs', async () => {
    let attempt = 0;
    mockedRequest.mockImplementation(async () => {
      attempt++;
      return attempt <= 2
        ? {
            text: JSON.stringify([
              { i: 7, t: 'a' },
              { i: 8, t: 'b' },
              { i: 9, t: 'c' },
            ]),
          }
        : { text: JSON.stringify([{ i: attempt - 3, t: 'ok' }]) };
    });

    const { sidecar } = await run();

    // The renumbered batch is discarded, so nothing lands on a wrong index.
    expect(sidecar.paragraphs.every(paragraph => paragraph.index <= 2)).toBe(
      true,
    );
  });

  it('throws when the chapter has nothing readable', async () => {
    await expect(
      cleanChapterHtml({
        html: '<div></div>',
        contentHash: 'hash',
        model: 'test-model',
        glossary: [],
        paragraphsPerBatch: 10,
      }),
    ).rejects.toThrow('no readable text');
  });
});
