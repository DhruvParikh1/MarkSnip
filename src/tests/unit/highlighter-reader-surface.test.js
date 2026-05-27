const highlightState = require('../../shared/highlight-state.js');

function createStorageMock(initial = {}) {
  const store = { ...initial };
  return {
    store,
    get: jest.fn(async (keys) => {
      if (typeof keys === 'string') return { [keys]: store[keys] };
      if (Array.isArray(keys)) {
        return keys.reduce((result, key) => {
          result[key] = store[key];
          return result;
        }, {});
      }
      return { ...store };
    }),
    set: jest.fn(async (payload) => {
      Object.assign(store, payload);
    })
  };
}

function rect(left, right, top = 20, bottom = 42) {
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

describe('highlighter reader surface', () => {
  let storage;
  let originalGetClientRects;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '<main id="page"><article><p>Hello reader world.</p></article></main><div id="reader"><article><p>Hello reader world.</p></article></div>';
    delete window.markSnipHighlighter;
    storage = createStorageMock();
    global.markSnipHighlightState = highlightState;
    window.markSnipHighlightState = highlightState;
    global.browser = {
      storage: {
        local: storage,
        onChanged: { addListener: jest.fn() }
      },
      runtime: {
        onMessage: { addListener: jest.fn() },
        sendMessage: jest.fn().mockResolvedValue({ success: true })
      }
    };
    window.browser = global.browser;

    originalGetClientRects = Range.prototype.getClientRects;
    Range.prototype.getClientRects = jest.fn(() => [rect(10, 120)]);

    require('../../contentScript/highlighter.js');
    await Promise.resolve();
    await window.markSnipHighlighter.registerSurface({
      id: 'reader-test',
      root: document.getElementById('reader'),
      article: document.querySelector('#reader article'),
      eventRoot: document.getElementById('reader'),
      selectionRoot: document,
      pageUrl: window.location.href,
      title: 'Reader Article',
      forceOverlay: true,
      excludeSelector: '.ms-reader-bar'
    });
  });

  afterEach(async () => {
    await window.markSnipHighlighter?.unregisterSurface?.('reader-test').catch?.(() => {});
    await window.markSnipHighlighter?.deactivate?.().catch?.(() => {});
    if (originalGetClientRects) Range.prototype.getClientRects = originalGetClientRects;
    delete global.markSnipHighlightState;
    delete window.markSnipHighlightState;
    delete global.browser;
    delete window.browser;
    delete window.markSnipHighlighter;
    document.body.innerHTML = '';
  });

  test('uses the shared highlighter toolbar, storage, and remove action in reader mode', async () => {
    await window.markSnipHighlighter.toggle({ defaultColor: 'yellow' });

    expect(document.querySelector('.marksnip-highlighter-toolbar')?.textContent).toContain('Select text to highlight');

    const textNode = document.querySelector('#reader article p').firstChild;
    const range = document.createRange();
    range.setStart(textNode, 6);
    range.setEnd(textNode, 12);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    document.getElementById('reader').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 5));

    const normalizedUrl = highlightState.normalizeUrl(window.location.href);
    let record = storage.store[highlightState.STORAGE_KEYS.RECORDS][normalizedUrl];
    expect(record.title).toBe('Reader Article');
    expect(record.highlights).toHaveLength(1);
    expect(record.highlights[0].text).toBe('reader');
    expect(record.highlights[0].xpath).toBe('reader:/article/p[1]');
    expect(document.querySelector('#reader article mark.ms-reader-mark')).toBeNull();

    document.body.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: 20,
      clientY: 25
    }));
    const removeButton = document.querySelector('#marksnip-highlighter-action-pill [data-action="remove"]');
    expect(removeButton).not.toBeNull();

    removeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 5));

    record = storage.store[highlightState.STORAGE_KEYS.RECORDS]?.[normalizedUrl];
    expect(record).toBeUndefined();
  });

  test('merges overlapping fallback overlay rects so inline links do not look double-highlighted', async () => {
    Range.prototype.getClientRects = jest.fn(() => [
      rect(10, 180),
      rect(72, 118, 21, 41)
    ]);

    await window.markSnipHighlighter.unregisterSurface('reader-test');
    const normalizedUrl = highlightState.normalizeUrl(window.location.href);
    storage.store[highlightState.STORAGE_KEYS.RECORDS] = {
      [normalizedUrl]: {
        url: window.location.href,
        normalizedUrl,
        title: 'Reader Article',
        highlights: [{
          id: 'reader-line',
          type: 'text',
          xpath: 'reader:/article/p[1]',
          startOffset: 0,
          endOffset: 19,
          text: 'Hello reader world.',
          contentHtml: 'Hello reader world.',
          color: 'yellow',
          createdAt: '2026-05-27T00:00:00.000Z'
        }]
      }
    };
    await window.markSnipHighlighter.registerSurface({
      id: 'reader-test',
      root: document.getElementById('reader'),
      article: document.querySelector('#reader article'),
      eventRoot: document.getElementById('reader'),
      selectionRoot: document,
      pageUrl: window.location.href,
      title: 'Reader Article',
      forceOverlay: true,
      excludeSelector: '.ms-reader-bar'
    });
    await window.markSnipHighlighter.renderSavedHighlights();

    expect(document.querySelectorAll('.marksnip-highlight-overlay[data-highlight-id]')).toHaveLength(1);
  });

  test('renders fresh reader highlights on the normal page when reader exits', async () => {
    await window.markSnipHighlighter.toggle({ defaultColor: 'yellow' });

    const textNode = document.querySelector('#reader article p').firstChild;
    const range = document.createRange();
    range.setStart(textNode, 6);
    range.setEnd(textNode, 12);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    document.getElementById('reader').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 5));

    const unregistering = window.markSnipHighlighter.unregisterSurface('reader-test');
    document.getElementById('reader').remove();
    await unregistering;

    expect(window.markSnipHighlighter.getHighlights()).toHaveLength(1);
    const overlay = document.querySelector('.marksnip-highlight-overlay[data-highlight-id]');
    expect(overlay).not.toBeNull();
    expect(document.querySelector('#marksnip-highlighter-toolbar')).toBeNull();
  });
});

