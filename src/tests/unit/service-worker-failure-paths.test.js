/**
 * @jest-environment node
 *
 * Failure paths in the real service worker: downloads the Downloads API refuses,
 * "all tabs" commands that meet a tab they cannot read, and reader sessions
 * filling session storage.
 */
const vm = require('vm');
const { loadServiceWorker } = require('../helpers/service-worker-harness');

const downloadOptions = { downloadMode: 'downloadsApi', downloadImages: false, saveAs: false };

describe('download failures', () => {
  test('a refused download is saved through the page and its blob is released', async () => {
    const sw = loadServiceWorker();
    await sw.context.downloadMarkdown('# Clip\n\nBody', 'My clip', 5, {}, '', { ...sw.context.defaultOptions, ...downloadOptions });

    expect(sw.pageScripts).toEqual([{ filename: 'My clip.md', content: '# Clip\n\nBody' }]);
    expect(sw.revoked).toHaveLength(1);
    expect(sw.pendingTracked()).toBe(0);
  });

  test('a cancelled Save As dialog cleans up without saving anyway', async () => {
    const sw = loadServiceWorker({ downloadError: 'Download canceled by the user' });
    await sw.context.downloadMarkdown('# Clip', 'My clip', 5, {}, '', { ...sw.context.defaultOptions, ...downloadOptions, saveAs: true });

    expect(sw.pageScripts).toEqual([]);
    expect(sw.revoked).toHaveLength(1);
    expect(sw.pendingTracked()).toBe(0);
  });

  test('the offscreen page\'s failure report saves the Markdown through the page', async () => {
    const sw = loadServiceWorker();
    await sw.context.handleMessages({
      type: 'offscreen-download-failed',
      markdown: '# From offscreen',
      title: 'Folder/Offscreen clip',
      tabId: 5,
      options: sw.context.defaultOptions,
      error: 'Download failed'
    }, {});

    expect(sw.pageScripts).toEqual([{ filename: 'Offscreen clip.md', content: '# From offscreen' }]);
  });
});

describe('completed downloads', () => {
  test('a blob URL the background created is revoked once its download completes', async () => {
    const sw = loadServiceWorker({ apiOverrides: { 'downloads.download': async () => 77 } });
    await sw.context.downloadMarkdown('# Clip', 'My clip', 5, {}, '', { ...sw.context.defaultOptions, ...downloadOptions });
    expect(sw.revoked).toHaveLength(0);

    await sw.context.handleDownloadChange({ id: 77, state: { current: 'complete' } });
    expect(sw.revoked).toHaveLength(1);
    expect(sw.revoked[0]).toMatch(/^blob:/);
    expect(sw.pendingTracked()).toBe(0);
  });

  test('an interrupted download also releases its blob URL', async () => {
    const sw = loadServiceWorker({ apiOverrides: { 'downloads.download': async () => 78 } });
    await sw.context.downloadMarkdown('# Clip', 'My clip', 5, {}, '', { ...sw.context.defaultOptions, ...downloadOptions });

    await sw.context.handleDownloadChange({ id: 78, state: { current: 'interrupted' }, error: { current: 'NETWORK_FAILED' } });
    expect(sw.revoked).toHaveLength(1);
    expect(sw.pendingTracked()).toBe(0);
  });
});

describe('commands that act on every tab', () => {
  test('download all tabs continues past a tab that cannot be downloaded', async () => {
    const tabs = [
      { id: 1, url: 'https://example.com/a' },
      { id: 2, url: 'chrome://settings' },
      { id: 3, url: 'https://example.com/broken' },
      { id: 4, url: 'https://example.com/b' }
    ];
    const sw = loadServiceWorker({ tabs });
    const attempted = [];
    sw.context.downloadMarkdownFromContext = async (_info, tab) => {
      attempted.push(tab.id);
      if (tab.id === 3) throw new Error('Cannot access contents of the page');
    };
    vm.runInContext('downloadMarkdownFromContext = globalThis.downloadMarkdownFromContext', sw.context);

    await expect(sw.context.downloadMarkdownForAllTabs({})).resolves.toBeUndefined();
    expect(attempted).toEqual([1, 3, 4]);
  });
});

describe('reader sessions', () => {
  const readerKeys = (sw) => Array.from(sw.session.data.keys()).filter(key => key.startsWith('reader-session:'));

  test('keeps only the most recent sessions', async () => {
    const sw = loadServiceWorker();
    for (let i = 0; i < 40; i++) {
      await sw.context.saveReaderSession({ title: `Page ${i}`, content: '<p>x</p>' });
    }
    expect(readerKeys(sw)).toHaveLength(25);
  });

  test('drops the oldest sessions when storage is full instead of failing', async () => {
    const sw = loadServiceWorker({ sessionQuota: 5000 });
    const big = 'x'.repeat(2000);
    const ids = [];
    for (let i = 0; i < 6; i++) {
      ids.push(await sw.context.saveReaderSession({ title: `Page ${i}`, content: big }));
    }
    expect(readerKeys(sw).length).toBeGreaterThan(0);
    await expect(sw.context.readReaderSession(ids[5])).resolves.toEqual(expect.objectContaining({ title: 'Page 5' }));
    await expect(sw.context.readReaderSession(ids[0])).resolves.toBeNull();
  });
});
