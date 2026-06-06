const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const extensionRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extensionRoot, '..');
const artifactRoot = path.join(repoRoot, 'test-artifacts', 'firefox-live-smoke');
const extensionPath = path.join(extensionRoot, '.build', 'firefox');
const mathMLFixturePath = path.join(extensionRoot, 'tests', 'fixtures', 'e2e-pages', 'extension', 'mathml-article.html');

function parseArgs(argv) {
  const args = {
    headless: false,
    keepProfile: false,
    firefoxBinary: process.env.FIREFOX_BINARY || '',
    timeoutMs: 60000
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--headless') {
      args.headless = true;
    } else if (arg === '--keep-profile') {
      args.keepProfile = true;
    } else if (arg === '--firefox-binary' && next) {
      args.firefoxBinary = next;
      index += 1;
    } else if (arg === '--timeout-ms' && next) {
      const timeoutMs = Number(next);
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error('--timeout-ms must be a positive number');
      }
      args.timeoutMs = timeoutMs;
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
  console.log(`Run a real Firefox smoke test against the generated Firefox extension.

Usage:
  node scripts/run-firefox-live-smoke.js [options]

Options:
  --headless                 Run Firefox headless. The default is headed.
  --firefox-binary <path>    Firefox executable path. Also supported through FIREFOX_BINARY.
  --keep-profile             Keep the temporary Firefox profile for debugging.
  --timeout-ms <ms>          Timeout for browser/protocol operations.
`);
}

function ensureFile(filePath, message) {
  if (!fs.existsSync(filePath)) {
    throw new Error(message);
  }
}

function findFirefoxBinary(explicitPath) {
  const candidates = [];
  if (explicitPath) {
    candidates.push(explicitPath);
  }

  let playwrightFirefox = '';
  try {
    const { firefox } = require('playwright');
    playwrightFirefox = firefox.executablePath();
  } catch {
    // Playwright is optional for this lookup. The project normally has it installed.
  }

  if (process.env.CI && playwrightFirefox) {
    candidates.push(playwrightFirefox);
  }

  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
      'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe'
    );
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Firefox.app/Contents/MacOS/firefox');
  } else {
    candidates.push('/usr/bin/firefox', '/usr/local/bin/firefox', '/snap/bin/firefox');
  }

  if (!process.env.CI && playwrightFirefox) {
    candidates.push(playwrightFirefox);
  }

  const found = candidates.find(candidate => candidate && fs.existsSync(candidate));
  if (!found) {
    throw new Error('Could not find a Firefox binary. Set FIREFOX_BINARY or pass --firefox-binary <path>.');
  }
  return found;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function createProfileDir() {
  ensureDir(path.join(artifactRoot, 'profiles'));
  const profileDir = fs.mkdtempSync(path.join(artifactRoot, 'profiles', 'profile-'));
  fs.writeFileSync(
    path.join(profileDir, 'user.js'),
    [
      'user_pref("browser.aboutwelcome.enabled", false);',
      'user_pref("browser.shell.checkDefaultBrowser", false);',
      'user_pref("browser.startup.homepage_override.mstone", "ignore");',
      'user_pref("browser.tabs.warnOnClose", false);',
      'user_pref("extensions.getAddons.cache.enabled", false);'
    ].join('\n'),
    'utf8'
  );
  return profileDir;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, label, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

function getWebSocketCtor() {
  if (typeof WebSocket === 'function') {
    return WebSocket;
  }
  return require('ws');
}

function connectWebSocket(url) {
  const WebSocketCtor = getWebSocketCtor();
  return new Promise((resolve, reject) => {
    const ws = new WebSocketCtor(url);
    const cleanup = () => {
      ws.removeEventListener?.('open', handleOpen);
      ws.removeEventListener?.('error', handleError);
      ws.off?.('open', handleOpen);
      ws.off?.('error', handleError);
    };
    const handleOpen = () => {
      cleanup();
      resolve(ws);
    };
    const handleError = error => {
      cleanup();
      reject(error);
    };

    if (typeof ws.addEventListener === 'function') {
      ws.addEventListener('open', handleOpen, { once: true });
      ws.addEventListener('error', handleError, { once: true });
    } else {
      ws.once('open', handleOpen);
      ws.once('error', handleError);
    }
  });
}

async function connectWebSocketWithRetry(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      return await connectWebSocket(url);
    } catch (error) {
      lastError = error;
      await wait(250);
    }
  }

  throw lastError || new Error(`Could not connect to ${url}`);
}

