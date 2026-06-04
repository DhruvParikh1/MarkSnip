const { generateValidFileName } = require('../../shared/template-utils');

const SINGLE_DOWNLOAD_NOTIFICATION_DELTA = Object.freeze({ downloads: 1, exports: 1 });

function normalizeGeneratedFileExtension(extension, fallback = 'bin') {
  const normalized = String(extension || fallback)
    .trim()
    .replace(/^\.+/, '')
    .replace(/[^a-z0-9_-]/gi, '')
    .toLowerCase();

  return normalized || fallback;
}

function buildGeneratedDownloadFilename(title, mdClipsFolder = '', options = null, extension = 'bin') {
  const effectiveOptions = options || { disallowedChars: '[]#^' };
  let safeTitle = String(title || '').trim() || 'Untitled-0';

  safeTitle = safeTitle
    .split('/')
    .map((segment) => generateValidFileName(
      segment,
      effectiveOptions.disallowedChars,
      effectiveOptions.disallowedCharReplacement
    ))
    .join('/');

  if (!safeTitle || safeTitle.replace(/\//g, '').trim() === '') {
    safeTitle = 'Untitled-0';
  }

  let safeFolder = String(mdClipsFolder || '').trim();
  if (safeFolder) {
    safeFolder = safeFolder
      .split('/')
      .map((segment) => generateValidFileName(
        segment,
        effectiveOptions.disallowedChars,
        effectiveOptions.disallowedCharReplacement
      ))
      .join('/');

    if (safeFolder && !safeFolder.endsWith('/')) {
      safeFolder += '/';
    }
  }

  return `${safeFolder}${safeTitle}.${normalizeGeneratedFileExtension(extension)}`;
}

async function downloadGeneratedFile(message = {}, deps = {}) {
  const options = await deps.getOptions();
  const tabId = Number.isInteger(message.tabId) ? message.tabId : null;

  if (!tabId) {
    throw new Error('No target tab provided for generated file download');
  }

  const browserApi = deps.browserApi;
  const chromeApi = deps.chromeApi;
  const mimeType = String(message.mimeType || 'application/octet-stream');
  const content = String(message.content || '');
  const mdClipsFolder = String(message.mdClipsFolder || '');
  const filename = buildGeneratedDownloadFilename(
    message.title,
    mdClipsFolder,
    options,
    message.fileExtension
  );
  const notificationDelta = message.notificationDelta || SINGLE_DOWNLOAD_NOTIFICATION_DELTA;

  if (options.downloadMode === 'downloadsApi' && (browserApi.downloads || chromeApi?.downloads)) {
    const blobUrl = deps.createObjectURL(new deps.BlobCtor([content], { type: mimeType }));
    await deps.handleDownloadWithBlobUrl(
      blobUrl,
      filename,
      null,
      tabId,
      {},
      mdClipsFolder,
      {
        ...options,
        downloadImages: false
      },
      notificationDelta
    );
    return;
  }

  await deps.ensureScripts(tabId);
  const base64Content = deps.base64EncodeUnicode(content);

  await browserApi.scripting.executeScript({
    target: { tabId },
    func: (nextFilename, nextContent, nextMimeType) => {
      const link = document.createElement('a');
      link.download = nextFilename;
      link.href = `data:${nextMimeType};base64,${nextContent}`;
      link.click();
    },
    args: [filename, base64Content, mimeType]
  });
}

describe('Generated download helpers', () => {
  test('normalizes generated file extensions', () => {
    expect(normalizeGeneratedFileExtension('.HTML')).toBe('html');
    expect(normalizeGeneratedFileExtension('  .TxT  ')).toBe('txt');
    expect(normalizeGeneratedFileExtension('$$$')).toBe('bin');
  });

  test('builds sanitized filenames for generated exports', () => {
    const filename = buildGeneratedDownloadFilename(
      'My [Clip]#1',
      'Research/[Inbox]',
      { disallowedChars: '[]#^' },
      '.HTML'
    );

    expect(filename).toBe('Research/Inbox/My Clip1.html');
  });

  test('applies configured replacement for generated export filenames', () => {
    const filename = buildGeneratedDownloadFilename(
      'Billing/Plans:Pro#400',
      'Research/[Inbox]',
      { disallowedChars: '[]#^', disallowedCharReplacement: '_' },
      'md'
    );

    expect(filename).toBe('Research/_Inbox_/Billing/Plans_Pro_400.md');
  });

  test('routes generated files through the tracked downloads-api blob path when available', async () => {
    const getOptions = jest.fn().mockResolvedValue({
      downloadMode: 'downloadsApi',
      saveAs: true,
      downloadImages: true,
      disallowedChars: '[]#^'
    });
    const handleDownloadWithBlobUrl = jest.fn().mockResolvedValue(undefined);
    const createObjectURL = jest.fn().mockReturnValue('blob:generated-export');

    await downloadGeneratedFile({
      title: 'Clip #1',
      mdClipsFolder: 'Exports',
      tabId: 12,
      content: 'Plain export body',
      mimeType: 'text/plain;charset=utf-8',
      fileExtension: 'txt'
    }, {
      getOptions,
      handleDownloadWithBlobUrl,
      browserApi: {
        downloads: {},
        scripting: { executeScript: jest.fn() }
      },
      chromeApi: null,
      createObjectURL,
      BlobCtor: Blob,
      ensureScripts: jest.fn(),
      base64EncodeUnicode: jest.fn()
    });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(handleDownloadWithBlobUrl).toHaveBeenCalledWith(
      'blob:generated-export',
      'Exports/Clip 1.txt',
      null,
      12,
      {},
      'Exports',
      expect.objectContaining({
        downloadMode: 'downloadsApi',
        saveAs: true,
        downloadImages: false
      }),
      { downloads: 1, exports: 1 }
    );
  });

  test('falls back to a content-script data URL when downloads api is unavailable', async () => {
    const ensureScripts = jest.fn().mockResolvedValue(undefined);
    const executeScript = jest.fn().mockResolvedValue(undefined);
    const base64EncodeUnicode = jest.fn().mockReturnValue('PGgxPkNsaXA8L2gxPg==');

    await downloadGeneratedFile({
      title: 'Clip',
      tabId: 7,
      content: '<h1>Clip</h1>',
      mimeType: 'text/html;charset=utf-8',
      fileExtension: 'html'
    }, {
      getOptions: jest.fn().mockResolvedValue({
        downloadMode: 'contentLink',
        disallowedChars: '[]#^'
      }),
      handleDownloadWithBlobUrl: jest.fn(),
      browserApi: {
        downloads: null,
        scripting: { executeScript }
      },
      chromeApi: null,
      createObjectURL: jest.fn(),
      BlobCtor: Blob,
      ensureScripts,
      base64EncodeUnicode
    });

    expect(ensureScripts).toHaveBeenCalledWith(7);
    expect(base64EncodeUnicode).toHaveBeenCalledWith('<h1>Clip</h1>');
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 7 },
      args: ['Clip.html', 'PGgxPkNsaXA8L2gxPg==', 'text/html;charset=utf-8']
    }));
  });
});
