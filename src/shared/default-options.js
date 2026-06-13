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
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    DEFAULT_CONTEXT_MENU_ITEMS,
    defaultOptions,
    LEGACY_DEFAULT_FRONTMATTER,
    getOptions,
    normalizeContextMenuItems,
    normalizeReaderSettings,
    sanitizeReaderCustomCss
  };
}