describe('highlighter reader highlights on the normal page', () => {
  let originalGetClientRects;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<main><article><p>Hello reader world.</p></article></main>';
    delete window.markSnipHighlighter;
    global.markSnipHighlightState = highlightState;
    window.markSnipHighlightState = highlightState;

    const pageUrl = window.location.href;
    const normalizedUrl = highlightState.normalizeUrl(pageUrl);
    const storage = createStorageMock({
      [highlightState.STORAGE_KEYS.RECORDS]: {
        [normalizedUrl]: {
          url: pageUrl,
          normalizedUrl,
          title: 'Normal Page',
          highlights: [{
            id: 'reader-highlight',
            type: 'text',
            xpath: 'reader:/article/p[1]',
            startOffset: 6,
            endOffset: 12,
            text: 'reader',
            contentHtml: 'reader',
            color: 'yellow',
            createdAt: '2026-05-27T00:00:00.000Z'
          }]
        }
      }
    });

    global.browser = {
      storage: {
        local: storage,
        onChanged: { addListener: jest.fn() }
      },
      runtime: {
        onMessage: { addListener: jest.fn() },
        sendMessage: jest.fn().mockResolvedValue({ success: true })
      }
    };
    window.browser = global.browser;

    originalGetClientRects = Range.prototype.getClientRects;
    Range.prototype.getClientRects = jest.fn(() => [rect(10, 120)]);
  });

  afterEach(async () => {
    await window.markSnipHighlighter?.deactivate?.().catch?.(() => {});
    if (originalGetClientRects) Range.prototype.getClientRects = originalGetClientRects;
    delete global.markSnipHighlightState;
    delete window.markSnipHighlightState;
    delete global.browser;
    delete window.browser;
    delete window.markSnipHighlighter;
    document.body.innerHTML = '';
  });

  test('renders reader-created highlights by unique text match after reader exits', async () => {
    require('../../contentScript/highlighter.js');
    await window.markSnipHighlighter.renderSavedHighlights();

    const overlay = document.querySelector('.marksnip-highlight-overlay[data-highlight-id="reader-highlight"]');
    expect(overlay).not.toBeNull();
  });
});
