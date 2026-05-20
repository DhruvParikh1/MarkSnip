/**
 * Click & Clip E2E tests.
 * Drives the in-page picker with real Playwright clicks against routed local
 * fixtures, and intercepts the service-worker output functions so no real
 * downloads happen.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { test, expect, chromium } = require('@playwright/test');

const extensionPath = path.join(__dirname, '../..');
const FIXTURE_DIR = path.join(__dirname, '../fixtures/e2e-pages/click-clip');
const fixturePathMap = {
  '/click-clip/tabs.html': path.join(FIXTURE_DIR, 'tabs.html'),
  '/click-clip/accordion.html': path.join(FIXTURE_DIR, 'accordion.html'),
  '/click-clip/loadmore.html': path.join(FIXTURE_DIR, 'loadmore.html'),
  '/click-clip/pagination.html': path.join(FIXTURE_DIR, 'pagination.html'),
  '/click-clip/spa-sidebar.html': path.join(FIXTURE_DIR, 'spa-sidebar.html')
};

async function startFixtureServer() {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const fixturePath = fixturePathMap[requestUrl.pathname];
    if (!fixturePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Fixture not found for ${requestUrl.pathname}`);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(fixturePath, 'utf8'));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function stopFixtureServer(server) {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

// Intercept the service-worker output functions so finalize captures files
// in memory instead of triggering downloads.
async function installClickClipHarness(serviceWorker) {
  await serviceWorker.evaluate(() => {
    if (!self.__clickClipHarnessInstalled) {
      self.__clickClipHarnessInstalled = true;
      self.triggerBatchZipDownload = async (files) => {
        self.__clickClipHarness.zipCalls.push(JSON.parse(JSON.stringify(files || [])));
      };
      self.downloadGeneratedFile = async (message) => {
        self.__clickClipHarness.generatedFiles.push({
          title: String(message?.title || ''),
          content: String(message?.content || '')
        });
      };
      self.downloadMarkdown = async (content, title) => {
        self.__clickClipHarness.individualFiles.push({
          title: String(title || ''),
          content: String(content || '')
        });
      };
    }
    self.__clickClipHarness = { zipCalls: [], generatedFiles: [], individualFiles: [] };
  });
}

async function activateClickClip(serviceWorker, fixtureUrl, outputMode, batchSaveMode) {
  const tabId = await serviceWorker.evaluate(async (url) => {
    const tabs = await browser.tabs.query({});
    const tab = tabs.find((t) => t.url === url);
    return tab ? tab.id : null;
  }, fixtureUrl);
  expect(tabId).not.toBeNull();

  await serviceWorker.evaluate(() => ensureOffscreenDocumentExists({ allowFirefoxTab: true }));
  await serviceWorker.evaluate(async ({ targetTabId, mode, saveMode }) => {
    await browser.scripting.executeScript({
      target: { tabId: targetTabId },
      files: ['/browser-polyfill.min.js', '/shared/i18n.js', '/contentScript/contentScript.js']
    });
    await browser.tabs.sendMessage(targetTabId, {
      type: 'ACTIVATE_CLICK_CLIP',
      captureOptions: {},
      clickClipOutputMode: mode,
      batchSaveMode: saveMode
    });
  }, { targetTabId: tabId, mode: outputMode, saveMode: batchSaveMode });
  return tabId;
}

async function waitForClickClipOutput(serviceWorker) {
  await expect.poll(async () => (
    await serviceWorker.evaluate(() => {
      const h = self.__clickClipHarness || {};
      return (h.zipCalls?.length || 0)
        + (h.generatedFiles?.length || 0)
        + (h.individualFiles?.length || 0);
    })
  ), { timeout: 90000 }).toBeGreaterThan(0);
  return serviceWorker.evaluate(() => JSON.parse(JSON.stringify(self.__clickClipHarness)));
}

test.describe('Click & Clip E2E', () => {
  let context;
  let serviceWorker;
  let fixtureServer;
  let fixtureBaseUrl;

  const fixtureUrl = (pathname) => `${fixtureBaseUrl}${pathname}`;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });
    ({ server: fixtureServer, baseUrl: fixtureBaseUrl } = await startFixtureServer());
    [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    }
  });

  test.afterAll(async () => {
    await context?.close();
    await stopFixtureServer(fixtureServer);
  });

  test('can reinject the content script before activating Click & Clip', async () => {
    test.setTimeout(120000);
    const url = fixtureUrl('/click-clip/spa-sidebar.html');
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });

    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
    const tabId = await serviceWorker.evaluate(async (targetUrl) => {
      const tabs = await browser.tabs.query({});
      const tab = tabs.find((t) => t.url === targetUrl);
      return tab ? tab.id : null;
    }, url);
    expect(tabId).not.toBeNull();

    await serviceWorker.evaluate(async ({ targetTabId }) => {
      for (let i = 0; i < 2; i += 1) {
        await browser.scripting.executeScript({
          target: { tabId: targetTabId },
          files: ['/browser-polyfill.min.js', '/shared/i18n.js', '/contentScript/contentScript.js']
        });
      }
      return browser.tabs.sendMessage(targetTabId, {
        type: 'ACTIVATE_CLICK_CLIP',
        captureOptions: {},
        clickClipOutputMode: 'combined',
        batchSaveMode: 'zip'
      });
    }, { targetTabId: tabId });

    await page.waitForSelector('#marksnip-click-clip-panel');
    expect(pageErrors.join('\n')).not.toContain('CLICK_CLIP_TRIGGER_SELECTOR');

    await page.close().catch(() => {});
  });

  test('clips a tabbed widget into one file per tab', async () => {
    test.setTimeout(120000);
    const url = fixtureUrl('/click-clip/tabs.html');
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });

    await activateClickClip(serviceWorker, url, 'files', 'zip');
    await installClickClipHarness(serviceWorker);

    await page.waitForSelector('#marksnip-click-clip-panel');
    await page.click('#tab-1');
    await page.click('#tab-2');
    await page.click('#tab-3');
    await page.selectOption('#marksnip-click-clip-pattern', 'tabs');
    await page.click('#marksnip-click-clip-start');

    const harness = await waitForClickClipOutput(serviceWorker);
    expect(harness.zipCalls.length).toBeGreaterThan(0);
    const files = harness.zipCalls[harness.zipCalls.length - 1];
    expect(files).toHaveLength(3);

    expect(files[0].content).toContain('Alpha panel content for click and clip testing.');
    expect(files[0].content).not.toContain('Beta panel content for click and clip testing.');
    expect(files[1].content).toContain('Beta panel content for click and clip testing.');
    expect(files[1].content).not.toContain('Gamma panel content for click and clip testing.');
    expect(files[2].content).toContain('Gamma panel content for click and clip testing.');

    await page.close().catch(() => {});
  });

  test('clips a tabbed widget into one combined document', async () => {
    test.setTimeout(120000);
    const url = fixtureUrl('/click-clip/tabs.html');
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });

    await activateClickClip(serviceWorker, url, 'combined', 'zip');
    await installClickClipHarness(serviceWorker);

    await page.waitForSelector('#marksnip-click-clip-panel');
    await page.click('#tab-1');
    await page.click('#tab-2');
    await page.click('#tab-3');
    await page.selectOption('#marksnip-click-clip-pattern', 'tabs');
    await page.selectOption('#marksnip-click-clip-output', 'combined');
    await page.click('#marksnip-click-clip-start');

    const harness = await waitForClickClipOutput(serviceWorker);
    expect(harness.generatedFiles.length).toBeGreaterThan(0);
    const doc = harness.generatedFiles[harness.generatedFiles.length - 1].content;

    expect(doc).toContain('## First Tab');
    expect(doc).toContain('## Second Tab');
    expect(doc).toContain('## Third Tab');
    expect(doc).toContain('Alpha panel content for click and clip testing.');
    expect(doc).toContain('Beta panel content for click and clip testing.');
    expect(doc).toContain('Gamma panel content for click and clip testing.');
    // Sections are ordered by trigger order.
    expect(doc.indexOf('## First Tab')).toBeLessThan(doc.indexOf('## Second Tab'));
    expect(doc.indexOf('Alpha panel content')).toBeLessThan(doc.indexOf('Beta panel content'));
    expect(doc.indexOf('Beta panel content')).toBeLessThan(doc.indexOf('Gamma panel content'));

    await page.close().catch(() => {});
  });

  test('clips a shared SPA content target without capturing the sidebar shell', async () => {
    test.setTimeout(120000);
    const url = fixtureUrl('/click-clip/spa-sidebar.html');
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });

    await activateClickClip(serviceWorker, url, 'combined', 'zip');
    await installClickClipHarness(serviceWorker);

    await page.waitForSelector('#marksnip-click-clip-panel');
    for (const index of [0, 1, 2, 3]) {
      await page.locator(`.menu-btn[data-index="${index}"]`).click();
    }
    await page.selectOption('#marksnip-click-clip-pattern', 'tabs');
    await page.selectOption('#marksnip-click-clip-output', 'combined');
    await page.click('#marksnip-click-clip-start');

    const harness = await waitForClickClipOutput(serviceWorker);
    expect(harness.generatedFiles.length).toBeGreaterThan(0);
    const doc = harness.generatedFiles[harness.generatedFiles.length - 1].content;

    expect(doc).toContain('## 1. Intake Overview');
    expect(doc).toContain('The intake overview explains how requests enter the queue');
    expect(doc).toContain('## 2.1. Sort Requests');
    expect(doc).toContain('Sorting guidance uses priority, owner, and due date');
    expect(doc).toContain('## 2.2. Prepare a Response');
    expect(doc).toContain('Response preparation starts with a short summary');
    expect(doc).toContain('## 2.3. Quality Review');
    expect(doc).toContain('Reviewers check that the response answers the request');
    expect(doc).not.toContain('Operations Handbook');
    expect(doc).not.toContain('2.4. Practice Simulation');
    expect(doc).not.toContain('5. Archive Requests');
    expect(doc).not.toContain('Reference Desk');
    expect(doc).not.toContain('Back Continue');

    await page.close().catch(() => {});
  });

  test('clips accordion sections into one file per section', async () => {
    test.setTimeout(120000);
    const url = fixtureUrl('/click-clip/accordion.html');
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });

    await activateClickClip(serviceWorker, url, 'files', 'zip');
    await installClickClipHarness(serviceWorker);

    await page.waitForSelector('#marksnip-click-clip-panel');
    const summaries = page.locator('details > summary');
    await summaries.nth(0).click();
    await summaries.nth(1).click();
    await summaries.nth(2).click();
    await page.selectOption('#marksnip-click-clip-pattern', 'accordion');
    await page.click('#marksnip-click-clip-start');

    const harness = await waitForClickClipOutput(serviceWorker);
    expect(harness.zipCalls.length).toBeGreaterThan(0);
    const files = harness.zipCalls[harness.zipCalls.length - 1];
    expect(files.length).toBeGreaterThanOrEqual(3);

    const allContent = files.map((f) => f.content).join('\n');
    expect(allContent).toContain('First accordion body text for click and clip testing.');
    expect(allContent).toContain('Second accordion body text for click and clip testing.');
    expect(allContent).toContain('Third accordion body text for click and clip testing.');

    await page.close().catch(() => {});
  });
});
