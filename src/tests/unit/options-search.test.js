const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Load search-core first — options-search depends on globalThis.markSnipSearchCore
require('../../shared/search-core.js');
const optionsSearch = require('../../options/options-search.js');

const optionsHtml = fs.readFileSync(
  path.join(__dirname, '../../options/options.html'),
  'utf8'
);
const searchCoreSource = fs.readFileSync(
  path.join(__dirname, '../../shared/search-core.js'),
  'utf8'
);
const optionsSearchSource = fs.readFileSync(
  path.join(__dirname, '../../options/options-search.js'),
  'utf8'
);
const optionsStateSource = fs.readFileSync(
  path.join(__dirname, '../../shared/options-state.js'),
  'utf8'
);
const webhookUtilsSource = fs.readFileSync(
  path.join(__dirname, '../../shared/webhook-utils.js'),
  'utf8'
);
const templateUtilsSource = fs.readFileSync(
  path.join(__dirname, '../../shared/template-utils.js'),
  'utf8'
);
const optionsSource = fs.readFileSync(
  path.join(__dirname, '../../options/options.js'),
  'utf8'
);
const libraryStateSource = fs.readFileSync(
  path.join(__dirname, '../../shared/library-state.js'),
  'utf8'
);
const moment = require('../../background/moment.min.js');
const { defaultOptions: sharedDefaultOptions } = require('../../shared/default-options.js');

const baseOptions = {
  headingStyle: 'atx',
  hr: '___',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  preserveCodeFormatting: false,
  autoDetectCodeLanguage: true,
  emDelimiter: '_',
  strongDelimiter: '**',
  linkStyle: 'inlined',
  linkReferenceStyle: 'full',
  imageStyle: 'markdown',
  imageRefStyle: 'inlined',
  tableFormatting: {
    stripLinks: true,
    stripFormatting: false,
    prettyPrint: true,
    centerText: true
  },
  frontmatter: 'frontmatter',
  backmatter: 'backmatter',
  title: '{pageTitle}',
  includeTemplate: false,
  saveAs: false,
  downloadImages: false,
  imagePrefix: '{pageTitle}/',
  mdClipsFolder: '',
  disallowedChars: '[]#^',
  disallowedCharReplacement: '',
  downloadMode: 'downloadsApi',
  defaultExportType: 'markdown',
  defaultSendToTarget: 'chatgpt',
  sendToCustomTargets: [],
  sendToMaxUrlLength: 3600,
  turndownEscape: true,
  hashtagHandling: 'keep',
  contextMenus: true,
  contextMenuItems: sharedDefaultOptions.contextMenuItems,
  batchProcessingEnabled: true,
  obsidianIntegration: false,
  obsidianVault: '',
  obsidianFolder: '',
  popupTheme: 'system',
  specialTheme: 'none',
  colorBlindTheme: 'deuteranopia',
  specialThemeIcon: true,
  popupAccent: 'sage',
  compactMode: false,
  elementPickerEnabled: true,
  elementPickerDoneAction: 'popup',
  showUserGuideIcon: true,
  editorTheme: 'default',
  uiLanguage: 'auto',
  siteRules: []
};

function mergeOptions(overrides = {}) {
  return {
    ...baseOptions,
    ...overrides,
    tableFormatting: {
      ...baseOptions.tableFormatting,
      ...(overrides.tableFormatting || {})
    }
  };
}

function getCardLabel(card) {
  return (
    card.id ||
    card.querySelector('.card-title')?.textContent?.trim() ||
    card.querySelector('.toggle-label-text')?.textContent?.trim() ||
    card.querySelector('.input-label')?.textContent?.trim() ||
    ''
  );
}

function loadOptionsDocument() {
  return new JSDOM(optionsHtml, {
    url: 'https://example.com/options.html'
  });
}

function getMatchIds(index, query) {
  return optionsSearch.searchSettings(index, query).matches.map(result => result.card.id);
}

function getMatchLabels(index, query) {
  return optionsSearch.searchSettings(index, query).matches.map(result => getCardLabel(result.card));
}

