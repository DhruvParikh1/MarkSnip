/**
 * Loads the real offscreen conversion pipeline: the scripts offscreen.html loads,
 * in the same order, into one JSDOM window. Tests convert through the production
 * Turndown rules and Readability extraction rather than a test-only copy.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const srcRoot = path.join(__dirname, '../..');
let cachedWindow = null;

function loadOffscreenWindow() {
  if (cachedWindow) {
    return cachedWindow;
  }
  const html = fs.readFileSync(path.join(srcRoot, 'offscreen/offscreen.html'), 'utf8');
  const scripts = Array.from(html.matchAll(/<script src="([^"]+)"/g), m => m[1]);
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    url: 'chrome-extension://test/offscreen/offscreen.html'
  });
  const win = dom.window;
  win.console = { log() {}, info() {}, debug() {}, warn() {}, error() {} };
  win.eval(`window.browser = {
    runtime: { onMessage: { addListener() {} }, sendMessage: async () => ({}), getURL: p => p },
    storage: { sync: { get: async () => ({}) }, local: { get: async () => ({}) } },
    i18n: { getMessage: () => '' }
  };`);
  for (const rel of scripts) {
    if (rel.includes('browser-polyfill')) continue;
    win.eval(fs.readFileSync(path.join(srcRoot, 'offscreen', rel), 'utf8'));
  }
  win.eval('initOffscreen()');
  cachedWindow = win;
  return win;
}

function resolveOptions(win, overrides = {}) {
  const defaults = win.eval('defaultOptions');
  return {
    ...defaults,
    downloadImages: false,
    ...overrides,
    tableFormatting: { ...defaults.tableFormatting, ...(overrides.tableFormatting || {}) }
  };
}

/**
 * Converts article HTML to Markdown with the production turndown() function.
 * Options are the extension defaults with the given overrides applied.
 */
function convertHtmlToMarkdown(html, options = {}, articleOverrides = {}) {
  const win = loadOffscreenWindow();
  win.__pipelineArticle = {
    content: html,
    baseURI: 'https://example.com/',
    pageURL: 'https://example.com/',
    title: 'Test Article',
    math: {},
    ...articleOverrides
  };
  win.__pipelineOptions = resolveOptions(win, options);
  return win.eval(`(() => {
    const options = createEffectiveMarkdownOptions(window.__pipelineArticle, window.__pipelineOptions, false);
    return turndown(window.__pipelineArticle.content, options, window.__pipelineArticle).markdown;
  })()`);
}

function withBaseElement(html, url) {
  if (/<base\s/i.test(html)) {
    return html;
  }
  const base = `<base href="${url}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${base}`);
  }
  return `<head>${base}</head>${html}`;
}

/**
 * Extracts the article from a full page with the production Readability path
 * (extractArticleWithRecovery + finalizeArticleMetadata), as the offscreen page
 * does for a clip. Like the content script, it adds a <base> for the page URL.
 */
function extractArticle(html, pageUrl = 'https://example.com/', options = {}) {
  const win = loadOffscreenWindow();
  win.__pipelineDom = withBaseElement(html, pageUrl);
  win.__pipelinePageUrl = pageUrl;
  win.__pipelineOptions = resolveOptions(win, options);
  return win.eval(`(() => {
    const extracted = extractArticleWithRecovery(window.__pipelineDom, window.__pipelineOptions, {});
    if (!extracted) return null;
    return finalizeArticleMetadata(
      extracted.article,
      extracted.dom,
      window.__pipelinePageUrl,
      extracted.math,
      getReadabilityRecoveryApi(),
      window.__pipelineOptions,
      extracted.recoveryDom,
      {}
    );
  })()`);
}

module.exports = {
  loadOffscreenWindow,
  convertHtmlToMarkdown,
  extractArticle
};
