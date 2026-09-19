import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

import {
  extractTtsParagraphs,
  normalizeText,
  parseChapterNodes,
  TtsNode,
} from '../ttsParagraphs';

type CoreTts = {
  getAllReadableElements(element: DomAdapter): DomAdapter[];
  normalizeText(text: string): string;
};

/**
 * Presents a parsed chapter to `core.js` the way a WebView DOM would, so the
 * reader implementation and the React Native extractor can be run against the
 * exact same input.
 */
class DomAdapter {
  readonly nodeName: string;
  readonly childNodes: DomAdapter[] & { item(index: number): DomAdapter };
  readonly children: DomAdapter[];

  constructor(private readonly node: TtsNode) {
    this.nodeName = node.nodeName;
    const childNodes = node.childNodes.map(child => new DomAdapter(child));
    this.childNodes = childNodes as DomAdapter[] & {
      item(index: number): DomAdapter;
    };
    this.childNodes.item = index => this.childNodes[index];
    this.children = this.childNodes.filter(child => child.nodeName !== '#text');
  }

  hasChildNodes() {
    return this.childNodes.length > 0;
  }

  get innerText(): string {
    if (this.nodeName === '#text') {
      return this.node.text ?? '';
    }
    if (this.nodeName === 'BR') {
      return '\n';
    }
    return this.childNodes.map(child => child.innerText).join('');
  }
}

const loadCoreTts = (): CoreTts => {
  const core = readFileSync(
    join(process.cwd(), 'assets/reader/js/core.js'),
    'utf8',
  );
  const start = core.indexOf('window.tts = new (function () {');
  const closing = '\n})();';
  const end = core.indexOf(closing, start);

  if (start < 0 || end < 0) {
    throw new Error('Could not locate the reader TTS implementation');
  }

  const context: {
    reader: { chapterElement: null };
    window: { tts?: CoreTts };
  } = { reader: { chapterElement: null }, window: {} };

  runInNewContext(core.slice(start, end + closing.length), context);

  if (!context.window.tts) {
    throw new Error('Reader TTS implementation did not initialize');
  }

  return context.window.tts;
};

const readerQueue = (html: string): string[] => {
  const tts = loadCoreTts();
  const root = new DomAdapter(parseChapterNodes(html));

  return tts
    .getAllReadableElements(root)
    .map(element => tts.normalizeText(element.innerText))
    .filter(Boolean);
};

const fixtures: [name: string, html: string][] = [
  ['plain paragraphs', '<p>First paragraph.</p><p>Second paragraph.</p>'],
  ['span-wrapped text', '<p><span>First</span></p><p><span>Second</span></p>'],
  [
    'nested formatting',
    '<p><span>Text with <em>emphasis</em> inside</span></p>',
  ],
  ['line breaks', '<p>First line<br>second line</p>'],
  ['surrounding quotes', '<p>“Hello world.”</p>'],
  ['dash divider', '<p>Prose.</p><p>———</p><p>More prose.</p>'],
  [
    'nested containers',
    '<div><div><p>Deep paragraph.</p></div><p>Sibling.</p></div>',
  ],
  ['empty elements', '<p></p><p>Only real text.</p>'],
  [
    'headings and blockquote',
    '<h2>Chapter one</h2><blockquote>Quoted.</blockquote>',
  ],
  ['links inside prose', '<p>See <a href="#">this link</a> for details.</p>'],
  [
    'grouped and decimal numbers',
    '<p>He paid 1,300 gold for 3.14 litres at 10:30.</p>',
  ],
];