const specialThemeCases = [
  { label: 'OpenAI', slug: 'openai', keyword: 'chatgpt' },
  { label: 'ATLA', slug: 'atla', keyword: 'avatar' },
  { label: 'Ben 10', slug: 'ben10', keyword: 'omnitrix' },
  { label: 'Color Blind Deuteranopia', slug: 'colorblind', colorBlindTheme: 'deuteranopia', keyword: 'deuteranopia' },
  { label: 'Color Blind Protanopia', slug: 'colorblind', colorBlindTheme: 'protanopia', keyword: 'protanopia' },
  { label: 'Color Blind Tritanopia', slug: 'colorblind', colorBlindTheme: 'tritanopia', keyword: 'tritanopia' }
];

async function waitFor(windowObject, ms) {
  await new Promise(resolve => windowObject.setTimeout(resolve, ms));
}

async function waitForMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

async function flushPendingPromises(count = 20) {
  for (let i = 0; i < count; i += 1) {
    await Promise.resolve();
  }
}

function createOptionsPageDom(optionOverrides = {}, libraryOverrides = {}, config = {}) {
  const dom = new JSDOM(optionsHtml, {
    url: 'https://example.com/options.html',
    pretendToBeVisual: true,
    runScripts: 'dangerously'
  });

  const storedOptions = mergeOptions(optionOverrides);
  const defaultOptionsForDom = {
    defaultWebhookBodyTemplate: sharedDefaultOptions.defaultWebhookBodyTemplate,
    ...(config.defaultOptionOverrides ? mergeOptions(config.defaultOptionOverrides) : storedOptions)
  };
  let localState = {
    librarySettings: {
      enabled: true,
      autoSaveOnPopupOpen: true,
      itemsToKeep: 10,
      ...libraryOverrides.settings
    },
    libraryItems: Array.isArray(libraryOverrides.items) ? libraryOverrides.items.slice() : []
  };
  const browser = {
    storage: {
      sync: {
        get: jest.fn(() => Promise.resolve(storedOptions)),
        set: jest.fn(() => Promise.resolve())
      },
      local: {
        get: jest.fn((keys) => {
          if (typeof keys === 'string') {
            return Promise.resolve({ [keys]: localState[keys] });
          }
          if (Array.isArray(keys)) {
            return Promise.resolve(keys.reduce((acc, key) => {
              acc[key] = localState[key];
              return acc;
            }, {}));
          }
          return Promise.resolve({ ...localState });
        }),
        set: jest.fn((payload) => {
          localState = { ...localState, ...payload };
          return Promise.resolve();
        }),
        remove: jest.fn((keys) => {
          const keyList = Array.isArray(keys) ? keys : [keys];
          keyList.forEach((key) => {
            delete localState[key];
          });
          return Promise.resolve();
        })
      }
    },
    runtime: {
      getURL: jest.fn(() => 'chrome-extension://marksnip/')
    },
    contextMenus: {
      update: jest.fn(() => Promise.resolve()),
      removeAll: jest.fn(() => Promise.resolve())
    },
    downloads: {}
  };

  dom.window.browser = browser;
  dom.window.chrome = browser;
  dom.window.moment = moment;
  dom.window.createMenus = jest.fn();
  dom.window.eval(`var defaultOptions = ${JSON.stringify(defaultOptionsForDom)};`);
  dom.window.eval(searchCoreSource);
  dom.window.eval(libraryStateSource);
  dom.window.eval(optionsStateSource);
  dom.window.eval(webhookUtilsSource);
  dom.window.eval(optionsSearchSource);
  dom.window.eval(templateUtilsSource);
  dom.window.eval(optionsSource);

  return {
    dom,
    browser,
    storedOptions,
    getLocalState: () => ({ ...localState })
  };
}

