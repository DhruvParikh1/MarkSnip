const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Blob: NodeBlob } = require('buffer');

const offscreenSource = fs.readFileSync(
  path.join(__dirname, '../../offscreen/offscreen.js'),
  'utf8'
);
const zipUtilsSource = fs.readFileSync(
  path.join(__dirname, '../../shared/zip-utils.js'),
  'utf8'
);

function parseStoredZip(blobBytes) {
  const entries = {};
  let offset = 0;

  while (offset + 30 <= blobBytes.length && blobBytes.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = blobBytes.readUInt32LE(offset + 18);
    const nameLength = blobBytes.readUInt16LE(offset + 26);
    const extraLength = blobBytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = blobBytes.subarray(nameStart, nameStart + nameLength).toString('utf8');
    entries[name] = blobBytes.subarray(dataStart, dataEnd);
    offset = dataEnd;
  }

  return entries;
}

async function blobToBuffer(blob) {
  return Buffer.from(await blob.arrayBuffer());
}

function createOffscreenSandbox() {
  const messages = [];
  const downloads = [];
  const blobStore = new Map();
  let blobIndex = 0;

  function TurndownService() {}
  TurndownService.prototype = {
    escape(value) {
      return value;
    }
  };

  const sandbox = {
    console,
    TextEncoder,
    Uint8Array,
    ArrayBuffer,
    DataView,
    Blob: NodeBlob,
    setTimeout: jest.fn(),
    document: {
      addEventListener: jest.fn()
    },
    TurndownService,
    browser: {
      runtime: {
        onMessage: {
          addListener: jest.fn()
        },
        sendMessage: jest.fn(async (message) => {
          messages.push(message);
          return {};
        })
      },
      downloads: {
        download: jest.fn(async (request) => {
          downloads.push(request);
          return downloads.length;
        })
      }
    },
    chrome: {},
    defaultOptions: {},
    markSnipUrlUtils: require('../../shared/url-utils'),
    URL: {
      createObjectURL: jest.fn((blob) => {
        const url = `blob:marksnip-test/${++blobIndex}`;
        blobStore.set(url, blob);
        return url;
      }),
      revokeObjectURL: jest.fn()
    },
    fetch: jest.fn(async (url) => {
      if (!blobStore.has(url)) {
        return {
          ok: false,
          status: 404,
          blob: async () => new NodeBlob([])
        };
      }
      return {
        ok: true,
        status: 200,
        blob: async () => blobStore.get(url)
      };
    })
  };

  vm.createContext(sandbox);
  vm.runInContext(zipUtilsSource, sandbox, { filename: 'zip-utils.js' });
  vm.runInContext(offscreenSource, sandbox, { filename: 'offscreen.js' });

  return {
    sandbox,
    messages,
    downloads,
    blobStore
  };
}

