const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { liveClipCases } = require('../tests/helpers/live-public-cases');

const STEALTH_DISABLED_EVASIONS = [
  'chrome.runtime',
  'chrome.app',
  'chrome.csi',
  'chrome.loadTimes',
  'iframe.contentWindow'
];

function buildStealthPlugin() {
  const stealth = StealthPlugin();
  for (const name of STEALTH_DISABLED_EVASIONS) {
    stealth.enabledEvasions.delete(name);
  }
  return stealth;
}

const extensionRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extensionRoot, '..');
const defaultCaseIds = ['runjs-equations', 'ruby-data-docs', 'virginia-beach-celebrating-children'];

function parseArgs(argv) {
  const args = {
    cases: defaultCaseIds,
    ref: 'HEAD',
    outputRoot: path.join(repoRoot, 'test-artifacts', 'live-markdown-comparisons'),
    headless: false,
    keepWorkDir: false,
    waitAfterLoadMs: 0,
    storageOptions: {},
    stealth: true,
    captchaWaitMs: 60000,
    allowSkips: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--cases' && next) {
      args.cases = next === 'all'
        ? ['all']
        : next.split(',').map(value => value.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--ref' && next) {
      args.ref = next;
      index += 1;
    } else if (arg === '--output-root' && next) {
      args.outputRoot = path.resolve(next);
      index += 1;
    } else if (arg === '--headless') {
      args.headless = true;
    } else if (arg === '--wait-after-load' && next) {
      const seconds = Number(next);
      if (!Number.isFinite(seconds) || seconds < 0) {
        throw new Error('--wait-after-load must be a non-negative number of seconds');
      }
      args.waitAfterLoadMs = seconds * 1000;
      index += 1;
    } else if (arg === '--keep-work-dir') {
      args.keepWorkDir = true;
    } else if (arg === '--no-stealth') {
      args.stealth = false;
    } else if (arg === '--captcha-wait' && next) {
      const seconds = Number(next);
      if (!Number.isFinite(seconds) || seconds < 0) {
        throw new Error('--captcha-wait must be a non-negative number of seconds');
      }
      args.captchaWaitMs = seconds * 1000;
      index += 1;
    } else if (arg === '--allow-skips') {
      args.allowSkips = true;
    } else if (arg === '--include-hidden-content') {
      args.storageOptions.skipHiddenContent = false;
    } else if (arg === '--skip-hidden-content' && next) {
      const normalized = next.toLowerCase();
      if (!['on', 'off', 'true', 'false'].includes(normalized)) {
        throw new Error('--skip-hidden-content must be "on" or "off"');
      }
      args.storageOptions.skipHiddenContent = normalized === 'on' || normalized === 'true';
      index += 1;
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Capture live markdown snapshots for the current extension and a clean git ref.

Usage:
  node scripts/capture-live-markdown-snapshots.js [options]

Options:
  --cases <ids|all>   Case ids from tests/helpers/live-public-cases.js
  --ref HEAD          Git ref used for the base extension copy
  --output-root <dir> Artifact root
  --headless          Run Chromium headless
  --wait-after-load <seconds>
                      Wait after each page load before selector/capture
  --skip-hidden-content <on|off>
                      Store the extension option before capture
  --include-hidden-content
                      Alias for --skip-hidden-content off
  --keep-work-dir     Keep the exported base extension copy
  --no-stealth        Disable Playwright stealth evasions (debug aid)
  --captcha-wait <seconds>
                      Window for manually solving captcha (default 60)
  --allow-skips       Treat captcha-/permission-blocked cases as non-failures
`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function writeText(filePath, value) {
  fs.writeFileSync(filePath, String(value || '').replace(/\r\n/g, '\n'), 'utf8');
}

function createRunId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''), 'utf8')
    .digest('hex');
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function selectCases(caseIds) {
  if (caseIds.length === 1 && caseIds[0] === 'all') {
    return liveClipCases;
  }

  const byId = new Map(liveClipCases.map(liveCase => [liveCase.id, liveCase]));
  return caseIds.map(caseId => {
    const liveCase = byId.get(caseId);
    if (!liveCase) {
      throw new Error(`Unknown live case "${caseId}". Known ids: ${Array.from(byId.keys()).join(', ')}`);
    }
    return liveCase;
  });
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    encoding: options.encoding || 'utf8',
    stdio: options.stdio || 'pipe'
  });

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`);
  }

  return result;
}

