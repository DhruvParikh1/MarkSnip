const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');

const fixtureHost = 'https://fixtures.marksnip.test';
const fixturePathname = '/extension/deterministic-article.html';
const fixtureUrl = `${fixtureHost}${fixturePathname}`;
const fixtureFile = path.join(__dirname, '../tests/fixtures/e2e-pages/extension/deterministic-article.html');
const clipSentinel = 'This page is routed by Playwright for deterministic extension E2E tests.';

function parseArgs(argv) {
  const options = {
    iterations: 10,
    warmup: 1,
    targets: []
  };

  const nextValue = (index, arg) => {
    const value = argv[index + 1];
    if (value === undefined) {
      throw new Error(`${arg} requires a value`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--iterations') {
      options.iterations = Number(nextValue(i, arg) || options.iterations);
      i += 1;
      continue;
    }
    if (arg === '--warmup') {
      options.warmup = Number(nextValue(i, arg) || options.warmup);
      i += 1;
      continue;
    }
    if (arg === '--current') {
      options.targets.push({ label: 'current', extensionPath: path.resolve(nextValue(i, arg)) });
      i += 1;
      continue;
    }
    if (arg === '--baseline') {
      options.targets.push({ label: 'baseline', extensionPath: path.resolve(nextValue(i, arg)) });
      i += 1;
      continue;
    }
    if (arg === '--extension-path') {
      options.targets.push({ label: 'target', extensionPath: path.resolve(nextValue(i, arg)) });
      i += 1;
      continue;
    }
  }

  if (options.targets.length === 0) {
    options.targets.push({
      label: 'current',
      // The extension root is this repo's src/ directory (one level up from
      // scripts/), matching the layout the docs tell users to benchmark.
      extensionPath: path.resolve(__dirname, '..')
    });
  }

  if (!Number.isFinite(options.iterations) || options.iterations < 1) {
    throw new Error(`Invalid --iterations value: ${options.iterations}`);
  }
  if (!Number.isFinite(options.warmup) || options.warmup < 0) {
    throw new Error(`Invalid --warmup value: ${options.warmup}`);
  }

  return options;
}

async function installFixtureRoutes(context) {
  await context.route(`${fixtureHost}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== fixturePathname) {
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

async function loadExtensionContext(extensionPath) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marksnip-popup-bench-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  await installFixtureRoutes(context);
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 60000 });
  }

  const extensionId = new URL(serviceWorker.url()).host;
  return { context, serviceWorker, extensionId, userDataDir };
}

async function resetPopupBenchmarkState(serviceWorker) {
  await serviceWorker.evaluate(async () => {
    await browser.storage.local.clear();
    await browser.storage.sync.clear();

    await browser.storage.local.set({
      librarySettings: {
        enabled: true,
        autoSaveOnPopupOpen: false,
        itemsToKeep: 10
      },
      libraryItems: [
        {
          id: 'bench-one',
          pageUrl: 'https://example.com/alpha',
          normalizedPageUrl: 'https://example.com/alpha',
          title: 'Alpha',
          markdown: '# Alpha',
          savedAt: '2026-03-20T10:00:00.000Z',
          previewText: 'Alpha'
        },
        {
          id: 'bench-two',
          pageUrl: 'https://example.com/beta',
          normalizedPageUrl: 'https://example.com/beta',
          title: 'Beta',
          markdown: '# Beta',
          savedAt: '2026-03-20T09:00:00.000Z',
          previewText: 'Beta'
        },
        {
          id: 'bench-three',
          pageUrl: 'https://example.com/gamma',
          normalizedPageUrl: 'https://example.com/gamma',
          title: 'Gamma',
          markdown: '# Gamma',
          savedAt: '2026-03-20T08:00:00.000Z',
          previewText: 'Gamma'
        }
      ],
      pendingNotifications: [
        {
          id: 'popup-benchmark-notification',
          type: 'support-milestone',
          title: 'Benchmark notification',
          message: 'Deferred popup notification benchmark body',
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
  });
}

async function waitForMetric(page, pageFunction, timeout, arg = null) {
  const handle = await page.waitForFunction(pageFunction, arg, {
    timeout,
    polling: 'raf'
  });
  const value = await handle.jsonValue();
  await handle.dispose();
  return Number(value);
}

async function runIteration({ context, serviceWorker, extensionId }) {
  await resetPopupBenchmarkState(serviceWorker);

  const fixturePage = await context.newPage();
  const popupPage = await context.newPage();

  try {
    await fixturePage.goto(fixtureUrl);
    await fixturePage.waitForLoadState('networkidle');
    await fixturePage.bringToFront();

    await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const shellVisibleMs = await waitForMetric(
      popupPage,
      () => {
        const el = document.getElementById('container');
        return el && getComputedStyle(el).display !== 'none' ? performance.now() : 0;
      },
      15000
    );

    const editorReadyMs = await waitForMetric(
      popupPage,
      () => {
        if (window.cm && typeof window.cm.getValue === 'function') {
          return performance.now();
        }
        return document.querySelector('.CodeMirror') ? performance.now() : 0;
      },
      15000
    );

    const clipRenderedMs = await waitForMetric(
      popupPage,
      (needle) => {
        const titleValue = document.getElementById('title')?.value || '';
        const textareaValue = document.getElementById('md')?.value || '';
        const codeMirrorText = document.querySelector('.CodeMirror-code')?.textContent || '';
        return (
          titleValue.includes('Deterministic Markdown Fixture') ||
          textareaValue.includes(needle) ||
          codeMirrorText.includes(needle)
        ) ? performance.now() : 0;
      },
      45000,
      clipSentinel
    );

    const libraryBadgeReadyMs = await waitForMetric(
      popupPage,
      () => {
        const badge = document.getElementById('libraryCountBadge');
        return badge && badge.textContent.trim() === '3' ? performance.now() : 0;
      },
      10000
    );

    const notificationVisibleMs = await waitForMetric(
      popupPage,
      () => {
        const text = Array.from(document.querySelectorAll('*'))
          .map((element) => element.shadowRoot?.textContent || '')
          .join('\n');
        return text.includes('Benchmark notification') ? performance.now() : 0;
      },
      15000
    );

    return {
      shellVisibleMs,
      editorReadyMs,
      clipRenderedMs,
      libraryBadgeReadyMs,
      notificationVisibleMs
    };
  } finally {
    await popupPage.close().catch(() => {});
    await fixturePage.close().catch(() => {});
  }
}

function percentile(values, p) {
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function summarizeMetric(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    min: round(sorted[0]),
    median: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    mean: round(sum / sorted.length),
    max: round(sorted[sorted.length - 1])
  };
}

function summarizeRuns(runs) {
  const metrics = Object.keys(runs[0]);
  return metrics.reduce((summary, metric) => {
    summary[metric] = summarizeMetric(runs.map((run) => run[metric]));
    return summary;
  }, {});
}

function printTargetSummary(label, summary) {
  console.log(`\n${label.toUpperCase()}`);
  for (const [metric, stats] of Object.entries(summary)) {
    console.log(
      `  ${metric}: median=${stats.median}ms p95=${stats.p95}ms mean=${stats.mean}ms min=${stats.min}ms max=${stats.max}ms`
    );
  }
}

function printComparison(currentSummary, baselineSummary) {
  console.log('\nCOMPARISON (positive % means current is faster)');
  for (const metric of Object.keys(currentSummary)) {
    const baselineMedian = baselineSummary[metric].median;
    const currentMedian = currentSummary[metric].median;
    const deltaMs = round(baselineMedian - currentMedian);
    const deltaPct = baselineMedian === 0 ? 0 : round((deltaMs / baselineMedian) * 100);
    console.log(
      `  ${metric}: current=${currentMedian}ms baseline=${baselineMedian}ms delta=${deltaMs}ms (${deltaPct}%)`
    );
  }
}

async function benchmarkTarget(target, iterations, warmup) {
  const loaded = await loadExtensionContext(target.extensionPath);
  try {
    const runs = [];
    const totalRuns = warmup + iterations;
    for (let index = 0; index < totalRuns; index++) {
      const run = await runIteration(loaded);
      const runNumber = index + 1;
      const warmupLabel = index < warmup ? 'warmup' : `run ${runNumber - warmup}/${iterations}`;
      console.log(
        `${target.label} ${warmupLabel}: shell=${round(run.shellVisibleMs)}ms editor=${round(run.editorReadyMs)}ms clip=${round(run.clipRenderedMs)}ms library=${round(run.libraryBadgeReadyMs)}ms notification=${round(run.notificationVisibleMs)}ms`
      );
      if (index >= warmup) {
        runs.push(run);
      }
    }

    return {
      target,
      runs,
      summary: summarizeRuns(runs)
    };
  } finally {
    await loaded.context.close();
    fs.rmSync(loaded.userDataDir, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const results = [];

  for (const target of options.targets) {
    console.log(`\nBenchmarking ${target.label} at ${target.extensionPath}`);
    results.push(await benchmarkTarget(target, options.iterations, options.warmup));
  }

  for (const result of results) {
    printTargetSummary(result.target.label, result.summary);
  }

  if (results.length === 2) {
    const current = results.find((result) => result.target.label === 'current');
    const baseline = results.find((result) => result.target.label === 'baseline');
    if (current && baseline) {
      printComparison(current.summary, baseline.summary);
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  percentile,
  summarizeMetric
};
