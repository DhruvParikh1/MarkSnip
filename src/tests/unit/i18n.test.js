const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const i18nSource = fs.readFileSync(
  path.join(__dirname, '../../shared/i18n.js'),
  'utf8'
);

const englishMessages = {
  actionTitle: { message: 'MarkSnip' },
  popupLoadingText: { message: 'Processing page...' },
  popupCopyBtn: { message: 'Copy' },
  optionsTitle: { message: 'Options' },
  popupSendToTargetTitle: {
    message: 'Send to $TARGET$',
    placeholders: {
      target: { content: '$1' }
    }
  },
  inlinePlainText: { message: '{baseURI} - Parsed document/base URI' },
  inlineHtmlText: { message: '<strong>HTML label</strong> - Keeps markup' },
  ambiguousFirst: { message: 'Duplicate Label' },
  ambiguousSecond: { message: 'Duplicate Label' }
};

const spanishMessages = {
  actionTitle: { message: 'MarkSnip' },
  popupLoadingText: { message: 'Procesando página...' },
  popupCopyBtn: { message: 'Copiar' },
  optionsTitle: { message: 'Opciones' },
  popupSendToTargetTitle: {
    message: 'Enviar a $TARGET$',
    placeholders: {
      target: { content: '$1' }
    }
  },
  inlinePlainText: { message: '{baseURI} - URI base del documento analizado' },
  inlineHtmlText: { message: '<strong>Etiqueta HTML</strong> - Conserva formato' },
  ambiguousFirst: { message: 'Primera etiqueta' },
  ambiguousSecond: { message: 'Segunda etiqueta' }
};

function getCatalogMessage(catalog, key, substitutions) {
  if (key === '@@ui_locale') {
    return '';
  }

  let message = catalog[key]?.message || '';
  const values = Array.isArray(substitutions)
    ? substitutions
    : substitutions == null
      ? []
      : [substitutions];

  Object.entries(catalog[key]?.placeholders || {}).forEach(([name, config]) => {
    const slot = String(config.content || '').match(/^\$(\d+)$/);
    const value = values[slot ? Number(slot[1]) - 1 : 0] || '';
    message = message.replaceAll(`$${name.toUpperCase()}$`, value);
  });

  return message;
}

function createDom(html, config = {}) {
  const dom = new JSDOM(html, {
    url: 'https://example.com/options.html',
    runScripts: 'dangerously'
  });

  dom.window.fetch = jest.fn((url) => {
    const urlText = String(url);
    const messages = urlText.includes('/_locales/es/') || urlText.includes('/es/messages.json')
      ? spanishMessages
      : englishMessages;

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(messages)
    });
  });
  const i18nLocale = config.i18nLocale || 'es';
  const i18nCatalog = i18nLocale === 'en' ? englishMessages : spanishMessages;
  dom.window.chrome = {
    runtime: {
      getURL: jest.fn((file) => `chrome-extension://marksnip/${file}`)
    },
    i18n: {
      getMessage: jest.fn((key, substitutions) => {
        if (key === '@@ui_locale') {
          return i18nLocale;
        }
        return getCatalogMessage(i18nCatalog, key, substitutions);
      })
    }
  };
  if (config.browserStorageGet) {
    dom.window.browser = {
      runtime: {
        getURL: dom.window.chrome.runtime.getURL
      },
      storage: {
        sync: {
          get: config.browserStorageGet
        }
      }
    };
  }
  dom.window.eval(i18nSource);
  return dom;
}

function createEnglishDom(html) {
  return createDom(html, { i18nLocale: 'en' });
}