function safeRemoveInside(parentDir, targetPath) {
  const parent = path.resolve(parentDir);
  const target = path.resolve(targetPath);
  if (!target.startsWith(`${parent}${path.sep}`)) {
    throw new Error(`Refusing to remove outside ${parent}: ${target}`);
  }
  fs.rmSync(target, { recursive: true, force: true });
}

function exportBaseExtension(ref, runDir) {
  const workDir = path.join(runDir, '_work');
  const baseExtensionDir = path.join(workDir, 'base-extension');
  const tarPath = path.join(workDir, 'base-extension.tar');

  ensureDir(baseExtensionDir);
  runCommand('git', ['archive', '--format=tar', '--output', tarPath, `${ref}:src`], {
    cwd: repoRoot
  });
  runCommand('tar', ['-xf', tarPath, '-C', baseExtensionDir], {
    cwd: repoRoot
  });

  return {
    workDir,
    extensionDir: baseExtensionDir
  };
}

async function waitForExtensionServiceWorker(context) {
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 60000 });
  }

  if (!serviceWorker) {
    throw new Error('Could not find the extension service worker.');
  }

  return serviceWorker;
}

async function getTabIdForUrl(serviceWorker, url) {
  return await serviceWorker.evaluate(async ({ targetUrl }) => {
    const tabs = await browser.tabs.query({});
    return tabs.find(tab => tab.url === targetUrl)?.id || null;
  }, { targetUrl: url });
}

async function resetExtensionStorage(serviceWorker, storageOptions = {}) {
  await serviceWorker.evaluate(async ({ nextOptions }) => {
    await browser.storage.sync.clear();
    await browser.storage.local.clear();
    if (nextOptions && Object.keys(nextOptions).length) {
      await browser.storage.sync.set(nextOptions);
    }
  }, {
    nextOptions: JSON.parse(JSON.stringify(storageOptions || {}))
  });
}

async function capturePageState(page, liveCase, responseStatus = null) {
  return await page.evaluate(({ selector, responseStatus }) => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const mainRoot = document.querySelector('article, main, [role="main"]') || document.body || document.documentElement;
    return {
      responseStatus,
      finalUrl: window.location.href,
      pageTitle: document.title || '',
      selectorText: normalize(document.querySelector(selector)?.textContent || ''),
      headings: Array.from(document.querySelectorAll('h1, h2, h3'))
        .map(heading => normalize(heading.textContent))
        .filter(Boolean)
        .slice(0, 30),
      mainTextExcerpt: normalize(mainRoot?.innerText || mainRoot?.textContent || '').slice(0, 1600)
    };
  }, {
    selector: liveCase.selector,
    responseStatus
  });
}

async function readPopupClipState(popupPage) {
  return await popupPage.evaluate(() => {
    const markdown = typeof cm?.getValue === 'function'
      ? cm.getValue()
      : document.getElementById('md')?.value || '';

    return {
      markdown,
      title: document.getElementById('title')?.value || ''
    };
  });
}

async function waitForMarkdown(popupPage, liveCase) {
  const expectedSnippet = liveCase.snippets?.[0] || '';
  const startedAt = Date.now();
  let latest = '';

  while (Date.now() - startedAt < 60000) {
    latest = (await readPopupClipState(popupPage)).markdown || '';
    const blockedStatus = classifyClipError(latest);
    if (blockedStatus) {
      throw new Error(`Clip output was blocked: ${blockedStatus}`);
    }
    if (
      expectedSnippet && latest.includes(expectedSnippet) ||
      latest.trim().length > 500 && !latest.includes('Error clipping the page')
    ) {
      return latest;
    }
    await popupPage.waitForTimeout(500);
  }

  throw new Error(`Timed out waiting for markdown for ${liveCase.id}. Latest length: ${latest.length}`);
}

const CAPTCHA_TITLE_MARKERS = [
  'Just a moment',
  'Verifying you are human',
  'Attention Required',
  'Checking your browser',
  'Please verify',
  'Cloudflare',
  'Access denied'
];

const CAPTCHA_CONTENT_MARKERS = [
  'Are you a robot?',
  'captcha challenge',
  'Verification successful. Waiting for',
  'Please confirm you are a human'
];

const CAPTCHA_SELECTORS = [
  'iframe[src*="challenges.cloudflare.com"]',
  'iframe[src*="hcaptcha.com"]',
  'iframe[src*="recaptcha"]',
  '#cf-challenge-running',
  '#challenge-form',
  '[id*="captcha" i]'
];

const PERMISSION_ERROR_MARKERS = [
  'Cannot access contents of the page',
  'Extension manifest must request permission',
  'Cannot access a chrome',
  'cannot be scripted'
];

