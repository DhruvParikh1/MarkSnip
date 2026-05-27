const fs = require('fs');
const path = require('path');

const readSource = (relativePath) => fs.readFileSync(path.join(__dirname, '../..', relativePath), 'utf8');

describe('Reader View launch pipeline', () => {
  test('reader launch requests article payloads with markdown deferred', () => {
    const serviceWorker = readSource('service-worker.js');
    const offscreen = readSource('offscreen/offscreen.js');

    expect(serviceWorker).toMatch(/type:\s*'process-content-return'[\s\S]*readerView:\s*true[\s\S]*skipMarkdown:\s*true/);
    expect(offscreen).toContain("case 'reader-render-markdown':");
    expect(offscreen).toMatch(/skipMarkdown:\s*!!message\.skipMarkdown/);
    expect(offscreen).toContain('result.markdownDeferred = true');
    expect(offscreen).toContain('result.readerExportArticle = readerExportArticle');
  });

  test('reader export actions materialize markdown lazily', () => {
    const serviceWorker = readSource('service-worker.js');

    expect(serviceWorker).toContain('async function ensureReaderMarkdownSession');
    expect(serviceWorker).toMatch(/async function copyReaderMarkdown[\s\S]*ensureReaderMarkdownSession/);
    expect(serviceWorker).toMatch(/async function downloadReaderMarkdown[\s\S]*ensureReaderMarkdownSession/);
    expect(serviceWorker).toMatch(/async function sendReaderMarkdownToObsidian[\s\S]*ensureReaderMarkdownSession/);
    expect(serviceWorker).toContain("type: 'reader-render-markdown'");
    expect(serviceWorker).toContain('delete updated.readerExportArticle');
  });
});
