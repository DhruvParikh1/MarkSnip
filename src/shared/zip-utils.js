(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.markSnipZipUtils = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  function getUrlUtils() {
    if (root.markSnipUrlUtils) {
      return root.markSnipUrlUtils;
    }

    if (typeof require === 'function') {
      try {
        return require('./url-utils');
      } catch {
        return null;
      }
    }

    return null;
  }

  function normalizePath(value) {
    return String(value || '').replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  }

  function stripLeadingSlashes(value) {
    return String(value || '').replace(/^\/+/, '');
  }

  function joinPathSegments(...segments) {
    return stripLeadingSlashes(segments
      .map((segment) => normalizePath(segment).replace(/^\/+|\/+$/g, ''))
      .filter(Boolean)
      .join('/'));
  }

  function getMarkdownTitleFolder(title) {
    const normalizedTitle = stripLeadingSlashes(normalizePath(title).replace(/\/+$/g, ''));
    const lastSlashIndex = normalizedTitle.lastIndexOf('/');
    return lastSlashIndex >= 0 ? normalizedTitle.substring(0, lastSlashIndex + 1) : '';
  }

  function buildImageDownloadFilename(markdownImagePath, title = '', mdClipsFolder = '') {
    const urlUtils = getUrlUtils();
    if (urlUtils?.buildImageDownloadFilename) {
      return urlUtils.buildImageDownloadFilename(markdownImagePath, title, mdClipsFolder);
    }

    return joinPathSegments(mdClipsFolder, getMarkdownTitleFolder(title), markdownImagePath);
  }

  function buildBundleZipDownloadFilename(title, mdClipsFolder = '') {
    return joinPathSegments(mdClipsFolder, `${title}.zip`);
  }

  function isArrayBuffer(value) {
    return value instanceof ArrayBuffer || Object.prototype.toString.call(value) === '[object ArrayBuffer]';
  }

  function normalizeZipContentBytes(content, encoder) {
    if (ArrayBuffer.isView(content)) {
      return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
    }
    if (isArrayBuffer(content)) {
      return new Uint8Array(content);
    }
    return encoder.encode(String(content || ''));
  }

  const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function getDosDateTime(date = new Date()) {
    const year = Math.max(1980, Math.min(2107, date.getFullYear()));
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = Math.floor(date.getSeconds() / 2);

    const dosTime = (hours << 11) | (minutes << 5) | seconds;
    const dosDate = ((year - 1980) << 9) | (month << 5) | day;
    return { dosDate, dosTime };
  }

  function createStoredZipBlob(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const utf8FilenameFlag = 0x0800;

    const { dosDate, dosTime } = getDosDateTime();

    files.forEach(file => {
      const entryName = (file.filename || 'untitled.md').replace(/\\/g, '/').replace(/^\/+/, '');
      const nameBytes = encoder.encode(entryName);
      const dataBytes = normalizeZipContentBytes(file.content, encoder);
      const entryCrc = crc32(dataBytes);
      const size = dataBytes.length;

      const localHeader = new Uint8Array(30 + nameBytes.length + size);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, utf8FilenameFlag, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, dosTime, true);
      localView.setUint16(12, dosDate, true);
      localView.setUint32(14, entryCrc, true);
      localView.setUint32(18, size, true);
      localView.setUint32(22, size, true);
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);
      localHeader.set(dataBytes, 30 + nameBytes.length);
      localParts.push(localHeader);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, utf8FilenameFlag, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, dosTime, true);
      centralView.setUint16(14, dosDate, true);
      centralView.setUint32(16, entryCrc, true);
      centralView.setUint32(20, size, true);
      centralView.setUint32(24, size, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);
      centralParts.push(centralHeader);

      offset += localHeader.length;
    });

    const centralDirectoryOffset = offset;
    let centralDirectorySize = 0;
    centralParts.forEach(part => {
      centralDirectorySize += part.length;
    });

    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralDirectorySize, true);
    endView.setUint32(16, centralDirectoryOffset, true);
    endView.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, endRecord], { type: 'application/zip' });
  }

  async function readUrlBytes(url, deps = {}) {
    const fetchFn = deps.fetch || root.fetch;
    if (typeof fetchFn !== 'function') {
      throw new Error('Fetch API is unavailable');
    }

    const response = await fetchFn(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status || 0}`);
    }
    const blob = await response.blob();
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function createMarkdownImageBundleFiles(markdown, title, imageList = {}, deps = {}) {
    const imageEntries = Object.entries(imageList);
    const imageResults = await Promise.allSettled(imageEntries.map(async ([src, markdownImagePath]) => ({
      filename: buildImageDownloadFilename(markdownImagePath, title, ''),
      content: await readUrlBytes(src, deps)
    })));
    const imageFiles = [];

    imageResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        imageFiles.push(result.value);
        return;
      }

      if (typeof deps.onImageReadError === 'function') {
        const [src, markdownImagePath] = imageEntries[index] || [];
        deps.onImageReadError(result.reason, { src, markdownImagePath });
      }
    });

    return [{
      filename: `${title}.md`,
      content: markdown
    }, ...imageFiles];
  }

  return {
    buildBundleZipDownloadFilename,
    buildImageDownloadFilename,
    createMarkdownImageBundleFiles,
    createStoredZipBlob,
    normalizeZipContentBytes,
    readUrlBytes
  };
});
