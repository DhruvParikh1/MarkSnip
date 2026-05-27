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

describe('highlighter reader surface', () => {
  let storage;
  let originalGetClientRects;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '<div id="reader"><article><p>Hello reader world.</p></article></div>';
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
    Range.prototype.getClientRects = jest.fn(() => [{
      left: 10,
      right: 120,
      top: 20,
      bottom: 42,
      width: 110,
      height: 22
    }]);

    require('../../contentScript/highlighter.js');
    await Promise.resolve();
    await window.markSnipHighlighter.registerSurface({
      id: 'reader-test',
      root: document.getElementById('reader'),
      article: document.querySelector('article'),
      eventRoot: document.getElementById('reader'),
      selectionRoot: document,
      pageUrl: 'https://example.com/article?utm_source=test#section',
      title: 'Reader Article',
      forceOverlay: true,
      excludeSelector: '.ms-reader-bar'
    });
  });

  afterEach(() => {
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

    const textNode = document.querySelector('article p').firstChild;
    const range = document.createRange();
    range.setStart(textNode, 6);
    range.setEnd(textNode, 12);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    document.getElementById('reader').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 5));

    const normalizedUrl = highlightState.normalizeUrl('https://example.com/article?utm_source=test#section');
    let record = storage.store[highlightState.STORAGE_KEYS.RECORDS][normalizedUrl];
    expect(record.title).toBe('Reader Article');
    expect(record.highlights).toHaveLength(1);
    expect(record.highlights[0].text).toBe('reader');
    expect(record.highlights[0].xpath).toBe('reader:/article/p[1]');
    expect(document.querySelector('article mark.ms-reader-mark')).toBeNull();

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
});