describe('Options search helper', () => {
  let dom;
  let index;

  beforeEach(() => {
    dom = loadOptionsDocument();
    index = optionsSearch.buildSearchIndex(dom.window.document);
  });

  afterEach(() => {
    dom.window.close();
  });

  test('obsdn only surfaces obsidian-related cards', () => {
    const matches = getMatchIds(index, 'obsdn');

    expect(matches).toEqual([
      'obsidian-container',
      'obsidianVault',
      'imageOptions'
    ]);
  });

  test('imgstyl stays focused on image style instead of unrelated cards', () => {
    expect(getMatchIds(index, 'imgstyl')).toEqual(['imageOptions']);
  });

  test('dwnld matches download settings without admitting clips folder', () => {
    const matches = getMatchIds(index, 'dwnld');

    expect(matches).toEqual([
      'downloadMode',
      'downloadImages-container'
    ]);
    expect(matches).not.toContain('mdClipsFolder');
    expect(matches).not.toContain('editorThemeGroup');
    expect(matches).not.toContain('includeTemplate-container');
  });

  test('downld falls back to the weaker fuzzy stage when strict search finds nothing', () => {
    const search = optionsSearch.searchSettings(index, 'downld');

    expect(search.stage).toBe('fallback');
    expect(search.matches.map(result => result.card.id)).toEqual([
      'contextMenus-container',
      'downloadMode',
      'downloadImages-container'
    ]);
    expect(search.matches.map(result => result.card.id)).not.toContain('mdClipsFolder');
  });

  test('downloads category search includes the downloads subgroup settings', () => {
    const search = optionsSearch.searchSettings(index, 'downloads');

    expect(search.stage).toBe('strict');
    expect(search.matches.map(result => result.card.id)).toEqual(expect.arrayContaining([
      'downloadMode',
      'saveAs-container',
      'downloadImages-container',
      'imagePrefix',
      'mdClipsFolder'
    ]));
  });

  test('exact searches still resolve expected settings', () => {
    expect(getMatchIds(index, 'save as')).toContain('saveAs-container');
    expect(getMatchIds(index, 'default export')).toContain('defaultExportTypeGroup');
    expect(getMatchIds(index, 'plain text')).toContain('defaultExportTypeGroup');
    expect(getMatchIds(index, 'txt')).toContain('defaultExportTypeGroup');
    expect(getMatchIds(index, 'html')).toContain('defaultExportTypeGroup');
    expect(getMatchIds(index, 'pdf')).toContain('defaultExportTypeGroup');
    expect(getMatchIds(index, 'copy')).toContain('defaultExportTypeGroup');
    expect(getMatchIds(index, 'copy to clipboard')).toContain('defaultExportTypeGroup');
    expect(getMatchIds(index, 'send to')).toContain('defaultExportTypeGroup');
    expect(getMatchIds(index, 'assistant target')).toContain('defaultSendToTargetCard');
    expect(getMatchIds(index, 'custom url')).toContain('assistantTargetsCard');
    expect(getMatchIds(index, 'url length')).toContain('sendToMaxUrlLengthCard');
    expect(getMatchIds(index, 'clipboard fallback')).toContain('sendToMaxUrlLengthCard');
    expect(getMatchIds(index, 'chatgpt')).toContain('assistantTargetsCard');
    expect(getMatchIds(index, 'perplexity')).toContain('assistantTargetsCard');
    expect(getMatchLabels(index, 'frontmatter')).toContain('Front-matter template');
    expect(getMatchLabels(index, 'backmatter')).toContain('Back-matter template');
    expect(getMatchIds(index, 'base64')).toContain('imageOptions');
    expect(getMatchIds(index, 'highlight')).toContain('codeBlockStyle');
    expect(getMatchIds(index, 'highlightjs')).toContain('codeBlockStyle');
    expect(getMatchIds(index, 'highlight.js')).toContain('codeBlockStyle');
    expect(getMatchIds(index, 'shortcut')).toContain('linkReferenceStyle');
    expect(getMatchIds(index, 'hashtag')).toContain('hashtagHandling-container');
    expect(getMatchIds(index, 'batch processing')).toContain('batchProcessingEnabled-container');
    expect(getMatchIds(index, 'element picker')).toContain('elementPickerGroup');
    expect(getMatchIds(index, 'manual extraction')).toContain('elementPickerGroup');
    expect(getMatchIds(index, 'copy picked element')).toContain('elementPickerGroup');
    expect(getMatchIds(index, 'obsidian vault')).toContain('obsidianVault');
    expect(getMatchIds(index, 'download images')).toContain('downloadImages-container');
    expect(getMatchIds(index, 'guide icon')).toContain('popupBehaviorGroup');
  });

  test('library search surfaces the new local-only library controls', () => {
    const matchIds = getMatchIds(index, 'library');
    const matchLabels = getMatchLabels(index, 'library');

    expect(matchIds).toContain('libraryAutoSave-container');
    expect(matchIds).toContain('libraryItemsToKeep-container');
    expect(matchLabels).toContain('Enable Library');
    expect(matchLabels).toContain('Clear Library');
  });

  test('excluded examples and reference details do not affect search results', () => {
    expect(getMatchIds(index, 'google')).toEqual([]);
    expect(getMatchIds(index, 'format reference')).toEqual([]);
    expect(getMatchIds(index, 'preview uses example metadata')).toEqual([]);
  });
});

