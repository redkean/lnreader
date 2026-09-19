// Text selection functionality
window.textRemover = new (function () {
  let selectionUI = null;
  let isUIActive = false;
  /**
   * The selection the buttons act on, kept from the last selectionchange.
   * Tapping a button is a tap outside the selected range, so the WebView has
   * already collapsed the selection by the time the handler runs - reading the
   * selection there finds nothing and the action silently does nothing.
   */
  let lastSelectedText = '';

  function createSelectionUI() {
    if (selectionUI) return selectionUI;

    const { div, button } = van.tags;
    selectionUI = div(
      {
        id: 'text-selection-ui',
        style: `
          position: fixed;
          background: color-mix(in srgb, var(--theme-surface), transparent 10%);
          border-radius: 8px;
          padding: 8px;
          z-index: 100000;
          opacity: 0;
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
          transition: opacity 150ms
          `,
      },
      button(
        {
          style: `
            background: var(--theme-secondary);
            color: var(--theme-onSecondary);
            padding: 6px 12px;
            margin: 2px;
            border: 0;
            border-radius: 4px;
            font-size: 12px;
            `,
          onclick: e => {
            if (reader.hidden.val) {
              e.stopPropagation();
            }
            removeSelectedText();
          },
        },
        'Remove',
      ),
      button(
        {
          style: `
            background: var(--theme-secondary);
            color: var(--theme-onSecondary);
            padding: 6px 12px;
            margin: 2px;
            border: 0;
            border-radius: 4px;
            font-size: 12px;
          `,
          onclick: e => {
            if (reader.hidden.val) {
              e.stopPropagation();
            }
            replaceSelectedText();
          },
        },
        'Replace',
      ),
    );

    document.body.appendChild(selectionUI);
    return selectionUI;
  }

  function showSelectionUI() {
    const ui = createSelectionUI();

    // Get selection bounds
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Get UI element heights from CSS variables (with fallbacks)
      const statusBarHeight =
        parseInt(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--StatusBar-currentHeight',
          ),
          10,
        ) || 24;
      const navigationBarHeight =
        parseInt(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--bottom-inset',
          ),
          10,
        ) || 24;
      const readerPadding =
        parseInt(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--readerSettings-padding',
          ),
          10,
        ) || 16;
      const uiHeight = 50; // Approximate height of our UI

      // Calculate available space
      const viewportHeight = window.innerHeight;
      const selectionCenterY = rect.top + rect.height / 2;
      const topSafeArea = statusBarHeight + readerPadding + 10;
      const bottomSafeArea = readerPadding + uiHeight + navigationBarHeight;

      // Position UI based on selection location
      let topPosition;
      if (selectionCenterY < (viewportHeight / 5) * 4) {
        // Selection is in top 4/5, position UI at bottom
        //TODO: make this dynamic
        const avoidScrollbar = reader.generalSettings.val.verticalSeekbar
          ? 0
          : 42;
        const avoidUI = !reader.hidden.val ? 46 + avoidScrollbar : 0;
        topPosition = viewportHeight - bottomSafeArea - avoidUI - 4;
        ui.style.top = topPosition + 'px';
        ui.style.bottom = 'auto';
      } else {
        // Selection is in bottom 1/5, position UI at top (accounting for status bar)
        topPosition = Math.max(topSafeArea, statusBarHeight + 20);
        const avoidUI = !reader.hidden.val ? 34 : 0;
        ui.style.top = topPosition + avoidUI + 'px';
        ui.style.bottom = 'auto';
      }

      // Center horizontally
      ui.style.left = '50%';
      ui.style.transform = 'translateX(-50%)';
    } else {
      // Fallback: position at top if no selection rect available
      ui.style.top = '20px';
      ui.style.left = '50%';
      ui.style.transform = 'translateX(-50%)';
      ui.style.bottom = 'auto';
    }

    ui.style.opacity = '1';
    ui.style.pointerEvents = 'auto';
    isUIActive = true;
  }

  function hideSelectionUI() {
    if (selectionUI) {
      selectionUI.style.opacity = '0';
      // An invisible bar still takes taps, and this one sits over the middle
      // of the page.
      selectionUI.style.pointerEvents = 'none';
    }
    isUIActive = false;
    lastSelectedText = '';
  }

  function getSelectedText() {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      return selection.toString().trim();
    }
    return '';
  }

  function removeSelectedText() {
    const selectedText = lastSelectedText || getSelectedText();
    if (selectedText) {
      reader.post({
        type: 'text-action',
        data: { remove: selectedText },
      });
    }
    hideSelectionUI();
    window.getSelection().removeAllRanges();
  }

  function replaceSelectedText() {
    const selectedText = lastSelectedText || getSelectedText();
    if (selectedText) {
      // For replace, we need user input, so send a different message
      reader.post({
        type: 'text-action',
        data: { replace: selectedText },
      });
    }
    hideSelectionUI();
    window.getSelection().removeAllRanges();
  }

  // Handle text selection
  document.addEventListener('selectionchange', function () {
    const selectedText = getSelectedText();
    if (selectedText) {
      lastSelectedText = selectedText;
      showSelectionUI();
    } else if (!isUIActive) {
      hideSelectionUI();
    }
  });

  // Hide UI when clicking/tapping elsewhere
  document.addEventListener('touchstart', function (e) {
    if (isUIActive && selectionUI && !selectionUI.contains(e.target)) {
      const selectedText = getSelectedText();
      if (!selectedText) {
        hideSelectionUI();
      }
    }
  });

  document.addEventListener('click', function (e) {
    if (isUIActive && selectionUI && !selectionUI.contains(e.target)) {
      const selectedText = getSelectedText();
      if (!selectedText) {
        hideSelectionUI();
      }
    }
  });

  // Hide UI on scroll
  window.addEventListener('scroll', function () {
    hideSelectionUI();
  });
})();

