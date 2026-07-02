const fs = require('fs');
const os = require('os');
const path = require('path');
const { Blob: NodeBlob } = require('buffer');

const {
  buildExtensionPackages,
  generateReleaseHighlightsForPackaging,
  getPackageDependencies,
  verifyPackageDependencies
} = require('../../scripts/build-extension-packages');

async function blobToBuffer(blob) {
  return Buffer.from(await blob.arrayBuffer());
}

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

function createTempSrcFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marksnip-package-test-'));
  const srcDir = path.join(root, 'src');
  fs.mkdirSync(path.join(srcDir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(srcDir, 'shared'), { recursive: true });
  fs.mkdirSync(path.join(srcDir, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'content.js'), 'console.log("clip");\n');
  fs.writeFileSync(path.join(srcDir, 'shared', 'helper.js'), 'globalThis.helper = true;\n');
  fs.writeFileSync(path.join(srcDir, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: 'MarkSnip',
    version: '9.8.7',
    background: { service_worker: 'service-worker.js' },
    permissions: ['activeTab', 'downloads', 'offscreen'],
    browser_specific_settings: {
      gecko: { id: 'marksnip@example.test' }
    }
  }, null, 2));
  fs.writeFileSync(path.join(srcDir, 'CHANGELOG.md'), [
    '# Changelog',
    '',
    '## 9.8.7',
    '',
    '- Package build fixture.'
  ].join('\n'));
  fs.writeFileSync(path.join(srcDir, 'package.json'), JSON.stringify({
    devDependencies: { 'web-ext': '^7.4.0' }
  }, null, 2));
  return { root, srcDir };
}

describe('extension package builder', () => {
  const originalBlob = global.Blob;

  beforeAll(() => {
    global.Blob = NodeBlob;
  });

  afterAll(() => {
    global.Blob = originalBlob;
  });

  test('reports the dependencies needed to build install packages', () => {
    expect(getPackageDependencies()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Node.js', required: true }),
      expect.objectContaining({ name: 'npm dependencies', required: true }),
      expect.objectContaining({ name: 'web-ext', required: true })
    ]));
  });

  test('throws a clear error when web-ext is unavailable', () => {
    expect(() => verifyPackageDependencies({
      srcDir: '/tmp/missing',
      webExtBin: '/tmp/missing/web-ext'
    })).toThrow(/web-ext/i);
  });

  test('keeps release highlights stable when only generatedAt would change', () => {
    const { srcDir } = createTempSrcFixture();
    const outputPath = path.join(srcDir, 'shared', 'release-highlights.json');
    fs.writeFileSync(outputPath, JSON.stringify({
      generatedAt: '2024-01-01T00:00:00.000Z',
      source: 'CHANGELOG.md',
      versions: {
        '9.8.7': ['Package build fixture.']
      }
    }, null, 2) + '\n');

    generateReleaseHighlightsForPackaging({
      srcDir,
      manifestPath: path.join(srcDir, 'manifest.json')
    });

    expect(JSON.parse(fs.readFileSync(outputPath, 'utf8')).generatedAt)
      .toBe('2024-01-01T00:00:00.000Z');
  });

  test('creates Chrome and Edge ZIP packages without requiring a system zip command', async () => {
    const { root, srcDir } = createTempSrcFixture();
    const distDir = path.join(root, 'dist');
    const fakeWebExt = path.join(root, 'web-ext');
    const runCommand = jest.fn((_command, _args, options) => {
      fs.writeFileSync(path.join(distDir, 'marksnip-firefox-9.8.7.zip'), 'firefox package');
      expect(options.env.NO_UPDATE_NOTIFIER).toBe('1');
    });
    fs.writeFileSync(fakeWebExt, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(fakeWebExt, 0o755);

    const result = await buildExtensionPackages({
      srcDir,
      distDir,
      webExtBin: fakeWebExt,
      runCommand,
      logger: jest.fn()
    });

    expect(result.version).toBe('9.8.7');
    expect(result.chromePackage).toBe(path.join(distDir, 'marksnip-chrome-9.8.7.zip'));
    expect(result.edgePackage).toBe(path.join(distDir, 'marksnip-edge-9.8.7.zip'));
    expect(result.firefoxPackages).toEqual([
      path.join(distDir, 'marksnip-firefox-9.8.7.zip')
    ]);
    expect(runCommand).toHaveBeenCalledWith(fakeWebExt, expect.arrayContaining([
      'build',
      '--source-dir',
      path.join(srcDir, '.build', 'firefox')
    ]), expect.objectContaining({
      cwd: srcDir
    }));
    expect(fs.existsSync(result.chromePackage)).toBe(true);
    expect(fs.existsSync(result.edgePackage)).toBe(true);

    const chromeEntries = parseStoredZip(await blobToBuffer(new NodeBlob([
      fs.readFileSync(result.chromePackage)
    ])));
    expect(chromeEntries['manifest.json']).toBeTruthy();
    expect(chromeEntries['content.js'].toString('utf8')).toBe('console.log("clip");\n');
    expect(chromeEntries['scripts/generate-browser-manifests.js']).toBeUndefined();
  });
});
