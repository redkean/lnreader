/**
 * Renders AI-cleaned paragraphs over the original chapter text.
 *
 * The original markup is never discarded - it is held in memory and put back
 * whenever the reader toggles cleaned text off, or reverts a paragraph. Each
 * swap is guarded by a text check against what cleanup was run on, so a
 * paragraph list that no longer lines up leaves the author's text on screen
 * rather than showing cleaned prose in the wrong place.
 */
window.aiCleanup = new (function () {
  this.entries = [];
  this.reverted = new Set();
  this.enabled = false;
  this.showEdits = true;
  this.hydrated = false;

  const normalize = text => (text || '').replace(/\s+/g, ' ').trim();

  const escapeHtml = text =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  /**
   * The reader's text options are applied to the chapter markup as a whole, so
   * a paragraph whose markup this replaces has to have them applied again -
   * otherwise bionic reading stops halfway down a cleaned chapter.
   */
  const withTextOptions = html =>
    reader.generalSettings.val.bionicReading ? textVide.textVide(html) : html;

  /** Cleaned text with the changed spans wrapped so they can be highlighted. */
  const buildHtml = (entry, withEdits) => {
    const text = entry.cleaned;
    if (!withEdits || !entry.ops || entry.ops.length === 0) {
      return withTextOptions(escapeHtml(text).replace(/\n/g, '<br>'));
    }

    const ops = [...entry.ops].sort((a, b) => a.start - b.start);
    let html = '';
    let cursor = 0;

    for (const op of ops) {
      const start = Math.max(cursor, op.start);
      const end = Math.min(text.length, op.start + op.length);
      if (start > cursor) {
        html += escapeHtml(text.slice(cursor, start));
      }
      // A pure deletion has no cleaned text to wrap; it is marked with a
      // zero-width caret so the reader can still tap it to see what was cut.
      const inner =
        end > start ? escapeHtml(text.slice(start, end)) : '&#8203;';
      html +=
        '<mark class="ai-edit" data-ai-index="' +
        entry.index +
        '" data-ai-original="' +
        escapeHtml(op.original || '') +
        '">' +
        inner +
        '</mark>';
      cursor = Math.max(cursor, end);
    }

    if (cursor < text.length) {
      html += escapeHtml(text.slice(cursor));
    }

    return withTextOptions(html.replace(/\n/g, '<br>'));
  };

  /**
   * Chapters often wrap a whole paragraph in formatting the reader can see - a
   * styled span, an em, a font tag. Cleaned text is plain, so writing it
   * straight into the paragraph would strip that wrapper and leave the
   * paragraph looking unlike every other one on the page. Wrappers that cover
   * the entire paragraph are kept and the cleaned text is written inside the
   * innermost one. Formatting that covers only part of a paragraph cannot
   * survive a rewrite of the very text it marks up, and is not preserved.
   */
  const innermostWrapper = element => {
    let node = element;
    while (
      node.childNodes.length === 1 &&
      node.children.length === 1 &&
      normalize(node.children[0].innerText) === normalize(node.innerText)
    ) {
      node = node.children[0];
    }
    return node;
  };

  const elementsByIndex = () => {
    const elements = window.tts
      ? window.tts.getAllReadableElements(reader.chapterElement)
      : [];
    return elements;
  };

  const applyEntry = (elements, entry) => {
    const element = elements[entry.index];
    if (!element) {
      return false;
    }
    if (element.dataset.aiOriginalHtml === undefined) {
      if (normalize(element.innerText) !== normalize(entry.original)) {
        // The paragraph is not the one this was cleaned from.
        return false;
      }
      element.dataset.aiOriginalHtml = element.innerHTML;
    }
    // Rebuilt from the paragraph's own markup every time, so the formatting
    // wrappers are the source chapter's rather than the previous render's.
    element.innerHTML = element.dataset.aiOriginalHtml;
    innermostWrapper(element).innerHTML = buildHtml(entry, this.showEdits);
    element.classList.add('ai-cleaned');
    return true;
  };

  const restoreEntry = (elements, entry) => {
    const element = elements[entry.index];
    if (!element || element.dataset.aiOriginalHtml === undefined) {
      return;
    }
    element.innerHTML = element.dataset.aiOriginalHtml;
    element.classList.remove('ai-cleaned');
  };

  this.render = () => {
    if (!this.hydrated) {
      return;
    }
    const elements = elementsByIndex();
    let applied = 0;

    for (const entry of this.entries) {
      if (this.enabled && !this.reverted.has(entry.index)) {
        if (applyEntry.call(this, elements, entry)) {
          applied++;
        }
      } else {
        restoreEntry(elements, entry);
      }
    }

    document.body.classList.toggle(
      'ai-edits-hidden',
      this.enabled && !this.showEdits,
    );

    reader.post({
      type: 'ai-cleanup-rendered',
      data: {
        enabled: this.enabled,
        applied: applied,
        total: this.entries.length,
      },
    });
  };

  this.hydrate = payload => {
    if (!payload) {
      return;
    }
    this.entries = Array.isArray(payload.paragraphs) ? payload.paragraphs : [];
    this.reverted = new Set(payload.reverted || []);
    this.enabled = payload.enabled === true;
    this.showEdits = payload.showEdits !== false;
    this.hydrated = true;
    this.render();
  };

  this.setEnabled = enabled => {
    this.enabled = enabled === true;
    this.render();
  };

  this.setShowEdits = showEdits => {
    this.showEdits = showEdits !== false;
    this.render();
  };

  this.setReverted = indices => {
    this.reverted = new Set(indices || []);
    this.render();
  };

  this.revert = index => {
    this.reverted.add(index);
    this.render();
    reader.post({ type: 'ai-revert-paragraph', data: { index: index } });
  };

  this.clear = () => {
    const elements = elementsByIndex();
    for (const entry of this.entries) {
      restoreEntry(elements, entry);
    }
    this.entries = [];
    this.reverted = new Set();
    this.hydrated = false;
    this.enabled = false;
    document.body.classList.remove('ai-edits-hidden');
  };

  document.addEventListener(
    'click',
    event => {
      const mark = event.target.closest && event.target.closest('mark.ai-edit');
      if (!mark) {
        return;
      }
      // The reader's own tap handler toggles the chrome; an edit tap is asking
      // about the edit, not asking for the toolbar.
      event.stopPropagation();
      event.preventDefault();
      const index = Number(mark.dataset.aiIndex);
      reader.post({
        type: 'ai-edit-tap',
        data: {
          index: index,
          original: mark.dataset.aiOriginal || '',
          cleaned: mark.textContent || '',
        },
      });
    },
    true,
  );
})();