async function detectCaptcha(page) {
  const title = await page.title().catch(() => '');
  if (CAPTCHA_TITLE_MARKERS.some(marker => title.includes(marker))) {
    return true;
  }
  for (const selector of CAPTCHA_SELECTORS) {
    const visible = await page.locator(selector).first().isVisible().catch(() => false);
    if (visible) {
      return true;
    }
  }
  return false;
}

async function waitForCaptchaClear(page, liveCase, ms) {
  console.log(`[captcha] Detected on ${liveCase.id}. Waiting up to ${Math.round(ms / 1000)}s — solve it in the visible window if you can.`);
  await page.bringToFront().catch(() => {});
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!(await detectCaptcha(page))) {
      return true;
    }
    await page.waitForTimeout(2000);
  }
  return false;
}

function classifyClipError(clipMarkdown) {
  const text = String(clipMarkdown || '');
  if (CAPTCHA_CONTENT_MARKERS.some(marker => text.includes(marker))) {
    return 'captcha-blocked';
  }
  if (PERMISSION_ERROR_MARKERS.some(marker => text.includes(marker))) {
    return 'permission-blocked';
  }
  if (text.includes('Error clipping the page')) {
    return 'failed';
  }
  return null;
}

function classifyCaptureError(errorMessage, clipMarkdown) {
  const fromClip = classifyClipError(clipMarkdown);
  if (fromClip) {
    return fromClip;
  }
  const message = String(errorMessage || '');
  if (message.includes('Timeout') && message.includes('selector')) {
    return 'selector-timeout';
  }
  return 'failed';
}

async function captureCase(context, extensionId, serviceWorker, liveCase, options) {
  const livePage = await context.newPage();
  const popupPage = await context.newPage();

  try {
    const response = await livePage.goto(liveCase.url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    if (await detectCaptcha(livePage)) {
      const cleared = await waitForCaptchaClear(livePage, liveCase, options.captchaWaitMs);
      if (!cleared) {
        return {
          ok: false,
          status: 'captcha-blocked',
          error: 'Captcha did not clear within the configured wait window.',
          page: await capturePageState(livePage, liveCase, null).catch(() => null),
          clip: { markdown: '', title: '' }
        };
      }
    }

    const waitAfterLoadMs = Math.max(options.waitAfterLoadMs || 0, liveCase.waitAfterLoadMs || 0);
    if (waitAfterLoadMs > 0) {
      console.log(`Waiting ${Math.round(waitAfterLoadMs / 1000)}s before capturing ${liveCase.id}.`);
      await livePage.bringToFront();
      await livePage.waitForTimeout(waitAfterLoadMs);
    }
    await livePage.waitForSelector(liveCase.selector, { timeout: 60000 });
    const pageState = await capturePageState(
      livePage,
      liveCase,
      typeof response?.status === 'function' ? response.status() : null
    );

    await livePage.bringToFront();
    const tabId = await getTabIdForUrl(serviceWorker, livePage.url());
    if (!tabId) {
      throw new Error(`Could not resolve tab id for ${livePage.url()}`);
    }

    await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await popupPage.waitForSelector('#container', { state: 'visible', timeout: 60000 });
    await popupPage.evaluate(async targetTabId => {
      await clipSite(targetTabId);
    }, tabId);

    await waitForMarkdown(popupPage, liveCase);
    const clipState = await readPopupClipState(popupPage);

    return {
      ok: true,
      status: 'passed',
      page: pageState,
      clip: clipState
    };
  } catch (error) {
    const clipState = await readPopupClipState(popupPage).catch(() => ({ markdown: '', title: '' }));
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: classifyCaptureError(errorMessage, clipState.markdown),
      error: errorMessage,
      page: livePage.isClosed() ? null : await capturePageState(livePage, liveCase, null).catch(() => null),
      clip: clipState
    };
  } finally {
    await popupPage.close().catch(() => {});
    await livePage.close().catch(() => {});
  }
}