function addMessageListener(ws, listener) {
  if (typeof ws.addEventListener === 'function') {
    const wrapped = event => listener(event.data);
    ws.addEventListener('message', wrapped);
    return () => ws.removeEventListener('message', wrapped);
  }

  ws.on('message', listener);
  return () => ws.off('message', listener);
}

function sendWebSocketMessage(ws, payload) {
  ws.send(JSON.stringify(payload));
}

function closeWebSocket(ws) {
  try {
    ws.close();
  } catch {
    // Ignore cleanup failures.
  }
}

function decodeRemoteValue(remoteValue) {
  if (!remoteValue) {
    return undefined;
  }
  if ('value' in remoteValue && !['array', 'object'].includes(remoteValue.type)) {
    return remoteValue.value;
  }
  if (remoteValue.type === 'array') {
    return (remoteValue.value || []).map(decodeRemoteValue);
  }
  if (remoteValue.type === 'object') {
    const objectValue = {};
    for (const [key, value] of remoteValue.value || []) {
      objectValue[key] = decodeRemoteValue(value);
    }
    return objectValue;
  }
  return remoteValue;
}

function createBidiClient(ws, timeoutMs) {
  let nextId = 0;
  const pending = new Map();
  const removeListener = addMessageListener(ws, raw => {
    const message = JSON.parse(String(raw));
    if (!message.id || !pending.has(message.id)) {
      return;
    }

    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(`${message.error}: ${message.message || ''}`));
    } else {
      resolve(message.result);
    }
  });

  return {
    async send(method, params = {}, perCallTimeoutMs = timeoutMs) {
      const id = ++nextId;
      sendWebSocketMessage(ws, { id, method, params });
      return await withTimeout(
        new Promise((resolve, reject) => pending.set(id, { resolve, reject })),
        method,
        perCallTimeoutMs
      );
    },
    async evaluate(context, expression, perCallTimeoutMs = timeoutMs) {
      const result = await this.send('script.evaluate', {
        target: { context },
        expression,
        awaitPromise: true
      }, perCallTimeoutMs);

      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || JSON.stringify(result.exceptionDetails));
      }

      return decodeRemoteValue(result.result);
    },
    close() {
      removeListener();
      closeWebSocket(ws);
    }
  };
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

function createFixtureServer() {
  const server = http.createServer((request, response) => {
    if (request.url === '/mathml.html') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(fs.readFileSync(mathMLFixturePath, 'utf8'));
      return;
    }

    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });

  return {
    server,
    async start() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      return server.address().port;
    },
    close() {
      return new Promise(resolve => server.close(resolve));
    }
  };
}

function launchFirefox(firefoxBinary, profileDir, remotePort, fixtureUrl, headless) {
  const args = [
    '--profile', profileDir,
    '--no-remote',
    '--new-instance',
    '--remote-debugging-port', String(remotePort),
    '--remote-allow-hosts', 'localhost,127.0.0.1',
    '--remote-allow-system-access'
  ];

  if (headless) {
    args.push('--headless');
  }

  args.push(fixtureUrl);

  return spawn(firefoxBinary, args, {
    stdio: ['ignore', 'ignore', 'pipe']
  });
}

async function terminateFirefox(firefoxProcess) {
  if (!firefoxProcess || firefoxProcess.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(firefoxProcess.pid), '/T', '/F'], {
        stdio: 'ignore'
      });
      return;
    } catch {
      // Fall through to the normal kill path.
    }
  }

  firefoxProcess.kill();
  await Promise.race([
    new Promise(resolve => firefoxProcess.once('exit', resolve)),
    wait(5000)
  ]);
}

function removeProfile(profileDir, keepProfile) {
  if (keepProfile) {
    console.log(`Temporary Firefox profile kept at ${profileDir}`);
    return;
  }

  const artifactRootResolved = path.resolve(artifactRoot);
  const profileResolved = path.resolve(profileDir);
  if (!profileResolved.startsWith(`${artifactRootResolved}${path.sep}`)) {
    throw new Error(`Refusing to remove profile outside ${artifactRootResolved}: ${profileResolved}`);
  }

  try {
    fs.rmSync(profileResolved, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 250
    });
  } catch (error) {
    console.warn(`Could not remove temporary Firefox profile; keeping it for inspection: ${profileResolved}`);
    console.warn(error instanceof Error ? error.message : String(error));
  }
}

function flattenContexts(contexts = []) {
  const flattened = [];
  for (const context of contexts) {
    flattened.push(context);
    flattened.push(...flattenContexts(context.children || []));
  }
  return flattened;
}

function getExtensionContextFromTree(tree) {
  const extensionContext = flattenContexts(tree.contexts || [])
    .find(context => String(context.url || '').startsWith('moz-extension://'));

  if (!extensionContext?.url || !extensionContext?.context) {
    return null;
  }

  return {
    context: extensionContext.context,
    url: extensionContext.url,
    uuid: new URL(extensionContext.url).host
  };
}

