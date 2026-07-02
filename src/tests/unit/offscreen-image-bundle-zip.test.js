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
const obsidianUtils = require('../../shared/obsidian-utils');

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
    markSnipObsidian: obsidianUtils,
    markSnipUrlUtils: require('../../shared/url-utils'),
    mimedb: {
      'image/jpeg': 'jpeg',
      'image/png': 'png'
    },
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
  test('keeps original image URL in the download list when offscreen prefetch fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { sandbox, blobStore } = createOffscreenSandbox();
    const imageBytes = Uint8Array.from([137, 80, 78, 71]);
    const reachableImageUrl = sandbox.URL.createObjectURL(new NodeBlob([imageBytes], { type: 'image/png' }));
    const blockedImageUrl = 'https://cdn.example.test/protected/photo.png';

    let result;
    try {
      result = await sandbox.preDownloadImages(
        {
          [reachableImageUrl]: 'Page/reachable.png',
          [blockedImageUrl]: 'Page/protected.png'
        },
        '# Page\n\n![](Page/reachable.png)\n\n![](Page/protected.png)',
        {
          imageStyle: 'markdown'
        }
      );
    } finally {
      errorSpy.mockRestore();
    }

    expect(result.imageList['blob:marksnip-test/2']).toBe('Page/reachable.png');
    expect(result.imageList[blockedImageUrl]).toBe('Page/protected.png');
    expect(Object.keys(result.imageList)).toHaveLength(2);
    expect(blobStore.get('blob:marksnip-test/2')).toBeTruthy();
    expect(result.sourceImageMap['Page/reachable.png']).toBe(reachableImageUrl);
    expect(result.sourceImageMap['Page/protected.png']).toBe(blockedImageUrl);
    expect(result.markdown).toBe('# Page\n\n![](Page/reachable.png)\n\n![](Page/protected.png)');
  });

  test('keeps markdown image suffix aligned with the predownloaded blob type', async () => {
    const { sandbox, blobStore } = createOffscreenSandbox();
    const imageBytes = Uint8Array.from([255, 216, 255, 224]);
    const imageUrl = sandbox.URL.createObjectURL(new NodeBlob([imageBytes], { type: 'image/jpeg' }));

    const result = await sandbox.preDownloadImages(
      {
        [imageUrl]: '640.webp'
      },
      '# Page\n\n![](640.webp)',
      {
        imageStyle: 'markdown'
      }
    );

    const downloadedUrl = Object.keys(result.imageList)[0];

    expect(result.markdown).toBe('# Page\n\n![](640.jpeg)');
    expect(result.imageList[downloadedUrl]).toBe('640.jpeg');
    expect(blobStore.get(downloadedUrl)).toBeTruthy();
  });

  test('keeps equivalent jpeg extensions unchanged after predownload', async () => {
    const { sandbox } = createOffscreenSandbox();
    const imageBytes = Uint8Array.from([255, 216, 255, 224]);
    const imageUrl = sandbox.URL.createObjectURL(new NodeBlob([imageBytes], { type: 'image/jpeg' }));

    const result = await sandbox.preDownloadImages(
      {
        [imageUrl]: 'photo.jpg'
      },
      '# Page\n\n![](photo.jpg)',
      {
        imageStyle: 'markdown'
      }
    );

    const downloadedUrl = Object.keys(result.imageList)[0];

    expect(result.markdown).toBe('# Page\n\n![](photo.jpg)');
    expect(result.imageList[downloadedUrl]).toBe('photo.jpg');
  });

  test('keeps markdown references unique when blob type alignment creates filename collisions', async () => {
    const { sandbox } = createOffscreenSandbox();
    const firstImageUrl = sandbox.URL.createObjectURL(new NodeBlob([
      Uint8Array.from([255, 216, 255, 224, 1])
    ], { type: 'image/jpeg' }));
    const secondImageUrl = sandbox.URL.createObjectURL(new NodeBlob([
      Uint8Array.from([255, 216, 255, 224, 2])
    ], { type: 'image/jpeg' }));

    const result = await sandbox.preDownloadImages(
      {
        [firstImageUrl]: '640.jpeg',
        [secondImageUrl]: '640.webp'
      },
      '# Page\n\n![first](640.jpeg)\n\n![second](640.webp)',
      {
        imageStyle: 'markdown'
      }
    );

    expect(result.markdown).toBe('# Page\n\n![first](640.jpeg)\n\n![second](640.1.jpeg)');
    expect(new Set(Object.values(result.imageList))).toEqual(new Set(['640.jpeg', '640.1.jpeg']));
  });

  test('rewrites only the matching occurrence when different images start with the same markdown filename', async () => {
    const { sandbox } = createOffscreenSandbox();
    const firstImageUrl = sandbox.URL.createObjectURL(new NodeBlob([
      Uint8Array.from([255, 216, 255, 224, 1])
    ], { type: 'image/jpeg' }));
    const secondImageUrl = sandbox.URL.createObjectURL(new NodeBlob([
      Uint8Array.from([255, 216, 255, 224, 2])
    ], { type: 'image/jpeg' }));

    const result = await sandbox.preDownloadImages(
      {
        [firstImageUrl]: '640.webp',
        [secondImageUrl]: '640.webp'
      },
      '# Page\n\n![first](640.webp)\n\n![second](640.webp)',
      {
        imageStyle: 'markdown'
      }
    );

    expect(result.markdown).toBe('# Page\n\n![first](640.jpeg)\n\n![second](640.1.jpeg)');
    expect(Object.values(result.imageList)).toEqual(['640.jpeg', '640.1.jpeg']);
  });

  test('consumes unchanged markdown references before uniquifying a later duplicate filename', async () => {
    const { sandbox } = createOffscreenSandbox();
    const firstImageUrl = sandbox.URL.createObjectURL(new NodeBlob([
      Uint8Array.from([255, 216, 255, 224, 1])
    ], { type: 'image/jpeg' }));
    const secondImageUrl = sandbox.URL.createObjectURL(new NodeBlob([
      Uint8Array.from([255, 216, 255, 224, 2])
    ], { type: 'image/jpeg' }));

    const result = await sandbox.preDownloadImages(
      {
        [firstImageUrl]: 'photo.jpg',
        [secondImageUrl]: 'photo.jpg'
      },
      '# Page\n\n![first](photo.jpg)\n\n![second](photo.jpg)',
      {
        imageStyle: 'markdown'
      }
    );

    expect(result.markdown).toBe('# Page\n\n![first](photo.jpg)\n\n![second](photo.1.jpg)');
    expect(Object.values(result.imageList)).toEqual(['photo.jpg', 'photo.1.jpg']);
  });

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
    const { sandbox, messages, downloads } = createOffscreenSandbox();
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