function buildCaseRecord(versionLabel, liveCase, result, options) {
  const markdown = result.clip?.markdown || '';
  const versionSnippets = versionLabel === 'current'
    ? liveCase.currentSnippets || []
    : liveCase.baseSnippets || [];
  const expectedSnippets = [...(liveCase.snippets || []), ...versionSnippets];
  const missingSnippets = expectedSnippets.filter(snippet => !markdown.includes(snippet));

  const baseStatus = result.status || (result.ok ? 'passed' : 'failed');
  const status = baseStatus === 'passed' && missingSnippets.length > 0
    ? 'failed'
    : baseStatus;
  const blocked = status === 'captcha-blocked' || status === 'permission-blocked';

  return {
    version: versionLabel,
    caseId: liveCase.id,
    caseName: liveCase.name,
    url: liveCase.url,
    storageOptions: liveCase.storageOptions || null,
    status,
    ok: status === 'passed',
    blocked,
    error: result.error || null,
    stealth: options?.stealth
      ? { enabled: true, disabledEvasions: STEALTH_DISABLED_EVASIONS }
      : { enabled: false },
    page: result.page,
    clip: {
      title: result.clip?.title || '',
      markdownLength: markdown.length,
      markdownHash: sha256(markdown),
      markdownExcerpt: normalizeText(markdown).slice(0, 1600),
      missingSnippets
    }
  };
}

async function captureVersion(versionLabel, extensionPath, cases, runDir, options) {
  const versionDir = path.join(runDir, versionLabel);
  const markdownDir = path.join(versionDir, 'markdown');
  const summaryDir = path.join(versionDir, 'summary');
  const profileDir = path.join(runDir, '_profiles', versionLabel);
  ensureDir(markdownDir);
  ensureDir(summaryDir);

  safeRemoveInside(runDir, profileDir);
  ensureDir(profileDir);

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: options.headless,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const serviceWorker = await waitForExtensionServiceWorker(context);
    const extensionId = new URL(serviceWorker.url()).host;
    const records = [];
    for (const liveCase of cases) {
      console.log(`[${versionLabel}] Capturing ${liveCase.id}: ${liveCase.url}`);
      await resetExtensionStorage(serviceWorker, {
        ...options.storageOptions,
        ...(liveCase.storageOptions || {})
      });
      const result = await captureCase(context, extensionId, serviceWorker, liveCase, options);
      const record = buildCaseRecord(versionLabel, liveCase, result, options);
      records.push(record);

      writeText(path.join(markdownDir, `${liveCase.id}.md`), result.clip?.markdown || '');
      writeJson(path.join(summaryDir, `${liveCase.id}.json`), record);
    }

    return records;
  } finally {
    await context.close().catch(() => {});
  }
}

function firstDifferentLine(left, right) {
  const leftLines = String(left || '').replace(/\r\n/g, '\n').split('\n');
  const rightLines = String(right || '').replace(/\r\n/g, '\n').split('\n');
  const length = Math.max(leftLines.length, rightLines.length);

  for (let index = 0; index < length; index += 1) {
    if (leftLines[index] !== rightLines[index]) {
      return {
        lineNumber: index + 1,
        base: leftLines[index] || '',
        current: rightLines[index] || ''
      };
    }
  }

  return null;
}

function buildDiff(baseMarkdownPath, currentMarkdownPath) {
  const result = spawnSync('git', [
    '-c',
    'core.autocrlf=false',
    'diff',
    '--no-index',
    '--no-color',
    '--',
    baseMarkdownPath,
    currentMarkdownPath
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe'
  });

  return [result.stdout, result.stderr].filter(Boolean).join('\n');
}

