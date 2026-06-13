const { Blob: NodeBlob } = require('buffer');
const zipUtils = require('../../shared/zip-utils');

async function blobToBuffer(blob) {
  return Buffer.from(await blob.arrayBuffer());
}

describe('zip utils', () => {
  const originalBlob = global.Blob;

  beforeAll(() => {
    global.Blob = NodeBlob;
  });

  afterAll(() => {
    global.Blob = originalBlob;
  });

  test('marks entry names as UTF-8 in local and central headers', async () => {
    const filename = '記事/研究.md';
    const zipBlob = zipUtils.createStoredZipBlob([
      { filename, content: '# Research\n' }
    ]);
    const zipBytes = await blobToBuffer(zipBlob);

    expect(zipBytes.readUInt32LE(0)).toBe(0x04034b50);
    expect(zipBytes.readUInt16LE(6)).toBe(0x0800);

    const compressedSize = zipBytes.readUInt32LE(18);
    const nameLength = zipBytes.readUInt16LE(26);
    const extraLength = zipBytes.readUInt16LE(28);
    const centralOffset = 30 + nameLength + extraLength + compressedSize;

    expect(zipBytes.subarray(30, 30 + nameLength).toString('utf8')).toBe(filename);
    expect(zipBytes.readUInt32LE(centralOffset)).toBe(0x02014b50);
    expect(zipBytes.readUInt16LE(centralOffset + 8)).toBe(0x0800);
  });
});
