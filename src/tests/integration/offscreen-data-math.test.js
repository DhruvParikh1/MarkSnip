/**
 * Regression + feature tests for math-attribute capture surviving the real
 * Readability + Turndown pipeline in src/offscreen/offscreen.js (not the
 * standalone src/shared/turndown-factory.js, which is not wired into the
 * production capture pipeline).
 *
 * Covers the configurable behaviour: an on/off switch plus per-domain rules
 * that name which attributes carry a raw TeX payload. By default only
 * `data-math` on `gemini.google.com` is converted.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC_ROOT = path.join(__dirname, '../..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');
}

function createOffscreenWindow() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://example.com',
    contentType: 'text/html',
    runScripts: 'dangerously',
    resources: 'usable'
  });

  const { window } = dom;

  window.browser = {
    runtime: {
      onMessage: { addListener() {} },
      sendMessage: async () => ({})
    },
    downloads: {},
    storage: { sync: { get: async () => ({}) } }
  };
  window.chrome = {};

  let blobUrlCounter = 0;
  window.URL.createObjectURL = () => `blob:https://example.com/${(++blobUrlCounter).toString().padStart(36, '0')}`;
  window.URL.revokeObjectURL = () => {};

  const scripts = [
    'background/turndown.js',
    'background/turndown-plugin-gfm.js',
    'background/Readability.js',
    'shared/mathml-to-tex.js',
    'shared/readability-recovery.js',
    'shared/default-options.js',
    'offscreen/offscreen.js'
  ];

  for (const relativePath of scripts) {
    const scriptEl = window.document.createElement('script');
    scriptEl.textContent = readSource(relativePath);
    window.document.head.appendChild(scriptEl);
  }

  // In the real extension, initOffscreen() runs on DOMContentLoaded before any
  // message is handled. jsdom fires that event asynchronously, which races with
  // synchronous calls below, so invoke it directly for determinism.
  window.initOffscreen();

  return window;
}

function buildArticleHtml(mathMarkup) {
  return `
    <!DOCTYPE html>
    <html>
      <head><title>Audio test article</title></head>
      <body>
        <article>
          <h1>Audio test article</h1>
          <p>This article discusses the resonant frequency observed during testing.</p>
          <p>During the experiment we measured a tone tuned to ${mathMarkup} exactly, which matched the predicted harmonic.</p>
          <p>Repeated trials confirmed the frequency remained stable across the whole session, with only minor drift attributable to temperature changes in the room during the extended recording period.</p>
          <p>Further analysis of the waveform showed consistent amplitude and no significant distortion across the full duration of the test, giving confidence in the recorded results and their downstream use for calibration.</p>
        </article>
      </body>
    </html>
  `;
}

function renderOptions(window, overrides = {}) {
  return {
    ...window.defaultOptions,
    includeTemplate: false,
    imageStyle: 'markdown',
    downloadImages: false,
    ...overrides
  };
}

async function convertWholePage(window, mathMarkup, { pageUrl = 'https://gemini.google.com/app', overrides = {} } = {}) {
  const html = buildArticleHtml(mathMarkup);
  const options = renderOptions(window, overrides);
  const article = await window.getArticleFromDom(html, options, pageUrl);
  const result = window.turndown(article.content, options, article);
  return { article, markdown: result.markdown || result };
}

async function convertPickedElement(window, elementHtml, { pageUrl = 'https://gemini.google.com/app', overrides = {} } = {}) {
  const options = renderOptions(window, overrides);
  const article = window.buildArticleFromSelectedElement({ dom: elementHtml, pageUrl }, options);
  const result = window.turndown(article.content, options, article);
  return { article, markdown: result.markdown || result };
}

describe('math attributes on a configured domain (whole-page pipeline)', () => {
  test('block-level data-math is preserved through Readability and rendered as GFM block math', async () => {
    const window = createOffscreenWindow();
    const { article, markdown } = await convertWholePage(window, '<div data-math="3440\\text{ Hz}">3440 Hz</div>');

    expect(markdown).toContain('$$\n3440\\text{ Hz}\n$$');
    expect(Object.values(article.math || {})).toEqual(
      expect.arrayContaining([expect.objectContaining({ tex: '3440\\text{ Hz}', inline: false, syntax: 'gfm' })])
    );
  });

  test('inline data-math is preserved through Readability and rendered as GFM inline math', async () => {
    const window = createOffscreenWindow();
    const { markdown } = await convertWholePage(window, '<span data-math="3440\\text{ Hz}">3440 Hz</span>');

    expect(markdown).toContain('$`3440\\text{ Hz}`$');
  });

  test('matches subdomains of a configured domain', async () => {
    const window = createOffscreenWindow();
    const { markdown } = await convertWholePage(window, '<div data-math="E = mc^2">E</div>', {
      pageUrl: 'https://beta.gemini.google.com/app'
    });

    expect(markdown).toContain('$$\nE = mc^2\n$$');
  });
});

describe('math attributes on the Pick Element (single-element) path', () => {
  test('block-level data-math renders as GFM block math', async () => {
    const window = createOffscreenWindow();
    const { markdown } = await convertPickedElement(window, '<div data-math="3440\\text{ Hz}">3440 Hz</div>');

    expect(markdown).toContain('$$\n3440\\text{ Hz}\n$$');
  });

  test('inline data-math renders as GFM inline math', async () => {
    const window = createOffscreenWindow();
    const { markdown } = await convertPickedElement(window, '<p>Tuned to <span data-math="3440\\text{ Hz}">3440 Hz</span> exactly.</p>');

    expect(markdown).toContain('$`3440\\text{ Hz}`$');
  });
});

describe('math attribute gating', () => {
  test('does not convert on a domain with no matching rule', async () => {
    const window = createOffscreenWindow();
    const { article, markdown } = await convertWholePage(window, '<div data-math="3440\\text{ Hz}">3440 Hz</div>', {
      pageUrl: 'https://example.com/article'
    });

    expect(markdown).not.toContain('$$');
    expect(markdown).not.toContain('3440\\text{ Hz}');
    expect(Object.keys(article.math || {})).toHaveLength(0);
  });

  test('does not convert when the feature is disabled', async () => {
    const window = createOffscreenWindow();
    const { markdown } = await convertWholePage(window, '<div data-math="3440\\text{ Hz}">3440 Hz</div>', {
      overrides: { mathAttributesEnabled: false }
    });

    expect(markdown).not.toContain('$$');
    expect(markdown).not.toContain('3440\\text{ Hz}');
  });

  test('honors custom domain + attribute rules', async () => {
    const window = createOffscreenWindow();
    const { markdown } = await convertWholePage(window, '<div data-tex="a^2 + b^2">pythag</div>', {
      pageUrl: 'https://notes.example.org/page',
      overrides: {
        mathAttributeRules: [{ domain: 'example.org', attributes: ['data-tex'] }]
      }
    });

    expect(markdown).toContain('$$\na^2 + b^2\n$$');
  });

  test('ignores attributes that are not listed for the matching domain', async () => {
    const window = createOffscreenWindow();
    const { markdown } = await convertWholePage(window, '<span data-tex="a^2 + b^2">pythag</span>', {
      pageUrl: 'https://gemini.google.com/app'
    });

    // gemini.google.com only lists data-math by default, not data-tex.
    expect(markdown).not.toContain('a^2 + b^2');
  });
});
