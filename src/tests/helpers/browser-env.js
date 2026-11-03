/**
 * Browser Environment Setup for Tests
 * Loads browser libraries (Turndown, Readability) in a JSDOM environment
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { convertHtmlToMarkdown, extractArticle } = require('./offscreen-pipeline');

/**
 * Create a browser-like environment with required libraries loaded
 */
function createBrowserEnvironment() {
  // Create JSDOM instance
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://example.com',
    contentType: 'text/html',
    runScripts: 'dangerously',
    resources: 'usable'
  });

  const { window } = dom;
  const { document } = window;

  // Load Turndown library
  const turndownPath = path.join(__dirname, '../../background/turndown.js');
  const turndownCode = fs.readFileSync(turndownPath, 'utf8');

  // Load Turndown GFM plugin
  const gfmPath = path.join(__dirname, '../../background/turndown-plugin-gfm.js');
  const gfmCode = fs.readFileSync(gfmPath, 'utf8');

  // Load Readability library
  const readabilityPath = path.join(__dirname, '../../background/Readability.js');
  const readabilityCode = fs.readFileSync(readabilityPath, 'utf8');

  // Load shared readability recovery helpers
  const readabilityRecoveryPath = path.join(__dirname, '../../shared/readability-recovery.js');
  const readabilityRecoveryCode = fs.readFileSync(readabilityRecoveryPath, 'utf8');

  // Execute in JSDOM context
  const script = dom.window.document.createElement('script');
  script.textContent = `
    ${turndownCode}
    ${gfmCode}
    ${readabilityCode}
    ${readabilityRecoveryCode}
  `;
  dom.window.document.head.appendChild(script);

  return {
    window,
    document,
    TurndownService: dom.window.TurndownService,
    turndownPluginGfm: dom.window.turndownPluginGfm,
    Readability: dom.window.Readability,
    ReadabilityRecovery: dom.window.MarkSnipReadabilityRecovery
  };
}

/**
 * A TurndownService-shaped wrapper around the production offscreen converter.
 * Options are the extension defaults with the given overrides applied.
 */
function createTurndownService(options = {}) {
  const env = createBrowserEnvironment();
  const service = {
    turndown: (html) => convertHtmlToMarkdown(html, options)
  };
  return { service, env };
}

/**
 * Parse a full page with the production extraction path (Readability plus
 * MarkSnip's recovery passes), as the offscreen page does for a clip.
 */
function parseArticle(html, url = 'https://example.com', options = {}) {
  if (url && typeof url === 'object') {
    options = url;
    url = 'https://example.com';
  }
  const env = createBrowserEnvironment();
  const article = extractArticle(html, url, options);
  return { article, env };
}

module.exports = {
  createBrowserEnvironment,
  createTurndownService,
  parseArticle
};
