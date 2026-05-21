/**
 * Batch processing regression tests.
 * Uses routed fixture pages so CI does not depend on external websites.
 */

const fs = require('fs');
const http = require('http');
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const extensionPath = path.join(__dirname, '../..');
const fixturePathMap = {
  '/batch/alpha.html': path.join(__dirname, '../fixtures/e2e-pages/batch/alpha.html'),
  '/batch/beta.html': path.join(__dirname, '../fixtures/e2e-pages/batch/beta.html'),
  '/batch/obsidian-links.html': path.join(__dirname, '../fixtures/e2e-pages/batch/obsidian-links.html'),
  '/batch/download-images.html': path.join(__dirname, '../fixtures/e2e-pages/batch/download-images.html'),
  '/batch/repeated-sections.html': path.join(__dirname, '../fixtures/e2e-pages/batch/repeated-sections.html'),
  '/batch/snapshot-one.html': path.join(__dirname, '../fixtures/e2e-pages/batch/snapshot-one.html'),
  '/batch/snapshot-two.html': path.join(__dirname, '../fixtures/e2e-pages/batch/snapshot-two.html'),
  '/batch/snapshot-three.html': path.join(__dirname, '../fixtures/e2e-pages/batch/snapshot-three.html')
};

const deterministicCases = [
  {
    name: 'captures snapshot-one fixture markdown',
    path: '/batch/snapshot-one.html',
    expectedFixture: 'snapshot-one.md'
  },
  {
    name: 'captures snapshot-two fixture markdown',
    path: '/batch/snapshot-two.html',
    expectedFixture: 'snapshot-two.md'
  },
  {
    name: 'captures snapshot-three fixture markdown',
    path: '/batch/snapshot-three.html',
    expectedFixture: 'snapshot-three.md'
  }
];

const MARKDOWN_FIXTURE_DIR = path.join(__dirname, '../fixtures/e2e-markdown/batch');

function loadSnapshotFixture(name) {
  return fs.readFileSync(path.join(MARKDOWN_FIXTURE_DIR, name), 'utf8')
    .replace(/\r\n/g, '\n')
    .trimEnd();
}

