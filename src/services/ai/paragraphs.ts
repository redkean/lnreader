import {
  getAllReadableNodes,
  parseChapterNodes,
  renderText,
} from './chapterNodes';
import type { AIParagraph } from './types';

/**
 * Collapses runs of whitespace without touching punctuation. Prose that is
 * about to be rewritten and diffed against the original must keep its
 * spacing around punctuation and its wrapping quotes exactly as written.
 */
const collapseWhitespace = (value: string) =>
  value
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();

/**
 * The paragraph list cleanup is indexed by. Every readable node is kept -
 * blank ones included - so the index matches
 * `window.tts.getAllReadableElements()` inside the WebView, which is what the
 * cleaned text is written back through.
 */
export const extractCleanupParagraphs = (html: string): AIParagraph[] =>
  getAllReadableNodes(parseChapterNodes(html)).map((node, index) => ({
    index,
    text: collapseWhitespace(renderText(node)),
  }));

/** Paragraphs worth spending tokens on. */
export const selectCleanableParagraphs = (paragraphs: AIParagraph[]) =>
  paragraphs.filter(paragraph => paragraph.text.length > 0);

export const chunkParagraphs = (
  paragraphs: AIParagraph[],
  batchSize: number,
): AIParagraph[][] => {
  const size = Math.max(1, Math.floor(batchSize));
  const batches: AIParagraph[][] = [];
  for (let index = 0; index < paragraphs.length; index += size) {
    batches.push(paragraphs.slice(index, index + size));
  }
  return batches;
};

/**
 * Cheap, stable fingerprint of the chapter text. Not a cryptographic hash -
 * it only has to change when the chapter does, so stale cleaned text and
 * summaries are never shown against different source text.
 */
export const hashChapterText = (text: string): string => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = (h2 >>> 0) * 4294967296 + (h1 >>> 0);
  return `${text.length.toString(36)}-${hash.toString(36)}`;
};
