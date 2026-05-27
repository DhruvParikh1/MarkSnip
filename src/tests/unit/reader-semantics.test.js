const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const readerSemantics = require('../../offscreen/reader-semantics.js');

function parseDocument(bodyHtml) {
  return new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    url: 'https://example.com/article'
  }).window.document;
}

describe('reader semantics normalization', () => {
  test('keeps callout semantics through Readability extraction', () => {
    const readabilityCode = fs.readFileSync(path.join(__dirname, '../../background/Readability.js'), 'utf8');
    const dom = new JSDOM(`
      <!doctype html>
      <html>
        <head><title>Reader Article</title></head>
        <body>
          <article>
            <h1>Reader Article</h1>
            <p>${'Stable article paragraph. '.repeat(40)}</p>
            <div class="callout" data-callout="note">
              <div class="callout-title"><div class="callout-title-inner">Note</div></div>
              <div class="callout-content"><p>URL encode link destinations.</p></div>
            </div>
          </article>
        </body>
      </html>
    `, {
      url: 'https://example.com/article',
      runScripts: 'dangerously'
    });
    dom.window.eval(readabilityCode);

    readerSemantics.prepareReaderDomForReadability(dom.window.document);
    const article = new dom.window.Readability(dom.window.document, { skipHiddenContent: true }).parse();
    const enhanced = readerSemantics.enhanceReaderArticleHtml(article.content);

    expect(enhanced).toContain('data-ms-reader-block="callout"');
    expect(enhanced).toContain('data-ms-reader-type="note"');
    expect(enhanced).toContain('URL encode link destinations.');
  });

  test('turns GitHub-style markdown alerts into reader callout cards', () => {
    const document = parseDocument(`
      <article>
        <div class="markdown-alert markdown-alert-warning">
          <p class="markdown-alert-title">Warning</p>
          <p>URL encode link destinations.</p>
        </div>
      </article>
    `);

    readerSemantics.prepareReaderDomForReadability(document);
    const carrier = document.querySelector('[data-ms-reader-block="callout"]');
    expect(carrier?.tagName).toBe('BLOCKQUOTE');
    expect(carrier?.getAttribute('data-ms-reader-type')).toBe('warning');
    expect(carrier?.textContent).toContain('URL encode link destinations.');

    const enhanced = readerSemantics.enhanceReaderArticleHtml(document.body.innerHTML);
    expect(enhanced).toContain('class="ms-reader-card ms-reader-callout ms-reader-callout-warning"');
    expect(enhanced).toContain('data-ms-reader-block="callout"');
    expect(enhanced).toContain('URL encode link destinations.');
  });

  test('turns Markdown callout blockquotes into reader callout cards', () => {
    const document = parseDocument(`
      <article>
        <blockquote>
          <p>[!note] Note</p>
          <p>When using the Markdown format, make sure to URL encode the link destination.</p>
        </blockquote>
      </article>
    `);

    readerSemantics.prepareReaderDomForReadability(document);
    const carrier = document.querySelector('[data-ms-reader-block="callout"]');
    expect(carrier?.tagName).toBe('BLOCKQUOTE');
    expect(carrier?.getAttribute('data-ms-reader-type')).toBe('note');
    expect(carrier?.textContent).toContain('When using the Markdown format');
    expect(carrier?.textContent).not.toContain('[!note]');

    const enhanced = readerSemantics.enhanceReaderArticleHtml(document.body.innerHTML);
    expect(enhanced).toContain('class="ms-reader-card ms-reader-callout ms-reader-callout-note"');
    expect(enhanced).toContain('data-ms-reader-source="markdown-callout"');
  });

  test('preserves title-only callouts as reader callout cards', () => {
    const document = parseDocument(`
      <article>
        <div class="callout" data-callout="note">
          <div class="callout-title">
            <div class="callout-title-inner">Prefixing an internal link with an exclamation mark (!) allows you to embed the linked content.</div>
          </div>
        </div>
      </article>
    `);

    readerSemantics.prepareReaderDomForReadability(document);
    const carrier = document.querySelector('[data-ms-reader-block="callout"]');
    expect(carrier?.tagName).toBe('BLOCKQUOTE');
    expect(carrier?.getAttribute('data-ms-reader-type')).toBe('note');
    expect(carrier?.textContent).toContain('Prefixing an internal link');

    const enhanced = readerSemantics.enhanceReaderArticleHtml(document.body.innerHTML);
    expect(enhanced).toContain('class="ms-reader-card ms-reader-callout ms-reader-callout-note"');
    expect(enhanced).toContain('Prefixing an internal link with an exclamation mark');
  });

  test('expands collapsed Obsidian callouts before hidden-content cleanup', () => {
    const document = parseDocument(`
      <article>
        <div class="callout is-collapsed" data-callout="note">
          <div class="callout-title"><div class="callout-title-inner">Note</div><div class="callout-fold"></div></div>
          <div class="callout-content" style="display:none"><p>Hidden callout body.</p></div>
        </div>
      </article>
    `);

    readerSemantics.prepareReaderDomForReadability(document);
    const carrier = document.querySelector('[data-ms-reader-block="callout"]');
    expect(carrier?.getAttribute('data-ms-reader-type')).toBe('note');
    expect(carrier?.textContent).toContain('Hidden callout body.');
    expect(carrier?.innerHTML).not.toMatch(/display\s*:\s*none/i);
    expect(carrier?.querySelector('.callout-fold')).toBeNull();
  });

  test('preserves image-only collapsed callouts through Readability extraction', () => {
    const readabilityCode = fs.readFileSync(path.join(__dirname, '../../background/Readability.js'), 'utf8');
    const dom = new JSDOM(`
      <!doctype html>
      <html>
        <head><title>Reader Article</title></head>
        <body>
          <article>
            <h1>Reader Article</h1>
            <p>${'Stable article paragraph. '.repeat(40)}</p>
            <div class="callout is-collapsible is-collapsed" data-callout="note">
              <div class="callout-title">
                <div class="callout-title-inner">Screenshot of searching for a heading link</div>
                <div class="callout-fold"></div>
              </div>
              <div class="callout-content" style="display: none;">
                <p><span class="internal-embed image-embed is-loaded"><img alt="internal-links-header.png > interface" src="/Attachments/internal-links-header.png"></span></p>
              </div>
            </div>
            <p>${'Another stable article paragraph. '.repeat(40)}</p>
          </article>
        </body>
      </html>
    `, {
      url: 'https://example.com/article',
      runScripts: 'dangerously'
    });
    dom.window.eval(readabilityCode);

    readerSemantics.prepareReaderDomForReadability(dom.window.document);
    const article = new dom.window.Readability(dom.window.document, { skipHiddenContent: true }).parse();
    const enhanced = readerSemantics.enhanceReaderArticleHtml(article.content);

    expect(enhanced).toContain('data-ms-reader-block="callout"');
    expect(enhanced).toContain('Screenshot of searching for a heading link');
    expect(enhanced).toContain('/Attachments/internal-links-header.png');
    expect(enhanced).toContain('internal-links-header.png > interface');
    expect(enhanced).not.toMatch(/display\s*:\s*none/i);
  });

  test('normalizes syntax highlighter code blocks and removes line gutters', () => {
    const document = parseDocument(`
      <article>
        <div class="highlight-source-js">
          <button>Copy</button>
          <div data-line><span class="line-number">1</span><span>const a = 1;</span></div>
          <div data-line><span class="line-number">2</span><span>console.log(a);</span></div>
        </div>
      </article>
    `);

    readerSemantics.prepareReaderDomForReadability(document);
    const code = document.querySelector('pre code');
    expect(code).not.toBeNull();
    expect(code.getAttribute('data-ms-reader-language')).toBe('js');
    expect(code.textContent).toBe('const a = 1;\nconsole.log(a);');
    expect(code.textContent).not.toContain('Copy');
    expect(code.textContent).not.toContain('1const');
  });

  test('standardizes matching footnote references and definitions', () => {
    const document = parseDocument(`
      <article>
        <p>Body text<sup id="fnref1"><a href="#fn1">1</a></sup>.</p>
        <section class="footnotes">
          <ol>
            <li id="fn1"><p>Footnote text. <a href="#fnref1" class="footnote-backref">return-old</a></p></li>
          </ol>
        </section>
      </article>
    `);

    readerSemantics.prepareReaderDomForReadability(document);
    expect(document.querySelector('a[href="#ms-reader-fn-1"]')?.textContent).toBe('1');
    expect(document.querySelector('#ms-reader-footnotes')?.textContent).toContain('Footnote text.');
    expect(document.querySelector('#ms-reader-footnotes')?.textContent).not.toContain('return-old');
    expect(document.querySelector('.ms-reader-footnote-backref')?.textContent).toBe('back');
    expect(document.querySelector('.footnotes')).toBeNull();
  });

  test('promotes lazy image sources and simple caption wrappers', () => {
    const document = parseDocument(`
      <article>
        <p><img src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" data-src="/real.png" alt="Chart"><em>Quarterly chart caption</em></p>
      </article>
    `);

    readerSemantics.prepareReaderDomForReadability(document);
    const figure = document.querySelector('figure');
    expect(figure).not.toBeNull();
    expect(figure.querySelector('img')?.getAttribute('src')).toBe('/real.png');
    expect(figure.querySelector('figcaption')?.textContent).toContain('Quarterly chart caption');
  });

  test('promotes standalone image alt text into figure captions', () => {
    const document = parseDocument(`
      <article>
        <p><span class="internal-embed image-embed"><img alt="internal-links-header.png > interface" src="/Attachments/internal-links-header.png"></span></p>
      </article>
    `);

    readerSemantics.prepareReaderDomForReadability(document);
    const figure = document.querySelector('figure');
    expect(figure).not.toBeNull();
    expect(figure.querySelector('img')?.getAttribute('src')).toBe('/Attachments/internal-links-header.png');
    expect(figure.querySelector('figcaption')?.textContent).toBe('internal-links-header.png > interface');
  });

  test('removes leading page property blocks from reader HTML', () => {
    const enhanced = readerSemantics.enhanceReaderArticleHtml(`
      <div id="readability-page-1">
        <div><div><pre><code>aliases:
  - How to/Internal link
  - How to/Link to blocks
cssclasses:
  - soft-embed
description: Learn how to link to notes, attachments, and other files from your notes, using internal links.
mobile: true
permalink: links
publish: true</code></pre></div></div>
        <p>Learn how to link to notes, attachments, and other files from your notes, using internal links. By linking notes, you can create a network of knowledge.</p>
        <p>${'Stable article paragraph. '.repeat(20)}</p>
      </div>
    `);

    expect(enhanced).not.toContain('aliases:');
    expect(enhanced).not.toContain('cssclasses:');
    expect(enhanced).toContain('Learn how to link to notes');
    expect(enhanced).toContain('Stable article paragraph.');
  });

  test('keeps leading code examples that are not page property blocks', () => {
    const enhanced = readerSemantics.enhanceReaderArticleHtml(`
      <div id="readability-page-1">
        <pre><code>const example = true;
function read() {
  return example;
}</code></pre>
        <p>${'Stable article paragraph. '.repeat(20)}</p>
      </div>
    `);

    expect(enhanced).toContain('const example = true;');
    expect(enhanced).toContain('Stable article paragraph.');
  });

  test('recovers noscript lazy-loaded images into placeholder siblings', () => {
    const document = parseDocument(`
      <article>
        <span class="lazy-image-wrapper">
          <img alt="Architecture diagram." src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">
          <noscript>
            <img alt="Architecture diagram." loading="lazy" decoding="async" srcset="/images/architecture-small.png 640w, /images/architecture-large.png 1600w" src="/images/architecture.png" width="1200" height="800">
          </noscript>
        </span>
      </article>
    `);

    readerSemantics.prepareReaderDomForReadability(document);
    const images = Array.from(document.querySelectorAll('article img'));
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('src')).toBe('/images/architecture.png');
    expect(images[0].getAttribute('srcset')).toContain('/images/architecture-large.png 1600w');
    expect(document.querySelector('noscript')).toBeNull();
  });

  test('uses the strongest available picture and srcset source', () => {
    const document = parseDocument(`
      <article>
        <picture>
          <source data-srcset="/images/chart-small.webp 400w, /images/chart-large.webp 1600w" type="image/webp">
          <source data-srcset="/images/chart-fallback-small.png 320w" type="image/png">
          <img alt="Responsive chart" src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E">
        </picture>
        <img alt="Standalone srcset" srcset="/images/standalone-small.png 1x, /images/standalone-large.png 2x">
      </article>
    `);

    readerSemantics.prepareReaderDomForReadability(document);
    const responsive = document.querySelector('picture img');
    const standalone = Array.from(document.querySelectorAll('article > img')).find((img) => img.getAttribute('alt') === 'Standalone srcset');

    expect(responsive.getAttribute('src')).toBe('/images/chart-large.webp');
    expect(responsive.getAttribute('srcset')).toContain('/images/chart-large.webp 1600w');
    expect(standalone.getAttribute('src')).toBe('/images/standalone-large.png');
  });

  test('unwraps clear layout tables without touching data tables', () => {
    const document = parseDocument(`
      <article>
        <table><tbody><tr><td><p>Wrapper paragraph.</p></td></tr></tbody></table>
        <table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Ada</td></tr></tbody></table>
      </article>
    `);

    readerSemantics.prepareReaderDomForReadability(document);
    expect(document.body.innerHTML).toContain('Wrapper paragraph.');
    expect(document.querySelectorAll('table')).toHaveLength(1);
    expect(document.querySelector('th')?.textContent).toBe('Name');
  });
});