describe('shared i18n helper', () => {
  test('defines non-empty placeholder content in locale catalogs', () => {
    const localesRoot = path.join(__dirname, '../../_locales');
    const violations = [];

    fs.readdirSync(localesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .forEach((entry) => {
        const locale = entry.name;
        const catalogPath = path.join(localesRoot, locale, 'messages.json');
        const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

        Object.entries(catalog).forEach(([key, messageConfig]) => {
          Object.entries(messageConfig.placeholders || {}).forEach(([name, placeholder]) => {
            if (typeof placeholder.content !== 'string' || placeholder.content.trim() === '') {
              violations.push(`${locale}.${key}.${name}`);
            }
          });
        });
      });

    expect(violations).toEqual([]);
  });

  test('localizes explicit keys, exact English strings, attributes, and document language', async () => {
    const dom = createDom(`
      <!doctype html>
      <button data-i18n="popupCopyBtn"></button>
      <span>Copy</span>
      <a title="Options">Settings</a>
    `);

    await dom.window.markSnipI18n.localizeDocument(dom.window.document);

    expect(dom.window.document.querySelector('button').textContent).toBe('Copiar');
    expect(dom.window.document.querySelector('span').textContent).toBe('Copiar');
    expect(dom.window.document.querySelector('a').getAttribute('title')).toBe('Opciones');
    expect(dom.window.document.documentElement.lang).toBe('es');

    dom.window.close();
  });

  test('does not rewrite already-English exact text during localization', async () => {
    const dom = createEnglishDom(`
      <!doctype html>
      <span>Copy</span>
      <a title="Options">Settings</a>
    `);
    let bodyMutations = 0;
    const observer = new dom.window.MutationObserver((mutations) => {
      bodyMutations += mutations.length;
    });
    observer.observe(dom.window.document.body, {
      childList: true,
      characterData: true,
      subtree: true
    });

    await dom.window.markSnipI18n.localizeDocument(dom.window.document);
    await Promise.resolve();

    expect(dom.window.document.querySelector('span').textContent).toBe('Copy');
    expect(dom.window.document.querySelector('a').getAttribute('title')).toBe('Options');
    expect(bodyMutations).toBe(0);

    observer.disconnect();
    dom.window.close();
  });

  test('does not exact-localize ambiguous duplicate English messages', async () => {
    const dom = createDom(`
      <!doctype html>
      <span id="auto">Duplicate Label</span>
      <span id="explicit" data-i18n="ambiguousSecond">Duplicate Label</span>
    `);

    await dom.window.markSnipI18n.localizeDocument(dom.window.document);

    expect(dom.window.document.getElementById('auto').textContent).toBe('Duplicate Label');
    expect(dom.window.document.getElementById('explicit').textContent).toBe('Segunda etiqueta');

    dom.window.close();
  });

  test('does not strip inline markup for plain text exact matches', async () => {
    const dom = createDom(`
      <!doctype html>
      <p id="plain"><code>{baseURI}</code> - Parsed document/base URI</p>
      <p id="html"><strong>HTML label</strong> - Keeps markup</p>
    `);

    await dom.window.markSnipI18n.localizeDocument(dom.window.document);

    expect(dom.window.document.getElementById('plain').innerHTML).toBe('<code>{baseURI}</code> - Parsed document/base URI');
    expect(dom.window.document.querySelector('#plain code')).not.toBeNull();
    expect(dom.window.document.getElementById('html').innerHTML).toBe('<strong>Etiqueta HTML</strong> - Conserva formato');
    expect(dom.window.document.querySelector('#html strong')).not.toBeNull();

    dom.window.close();
  });

  test('does not collapse structural containers whose text matches a message', async () => {
    const dom = createDom(`
      <!doctype html>
      <div class="header-brand">
        <img src="../icons/favicon-32x32.png" alt="MarkSnip logo" class="header-logo">
        <h1 class="app-title">MarkSnip</h1>
        <svg aria-hidden="true"></svg>
      </div>
      <div id="spinner" class="loading-state">
        <div class="loading-shell" aria-hidden="true"></div>
        <div class="loading-indicator" role="status" aria-live="polite">
          <div class="loading-indicator__spinner" aria-hidden="true"></div>
          <p class="loading-text">Processing page...</p>
        </div>
      </div>
    `);

    await dom.window.markSnipI18n.localizeDocument(dom.window.document);

    expect(dom.window.document.querySelector('.header-brand .header-logo')).not.toBeNull();
    expect(dom.window.document.querySelector('.header-brand .app-title').textContent).toBe('MarkSnip');
    expect(dom.window.document.querySelector('.header-brand svg')).not.toBeNull();
    expect(dom.window.document.querySelector('#spinner.loading-state .loading-shell')).not.toBeNull();
    expect(dom.window.document.querySelector('#spinner.loading-state .loading-indicator')).not.toBeNull();
    expect(dom.window.document.querySelector('.loading-indicator__spinner')).not.toBeNull();
    expect(dom.window.document.querySelector('.loading-text').textContent).toBe('Procesando página...');

    dom.window.close();
  });

  test('loads uiLanguage override through browser storage promise API', async () => {
    const browserStorageGet = jest.fn((...args) => {
      if (args.length > 1) {
        throw new Error('browser.storage.sync.get only accepts one argument');
      }
      return Promise.resolve({ uiLanguage: 'es' });
    });
    const dom = createDom('<!doctype html><span>Copy</span>', {
      browserStorageGet,
      i18nLocale: 'en'
    });

    await dom.window.markSnipI18n.localizeDocument(dom.window.document);

    expect(browserStorageGet).toHaveBeenCalledWith({ uiLanguage: 'auto' });
    expect(browserStorageGet.mock.calls[0]).toHaveLength(1);
    expect(dom.window.document.querySelector('span').textContent).toBe('Copiar');
    expect(dom.window.markSnipI18n.locale()).toBe('es');

    dom.window.close();
  });

  test('ready loads uiLanguage override before direct t calls', async () => {
    const dom = createDom('<!doctype html>', {
      browserStorageGet: jest.fn(() => Promise.resolve({ uiLanguage: 'es' })),
      i18nLocale: 'en'
    });

    await dom.window.markSnipI18n.ready();

    expect(dom.window.markSnipI18n.t('popupCopyBtn', null, 'Copy')).toBe('Copiar');
    expect(dom.window.markSnipI18n.locale()).toBe('es');

    dom.window.close();
  });

  test('does not exact-localize user text inserted after observer starts', async () => {
    const dom = createDom(`
      <!doctype html>
      <main id="root">
        <span>Copy</span>
      </main>
    `);

    await dom.window.markSnipI18n.localizeDocument(dom.window.document);
    dom.window.markSnipI18n.observeDocument(dom.window.document);

    const title = dom.window.document.createElement('h3');
    title.className = 'library-card-title';
    title.textContent = 'Copy';
    dom.window.document.getElementById('root').appendChild(title);

    const button = dom.window.document.createElement('button');
    button.setAttribute('data-i18n', 'popupCopyBtn');
    dom.window.document.getElementById('root').appendChild(button);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dom.window.document.querySelector('#root > span').textContent).toBe('Copiar');
    expect(title.textContent).toBe('Copy');
    expect(button.textContent).toBe('Copiar');

    dom.window.close();
  });

  test('orders named placeholder substitutions from the English message catalog', async () => {
    const dom = createDom('<!doctype html>');

    await dom.window.markSnipI18n.loadEnglishMessages();

    expect(
      dom.window.markSnipI18n.t('popupSendToTargetTitle', { target: 'ChatGPT' })
    ).toBe('Enviar a ChatGPT');

    dom.window.close();
  });
});
