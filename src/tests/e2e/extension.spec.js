/**
 * End-to-End Tests for MarkSnip Extension
 * Tests the extension in a real browser environment using Playwright
 */

const fs = require('fs');
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

// Path to the extension
const extensionPath = path.join(__dirname, '../..');
const fixtureHost = 'https://fixtures.marksnip.test';
const fixtureFiles = {
  '/extension/deterministic-article.html': path.join(__dirname, '../fixtures/e2e-pages/extension/deterministic-article.html'),
  '/extension/mathml-article.html': path.join(__dirname, '../fixtures/e2e-pages/extension/mathml-article.html'),
  '/extension/wechat-code-block.html': path.join(__dirname, '../fixtures/e2e-pages/extension/wechat-code-block.html')
};

async function installFixtureRoutes(context) {
  await context.route(`${fixtureHost}/**`, async (route) => {
    const url = new URL(route.request().url());
    const fixturePath = fixtureFiles[url.pathname];

    if (!fixturePath) {
      await route.fulfill({
        status: 404,
        contentType: 'text/plain; charset=utf-8',
        body: `Fixture not found for ${url.pathname}`
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: fs.readFileSync(fixturePath, 'utf8')
    });
  });
}

async function setLibraryStorage(serviceWorker, payload) {
  await serviceWorker.evaluate(async ({ nextState }) => {
    await browser.storage.local.remove(['librarySettings', 'libraryItems']);
    await browser.storage.local.set(nextState);
  }, { nextState: payload });
}

async function getLibraryStorage(serviceWorker) {
  return await serviceWorker.evaluate(async () => {
    return await browser.storage.local.get(['librarySettings', 'libraryItems']);
  });
}

async function setSyncStorage(serviceWorker, payload) {
  await serviceWorker.evaluate(async ({ nextState }) => {
    await browser.storage.sync.set(nextState);
  }, { nextState: payload });
}

async function setLocalStorage(serviceWorker, payload) {
  await serviceWorker.evaluate(async ({ nextState }) => {
    await browser.storage.local.set(nextState);
  }, { nextState: payload });
}

async function getTabIdForUrl(serviceWorker, targetUrl) {
  return await serviceWorker.evaluate(async ({ url }) => {
    const tabs = await browser.tabs.query({});
    return tabs.find((tab) => tab.url === url)?.id || null;
  }, { url: targetUrl });
}

async function getPopupMarkdown(popupPage) {
  return await popupPage.evaluate(() => {
    if (typeof getEditorValue === 'function') {
      return getEditorValue();
    }
    if (typeof cm !== 'undefined' && cm?.getValue) {
      return cm.getValue();
    }
    return document.getElementById('md')?.value || '';
  });
}

async function setBatchWorkerState(serviceWorker, payload) {
  await serviceWorker.evaluate(({ nextState }) => {
    batchState = nextState ? JSON.parse(JSON.stringify(nextState)) : null;
  }, { nextState: payload });
}

async function clearBatchRestoreState(serviceWorker) {
  await serviceWorker.evaluate(async () => {
    batchState = null;
    await browser.storage.local.remove(['batchUrlList', 'batchSaveMode']);
  });
}

async function installLibraryExportHarness(serviceWorker) {
  await serviceWorker.evaluate(() => {
    if (!self.__markSnipLibraryExportHarnessInstalled) {
      self.__markSnipLibraryExportHarnessInstalled = true;
      self.__markSnipLibraryExportHarnessOriginals = {
        triggerBatchZipDownload: self.triggerBatchZipDownload
      };

      self.triggerBatchZipDownload = async (files, options, fallbackTabId = null, zipFilename = null) => {
        self.__markSnipLibraryExportHarnessState.zipCalls.push({
          files: JSON.parse(JSON.stringify(files || [])),
          options: JSON.parse(JSON.stringify(options || {})),
          fallbackTabId,
          zipFilename
        });
      };
    }

    self.__markSnipLibraryExportHarnessState = {
      zipCalls: []
    };
  });
}

async function getLibraryExportHarnessState(serviceWorker) {
  return await serviceWorker.evaluate(() => (
    JSON.parse(JSON.stringify(self.__markSnipLibraryExportHarnessState || { zipCalls: [] }))
  ));
}

test.describe('MarkSnip Extension E2E', () => {
  let browser;
  let context;
  let serviceWorker;
  let extensionId;

  test.beforeAll(async () => {
    // Launch browser with extension loaded
    browser = await chromium.launchPersistentContext('', {
      headless: false, // Extensions require headed mode
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    context = browser;
    await installFixtureRoutes(context);

    [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    }
    extensionId = new URL(serviceWorker.url()).host;
  });

  test.afterAll(async () => {
    await browser?.close();
  });

  test('extension should load successfully', async () => {
    // Verify service worker is running and extension pages are reachable.
    expect(extensionId).toBeTruthy();

    const popupPage = await context.newPage();
    try {
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupPage.locator('#container')).toBeVisible();
      await expect(popupPage.locator('#pickElement')).toBeVisible();

      const pickerBox = await popupPage.locator('#pickElement').boundingBox();
      const bodyWidth = await popupPage.evaluate(() => document.body.getBoundingClientRect().width);
      expect(pickerBox.x + pickerBox.width).toBeLessThanOrEqual(bodyWidth + 1);
    } finally {
      await popupPage.close().catch(() => {});
    }
  });

  test('popup hides element picker when disabled in options', async () => {
    const popupPage = await context.newPage();
    try {
      await setSyncStorage(serviceWorker, { elementPickerEnabled: false });

      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupPage.locator('#container')).toBeVisible();
      await expect(popupPage.locator('#elementPickerRow')).toBeHidden();
    } finally {
      await setSyncStorage(serviceWorker, { elementPickerEnabled: true });
      await popupPage.close().catch(() => {});
    }
  });

  test('context menu activates element picker mode', async () => {
    const fixturePage = await context.newPage();

    try {
      await setSyncStorage(serviceWorker, { elementPickerEnabled: true });
      await fixturePage.goto(`${fixtureHost}/extension/deterministic-article.html`);
      await fixturePage.waitForLoadState('networkidle');
      await fixturePage.bringToFront();

      const fixtureTabId = await serviceWorker.evaluate(async ({ targetUrl }) => {
        const tabs = await browser.tabs.query({});
        return tabs.find((tab) => tab.url === targetUrl)?.id || null;
      }, { targetUrl: fixturePage.url() });
      expect(fixtureTabId).toBeTruthy();

      await serviceWorker.evaluate(async ({ tabId, tabUrl }) => {
        await handleContextMenuClick({
          menuItemId: 'pick-element-markdown'
        }, {
          id: tabId,
          url: tabUrl
        });
      }, { tabId: fixtureTabId, tabUrl: fixturePage.url() });

      await expect(fixturePage.locator('#marksnip-element-picker-panel')).toBeVisible();
      await expect(fixturePage.locator('#marksnip-element-picker-status')).toContainText('Hover and click');
    } finally {
      await fixturePage.keyboard.press('Escape').catch(() => {});
      await fixturePage.close().catch(() => {});
    }
  });

  test('highlighter saves selected text, auto-renders it on reload, and lists it in the manager', async () => {
    const fixturePage = await context.newPage();
    const popupPage = await context.newPage();
    const highlightsPage = await context.newPage();

    try {
      await serviceWorker.evaluate(async () => {
        await browser.storage.local.remove(['marksnipHighlights', 'marksnipHighlightIndex']);
        await browser.storage.sync.set({
          highlighterEnabled: true,
          alwaysShowHighlights: true,
          highlightDefaultColor: 'yellow'
        });
      });

      await fixturePage.goto(`${fixtureHost}/extension/deterministic-article.html`);
      await fixturePage.waitForLoadState('networkidle');
      await fixturePage.bringToFront();

      const fixtureTabId = await serviceWorker.evaluate(async ({ targetUrl }) => {
        const tabs = await browser.tabs.query({});
        return tabs.find((tab) => tab.url === targetUrl)?.id || null;
      }, { targetUrl: fixturePage.url() });
      expect(fixtureTabId).toBeTruthy();

      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupPage.locator('#container')).toBeVisible();
      await expect(popupPage.locator('#toggleHighlighter')).toBeVisible();
      await expect(popupPage.locator('#toggleHighlighter .element-picker-label')).toHaveCount(0);

      await popupPage.evaluate(({ tabId, tabUrl }) => {
        const originalTargetResolver = getPopupPageActionTargetTab;
        getPopupPageActionTargetTab = async () => ({
          id: tabId,
          url: tabUrl,
          active: true,
          status: 'complete'
        });
        window.__restoreHighlighterTabMocks = () => {
          getPopupPageActionTargetTab = originalTargetResolver;
        };
      }, { tabId: fixtureTabId, tabUrl: fixturePage.url() });

      await popupPage.locator('#toggleHighlighter').click();
      await expect(fixturePage.locator('#marksnip-highlighter-toolbar')).toBeVisible();

      await serviceWorker.evaluate(async () => {
        await browser.storage.sync.set({ highlightDefaultColor: 'green' });
      });

      await fixturePage.evaluate(() => {
        const paragraph = document.querySelector('article p:nth-of-type(2)');
        const textNode = paragraph?.firstChild;
        const phrase = 'stable content';
        const start = textNode?.nodeValue?.indexOf(phrase) ?? -1;
        if (!textNode || start < 0) {
          throw new Error('Highlight fixture phrase not found');
        }
        const range = document.createRange();
        range.setStart(textNode, start);
        range.setEnd(textNode, start + phrase.length);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });

      const highlightResponse = await serviceWorker.evaluate(async ({ tabId, tabUrl }) => {
        return await highlightSelectionFromContext({}, {
          id: tabId,
          url: tabUrl
        });
      }, { tabId: fixtureTabId, tabUrl: fixturePage.url() });
      expect(highlightResponse).toMatchObject({ ok: true });

      await expect.poll(async () => {
        return await serviceWorker.evaluate(async () => {
          const state = await browser.storage.local.get(['marksnipHighlights', 'marksnipHighlightIndex']);
          const records = Object.values(state.marksnipHighlights || {});
          const texts = records.flatMap((record) => (
            (record.highlights || []).map((highlight) => highlight.text)
          ));
          const colors = records.flatMap((record) => (
            (record.highlights || []).map((highlight) => highlight.color)
          ));
          return {
            texts,
            colors,
            indexCount: Object.keys(state.marksnipHighlightIndex || {}).length
          };
        });
      }, { timeout: 10000 }).toEqual({
        texts: ['stable content'],
        colors: ['green'],
        indexCount: 1
      });

      await fixturePage.reload({ waitUntil: 'networkidle' });
      await expect(fixturePage.locator('#marksnip-highlighter-style')).toHaveCount(1);

      await highlightsPage.goto(`chrome-extension://${extensionId}/highlights/highlights.html`);
      await expect(highlightsPage.locator('#summaryText')).toContainText('1 highlight across 1 page');
      await expect(highlightsPage.locator('#allHighlightsButton')).toContainText('1');
      await expect(highlightsPage.locator('.source-item--group')).toContainText('fixtures.marksnip.test');
      await expect(highlightsPage.locator('.source-page')).toContainText('Deterministic Markdown Fixture');
      await expect(highlightsPage.locator('#exportMenuButton')).toBeVisible();
      await expect(highlightsPage.locator('#exportMenu')).toBeHidden();
      await highlightsPage.locator('#exportMenuButton').click();
      await expect(highlightsPage.locator('#exportMenu')).toBeVisible();
      await expect(highlightsPage.locator('#exportMarkdown')).toHaveText('Markdown');
      await expect(highlightsPage.locator('[data-action="delete-page"]')).toHaveCount(0);
      await expect(highlightsPage.locator('.highlight-text')).toContainText('stable content');
      await highlightsPage.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async (value) => {
              window.__markSnipCopiedText = value;
            }
          }
        });
      });
      const highlightItem = highlightsPage.locator('.highlight-item').first();
      await expect(highlightItem.locator('.highlight-edit-panel')).toHaveCount(0);
      await expect(highlightItem.locator('[data-action="copy"] svg.lucide-copy')).toHaveCount(1);
      await expect(highlightItem.locator('[data-action="delete"] svg.lucide-trash-2')).toHaveCount(1);
      await expect(highlightItem.locator('.highlight-top-actions')).toHaveCSS('opacity', '0');
      await highlightItem.hover();
      await expect(highlightItem.locator('.highlight-top-actions')).toHaveCSS('opacity', '1');
      await highlightItem.locator('[data-action="copy"]').click();
      await expect.poll(async () => (
        await highlightsPage.evaluate(() => window.__markSnipCopiedText || '')
      )).toBe('stable content');
      await highlightItem.locator('[data-action="toggle-edit"]').click();
      await expect(highlightItem.locator('.highlight-edit-panel')).toBeVisible();
      await expect(highlightItem.locator('textarea[data-action="note"]')).toBeVisible();
      await expect(highlightItem.locator('.color-row')).toBeVisible();
    } finally {
      await serviceWorker.evaluate(async () => {
        await browser.storage.local.remove(['marksnipHighlights', 'marksnipHighlightIndex']);
      }).catch(() => {});
      await popupPage.evaluate(() => window.__restoreHighlighterTabMocks?.()).catch(() => {});
      await fixturePage.keyboard.press('Escape').catch(() => {});
      await popupPage.close().catch(() => {});
      await highlightsPage.close().catch(() => {});
      await fixturePage.close().catch(() => {});
    }
  });

  test('popup clips saved highlights inline by default and respects Ignore', async () => {
    const fixturePage = await context.newPage();
    const popupPage = await context.newPage();

    try {
      await serviceWorker.evaluate(async () => {
        await browser.storage.local.remove(['marksnipHighlights', 'marksnipHighlightIndex']);
        await browser.storage.sync.remove(['highlightClipBehavior', 'highlightInlineSyntax']);
        await browser.storage.sync.set({
          highlighterEnabled: true,
          alwaysShowHighlights: true,
          highlightDefaultColor: 'green'
        });
      });

      await fixturePage.goto(`${fixtureHost}/extension/deterministic-article.html`);
      await fixturePage.waitForLoadState('networkidle');
      await fixturePage.bringToFront();

      const fixtureTabId = await getTabIdForUrl(serviceWorker, fixturePage.url());
      expect(fixtureTabId).toBeTruthy();

      await serviceWorker.evaluate(async ({ tabId, tabUrl }) => {
        await activateHighlighterForTab({ id: tabId, url: tabUrl });
      }, { tabId: fixtureTabId, tabUrl: fixturePage.url() });

      await fixturePage.evaluate(() => {
        const paragraph = document.querySelector('article p:nth-of-type(2)');
        const textNode = paragraph?.firstChild;
        const phrase = 'stable content';
        const start = textNode?.nodeValue?.indexOf(phrase) ?? -1;
        if (!textNode || start < 0) {
          throw new Error('Highlight fixture phrase not found');
        }
        const range = document.createRange();
        range.setStart(textNode, start);
        range.setEnd(textNode, start + phrase.length);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });

      await expect(await serviceWorker.evaluate(async ({ tabId, tabUrl }) => {
        return await highlightSelectionFromContext({}, {
          id: tabId,
          url: tabUrl
        });
      }, { tabId: fixtureTabId, tabUrl: fixturePage.url() })).toMatchObject({ ok: true });

      await fixturePage.bringToFront();
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupPage.locator('#container')).toBeVisible();

      await expect.poll(async () => getPopupMarkdown(popupPage), { timeout: 45000 })
        .toContain('<mark');
      const inlineMarkdown = await getPopupMarkdown(popupPage);
      expect(inlineMarkdown).toContain('stable content</mark>');
      expect(inlineMarkdown).toContain('data-color="green"');
      expect(inlineMarkdown).not.toContain('Error clipping the page');

      await serviceWorker.evaluate(async () => {
        await browser.storage.sync.set({ highlightClipBehavior: 'ignore' });
      });

      await fixturePage.bringToFront();
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect.poll(async () => getPopupMarkdown(popupPage), { timeout: 45000 })
        .toContain('stable content');
      const ignoredMarkdown = await getPopupMarkdown(popupPage);
      expect(ignoredMarkdown).not.toContain('<mark');
      expect(ignoredMarkdown).not.toContain('Error clipping the page');
    } finally {
      await serviceWorker.evaluate(async () => {
        await browser.storage.local.remove(['marksnipHighlights', 'marksnipHighlightIndex']);
        await browser.storage.sync.remove(['highlightClipBehavior', 'highlightInlineSyntax']);
      }).catch(() => {});
      await fixturePage.keyboard.press('Escape').catch(() => {});
      await popupPage.close().catch(() => {});
      await fixturePage.close().catch(() => {});
    }
  });

  test('highlighter stores renderable ranges for multi-paragraph selections', async () => {
    const fixturePage = await context.newPage();

    try {
      await serviceWorker.evaluate(async () => {
        await browser.storage.local.remove(['marksnipHighlights', 'marksnipHighlightIndex']);
        await browser.storage.sync.set({
          highlighterEnabled: true,
          alwaysShowHighlights: true,
          highlightDefaultColor: 'yellow'
        });
      });

      await fixturePage.goto(`${fixtureHost}/extension/deterministic-article.html`);
      await fixturePage.waitForLoadState('networkidle');
      await fixturePage.bringToFront();

      const fixtureTabId = await getTabIdForUrl(serviceWorker, fixturePage.url());
      expect(fixtureTabId).toBeTruthy();

      await serviceWorker.evaluate(async ({ tabId, tabUrl }) => {
        await activateHighlighterForTab({ id: tabId, url: tabUrl });
      }, { tabId: fixtureTabId, tabUrl: fixturePage.url() });

      await fixturePage.evaluate(() => {
        const first = document.querySelector('article p:nth-of-type(1)')?.firstChild;
        const second = document.querySelector('article p:nth-of-type(2)')?.firstChild;
        const startPhrase = 'routed by Playwright';
        const endPhrase = 'stable content';
        const start = first?.nodeValue?.indexOf(startPhrase) ?? -1;
        const end = second?.nodeValue?.indexOf(endPhrase) ?? -1;
        if (!first || !second || start < 0 || end < 0) {
          throw new Error('Multi-paragraph highlight fixture phrases not found');
        }

        const range = document.createRange();
        range.setStart(first, start);
        range.setEnd(second, end + endPhrase.length);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });

      const highlightResponse = await serviceWorker.evaluate(async ({ tabId, tabUrl }) => {
        return await highlightSelectionFromContext({}, {
          id: tabId,
          url: tabUrl
        });
      }, { tabId: fixtureTabId, tabUrl: fixturePage.url() });
      expect(highlightResponse).toMatchObject({ ok: true, count: 2 });

      await expect.poll(async () => {
        return await serviceWorker.evaluate(async () => {
          const state = await browser.storage.local.get(['marksnipHighlights']);
          const records = Object.values(state.marksnipHighlights || {});
          return records.flatMap((record) => record.highlights || []).map((highlight) => ({
            text: highlight.text,
            startOffset: highlight.startOffset,
            endOffset: highlight.endOffset,
            xpath: highlight.xpath
          }));
        });
      }, { timeout: 10000 }).toHaveLength(2);

      const highlights = await serviceWorker.evaluate(async () => {
        const state = await browser.storage.local.get(['marksnipHighlights']);
        const records = Object.values(state.marksnipHighlights || {});
        return records.flatMap((record) => record.highlights || []);
      });
      expect(highlights.every((highlight) => highlight.endOffset > highlight.startOffset)).toBe(true);
      expect(new Set(highlights.map((highlight) => highlight.xpath)).size).toBe(2);
      expect(highlights.some((highlight) => highlight.text.includes('routed by Playwright'))).toBe(true);
      expect(highlights.some((highlight) => highlight.text.includes('stable content'))).toBe(true);

      await expect.poll(async () => {
        return await fixturePage.evaluate(() => {
          const cssHighlight = typeof CSS !== 'undefined' && CSS.highlights
            ? CSS.highlights.get('marksnip-highlight-yellow')
            : null;
          return {
            cssHighlightSize: cssHighlight?.size ?? null
          };
        });
      }, { timeout: 10000 }).toEqual({
        cssHighlightSize: 2
      });
    } finally {
      await serviceWorker.evaluate(async () => {
        await browser.storage.local.remove(['marksnipHighlights', 'marksnipHighlightIndex']);
      }).catch(() => {});
      await fixturePage.keyboard.press('Escape').catch(() => {});
      await fixturePage.close().catch(() => {});
    }
  });

  test('popup direct labels honor saved uiLanguage override', async () => {
    const popupPage = await context.newPage();
    try {
      await setSyncStorage(serviceWorker, {
        uiLanguage: 'es',
        defaultExportType: 'markdown'
      });
      await serviceWorker.evaluate(async () => {
        await self.markSnipI18n?.setUiLanguage?.('es');
      });

      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupPage.locator('#container')).toBeVisible();
      await expect(popupPage.locator('#download .split-btn__label')).toHaveText('Descargar');
      await expect(popupPage.locator('#download')).toHaveAttribute('aria-label', 'Descargar');
    } finally {
      await serviceWorker.evaluate(async () => {
        await browser.storage.sync.set({ uiLanguage: 'auto' });
        await self.markSnipI18n?.setUiLanguage?.('auto');
      }).catch(() => {});
      await popupPage.close().catch(() => {});
    }
  });

  test('link picker overlay honors saved uiLanguage override', async () => {
    const fixturePage = await context.newPage();
    try {
      await setSyncStorage(serviceWorker, { uiLanguage: 'es' });
      await serviceWorker.evaluate(async () => {
        await self.markSnipI18n?.setUiLanguage?.('es');
      });

      await fixturePage.goto(`${fixtureHost}/extension/deterministic-article.html`);
      await fixturePage.waitForLoadState('networkidle');
      await fixturePage.bringToFront();

      const fixtureTabId = await serviceWorker.evaluate(async ({ targetUrl }) => {
        const tabs = await browser.tabs.query({});
        return tabs.find((tab) => tab.url === targetUrl)?.id || null;
      }, { targetUrl: fixturePage.url() });
      expect(fixtureTabId).toBeTruthy();

      await serviceWorker.evaluate(async ({ tabId }) => {
        await browser.scripting.executeScript({
          target: { tabId },
          files: ['/browser-polyfill.min.js', '/shared/i18n.js', '/contentScript/contentScript.js']
        });
        await browser.tabs.sendMessage(tabId, { type: 'ACTIVATE_LINK_PICKER' });
      }, { tabId: fixtureTabId });

      await expect(fixturePage.locator('#marksnip-link-picker-panel')).toBeVisible();
      await expect(fixturePage.locator('.marksnip-link-picker-panel-title')).toHaveText('Selector de Enlaces');
    } finally {
      await serviceWorker.evaluate(async () => {
        await browser.storage.sync.set({ uiLanguage: 'auto' });
        await self.markSnipI18n?.setUiLanguage?.('auto');
      }).catch(() => {});
      await fixturePage.close().catch(() => {});
    }
  });

  test('element picker converts a confirmed element into popup markdown', async () => {
    const fixturePage = await context.newPage();
    const popupPage = await context.newPage();

    try {
      await serviceWorker.evaluate(async () => {
        await browser.storage.local.remove('elementPickerResult');
      });

      await fixturePage.goto(`${fixtureHost}/extension/deterministic-article.html`);
      await fixturePage.waitForLoadState('networkidle');
      await fixturePage.bringToFront();

      const fixtureTabId = await serviceWorker.evaluate(async ({ targetUrl }) => {
        const tabs = await browser.tabs.query({});
        return tabs.find((tab) => tab.url === targetUrl)?.id || null;
      }, { targetUrl: fixturePage.url() });
      expect(fixtureTabId).toBeTruthy();

      await serviceWorker.evaluate(async ({ tabId }) => {
        await browser.scripting.executeScript({
          target: { tabId },
          files: ['/browser-polyfill.min.js', '/shared/i18n.js', '/contentScript/contentScript.js']
        });
        await browser.tabs.sendMessage(tabId, {
          type: 'ACTIVATE_ELEMENT_PICKER',
          captureOptions: { skipHiddenContent: false }
        });
      }, { tabId: fixtureTabId });

      await expect(fixturePage.locator('#marksnip-element-picker-panel')).toBeVisible();
      await fixturePage.locator('#manual-element-fixture h2').click();
      await fixturePage.locator('#marksnip-element-picker-parent').click();
      await expect(fixturePage.locator('#marksnip-element-picker-status')).toContainText('aside#manual-element-fixture');
      await fixturePage.locator('#marksnip-element-picker-done').click();

      await expect.poll(async () => {
        return await serviceWorker.evaluate(async () => {
          const state = await browser.storage.local.get('elementPickerResult');
          return state.elementPickerResult?.markdown || '';
        });
      }, { timeout: 45000 }).toContain('Manual Element Fixture');

      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupPage.locator('#container')).toBeVisible();
      await popupPage.evaluate(async ({ tabId, tabUrl }) => {
        await consumePendingElementPickerResult({ id: tabId, url: tabUrl });
      }, { tabId: fixtureTabId, tabUrl: fixturePage.url() });

      await expect.poll(async () => {
        return await popupPage.evaluate(() => {
          if (typeof cm !== 'undefined' && cm?.getValue) {
            return cm.getValue();
          }
          return document.getElementById('md')?.value || '';
        });
      }, { timeout: 15000 }).toContain('Manual Element Fixture');

      const markdown = await popupPage.evaluate(() => {
        if (typeof cm !== 'undefined' && cm?.getValue) {
          return cm.getValue();
        }
        return document.getElementById('md')?.value || '';
      });

      expect(markdown).toContain('This paragraph is used to verify manual element picker conversion.');
      expect(markdown).toContain('[Manual target link]');
      expect(markdown).not.toContain('This page is routed by Playwright for deterministic extension E2E tests.');
    } finally {
      await serviceWorker.evaluate(async () => {
        await browser.storage.local.remove('elementPickerResult');
      }).catch(() => {});
      await popupPage.close().catch(() => {});
      await fixturePage.close().catch(() => {});
    }
  });

  test('element picker copies markdown immediately when configured', async () => {
    const fixturePage = await context.newPage();

    try {
      await setSyncStorage(serviceWorker, {
        elementPickerEnabled: true,
        elementPickerDoneAction: 'copy'
      });
      await serviceWorker.evaluate(async () => {
        await browser.storage.local.remove('elementPickerResult');
      });

      await fixturePage.goto(`${fixtureHost}/extension/deterministic-article.html`);
      await fixturePage.waitForLoadState('networkidle');
      await fixturePage.bringToFront();

      const fixtureTabId = await serviceWorker.evaluate(async ({ targetUrl }) => {
        const tabs = await browser.tabs.query({});
        return tabs.find((tab) => tab.url === targetUrl)?.id || null;
      }, { targetUrl: fixturePage.url() });
      expect(fixtureTabId).toBeTruthy();

      await serviceWorker.evaluate(async ({ tabId }) => {
        await browser.scripting.executeScript({
          target: { tabId },
          files: ['/browser-polyfill.min.js', '/shared/i18n.js', '/contentScript/contentScript.js']
        });
        await browser.tabs.sendMessage(tabId, {
          type: 'ACTIVATE_ELEMENT_PICKER',
          captureOptions: { skipHiddenContent: false }
        });
      }, { tabId: fixtureTabId });

      await expect(fixturePage.locator('#marksnip-element-picker-panel')).toBeVisible();
      await fixturePage.locator('#manual-element-fixture h2').click();
      await fixturePage.locator('#marksnip-element-picker-parent').click();
      await fixturePage.locator('#marksnip-element-picker-done').click();
      await expect(fixturePage.locator('.marksnip-element-picker-success')).toContainText('Element Markdown copied to clipboard.');

      const storedResult = await serviceWorker.evaluate(async () => {
        const state = await browser.storage.local.get('elementPickerResult');
        return state.elementPickerResult || null;
      });
      expect(storedResult).toBeNull();
    } finally {
      await setSyncStorage(serviceWorker, { elementPickerDoneAction: 'popup' }).catch(() => {});
      await serviceWorker.evaluate(async () => {
        await browser.storage.local.remove('elementPickerResult');
      }).catch(() => {});
      await fixturePage.close().catch(() => {});
    }
  });

  test('clips deterministic fixture page through popup flow and produces markdown', async () => {
    await setLibraryStorage(serviceWorker, {
      librarySettings: {
        enabled: true,
        autoSaveOnPopupOpen: true,
        itemsToKeep: 10
      },
      libraryItems: []
    });

    const fixturePage = await context.newPage();
    const popupPage = await context.newPage();

    try {
      const initialLibraryCount = await serviceWorker.evaluate(async () => {
        const state = await browser.storage.local.get(['libraryItems']);
        return state.libraryItems?.length || 0;
      });

      await fixturePage.goto(`${fixtureHost}/extension/deterministic-article.html`);
      await fixturePage.waitForLoadState('networkidle');
      await expect(fixturePage.getByRole('heading', { name: 'Deterministic Markdown Fixture' })).toBeVisible();
      await fixturePage.bringToFront();

      const fixtureTabId = await serviceWorker.evaluate(async ({ targetUrl }) => {
        const tabs = await browser.tabs.query({});
        return tabs.find((tab) => tab.url === targetUrl)?.id || null;
      }, { targetUrl: fixturePage.url() });
      expect(fixtureTabId).toBeTruthy();

      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupPage.locator('#container')).toBeVisible();

      await popupPage.evaluate(async (tabId) => {
        await clipSite(tabId);
      }, fixtureTabId);

      await expect.poll(async () => {
        return await popupPage.evaluate(() => {
          if (typeof cm !== 'undefined' && cm?.getValue) {
            return cm.getValue();
          }
          return document.getElementById('md')?.value || '';
        });
      }, { timeout: 45000 }).toContain('This page is routed by Playwright for deterministic extension E2E tests.');

      const markdown = await popupPage.evaluate(() => {
        if (typeof cm !== 'undefined' && cm?.getValue) {
          return cm.getValue();
        }
        return document.getElementById('md')?.value || '';
      });

      expect(markdown).toContain('This page is routed by Playwright for deterministic extension E2E tests.');
      expect(markdown).toContain('It contains stable content that does not depend on external networks.');
      expect(markdown).not.toContain('Error clipping the page');

      await expect.poll(async () => popupPage.inputValue('#title'), { timeout: 10000 })
        .toContain('Deterministic Markdown Fixture');
      await popupPage.locator('#libraryViewToggle').click();
      await expect(popupPage.locator('#saveLibraryClip')).toBeHidden();
      await popupPage.locator('#closeLibraryView').click();

      await expect.poll(async () => {
        const state = await getLibraryStorage(serviceWorker);
        return state.libraryItems?.length || 0;
      }, { timeout: 10000 }).toBeGreaterThan(initialLibraryCount);
      const firstLibraryCount = (await getLibraryStorage(serviceWorker)).libraryItems?.length || 0;

      await popupPage.close().catch(() => {});

      const popupAgain = await context.newPage();
      await popupAgain.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupAgain.locator('#container')).toBeVisible();
      await popupAgain.evaluate(async (tabId) => {
        await clipSite(tabId);
      }, fixtureTabId);
      await expect.poll(async () => {
        const state = await getLibraryStorage(serviceWorker);
        return state.libraryItems?.length || 0;
      }, { timeout: 10000 }).toBe(firstLibraryCount);
      await popupAgain.close().catch(() => {});
    } finally {
      await popupPage.close().catch(() => {});
      await fixturePage.close().catch(() => {});
    }
  });

  test('clips native MathML as TeX through the popup flow', async () => {
    const fixturePage = await context.newPage();
    const popupPage = await context.newPage();

    try {
      await fixturePage.goto(`${fixtureHost}/extension/mathml-article.html`);
      await fixturePage.waitForLoadState('networkidle');
      await expect(fixturePage.getByRole('heading', { name: 'MathML Article Fixture' })).toBeVisible();
      await fixturePage.bringToFront();

      const fixtureTabId = await serviceWorker.evaluate(async ({ targetUrl }) => {
        const tabs = await browser.tabs.query({});
        return tabs.find((tab) => tab.url === targetUrl)?.id || null;
      }, { targetUrl: fixturePage.url() });
      expect(fixtureTabId).toBeTruthy();

      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupPage.locator('#container')).toBeVisible();

      await popupPage.evaluate(async (tabId) => {
        await clipSite(tabId);
      }, fixtureTabId);

      await expect.poll(async () => {
        return await popupPage.evaluate(() => {
          if (typeof cm !== 'undefined' && cm?.getValue) {
            return cm.getValue();
          }
          return document.getElementById('md')?.value || '';
        });
      }, { timeout: 45000 }).toContain('$P_{i,j,t_a}$');

      const markdown = await popupPage.evaluate(() => {
        if (typeof cm !== 'undefined' && cm?.getValue) {
          return cm.getValue();
        }
        return document.getElementById('md')?.value || '';
      });

      expect(markdown).toContain('$P_{i,j,t_a}$');
      expect(markdown).toContain('$$\nE=mc^{2}\n$$');
      expect(markdown).not.toContain('Pi,j,t_a');
      expect(markdown).not.toContain('Error clipping the page');
    } finally {
      await popupPage.close().catch(() => {});
      await fixturePage.close().catch(() => {});
    }
  });

  test('clips span and br based code blocks with preserved newlines', async () => {
    const fixturePage = await context.newPage();
    const popupPage = await context.newPage();

    try {
      await fixturePage.goto(`${fixtureHost}/extension/wechat-code-block.html`);
      await fixturePage.waitForLoadState('networkidle');
      await expect(fixturePage.getByRole('heading', { name: 'WeChat Code Block Fixture' })).toBeVisible();
      await fixturePage.bringToFront();

      const fixtureTabId = await serviceWorker.evaluate(async ({ targetUrl }) => {
        const tabs = await browser.tabs.query({});
        return tabs.find((tab) => tab.url === targetUrl)?.id || null;
      }, { targetUrl: fixturePage.url() });
      expect(fixtureTabId).toBeTruthy();

      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupPage.locator('#container')).toBeVisible();

      await popupPage.evaluate(async (tabId) => {
        await clipSite(tabId);
      }, fixtureTabId);

      await expect.poll(async () => {
        return await popupPage.evaluate(() => {
          if (typeof cm !== 'undefined' && cm?.getValue) {
            return cm.getValue();
          }
          return document.getElementById('md')?.value || '';
        });
      }, { timeout: 45000 }).toContain('POST /system/user/list HTTP/1.1\nHost: xxx\nContent-Length: 153');

      const markdown = await popupPage.evaluate(() => {
        if (typeof cm !== 'undefined' && cm?.getValue) {
          return cm.getValue();
        }
        return document.getElementById('md')?.value || '';
      });

      expect(markdown).toMatch(/```[^\n]*\nPOST \/system\/user\/list HTTP\/1\.1\nHost: xxx\nContent-Length: 153/);
      expect(markdown).toContain('\n\npageSize=10&pageNum=1&orderByColumn=createTime\n```');
      expect(markdown).not.toContain('HTTP/1.1Host: xxx');
      expect(markdown).not.toContain('Error clipping the page');
    } finally {
      await popupPage.close().catch(() => {});
      await fixturePage.close().catch(() => {});
    }
  });

  test('manual-save mode does not auto-save until Save Clip is pressed', async () => {
    await setLibraryStorage(serviceWorker, {
      librarySettings: {
        enabled: true,
        autoSaveOnPopupOpen: false,
        itemsToKeep: 10
      },
      libraryItems: []
    });

    const fixturePage = await context.newPage();
    const popupPage = await context.newPage();

    try {
      await fixturePage.goto(`${fixtureHost}/extension/deterministic-article.html`);
      await fixturePage.waitForLoadState('networkidle');
      await fixturePage.bringToFront();

      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupPage.locator('#libraryViewToggle')).toBeVisible();
      await expect.poll(async () => {
        const state = await getLibraryStorage(serviceWorker);
        return state.libraryItems?.length || 0;
      }, { timeout: 5000 }).toBe(0);

      await popupPage.locator('#libraryViewToggle').click();
      await expect(popupPage.locator('#saveLibraryClip')).toBeVisible();
      await expect(popupPage.locator('#saveLibraryClip')).toBeEnabled();
      await popupPage.locator('#saveLibraryClip').click();

      await expect.poll(async () => {
        const state = await getLibraryStorage(serviceWorker);
        return state.libraryItems?.length || 0;
      }, { timeout: 10000 }).toBe(1);
    } finally {
      await popupPage.close().catch(() => {});
      await fixturePage.close().catch(() => {});
    }
  });

  test('library export all stays disabled when there are no saved clips', async () => {
    await setLibraryStorage(serviceWorker, {
      librarySettings: {
        enabled: true,
        autoSaveOnPopupOpen: false,
        itemsToKeep: 10
      },
      libraryItems: []
    });

    const popupPage = await context.newPage();

    try {
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await popupPage.locator('#libraryViewToggle').click();
      await expect(popupPage.locator('#exportLibraryAll')).toBeDisabled();
    } finally {
      await popupPage.close().catch(() => {});
    }
  });

  for (const { label, slug } of [
    { label: 'OpenAI', slug: 'openai' },
    { label: 'ATLA', slug: 'atla' },
    { label: 'Ben 10', slug: 'ben10' }
  ]) {
    test(`popup startup loads ${label} dark stylesheet when the special theme is active`, async () => {
      await setSyncStorage(serviceWorker, {
        popupTheme: 'dark',
        specialTheme: slug,
        editorTheme: 'nord'
      });

      const popupPage = await context.newPage();

      try {
        await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);

        await expect.poll(async () => {
          return await popupPage.evaluate(() => {
            return document.getElementById('cm-theme-stylesheet')?.getAttribute('href') || null;
          });
        }, { timeout: 10000 }).toBe(`lib/${slug}-dark.css`);

        const themeLinks = await popupPage.evaluate(() => {
          return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .map((link) => link.getAttribute('href'))
            .filter((href) => href && href.startsWith('lib/') && href !== 'lib/codemirror.css');
        });

        expect(themeLinks).toEqual([`lib/${slug}-dark.css`]);
      } finally {
        await popupPage.close().catch(() => {});
      }
    });

    test(`popup startup loads ${label} light stylesheet when the special theme is active in light mode`, async () => {
      await setSyncStorage(serviceWorker, {
        popupTheme: 'light',
        specialTheme: slug,
        editorTheme: 'nord'
      });

      const popupPage = await context.newPage();

      try {
        await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);

        await expect.poll(async () => {
          return await popupPage.evaluate(() => {
            return document.getElementById('cm-theme-stylesheet')?.getAttribute('href') || null;
          });
        }, { timeout: 10000 }).toBe(`lib/${slug}-light.css`);

        const themeLinks = await popupPage.evaluate(() => {
          return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .map((link) => link.getAttribute('href'))
            .filter((href) => href && href.startsWith('lib/') && href !== 'lib/codemirror.css');
        });

        expect(themeLinks).toEqual([`lib/${slug}-light.css`]);
      } finally {
        await popupPage.close().catch(() => {});
      }
    });
  }

  for (const { label, variant } of [
    { label: 'Deuteranopia', variant: 'deuteranopia' },
    { label: 'Protanopia', variant: 'protanopia' },
    { label: 'Tritanopia', variant: 'tritanopia' }
  ]) {
    test(`popup startup loads ${label} dark stylesheet when the color blind special theme is active`, async () => {
      await setSyncStorage(serviceWorker, {
        popupTheme: 'dark',
        specialTheme: 'colorblind',
        colorBlindTheme: variant,
        editorTheme: 'nord'
      });

      const popupPage = await context.newPage();

      try {
        await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);

        await expect.poll(async () => {
          return await popupPage.evaluate(() => {
            return document.getElementById('cm-theme-stylesheet')?.getAttribute('href') || null;
          });
        }, { timeout: 10000 }).toBe(`lib/colorblind-${variant}-dark.css`);

        const themeLinks = await popupPage.evaluate(() => {
          return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .map((link) => link.getAttribute('href'))
            .filter((href) => href && href.startsWith('lib/') && href !== 'lib/codemirror.css');
        });

        expect(themeLinks).toEqual([`lib/colorblind-${variant}-dark.css`]);
      } finally {
        await popupPage.close().catch(() => {});
      }
    });

    test(`popup startup loads ${label} light stylesheet when the color blind special theme is active in light mode`, async () => {
      await setSyncStorage(serviceWorker, {
        popupTheme: 'light',
        specialTheme: 'colorblind',
        colorBlindTheme: variant,
        editorTheme: 'nord'
      });

      const popupPage = await context.newPage();

      try {
        await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);

        await expect.poll(async () => {
          return await popupPage.evaluate(() => {
            return document.getElementById('cm-theme-stylesheet')?.getAttribute('href') || null;
          });
        }, { timeout: 10000 }).toBe(`lib/colorblind-${variant}-light.css`);

        const themeLinks = await popupPage.evaluate(() => {
          return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .map((link) => link.getAttribute('href'))
            .filter((href) => href && href.startsWith('lib/') && href !== 'lib/codemirror.css');
        });

        expect(themeLinks).toEqual([`lib/colorblind-${variant}-light.css`]);
      } finally {
        await popupPage.close().catch(() => {});
      }
    });
  }

  test('popup startup preserves non-Claude theme resolution when no special theme is active', async () => {
    await setSyncStorage(serviceWorker, {
      popupTheme: 'dark',
      specialTheme: 'none',
      editorTheme: 'nord'
    });

    const popupPage = await context.newPage();

    try {
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      await expect.poll(async () => {
        return await popupPage.evaluate(() => {
          return document.getElementById('cm-theme-stylesheet')?.getAttribute('href') || null;
        });
      }, { timeout: 10000 }).toBe('lib/nord.css');

      const themeLinks = await popupPage.evaluate(() => {
        return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
          .map((link) => link.getAttribute('href'))
          .filter((href) => href && href.startsWith('lib/') && href !== 'lib/codemirror.css');
      });

      expect(themeLinks).toEqual(['lib/nord.css']);
    } finally {
      await popupPage.close().catch(() => {});
    }
  });

  test('popup preview renders raw HTML safely without breaking code or linking unsafe images', async () => {
    const fixturePage = await context.newPage();
    const popupPage = await context.newPage();

    try {
      await fixturePage.goto(`${fixtureHost}/extension/deterministic-article.html`);
      await fixturePage.waitForLoadState('networkidle');
      await fixturePage.bringToFront();

      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      await expect.poll(async () => {
        return await popupPage.evaluate(() => Boolean(window.cm && document.querySelector('.CodeMirror')));
      }, { timeout: 15000 }).toBe(true);

      await expect.poll(async () => {
        return await popupPage.locator('#title').inputValue();
      }, { timeout: 15000 }).toContain('Deterministic Markdown Fixture');

      await popupPage.evaluate(() => {
        window.cm.setValue([
          '# Preview test',
          '',
          '`<span>`',
          '',
          '```html',
          '<div class="x">hi</div>',
          '```',
          '',
          '<script>alert(1)</script>',
          '',
          '![bad](javascript:alert(1))',
          '',
          '[good](https://example.com/docs/page)'
        ].join('\n'));
      });

      await popupPage.locator('#previewToggle').click();

      await expect(popupPage.locator('#editorPreview')).toBeVisible();
      await expect.poll(async () => {
        return await popupPage.evaluate(() => {
          return document.querySelector('#editorPreview .markdown-body')?.innerHTML || '';
        });
      }, { timeout: 10000 }).toContain('<pre><code class="language-html">');

      const previewState = await popupPage.evaluate(() => {
        const preview = document.getElementById('editorPreview');
        const codeHtml = preview.querySelector('pre code')?.innerHTML || '';
        const inlineCodeHtml = preview.querySelector('p code')?.innerHTML || '';
        const scriptCount = preview.querySelectorAll('script').length;
        const imageLink = preview.querySelector('.preview-image-placeholder a');
        const normalLink = preview.querySelector('.markdown-body a[href="https://example.com/docs/page"]');

        return {
          codeHtml,
          inlineCodeHtml,
          scriptCount,
          unsafeImageLinkHref: imageLink?.getAttribute('href') || null,
          normalLinkHref: normalLink?.getAttribute('href') || null,
          normalLinkTarget: normalLink?.getAttribute('target') || null,
          normalLinkRel: normalLink?.getAttribute('rel') || null,
          previewText: preview.textContent || ''
        };
      });

      expect(previewState.codeHtml).toContain('&lt;div class="x"&gt;hi&lt;/div&gt;');
      expect(previewState.codeHtml).not.toContain('&amp;lt;');
      expect(previewState.inlineCodeHtml).toContain('&lt;span&gt;');
      expect(previewState.inlineCodeHtml).not.toContain('&amp;lt;');
      expect(previewState.scriptCount).toBe(0);
      expect(previewState.previewText).toContain('<script>alert(1)</script>');
      expect(previewState.unsafeImageLinkHref).toBeNull();
      expect(previewState.normalLinkHref).toBe('https://example.com/docs/page');
      expect(previewState.normalLinkTarget).toBe('_blank');
      expect(previewState.normalLinkRel).toBe('noopener noreferrer');
    } finally {
      await popupPage.close().catch(() => {});
      await fixturePage.close().catch(() => {});
    }
  });

  test('library items stay unrendered until the Library view opens', async () => {
    await setLibraryStorage(serviceWorker, {
      librarySettings: {
        enabled: true,
        autoSaveOnPopupOpen: false,
        itemsToKeep: 10
      },
      libraryItems: [
        { id: 'one', pageUrl: 'https://example.com/alpha', normalizedPageUrl: 'https://example.com/alpha', title: 'Alpha', markdown: '# Alpha', savedAt: '2026-03-20T10:00:00.000Z', previewText: 'Alpha' },
        { id: 'two', pageUrl: 'https://example.com/beta', normalizedPageUrl: 'https://example.com/beta', title: 'Beta', markdown: '# Beta', savedAt: '2026-03-20T09:00:00.000Z', previewText: 'Beta' }
      ]
    });

    const popupPage = await context.newPage();

    try {
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupPage.locator('#libraryViewToggle')).toBeVisible({ timeout: 10000 });

      await expect.poll(async () => {
        return await popupPage.textContent('#libraryCountBadge');
      }, { timeout: 10000 }).toBe('2');

      expect(await popupPage.locator('#libraryList .library-card').count()).toBe(0);

      await popupPage.locator('#libraryViewToggle').click();
      await expect.poll(async () => {
        return await popupPage.locator('#libraryList .library-card').count();
      }, { timeout: 10000 }).toBe(2);
    } finally {
      await popupPage.close().catch(() => {});
    }
  });

  test('batch restore opens the Batch view on popup startup without being overridden', async () => {
    const fixturePage = await context.newPage();
    const popupPage = await context.newPage();

    try {
      await fixturePage.goto(`${fixtureHost}/extension/deterministic-article.html`);
      await fixturePage.waitForLoadState('networkidle');
      await fixturePage.bringToFront();

      await setLocalStorage(serviceWorker, {
        batchUrlList: [
          `${fixtureHost}/extension/deterministic-article.html`,
          'https://example.com/queued'
        ].join('\n'),
        batchSaveMode: 'zip'
      });
      await setBatchWorkerState(serviceWorker, {
        status: 'loading',
        current: 1,
        total: 2,
        url: `${fixtureHost}/extension/deterministic-article.html`,
        pageTitle: 'Deterministic Markdown Fixture',
        batchSaveMode: 'zip'
      });

      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      await expect(popupPage.locator('#batchContainer')).toBeVisible({ timeout: 10000 });
      await expect(popupPage.locator('#progressContainer')).toBeVisible({ timeout: 10000 });
      await expect(popupPage.locator('#container')).toBeHidden();
      await expect(popupPage.locator('#urlList')).toHaveValue([
        `${fixtureHost}/extension/deterministic-article.html`,
        'https://example.com/queued'
      ].join('\n'));

      await expect.poll(async () => {
        return await popupPage.evaluate(() => document.activeElement?.id || '');
      }, { timeout: 10000 }).toMatch(/^(urlList|convertUrls)$/);
    } finally {
      await clearBatchRestoreState(serviceWorker);
      await popupPage.close().catch(() => {});
      await fixturePage.close().catch(() => {});
    }
  });

  test('deferred popup notifications still render after startup', async () => {
    await setLocalStorage(serviceWorker, {
      pendingNotifications: [
        {
          id: 'popup-deferred-notification',
          type: 'support-milestone',
          title: 'Popup notification test',
          message: 'Deferred popup notification body',
          milestone: 100,
          primaryAction: {
            label: 'View release notes',
            url: 'https://example.com/releases'
          },
          secondaryAction: {
            label: 'Buy Me a Coffee',
            url: 'https://example.com/support'
          }
        }
      ]
    });

    const popupPage = await context.newPage();

    try {
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupPage.getByText('Popup notification test')).toBeVisible({ timeout: 15000 });
      await expect(popupPage.getByText('Deferred popup notification body')).toBeVisible();
      await expect(popupPage.getByLabel('Dismiss notification')).toBeVisible();
    } finally {
      await popupPage.close().catch(() => {});
    }
  });

  test('library export all routes saved clips through the ZIP export path', async () => {
    await installLibraryExportHarness(serviceWorker);
    await setLibraryStorage(serviceWorker, {
      librarySettings: {
        enabled: true,
        autoSaveOnPopupOpen: false,
        itemsToKeep: 10
      },
      libraryItems: [
        { id: 'one', pageUrl: 'https://example.com/alpha', normalizedPageUrl: 'https://example.com/alpha', title: 'Alpha', markdown: '# Alpha', savedAt: '2026-03-20T10:00:00.000Z', previewText: 'Alpha' },
        { id: 'two', pageUrl: 'https://example.com/beta', normalizedPageUrl: 'https://example.com/beta', title: 'Alpha', markdown: '# Beta', savedAt: '2026-03-20T09:00:00.000Z', previewText: 'Beta' },
        { id: 'three', pageUrl: 'https://example.com/gamma', normalizedPageUrl: 'https://example.com/gamma', title: '', markdown: '# Gamma', savedAt: '2026-03-20T08:00:00.000Z', previewText: 'Gamma' },
        { id: 'four', pageUrl: 'https://example.com/delta', normalizedPageUrl: 'https://example.com/delta', title: 'Fancy:/Title?', markdown: '# Delta', savedAt: '2026-03-20T07:00:00.000Z', previewText: 'Delta' }
      ]
    });

    const popupPage = await context.newPage();

    try {
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await popupPage.locator('#libraryViewToggle').click();
      await expect(popupPage.locator('#exportLibraryAll')).toBeEnabled();
      await popupPage.locator('#exportLibraryAll').click();
      await expect(popupPage.locator('#exportDropdownMenu')).toBeVisible();
      await popupPage.locator('[data-export="zip"]').click();

      await expect(popupPage.locator('#libraryStatus')).toContainText('Exported 4 clips to ZIP');

      const harnessState = await getLibraryExportHarnessState(serviceWorker);
      expect(harnessState.zipCalls).toHaveLength(1);

      const latestCall = harnessState.zipCalls[0];
      expect(latestCall.zipFilename).toMatch(/^MarkSnip-library-\d{8}-\d{6}\.zip$/);
      expect(latestCall.files).toEqual([
        { filename: 'Alpha.md', content: '# Alpha' },
        { filename: 'Alpha (2).md', content: '# Beta' },
        { filename: 'Untitled.md', content: '# Gamma' },
        { filename: 'FancyTitle.md', content: '# Delta' }
      ]);
    } finally {
      await popupPage.close().catch(() => {});
    }
  });

  test('popup default Markdown export keeps the main action on the markdown download path', async () => {
    await setSyncStorage(serviceWorker, {
      defaultExportType: 'markdown'
    });

    const fixturePage = await context.newPage();
    const popupPage = await context.newPage();

    try {
      await fixturePage.goto(`${fixtureHost}/extension/deterministic-article.html`);
      await fixturePage.waitForLoadState('networkidle');
      await fixturePage.bringToFront();

      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupPage.locator('#container')).toBeVisible();

      await expect.poll(async () => popupPage.inputValue('#title'), { timeout: 10000 })
        .toContain('Deterministic Markdown Fixture');

      await expect(popupPage.locator('#download')).toHaveAttribute('aria-label', 'Download');
      await expect(popupPage.locator('#ddMarkdown')).toBeHidden();

      await popupPage.evaluate(() => {
        const originalSendMessage = browser.runtime.sendMessage.bind(browser.runtime);
        const originalClose = window.close.bind(window);
        const calls = [];

        browser.runtime.sendMessage = async (message) => {
          if (message?.type === 'download') {
            calls.push({
              type: message.type,
              title: message.title,
              markdownSnippet: String(message.markdown || '').slice(0, 80)
            });
            return null;
          }

          return originalSendMessage(message);
        };

        window.close = () => {};
        window.__markSnipPopupDownloadHarness = {
          calls,
          restore() {
            browser.runtime.sendMessage = originalSendMessage;
            window.close = originalClose;
          }
        };
      });

      await popupPage.locator('#download').click();

      await expect.poll(async () => {
        return await popupPage.evaluate(() => window.__markSnipPopupDownloadHarness.calls.length);
      }).toBe(1);

      const harnessState = await popupPage.evaluate(() => {
        const result = window.__markSnipPopupDownloadHarness.calls.slice();
        window.__markSnipPopupDownloadHarness.restore();
        return result;
      });

      expect(harnessState[0]).toMatchObject({
        type: 'download',
        title: 'Deterministic Markdown Fixture'
      });
      expect(harnessState[0].markdownSnippet).toContain('Deterministic Markdown Fixture');
    } finally {
      await popupPage.close().catch(() => {});
      await fixturePage.close().catch(() => {});
    }
  });

  test('popup default PDF export updates labels and routes both main and selection exports through the print path', async () => {
    await setSyncStorage(serviceWorker, {
      defaultExportType: 'pdf'
    });

    const fixturePage = await context.newPage();
    const popupPage = await context.newPage();

    try {
      await fixturePage.goto(`${fixtureHost}/extension/deterministic-article.html`);
      await fixturePage.waitForLoadState('networkidle');
      await fixturePage.bringToFront();

      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupPage.locator('#container')).toBeVisible();

      await expect.poll(async () => popupPage.inputValue('#title'), { timeout: 10000 })
        .toContain('Deterministic Markdown Fixture');

      await popupPage.evaluate(() => {
        const original = browser.scripting.executeScript.bind(browser.scripting);
        const calls = [];

        browser.scripting.executeScript = async (options) => {
          const payload = options?.args?.[0] || {};
          calls.push({
            target: options?.target || null,
            kind: payload.kind || null,
            hasHtmlDocument: typeof payload.htmlDocument === 'string' && payload.htmlDocument.includes('markdown-body')
          });
          return [];
        };

        window.__markSnipPrintHarness = {
          calls,
          restore() {
            browser.scripting.executeScript = original;
          }
        };
      });

      await expect(popupPage.locator('#download')).toContainText('Save as PDF');

      await popupPage.evaluate(() => {
        const lineIndex = (cm.getLine(0) || '').length > 0 ? 0 : Math.min(1, Math.max(0, cm.lineCount() - 1));
        const lineText = cm.getLine(lineIndex) || '';
        cm.focus();
        cm.setSelection(
          { line: lineIndex, ch: 0 },
          { line: lineIndex, ch: Math.max(1, Math.min(24, lineText.length || 1)) }
        );
      });
      await expect(popupPage.locator('#downloadSelection')).toBeVisible();
      await expect(popupPage.locator('#downloadSelection')).toContainText('Save Selection as PDF');

      await popupPage.locator('#splitArrow').click();
      await expect(popupPage.locator('#splitDropdown')).toBeVisible();
      await expect(popupPage.locator('#ddMarkdown')).toBeVisible();
      await expect(popupPage.locator('#ddText')).toBeVisible();
      await expect(popupPage.locator('#ddHtml')).toBeVisible();
      await expect(popupPage.locator('#ddPrint')).toBeVisible();
      await expect.poll(async () => {
        return await popupPage.locator('#ddPdf').evaluate((element) => element.hidden);
      }).toBe(true);
      await popupPage.locator('#download').click();

      await expect.poll(async () => {
        return await popupPage.evaluate(() => window.__markSnipPrintHarness.calls.length);
      }).toBe(1);

      let harnessState = await popupPage.evaluate(() => window.__markSnipPrintHarness.calls.slice());
      expect(harnessState[0].kind).toBe('pdf');
      expect(harnessState[0].hasHtmlDocument).toBe(true);

      await popupPage.locator('#downloadSelection').click();

      await expect.poll(async () => {
        return await popupPage.evaluate(() => window.__markSnipPrintHarness.calls.length);
      }).toBe(2);

      harnessState = await popupPage.evaluate(() => window.__markSnipPrintHarness.calls.slice());
      expect(harnessState[1].kind).toBe('pdf');
      expect(harnessState[1].hasHtmlDocument).toBe(true);

      await popupPage.locator('#splitArrow').click();
      await popupPage.locator('#ddPrint').click();

      await expect.poll(async () => {
        return await popupPage.evaluate(() => window.__markSnipPrintHarness.calls.length);
      }).toBe(3);

      harnessState = await popupPage.evaluate(() => {
        const result = window.__markSnipPrintHarness.calls.slice();
        window.__markSnipPrintHarness.restore();
        return result;
      });

      expect(harnessState[2].kind).toBe('print');
      expect(harnessState[2].hasHtmlDocument).toBe(true);
    } finally {
      await popupPage.close().catch(() => {});
      await fixturePage.close().catch(() => {});
    }
  });

  for (const { exportType, buttonLabel, selectionLabel, fileExtension, mimeType } of [
    {
      exportType: 'text',
      buttonLabel: 'Download TXT',
      selectionLabel: 'Download Selection as TXT',
      fileExtension: 'txt',
      mimeType: 'text/plain;charset=utf-8'
    },
    {
      exportType: 'html',
      buttonLabel: 'Download HTML',
      selectionLabel: 'Download Selection as HTML',
      fileExtension: 'html',
      mimeType: 'text/html;charset=utf-8'
    }
  ]) {
    test(`popup default ${exportType} export routes full and selection downloads through the generated-file message path`, async () => {
      await setSyncStorage(serviceWorker, {
        defaultExportType: exportType,
        downloadMode: 'downloadsApi',
        saveAs: false
      });

      const fixturePage = await context.newPage();
      const popupPage = await context.newPage();

      try {
        await fixturePage.goto(`${fixtureHost}/extension/deterministic-article.html`);
        await fixturePage.waitForLoadState('networkidle');
        await fixturePage.bringToFront();

        await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
        await expect(popupPage.locator('#container')).toBeVisible();

        await expect.poll(async () => popupPage.inputValue('#title'), { timeout: 10000 })
          .toContain('Deterministic Markdown Fixture');

        await popupPage.evaluate(() => {
          const originalSendMessage = browser.runtime.sendMessage.bind(browser.runtime);
          window.__markSnipGeneratedMessageHarness = {
            calls: [],
            errors: [],
            restore() {
              browser.runtime.sendMessage = originalSendMessage;
            }
          };
          browser.runtime.sendMessage = async (message) => {
            if (message?.type === 'download-generated-file') {
              window.__markSnipGeneratedMessageHarness.calls.push({
                type: message.type,
                title: message.title || '',
                fileExtension: message.fileExtension || '',
                mimeType: message.mimeType || '',
                contentLength: String(message.content || '').length
              });
            }
            try {
              return await originalSendMessage(message);
            } catch (error) {
              window.__markSnipGeneratedMessageHarness.errors.push(String(error?.message || error));
              throw error;
            }
          };
          window.close = () => {};
        });

        await expect(popupPage.locator('#download')).toContainText(buttonLabel);
        await popupPage.locator('#download').click();

        await expect.poll(async () => {
          return await popupPage.evaluate(() => window.__markSnipGeneratedMessageHarness.calls.length);
        }, { timeout: 10000 }).toBe(1);

        await popupPage.evaluate(() => {
          const lineIndex = (cm.getLine(0) || '').length > 0 ? 0 : Math.min(1, Math.max(0, cm.lineCount() - 1));
          const lineText = cm.getLine(lineIndex) || '';
          cm.focus();
          cm.setSelection(
            { line: lineIndex, ch: 0 },
            { line: lineIndex, ch: Math.max(1, Math.min(24, lineText.length || 1)) }
          );
        });
        await expect(popupPage.locator('#downloadSelection')).toBeVisible();
        await expect(popupPage.locator('#downloadSelection')).toContainText(selectionLabel);
        await popupPage.locator('#downloadSelection').click();

        await expect.poll(async () => {
          return await popupPage.evaluate(() => window.__markSnipGeneratedMessageHarness.calls.length);
        }, { timeout: 10000 }).toBe(2);

        const harnessState = await popupPage.evaluate(() => {
          const result = {
            calls: window.__markSnipGeneratedMessageHarness.calls.slice(),
            errors: window.__markSnipGeneratedMessageHarness.errors.slice()
          };
          window.__markSnipGeneratedMessageHarness.restore();
          return result;
        });

        expect(harnessState.errors).toEqual([]);
        expect(harnessState.calls).toHaveLength(2);
        harnessState.calls.forEach((call) => {
          expect(call.type).toBe('download-generated-file');
          expect(call.title).toContain('Deterministic Markdown Fixture');
          expect(call.fileExtension).toBe(fileExtension);
          expect(call.mimeType).toBe(mimeType);
          expect(call.contentLength).toBeGreaterThan(0);
        });
      } finally {
        await popupPage.close().catch(() => {});
        await fixturePage.close().catch(() => {});
      }
    });
  }

  test('popup send-to mode updates labels and routes full and selection sends through assistant URLs', async () => {
    await setSyncStorage(serviceWorker, {
      defaultExportType: 'sendTo',
      defaultSendToTarget: 'chatgpt',
      sendToCustomTargets: []
    });

    const fixturePage = await context.newPage();
    const popupPage = await context.newPage();

    try {
      await fixturePage.goto(`${fixtureHost}/extension/deterministic-article.html`);
      await fixturePage.waitForLoadState('networkidle');
      await fixturePage.bringToFront();

      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupPage.locator('#container')).toBeVisible();

      await expect.poll(async () => popupPage.inputValue('#title'), { timeout: 10000 })
        .toContain('Deterministic Markdown Fixture');

      await popupPage.evaluate(() => {
        const originalTabsCreate = browser.tabs.create.bind(browser.tabs);
        const originalSendMessage = browser.runtime.sendMessage.bind(browser.runtime);
        const originalClipboardWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
        const originalClose = window.close.bind(window);

        window.__markSnipSendToHarness = {
          tabsCalls: [],
          metricCalls: [],
          clipboardCalls: [],
          restore() {
            browser.tabs.create = originalTabsCreate;
            browser.runtime.sendMessage = originalSendMessage;
            navigator.clipboard.writeText = originalClipboardWrite;
            window.close = originalClose;
          }
        };

        browser.tabs.create = async (options) => {
          window.__markSnipSendToHarness.tabsCalls.push(options);
          return { id: 9000 + window.__markSnipSendToHarness.tabsCalls.length };
        };
        browser.runtime.sendMessage = async (message) => {
          if (message?.type === 'record-notification-metrics') {
            window.__markSnipSendToHarness.metricCalls.push(message);
            return null;
          }
          return originalSendMessage(message);
        };
        navigator.clipboard.writeText = async (text) => {
          window.__markSnipSendToHarness.clipboardCalls.push(text);
          return undefined;
        };
        window.close = () => {};
      });

      await expect(popupPage.locator('#download')).toContainText('Send to ChatGPT');

      await popupPage.locator('#splitArrow').click();
      await expect(popupPage.locator('#splitDropdown')).toBeVisible();
      await expect(popupPage.locator('#ddSendToChatgpt')).toBeHidden();
      await expect(popupPage.locator('#ddSendToClaude')).toBeVisible();
      await expect(popupPage.locator('#ddSendToPerplexity')).toBeVisible();
      await expect(popupPage.locator('#ddMarkdown')).toBeVisible();

      await popupPage.locator('#download').click();
      await expect.poll(async () => {
        return await popupPage.evaluate(() => window.__markSnipSendToHarness.tabsCalls.length);
      }, { timeout: 10000 }).toBe(1);

      await popupPage.evaluate(() => {
        const lineIndex = (cm.getLine(0) || '').length > 0 ? 0 : Math.min(1, Math.max(0, cm.lineCount() - 1));
        const lineText = cm.getLine(lineIndex) || '';
        cm.focus();
        cm.setSelection(
          { line: lineIndex, ch: 0 },
          { line: lineIndex, ch: Math.max(1, Math.min(24, lineText.length || 1)) }
        );
      });

      await expect(popupPage.locator('#downloadSelection')).toBeVisible();
      await expect(popupPage.locator('#downloadSelection')).toContainText('Send Selection to ChatGPT');
      await popupPage.locator('#downloadSelection').click();

      await expect.poll(async () => {
        return await popupPage.evaluate(() => window.__markSnipSendToHarness.tabsCalls.length);
      }, { timeout: 10000 }).toBe(2);

      const harnessState = await popupPage.evaluate(() => {
        const result = {
          tabsCalls: window.__markSnipSendToHarness.tabsCalls.slice(),
          metricCalls: window.__markSnipSendToHarness.metricCalls.slice(),
          clipboardCalls: window.__markSnipSendToHarness.clipboardCalls.slice()
        };
        window.__markSnipSendToHarness.restore();
        return result;
      });

      expect(harnessState.clipboardCalls).toEqual([]);
      expect(harnessState.metricCalls).toHaveLength(2);
      harnessState.metricCalls.forEach((call) => {
        expect(call.delta).toEqual({ exports: 1 });
      });
      harnessState.tabsCalls.forEach((call) => {
        expect(call.url).toMatch(/^https:\/\/chatgpt\.com\/\?q=/);
      });
    } finally {
      await popupPage.close().catch(() => {});
      await fixturePage.close().catch(() => {});
    }
  });

  test('popup send-to mode copies oversized markdown and opens the assistant fallback URL', async () => {
    await setSyncStorage(serviceWorker, {
      defaultExportType: 'sendTo',
      defaultSendToTarget: 'chatgpt',
      sendToCustomTargets: []
    });

    const fixturePage = await context.newPage();
    const popupPage = await context.newPage();

    try {
      await fixturePage.goto(`${fixtureHost}/extension/deterministic-article.html`);
      await fixturePage.waitForLoadState('networkidle');
      await fixturePage.bringToFront();

      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupPage.locator('#container')).toBeVisible();

      await expect.poll(async () => popupPage.inputValue('#title'), { timeout: 10000 })
        .toContain('Deterministic Markdown Fixture');

      await popupPage.evaluate(() => {
        const originalTabsCreate = browser.tabs.create.bind(browser.tabs);
        const originalSendMessage = browser.runtime.sendMessage.bind(browser.runtime);
        const originalClipboardWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
        const originalClose = window.close.bind(window);

        window.__markSnipSendToOverflowHarness = {
          tabsCalls: [],
          metricCalls: [],
          clipboardCalls: [],
          restore() {
            browser.tabs.create = originalTabsCreate;
            browser.runtime.sendMessage = originalSendMessage;
            navigator.clipboard.writeText = originalClipboardWrite;
            window.close = originalClose;
          }
        };

        browser.tabs.create = async (options) => {
          window.__markSnipSendToOverflowHarness.tabsCalls.push(options);
          return { id: 9100 + window.__markSnipSendToOverflowHarness.tabsCalls.length };
        };
        browser.runtime.sendMessage = async (message) => {
          if (message?.type === 'record-notification-metrics') {
            window.__markSnipSendToOverflowHarness.metricCalls.push(message);
            return null;
          }
          return originalSendMessage(message);
        };
        navigator.clipboard.writeText = async (text) => {
          window.__markSnipSendToOverflowHarness.clipboardCalls.push(text);
          return undefined;
        };
        window.close = () => {};

        cm.setValue(`# Huge\n\n${'A'.repeat(12000)}`);
      });

      await popupPage.locator('#download').click();

      await expect.poll(async () => {
        return await popupPage.evaluate(() => window.__markSnipSendToOverflowHarness.tabsCalls.length);
      }, { timeout: 10000 }).toBe(1);

      const harnessState = await popupPage.evaluate(() => {
        const result = {
          tabsCalls: window.__markSnipSendToOverflowHarness.tabsCalls.slice(),
          metricCalls: window.__markSnipSendToOverflowHarness.metricCalls.slice(),
          clipboardCalls: window.__markSnipSendToOverflowHarness.clipboardCalls.slice()
        };
        window.__markSnipSendToOverflowHarness.restore();
        return result;
      });

      expect(harnessState.metricCalls).toHaveLength(1);
      expect(harnessState.metricCalls[0].delta).toEqual({ exports: 1 });
      expect(harnessState.clipboardCalls).toHaveLength(1);
      expect(harnessState.clipboardCalls[0].length).toBeGreaterThan(10000);
      expect(harnessState.tabsCalls).toEqual([{ url: 'https://chatgpt.com/' }]);
    } finally {
      await popupPage.close().catch(() => {});
      await fixturePage.close().catch(() => {});
    }
  });

  test('disabling the library hides the popup entry point and prevents auto-save', async () => {
    await setLibraryStorage(serviceWorker, {
      librarySettings: {
        enabled: false,
        autoSaveOnPopupOpen: true,
        itemsToKeep: 10
      },
      libraryItems: []
    });

    const fixturePage = await context.newPage();
    const popupPage = await context.newPage();

    try {
      await fixturePage.goto(`${fixtureHost}/extension/deterministic-article.html`);
      await fixturePage.waitForLoadState('networkidle');
      await fixturePage.bringToFront();

      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupPage.locator('#libraryViewToggle')).toBeHidden();
      await expect.poll(async () => {
        const state = await getLibraryStorage(serviceWorker);
        return state.libraryItems?.length || 0;
      }, { timeout: 5000 }).toBe(0);
    } finally {
      await popupPage.close().catch(() => {});
      await fixturePage.close().catch(() => {});
    }
  });

  test('lowering items-to-keep trims stored library items immediately from the options page', async () => {
    await setLibraryStorage(serviceWorker, {
      librarySettings: {
        enabled: true,
        autoSaveOnPopupOpen: true,
        itemsToKeep: 3
      },
      libraryItems: [
        { id: 'one', pageUrl: 'https://example.com/1', normalizedPageUrl: 'https://example.com/1', title: 'One', markdown: 'One', savedAt: '2026-03-20T10:00:00.000Z', previewText: 'One' },
        { id: 'two', pageUrl: 'https://example.com/2', normalizedPageUrl: 'https://example.com/2', title: 'Two', markdown: 'Two', savedAt: '2026-03-20T09:00:00.000Z', previewText: 'Two' },
        { id: 'three', pageUrl: 'https://example.com/3', normalizedPageUrl: 'https://example.com/3', title: 'Three', markdown: 'Three', savedAt: '2026-03-20T08:00:00.000Z', previewText: 'Three' }
      ]
    });

    const optionsPage = await context.newPage();
    try {
      await optionsPage.goto(`chrome-extension://${extensionId}/options/options.html`);
      await optionsPage.locator('#tab-library').click();
      await optionsPage.locator('#libraryItemsToKeep').fill('2');
      await optionsPage.locator('#libraryItemsToKeep').press('Tab');

      await expect.poll(async () => {
        const state = await getLibraryStorage(serviceWorker);
        return state.libraryItems?.length || 0;
      }, { timeout: 10000 }).toBe(2);
    } finally {
      await optionsPage.close().catch(() => {});
    }
  });

  test.describe('shortcuts cheatsheet modal', () => {
    let popupPage;

    test.beforeEach(async () => {
      popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await expect(popupPage.locator('#container')).toBeVisible();
    });

    test.afterEach(async () => {
      await popupPage?.close().catch(() => {});
    });

    test('info button opens guide dropdown', async () => {
      await popupPage.locator('#openGuide').click();
      await expect(popupPage.locator('#guideDropdown')).toBeVisible();
      await expect(popupPage.locator('#guideLink')).toBeVisible();
      await expect(popupPage.locator('#showShortcuts')).toBeVisible();
    });

    test('clicking user guide item closes dropdown', async () => {
      await popupPage.locator('#openGuide').click();
      await expect(popupPage.locator('#guideDropdown')).toBeVisible();
      await popupPage.locator('#guideLink').click();
      await expect(popupPage.locator('#guideDropdown')).toBeHidden();
    });

    test('shortcuts modal opens and renders commands from mocked getAll()', async () => {
      await popupPage.evaluate(() => {
        browser.commands.getAll = async () => [
          { name: '_execute_action',          shortcut: 'Alt+Shift+M', description: '' },
          { name: 'download_tab_as_markdown', shortcut: 'Alt+Shift+D', description: 'Save tab' },
          { name: 'copy_selection_as_markdown', shortcut: '',          description: 'Copy sel' },
        ];
      });
      await popupPage.locator('#openGuide').click();
      await popupPage.locator('#showShortcuts').click();

      await expect(popupPage.locator('#shortcutsModal')).toBeVisible();
      await expect(popupPage.locator('#shortcutsModalBody kbd').first()).toBeVisible();
      await expect(popupPage.locator('#shortcutsModalBody')).toContainText('Open MarkSnip popup');
      await expect(popupPage.locator('#shortcutsModalBody')).toContainText('Download tab as Markdown');
      await expect(popupPage.locator('#shortcutsModalBody')).toContainText('Copy selection as Markdown');
      await expect(popupPage.locator('.shortcuts-section-label')).toBeVisible();
    });

    test('Escape closes modal and returns focus to guide button', async () => {
      await popupPage.evaluate(() => {
        browser.commands.getAll = async () => [
          { name: '_execute_action', shortcut: 'Alt+Shift+M', description: '' },
        ];
      });
      await popupPage.locator('#openGuide').click();
      await popupPage.locator('#showShortcuts').click();
      await expect(popupPage.locator('#shortcutsModal')).toBeVisible();

      await popupPage.keyboard.press('Escape');
      await expect(popupPage.locator('#shortcutsModal')).toBeHidden();
      const focusedId = await popupPage.evaluate(() => document.activeElement?.id);
      expect(focusedId).toBe('openGuide');
    });

    test('backdrop click closes modal', async () => {
      await popupPage.evaluate(() => {
        browser.commands.getAll = async () => [];
      });
      await popupPage.locator('#openGuide').click();
      await popupPage.locator('#showShortcuts').click();
      await expect(popupPage.locator('#shortcutsModal')).toBeVisible();

      await popupPage.locator('#shortcutsModalBackdrop').click({
        position: { x: 8, y: 8 }
      });
      await expect(popupPage.locator('#shortcutsModal')).toBeHidden();
    });

    test('Tab stays inside modal', async () => {
      await popupPage.evaluate(() => {
        browser.commands.getAll = async () => [];
      });
      await popupPage.locator('#openGuide').click();
      await popupPage.locator('#showShortcuts').click();
      await expect(popupPage.locator('#shortcutsModal')).toBeVisible();

      await popupPage.keyboard.press('Tab');
      const focusedId = await popupPage.evaluate(() => document.activeElement?.id);
      expect(focusedId).toBe('closeShortcutsModal');
    });

    test('Shift+Tab stays inside modal', async () => {
      await popupPage.evaluate(() => {
        browser.commands.getAll = async () => [];
      });
      await popupPage.locator('#openGuide').click();
      await popupPage.locator('#showShortcuts').click();
      await expect(popupPage.locator('#shortcutsModal')).toBeVisible();

      await popupPage.keyboard.press('Shift+Tab');
      const focusedId = await popupPage.evaluate(() => document.activeElement?.id);
      expect(focusedId).toBe('closeShortcutsModal');
    });

    test('API rejection shows error message', async () => {
      await popupPage.evaluate(() => {
        browser.commands.getAll = async () => { throw new Error('API unavailable'); };
      });
      await popupPage.locator('#openGuide').click();
      await popupPage.locator('#showShortcuts').click();
      await expect(popupPage.locator('#shortcutsModal')).toBeVisible();
      await expect(popupPage.locator('#shortcutsModalBody')).toContainText('Could not load shortcuts');
    });
  });
});
