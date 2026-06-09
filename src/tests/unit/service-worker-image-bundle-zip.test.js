const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Blob: NodeBlob } = require('buffer');

const serviceWorkerSource = fs.readFileSync(
  path.join(__dirname, '../../service-worker.js'),
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

function createServiceWorkerSandbox() {
  const downloads = [];
  const blobStore = new Map();
  const noopListener = {
    addListener: jest.fn(),
    removeListener: jest.fn(),
    hasListener: jest.fn(() => false)
  };
  let blobIndex = 0;

  const sandbox = {
    console,
    TextEncoder,
    Uint8Array,
    ArrayBuffer,
    DataView,
    Blob: NodeBlob,
    setTimeout,
    clearTimeout,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    createMenus: jest.fn(async () => {}),
    browser: {
      runtime: {
        getPlatformInfo: jest.fn(async () => ({ os: 'linux' })),
        getBrowserInfo: jest.fn(async () => ({ name: 'Firefox' })),
        getManifest: jest.fn(() => ({ optional_permissions: [] })),
        getURL: jest.fn((assetPath) => `moz-extension://marksnip-test/${assetPath}`),
        onMessage: noopListener,
        onInstalled: noopListener,
        onStartup: noopListener,
        sendMessage: jest.fn(async () => ({}))
      },
      contextMenus: {
        onClicked: noopListener,
        create: jest.fn(),
        update: jest.fn(async () => {}),
        removeAll: jest.fn(async () => {})
      },
      commands: {
        onCommand: noopListener
      },
      downloads: {
        onChanged: noopListener,
        onDeterminingFilename: noopListener,
        download: jest.fn(async (request) => {
          downloads.push(request);
          return downloads.length;
        })
      },
      storage: {
        local: {
          get: jest.fn(async () => ({})),
          set: jest.fn(async () => ({}))
        },
        sync: {
          get: jest.fn(async () => ({})),
          set: jest.fn(async () => ({}))
        },
        onChanged: noopListener
      },
      tabs: {
        onRemoved: noopListener,
        onUpdated: noopListener,
        query: jest.fn(async () => []),
        sendMessage: jest.fn(async () => ({}))
      },
      permissions: {
        contains: jest.fn(async () => false)
      },
      scripting: {
        executeScript: jest.fn(async () => [])
      }
    },
    chrome: {},
    defaultOptions: {},
    markSnipTemplateUtils: {
      textReplace: (value) => value,
      generateValidFileName: (value) => value,
      protectPromptPlaceholders: (value) => ({ text: value, placeholders: [] }),
      stripPromptPlaceholders: (value) => value
    },
    markSnipNotifications: {},
    markSnipI18n: {
      t: (_key, _substitutions, fallback) => fallback,
      ready: jest.fn(async () => {})
    },
    markSnipAgentBridgeState: {
      loadSettings: jest.fn(async () => ({ enabled: false })),
      loadStatus: jest.fn(async () => ({})),
      saveStatus: jest.fn(async () => ({}))
    },
    markSnipDownloadTracker: require('../../shared/download-tracker'),
    markSnipUrlUtils: require('../../shared/url-utils'),
    URL: {
      createObjectURL: jest.fn((blob) => {
        const url = `blob:marksnip-sw-test/${++blobIndex}`;
        blobStore.set(url, blob);
        return url;
      }),
      revokeObjectURL: jest.fn((url) => {
        blobStore.delete(url);
      })
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

  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(zipUtilsSource, sandbox, { filename: 'zip-utils.js' });
  vm.runInContext(serviceWorkerSource, sandbox, { filename: 'service-worker.js' });

  return {
    sandbox,
    downloads,
    blobStore
  };
}

describe('service worker image bundle ZIP downloads', () => {
  test('Firefox direct download path creates one ZIP instead of individual image downloads', async () => {
    const { sandbox, downloads, blobStore } = createServiceWorkerSandbox();
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
      { downloads: 1, exports: 1 }
    );

    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe('Clips/Research/Page.zip');

    const zipBlob = blobStore.get(downloads[0].url);
    const entries = parseStoredZip(await blobToBuffer(zipBlob));

    expect(entries['Research/Page.md'].toString('utf8')).toBe('# Page\n\n![](Page/photo.png)');
    expect([...entries['Research/Page/photo.png']]).toEqual([...imageBytes]);
    expect(sandbox.URL.revokeObjectURL).toHaveBeenCalledWith(imageUrl);
  });
});