async function waitForContextUrl(client, url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastUrls = [];

  while (Date.now() < deadline) {
    const tree = await client.send('browsingContext.getTree', {}, 10000).catch(() => null);
    const contexts = flattenContexts(tree?.contexts || []);
    const match = contexts.find(context => context.url === url);
    if (match?.context) {
      return match.context;
    }
    lastUrls = contexts.map(context => context.url || '').filter(Boolean);
    await wait(250);
  }

  throw new Error(`Timed out waiting for context ${url}. Open contexts: ${lastUrls.join(', ')}`);
}

async function createExtensionPageContext(client, extensionContext, url, timeoutMs) {
  const opened = await client.evaluate(
    extensionContext,
    `(async () => {
      const tab = await browser.tabs.create({
        url: ${JSON.stringify(url)},
        active: true
      });
      return {
        id: tab.id,
        url: tab.url || ''
      };
    })()`,
    timeoutMs
  );

  if (!Number.isInteger(opened?.id)) {
    throw new Error(`Could not open extension page tab for ${url}: ${JSON.stringify(opened)}`);
  }

  return await waitForContextUrl(client, url, timeoutMs);
}

async function waitForPopupReady(client, popupContext, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const ready = await client.evaluate(
      popupContext,
      `(() => ({
        readyState: document.readyState,
        hasClipSite: typeof clipSite === 'function',
        hasInjector: typeof ensureContentScriptInjected === 'function',
        hasDefaultOptions: typeof defaultOptions === 'object',
        hasNormalizer: typeof normalizePopupOptions === 'function'
      }))()`,
      10000
    ).catch(() => null);

    if (
      ready?.readyState === 'complete' &&
      ready.hasClipSite &&
      ready.hasInjector &&
      ready.hasDefaultOptions &&
      ready.hasNormalizer
    ) {
      return;
    }

    await wait(250);
  }

  throw new Error('Timed out waiting for popup scripts to initialize.');
}

async function waitForBidiReady(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = null;

  while (Date.now() < deadline) {
    try {
      lastStatus = await client.send('session.status', {}, 5000);
      if (lastStatus?.ready === true) {
        return;
      }
    } catch {
      // Firefox may accept the socket before the session endpoint is fully ready.
    }
    await wait(250);
  }

  throw new Error(`Timed out waiting for Firefox BiDi readiness. Last status: ${JSON.stringify(lastStatus)}`);
}

async function runPopupClip(client, popupContext, fixtureUrl, timeoutMs) {
  return await client.evaluate(
    popupContext,
    `(async () => {
      const fixtureUrl = ${JSON.stringify(fixtureUrl)};
      const target = (await browser.tabs.query({})).find(tab => tab.url === fixtureUrl);
      if (!target) {
        throw new Error('Fixture tab not found: ' + fixtureUrl);
      }

      currentOptions = normalizePopupOptions({
        ...defaultOptions,
        skipHiddenContent: true,
        includeTemplate: false,
        downloadImages: false
      });
      await browser.storage.sync.set(currentOptions);
      await ensureContentScriptInjected(target.id);

      const markdown = await new Promise((resolve, reject) => {
        const seenMessages = [];
        const timeout = setTimeout(() => {
          browser.runtime.onMessage.removeListener(listener);
          Promise.all([
            browser.tabs.query({}).catch(error => [{ error: error.message }]),
            browser.storage.sync.get(defaultOptions).catch(error => ({ error: error.message })),
            Promise.resolve().then(() => ({
              readyState: document.readyState,
              hasOffscreenBridgeFrame: !!document.getElementById('marksnip-offscreen-bridge'),
              offscreenBridgeFrameSrc: document.getElementById('marksnip-offscreen-bridge')?.src || '',
              editorLength: document.querySelector('#md')?.value?.length || 0,
              errorText: document.body?.innerText?.match(/Error[^\\n]*/)?.[0] || ''
            }))
          ]).then(([tabs, options, popupState]) => {
            reject(new Error('Timed out waiting for display.md: ' + JSON.stringify({
              seenMessages,
              popupState,
              options: {
                downloadMode: options.downloadMode,
                includeTemplate: options.includeTemplate,
                skipHiddenContent: options.skipHiddenContent
              },
              tabs: tabs.map(tab => ({
                id: tab.id,
                active: tab.active,
                url: tab.url || tab.error || ''
              }))
            })));
          });
        }, ${Math.max(30000, timeoutMs)});

        function listener(message) {
          if (message?.type) {
            seenMessages.push(message.type);
          }
          if (message.type === 'display.md') {
            clearTimeout(timeout);
            browser.runtime.onMessage.removeListener(listener);
            resolve(message.markdown || '');
          }
        }

        browser.runtime.onMessage.addListener(listener);
        Promise.resolve(clipSite(target.id)).catch(error => {
          clearTimeout(timeout);
          browser.runtime.onMessage.removeListener(listener);
          reject(error);
        });
      });

      const tabs = await browser.tabs.query({});
      return {
        markdown,
        tabs: tabs.map(tab => ({
          id: tab.id,
          active: tab.active,
          pinned: tab.pinned,
          url: tab.url || ''
        }))
      };
    })()`,
    timeoutMs + 10000
  );
}

