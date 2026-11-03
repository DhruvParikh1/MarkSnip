/**
 * Loads the real service worker (its importScripts() list, then service-worker.js)
 * into a Node vm context with a stubbed browser API.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcRoot = path.join(__dirname, '../..');

// A browser API where every unspecified member is a harmless callable stub.
function createApiStub(overrides) {
  const make = (pathKey, thenable = false) => new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === 'then') return thenable ? (resolve) => resolve(make(pathKey)) : undefined;
      if (thenable && (prop === 'catch' || prop === 'finally')) return () => make(pathKey, true);
      if (prop === Symbol.toPrimitive) return () => '';
      const key = pathKey ? `${pathKey}.${String(prop)}` : String(prop);
      if (key in overrides) return overrides[key];
      return make(key);
    },
    apply() {
      return make(`${pathKey}()`, true);
    }
  });
  return make('');
}

function createSessionStorage(quotaBytes) {
  const data = new Map();
  const size = () => Array.from(data.values()).reduce((total, value) => total + JSON.stringify(value).length, 0);
  return {
    data,
    async get(keys) {
      if (keys === null) return Object.fromEntries(data);
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter(key => data.has(key)).map(key => [key, data.get(key)]));
    },
    async set(items) {
      const previous = new Map(data);
      Object.entries(items).forEach(([key, value]) => data.set(key, value));
      if (size() > quotaBytes) {
        data.clear();
        previous.forEach((value, key) => data.set(key, value));
        throw new Error('Session storage quota bytes exceeded. Values were not stored.');
      }
    },
    async remove(keys) {
      (Array.isArray(keys) ? keys : [keys]).forEach(key => data.delete(key));
    }
  };
}

function loadServiceWorker({ downloadError = 'Download failed', sessionQuota = 10 * 1024 * 1024, tabs = [], apiOverrides = {}, userAgent = 'Firefox' } = {}) {
  const pageScripts = [];
  const revoked = [];
  const session = createSessionStorage(sessionQuota);
  const browser = createApiStub({
    'storage.sync.get': async () => ({}),
    'storage.local.get': async () => ({}),
    'storage.session': session,
    'runtime.getManifest': () => ({ version: '0.0.0', manifest_version: 3 }),
    'runtime.getURL': (p) => `moz-extension://test/${p}`,
    'i18n.getMessage': () => '',
    'i18n.getUILanguage': () => 'en',
    'tabs.query': async () => tabs,
    'tabs.get': async (id) => tabs.find(tab => tab.id === id) || { id, url: 'https://example.com/article' },
    'downloads.download': async () => { throw new Error(downloadError); },
    'scripting.executeScript': async ({ func, args }) => {
      const source = String(func || '');
      if (source.includes('hasContentScript')) return [{ result: { hasPolyfill: true, hasContentScript: true } }];
      if (source.includes('link.download')) pageScripts.push({ filename: args[0], content: Buffer.from(args[1], 'base64').toString('utf8') });
      return [{ result: true }];
    },
    offscreen: undefined,
    ...apiOverrides
  });
  class TrackedURL extends URL {
    static createObjectURL(blob) { return URL.createObjectURL(blob); }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  const context = {
    console: { log() {}, info() {}, debug() {}, warn() {}, error() {} },
    browser,
    chrome: browser,
    fetch: async () => ({ ok: true }),
    setTimeout, clearTimeout, setInterval, clearInterval,
    URL: TrackedURL, URLSearchParams, TextEncoder, TextDecoder, AbortController, Blob,
    crypto: globalThis.crypto,
    navigator: { userAgent },
    structuredClone, queueMicrotask, atob, btoa, Intl
  };
  context.globalThis = context;
  context.self = context;
  vm.createContext(context);

  const swSource = fs.readFileSync(path.join(srcRoot, 'service-worker.js'), 'utf8');
  const importList = swSource.match(/importScripts\(([\s\S]*?)\);/)[1];
  const scripts = Array.from(importList.matchAll(/'([^']+\.js)'/g), m => m[1]).concat('service-worker.js');
  for (const rel of scripts) {
    if (rel.includes('browser-polyfill')) continue;
    vm.runInContext(fs.readFileSync(path.join(srcRoot, rel), 'utf8'), context, { filename: rel });
  }
  const pendingTracked = () => vm.runInContext('markSnipUrls.size + markSnipBlobUrls.size + markSnipDownloads.size', context);
  return { context, pageScripts, revoked, session, pendingTracked };
}


module.exports = { loadServiceWorker, createApiStub, createSessionStorage };
