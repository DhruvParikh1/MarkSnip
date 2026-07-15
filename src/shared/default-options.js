const DEFAULT_CONTEXT_MENU_ITEMS = {
  downloadTab: true,
  downloadAllTabs: true,
  downloadSelection: true,
  pickElement: true,
  copySelection: true,
  copyLink: true,
  copyImage: true,
  copyTab: true,
  copyTabLink: true,
  copyAllTabLinks: true,
  copySelectedTabLinks: true,
  sendSelectionToObsidian: true,
  sendTabToObsidian: true,
  toggleHighlighter: true,
  'reader-toggle': true,
  'reader-open-tab': true,
  highlightSelection: true,
  openHighlights: true,
  toggleIncludeTemplate: true,
  toggleDownloadImages: true
}

// these are the default options
const defaultOptions = {
  headingStyle: "atx",
  hr: "___",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  fence: "```",
  preserveCodeFormatting: false,
  autoDetectCodeLanguage: true,
  skipHiddenContent: false,
  emDelimiter: "_",
  strongDelimiter: "**",
  linkStyle: "inlined",
  linkReferenceStyle: "full",
  imageStyle: "markdown",
  imageRefStyle: "inlined",
  tableFormatting: {
    stripLinks: true,
    stripFormatting: false,
    prettyPrint: true,
    centerText: true
  },
  frontmatter: "---\ncreated: {date:YYYY-MM-DDTHH:mm:ss} (UTC {date:Z})\ntags: [{keywords}]\nsource: {pageURL}\nauthor: {byline}\n---\n\n# {pageTitle}\n\n> ## Excerpt\n> {excerpt}\n\n---",
  backmatter: "",
  title: "{pageTitle}",
  includeTemplate: false,
  saveAs: false,
  downloadImages: false,
  imageBundleZip: false,
  imagePlacement: '',
  imagePrefix: '{pageTitle}/',
  mdClipsFolder: null,
  disallowedChars: '[]#^',
  disallowedCharReplacement: '',
  downloadMode: 'downloadsApi',
  defaultExportType: 'markdown',
  defaultSendToTarget: 'chatgpt',
  sendToCustomTargets: [],
  sendToMaxUrlLength: 3600,
  defaultWebhookBodyTemplate: JSON.stringify({
    vault: 'Obsidian Vault',
    path: 'Clippings/{title}.md',
    content: '{content}'
  }, null, 2),
  webhookTargets: [],
  turndownEscape: true,
  mathAttributesEnabled: true,
  mathAttributeRules: [
    { domain: 'gemini.google.com', attributes: ['data-math'] }
  ],
  hashtagHandling: 'keep',
  contextMenus: true,
  contextMenuItems: DEFAULT_CONTEXT_MENU_ITEMS,
  batchProcessingEnabled: true,
  obsidianIntegration: false,
  obsidianVault: "",
  obsidianFolder: "",
  popupTheme: 'system',
  specialTheme: 'none',
  colorBlindTheme: 'deuteranopia',
  specialThemeIcon: true,
  popupAccent: 'sage',
  compactMode: false,
  elementPickerEnabled: true,
  elementPickerDoneAction: 'popup',
  highlighterEnabled: true,
  alwaysShowHighlights: true,
  highlightClipBehavior: 'inline',
  highlightInlineSyntax: 'html-mark',
  highlightDefaultColor: 'yellow',
  showThemeToggleInPopup: true,
  showUserGuideIcon: true,
  editorTheme: 'default',
  uiLanguage: 'auto',
  siteRules: [],
  interpreterEnabled: false,
  interpreterAutoRun: false,
  interpreterModelId: '',
  defaultPromptContext: '{{content}}',
  interpreterExportWarning: true,
  readerViewEnabled: true,
  readerSettings: {
    fontSize: 16,
    lineHeight: 1.6,
    maxWidth: 38,
    appearance: 'auto',
    fontFamily: '',
    customCss: ''
  },
}

const LEGACY_DEFAULT_FRONTMATTER = "---\ncreated: {date:YYYY-MM-DDTHH:mm:ss} (UTC {date:Z})\ntags: [{keywords}]\nsource: {baseURI}\nauthor: {byline}\n---\n\n# {pageTitle}\n\n> ## Excerpt\n> {excerpt}\n\n---";

function getSiteRulesApi() {
  if (globalThis.markSnipSiteRules) {
    return globalThis.markSnipSiteRules;
  }

  if (typeof require === 'function') {
    try {
      return require('./site-rules');
    } catch {
      return null;
    }
  }

  return null;
}

