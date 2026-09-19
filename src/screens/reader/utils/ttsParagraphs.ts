/**
 * Node names the reader treats as inline formatting rather than as a
 * standalone paragraph. Kept in sync with `window.tts` in
 * `assets/reader/js/core.js`; `ttsParagraphs.test.ts` asserts both agree.
 */
export const READABLE_NODE_NAMES = [
  '#text',
  'B',
  'I',
  'SPAN',
  'EM',
  'BR',
  'STRONG',
  'A',
  'MARK',
];

/** Tags whose text `innerText` never surfaces, so neither may we. */
const NON_RENDERED_NODE_NAMES = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'];

const HIDDEN_STYLE = /display\s*:\s*none|visibility\s*:\s*hidden/i;

const VOID_ELEMENTS = new Set([
  'AREA',
  'BASE',
  'BR',
  'COL',
  'EMBED',
  'HR',
  'IMG',
  'INPUT',
  'LINK',
  'META',
  'PARAM',
  'SOURCE',
  'TRACK',
  'WBR',
]);

const RAW_TEXT_ELEMENTS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'TITLE']);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: '\u00a0',
  quot: '"',
};

export interface TtsNode {
  nodeName: string;
  text?: string;
  attribs?: Record<string, string>;
  childNodes: TtsNode[];
  children: TtsNode[];
}

