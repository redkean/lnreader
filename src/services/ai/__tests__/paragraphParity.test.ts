import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

import { extractCleanupParagraphs } from '../paragraphs';

/**
 * Cleanup addresses paragraphs by their position in the reader's readable-node
 * list. The app computes that list in TypeScript; the WebView computes it
 * again in `core.js` when writing the cleaned text back. If the two ever
 * disagree, cleaned prose lands on the wrong paragraph - so they are checked
 * against each other here on the markup real chapters are made of.
 */

type TestNode = TestElement | { nodeName: '#text'; text: string };
type TestNodeList = TestNode[] & { item(index: number): TestNode };

class TestElement {
  readonly childNodes: TestNodeList;
  readonly children: TestElement[];

  constructor(readonly nodeName: string, childNodes: TestNode[]) {
    this.childNodes = [...childNodes] as TestNodeList;
    this.childNodes.item = index => this.childNodes[index];
    this.children = childNodes.filter(
      (node): node is TestElement => node instanceof TestElement,
    );
  }

  hasChildNodes() {
    return this.childNodes.length > 0;
  }

  get innerText(): string {
    return this.childNodes
      .map(node => (node instanceof TestElement ? node.innerText : node.text))
      .join('');
  }
}

const text = (value: string): TestNode => ({ nodeName: '#text', text: value });
const element = (name: string, ...children: TestNode[]) =>
  new TestElement(name.toUpperCase(), children);

const loadReaderTraversal = (chapterElement: TestElement) => {
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
    reader: { chapterElement: TestElement };
    window: {
      tts?: { getAllReadableElements(el: TestElement): TestElement[] };
    };
  } = { reader: { chapterElement }, window: {} };

  runInNewContext(core.slice(start, end + closing.length), context);
  if (!context.window.tts) {
    throw new Error('Reader TTS implementation did not initialize');
  }
  return context.window.tts;
};

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();

const expectParity = (html: string, chapter: TestElement) => {
  const fromApp = extractCleanupParagraphs(html);
  const fromReader =
    loadReaderTraversal(chapter).getAllReadableElements(chapter);

  expect(fromApp).toHaveLength(fromReader.length);
  fromApp.forEach((paragraph, index) => {
    expect(paragraph.index).toBe(index);
    expect(collapse(paragraph.text)).toBe(
      collapse(fromReader[index].innerText),
    );
  });
};

describe('cleanup paragraph indices match the reader', () => {
  it('agrees on plain paragraphs', () => {
    expectParity(
      '<p>First line</p><p>Second line</p><p>Third line</p>',
      element(
        'div',
        element('p', text('First line')),
        element('p', text('Second line')),
        element('p', text('Third line')),
      ),
    );
  });

  it('agrees on paragraphs carrying inline markup', () => {
    expectParity(
      '<p>He said <b>stop</b> and <i>ran</i>.</p><p>Then <a href="#">left</a>.</p>',
      element(
        'div',
        element(
          'p',
          text('He said '),
          element('b', text('stop')),
          text(' and '),
          element('i', text('ran')),
          text('.'),
        ),
        element('p', text('Then '), element('a', text('left')), text('.')),
      ),
    );
  });

  it('agrees on nested containers', () => {
    expectParity(
      '<div><div><p>Inner one</p><p>Inner two</p></div><p>Outer</p></div>',
      element(
        'div',
        element(
          'div',
          element('p', text('Inner one')),
          element('p', text('Inner two')),
        ),
        element('p', text('Outer')),
      ),
    );
  });

  it('agrees on empty paragraphs used as spacing', () => {
    expectParity(
      '<p>Before</p><p><br></p><p>After</p>',
      element(
        'div',
        element('p', text('Before')),
        element('p', element('br')),
        element('p', text('After')),
      ),
    );
  });
});
