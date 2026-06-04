(function (root, factory) {
  const api = factory(root);
  root.markSnipMarkdownOptions = api;
  /* istanbul ignore next - CommonJS export path */
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  function fallbackTextReplace(value) {
    return String(value || '');
  }

  function fallbackStripPromptPlaceholders(value) {
    return String(value || '').replace(/\{\{(?:prompt:)?"[\s\S]*?"(?:\|[^}]*)?\}\}/g, '');
  }

  function identity(value) {
    return value;
  }

  /* istanbul ignore next */
  function getTemplateUtils() {
    if (root.markSnipTemplateUtils) {
      return root.markSnipTemplateUtils;
    }

    try {
      return require('./template-utils');
    } catch {
      return {
        textReplace: fallbackTextReplace,
        generateValidFileName: identity,
        stripPromptPlaceholders: fallbackStripPromptPlaceholders
      };
    }
  }

  function getUrlUtils() {
    if (root.markSnipUrlUtils) {
      return root.markSnipUrlUtils;
    }

    try {
      return require('./url-utils');
    } catch {
      return null;
    }
  }

  function fallbackNormalizeImagePlacementMode(options = {}) {
    const mode = String(options.imagePlacement || '').trim();
    if (mode === 'sameFolder' || mode === 'sidecar' || mode === 'customPrefix') {
      return mode;
    }
    return String(options.imagePrefix || '') ? 'customPrefix' : 'sameFolder';
  }

  function createEffectiveMarkdownOptions(article, providedOptions = null, downloadImages = null) {
    const templateUtils = getTemplateUtils();
    const urlUtils = getUrlUtils();
    const textReplace = templateUtils.textReplace;
    const generateValidFileName = templateUtils.generateValidFileName;
    const stripPromptPlaceholders = typeof templateUtils.stripPromptPlaceholders === 'function'
      ? templateUtils.stripPromptPlaceholders
      : fallbackStripPromptPlaceholders;

    const baseOptions = providedOptions || root.defaultOptions || {};
    const options = {
      frontmatter: '',
      backmatter: '',
      imagePrefix: '',
      disallowedChars: '',
      disallowedCharReplacement: '',
      ...baseOptions,
      tableFormatting: baseOptions.tableFormatting
        ? { ...baseOptions.tableFormatting }
        : baseOptions.tableFormatting
    };

    if (downloadImages != null) {
      options.downloadImages = downloadImages;
    }

    options.imagePlacement = urlUtils?.normalizeImagePlacementMode
      ? urlUtils.normalizeImagePlacementMode(options)
      : fallbackNormalizeImagePlacementMode(options);

    if (options.includeTemplate) {
      if (!options.interpreterEnabled) {
        options.frontmatter = stripPromptPlaceholders(options.frontmatter);
        options.backmatter = stripPromptPlaceholders(options.backmatter);
      }
      options.frontmatter = textReplace(options.frontmatter, article) + '\n';
      options.backmatter = '\n' + textReplace(options.backmatter, article);
    } else {
      options.frontmatter = '';
      options.backmatter = '';
    }

    options.imagePrefix = textReplace(options.imagePrefix, article, options.disallowedChars, options.disallowedCharReplacement)
      .split('/')
      .map((segment) => generateValidFileName(segment, options.disallowedChars, options.disallowedCharReplacement))
      .join('/');

    return options;
  }

  return {
    createEffectiveMarkdownOptions
  };
});
