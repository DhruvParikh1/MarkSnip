(function () {
  if (window.markSnipHighlighter?.version) {
    return;
  }

  const api = globalThis.markSnipHighlightState;
  if (!api) {
    console.warn('[MarkSnip Highlighter] Missing shared highlight state module.');
    return;
  }

  const TEXT_BLOCK_SELECTOR = 'p, li, blockquote, figcaption, td, th, h1, h2, h3, h4, h5, h6';
  const ELEMENT_SELECTOR = 'figure, picture, img, table, pre';
  const HIGHLIGHT_STYLE_ID = 'marksnip-highlighter-style';
  const TOOLBAR_ID = 'marksnip-highlighter-toolbar';
  const COLOR_PICKER_ID = 'marksnip-highlighter-color-picker';
  const OVERLAY_ID = 'marksnip-highlighter-overlays';
  const ACTION_PILL_ID = 'marksnip-highlighter-action-pill';
  const EDIT_PANEL_ID = 'marksnip-highlighter-edit-panel';
  const MAX_HISTORY = 30;

  const state = {
    version: '1.0.0',
    active: false,
    initialized: false,
    currentColor: api.DEFAULT_COLOR,
    record: null,
    undoStack: [],
    redoStack: [],
    rangesById: new Map(),
    elementById: new Map(),
    storageListenerAdded: false,
    handlers: {},
    actionPillHighlightId: null,
    colorPickerOpen: false,
    toolbarPhase: null, // 'hint' | 'active'
    accentColor: '#6B8E6F',
    editDraftNote: null,       // persisted textarea value while pill is open
    editDraftHighlightId: null,
  };

  function message(key, fallback) {
    return globalThis.markSnipI18n?.t?.(key, null, fallback) || fallback || key;
  }

  function pageUrl() {
    return window.location.href;
  }

  function normalizedPageUrl() {
    return api.normalizeUrl(pageUrl());
  }

  function getPageMetadata() {
    const siteName = document.querySelector('meta[property="og:site_name"]')?.content ||
      document.querySelector('meta[name="application-name"]')?.content ||
      location.hostname;
    return {
      url: pageUrl(),
      normalizedUrl: normalizedPageUrl(),
      title: document.title || '',
      siteName: siteName || ''
    };
  }

  // ─── Styles ────────────────────────────────────────────────────────────────

  function ensureStyle() {
    if (document.getElementById(HIGHLIGHT_STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = HIGHLIGHT_STYLE_ID;
    style.setAttribute('data-marksnip-highlighter-ui', 'true');
    style.textContent = `
      ::highlight(marksnip-highlight-yellow) { background-color: rgba(255, 235, 0, 0.45); color: inherit; }
      ::highlight(marksnip-highlight-green)  { background-color: rgba(168, 217, 119, 0.50); color: inherit; }
      ::highlight(marksnip-highlight-blue)   { background-color: rgba(142, 200, 255, 0.52); color: inherit; }
      ::highlight(marksnip-highlight-pink)   { background-color: rgba(242, 160, 189, 0.52); color: inherit; }
      ::highlight(marksnip-highlight-purple) { background-color: rgba(201, 167, 255, 0.52); color: inherit; }

      html.marksnip-highlighter-active { cursor: crosshair; }

      .marksnip-highlighter-overlay-root {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 2147483643;
      }

      /* ── Highlight overlays ─────────────────────────────────────────── */
      .marksnip-highlight-overlay {
        position: absolute;
        border-radius: 5px;
        background: rgba(255, 235, 0, 0.35);
        box-shadow: 0 0 0 1px rgba(90, 72, 8, 0.14) inset;
        mix-blend-mode: multiply;
        pointer-events: auto;
        cursor: pointer;
        transition: opacity 140ms cubic-bezier(0.23, 1, 0.32, 1);
      }
      .marksnip-highlight-overlay[data-color="green"]  { background: rgba(168, 217, 119, 0.34); box-shadow: 0 0 0 1px rgba(30, 90, 20, 0.14) inset; }
      .marksnip-highlight-overlay[data-color="blue"]   { background: rgba(142, 200, 255, 0.34); box-shadow: 0 0 0 1px rgba(20, 70, 140, 0.14) inset; }
      .marksnip-highlight-overlay[data-color="pink"]   { background: rgba(242, 160, 189, 0.34); box-shadow: 0 0 0 1px rgba(140, 30, 70, 0.14) inset; }
      .marksnip-highlight-overlay[data-color="purple"] { background: rgba(201, 167, 255, 0.34); box-shadow: 0 0 0 1px rgba(80, 30, 140, 0.14) inset; }
      @media (hover: hover) and (pointer: fine) {
        .marksnip-highlight-overlay:hover { opacity: 0.72; }
      }

      /* ── Shared floating UI token ───────────────────────────────────── */
      .marksnip-highlighter-toolbar,
      .marksnip-highlighter-color-picker,
      .marksnip-action-pill,
      .marksnip-edit-panel {
        font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #1c1c1e;
        background: rgba(255, 255, 255, 0.97);
        border: 1px solid rgba(0, 0, 0, 0.09);
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.11), 0 1px 4px rgba(0, 0, 0, 0.07);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      /* ── Toolbar (top-center, two phases) ──────────────────────────────── */
      .marksnip-highlighter-toolbar {
        position: fixed;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 3px;
        padding: 4px 8px;
        border-radius: 999px;
        z-index: 2147483647;
        white-space: nowrap;
        user-select: none;
        pointer-events: auto;
      }
      .ms-toolbar-hint {
        font-size: 13px;
        color: rgba(28, 28, 30, 0.58);
        padding: 2px 5px;
        pointer-events: none;
      }
      .ms-color-dot {
        width: 11px;
        height: 11px;
        border-radius: 50%;
        display: block;
        flex-shrink: 0;
        box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.16);
        pointer-events: none;
      }
      .marksnip-highlighter-toolbar button {
        border: 0;
        background: transparent;
        color: inherit;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        height: 28px;
        padding: 0 8px;
        border-radius: 999px;
        cursor: pointer;
        transition: background-color 120ms ease,
                    transform 120ms cubic-bezier(0.23, 1, 0.32, 1),
                    color 120ms ease;
        flex-shrink: 0;
      }
      .marksnip-highlighter-toolbar button:active { transform: scale(0.95); }
      @media (hover: hover) and (pointer: fine) {
        .marksnip-highlighter-toolbar button:hover { background: rgba(0, 0, 0, 0.06); }
        .marksnip-highlighter-toolbar .ms-clip-btn:hover { opacity: 0.86; background: transparent !important; }
        .marksnip-highlighter-toolbar .ms-danger-btn:hover { background: rgba(162, 50, 50, 0.08) !important; color: #a33 !important; }
      }
      .ms-clip-btn {
        color: #fff !important;
        font-size: 13px;
        font-weight: 500;
        padding: 0 14px !important;
        letter-spacing: -0.01em;
      }
      .ms-clear-btn {
        color: rgba(28, 28, 30, 0.52) !important;
        font-size: 12px;
        gap: 4px;
      }
      .ms-toolbar-divider {
        width: 1px;
        height: 16px;
        background: rgba(0, 0, 0, 0.11);
        margin: 0 2px;
        flex-shrink: 0;
        align-self: center;
      }
      .marksnip-highlighter-toolbar svg { width: 14px; height: 14px; display: block; flex-shrink: 0; }

      /* ── Color picker sub-pill ────────────────────────────────────────── */
      .marksnip-highlighter-color-picker {
        position: fixed;
        left: 50%;
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 6px 10px;
        border-radius: 999px;
        z-index: 2147483647;
        pointer-events: none;
        opacity: 0;
        transform: translateX(-50%) translateY(-5px) scale(0.96);
        transition: opacity 150ms cubic-bezier(0.23, 1, 0.32, 1),
                    transform 150ms cubic-bezier(0.23, 1, 0.32, 1);
      }
      .marksnip-highlighter-color-picker.is-visible {
        opacity: 1;
        pointer-events: auto;
        transform: translateX(-50%) translateY(0) scale(1);
      }

      /* ── Swatches (shared by color picker + edit panel) ──────────────── */
      .marksnip-highlighter-swatch {
        width: 18px;
        min-width: 18px;
        height: 18px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        cursor: pointer;
        flex-shrink: 0;
        box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.12);
        transition: transform 130ms cubic-bezier(0.23, 1, 0.32, 1),
                    box-shadow 130ms cubic-bezier(0.23, 1, 0.32, 1);
      }
      .marksnip-highlighter-swatch:active { transform: scale(0.88); }
      .marksnip-highlighter-swatch.is-active {
        box-shadow: 0 0 0 2px #fff, 0 0 0 3.5px rgba(30, 40, 55, 0.60);
      }
      @media (hover: hover) and (pointer: fine) {
        .marksnip-highlighter-swatch:hover { transform: scale(1.15); }
        .marksnip-highlighter-swatch.is-active:hover { transform: scale(1.0); }
      }

      /* ── Action pill (position: absolute, follows highlight on scroll) ── */
      .marksnip-action-pill {
        position: absolute;
        display: flex;
        align-items: center;
        gap: 0;
        padding: 3px;
        border-radius: 999px;
        z-index: 2147483647;
        pointer-events: auto;
        user-select: none;
      }
      .marksnip-action-pill button {
        border: 0;
        background: transparent;
        color: inherit;
        display: flex;
        align-items: center;
        gap: 5px;
        height: 26px;
        padding: 0 9px;
        border-radius: 999px;
        cursor: pointer;
        font: 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-weight: 450;
        white-space: nowrap;
        flex-shrink: 0;
        transition: background-color 110ms ease,
                    transform 110ms cubic-bezier(0.23, 1, 0.32, 1),
                    color 110ms ease;
      }
      .marksnip-action-pill button:active { transform: scale(0.94); }
      @media (hover: hover) and (pointer: fine) {
        .marksnip-action-pill .ms-remove-btn:hover { background: rgba(162, 50, 50, 0.09) !important; color: #a23 !important; }
        .marksnip-action-pill .ms-edit-btn:hover   { background: rgba(0, 0, 0, 0.06); }
      }
      .marksnip-action-pill svg { width: 13px; height: 13px; display: block; flex-shrink: 0; }
      .marksnip-action-pill-divider {
        width: 1px;
        height: 14px;
        background: rgba(0, 0, 0, 0.11);
        margin: 0 1px;
        flex-shrink: 0;
        align-self: center;
      }

      /* ── Edit panel ────────────────────────────────────────────────────── */
      .marksnip-edit-panel {
        position: fixed;
        width: 272px;
        border-radius: 14px;
        padding: 14px;
        z-index: 2147483647;
        pointer-events: auto;
      }
      .marksnip-edit-panel-label {
        display: block;
        font-size: 10.5px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        opacity: 0.40;
        margin-bottom: 6px;
        user-select: none;
        pointer-events: none;
      }
      .marksnip-edit-panel textarea {
        width: 100%;
        min-height: 74px;
        box-sizing: border-box;
        resize: vertical;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 8px;
        padding: 8px 10px;
        font: 13px/1.48 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: inherit;
        background: transparent;
        outline: none;
        display: block;
        transition: border-color 120ms ease, background-color 120ms ease;
      }
      .marksnip-edit-panel textarea:focus {
        border-color: rgba(0, 0, 0, 0.26);
        background: rgba(0, 0, 0, 0.02);
      }
      .marksnip-edit-panel-section-gap { height: 12px; }
      .marksnip-edit-panel-color-track {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 10px;
        background: rgba(0, 0, 0, 0.04);
        border-radius: 10px;
      }
      .marksnip-edit-panel-color-track .marksnip-highlighter-swatch {
        width: 22px;
        min-width: 22px;
        height: 22px;
      }
      .marksnip-edit-panel-action-row {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        margin-top: 12px;
      }
      .marksnip-edit-panel-save-btn {
        border: 0;
        border-radius: 999px;
        color: #fff !important;
        height: 28px;
        padding: 0 16px;
        font: 500 12.5px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: -0.01em;
        cursor: pointer;
        transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1), opacity 120ms ease;
      }
      .marksnip-edit-panel-save-btn:active { transform: scale(0.95); }
      @media (hover: hover) and (pointer: fine) {
        .marksnip-edit-panel-save-btn:hover { opacity: 0.86; }
      }

      /* ── Dark mode ────────────────────────────────────────────────────── */
      @media (prefers-color-scheme: dark) {
        .marksnip-highlighter-toolbar,
        .marksnip-highlighter-color-picker,
        .marksnip-action-pill,
        .marksnip-edit-panel {
          color: #f2f2f7;
          background: rgba(28, 28, 30, 0.97);
          border-color: rgba(255, 255, 255, 0.09);
          box-shadow: 0 4px 22px rgba(0, 0, 0, 0.45), 0 1px 4px rgba(0, 0, 0, 0.32);
        }
        .ms-toolbar-hint { color: rgba(242, 242, 247, 0.55); }
        .ms-toolbar-divider, .marksnip-action-pill-divider { background: rgba(255, 255, 255, 0.12); }
        .ms-clear-btn { color: rgba(242, 242, 247, 0.48) !important; }
        .marksnip-edit-panel textarea {
          color: #f2f2f7;
          background: transparent;
          border-color: rgba(255, 255, 255, 0.13);
        }
        .marksnip-edit-panel textarea:focus {
          border-color: rgba(255, 255, 255, 0.28);
          background: rgba(255, 255, 255, 0.04);
        }
        .marksnip-edit-panel-color-track { background: rgba(255, 255, 255, 0.07); }
        .marksnip-highlighter-swatch.is-active {
          box-shadow: 0 0 0 2px rgba(28, 28, 30, 0.97), 0 0 0 3.5px rgba(220, 225, 235, 0.65);
        }
        .marksnip-highlight-overlay { mix-blend-mode: screen; }
        @media (hover: hover) and (pointer: fine) {
          .marksnip-highlighter-toolbar button:hover { background: rgba(255, 255, 255, 0.08); }
          .marksnip-highlighter-toolbar .ms-clip-btn:hover { background: transparent !important; }
          .marksnip-highlighter-toolbar .ms-danger-btn:hover { background: rgba(210, 70, 70, 0.14) !important; color: #e07070 !important; }
          .marksnip-action-pill .ms-remove-btn:hover { background: rgba(210, 70, 70, 0.14) !important; color: #e07070 !important; }
          .marksnip-action-pill .ms-edit-btn:hover   { background: rgba(255, 255, 255, 0.08); }
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .marksnip-highlighter-color-picker,
        .marksnip-highlighter-toolbar button,
        .marksnip-action-pill button,
        .marksnip-highlighter-swatch,
        .marksnip-edit-panel-save-btn,
        .marksnip-highlight-overlay { transition: none; }
      }
    `;
    document.documentElement.appendChild(style);
  }

  // ─── Overlay root ─────────────────────────────────────────────────────────

  function getOverlayRoot() {
    let root = document.getElementById(OVERLAY_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = OVERLAY_ID;
      root.className = 'marksnip-highlighter-overlay-root';
      root.setAttribute('data-marksnip-highlighter-ui', 'true');
      document.documentElement.appendChild(root);
    }
    return root;
  }

  function clearRenderedHighlights() {
    if (typeof CSS !== 'undefined' && CSS.highlights?.delete) {
      Object.keys(api.DEFAULT_COLORS).forEach((color) => {
        CSS.highlights.delete(`marksnip-highlight-${color}`);
      });
    }
    document.getElementById(OVERLAY_ID)?.remove();
    state.rangesById.clear();
    state.elementById.clear();
  }

  // ─── XPath / range helpers ─────────────────────────────────────────────────

  function getXPath(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }
    if (element === document.documentElement) {
      return '/html';
    }

    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document) {
      const tag = current.nodeName.toLowerCase();
      let index = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.nodeName.toLowerCase() === tag) {
          index += 1;
        }
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(`${tag}[${index}]`);
      current = current.parentElement;
    }
    return `/${parts.join('/')}`;
  }

  function textOffsetWithin(root, node, nodeOffset) {
    try {
      if (root?.contains?.(node) || root === node) {
        const range = document.createRange();
        range.selectNodeContents(root);
        range.setEnd(node, nodeOffset);
        return range.toString().length;
      }
    } catch {
      // Fall back to the text-node walker below for unusual boundary points.
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    let offset = 0;
    while (current) {
      if (current === node) {
        return offset + nodeOffset;
      }
      offset += current.nodeValue.length;
      current = walker.nextNode();
    }
    return offset;
  }

  function nearestTextBlock(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return element?.closest?.(TEXT_BLOCK_SELECTOR) ||
      element?.closest?.('article, main, section, div') ||
      document.body;
  }

  function cleanHighlightClone(root) {
    root.querySelectorAll?.('script, style, noscript, iframe, object, embed, .marksnip-highlighter-toolbar, .marksnip-highlight-overlay').forEach((node) => node.remove());
    root.querySelectorAll?.('[data-marksnip-highlighter-ui]').forEach((node) => node.remove());
    return root;
  }

  function serializeRange(range) {
    const fragment = range.cloneContents();
    const container = document.createElement('div');
    container.appendChild(fragment);
    cleanHighlightClone(container);
    return container.innerHTML.trim() || api.escapeHtml(range.toString());
  }

  function clippedRangeForBlock(range, block) {
    const blockRange = document.createRange();
    blockRange.selectNodeContents(block);
    const clipped = range.cloneRange();
    if (clipped.compareBoundaryPoints(Range.START_TO_START, blockRange) < 0) {
      clipped.setStart(blockRange.startContainer, blockRange.startOffset);
    }
    if (clipped.compareBoundaryPoints(Range.END_TO_END, blockRange) > 0) {
      clipped.setEnd(blockRange.endContainer, blockRange.endOffset);
    }
    return clipped.collapsed ? null : clipped;
  }

  // ─── Selection → highlights ────────────────────────────────────────────────

  function selectionToTextHighlights(selection) {
    const highlights = [];
    const groupId = api.createId('group');

    for (let i = 0; i < selection.rangeCount; i += 1) {
      const range = selection.getRangeAt(i);
      if (range.collapsed || !range.toString().trim()) {
        continue;
      }

      const root = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
      const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          try {
            return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          } catch {
            return NodeFilter.FILTER_REJECT;
          }
        }
      });

      const blocks = [];
      const seen = new Set();
      let node = walker.nextNode();
      while (node) {
        const block = nearestTextBlock(node);
        if (block && !seen.has(block)) {
          seen.add(block);
          blocks.push(block);
        }
        node = walker.nextNode();
      }

      const targetBlocks = blocks.length ? blocks : [nearestTextBlock(range.startContainer)];
      targetBlocks.forEach((block) => {
        const clipped = clippedRangeForBlock(range, block);
        const text = clipped?.toString().trim();
        if (!clipped || !text) {
          return;
        }

        highlights.push(api.normalizeHighlight({
          id: api.createId('tx'),
          type: 'text',
          xpath: getXPath(block),
          startOffset: textOffsetWithin(block, clipped.startContainer, clipped.startOffset),
          endOffset: textOffsetWithin(block, clipped.endContainer, clipped.endOffset),
          text,
          contentHtml: serializeRange(clipped),
          color: state.currentColor,
          groupId: targetBlocks.length > 1 ? groupId : '',
          createdAt: new Date().toISOString()
        }));
      });
    }

    return highlights;
  }

  function createElementHighlight(element) {
    if (!element || element.closest?.('[data-marksnip-highlighter-ui="true"]')) {
      return null;
    }
    const clone = element.cloneNode(true);
    cleanHighlightClone(clone);
    return api.normalizeHighlight({
      id: api.createId('el'),
      type: 'element',
      xpath: getXPath(element),
      text: element.innerText || element.alt || element.textContent || '',
      contentHtml: clone.outerHTML || '',
      color: state.currentColor,
      createdAt: new Date().toISOString()
    });
  }

  // ─── Storage ───────────────────────────────────────────────────────────────

  async function loadRecord() {
    state.record = await api.loadPageRecord(pageUrl());
    return state.record;
  }

  async function saveRecord(highlights) {
    const metadata = getPageMetadata();
    state.record = await api.savePageRecord({
      ...metadata,
      highlights: api.normalizeHighlightList(highlights)
    });
    return state.record;
  }

  function pushUndo() {
    state.undoStack.push(api.deepClone(state.record?.highlights || []));
    if (state.undoStack.length > MAX_HISTORY) {
      state.undoStack.shift();
    }
    state.redoStack = [];
  }

  async function setHighlights(nextHighlights, options = {}) {
    if (!options.skipHistory) {
      pushUndo();
    }
    await saveRecord(nextHighlights);
    renderHighlights();
    refreshToolbar();
  }

  async function addHighlights(highlights) {
    const additions = api.normalizeHighlightList(highlights);
    if (!additions.length) {
      return [];
    }
    const merged = api.mergeHighlights(state.record?.highlights || [], additions);
    await setHighlights(merged);
    return additions;
  }

  async function highlightCurrentSelection() {
    await ensureLoaded();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) {
      return { ok: false, error: 'No selected text' };
    }
    const additions = selectionToTextHighlights(selection);
    if (!additions.length) {
      return { ok: false, error: 'Selection could not be highlighted' };
    }
    await addHighlights(additions);
    selection.removeAllRanges();
    return { ok: true, count: additions.length };
  }

  async function highlightElement(element) {
    await ensureLoaded();
    const highlight = createElementHighlight(element);
    if (!highlight) {
      return { ok: false, error: 'Element could not be highlighted' };
    }
    await addHighlights([highlight]);
    return { ok: true, count: 1 };
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  function renderTextHighlight(highlight, colorBuckets, overlayRoot) {
    const element = api.getElementByXPath(document, highlight.xpath);
    const range = api.createRangeFromOffsets(element, highlight.startOffset, highlight.endOffset);
    if (!range) {
      return;
    }
    state.rangesById.set(highlight.id, range);
    const color = api.normalizeColor(highlight.color);

    if (typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function') {
      if (!colorBuckets[color]) {
        colorBuckets[color] = [];
      }
      colorBuckets[color].push(range);
      return;
    }

    Array.from(range.getClientRects()).forEach((rect) => {
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      const overlay = document.createElement('div');
      overlay.className = 'marksnip-highlight-overlay';
      overlay.dataset.highlightId = highlight.id;
      overlay.dataset.color = color;
      overlay.setAttribute('data-marksnip-highlighter-ui', 'true');
      overlay.style.left = `${rect.left + window.scrollX}px`;
      overlay.style.top = `${rect.top + window.scrollY}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      overlayRoot.appendChild(overlay);
    });
  }

  function renderElementHighlight(highlight, overlayRoot) {
    const element = api.getElementByXPath(document, highlight.xpath);
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'marksnip-highlight-overlay';
    overlay.dataset.highlightId = highlight.id;
    overlay.dataset.color = api.normalizeColor(highlight.color);
    overlay.setAttribute('data-marksnip-highlighter-ui', 'true');
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.top = `${rect.top + window.scrollY}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlayRoot.appendChild(overlay);
    state.elementById.set(highlight.id, element);
  }

  function renderHighlights() {
    ensureStyle();
    clearRenderedHighlights();
    const highlights = api.normalizeHighlightList(state.record?.highlights || []);
    if (!highlights.length) {
      return;
    }

    const overlayRoot = getOverlayRoot();
    const colorBuckets = {};
    highlights.forEach((highlight) => {
      if (highlight.type === 'element') {
        renderElementHighlight(highlight, overlayRoot);
      } else {
        renderTextHighlight(highlight, colorBuckets, overlayRoot);
      }
    });

    if (typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function') {
      Object.keys(colorBuckets).forEach((color) => {
        CSS.highlights.set(`marksnip-highlight-${color}`, new Highlight(...colorBuckets[color]));
      });
    }
  }

  // ─── Toolbar ──────────────────────────────────────────────────────────────

  const TRASH_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>`;
  const CLOSE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>`;
  const EDIT_SVG  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>`;

  function buildToolbarHint(toolbar) {
    const hint = document.createElement('span');
    hint.className = 'ms-toolbar-hint';
    hint.textContent = message('highlighterSelectHint', 'Select text to highlight');
    toolbar.appendChild(hint);

    addToolbarDivider(toolbar);
    toolbar.appendChild(makeToolbarExitBtn());
  }

  function buildToolbarActive(toolbar, count) {
    // Color dot button
    const colorBtn = document.createElement('button');
    colorBtn.type = 'button';
    colorBtn.className = 'ms-color-btn';
    colorBtn.dataset.action = 'toggle-color';
    colorBtn.title = message('highlighterChangeColor', 'Change color');
    colorBtn.setAttribute('aria-label', 'Change highlight color');
    const dot = document.createElement('span');
    dot.className = 'ms-color-dot';
    dot.style.backgroundColor = api.DEFAULT_COLORS[state.currentColor] || api.DEFAULT_COLORS.yellow;
    colorBtn.appendChild(dot);
    toolbar.appendChild(colorBtn);

    // Clip CTA
    const clipBtn = document.createElement('button');
    clipBtn.type = 'button';
    clipBtn.className = 'ms-clip-btn';
    clipBtn.dataset.action = 'clip';
    clipBtn.textContent = message('highlighterClip', 'Clip highlights');
    clipBtn.style.backgroundColor = state.accentColor;
    toolbar.appendChild(clipBtn);

    // Clear (trash + count)
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'ms-clear-btn ms-danger-btn';
    clearBtn.dataset.action = 'clear';
    clearBtn.title = message('highlighterClearAll', 'Clear all highlights');
    clearBtn.innerHTML = `${TRASH_SVG}<span>${count}</span>`;
    toolbar.appendChild(clearBtn);

    addToolbarDivider(toolbar);
    toolbar.appendChild(makeToolbarExitBtn());
  }

  function addToolbarDivider(toolbar) {
    const d = document.createElement('span');
    d.className = 'ms-toolbar-divider';
    d.setAttribute('aria-hidden', 'true');
    toolbar.appendChild(d);
  }

  function makeToolbarExitBtn() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ms-exit-btn';
    btn.dataset.action = 'exit';
    btn.title = message('highlighterExit', 'Exit highlighter');
    btn.setAttribute('aria-label', 'Exit highlighter');
    btn.innerHTML = CLOSE_SVG;
    return btn;
  }

  function createToolbar() {
    document.getElementById(TOOLBAR_ID)?.remove();
    const toolbar = document.createElement('div');
    toolbar.id = TOOLBAR_ID;
    toolbar.className = 'marksnip-highlighter-toolbar';
    toolbar.setAttribute('data-marksnip-highlighter-ui', 'true');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'MarkSnip Highlighter');

    const highlights = api.normalizeHighlightList(state.record?.highlights || []);
    const count = highlights.length;
    state.toolbarPhase = count > 0 ? 'active' : 'hint';
    if (state.toolbarPhase === 'active') {
      buildToolbarActive(toolbar, count);
    } else {
      buildToolbarHint(toolbar);
    }

    toolbar.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const action = button.dataset.action;
      if (action === 'toggle-color') {
        toggleColorPicker();
      } else if (action === 'clip') {
        const res = await browser.runtime.sendMessage({ type: 'open-popup' });
        if (res && !res.success) {
          const isFirefox = browser.runtime.getURL('/').startsWith('moz-extension://');
          if (isFirefox) {
            alert('To open MarkSnip from the highlighter, go to about:config in Firefox and set this to true:\n\nextensions.openPopupWithoutUserGesture.enabled');
          }
        }
      } else if (action === 'clear') {
        await clearPageHighlights();
      } else if (action === 'exit') {
        await deactivate();
      }
    });

    document.documentElement.appendChild(toolbar);
  }

  function removeToolbar() {
    document.getElementById(TOOLBAR_ID)?.remove();
    removeColorPicker();
    state.toolbarPhase = null;
  }

  function refreshToolbar() {
    const toolbar = document.getElementById(TOOLBAR_ID);
    if (!toolbar) return;

    const highlights = api.normalizeHighlightList(state.record?.highlights || []);
    const count = highlights.length;
    const newPhase = count > 0 ? 'active' : 'hint';

    if (newPhase !== state.toolbarPhase) {
      // Phase transition — full rebuild
      state.toolbarPhase = newPhase;
      toolbar.innerHTML = '';
      if (newPhase === 'active') {
        buildToolbarActive(toolbar, count);
      } else {
        buildToolbarHint(toolbar);
        removeColorPicker();
      }
      return;
    }

    // Same phase — targeted micro-updates
    if (newPhase === 'active') {
      const countEl = toolbar.querySelector('.ms-clear-btn span');
      if (countEl) countEl.textContent = count;
      const dot = toolbar.querySelector('.ms-color-dot');
      if (dot) dot.style.backgroundColor = api.DEFAULT_COLORS[state.currentColor] || api.DEFAULT_COLORS.yellow;
    }
  }

  // ─── Color picker sub-pill ─────────────────────────────────────────────────

  function createColorPicker() {
    document.getElementById(COLOR_PICKER_ID)?.remove();
    const picker = document.createElement('div');
    picker.id = COLOR_PICKER_ID;
    picker.className = 'marksnip-highlighter-color-picker';
    picker.setAttribute('data-marksnip-highlighter-ui', 'true');

    // Position just below toolbar
    const toolbar = document.getElementById(TOOLBAR_ID);
    const tbBottom = toolbar ? toolbar.getBoundingClientRect().bottom + 8 : 60;
    picker.style.top = `${tbBottom}px`;

    Object.entries(api.DEFAULT_COLORS).forEach(([color, value]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'marksnip-highlighter-swatch';
      btn.dataset.action = 'color';
      btn.dataset.color = color;
      btn.style.backgroundColor = value;
      btn.title = color.charAt(0).toUpperCase() + color.slice(1);
      btn.setAttribute('aria-label', `${color} highlight`);
      btn.classList.toggle('is-active', color === state.currentColor);
      picker.appendChild(btn);
    });

    picker.addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-action="color"]');
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      state.currentColor = api.normalizeColor(btn.dataset.color);
      // Sync swatch active state
      picker.querySelectorAll('.marksnip-highlighter-swatch').forEach((sw) => {
        sw.classList.toggle('is-active', sw.dataset.color === state.currentColor);
      });
      // Sync toolbar color dot
      refreshToolbar();
      // Sync edit panel swatches if open
      document.getElementById(EDIT_PANEL_ID)?.querySelectorAll('.marksnip-highlighter-swatch').forEach((sw) => {
        sw.classList.toggle('is-active', sw.dataset.color === state.currentColor);
      });
    });

    document.documentElement.appendChild(picker);
    // Trigger enter animation via rAF (needs one paint cycle)
    window.requestAnimationFrame(() => picker.classList.add('is-visible'));
    state.colorPickerOpen = true;
  }

  function removeColorPicker() {
    const picker = document.getElementById(COLOR_PICKER_ID);
    if (!picker) return;
    picker.classList.remove('is-visible');
    // Remove after transition
    setTimeout(() => picker.remove(), 180);
    state.colorPickerOpen = false;
  }

  function toggleColorPicker() {
    if (state.colorPickerOpen) {
      removeColorPicker();
    } else {
      createColorPicker();
    }
  }

  // ─── Action pill (follows highlight on scroll) ────────────────────────────

  function getHighlightBoundingInfo(highlightId) {
    const range = state.rangesById.get(highlightId);
    if (range) {
      const rects = Array.from(range.getClientRects());
      if (rects.length) {
        let left = Infinity, right = -Infinity, top = Infinity;
        rects.forEach((r) => {
          if (r.left < left) left = r.left;
          if (r.right > right) right = r.right;
          if (r.top < top) top = r.top;
        });
        return { centerX: (left + right) / 2, viewportTop: top };
      }
    }
    const element = state.elementById.get(highlightId);
    if (element) {
      const rect = element.getBoundingClientRect();
      return { centerX: (rect.left + rect.right) / 2, viewportTop: rect.top };
    }
    return null;
  }

  function positionActionPill(pill, centerX, viewportTop) {
    const pillWidth = pill.offsetWidth || 130;
    const pillHeight = pill.offsetHeight || 34;
    const GAP = 7;
    const MARGIN = 8;

    // Convert viewport coords to document coords (position: absolute scrolls with page)
    const docTop = viewportTop + window.scrollY - pillHeight - GAP;
    const minDocTop = window.scrollY + MARGIN;

    const idealLeft = centerX + window.scrollX - pillWidth / 2;
    const minLeft = window.scrollX + MARGIN;
    const maxLeft = window.scrollX + window.innerWidth - pillWidth - MARGIN;

    pill.style.top = `${Math.max(minDocTop, docTop)}px`;
    pill.style.left = `${Math.max(minLeft, Math.min(idealLeft, maxLeft))}px`;
  }

  function showActionPill(highlightId) {
    // Switching to a new highlight — discard any draft from the previous one
    document.getElementById(EDIT_PANEL_ID)?.remove();
    document.getElementById(ACTION_PILL_ID)?.remove();
    state.actionPillHighlightId = null;
    state.editDraftNote = null;
    state.editDraftHighlightId = null;

    const info = getHighlightBoundingInfo(highlightId);
    if (!info) return;

    state.actionPillHighlightId = highlightId;

    const pill = document.createElement('div');
    pill.id = ACTION_PILL_ID;
    pill.className = 'marksnip-action-pill';
    pill.setAttribute('data-marksnip-highlighter-ui', 'true');

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'ms-remove-btn';
    removeBtn.dataset.action = 'remove';
    removeBtn.setAttribute('aria-label', 'Remove highlight');
    removeBtn.innerHTML = `${TRASH_SVG}Remove`;
    pill.appendChild(removeBtn);

    // Divider
    const divider = document.createElement('span');
    divider.className = 'marksnip-action-pill-divider';
    divider.setAttribute('aria-hidden', 'true');
    pill.appendChild(divider);

    // Edit button (icon only)
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'ms-edit-btn';
    editBtn.dataset.action = 'edit';
    editBtn.setAttribute('aria-label', 'Edit highlight');
    editBtn.title = 'Edit color & notes';
    editBtn.innerHTML = EDIT_SVG;
    pill.appendChild(editBtn);

    pill.addEventListener('click', async (event) => {
      const btn = event.target.closest('button[data-action]');
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      if (btn.dataset.action === 'remove') {
        await deleteHighlight(highlightId);
        removeActionPill(); // also removes edit panel + clears draft
      } else if (btn.dataset.action === 'edit') {
        toggleEditPanel(highlightId);
      }
    });

    document.documentElement.appendChild(pill);
    // Initial position (offsetWidth is 0 before first paint — do it twice)
    positionActionPill(pill, info.centerX, info.viewportTop);
    window.requestAnimationFrame(() => positionActionPill(pill, info.centerX, info.viewportTop));
  }

  function removeActionPill() {
    // Remove edit panel directly (bypass removeEditPanel so draft is not saved on dismiss)
    document.getElementById(EDIT_PANEL_ID)?.remove();
    document.getElementById(ACTION_PILL_ID)?.remove();
    state.actionPillHighlightId = null;
    state.editDraftNote = null;
    state.editDraftHighlightId = null;
  }

  function repositionActionPill() {
    if (!state.actionPillHighlightId) return;
    const pill = document.getElementById(ACTION_PILL_ID);
    if (!pill) { state.actionPillHighlightId = null; return; }
    const info = getHighlightBoundingInfo(state.actionPillHighlightId);
    if (!info) { removeActionPill(); return; }
    positionActionPill(pill, info.centerX, info.viewportTop);
  }

  // ─── Edit panel ───────────────────────────────────────────────────────────

  function showEditPanel(highlightId) {
    const highlights = api.normalizeHighlightList(state.record?.highlights || []);
    const highlight = highlights.find((h) => h.id === highlightId || h.groupId === highlightId);
    if (!highlight) return;

    // Remove without saving (we're about to reopen)
    document.getElementById(EDIT_PANEL_ID)?.remove();

    const panel = document.createElement('div');
    panel.id = EDIT_PANEL_ID;
    panel.className = 'marksnip-edit-panel';
    panel.setAttribute('data-marksnip-highlighter-ui', 'true');

    // ── Note section ──────────────────────────────────────────────────────
    const noteLabel = document.createElement('span');
    noteLabel.className = 'marksnip-edit-panel-label';
    noteLabel.textContent = message('highlighterNoteLabel', 'Note');
    panel.appendChild(noteLabel);

    const textarea = document.createElement('textarea');
    textarea.placeholder = message('highlighterNotePlaceholder', 'Add a note…');
    // Restore draft if we're toggling back open for the same highlight session
    textarea.value = (state.editDraftHighlightId === highlightId && state.editDraftNote !== null)
      ? state.editDraftNote
      : (highlight.note || '');
    panel.appendChild(textarea);

    // ── Color section ─────────────────────────────────────────────────────
    const sectionGap = document.createElement('div');
    sectionGap.className = 'marksnip-edit-panel-section-gap';
    panel.appendChild(sectionGap);

    const colorLabel = document.createElement('span');
    colorLabel.className = 'marksnip-edit-panel-label';
    colorLabel.textContent = message('highlighterColorLabel', 'Color');
    panel.appendChild(colorLabel);

    const colorTrack = document.createElement('div');
    colorTrack.className = 'marksnip-edit-panel-color-track';
    let activeColor = api.normalizeColor(highlight.color);
    Object.entries(api.DEFAULT_COLORS).forEach(([color, value]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'marksnip-highlighter-swatch';
      btn.dataset.action = 'color';
      btn.dataset.color = color;
      btn.style.backgroundColor = value;
      btn.title = color.charAt(0).toUpperCase() + color.slice(1);
      btn.setAttribute('aria-label', `${color.charAt(0).toUpperCase() + color.slice(1)} highlight`);
      btn.classList.toggle('is-active', activeColor === color);
      colorTrack.appendChild(btn);
    });
    panel.appendChild(colorTrack);

    // ── Action row ────────────────────────────────────────────────────────
    const actionRow = document.createElement('div');
    actionRow.className = 'marksnip-edit-panel-action-row';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'marksnip-edit-panel-save-btn';
    saveBtn.dataset.action = 'save';
    saveBtn.textContent = message('highlighterSave', 'Save');
    saveBtn.style.backgroundColor = state.accentColor;
    actionRow.appendChild(saveBtn);
    panel.appendChild(actionRow);

    panel.addEventListener('click', async (event) => {
      const btn = event.target.closest('button[data-action]');
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      if (btn.dataset.action === 'color') {
        activeColor = btn.dataset.color;
        await editHighlight(highlight.id, { color: btn.dataset.color, note: textarea.value });
        colorTrack.querySelectorAll('.marksnip-highlighter-swatch').forEach((sw) => {
          sw.classList.toggle('is-active', sw.dataset.color === btn.dataset.color);
        });
      } else if (btn.dataset.action === 'save') {
        // Clear draft on explicit save
        state.editDraftNote = null;
        state.editDraftHighlightId = null;
        await editHighlight(highlight.id, { note: textarea.value });
        document.getElementById(EDIT_PANEL_ID)?.remove();
      }
    });

    document.documentElement.appendChild(panel);

    // Position below the action pill (fixed coords)
    const actionPill = document.getElementById(ACTION_PILL_ID);
    if (actionPill) {
      const pr = actionPill.getBoundingClientRect();
      const panelTop = pr.bottom + 6;
      const panelLeft = Math.max(8, Math.min(pr.left + pr.width / 2 - 136, window.innerWidth - 280));
      panel.style.top = `${panelTop}px`;
      panel.style.left = `${panelLeft}px`;
    } else {
      panel.style.top = '80px';
      panel.style.left = '50%';
      panel.style.transform = 'translateX(-50%)';
    }

    textarea.focus();
  }

  function removeEditPanel() {
    const panel = document.getElementById(EDIT_PANEL_ID);
    if (!panel) return;
    // Save draft so it survives toggle-off/toggle-on within the same pill session
    const textarea = panel.querySelector('textarea');
    if (textarea && state.actionPillHighlightId) {
      state.editDraftNote = textarea.value;
      state.editDraftHighlightId = state.actionPillHighlightId;
    }
    panel.remove();
  }

  function toggleEditPanel(highlightId) {
    if (document.getElementById(EDIT_PANEL_ID)) {
      removeEditPanel(); // saves draft
    } else {
      showEditPanel(highlightId); // restores draft if available
    }
  }

  // ─── Hit testing ──────────────────────────────────────────────────────────

  function findHighlightAtPoint(clientX, clientY) {
    const overlay = document.elementFromPoint(clientX, clientY)?.closest?.('.marksnip-highlight-overlay[data-highlight-id]');
    if (overlay?.dataset.highlightId) {
      return overlay.dataset.highlightId;
    }

    for (const [id, range] of state.rangesById.entries()) {
      const rects = Array.from(range.getClientRects());
      if (rects.some((rect) => clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom)) {
        return id;
      }
    }

    for (const [id, element] of state.elementById.entries()) {
      const rect = element.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return id;
      }
    }

    return '';
  }

  // ─── Highlight mutations ───────────────────────────────────────────────────

  async function editHighlight(id, updates) {
    const current = state.record?.highlights || [];
    const target = current.find((h) => h.id === id);
    const payload = target?.groupId ? { ...updates, groupId: target.groupId } : updates;
    await setHighlights(api.updateHighlight(current, id, payload));
  }

  async function deleteHighlight(id) {
    await setHighlights(api.removeHighlightById(state.record?.highlights || [], id));
  }

  async function clearPageHighlights() {
    if (!state.record?.highlights?.length) return;
    await setHighlights([]);
  }

  async function undo() {
    if (!state.undoStack.length) return;
    state.redoStack.push(api.deepClone(state.record?.highlights || []));
    const previous = state.undoStack.pop();
    await saveRecord(previous);
    renderHighlights();
    refreshToolbar();
  }

  async function redo() {
    if (!state.redoStack.length) return;
    state.undoStack.push(api.deepClone(state.record?.highlights || []));
    const next = state.redoStack.pop();
    await saveRecord(next);
    renderHighlights();
    refreshToolbar();
  }

  // ─── Interaction listeners ─────────────────────────────────────────────────

  function addInteractionListeners() {
    if (state.handlers.click) {
      return;
    }

    state.handlers.mouseup = async () => {
      if (!state.active) return;
      window.setTimeout(() => {
        highlightCurrentSelection().catch(() => {});
      }, 0);
    };

    state.handlers.click = async (event) => {
      const uiNode = event.target.closest?.('[data-marksnip-highlighter-ui="true"]');
      if (uiNode) return;

      const hitId = findHighlightAtPoint(event.clientX, event.clientY);
      if (hitId) {
        event.preventDefault();
        event.stopPropagation();
        // Toggle: same highlight dismisses, new highlight replaces
        if (state.actionPillHighlightId === hitId) {
          removeActionPill(); // clears pill + edit panel + draft
        } else {
          showActionPill(hitId); // clears old draft, starts fresh for new highlight
        }
        return;
      }

      // Click on empty area — dismiss pill/panel
      if (state.actionPillHighlightId || document.getElementById(EDIT_PANEL_ID)) {
        removeActionPill(); // clears pill + edit panel + draft
        return;
      }

      if (!state.active) return;

      const selection = window.getSelection();
      if (selection?.toString?.().trim()) return;

      const element = event.target.closest?.(ELEMENT_SELECTOR);
      if (element && !element.closest('[data-marksnip-highlighter-ui="true"]')) {
        event.preventDefault();
        event.stopPropagation();
        await highlightElement(element);
      }
    };

    state.handlers.keydown = async (event) => {
      if (event.key === 'Escape') {
        if (state.colorPickerOpen) { removeColorPicker(); return; }
        if (document.getElementById(EDIT_PANEL_ID)) { removeEditPanel(); return; }
        if (state.actionPillHighlightId) { removeActionPill(); return; }
        if (state.active) await deactivate();
        return;
      }
      if (!state.active) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        await undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        await redo();
      }
    };

    state.handlers.reposition = () => {
      window.requestAnimationFrame(() => {
        renderHighlights();
        repositionActionPill();
        // Edit panel is position:fixed — close it when layout shifts (scroll/resize)
        // so it doesn't detach visually from the action pill
        if (document.getElementById(EDIT_PANEL_ID)) {
          removeEditPanel();
        }
      });
    };

    // Cursor pointer on highlight hover (works for both overlay & CSS Highlight API text)
    state.handlers._rafPending = false;
    state.handlers.mousemove = (event) => {
      if (state.handlers._rafPending) return;
      const hasHighlights = !!(state.record?.highlights?.length);
      if (!hasHighlights) return;
      state.handlers._rafPending = true;
      window.requestAnimationFrame(() => {
        state.handlers._rafPending = false;
        const hit = findHighlightAtPoint(event.clientX, event.clientY);
        if (hit) {
          // Use setProperty with 'important' to beat crosshair !important in active mode
          document.documentElement.style.setProperty('cursor', 'pointer', 'important');
        } else {
          document.documentElement.style.removeProperty('cursor');
        }
      });
    };

    document.addEventListener('mouseup', state.handlers.mouseup, true);
    document.addEventListener('click', state.handlers.click, true);
    document.addEventListener('keydown', state.handlers.keydown, true);
    document.addEventListener('mousemove', state.handlers.mousemove, false);
    window.addEventListener('scroll', state.handlers.reposition, true);
    window.addEventListener('resize', state.handlers.reposition, true);
  }

  // ─── Storage listener ──────────────────────────────────────────────────────

  function addStorageListener() {
    if (state.storageListenerAdded || !browser?.storage?.onChanged) {
      return;
    }
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes[api.STORAGE_KEYS.RECORDS]) {
        return;
      }
      const records = api.normalizeRecords(changes[api.STORAGE_KEYS.RECORDS].newValue || {});
      const nextRecord = records[normalizedPageUrl()] || api.normalizePageRecord(getPageMetadata());
      state.record = nextRecord;
      renderHighlights();
      refreshToolbar();
    });
    state.storageListenerAdded = true;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async function ensureLoaded() {
    ensureStyle();
    addInteractionListeners();
    addStorageListener();
    if (!state.record || state.record.normalizedUrl !== normalizedPageUrl()) {
      await loadRecord();
    }
    return state.record;
  }

  async function renderSavedHighlights() {
    await ensureLoaded();
    renderHighlights();
    return { ok: true, count: state.record?.highlights?.length || 0 };
  }

  function applyOptions(options = {}) {
    state.currentColor = api.normalizeColor(options.defaultColor || options.highlightDefaultColor || state.currentColor);
    if (options.accentColor) {
      state.accentColor = options.accentColor;
    }
  }

  async function activate(options = {}) {
    await ensureLoaded();
    state.active = true;
    applyOptions(options);
    document.documentElement.classList.add('marksnip-highlighter-active');
    createToolbar();
    renderHighlights();
    return { ok: true, active: true, count: state.record?.highlights?.length || 0 };
  }

  async function deactivate() {
    state.active = false;
    document.documentElement.classList.remove('marksnip-highlighter-active');
    document.documentElement.style.removeProperty('cursor');
    removeToolbar();
    removeActionPill();
    removeEditPanel();
    renderHighlights();
    return { ok: true, active: false };
  }

  async function toggle(options = {}) {
    return state.active ? await deactivate() : await activate(options);
  }

  // ─── Message listener ─────────────────────────────────────────────────────

  browser.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.type === 'MARKSNIP_HIGHLIGHTER_TOGGLE')              return toggle(msg.options || {});
    if (msg.type === 'MARKSNIP_HIGHLIGHTER_ACTIVATE')            return activate(msg.options || {});
    if (msg.type === 'MARKSNIP_HIGHLIGHTER_RENDER')              return renderSavedHighlights();
    if (msg.type === 'MARKSNIP_HIGHLIGHTER_HIGHLIGHT_SELECTION') {
      applyOptions(msg.options || {});
      return highlightCurrentSelection();
    }
    if (msg.type === 'MARKSNIP_HIGHLIGHTER_CLEAR')               return clearPageHighlights().then(() => ({ ok: true }));
    return false;
  });

  window.markSnipHighlighter = {
    version: state.version,
    activate,
    deactivate,
    toggle,
    renderSavedHighlights,
    highlightCurrentSelection,
    clearPageHighlights,
    getHighlights: () => api.deepClone(state.record?.highlights || [])
  };

  ensureLoaded().then(renderHighlights).catch((error) => {
    console.warn('[MarkSnip Highlighter] Failed to initialize:', error);
  });
})();
