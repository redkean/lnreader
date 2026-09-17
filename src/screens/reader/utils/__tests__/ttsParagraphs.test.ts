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
  });
});