function getUrlUtilsApi() {
  if (globalThis.markSnipUrlUtils) {
    return globalThis.markSnipUrlUtils;
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

function normalizeContextMenuItems(contextMenuItems) {
  const source = contextMenuItems && Object.prototype.toString.call(contextMenuItems) === '[object Object]'
    ? contextMenuItems
    : {};
  return Object.keys(DEFAULT_CONTEXT_MENU_ITEMS).reduce((normalized, key) => {
    normalized[key] = Object.prototype.hasOwnProperty.call(source, key)
      ? source[key] !== false
      : DEFAULT_CONTEXT_MENU_ITEMS[key] !== false;
    return normalized;
  }, {});
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}

// Attribute names that are safe to use verbatim inside a CSS attribute selector
// (e.g. `[data-math]`). Anything outside this shape is rejected at resolve time
// so a stored rule can never break selector parsing or inject a selector.
const MATH_ATTRIBUTE_NAME_PATTERN = /^[A-Za-z_:][-A-Za-z0-9_:.]*$/;

// Lenient shape coercion used for storage/import: keeps every object row (even
// incomplete ones being edited in the options UI) so the rendered list and the
// stored array never drift apart. Strictness (domain + valid attribute names)
// is applied later by resolveMathAttributeNames at conversion time.
function normalizeMathAttributeRules(rules) {
  if (!Array.isArray(rules)) {
    return [];
  }

  return rules.reduce((normalized, rule) => {
    if (Object.prototype.toString.call(rule) !== '[object Object]') {
      return normalized;
    }

    const domain = String(rule.domain || '').trim().toLowerCase();

    let attributeSource = rule.attributes;
    if (typeof attributeSource === 'string') {
      attributeSource = attributeSource.split(',');
    }
    if (!Array.isArray(attributeSource)) {
      attributeSource = [];
    }

    const seen = new Set();
    const attributes = [];
    attributeSource.forEach((rawName) => {
      const name = String(rawName || '').trim();
      if (!name || seen.has(name)) {
        return;
      }
      seen.add(name);
      attributes.push(name);
    });

    normalized.push({ domain, attributes });
    return normalized;
  }, []);
}

// Returns the attribute names that should be converted to math for a given page
// URL, honoring the on/off switch and the per-domain rules. Fails closed: an
// unparseable/absent URL, a disabled switch, or no matching rule yields [].
function resolveMathAttributeNames(options, url) {
  if (!options || options.mathAttributesEnabled === false) {
    return [];
  }

  const rules = normalizeMathAttributeRules(options.mathAttributeRules);
  if (rules.length === 0) {
    return [];
  }

  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return [];
  }
  if (!host) {
    return [];
  }

  const seen = new Set();
  const names = [];
  rules.forEach((rule) => {
    if (!rule.domain) {
      return;
    }
    const matches = host === rule.domain || host.endsWith(`.${rule.domain}`);
    if (!matches) {
      return;
    }
    rule.attributes.forEach((name) => {
      if (!MATH_ATTRIBUTE_NAME_PATTERN.test(name) || seen.has(name)) {
        return;
      }
      seen.add(name);
      names.push(name);
    });
  });

  return names;
}

function sanitizeReaderCustomCss(customCss) {
  return String(customCss || '')
    .replace(/@import\b[^;]*(?:;|$)/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/url\s*\(\s*(['"]?)\s*javascript:[^)]+?\1\s*\)/gi, 'url(about:blank)')
    .replace(/url\s*\(\s*(['"]?)\s*data:text\/html[^)]+?\1\s*\)/gi, 'url(about:blank)');
}

function normalizeReaderSettings(rawSettings) {
  const defaults = defaultOptions.readerSettings;
  const source = rawSettings && Object.prototype.toString.call(rawSettings) === '[object Object]'
    ? rawSettings
    : {};
  const appearance = ['auto', 'light', 'dark'].includes(source.appearance)
    ? source.appearance
    : defaults.appearance;
  const fontFamily = source.fontFamily === '__serif__' || source.fontFamily === ''
    ? source.fontFamily
    : defaults.fontFamily;

  return {
    fontSize: clampNumber(source.fontSize, 9, 32, defaults.fontSize),
    lineHeight: clampNumber(source.lineHeight, 1.1, 2.4, defaults.lineHeight),
    maxWidth: clampNumber(source.maxWidth, 24, 72, defaults.maxWidth),
    appearance,
    fontFamily,
    customCss: sanitizeReaderCustomCss(source.customCss)
  };
}

// function to get the options from storage and substitute default options if it fails
async function getOptions() {
  let options = { ...defaultOptions };
  try {
    options = await browser.storage.sync.get(defaultOptions);
  } catch (err) {
    console.error(err);
  }
  if (options.frontmatter === LEGACY_DEFAULT_FRONTMATTER) {
    options.frontmatter = defaultOptions.frontmatter;
  }
  const urlUtilsApi = getUrlUtilsApi();
  if (urlUtilsApi?.normalizeImagePlacementMode) {
    options.imagePlacement = urlUtilsApi.normalizeImagePlacementMode(options);
  }
  options.contextMenuItems = normalizeContextMenuItems(options.contextMenuItems);
  options.readerSettings = normalizeReaderSettings(options.readerSettings);
  options.mathAttributeRules = normalizeMathAttributeRules(options.mathAttributeRules);
  const siteRulesApi = getSiteRulesApi();
  if (siteRulesApi?.normalizeSiteRules) {
    options.siteRules = siteRulesApi.normalizeSiteRules(options.siteRules);
  } else if (!Array.isArray(options.siteRules)) {
    options.siteRules = [];
  }
  if (!browser.downloads) options.downloadMode = 'contentLink';
  return options;
}

if (typeof globalThis !== 'undefined') {
  globalThis.defaultOptions = defaultOptions;
  globalThis.normalizeReaderSettings = normalizeReaderSettings;
  globalThis.sanitizeReaderCustomCss = sanitizeReaderCustomCss;
  globalThis.normalizeMathAttributeRules = normalizeMathAttributeRules;
  globalThis.resolveMathAttributeNames = resolveMathAttributeNames;
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    DEFAULT_CONTEXT_MENU_ITEMS,
    defaultOptions,
    LEGACY_DEFAULT_FRONTMATTER,
    getOptions,
    normalizeContextMenuItems,
    normalizeReaderSettings,
    sanitizeReaderCustomCss,
    normalizeMathAttributeRules,
    resolveMathAttributeNames
  };
}
