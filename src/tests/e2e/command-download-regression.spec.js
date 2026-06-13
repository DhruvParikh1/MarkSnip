/**
 * Command and download regression tests.
 * Covers service worker routing and download mode behavior.
 */

const fs = require('fs');
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

const extensionPath = path.join(__dirname, '../..');
const fixtureHost = 'https://fixtures.marksnip.test';
const fixturePath = '/command-download/host.html';
const fixtureFile = path.join(__dirname, '../fixtures/e2e-pages/command-download/host.html');

async function installFixtureRoutes(context) {
  await context.route(`${fixtureHost}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== fixturePath) {
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
      body: fs.readFileSync(fixtureFile, 'utf8')
    });
  });
}

test.describe('Command And Download Regression E2E', () => {
  let context;
  let serviceWorker;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await installFixtureRoutes(context);

    [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    }
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('routes keyboard commands to expected service worker handlers', async () => {
    const page = await context.newPage();
    await page.goto(`${fixtureHost}${fixturePath}`);
    await page.bringToFront();

    const calls = await serviceWorker.evaluate(async () => {
      const requiredFns = [
        'handleCommands',
        'downloadMarkdownFromContext',
        'copyMarkdownFromContext',
        'copyTabAsMarkdownLink',
        'copySelectedTabAsMarkdownLink',
      ];
      for (const fn of requiredFns) {
        if (typeof self[fn] !== 'function') {
          throw new Error(`Missing function in service worker: ${fn}`);
        }
      }

      const originals = {};
      const calls = [];

      const spy = (name, projector) => {
        originals[name] = self[name];
        self[name] = async (...args) => {
          calls.push({ fn: name, ...projector(args) });
          return { ok: true };
        };
      };

      spy('downloadMarkdownFromContext', ([info, tab]) => ({
        menuItemId: info?.menuItemId ?? null,
        tabId: tab?.id ?? null,
      }));
      spy('copyMarkdownFromContext', ([info, tab]) => ({
        menuItemId: info?.menuItemId ?? null,
        tabId: tab?.id ?? null,
      }));
      spy('copyTabAsMarkdownLink', ([tab]) => ({ tabId: tab?.id ?? null }));
      spy('copySelectedTabAsMarkdownLink', ([tab]) => ({ tabId: tab?.id ?? null }));

      try {
        await handleCommands('download_tab_as_markdown');
        await handleCommands('copy_tab_as_markdown');
        await handleCommands('copy_selection_as_markdown');
        await handleCommands('copy_tab_as_markdown_link');
        await handleCommands('copy_selected_tab_as_markdown_link');
        await handleCommands('copy_selection_to_obsidian');
        await handleCommands('copy_tab_to_obsidian');
      } finally {
        for (const [name, original] of Object.entries(originals)) {
          self[name] = original;
        }
      }

      return calls;
    });

    expect(calls).toHaveLength(7);
    expect(calls).toEqual([
      expect.objectContaining({ fn: 'downloadMarkdownFromContext', menuItemId: 'download-markdown-all' }),
      expect.objectContaining({ fn: 'copyMarkdownFromContext', menuItemId: 'copy-markdown-all' }),
      expect.objectContaining({ fn: 'copyMarkdownFromContext', menuItemId: 'copy-markdown-selection' }),
      expect.objectContaining({ fn: 'copyTabAsMarkdownLink' }),
      expect.objectContaining({ fn: 'copySelectedTabAsMarkdownLink' }),
      expect.objectContaining({ fn: 'copyMarkdownFromContext', menuItemId: 'copy-markdown-obsidian' }),
      expect.objectContaining({ fn: 'copyMarkdownFromContext', menuItemId: 'copy-markdown-obsall' }),
    ]);
  });

  test('routes context menu actions to expected handlers', async () => {
    const calls = await serviceWorker.evaluate(async ({ fixtureUrl }) => {
      const requiredFns = [
        'handleContextMenuClick',
        'downloadMarkdownFromContext',
        'copyMarkdownFromContext',
        'downloadMarkdownForAllTabs',
        'copyTabAsMarkdownLinkAll',
        'copySelectedTabAsMarkdownLink',
        'copyTabAsMarkdownLink',
        'activateElementPickerFromContext',
        'toggleSetting',
      ];
      for (const fn of requiredFns) {
        if (typeof self[fn] !== 'function') {
          throw new Error(`Missing function in service worker: ${fn}`);
        }
      }

      const originals = {};
      const calls = [];

      const spy = (name, projector) => {
        originals[name] = self[name];
        self[name] = async (...args) => {
          calls.push({ fn: name, ...projector(args) });
          return { ok: true };
        };
      };

      spy('downloadMarkdownFromContext', ([info, tab]) => ({
        menuItemId: info?.menuItemId ?? null,
        tabId: tab?.id ?? null,
      }));
      spy('copyMarkdownFromContext', ([info, tab]) => ({
        menuItemId: info?.menuItemId ?? null,
        tabId: tab?.id ?? null,
      }));
      spy('downloadMarkdownForAllTabs', ([info]) => ({ menuItemId: info?.menuItemId ?? null }));
      spy('copyTabAsMarkdownLinkAll', ([tab]) => ({ tabId: tab?.id ?? null }));
      spy('copySelectedTabAsMarkdownLink', ([tab]) => ({ tabId: tab?.id ?? null }));
      spy('copyTabAsMarkdownLink', ([tab]) => ({ tabId: tab?.id ?? null }));
      spy('activateElementPickerFromContext', ([info, tab]) => ({
        menuItemId: info?.menuItemId ?? null,
        tabId: tab?.id ?? null,
      }));
      spy('toggleSetting', ([setting]) => ({ setting }));

      const tab = { id: 42, url: fixtureUrl };

      try {
        await handleContextMenuClick({ menuItemId: 'copy-markdown-all' }, tab);
        await handleContextMenuClick({ menuItemId: 'download-markdown-all' }, tab);
        await handleContextMenuClick({ menuItemId: 'download-markdown-alltabs' }, tab);
        await handleContextMenuClick({ menuItemId: 'copy-tab-as-markdown-link-all' }, tab);
        await handleContextMenuClick({ menuItemId: 'copy-tab-as-markdown-link-all-tab' }, tab);
        await handleContextMenuClick({ menuItemId: 'copy-tab-as-markdown-link-selected' }, tab);
        await handleContextMenuClick({ menuItemId: 'copy-tab-as-markdown-link-selected-tab' }, tab);
        await handleContextMenuClick({ menuItemId: 'copy-tab-as-markdown-link' }, tab);
        await handleContextMenuClick({ menuItemId: 'copy-tab-as-markdown-link-tab' }, tab);
        await handleContextMenuClick({ menuItemId: 'pick-element-markdown' }, tab);
        await handleContextMenuClick({ menuItemId: 'toggle-includeTemplate' }, tab);
      } finally {
        for (const [name, original] of Object.entries(originals)) {
          self[name] = original;
        }
      }

      return calls;
    }, { fixtureUrl: `${fixtureHost}${fixturePath}` });

    expect(calls).toHaveLength(11);
    expect(calls).toEqual([
      expect.objectContaining({ fn: 'copyMarkdownFromContext', menuItemId: 'copy-markdown-all' }),
      expect.objectContaining({ fn: 'downloadMarkdownFromContext', menuItemId: 'download-markdown-all' }),
      expect.objectContaining({ fn: 'downloadMarkdownForAllTabs', menuItemId: 'download-markdown-alltabs' }),
      expect.objectContaining({ fn: 'copyTabAsMarkdownLinkAll' }),
      expect.objectContaining({ fn: 'copyTabAsMarkdownLinkAll' }),
      expect.objectContaining({ fn: 'copySelectedTabAsMarkdownLink' }),
      expect.objectContaining({ fn: 'copySelectedTabAsMarkdownLink' }),
      expect.objectContaining({ fn: 'copyTabAsMarkdownLink' }),
      expect.objectContaining({ fn: 'copyTabAsMarkdownLink' }),
      expect.objectContaining({ fn: 'activateElementPickerFromContext', menuItemId: 'pick-element-markdown' }),
      expect.objectContaining({ fn: 'toggleSetting', setting: 'includeTemplate' }),
    ]);
  });

  test('context menus include element picker only when enabled', async () => {
    const result = await serviceWorker.evaluate(async () => {
      if (typeof self.createMenus !== 'function') {
        throw new Error('Missing function in service worker: createMenus');
      }

      const originals = {
        getOptions: self.getOptions,
        create: browser.contextMenus.create,
        removeAll: browser.contextMenus.removeAll,
      };
      const createdWithPicker = [];
      const createdWithoutPicker = [];

      try {
        browser.contextMenus.removeAll = () => Promise.resolve();
        browser.contextMenus.create = (props, callback) => {
          createdWithPicker.push(JSON.parse(JSON.stringify(props)));
          callback?.();
          return props.id;
        };
        self.getOptions = async () => ({
          contextMenus: true,
          includeTemplate: false,
          downloadImages: false,
          obsidianIntegration: false,
          elementPickerEnabled: true,
        });
        await createMenus();

        browser.contextMenus.create = (props, callback) => {
          createdWithoutPicker.push(JSON.parse(JSON.stringify(props)));
          callback?.();
          return props.id;
        };
        self.getOptions = async () => ({
          contextMenus: true,
          includeTemplate: false,
          downloadImages: false,
          obsidianIntegration: false,
          elementPickerEnabled: false,
        });
        await createMenus();
      } finally {
        self.getOptions = originals.getOptions;
        browser.contextMenus.create = originals.create;
        browser.contextMenus.removeAll = originals.removeAll;
      }

      return {
        enabledIds: createdWithPicker.map(item => item.id),
        disabledIds: createdWithoutPicker.map(item => item.id),
      };
    });

    expect(result.enabledIds).toContain('pick-element-markdown');
    expect(result.disabledIds).not.toContain('pick-element-markdown');
  });

  test('context menu item preferences hide disabled actions', async () => {
    const result = await serviceWorker.evaluate(async () => {
      if (typeof self.createMenus !== 'function') {
        throw new Error('Missing function in service worker: createMenus');
      }

      const originals = {
        getOptions: self.getOptions,
        create: browser.contextMenus.create,
        removeAll: browser.contextMenus.removeAll,
      };
      const created = [];

      try {
        browser.contextMenus.removeAll = () => Promise.resolve();
        browser.contextMenus.create = (props, callback) => {
          created.push(JSON.parse(JSON.stringify(props)));
          callback?.();
          return props.id;
        };

        const contextMenuItems = Object.keys(self.defaultOptions.contextMenuItems).reduce((items, key) => {
          items[key] = false;
          return items;
        }, {});
        contextMenuItems.copyTabLink = true;

        self.getOptions = async () => ({
          contextMenus: true,
          contextMenuItems,
          includeTemplate: false,
          downloadImages: false,
          obsidianIntegration: true,
          elementPickerEnabled: true,
        });
        await createMenus();
      } finally {
        self.getOptions = originals.getOptions;
        browser.contextMenus.create = originals.create;
        browser.contextMenus.removeAll = originals.removeAll;
      }

      return created.map(item => item.id);
    });

    expect(result).toContain('copy-tab-as-markdown-link');
    expect(result).toContain('copy-tab-as-markdown-link-tab');
    expect(result).not.toContain('download-markdown-all');
    expect(result).not.toContain('copy-markdown-image');
    expect(result.some(id => String(id).startsWith('separator'))).toBe(false);
  });

  test('element picker conversion copies result when configured', async () => {
    const result = await serviceWorker.evaluate(async () => {
      if (typeof self.handleElementPickerConvert !== 'function') {
        throw new Error('Missing function in service worker: handleElementPickerConvert');
      }

      const originals = {
        getOptions: self.getOptions,
        ensureOffscreenDocumentExists: self.ensureOffscreenDocumentExists,
        sendMessage: browser.runtime.sendMessage,
        storageSet: browser.storage.local.set,
        recordNotificationMetricsSafely: self.recordNotificationMetricsSafely,
      };
      const sentMessages = [];
      const storedPayloads = [];
      const metrics = [];

      try {
        self.getOptions = async () => ({
          elementPickerDoneAction: 'copy',
          skipHiddenContent: false,
        });
        self.ensureOffscreenDocumentExists = async () => {};
        self.recordNotificationMetricsSafely = async (delta, context) => {
          metrics.push({ delta, context });
        };
        browser.storage.local.set = async (payload) => {
          storedPayloads.push(payload);
        };
        browser.runtime.sendMessage = async (message) => {
          sentMessages.push(message);
          if (message.type === 'process-element-content') {
            return {
              ok: true,
              result: {
                markdown: '## Manual Element\n\nCopied body',
                article: { title: 'Manual Element' },
                effectiveOptions: {}
              }
            };
          }
          if (message.type === 'copy-to-clipboard') {
            return true;
          }
          return null;
        };

        const conversion = await handleElementPickerConvert({
          payload: {
            dom: '<html><body><section><h2>Manual Element</h2><p>Copied body</p></section></body></html>',
            pageUrl: 'https://example.test/manual'
          }
        }, {
          tab: { id: 99 }
        });

        return {
          conversion,
          sentMessages,
          storedPayloads,
          metrics
        };
      } finally {
        self.getOptions = originals.getOptions;
        self.ensureOffscreenDocumentExists = originals.ensureOffscreenDocumentExists;
        browser.runtime.sendMessage = originals.sendMessage;
        browser.storage.local.set = originals.storageSet;
        self.recordNotificationMetricsSafely = originals.recordNotificationMetricsSafely;
      }
    });

    expect(result.conversion).toEqual(expect.objectContaining({ ok: true, action: 'copy' }));
    expect(result.sentMessages.map(message => message.type)).toEqual([
      'process-element-content',
      'copy-to-clipboard'
    ]);
    expect(result.sentMessages[1].text).toContain('Copied body');
    expect(result.storedPayloads).toEqual([]);
    expect(result.metrics).toEqual([
      expect.objectContaining({
        delta: expect.objectContaining({ copies: 1, exports: 0 }),
        context: expect.objectContaining({ tabId: 99 })
      })
    ]);
  });

  test('uses offscreen messaging path for downloadsApi mode', async () => {
    const result = await serviceWorker.evaluate(async () => {
      if (typeof self.downloadMarkdown !== 'function') {
        throw new Error('Missing function in service worker: downloadMarkdown');
      }

      const originals = {
        getOptions: self.getOptions,
        ensureOffscreenDocumentExists: self.ensureOffscreenDocumentExists,
        sendMessage: browser.runtime.sendMessage,
      };

      let ensuredCount = 0;
      const messages = [];

      try {
        self.getOptions = async () => ({
          ...defaultOptions,
          downloadMode: 'downloadsApi',
          saveAs: false,
          downloadImages: false,
          disallowedChars: '[]#^',
        });

        self.ensureOffscreenDocumentExists = async () => {
          ensuredCount += 1;
        };

        browser.runtime.sendMessage = async (message) => {
          messages.push(message);
          return { ok: true };
        };

        await downloadMarkdown('# content', 'SpecTitle', 777, {}, 'SpecFolder/');
      } finally {
        self.getOptions = originals.getOptions;
        self.ensureOffscreenDocumentExists = originals.ensureOffscreenDocumentExists;
        browser.runtime.sendMessage = originals.sendMessage;
      }

      return { ensuredCount, messages };
    });

    expect(result.ensuredCount).toBe(1);
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.messages[0]).toEqual(
      expect.objectContaining({
        target: 'offscreen',
        type: 'download-markdown',
        title: 'SpecTitle',
        tabId: 777,
        mdClipsFolder: 'SpecFolder/',
      }),
    );
  });

  test('does not open the Firefox fallback offscreen tab when popup bridge is ready', async () => {
    const result = await serviceWorker.evaluate(async () => {
      if (typeof self.handleClipRequest !== 'function') {
        throw new Error('Missing function in service worker: handleClipRequest');
      }

      const originals = {
        hasNativeOffscreenDocumentSupport: self.hasNativeOffscreenDocumentSupport,
        getOptions: self.getOptions,
        tabsCreate: browser.tabs.create,
        tabsQuery: browser.tabs.query,
        tabsGet: browser.tabs.get,
        sendMessage: browser.runtime.sendMessage,
      };

      const createdTabs = [];
      const sentMessages = [];

      try {
        self.hasNativeOffscreenDocumentSupport = () => false;
        self.getOptions = async () => ({ ...defaultOptions });
        browser.tabs.query = async () => [];
        browser.tabs.get = async () => {
          throw new Error('No fallback tab');
        };
        browser.tabs.create = async (createProperties) => {
          createdTabs.push(createProperties);
          return { id: 9001, ...createProperties };
        };
        browser.runtime.sendMessage = async (message) => {
          sentMessages.push(message);
          return { ok: true };
        };

        self.markFirefoxOffscreenPageReady({
          url: browser.runtime.getURL('offscreen/offscreen.html')
        });

        await handleClipRequest({
          type: 'clip',
          dom: '<!doctype html><html><body><article>Fixture</article></body></html>',
          selection: null,
          pageUrl: 'https://example.com/',
          offscreenBridgeReady: true
        }, 123);
      } finally {
        self.hasNativeOffscreenDocumentSupport = originals.hasNativeOffscreenDocumentSupport;
        self.getOptions = originals.getOptions;
        browser.tabs.create = originals.tabsCreate;
        browser.tabs.query = originals.tabsQuery;
        browser.tabs.get = originals.tabsGet;
        browser.runtime.sendMessage = originals.sendMessage;
      }

      return { createdTabs, sentMessages };
    });

    expect(result.createdTabs).toEqual([]);
    expect(result.sentMessages).toHaveLength(1);
    expect(result.sentMessages[0]).toEqual(
      expect.objectContaining({
        target: 'offscreen',
        type: 'process-content',
        tabId: 123,
      }),
    );
  });

  test('uses content script fallback path for contentLink mode', async () => {
    const result = await serviceWorker.evaluate(async () => {
      if (typeof self.downloadMarkdown !== 'function') {
        throw new Error('Missing function in service worker: downloadMarkdown');
      }

      const originals = {
        getOptions: self.getOptions,
        ensureScripts: self.ensureScripts,
        executeScript: browser.scripting.executeScript,
        recordNotificationMetrics: self.recordNotificationMetrics,
      };

      let ensureScriptsTabId = null;
      const executeCalls = [];
      const metricCalls = [];

      try {
        self.getOptions = async () => ({
          ...defaultOptions,
          downloadMode: 'contentLink',
          saveAs: false,
          downloadImages: false,
          disallowedChars: '[]#^',
        });

        self.ensureScripts = async (tabId) => {
          ensureScriptsTabId = tabId;
        };

        browser.scripting.executeScript = async (payload) => {
          executeCalls.push(payload);
          return [{ result: true }];
        };
        self.recordNotificationMetrics = async (delta, options) => {
          metricCalls.push({ delta, options });
          return { ok: true };
        };

        await downloadMarkdown('# content', 'Content Link Title', 313, {}, 'Clips/');
      } finally {
        self.getOptions = originals.getOptions;
        self.ensureScripts = originals.ensureScripts;
        browser.scripting.executeScript = originals.executeScript;
        self.recordNotificationMetrics = originals.recordNotificationMetrics;
      }

      return { ensureScriptsTabId, executeCalls, metricCalls };
    });

    expect(result.ensureScriptsTabId).toBe(313);
    expect(result.executeCalls).toHaveLength(1);
    expect(result.executeCalls[0].target).toEqual({ tabId: 313 });
    expect(result.executeCalls[0].args[0]).toMatch(/^Clips\/.+\.md$/);
    expect(result.executeCalls[0].args[1].length).toBeGreaterThan(10);
    expect(result.metricCalls).toEqual([
      {
        delta: { downloads: 1, exports: 1 },
        options: { tabId: 313 },
      },
    ]);
  });

  test('records metrics when offscreen delegates a content download through the service worker', async () => {
    const result = await serviceWorker.evaluate(async () => {
      if (typeof self.executeContentDownload !== 'function') {
        throw new Error('Missing function in service worker: executeContentDownload');
      }

      const originals = {
        executeScript: browser.scripting.executeScript,
        recordNotificationMetrics: self.recordNotificationMetrics,
      };

      const executeCalls = [];
      const metricCalls = [];

      try {
        browser.scripting.executeScript = async (payload) => {
          executeCalls.push(payload);
          return [{ result: true }];
        };
        self.recordNotificationMetrics = async (delta, options) => {
          metricCalls.push({ delta, options });
          return { ok: true };
        };

        await executeContentDownload(444, 'Offscreen Clip.md', 'Zm9v', { downloads: 1, exports: 1 });
      } finally {
        browser.scripting.executeScript = originals.executeScript;
        self.recordNotificationMetrics = originals.recordNotificationMetrics;
      }

      return { executeCalls, metricCalls };
    });

    expect(result.executeCalls).toHaveLength(1);
    expect(result.executeCalls[0].target).toEqual({ tabId: 444 });
    expect(result.metricCalls).toEqual([
      {
        delta: { downloads: 1, exports: 1 },
        options: { tabId: 444 },
      },
    ]);
  });

  test('records copy metrics only after offscreen confirms clipboard success', async () => {
    const result = await serviceWorker.evaluate(async () => {
      if (typeof self.copyMarkdownFromContext !== 'function') {
        throw new Error('Missing function in service worker: copyMarkdownFromContext');
      }

      const originals = {
        ensureScripts: self.ensureScripts,
        ensureOffscreenDocumentExists: self.ensureOffscreenDocumentExists,
        sendMessage: browser.runtime.sendMessage,
        recordNotificationMetrics: self.recordNotificationMetrics,
      };

      const metricCalls = [];
      const sentMessages = [];
      const responses = [{ ok: false }, { ok: true }];

      try {
        self.ensureScripts = async () => {};
        self.ensureOffscreenDocumentExists = async () => {};
        browser.runtime.sendMessage = async (message) => {
          sentMessages.push(message);
          return responses.shift() || { ok: false };
        };
        self.recordNotificationMetrics = async (delta, options) => {
          metricCalls.push({ delta, options });
          return { ok: true };
        };

        await copyMarkdownFromContext({ menuItemId: 'copy-markdown-all' }, { id: 901 });
        await copyMarkdownFromContext({ menuItemId: 'copy-markdown-all' }, { id: 902 });
      } finally {
        self.ensureScripts = originals.ensureScripts;
        self.ensureOffscreenDocumentExists = originals.ensureOffscreenDocumentExists;
        browser.runtime.sendMessage = originals.sendMessage;
        self.recordNotificationMetrics = originals.recordNotificationMetrics;
      }

      return { metricCalls, sentMessages };
    });

    expect(result.sentMessages).toHaveLength(2);
    expect(result.metricCalls).toEqual([
      {
        delta: { copies: 1, exports: 1 },
        options: { tabId: 902 },
      },
    ]);
  });

  test('uses Obsidian URI data transport without clipboard copy when payload fits', async () => {
    const result = await serviceWorker.evaluate(async () => {
      if (typeof self.handleObsidianIntegration !== 'function') {
        throw new Error('Missing function in service worker: handleObsidianIntegration');
      }

      const originals = {
        ensureScripts: self.ensureScripts,
        executeScript: browser.scripting.executeScript,
        tabsUpdate: browser.tabs.update,
        recordNotificationMetrics: self.recordNotificationMetrics,
      };

      const updates = [];
      const metricCalls = [];
      let ensureScriptsCount = 0;
      let executeScriptCount = 0;

      try {
        self.ensureScripts = async () => {
          ensureScriptsCount += 1;
        };
        browser.scripting.executeScript = async () => {
          executeScriptCount += 1;
          return [{ result: true }];
        };
        browser.tabs.update = async (payload) => {
          updates.push(payload);
          return { id: 1, ...payload };
        };
        self.recordNotificationMetrics = async (delta, options) => {
          metricCalls.push({ delta, options });
          return { ok: true };
        };

        await handleObsidianIntegration({
          markdown: '# Short note\n\nBody',
          tabId: 321,
          vault: 'Research Vault',
          folder: 'Clips',
          title: 'Short Note'
        });
      } finally {
        self.ensureScripts = originals.ensureScripts;
        browser.scripting.executeScript = originals.executeScript;
        browser.tabs.update = originals.tabsUpdate;
        self.recordNotificationMetrics = originals.recordNotificationMetrics;
      }

      return { updates, metricCalls, ensureScriptsCount, executeScriptCount };
    });

    expect(result.ensureScriptsCount).toBe(0);
    expect(result.executeScriptCount).toBe(0);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].url).toContain('obsidian://adv-uri?');
    expect(result.updates[0].url).toContain('data=%23%20Short%20note%0A%0ABody');
    expect(result.updates[0].url).not.toContain('clipboard=true');
    expect(result.metricCalls).toEqual([
      {
        delta: { obsidianSends: 1, exports: 1 },
        options: { tabId: 321 },
      },
    ]);
  });

  test('falls back to Obsidian clipboard transport for oversized payloads', async () => {
    const result = await serviceWorker.evaluate(async () => {
      if (typeof self.handleObsidianIntegration !== 'function') {
        throw new Error('Missing function in service worker: handleObsidianIntegration');
      }

      const originals = {
        ensureScripts: self.ensureScripts,
        executeScript: browser.scripting.executeScript,
        tabsUpdate: browser.tabs.update,
        recordNotificationMetrics: self.recordNotificationMetrics,
      };

      const updates = [];
      const metricCalls = [];
      let ensureScriptsCount = 0;
      let executeScriptCount = 0;

      try {
        self.ensureScripts = async () => {
          ensureScriptsCount += 1;
        };
        browser.scripting.executeScript = async () => {
          executeScriptCount += 1;
          return [{ result: true }];
        };
        browser.tabs.update = async (payload) => {
          updates.push(payload);
          return { id: 1, ...payload };
        };
        self.recordNotificationMetrics = async (delta, options) => {
          metricCalls.push({ delta, options });
          return { ok: true };
        };

        await handleObsidianIntegration({
          markdown: 'Long markdown body '.repeat(1000),
          tabId: 654,
          vault: 'Research Vault',
          folder: 'Clips',
          title: 'Large Note'
        });
      } finally {
        self.ensureScripts = originals.ensureScripts;
        browser.scripting.executeScript = originals.executeScript;
        browser.tabs.update = originals.tabsUpdate;
        self.recordNotificationMetrics = originals.recordNotificationMetrics;
      }

      return { updates, metricCalls, ensureScriptsCount, executeScriptCount };
    });

    expect(result.ensureScriptsCount).toBe(1);
    expect(result.executeScriptCount).toBe(1);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].url).toContain('obsidian://adv-uri?');
    expect(result.updates[0].url).toContain('clipboard=true');
    expect(result.updates[0].url).not.toContain('data=');
    expect(result.metricCalls).toEqual([
      {
        delta: { obsidianSends: 1, exports: 1 },
        options: { tabId: 654 },
      },
    ]);
  });
});
