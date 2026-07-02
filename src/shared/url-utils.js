(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.markSnipUrlUtils = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  function getTemplateUtils() {
    if (root.markSnipTemplateUtils) {
      return root.markSnipTemplateUtils;
    }

    if (typeof require === 'function') {
      try {
        return require('./template-utils');
      } catch {
        return {
          generateValidFileName: (value) => value
        };
      }
    }

    return {
      generateValidFileName: (value) => value
    };
  }

  function safeParseUrl(urlString) {
    try {
      return new URL(urlString);
    } catch {
      return null;
    }
  }

  function resolveArticleUrl(domBaseUri, pageUrl) {
    const normalizedPageUrl = typeof pageUrl === 'string' ? pageUrl.trim() : '';
    const preferredUrl = normalizedPageUrl ? safeParseUrl(normalizedPageUrl) : null;
    if (preferredUrl) {
      return preferredUrl;
    }
    return safeParseUrl(domBaseUri);
  }

  function validateUri(href, baseURI) {
    try {
      new URL(href);
    } catch {
      return new URL(href, baseURI).href;
    }
    return href;
  }

  const LAZY_IMAGE_SOURCE_ATTRIBUTES = Object.freeze([
    'data-src',
    'data-original',
    'data-original-src',
    'data-lazy-src',
    'data-actualsrc',
    'data-full-src',
    'data-large-src',
    'data-hi-res-src',
    'data-image-src'
  ]);

  function normalizeImageSourceValue(value) {
    return String(value || '').trim();
  }

  function isPlaceholderImageSrc(src) {
    const normalizedSrc = normalizeImageSourceValue(src).toLowerCase();
    if (!normalizedSrc) {
      return true;
    }

    if (normalizedSrc === '#' || normalizedSrc === 'about:blank') {
      return true;
    }

    if (normalizedSrc.startsWith('data:image/svg+xml')) {
      return true;
    }

    if (normalizedSrc.startsWith('data:image/gif')) {
      return normalizedSrc.length < 160;
    }

    return false;
  }

  function isUsableImageSrc(src) {
    return !isPlaceholderImageSrc(src);
  }

  function getLazyImageSource(node) {
    if (!node?.getAttribute) {
      return '';
    }

    for (const attributeName of LAZY_IMAGE_SOURCE_ATTRIBUTES) {
      const candidate = normalizeImageSourceValue(node.getAttribute(attributeName));
      if (isUsableImageSrc(candidate)) {
        return candidate;
      }
    }

    return '';
  }

  function isSameImageResourcePath(firstSrc, secondSrc) {
    const firstUrl = safeParseUrl(firstSrc);
    const secondUrl = safeParseUrl(secondSrc);
    if (!firstUrl || !secondUrl) {
      return false;
    }

    if (firstUrl.origin !== secondUrl.origin) {
      return false;
    }

    if (firstUrl.pathname === secondUrl.pathname) {
      return true;
    }

    const firstName = firstUrl.pathname.split('/').filter(Boolean).pop();
    const secondName = secondUrl.pathname.split('/').filter(Boolean).pop();
    if (!firstName || !secondName || firstName !== secondName) {
      return false;
    }

    return Boolean(getImageExtensionFromQuery(firstSrc) && getImageExtensionFromQuery(secondSrc));
  }

  function shouldPreferLazyImageSource(src, lazySource) {
    if (!lazySource) {
      return false;
    }

    if (!isUsableImageSrc(src)) {
      return true;
    }

    return isSameImageResourcePath(src, lazySource) && src !== lazySource;
  }

  function resolveImageSource(node) {
    if (!node?.getAttribute) {
      return '';
    }

    const src = normalizeImageSourceValue(node.getAttribute('src'));
    const lazySource = getLazyImageSource(node);

    if (shouldPreferLazyImageSource(src, lazySource)) {
      return lazySource;
    }

    return src;
  }

  const IMAGE_EXTENSION_QUERY_PARAMETERS = Object.freeze([
    'format',
    'fmt',
    'ext',
    'extension',
    'type',
    'wx_fmt'
  ]);

  const IMAGE_EXTENSION_QUERY_VALUES = new Set([
    'avif',
    'bmp',
    'gif',
    'heic',
    'heif',
    'ico',
    'jpeg',
    'jpg',
    'png',
    'svg',
    'tif',
    'tiff',
    'webp'
  ]);

  function getImageExtensionFromQuery(src) {
    const parsedUrl = safeParseUrl(src);
    for (const parameterName of IMAGE_EXTENSION_QUERY_PARAMETERS) {
      const extension = String(parsedUrl?.searchParams?.get(parameterName) || '').trim().toLowerCase();
      if (IMAGE_EXTENSION_QUERY_VALUES.has(extension)) {
        return extension;
      }
    }
    return '';
  }

  const IMAGE_PLACEMENT_MODES = Object.freeze({
    SAME_FOLDER: 'sameFolder',
    SIDECAR: 'sidecar',
    CUSTOM_PREFIX: 'customPrefix'
  });

  const VALID_IMAGE_PLACEMENT_MODES = new Set(Object.values(IMAGE_PLACEMENT_MODES));

  function normalizePathSeparators(value) {
    return String(value || '').replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  }

  function stripLeadingSlashes(value) {
    return String(value || '').replace(/^\/+/, '');
  }

  function joinPathSegments(...segments) {
    return stripLeadingSlashes(segments
      .map((segment) => normalizePathSeparators(segment).replace(/^\/+|\/+$/g, ''))
      .filter(Boolean)
      .join('/'));
  }

  function getMarkdownTitleFolder(title) {
    const normalizedTitle = stripLeadingSlashes(normalizePathSeparators(title).replace(/\/+$/g, ''));
    const lastSlashIndex = normalizedTitle.lastIndexOf('/');
    return lastSlashIndex >= 0 ? normalizedTitle.substring(0, lastSlashIndex + 1) : '';
  }

  function getMarkdownTitleBaseName(title) {
    const normalizedTitle = stripLeadingSlashes(normalizePathSeparators(title).replace(/\/+$/g, ''));
    const lastSlashIndex = normalizedTitle.lastIndexOf('/');
    return lastSlashIndex >= 0 ? normalizedTitle.substring(lastSlashIndex + 1) : normalizedTitle;
  }

  function getResolvedOptionTitle(options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, 'resolvedTitle')) {
      return String(options.resolvedTitle || '');
    }
    return String(options.title || '');
  }

  function normalizeImagePlacementMode(options = {}) {
    const mode = String(options.imagePlacement || '').trim();
    if (VALID_IMAGE_PLACEMENT_MODES.has(mode)) {
      return mode;
    }

    const imagePrefix = String(options.imagePrefix ?? '');
    if (!imagePrefix) {
      return IMAGE_PLACEMENT_MODES.SAME_FOLDER;
    }

    const normalizedPrefix = normalizePathSeparators(imagePrefix);
    if (normalizedPrefix === '{pageTitle}/' || normalizedPrefix === '{title}/') {
      return IMAGE_PLACEMENT_MODES.SIDECAR;
    }

    return IMAGE_PLACEMENT_MODES.CUSTOM_PREFIX;
  }

  function getImageBaseFilename(src, options = {}) {
    const templateUtils = getTemplateUtils();
    const generateValidFileName = templateUtils.generateValidFileName;
    const effectiveOptions = options || {};

    const slashPos = src.lastIndexOf('/');
    const queryPos = src.indexOf('?');
    let filename = src.substring(slashPos + 1, queryPos > 0 ? queryPos : src.length);

    if (filename.includes(';base64,')) {
      filename = 'image.' + filename.substring(0, filename.indexOf(';'));
    }

    const extension = filename.substring(filename.lastIndexOf('.'));
    if (extension === filename) {
      const queryExtension = getImageExtensionFromQuery(src);
      filename = filename + '.' + (queryExtension || 'idunno');
    }

    filename = generateValidFileName(
      filename,
      effectiveOptions.disallowedChars,
      effectiveOptions.disallowedCharReplacement
    );

    return filename;
  }

  function resolveImagePath(src, options = {}) {
    const templateUtils = getTemplateUtils();
    const generateValidFileName = templateUtils.generateValidFileName;
    const effectiveOptions = options || {};
    const filename = getImageBaseFilename(src, effectiveOptions);
    const placement = normalizeImagePlacementMode(effectiveOptions);
    const title = getResolvedOptionTitle(effectiveOptions);
    let relativePath = filename;

    if (placement === IMAGE_PLACEMENT_MODES.SIDECAR) {
      const sidecarFolder = generateValidFileName(
        getMarkdownTitleBaseName(title),
        effectiveOptions.disallowedChars,
        effectiveOptions.disallowedCharReplacement
      );
      relativePath = joinPathSegments(sidecarFolder, filename);
    } else if (placement === IMAGE_PLACEMENT_MODES.CUSTOM_PREFIX) {
      relativePath = stripLeadingSlashes(normalizePathSeparators(String(effectiveOptions.imagePrefix || ''))) + filename;
    }

    return {
      filename,
      imagePlacement: placement,
      markdownPath: stripLeadingSlashes(normalizePathSeparators(relativePath)),
      markdownTitleFolder: getMarkdownTitleFolder(title)
    };
  }

  function buildImageDownloadFilename(markdownImagePath, title = '', mdClipsFolder = '') {
    return joinPathSegments(
      mdClipsFolder,
      getMarkdownTitleFolder(title),
      markdownImagePath
    );
  }

  function resolveImageDownloadPath(src, options = {}, mdClipsFolder = '') {
    const resolved = resolveImagePath(src, options);
    const title = getResolvedOptionTitle(options || {});
    return {
      ...resolved,
      downloadFilename: buildImageDownloadFilename(
        resolved.markdownPath,
        title,
        mdClipsFolder
      )
    };
  }

  function getImageFilename(src, options, prependFilePath = true) {
    const resolved = resolveImagePath(src, options || {});
    if (!prependFilePath) {
      return resolved.markdownPath;
    }
    return buildImageDownloadFilename(resolved.markdownPath, getResolvedOptionTitle(options || {}), '');
  }

  return {
    IMAGE_PLACEMENT_MODES,
    safeParseUrl,
    resolveArticleUrl,
    validateUri,
    normalizeImagePlacementMode,
    getMarkdownTitleFolder,
    getMarkdownTitleBaseName,
    isPlaceholderImageSrc,
    isUsableImageSrc,
    resolveImageSource,
    getImageBaseFilename,
    resolveImagePath,
    buildImageDownloadFilename,
    resolveImageDownloadPath,
    getImageFilename
  };
});