describe('Options page search UI', () => {
  test('shows the no-results state for unmatched queries', async () => {
    const { dom } = createOptionsPageDom();
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();

    const searchInput = document.getElementById('settings-search');
    const noResults = document.getElementById('search-no-results');
    const noResultsQuery = document.getElementById('search-no-results-query');
    const searchStatus = document.getElementById('settings-search-status');

    searchInput.value = 'google';
    searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await waitFor(dom.window, 200);

    expect(noResults.classList.contains('visible')).toBe(true);
    expect(noResultsQuery.textContent).toBe('google');
    expect(searchStatus.hidden).toBe(false);
    expect(searchStatus.textContent).toBe('No settings match "google"');
  });

  test('announces the live result count for matched queries', async () => {
    const { dom } = createOptionsPageDom();
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();

    const searchInput = document.getElementById('settings-search');
    const searchStatus = document.getElementById('settings-search-status');
    const totalSettings = document.querySelectorAll('.setting-card').length;
    const matchCount = optionsSearch.searchSettings(optionsSearch.buildSearchIndex(document), 'theme').matches.length;

    searchInput.value = 'theme';
    searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await waitFor(dom.window, 200);

    expect(searchStatus.hidden).toBe(false);
    expect(searchStatus.textContent).toBe(`Showing ${matchCount} of ${totalSettings} settings`);
  });

  test('clearing search restores the active tab and conditional visibility', async () => {
    const { dom } = createOptionsPageDom({
      downloadMode: 'contentLink',
      downloadImages: false
    });

    const { document, sessionStorage } = dom.window;
    sessionStorage.setItem('marksnip-options-tab', 'appearance');

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    const appearanceSection = document.getElementById('section-appearance');
    const downloadsSection = document.getElementById('section-downloads');
    const imagePrefixCard = document.getElementById('imagePrefix');
    const searchInput = document.getElementById('settings-search');
    const searchStatus = document.getElementById('settings-search-status');

    expect(appearanceSection.classList.contains('active')).toBe(true);
    expect(downloadsSection.classList.contains('active')).toBe(false);
    expect(imagePrefixCard.style.display).toBe('none');

    searchInput.value = 'image prefix';
    searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await waitFor(dom.window, 200);

    expect(document.querySelector('.content-panel').classList.contains('search-active')).toBe(true);
    expect(imagePrefixCard.classList.contains('search-match')).toBe(true);
    expect(imagePrefixCard.style.display).toBe('');

    searchInput.focus();
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    expect(document.querySelector('.content-panel').classList.contains('search-active')).toBe(false);
    expect(appearanceSection.classList.contains('active')).toBe(true);
    expect(downloadsSection.classList.contains('active')).toBe(false);
    expect(imagePrefixCard.classList.contains('search-match')).toBe(false);
    expect(imagePrefixCard.style.display).toBe('none');
    expect(searchStatus.hidden).toBe(true);
    expect(searchStatus.textContent).toBe('');
  });

  test('reset all restores library defaults without deleting library items', async () => {
    const { dom, browser, getLocalState } = createOptionsPageDom({}, {
      settings: {
        enabled: false,
        autoSaveOnPopupOpen: false,
        itemsToKeep: 3
      },
      items: [{ id: 'saved-item' }]
    });
    const { document } = dom.window;

    dom.window.confirm = jest.fn(() => true);
    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    document.getElementById('reset-all').click();
    await waitForMicrotasks();

    expect(browser.storage.local.set).toHaveBeenCalledWith({
      librarySettings: {
        enabled: true,
        autoSaveOnPopupOpen: true,
        itemsToKeep: 10
      }
    });
    expect(getLocalState().libraryItems).toEqual([{ id: 'saved-item' }]);
  });

  test('language card reset applies the default language without waiting for manual reload', async () => {
    const { dom, browser } = createOptionsPageDom({ uiLanguage: 'es' }, {}, {
      defaultOptionOverrides: { uiLanguage: 'auto' }
    });
    const { document } = dom.window;
    const setUiLanguage = jest.fn(() => Promise.resolve());
    dom.window.markSnipI18n = {
      localizeDocument: jest.fn(() => Promise.resolve()),
      t: jest.fn((key, substitutions, fallback) => fallback || key),
      setUiLanguage
    };

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    const timeoutSpy = jest.fn();
    dom.window.setTimeout = timeoutSpy;
    document.querySelector('#uiLanguageGroup .reset-setting-link').click();
    await flushPendingPromises();

    expect(browser.storage.sync.set).toHaveBeenCalledWith(expect.objectContaining({
      uiLanguage: 'auto'
    }));
    expect(setUiLanguage).toHaveBeenCalledWith('auto');
    expect(timeoutSpy.mock.calls.some(([, delay]) => delay === 400)).toBe(true);
  });

  test('reset all applies a changed language default without waiting for manual reload', async () => {
    const { dom, browser } = createOptionsPageDom({ uiLanguage: 'es' }, {}, {
      defaultOptionOverrides: { uiLanguage: 'auto' }
    });
    const { document } = dom.window;
    const setUiLanguage = jest.fn(() => Promise.resolve());
    dom.window.markSnipI18n = {
      localizeDocument: jest.fn(() => Promise.resolve()),
      t: jest.fn((key, substitutions, fallback) => fallback || key),
      setUiLanguage
    };
    dom.window.confirm = jest.fn(() => true);

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    const timeoutSpy = jest.fn();
    dom.window.setTimeout = timeoutSpy;
    document.getElementById('reset-all').click();
    await flushPendingPromises();

    expect(browser.storage.sync.set).toHaveBeenCalledWith(expect.objectContaining({
      uiLanguage: 'auto'
    }));
    expect(setUiLanguage).toHaveBeenCalledWith('auto');
    expect(timeoutSpy.mock.calls.some(([, delay]) => delay === 400)).toBe(true);
  });

  test('clear library removes saved library items from local storage', async () => {
    const { dom, browser } = createOptionsPageDom({}, {
      items: [{ id: 'saved-item' }]
    });
    const { document } = dom.window;

    dom.window.confirm = jest.fn(() => true);
    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();

    document.getElementById('clear-library').click();
    await waitForMicrotasks();

    expect(browser.storage.local.remove).toHaveBeenCalledWith('libraryItems');
  });

  test('export payload includes library settings but excludes library items', async () => {
    const { dom } = createOptionsPageDom({ defaultExportType: 'html' }, {
      settings: {
        enabled: false,
        autoSaveOnPopupOpen: false,
        itemsToKeep: 4
      },
      items: [{ id: 'saved-item' }]
    });
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    const payload = dom.window.buildExportPayload();

    expect(payload.librarySettings).toEqual({
      enabled: false,
      autoSaveOnPopupOpen: false,
      itemsToKeep: 4
    });
    expect(payload.defaultExportType).toBe('html');
    expect(payload.libraryItems).toBeUndefined();
  });

  test('import restores library settings when present in the backup payload', async () => {
    const { dom, browser } = createOptionsPageDom();
    const { document } = dom.window;

    class MockFileReader {
      readAsText() {
        this.onload({
          target: {
            result: JSON.stringify({
              ...mergeOptions({ popupTheme: 'dark', defaultExportType: 'text' }),
              librarySettings: {
                enabled: false,
                autoSaveOnPopupOpen: false,
                itemsToKeep: 4
              },
              libraryItems: [{ id: 'should-be-ignored' }]
            })
          }
        });
      }
    }

    dom.window.FileReader = MockFileReader;
    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    const importInput = document.getElementById('import-file');
    Object.defineProperty(importInput, 'files', {
      configurable: true,
      value: [{}]
    });

    importInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    expect(browser.storage.local.set).toHaveBeenCalledWith({
      librarySettings: {
        enabled: false,
        autoSaveOnPopupOpen: false,
        itemsToKeep: 4
      }
    });
    expect(document.getElementById('libraryEnabled').checked).toBe(false);
    expect(document.getElementById('libraryAutoSaveOnPopupOpen').checked).toBe(false);
    expect(document.getElementById('libraryItemsToKeep').value).toBe('4');
    expect(document.getElementById('export-text').checked).toBe(true);
  });

  test('restores and saves the popup default export format', async () => {
    const { dom, browser } = createOptionsPageDom({ defaultExportType: 'pdf' });
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    expect(document.getElementById('export-pdf').checked).toBe(true);

    const htmlOption = document.getElementById('export-html');
    htmlOption.checked = true;
    htmlOption.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await waitForMicrotasks();

    expect(browser.storage.sync.set).toHaveBeenCalledWith(expect.objectContaining({
      defaultExportType: 'html'
    }));
  });

  test('restores and saves the default assistant target for popup send-to mode', async () => {
    const { dom, browser } = createOptionsPageDom({
      defaultExportType: 'sendTo',
      defaultSendToTarget: 'claude'
    });
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    expect(document.getElementById('export-send-to').checked).toBe(true);
    expect(document.getElementById('send-to-target-claude').checked).toBe(true);

    const chatgptOption = document.getElementById('send-to-target-chatgpt');
    chatgptOption.checked = true;
    chatgptOption.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await waitForMicrotasks();

    expect(browser.storage.sync.set).toHaveBeenCalledWith(expect.objectContaining({
      defaultSendToTarget: 'chatgpt'
    }));
  });

  test('restores the built-in Perplexity assistant target for popup send-to mode', async () => {
    const { dom } = createOptionsPageDom({
      defaultExportType: 'sendTo',
      defaultSendToTarget: 'perplexity'
    });
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    expect(document.getElementById('export-send-to').checked).toBe(true);
    expect(document.getElementById('send-to-target-perplexity').checked).toBe(true);
  });

  test('removing the active custom assistant target falls back to ChatGPT', async () => {
    const { dom, browser } = createOptionsPageDom({
      defaultExportType: 'sendTo',
      defaultSendToTarget: 'custom-1',
      sendToCustomTargets: [
        {
          id: 'custom-1',
          name: 'Custom One',
          urlTemplate: 'https://example.com/new?q={prompt}'
        }
      ]
    });
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    const removeButton = document.querySelector('[data-target-id="custom-1"]');
    removeButton.click();
    await waitForMicrotasks();

    expect(browser.storage.sync.set).toHaveBeenCalledWith(expect.objectContaining({
      defaultSendToTarget: 'chatgpt',
      sendToCustomTargets: []
    }));
  });

  test('restores and saves the assistant URL length cap', async () => {
    const { dom, browser } = createOptionsPageDom({ sendToMaxUrlLength: 4200 });
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    const input = document.getElementById('sendToMaxUrlLength');
    expect(input.value).toBe('4200');

    input.value = '5100';
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await waitForMicrotasks();

    expect(browser.storage.sync.set).toHaveBeenCalledWith(expect.objectContaining({
      sendToMaxUrlLength: 5100
    }));
  });

  test('restores and saves individual context menu item visibility', async () => {
    const { dom, browser } = createOptionsPageDom({
      contextMenuItems: {
        ...sharedDefaultOptions.contextMenuItems,
        copyImage: false
      }
    });
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    expect(document.getElementById('contextMenuItem-copyImage').checked).toBe(false);
    expect(document.getElementById('contextMenuItem-copyLink').checked).toBe(true);

    const copyLink = document.getElementById('contextMenuItem-copyLink');
    copyLink.checked = false;
    copyLink.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await waitForMicrotasks();

    expect(browser.storage.sync.set).toHaveBeenCalledWith(expect.objectContaining({
      contextMenuItems: expect.objectContaining({
        copyImage: false,
        copyLink: false
      })
    }));
  });

  test('context menu item bulk buttons save all item preferences', async () => {
    const { dom, browser } = createOptionsPageDom();
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    document.getElementById('contextMenuItemsDisableAll').click();
    await flushPendingPromises();

    const lastCall = browser.storage.sync.set.mock.calls[browser.storage.sync.set.mock.calls.length - 1][0];
    expect(Object.values(lastCall.contextMenuItems).every(value => value === false)).toBe(true);
    expect(document.getElementById('contextMenuItem-copyTabLink').checked).toBe(false);
  });

  test('ignores controls with empty option keys in the generic autosave listener', async () => {
    const { dom, browser } = createOptionsPageDom();
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    const unnamedInput = document.getElementById('title');
    unnamedInput.removeAttribute('name');
    unnamedInput.value = 'unsaved secret';

    unnamedInput.dispatchEvent(new dom.window.KeyboardEvent('keyup', { bubbles: true }));
    await waitFor(dom.window, 600);

    expect(browser.storage.sync.set).not.toHaveBeenCalledWith(expect.objectContaining({
      '': 'unsaved secret'
    }));
  });

  test('restores and saves the popup guide icon toggle', async () => {
    const { dom, browser } = createOptionsPageDom({ showUserGuideIcon: false });
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();

    const toggle = document.getElementById('showUserGuideIcon');
    expect(toggle.checked).toBe(false);

    toggle.checked = true;
    toggle.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await waitForMicrotasks();

    expect(browser.storage.sync.set).toHaveBeenCalledWith(expect.objectContaining({
      showUserGuideIcon: true
    }));
  });

  test('restores and saves the element picker toggle', async () => {
    const { dom, browser } = createOptionsPageDom({ elementPickerEnabled: false });
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await flushPendingPromises();

    const toggle = document.getElementById('elementPickerEnabled');
    expect(toggle.checked).toBe(false);

    toggle.checked = true;
    toggle.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await waitForMicrotasks();

    expect(browser.storage.sync.set).toHaveBeenCalledWith(expect.objectContaining({
      elementPickerEnabled: true
    }));
  });

  test('restores and saves the element picker done action', async () => {
    const { dom, browser } = createOptionsPageDom({ elementPickerDoneAction: 'copy' });
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await flushPendingPromises();

    expect(document.getElementById('element-picker-action-copy').checked).toBe(true);

    document.getElementById('element-picker-action-popup').checked = true;
    document.getElementById('element-picker-action-popup').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await waitForMicrotasks();

    expect(browser.storage.sync.set).toHaveBeenCalledWith(expect.objectContaining({
      elementPickerDoneAction: 'popup'
    }));
  });

  test('restores and saves the batch processing toggle', async () => {
    const { dom, browser } = createOptionsPageDom({ batchProcessingEnabled: false });
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();

    const toggle = document.getElementById('batchProcessingEnabled');
    expect(toggle.checked).toBe(false);

    toggle.checked = true;
    toggle.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await waitForMicrotasks();

    expect(browser.storage.sync.set).toHaveBeenCalledWith(expect.objectContaining({
      batchProcessingEnabled: true
    }));
  });

  test.each(specialThemeCases)('$label special theme restores root classes and locks accent and editor theme controls', async ({ slug, colorBlindTheme }) => {
    const { dom } = createOptionsPageDom({
      popupTheme: 'dark',
      popupAccent: 'ocean',
      specialTheme: slug,
      colorBlindTheme,
      editorTheme: 'nord'
    });
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    const root = document.documentElement;
    expect(root.classList.contains('theme-dark')).toBe(true);
    expect(root.classList.contains(`special-theme-${slug}`)).toBe(true);
    if (slug === 'colorblind') {
      expect(root.classList.contains(`colorblind-theme-${colorBlindTheme}`)).toBe(true);
      expect(document.getElementById('colorBlindThemeRow').hidden).toBe(false);
      expect(document.getElementById('colorBlindTheme').value).toBe(colorBlindTheme);
      expect(document.getElementById('specialThemeIconRow').classList.contains('is-disabled')).toBe(true);
      expect(document.getElementById('specialThemeIcon').disabled).toBe(true);
    } else if (slug === 'openai') {
      expect(document.getElementById('specialThemeIconRow').classList.contains('is-disabled')).toBe(false);
      expect(document.getElementById('specialThemeIcon').disabled).toBe(false);
    }
    expect(root.classList.contains('accent-ocean')).toBe(false);
    expect(document.getElementById(`special-theme-${slug}`).checked).toBe(true);
    expect(document.getElementById('popupAccentGroup').classList.contains('is-disabled')).toBe(true);
    expect(document.getElementById('editorThemeGroup').classList.contains('is-disabled')).toBe(true);
    expect(document.getElementById('popupAccentThemeNote').hidden).toBe(false);
    expect(document.getElementById('editorThemeLockNote').hidden).toBe(false);
    expect(Array.from(document.querySelectorAll("input[name='popupAccent']")).every((input) => input.disabled)).toBe(true);
    expect(Array.from(document.querySelectorAll("input[name='editorTheme']")).every((input) => input.disabled)).toBe(true);
  });

  test.each(specialThemeCases)('special theme keywords surface the Special Themes card for $label queries', ({ keyword }) => {
    const index = optionsSearch.buildSearchIndex(loadOptionsDocument().window.document);
    expect(getMatchIds(index, keyword)).toContain('specialThemeGroup');
  });
});