function compareVersions(cases, runDir, baseRecords, currentRecords) {
  const diffDir = path.join(runDir, 'diff');
  ensureDir(diffDir);

  const baseById = new Map((baseRecords || []).map(record => [record.caseId, record]));
  const currentById = new Map((currentRecords || []).map(record => [record.caseId, record]));

  const summaries = cases.map(liveCase => {
    const baseMarkdownPath = path.join(runDir, 'base', 'markdown', `${liveCase.id}.md`);
    const currentMarkdownPath = path.join(runDir, 'current', 'markdown', `${liveCase.id}.md`);
    const diffPath = path.join(diffDir, `${liveCase.id}.diff`);
    const baseMarkdown = fs.existsSync(baseMarkdownPath) ? fs.readFileSync(baseMarkdownPath, 'utf8') : '';
    const currentMarkdown = fs.existsSync(currentMarkdownPath) ? fs.readFileSync(currentMarkdownPath, 'utf8') : '';
    const baseHash = sha256(baseMarkdown);
    const currentHash = sha256(currentMarkdown);
    const diffText = buildDiff(baseMarkdownPath, currentMarkdownPath);

    writeText(diffPath, diffText);

    const baseRecord = baseById.get(liveCase.id);
    const currentRecord = currentById.get(liveCase.id);
    const baseStatus = baseRecord?.status || 'missing';
    const currentStatus = currentRecord?.status || 'missing';
    const blockedSide = baseRecord?.blocked
      ? 'base'
      : currentRecord?.blocked
        ? 'current'
        : null;
    const blockedRecord = blockedSide === 'base' ? baseRecord : blockedSide === 'current' ? currentRecord : null;
    const status = blockedSide
      ? `${blockedSide}:${blockedRecord.status}`
      : (baseHash === currentHash ? 'unchanged' : 'changed');

    return {
      caseId: liveCase.id,
      url: liveCase.url,
      status,
      changed: status === 'changed',
      baseStatus,
      currentStatus,
      base: {
        markdownPath: path.relative(runDir, baseMarkdownPath),
        markdownLength: baseMarkdown.length,
        markdownHash: baseHash
      },
      current: {
        markdownPath: path.relative(runDir, currentMarkdownPath),
        markdownLength: currentMarkdown.length,
        markdownHash: currentHash
      },
      diffPath: path.relative(runDir, diffPath),
      firstDifferentLine: blockedSide ? null : firstDifferentLine(baseMarkdown, currentMarkdown)
    };
  });

  writeJson(path.join(diffDir, 'summary.json'), summaries);
  return summaries;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cases = selectCases(options.cases);
  const runId = createRunId();
  const runDir = path.join(options.outputRoot, runId);
  ensureDir(runDir);

  if (options.stealth) {
    chromium.use(buildStealthPlugin());
    console.log(`Stealth enabled (disabled evasions: ${STEALTH_DISABLED_EVASIONS.join(', ')})`);
  } else {
    console.log('Stealth disabled (--no-stealth)');
  }

  console.log(`Writing live markdown comparison artifacts to ${runDir}`);
  const baseExport = exportBaseExtension(options.ref, runDir);

  const metadata = {
    runId,
    runAt: new Date().toISOString(),
    baseRef: options.ref,
    currentExtensionPath: extensionRoot,
    baseExtensionPath: options.keepWorkDir ? baseExport.extensionDir : null,
    baseExtensionPathNote: options.keepWorkDir ? null : 'Temporary base extension export is removed after capture.',
    storageOptions: options.storageOptions,
    waitAfterLoadMs: options.waitAfterLoadMs,
    captchaWaitMs: options.captchaWaitMs,
    allowSkips: options.allowSkips,
    stealth: options.stealth
      ? { enabled: true, disabledEvasions: STEALTH_DISABLED_EVASIONS }
      : { enabled: false },
    platform: `${os.platform()} ${os.release()}`,
    cases: cases.map(liveCase => ({
      id: liveCase.id,
      url: liveCase.url,
      storageOptions: liveCase.storageOptions || null
    }))
  };
  writeJson(path.join(runDir, 'metadata.json'), metadata);

  const baseRecords = await captureVersion('base', baseExport.extensionDir, cases, runDir, options);
  const currentRecords = await captureVersion('current', extensionRoot, cases, runDir, options);
  const comparisons = compareVersions(cases, runDir, baseRecords, currentRecords);

  writeJson(path.join(runDir, 'summary.json'), {
    ...metadata,
    base: baseRecords,
    current: currentRecords,
    comparisons
  });

  if (!options.keepWorkDir) {
    safeRemoveInside(runDir, baseExport.workDir);
    safeRemoveInside(runDir, path.join(runDir, '_profiles'));
  }

  console.log('\nComparison summary:');
  comparisons.forEach(comparison => {
    console.log(`- ${comparison.caseId}: ${comparison.status} (${comparison.base.markdownLength} -> ${comparison.current.markdownLength} chars)`);
  });
  console.log(`\nArtifacts: ${runDir}`);

  const allRecords = [...baseRecords, ...currentRecords];
  const blockedRecords = allRecords.filter(record => record.blocked);
  const failedRecords = allRecords.filter(record => !record.ok && !record.blocked);

  if (blockedRecords.length) {
    blockedRecords.forEach(record => {
      console.warn(`Blocked: ${record.version}/${record.caseId} (${record.status}): ${record.error || ''}`);
    });
  }

  if (failedRecords.length) {
    failedRecords.forEach(record => {
      console.error(`Capture failed for ${record.version}/${record.caseId} (${record.status}): ${record.error || 'missing expected snippets'}`);
    });
    throw new Error(`${failedRecords.length} live markdown snapshot capture(s) failed. See artifacts above.`);
  }

  if (blockedRecords.length && !options.allowSkips) {
    throw new Error(`${blockedRecords.length} case(s) blocked (captcha/permission). Re-run with --allow-skips to ignore, or fix the underlying issue.`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