function assertFirefoxSmokeResult(result) {
  const markdown = String(result?.markdown || '').replace(/\r\n/g, '\n');
  const tabs = Array.isArray(result?.tabs) ? result.tabs : [];
  const offscreenTabs = tabs.filter(tab => tab.url.includes('/offscreen/offscreen.html'));
  const blankTabs = tabs.filter(tab => tab.url === 'about:blank');

  if (!markdown.includes('$P_{i,j,t_a}$')) {
    throw new Error('Expected inline MathML to be converted to TeX.');
  }

  if (!markdown.includes('$$\nE=mc^{2}\n$$')) {
    throw new Error('Expected block MathML to be converted to display TeX.');
  }

  if (offscreenTabs.length > 0) {
    throw new Error(`Firefox fallback offscreen tab was opened: ${offscreenTabs.map(tab => tab.url).join(', ')}`);
  }

  if (blankTabs.length > 0) {
    throw new Error(`Unexpected about:blank tab was left open: ${blankTabs.map(tab => tab.id).join(', ')}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureFile(path.join(extensionPath, 'manifest.json'), 'Missing .build/firefox/manifest.json. Run npm run build:browser-manifests first.');
  ensureFile(mathMLFixturePath, `Missing MathML fixture: ${mathMLFixturePath}`);

  const firefoxBinary = findFirefoxBinary(options.firefoxBinary);
  const profileDir = createProfileDir();
  const fixtureServer = createFixtureServer();
  let firefoxProcess = null;
  let client = null;

  try {
    const fixturePort = await fixtureServer.start();
    const remotePort = await getFreePort();
    const fixtureUrl = `http://127.0.0.1:${fixturePort}/mathml.html`;

    firefoxProcess = launchFirefox(firefoxBinary, profileDir, remotePort, fixtureUrl, options.headless);
    firefoxProcess.stderr.on('data', chunk => {
      const text = String(chunk).trim();
      if (text) {
        console.warn(`[firefox] ${text}`);
      }
    });

    const ws = await connectWebSocketWithRetry(`ws://127.0.0.1:${remotePort}/session`, options.timeoutMs);
    client = createBidiClient(ws, options.timeoutMs);
    await waitForBidiReady(client, options.timeoutMs);
    await client.send('session.new', {
      capabilities: {
        alwaysMatch: {
          acceptInsecureCerts: true,
          webSocketUrl: true
        }
      }
    });

    await wait(1000);
    await client.send('webExtension.install', {
      extensionData: {
        type: 'path',
        path: extensionPath
      }
    }, options.timeoutMs);
    await wait(1000);

    const tree = await client.send('browsingContext.getTree', {});
    const extensionContext = getExtensionContextFromTree(tree);
    if (!extensionContext) {
      throw new Error('Could not resolve an extension page context after installing the Firefox build.');
    }

    const popupContext = await createExtensionPageContext(
      client,
      extensionContext.context,
      `moz-extension://${extensionContext.uuid}/popup/popup.html`,
      options.timeoutMs
    );
    await wait(1000);
    await waitForPopupReady(client, popupContext, options.timeoutMs);

    const result = await runPopupClip(client, popupContext, fixtureUrl, options.timeoutMs);
    assertFirefoxSmokeResult(result);

    const tabSummary = result.tabs.map(tab => `${tab.id}:${tab.pinned ? 'pinned:' : ''}${tab.url}`).join('\n  ');
    console.log('Firefox live smoke passed.');
    console.log(`Firefox: ${firefoxBinary}`);
    console.log(`Fixture: ${fixtureUrl}`);
    console.log(`Markdown length: ${result.markdown.length}`);
    console.log(`Open tabs:\n  ${tabSummary}`);
  } finally {
    client?.close();
    await fixtureServer.close().catch(() => {});
    await terminateFirefox(firefoxProcess);
    await wait(1000);
    removeProfile(profileDir, options.keepProfile);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
