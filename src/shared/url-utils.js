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

  function stripUrlFragment(url) {
    const copy = new URL(url.href);
    copy.hash = '';
    return copy.href;
  }

  /**
   * Resolve a link href for Markdown output.
   *
   * Relative hrefs are resolved against baseURI. Absolute hrefs are returned
   * unchanged, and hrefs that cannot be resolved are returned as written.
   *
   * With keepSamePageAnchors, a link whose target is the clipped page itself
   * (same URL apart from the fragment) is written as just its "#fragment", so it
   * stays an in-document link. "Same page" is decided on the resolved URL, so a
   * "#x" href under a <base> that points at another document stays absolute.
   */
  function resolveMarkdownLinkHref(href, baseURI, options = {}) {
    const rawHref = typeof href === 'string' ? href.trim() : '';
    if (!rawHref) {
      return href;
    }

    let resolved;
    try {
      resolved = new URL(rawHref, baseURI || undefined);
    } catch {
      return href;
    }

    let absoluteHref;
    try {
      new URL(rawHref);
      absoluteHref = rawHref;
    } catch {
      absoluteHref = resolved.href;
    }

    if (options.keepSamePageAnchors !== true || !resolved.hash || resolved.hash === '#') {
      return absoluteHref;
    }

    const pageUrl = safeParseUrl(options.pageUrl || '') || safeParseUrl(baseURI || '');
    if (!pageUrl || stripUrlFragment(resolved) !== stripUrlFragment(pageUrl)) {
      return absoluteHref;
    }

    // Keep the fragment exactly as the page wrote it when it was already relative.
    return rawHref.startsWith('#') ? rawHref : resolved.hash;
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
      filename = filename + '.idunno';
    }

    filename = generateValidFileName(
      filename,
      effectiveOptions.disallowedChars,
      effectiveOptions.disallowedCharReplacement
    );

    return filename;
  }

  function sanitizeDownloadPath(path) {
    const templateUtils = getTemplateUtils();
    return typeof templateUtils.sanitizeDownloadPath === 'function'
      ? templateUtils.sanitizeDownloadPath(path)
      : path;
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
      // Same sanitizing as the download path, so the Markdown link matches the saved file
      markdownPath: sanitizeDownloadPath(stripLeadingSlashes(normalizePathSeparators(relativePath))),
      markdownTitleFolder: getMarkdownTitleFolder(title)
    };
  }

  function buildImageDownloadFilename(markdownImagePath, title = '', mdClipsFolder = '') {
    return sanitizeDownloadPath(joinPathSegments(
      mdClipsFolder,
      getMarkdownTitleFolder(title),
      markdownImagePath
    ));
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
    resolveMarkdownLinkHref,
    normalizeImagePlacementMode,
    getMarkdownTitleFolder,
    getMarkdownTitleBaseName,
    getImageBaseFilename,
    resolveImagePath,
    buildImageDownloadFilename,
    resolveImageDownloadPath,
    getImageFilename
  };
});
