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

// function to get the options from storage and substitute default options if it fails
async function getOptions() {
  let options = defaultOptions;
  try {
    options = await browser.storage.sync.get(defaultOptions);
  } catch (err) {
    console.error(err);
  }
  if (options.frontmatter === LEGACY_DEFAULT_FRONTMATTER) {
    options.frontmatter = defaultOptions.frontmatter;
  }
  options.contextMenuItems = normalizeContextMenuItems(options.contextMenuItems);
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
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    DEFAULT_CONTEXT_MENU_ITEMS,
    defaultOptions,
    LEGACY_DEFAULT_FRONTMATTER,
    getOptions,
    normalizeContextMenuItems
  };
}
