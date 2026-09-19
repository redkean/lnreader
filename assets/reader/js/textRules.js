/**
 * Matches the reader's remove/replace rules against the text the reader can
 * actually see.
 *
 * A rule is written by selecting text on the page, so it holds rendered text:
 * no tags, entities already decoded, whitespace collapsed the way layout
 * collapses it. The chapter's markup holds none of that - bionic reading wraps
 * the first half of every word in <b>, AI cleanup wraps its edits in <mark>,
 * the source indents its paragraphs across newlines, and "&amp;" is four
 * characters more than the reader sees. Matching a rule against the markup
 * therefore misses on most chapters, so the rules are matched here against a
 * flattened copy of the text that keeps a map back into the DOM.
 */
window.textRules = new (function () {
  /**
   * Elements the reader lays out on a line of their own. Rendered text never
   * runs across their boundary, so neither may a match: a rule cannot be made
   * to span two paragraphs.
   */
  const BLOCK_TAGS = [
    'ADDRESS',
    'ARTICLE',
    'ASIDE',
    'BLOCKQUOTE',
    'BR',
    'CAPTION',
    'CENTER',
    'DD',
    'DIV',
    'DL',
    'DT',
    'FIELDSET',
    'FIGCAPTION',
    'FIGURE',
    'FOOTER',
    'FORM',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'HEADER',
    'HR',
    'LI',
    'MAIN',
    'NAV',
    'OL',
    'P',
    'PRE',
    'SECTION',
    'TABLE',
    'TBODY',
    'TD',
    'TFOOT',
    'TH',
    'THEAD',
    'TR',
    'UL',
  ];

  /** Tags whose text the reader never sees, plus the selection toolbar. */
  const SKIP_TAGS = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'];

  /** Stands in for a line boundary, and can never appear in a rule. */
  const BLOCK_BREAK = '\u0000';

  const isWhitespace = character =>
    character === ' ' ||
    character === '\n' ||
    character === '\t' ||
    character === '\r' ||
    character === '\f' ||
    character === '\v' ||
    character === '\u00a0';

  /** A rule holds rendered text, so the haystack is built the same way. */
  this.normalize = value =>
    String(value === null || value === undefined ? '' : value)
      .replace(/[\s\u00a0]+/g, ' ')
      .trim();

  /**
   * The subtree's text as one string, where `spans[i]` is the DOM range the
   * i-th character came from. A whitespace run collapses to a single space
   * whose span covers the whole run, so deleting a match takes the spacing
   * that held it with it.
   */
  const flatten = root => {
    const doc = root.ownerDocument || document;
    const walker = doc.createTreeWalker(
      root,
      // SHOW_ELEMENT | SHOW_TEXT
      0x1 | 0x4,
      {
        acceptNode: node => {
          if (node.nodeType !== 1) {
            return 1; // FILTER_ACCEPT
          }
          if (
            SKIP_TAGS.indexOf(node.tagName) !== -1 ||
            node.id === 'text-selection-ui'
          ) {
            return 2; // FILTER_REJECT, subtree and all
          }
          // Inline elements are stepped over rather than visited: their text
          // belongs to the line their block ancestor opened.
          return BLOCK_TAGS.indexOf(node.tagName) !== -1 ? 1 : 3; // FILTER_SKIP
        },
      },
    );

    let text = '';
    const spans = [];
    /** Index of the space standing for the whitespace run being read. */
    let run = -1;
    let node = walker.nextNode();

    while (node) {
      if (node.nodeType === 1) {
        if (text.length && text.charAt(text.length - 1) !== BLOCK_BREAK) {
          text += BLOCK_BREAK;
          spans.push(null);
        }
        run = -1;
      } else {
        const value = node.nodeValue || '';
        for (let index = 0; index < value.length; index++) {
          const character = value.charAt(index);
          if (isWhitespace(character)) {
            if (run !== -1) {
              spans[run].endNode = node;
              spans[run].endOffset = index + 1;
              continue;
            }
            text += ' ';
          } else {
            text += character;
          }
          spans.push({
            startNode: node,
            startOffset: index,
            endNode: node,
            endOffset: index + 1,
          });
          run = isWhitespace(character) ? spans.length - 1 : -1;
        }
      }
      node = walker.nextNode();
    }

    return { text: text, spans: spans };
  };

  const applyOnce = (root, needle, replacement) => {
    const flat = flatten(root);
    const at = flat.text.indexOf(needle);
    if (at === -1) {
      return false;
    }
    const first = flat.spans[at];
    const last = flat.spans[at + needle.length - 1];
    if (!first || !last) {
      return false;
    }

    const doc = root.ownerDocument || document;
    const range = doc.createRange();
    range.setStart(first.startNode, first.startOffset);
    range.setEnd(last.endNode, last.endOffset);
    range.deleteContents();
    if (replacement) {
      range.insertNode(doc.createTextNode(replacement));
    }
    return true;
  };

  /**
   * Applies one rule everywhere it matches inside `root`, re-flattening after
   * each hit because the edit invalidates every offset behind it. A
   * replacement that contains its own rule would match itself for ever, so
   * that rule is applied once.
   */
  this.apply = (root, from, to) => {
    const needle = this.normalize(from);
    if (!root || !needle) {
      return false;
    }
    const replacement = to === null || to === undefined ? '' : String(to);
    const selfMatching = this.normalize(replacement).indexOf(needle) !== -1;
    let changed = false;

    for (let guard = 0; guard < 1000; guard++) {
      if (!applyOnce(root, needle, replacement)) {
        break;
      }
      changed = true;
      if (selfMatching) {
        break;
      }
    }

    return changed;
  };

  /**
   * The same rules over a markup string, for markup that is not on screen -
   * the copy the reader's text options rebuild the chapter from.
   */
  this.applyToHtml = (html, rules) => {
    if (!rules || !rules.length) {
      return html;
    }
    const holder = document.createElement('div');
    holder.innerHTML = html;
    let changed = false;
    for (const rule of rules) {
      if (this.apply(holder, rule.from, rule.to)) {
        changed = true;
      }
    }
    return changed ? holder.innerHTML : html;
  };
})();