/** A rule written as `/pattern/flags` is matched against the markup. */
const REGEX_RULE = /^\/(.*)\/([gmiyuvsd]*)$/;

const applyRegexToHtml = (html, match, replacement) => {
  try {
    return html.replace(new RegExp(match[1], match[2]), replacement);
  } catch (_e) {
    return html;
  }
};

/**
 * Applies remove/replace rules to the chapter on screen without reloading the
 * WebView, and to `reader.rawHTML` alongside it - the text options (bionic
 * reading, paragraph spacing) rebuild the chapter from that copy, and would
 * otherwise put the removed text back on their next run.
 *
 * Plain rules are matched against the text by `textRules`, because that is
 * what they are: text the reader selected off the page, which almost never
 * appears verbatim in the markup. A `/regex/flags` rule is matched against the
 * markup, which is what the custom-code settings page documents it as.
 */
window.textRemover.applyRules = function (rules) {
  const element = document.querySelector('#LNReader-chapter');
  if (!element || !rules || !rules.length) {
    return;
  }

  const plain = [];
  let changed = false;

  for (const rule of rules) {
    if (!rule || typeof rule.from !== 'string' || !rule.from) {
      continue;
    }
    const to = typeof rule.to === 'string' ? rule.to : '';
    const match = REGEX_RULE.exec(rule.from);
    if (match) {
      element.innerHTML = applyRegexToHtml(element.innerHTML, match, to);
      reader.rawHTML = applyRegexToHtml(reader.rawHTML, match, to);
      changed = true;
    } else {
      plain.push({ from: rule.from, to: to });
    }
  }

  for (const rule of plain) {
    if (window.textRules.apply(element, rule.from, rule.to)) {
      changed = true;
    }
  }
  const raw = window.textRules.applyToHtml(reader.rawHTML, plain);
  if (raw !== reader.rawHTML) {
    reader.rawHTML = raw;
    changed = true;
  }

  if (!changed) {
    return;
  }
  reader.refresh();
  if (typeof schedulePageCalculation === 'function') {
    schedulePageCalculation();
  }
  // The markup the cleaned paragraphs were written into may have just been
  // rewritten under them.
  window.aiCleanup?.render?.();
};

window.textRemover.performRemove = function (text) {
  window.textRemover.applyRules([{ from: text, to: '' }]);
};

window.textRemover.performReplace = function (from, to) {
  window.textRemover.applyRules([{ from: from, to: to }]);
};

/**
 * The rules saved from earlier chapters. The regex ones were already applied
 * to the markup this document was delivered with; the plain ones could not be -
 * they are text, not markup - so they are applied here, once the chapter and
 * any custom JS have had their say.
 */
document.addEventListener('DOMContentLoaded', function () {
  const settings = (reader.readerSettings && reader.readerSettings.val) || {};
  const rules = (settings.removeText || [])
    .filter(text => typeof text === 'string' && !REGEX_RULE.test(text))
    .map(text => ({ from: text, to: '' }));

  const replaceText = settings.replaceText || {};
  for (const from of Object.keys(replaceText)) {
    if (!REGEX_RULE.test(from)) {
      rules.push({ from: from, to: replaceText[from] });
    }
  }

  window.textRemover.applyRules(rules);
});
