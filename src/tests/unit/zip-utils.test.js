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

// An independent CRC-32 (IEEE) so the encoder's checksums are checked, not echoed.
function referenceCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Reads a stored (uncompressed) ZIP through its end-of-central-directory record,
// the way an unzip tool does, and checks every local header against it.
function readZip(zipBytes) {
  const eocdOffset = zipBytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(eocdOffset).toBeGreaterThan(-1);
  const entryCount = zipBytes.readUInt16LE(eocdOffset + 10);
  const centralSize = zipBytes.readUInt32LE(eocdOffset + 12);
  const centralOffset = zipBytes.readUInt32LE(eocdOffset + 16);
  expect(centralOffset + centralSize).toBe(eocdOffset);

  const entries = [];
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    expect(zipBytes.readUInt32LE(cursor)).toBe(0x02014b50);
    const method = zipBytes.readUInt16LE(cursor + 10);
    const crc = zipBytes.readUInt32LE(cursor + 16);
    const compressedSize = zipBytes.readUInt32LE(cursor + 20);
    const size = zipBytes.readUInt32LE(cursor + 24);
    const nameLength = zipBytes.readUInt16LE(cursor + 28);
    const extraLength = zipBytes.readUInt16LE(cursor + 30);
    const commentLength = zipBytes.readUInt16LE(cursor + 32);
    const localOffset = zipBytes.readUInt32LE(cursor + 42);
    const name = zipBytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');

    expect(zipBytes.readUInt32LE(localOffset)).toBe(0x04034b50);
    expect(zipBytes.readUInt32LE(localOffset + 14)).toBe(crc);
    expect(zipBytes.readUInt32LE(localOffset + 18)).toBe(compressedSize);
    const localNameLength = zipBytes.readUInt16LE(localOffset + 26);
    const localExtraLength = zipBytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = zipBytes.subarray(dataStart, dataStart + compressedSize);

    entries.push({ name, method, crc, size, compressedSize, data });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

describe('zip utils archive structure', () => {
  const originalBlob = global.Blob;
  beforeAll(() => { global.Blob = NodeBlob; });
  afterAll(() => { global.Blob = originalBlob; });

  test('writes a readable archive with correct sizes and CRCs for text, binary and empty entries', async () => {
    const binary = Uint8Array.from({ length: 512 }, (_, index) => (index * 37) % 256);
    const files = [
      { filename: 'clip/Note.md', content: '# Title\n\nBody with ünïcödé.\n' },
      { filename: 'clip/image.png', content: binary },
      { filename: 'clip/empty.txt', content: '' }
    ];
    const entries = readZip(await blobToBuffer(zipUtils.createStoredZipBlob(files)));

    expect(entries.map(entry => entry.name)).toEqual(files.map(file => file.filename));
    entries.forEach((entry, index) => {
      const expected = typeof files[index].content === 'string'
        ? Buffer.from(files[index].content, 'utf8')
        : Buffer.from(files[index].content);
      expect(entry.method).toBe(0);
      expect(entry.size).toBe(expected.length);
      expect(entry.compressedSize).toBe(expected.length);
      expect(Buffer.compare(entry.data, expected)).toBe(0);
      expect(entry.crc).toBe(referenceCrc32(expected));
    });
  });

  test('an archive with no files is still a valid empty ZIP', async () => {
    const zipBytes = await blobToBuffer(zipUtils.createStoredZipBlob([]));
    expect(readZip(zipBytes)).toEqual([]);
    expect(zipBytes.length).toBe(22);
  });
});