describe('Options page template preview', () => {
  test('renders stored frontmatter and backmatter templates on initial load', async () => {
    const { dom } = createOptionsPageDom({
      frontmatter: 'title: {pageTitle}\nsource: {pageURL}',
      backmatter: 'captured: {date:YYYY-MM-DD}\nhost: {pageHost}'
    });
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    expect(document.getElementById('frontmatter-preview').open).toBe(false);
    expect(document.getElementById('backmatter-preview').open).toBe(false);
    expect(document.getElementById('frontmatter-preview-output').textContent).toBe(
      'title: Example Article\nsource: https://example.com/article'
    );
    expect(document.getElementById('backmatter-preview-output').textContent).toBe(
      `captured: ${moment().format('YYYY-MM-DD')}\nhost: example.com`
    );
  });

  test('updates the preview immediately on input without waiting for autosave debounce', async () => {
    const { dom, browser } = createOptionsPageDom({
      frontmatter: 'title: {pageTitle}'
    });
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    const textarea = document.getElementById('frontmatter');
    const output = document.getElementById('frontmatter-preview-output');

    textarea.value = 'path: {pagePathname}\nexcerpt: {excerpt}';
    textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    expect(output.textContent).toBe(
      'path: /article\nexcerpt: A compact sample summary for template preview output.'
    );
    expect(browser.storage.sync.set).not.toHaveBeenCalled();
  });

  test('shows an empty placeholder instead of stale preview content', async () => {
    const { dom } = createOptionsPageDom({
      backmatter: 'source: {pageURL}'
    });
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    const textarea = document.getElementById('backmatter');
    const output = document.getElementById('backmatter-preview-output');

    expect(output.textContent).toBe('source: https://example.com/article');

    textarea.value = '';
    textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    expect(output.textContent).toBe('Nothing to preview yet.');
    expect(output.classList.contains('is-empty')).toBe(true);
  });

  test('excludes preview hint text from search indexing', async () => {
    const { dom } = createOptionsPageDom({
      frontmatter: 'title: {pageTitle}'
    });
    const { document } = dom.window;

    document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    await waitForMicrotasks();
    await waitFor(dom.window, 50);

    const index = dom.window.markSnipOptionsSearch.buildSearchIndex(document);
    const search = dom.window.markSnipOptionsSearch.searchSettings(index, 'preview uses example metadata');

    expect(search.matches).toEqual([]);
  });
});