async function installBatchHarness(serviceWorker) {
  await serviceWorker.evaluate(() => {
    if (!self.__markSnipBatchHarnessInstalled) {
      self.__markSnipBatchHarnessInstalled = true;
      self.__markSnipBatchHarnessOriginals = {
        sendBatchProgressUpdate: self.sendBatchProgressUpdate,
        triggerBatchZipDownload: self.triggerBatchZipDownload
      };

      self.sendBatchProgressUpdate = async (update) => {
        const snapshot = JSON.parse(JSON.stringify(update ?? null));
        self.__markSnipBatchHarnessState.progress.push(snapshot);
        return self.__markSnipBatchHarnessOriginals.sendBatchProgressUpdate(update);
      };

      self.triggerBatchZipDownload = async (files, options, fallbackTabId = null) => {
        self.__markSnipBatchHarnessState.zipCalls.push({
          files: JSON.parse(JSON.stringify(files || [])),
          options: JSON.parse(JSON.stringify(options || {})),
          fallbackTabId
        });
      };

      // Combined mode assembles one document and downloads it via
      // downloadGeneratedFile — capture it in memory instead.
      self.downloadGeneratedFile = async (message) => {
        self.__markSnipBatchHarnessState.generatedFiles.push({
          title: String(message?.title || ''),
          content: String(message?.content || '')
        });
      };
    }

    self.__markSnipBatchHarnessState = {
      progress: [],
      zipCalls: [],
      generatedFiles: []
    };
  });
}

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

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`
  };
}

async function stopFixtureServer(server) {
  if (!server) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function primeFixtureTabLoad(context, url) {
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'load' });
  } finally {
    await page.close().catch(() => {});
  }
}

function normalizeMarkdown(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .trimEnd();
}

async function waitForBatchHarnessCompletion(serviceWorker) {
  await expect.poll(async () => (
    await serviceWorker.evaluate(() => {
      const progress = self.__markSnipBatchHarnessState?.progress || [];
      return progress.length ? progress[progress.length - 1].status : null;
    })
  ), { timeout: 240000 }).toBe('finished');
}

async function waitForBatchWorkerIdle(serviceWorker) {
  await expect.poll(async () => (
    await serviceWorker.evaluate(() => ({
      inProgress: typeof batchConversionInProgress === 'boolean'
        ? batchConversionInProgress
        : null,
      hasActiveSignal: typeof activeBatchSignal !== 'undefined'
        ? Boolean(activeBatchSignal)
        : null
    }))
  ), { timeout: 30000 }).toEqual({
    inProgress: false,
    hasActiveSignal: false
  });
}

async function runBatchCapture(context, extensionId, serviceWorker, urls, options = {}) {
  await installBatchHarness(serviceWorker);
  await serviceWorker.evaluate(() => ensureOffscreenDocumentExists());
  const targetUrlObjects = urls.map((url) => ({ title: null, url }));
  const launcher = await context.newPage();
  const batchSaveMode = options.batchSaveMode || 'zip';

  try {
    await launcher.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await launcher.evaluate(({ urlObjects, batchSaveMode }) => {
      browser.runtime.sendMessage({
        type: 'start-batch-conversion',
        urlObjects,
        batchSaveMode
      }).catch(() => {});
    }, {
        urlObjects: targetUrlObjects,
        batchSaveMode
      });

    await expect.poll(async () => (
      await serviceWorker.evaluate(() => {
        const progress = self.__markSnipBatchHarnessState?.progress || [];
        return progress.length;
      })
    ), { timeout: 15000 }).toBeGreaterThan(0);
  } finally {
    await launcher.close().catch(() => {});
  }

  await waitForBatchHarnessCompletion(serviceWorker);
  await waitForBatchWorkerIdle(serviceWorker);

  return serviceWorker.evaluate(() => (
    JSON.parse(JSON.stringify(self.__markSnipBatchHarnessState || { progress: [], zipCalls: [], generatedFiles: [] }))
  ));
}

async function runSingleUrlBatchCapture(context, extensionId, serviceWorker, url, options = {}) {
  return await runBatchCapture(context, extensionId, serviceWorker, [url], options);
}

async function withTemporarySyncOptions(serviceWorker, overrides, callback) {
  const keys = Object.keys(overrides || {});
  if (keys.length === 0) {
    return await callback();
  }

  const previous = await serviceWorker.evaluate(async ({ targetKeys }) => (
    await browser.storage.sync.get(targetKeys)
  ), { targetKeys: keys });

  try {
    await serviceWorker.evaluate(async ({ nextOptions }) => {
      await browser.storage.sync.set(nextOptions);
    }, { nextOptions: overrides });

    return await callback();
  } finally {
    await serviceWorker.evaluate(async ({ targetKeys, previousOptions }) => {
      const toSet = {};
      const toRemove = [];

      targetKeys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(previousOptions, key)) {
          toSet[key] = previousOptions[key];
        } else {
          toRemove.push(key);
        }
      });

      if (Object.keys(toSet).length) {
        await browser.storage.sync.set(toSet);
      }
      if (toRemove.length) {
        await browser.storage.sync.remove(toRemove);
      }
    }, {
      targetKeys: keys,
      previousOptions: previous
    });
  }
}

function getFinalProgressUpdate(state) {
  const progress = state?.progress || [];
  return progress[progress.length - 1] || null;
}

function getProgressUrls(state) {
  return new Set((state?.progress || []).map(update => update?.url).filter(Boolean));
}

function getProgressTitles(state) {
  return (state?.progress || []).map(update => update?.pageTitle).filter(Boolean);
}

function getLatestZipCall(state) {
  const zipCalls = state?.zipCalls || [];
  expect(zipCalls.length).toBeGreaterThan(0);
  return zipCalls[zipCalls.length - 1];
}

function getCapturedMarkdownFiles(state) {
  const latestZipCall = getLatestZipCall(state);
  const files = Array.isArray(latestZipCall.files) ? latestZipCall.files : [];
  expect(files.length).toBeGreaterThan(0);
  return files.map((file) => ({
    filename: String(file?.filename || ''),
    content: normalizeMarkdown(file?.content || '')
  }));
}

function expectAnyCapturedFileToContain(files, expectedText) {
  const matched = files.some((file) => file.content.includes(expectedText));
  expect(matched).toBeTruthy();
}

test.describe('Batch Processing E2E', () => {
  let context;
  let extensionId;
  let serviceWorker;
  let fixtureServer;
  let fixtureBaseUrl;

  function fixtureUrl(pathname) {
    return `${fixtureBaseUrl}${pathname}`;
  }

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    ({ server: fixtureServer, baseUrl: fixtureBaseUrl } = await startFixtureServer());

    [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    }
    extensionId = new URL(serviceWorker.url()).host;

    await primeFixtureTabLoad(context, fixtureUrl('/batch/alpha.html'));
  });

  test.afterAll(async () => {
    await context?.close();
    await stopFixtureServer(fixtureServer);
  });

  test('captures full content for Obsidian links page in batch flow', async () => {
    test.setTimeout(240000);

    await serviceWorker.evaluate(() => ensureOffscreenDocumentExists());
    const state = await runBatchCapture(context, extensionId, serviceWorker, [
      fixtureUrl('/batch/alpha.html'),
      fixtureUrl('/batch/beta.html'),
      fixtureUrl('/batch/obsidian-links.html')
    ]);
    const finalUpdate = getFinalProgressUpdate(state);
    const seenUrls = getProgressUrls(state);
    const markdownFiles = getCapturedMarkdownFiles(state);

    expect(finalUpdate?.status).toBe('finished');
    expect(finalUpdate?.failed ?? 0).toBe(0);
    expect(seenUrls.has(fixtureUrl('/batch/alpha.html'))).toBeTruthy();
    expect(seenUrls.has(fixtureUrl('/batch/beta.html'))).toBeTruthy();
    expect(seenUrls.has(fixtureUrl('/batch/obsidian-links.html'))).toBeTruthy();
    expect(markdownFiles).toHaveLength(3);

    expectAnyCapturedFileToContain(markdownFiles, 'Alpha Fixture Heading');
    expectAnyCapturedFileToContain(markdownFiles, 'Alpha fixture body paragraph for deterministic batch conversion.');
    expectAnyCapturedFileToContain(markdownFiles, 'Beta Fixture Heading');
    expectAnyCapturedFileToContain(markdownFiles, 'const beta = true;');
    expectAnyCapturedFileToContain(markdownFiles, 'Linking notes');
    expectAnyCapturedFileToContain(markdownFiles, 'Learn how to link to notes, attachments, and other files from your notes.');
    expectAnyCapturedFileToContain(markdownFiles, 'A block is a unit of text in your note.');
  });

  test('captures later repeated sections when downloadsApi image settings are enabled', async () => {
    test.setTimeout(240000);

    const state = await withTemporarySyncOptions(serviceWorker, {
      downloadImages: true,
      downloadMode: 'downloadsApi'
    }, async () => (
      await runSingleUrlBatchCapture(
        context,
        extensionId,
        serviceWorker,
        fixtureUrl('/batch/repeated-sections.html')
      )
    ));
    const finalUpdate = getFinalProgressUpdate(state);
    const seenTitles = getProgressTitles(state).join('\n');
    const seenUrls = getProgressUrls(state);
    const markdownFiles = getCapturedMarkdownFiles(state);
    const repeatedMarkdown = markdownFiles[0]?.content || '';

    expect(finalUpdate?.status).toBe('finished');
    expect(finalUpdate?.failed ?? 0).toBe(0);
    expect(seenUrls.has(fixtureUrl('/batch/repeated-sections.html'))).toBeTruthy();
    expect(seenTitles).toContain('Repeated Sections Fixture');
    expect(markdownFiles).toHaveLength(1);
    expect(repeatedMarkdown).toContain("A few days ago I've heard that Open Watcom is able to generate tiny model binaries.");
    expect(repeatedMarkdown).toContain('## Replacing the wrapper');
    expect(repeatedMarkdown).toContain('## Full code');
    expect(repeatedMarkdown).toContain('wrapper.asm');
    expect(repeatedMarkdown).toContain('main.lnk');
  });

  test('combines pages into one document with a single template wrapper', async () => {
    test.setTimeout(240000);

    // includeTemplate is off by default; turn it on so the test exercises the
    // template path. Combined output must suppress per-page templates and add
    // exactly one document-level frontmatter/backmatter wrapper.
    const state = await withTemporarySyncOptions(serviceWorker, {
      includeTemplate: true
    }, async () => (
      await runBatchCapture(context, extensionId, serviceWorker, [
        fixtureUrl('/batch/alpha.html'),
        fixtureUrl('/batch/beta.html')
      ], { batchSaveMode: 'combined' })
    ));

    const finalUpdate = getFinalProgressUpdate(state);
    expect(finalUpdate?.status).toBe('finished');
    expect(finalUpdate?.failed ?? 0).toBe(0);
    expect(finalUpdate?.batchSaveMode).toBe('combined');

    // Combined mode emits a single assembled document, never a ZIP.
    expect(state.zipCalls || []).toHaveLength(0);
    const generatedFiles = state.generatedFiles || [];
    expect(generatedFiles).toHaveLength(1);

    const combined = normalizeMarkdown(generatedFiles[0].content);

    // Both pages live in the one document.
    expect(combined).toContain('Alpha Fixture Heading');
    expect(combined).toContain('Alpha fixture body paragraph for deterministic batch conversion.');
    expect(combined).toContain('Beta Fixture Heading');
    expect(combined).toContain('const beta = true;');

    // The excerpt block is unique to the default frontmatter template. Without
    // suppression each page would carry its own, so two URLs would yield two
    // blocks; the fix collapses it to one document-level wrapper.
    const templateBlocks = combined.match(/> ## Excerpt/g) || [];
    expect(templateBlocks).toHaveLength(1);

    // The single frontmatter sits at the top of the assembled document.
    expect(combined.startsWith('---\ncreated:')).toBeTruthy();
  });

  for (const batchCase of deterministicCases) {
    test(batchCase.name, async () => {
      test.setTimeout(240000);

      const state = await runSingleUrlBatchCapture(
        context,
        extensionId,
        serviceWorker,
        fixtureUrl(batchCase.path)
      );
      const finalUpdate = getFinalProgressUpdate(state);
      const seenUrls = getProgressUrls(state);
      const markdownFiles = getCapturedMarkdownFiles(state);
      const capturedMarkdown = markdownFiles[0]?.content || '';

      expect(finalUpdate?.status).toBe('finished');
      expect(finalUpdate?.failed ?? 0).toBe(0);
      expect(seenUrls.has(fixtureUrl(batchCase.path))).toBeTruthy();
      expect(markdownFiles).toHaveLength(1);
      const expectedMarkdown = loadSnapshotFixture(batchCase.expectedFixture);
      expect(capturedMarkdown).toBe(expectedMarkdown);
    });
  }
});