const decodeEntities = (value: string): string =>
  value.replace(
    /&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi,
    (match: string, entity: string) => {
      if (entity[0] !== '#') {
        return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
      }
      const codePoint =
        entity[1]?.toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      if (
        !Number.isFinite(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10ffff
      ) {
        return match;
      }
      return String.fromCodePoint(codePoint);
    },
  );

const ATTRIBUTE_PATTERN =
  /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

const parseAttributes = (source: string): Record<string, string> => {
  const attribs: Record<string, string> = {};
  ATTRIBUTE_PATTERN.lastIndex = 0;
  let match = ATTRIBUTE_PATTERN.exec(source);
  while (match) {
    attribs[match[1].toLowerCase()] = decodeEntities(
      match[2] ?? match[3] ?? match[4] ?? '',
    );
    match = ATTRIBUTE_PATTERN.exec(source);
  }

  return attribs;
};

/** Finds the `>` that closes a tag, ignoring any inside attribute quotes. */
const findTagEnd = (html: string, start: number): number => {
  let quote: string | null = null;
  for (let index = start + 1; index < html.length; index++) {
    const character = html[index];
    if (quote) {
      if (character === quote) {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }

  return -1;
};

const createNode = (
  nodeName: string,
  attribs?: Record<string, string>,
): TtsNode => ({ nodeName, attribs, childNodes: [], children: [] });

const appendChild = (parent: TtsNode, node: TtsNode) => {
  parent.childNodes.push(node);
  if (node.nodeName !== '#text') {
    parent.children.push(node);
  }
};

/**
 * Parses sanitized chapter HTML into the minimal tree the traversal needs.
 * `sanitizeChapterText` runs first, so the input is already well formed and a
 * full HTML parser would only add a dependency to this path.
 */
export const parseChapterNodes = (html: string): TtsNode => {
  const root = createNode('DIV');
  const stack: TtsNode[] = [root];
  let index = 0;

  const pushText = (value: string) => {
    if (value) {
      appendChild(stack[stack.length - 1], {
        ...createNode('#text'),
        text: decodeEntities(value),
      });
    }
  };

  while (index < html.length) {
    const tagStart = html.indexOf('<', index);
    if (tagStart < 0) {
      pushText(html.slice(index));
      break;
    }
    if (tagStart > index) {
      pushText(html.slice(index, tagStart));
    }

    if (html.startsWith('<!--', tagStart)) {
      const commentEnd = html.indexOf('-->', tagStart + 4);
      index = commentEnd < 0 ? html.length : commentEnd + 3;
      continue;
    }
    if (html.startsWith('<!', tagStart)) {
      const declarationEnd = html.indexOf('>', tagStart);
      index = declarationEnd < 0 ? html.length : declarationEnd + 1;
      continue;
    }

    const tagEnd = findTagEnd(html, tagStart);
    if (tagEnd < 0) {
      pushText(html.slice(tagStart));
      break;
    }

    const raw = html.slice(tagStart + 1, tagEnd);
    index = tagEnd + 1;

    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim().toUpperCase();
      for (let depth = stack.length - 1; depth > 0; depth--) {
        if (stack[depth].nodeName === name) {
          stack.length = depth;
          break;
        }
      }
      continue;
    }

    const selfClosing = raw.endsWith('/');
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const nameMatch = /^([^\s/>]+)([\s\S]*)$/.exec(body);
    if (!nameMatch) {
      continue;
    }

    const name = nameMatch[1].toUpperCase();
    const node = createNode(name, parseAttributes(nameMatch[2]));
    appendChild(stack[stack.length - 1], node);

    if (RAW_TEXT_ELEMENTS.has(name)) {
      const closing = `</${name}`;
      const closingIndex = html.toUpperCase().indexOf(closing, index);
      index = closingIndex < 0 ? html.length : closingIndex;
      continue;
    }

    if (!selfClosing && !VOID_ELEMENTS.has(name)) {
      stack.push(node);
    }
  }

  return root;
};

const isRendered = (node: TtsNode): boolean => {
  if (NON_RENDERED_NODE_NAMES.includes(node.nodeName)) {
    return false;
  }
  const attribs = node.attribs;
  if (!attribs) {
    return true;
  }
  return !('hidden' in attribs) && !HIDDEN_STYLE.test(attribs.style ?? '');
};

export const isReadable = (node: TtsNode): boolean => {
  if (node.nodeName !== 'SPAN' && READABLE_NODE_NAMES.includes(node.nodeName)) {
    return false;
  }
  if (node.childNodes.length === 0) {
    return false;
  }
  return node.childNodes.every(child =>
    READABLE_NODE_NAMES.includes(child.nodeName),
  );
};

export const getAllReadableNodes = (root: TtsNode): TtsNode[] => {
  const nodes: TtsNode[] = [];

  const traverse = (node: TtsNode) => {
    if (!node || !isRendered(node)) {
      return;
    }
    if (isReadable(node)) {
      nodes.push(node);
      return;
    }
    node.children.forEach(traverse);
  };

  traverse(root);

  return nodes;
};

/**
 * Mirrors `innerText` closely enough for speech: `<br>` becomes a break so
 * `normalizeText` separates the surrounding words, everything else
 * concatenates. Layout is unavailable here by design — that is the whole
 * point of extracting off the WebView.
 */
export const renderText = (node: TtsNode): string => {
  if (node.nodeName === '#text') {
    return node.text ?? '';
  }
  if (node.nodeName === 'BR') {
    return '\n';
  }
  if (!isRendered(node)) {
    return '';
  }
  return node.childNodes.map(renderText).join('');
};

const DASH_ONLY = /^[\-‐‑‒–—―−⁓⸺⸻﹘﹣－]+$/u;

/** Marks that a number can carry: "1,300", "3.14", "10:30". */
const NUMERIC_MARK = /[.,:]/;

/**
 * Gives sentence punctuation a trailing space so the engine breathes between
 * clauses, while leaving punctuation that sits between digits alone: spacing
 * "1,300" out to "1, 300" makes it read as "one, three hundred".
 */
const spacePunctuation = (value: string): string =>
  value.replace(
    /\s*([.,!?;:])\s*/g,
    (match: string, mark: string, offset: number, source: string) => {
      const before = source[offset - 1] ?? '';
      const after = source[offset + match.length] ?? '';
      if (NUMERIC_MARK.test(mark) && /\d/.test(before) && /\d/.test(after)) {
        return mark;
      }

      return `${mark} `;
    },
  );

export const normalizeText = (value: string): string => {
  if (!value) {
    return '';
  }
  const normalized = spacePunctuation(
    value
      // Zero-width characters carry no speech and the reader cannot see them,
      // but they keep a paragraph out of the queue's empty filter - the caret
      // standing in for a dropped paragraph is one.
      .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, ''),
  ).trim();

  const dashOnly = normalized.replace(/\s/g, '');
  if (dashOnly.length >= 3 && DASH_ONLY.test(dashOnly)) {
    return '';
  }

  return normalized;
};

/**
 * Builds the speech queue for a chapter without a WebView, so playback can
 * cross a chapter boundary while the screen is off and the reader's renderer
 * is suspended.
 *
 * `cleaned` holds AI-cleaned paragraphs keyed by their position in the
 * readable-node list - the same index cleanup and the reader address them by -
 * so the queue speaks what the reader shows. Blank nodes keep their place
 * while the map is applied and drop out afterwards, exactly as before.
 */
export const extractTtsParagraphs = (
  html: string,
  cleaned?: ReadonlyMap<number, string>,
): string[] =>
  getAllReadableNodes(parseChapterNodes(html))
    .map((node, index) =>
      normalizeText(cleaned?.get(index) ?? renderText(node)),
    )
    .filter(Boolean);