describe('offscreen image bundle ZIP downloads', () => {
  test('stores binary ZIP entries without text encoding them', async () => {
    const { sandbox } = createOffscreenSandbox();
    const imageBytes = Uint8Array.from([0, 1, 2, 128, 255]);

    const zipBlob = sandbox.createStoredZipBlob([
      { filename: 'Article.md', content: '# Article\n' },
      { filename: 'Article/image.bin', content: imageBytes }
    ]);

    const entries = parseStoredZip(await blobToBuffer(zipBlob));

    expect(entries['Article.md'].toString('utf8')).toBe('# Article\n');
    expect([...entries['Article/image.bin']]).toEqual([...imageBytes]);
  });

  test('downloads one ZIP and skips individual image delegation when enabled', async () => {
    const { sandbox, messages, downloads, blobStore } = createOffscreenSandbox();
    const imageBytes = Uint8Array.from([137, 80, 78, 71]);
    const imageUrl = sandbox.URL.createObjectURL(new NodeBlob([imageBytes], { type: 'image/png' }));

    await sandbox.downloadMarkdown(
      '# Page\n\n![](Page/photo.png)',
      'Research/Page',
      42,
      { [imageUrl]: 'Page/photo.png' },
      'Clips',
      {
        downloadMode: 'downloadsApi',
        downloadImages: true,
        imageBundleZip: true,
        saveAs: false
      },
      { notification: 'delta' }
    );

    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe('Clips/Research/Page.zip');
    expect(messages.some((message) => message.type === 'download-images')).toBe(false);

    const trackMessage = messages.find((message) => message.type === 'track-download-url');
    expect(trackMessage).toMatchObject({
      filename: 'Clips/Research/Page.zip',
      tabId: 42
    });

    const zipBlob = blobStore.get(downloads[0].url);
    const entries = parseStoredZip(await blobToBuffer(zipBlob));

    expect(entries['Research/Page.md'].toString('utf8')).toBe('# Page\n\n![](Page/photo.png)');
    expect([...entries['Research/Page/photo.png']]).toEqual([...imageBytes]);
    expect(sandbox.URL.revokeObjectURL).toHaveBeenCalledWith(imageUrl);
  });

  test('untracks and revokes ZIP URL when bundled ZIP download start fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { sandbox, messages, downloads, blobStore } = createOffscreenSandbox();
    const imageBytes = Uint8Array.from([137, 80, 78, 71]);
    const imageUrl = sandbox.URL.createObjectURL(new NodeBlob([imageBytes], { type: 'image/png' }));

    sandbox.browser.downloads.download = jest.fn(async (request) => {
      downloads.push(request);
      if (request.filename.endsWith('.zip')) {
        throw new Error('ZIP download failed');
      }
      return downloads.length;
    });

    try {
      await sandbox.downloadMarkdown(
        '# Page\n\n![](Page/photo.png)',
        'Research/Page',
        42,
        { [imageUrl]: 'Page/photo.png' },
        'Clips',
        {
          downloadMode: 'downloadsApi',
          downloadImages: true,
          imageBundleZip: true,
          saveAs: false
        },
        { notification: 'delta' }
      );
    } finally {
      errorSpy.mockRestore();
    }

    const zipTrackMessage = messages.find((message) => (
      message.type === 'track-download-url' &&
      message.filename === 'Clips/Research/Page.zip'
    ));
    expect(zipTrackMessage).toBeTruthy();
    expect(messages).toContainEqual({
      type: 'untrack-download-url',
      url: zipTrackMessage.url
    });
    expect(sandbox.URL.revokeObjectURL).toHaveBeenCalledWith(zipTrackMessage.url);
    expect(sandbox.URL.revokeObjectURL).not.toHaveBeenCalledWith(imageUrl);
    expect(messages.some((message) => (
      message.type === 'download-complete' &&
      message.url === zipTrackMessage.url
    ))).toBe(false);
    expect(downloads.map((request) => request.filename)).toEqual([
      'Clips/Research/Page.zip',
      'Clips/Research/Page.md'
    ]);
  });

  test('skips failed image reads without falling back to individual downloads', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { sandbox, messages, downloads, blobStore } = createOffscreenSandbox();
    const imageBytes = Uint8Array.from([137, 80, 78, 71]);
    const imageUrl = sandbox.URL.createObjectURL(new NodeBlob([imageBytes], { type: 'image/png' }));
    const missingImageUrl = 'blob:marksnip-test/missing';

    try {
      await sandbox.downloadMarkdown(
        '# Page\n\n![](Page/photo.png)\n\n![](Page/missing.png)',
        'Research/Page',
        42,
        {
          [imageUrl]: 'Page/photo.png',
          [missingImageUrl]: 'Page/missing.png'
        },
        'Clips',
        {
          downloadMode: 'downloadsApi',
          downloadImages: true,
          imageBundleZip: true,
          saveAs: false
        },
        { notification: 'delta' }
      );
    } finally {
      warnSpy.mockRestore();
    }

    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe('Clips/Research/Page.zip');
    expect(messages.some((message) => message.type === 'download-images')).toBe(false);

    const zipBlob = blobStore.get(downloads[0].url);
    const entries = parseStoredZip(await blobToBuffer(zipBlob));

    expect(entries['Research/Page.md'].toString('utf8'))
      .toBe('# Page\n\n![](Page/photo.png)\n\n![](Page/missing.png)');
    expect([...entries['Research/Page/photo.png']]).toEqual([...imageBytes]);
    expect(entries['Research/Page/missing.png']).toBeUndefined();
  });
});