describe('ttsParagraphs', () => {
  describe('parity with the reader WebView implementation', () => {
    it.each(fixtures)('matches core.js for %s', (_name, html) => {
      expect(extractTtsParagraphs(html)).toEqual(readerQueue(html));
    });
  });

  describe('normalizeText', () => {
    it.each([
      ['"Hello world."', 'Hello world.'],
      ['  “Hello   world.”\n', 'Hello world.'],
      ['He said “hello” before leaving.', 'He said “hello” before leaving.'],
    ])('normalizes %s', (input, expected) => {
      expect(normalizeText(input)).toBe(expected);
    });

    it.each(['---', '————', '— — —'])('skips dash divider %s', input => {
      expect(normalizeText(input)).toBe('');
    });

    it.each([
      ['He paid 1,300 gold.', 'He paid 1,300 gold.'],
      ['It cost 1,234,567 coins.', 'It cost 1,234,567 coins.'],
      ['Pi is 3.14 exactly.', 'Pi is 3.14 exactly.'],
      ['They met at 10:30 sharp.', 'They met at 10:30 sharp.'],
    ])('keeps numbers intact in %s', (input, expected) => {
      expect(normalizeText(input)).toBe(expected);
    });

    it.each([
      ['He was 12.Then he left.', 'He was 12. Then he left.'],
      ['Wait,1,300 of them?', 'Wait, 1,300 of them?'],
    ])('still spaces sentence punctuation in %s', (input, expected) => {
      expect(normalizeText(input)).toBe(expected);
    });
  });

  describe('extractTtsParagraphs', () => {
    it('reads text without a layout engine', () => {
      expect(extractTtsParagraphs('<p>First.</p><p>Second.</p>')).toEqual([
        'First.',
        'Second.',
      ]);
    });

    it('skips script and style content', () => {
      expect(
        extractTtsParagraphs(
          '<style>p{color:red}</style><script>var a = 1;</script><p>Real text.</p>',
        ),
      ).toEqual(['Real text.']);
    });

    it('skips elements hidden by inline styles', () => {
      expect(
        extractTtsParagraphs(
          '<p style="display:none">Hidden.</p><p>Visible.</p>',
        ),
      ).toEqual(['Visible.']);
    });

    it('speaks cleaned paragraphs by their readable-node index', () => {
      expect(
        extractTtsParagraphs(
          '<p>he go home</p><p><br></p><p>she was happy</p>',
          new Map([
            [0, { original: 'he go home', cleaned: 'He went home.' }],
            [2, { original: 'she was happy', cleaned: 'She was happy.' }],
          ]),
        ),
      ).toEqual(['He went home.', 'She was happy.']);
    });

    it('speaks the original when a cleaned paragraph no longer lines up', () => {
      expect(
        extractTtsParagraphs(
          '<p>he go home</p><p>she was happy</p>',
          // The paragraph list drifted: index 1 holds different text now.
          new Map([
            [1, { original: 'they is here', cleaned: 'They are here.' }],
          ]),
        ),
      ).toEqual(['he go home', 'she was happy']);
    });

    it('drops a paragraph a cleanup removed outright', () => {
      expect(
        extractTtsParagraphs(
          '<p>Story.</p><p>If you find any errors, tell us.</p>',
          new Map([
            [1, { original: 'If you find any errors, tell us.', cleaned: '' }],
          ]),
        ),
      ).toEqual(['Story.']);
    });

    it("leaves out what the reader's remove rules take off the page", () => {
      expect(
        extractTtsParagraphs(
          '<p>Story. <b>If</b> you find any <b>err</b>ors, tell us.</p>',
          undefined,
          [{ from: 'If you find any errors, tell us.', to: '' }],
        ),
      ).toEqual(['Story.']);
    });

    it('speaks a replace rule the way the page shows it', () => {
      expect(
        extractTtsParagraphs('<p>Rin said hello</p>', undefined, [
          { from: 'Rin', to: 'Lin' },
        ]),
      ).toEqual(['Lin said hello']);
    });

    it('drops a paragraph a rule empties', () => {
      expect(
        extractTtsParagraphs(
          '<p>Read more at foo.net</p><p>Story.</p>',
          undefined,
          [{ from: 'Read more at foo.net', to: '' }],
        ),
      ).toEqual(['Story.']);
    });

    it('applies a rule to cleaned text as well', () => {
      expect(
        extractTtsParagraphs(
          '<p>he go home, tell us.</p>',
          new Map([
            [
              0,
              {
                original: 'he go home, tell us.',
                cleaned: 'He went home, tell us.',
              },
            ],
          ]),
          [{ from: ', tell us.', to: '.' }],
        ),
      ).toEqual(['He went home.']);
    });

    it('never lets a rule match across a line break', () => {
      expect(
        extractTtsParagraphs('<p>the end<br>of it</p>', undefined, [
          { from: 'end of', to: '' },
        ]),
      ).toEqual(['the end of it']);
    });
  });
});
