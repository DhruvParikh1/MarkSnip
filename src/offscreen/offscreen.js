// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initOffscreen);

// Listen for messages
browser.runtime.onMessage.addListener(handleMessages);

// Notify service worker that offscreen document is ready
browser.runtime.sendMessage({ type: 'offscreen-ready' });

/**
 * Initialize offscreen document
 */
function initOffscreen() {
  console.log('MarkSnip offscreen document initialized');
  console.log('🔧 Browser downloads API available:', !!browser.downloads);
  console.log('🔧 Chrome downloads API available:', !!(typeof chrome !== 'undefined' && chrome.downloads));
  TurndownService.prototype.defaultEscape = TurndownService.prototype.escape;
}

function getSelectionUtilsApi() {
  return globalThis.markSnipSelectionUtils || null;
}

function getTemplateUtilsApi() {
  return globalThis.markSnipTemplateUtils || null;
}

function getUrlUtilsApi() {
  return globalThis.markSnipUrlUtils || null;
}

function getHashtagUtilsApi() {
  return globalThis.markSnipHashtagUtils || null;
}

function getMarkdownOptionsApi() {
  return globalThis.markSnipMarkdownOptions || null;
}

function getSiteRulesApi() {
  return globalThis.markSnipSiteRules || null;
}

function getCodeBlockUtilsApi() {
  return globalThis.markSnipCodeBlockUtils || null;
}

function cloneRuntimeOptions(source = {}) {
  const nextOptions = {
    ...(source || {})
  };

  if (source?.tableFormatting && typeof source.tableFormatting === 'object') {
    nextOptions.tableFormatting = {
      ...source.tableFormatting
    };
  }

  delete nextOptions.siteRules;
  return nextOptions;
}

function getArticleSiteRuleUrl(article = {}) {
  const candidates = [
    article?.pageURL,
    article?.tabURL,
    article?.pageUrl,
    article?.baseURI
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) {
      return value;
    }
  }

  return '';
}

function resolveOptionsForArticle(article = {}, providedOptions = null) {
  const baseOptions = providedOptions || defaultOptions;
  const pageUrl = getArticleSiteRuleUrl(article);
  const siteRulesApi = getSiteRulesApi();

  if (pageUrl && siteRulesApi?.resolveSiteRuleOptions) {
    return siteRulesApi.resolveSiteRuleOptions(pageUrl, baseOptions);
  }

  return {
    options: cloneRuntimeOptions(baseOptions),
    matchedRule: null,
    overriddenKeys: []
  };
}

function buildDomWithSelection(domString, selectionHtml, shouldUseSelection = true) {
  const sharedApi = getSelectionUtilsApi();
  if (sharedApi?.buildDomWithSelection) {
    return sharedApi.buildDomWithSelection(domString, selectionHtml, shouldUseSelection);
  }

  if (!shouldUseSelection || typeof selectionHtml !== 'string' || !selectionHtml.trim()) {
    return domString;
  }

  try {
    const parser = new DOMParser();
    const dom = parser.parseFromString(domString, 'text/html');
    if (dom.documentElement.nodeName === 'parsererror') {
      return domString;
    }

    if (dom.body) {
      dom.body.innerHTML = selectionHtml;
      return dom.documentElement.outerHTML;
    }
  } catch (error) {
    console.warn('Failed to build selection DOM, falling back to original DOM:', error);
  }

  return domString;
}

/**
 * Handle messages from service worker
 */
function handleMessages(message, sender) {
  // Handle messages that aren't specifically targeted at offscreen
  if (!message.target || message.target !== 'offscreen') {
    if (message.type === 'article-dom-data') {
      return (async () => {
        try {
          const options = message.options || defaultOptions;
          const domForArticle = buildDomWithSelection(message.dom, message.selection, true);
          const article = await getArticleFromDom(domForArticle, options, message.pageUrl);
          
          // Send the article back to service worker
          await browser.runtime.sendMessage({
            type: 'article-result',
            requestId: message.requestId,
            article: article
          });
        } catch (error) {
          console.error('Error processing article DOM:', error);
          await browser.runtime.sendMessage({
            type: 'article-result',
            requestId: message.requestId,
            error: error.message
          });
        }
      })();
    }
    return false; // Not for this context
  }

	  return (async () => {
	    switch (message.type) {
		    case 'process-content':
		      await processContent(message);
		      break;
    case 'process-content-return':
      return await processContentForReturn(message);
    case 'process-element-content':
      return await processElementContent(message);
    case 'download-markdown':
      await downloadMarkdown(
        message.markdown,
        message.title,
        message.tabId,
        message.imageList,
        message.mdClipsFolder,
        message.options,
        message.notificationDelta
      );
      break;
    case 'download-generated-file':
      await downloadGeneratedFileExport(
        message.content,
        message.filename,
        message.tabId,
        message.options,
        message.mimeType,
        message.notificationDelta
      );
      break;
	    case 'process-context-menu':
	      return await processContextMenu(message);
	    case 'copy-to-clipboard':
	      return await copyToClipboard(message.text);
    case 'get-article-content':
      await handleGetArticleContent(message);
      break;
    case 'capture-for-bridge':
      await handleBridgeCapture(message);
      break;
    case 'cleanup-blob-url':
      // Clean up blob URL in offscreen document (has DOM access)
      try {
        URL.revokeObjectURL(message.url);
        console.log('🧹 [Offscreen] Cleaned up blob URL:', message.url);
      } catch (err) {
        console.log('⚠️ [Offscreen] Could not cleanup blob URL:', err.message);
      }
      break;
	    case 'download-batch-zip':
	      await downloadBatchZip(message);
	      break;
	    case 'render-template':
	      return renderClickClipTemplate(message);
	    }

	    return null;
	  })();
}

/**
 * Process HTML content to markdown
 */
async function buildMarkdownResultFromPageContent(data, options = defaultOptions, suppressTemplate = false) {
  const domForArticle = buildDomWithSelection(data.dom, data.selection, !!data.clipSelection);
  const article = await getArticleFromDom(domForArticle, options, data.pageUrl);
  const resolved = resolveOptionsForArticle(article, options);
  const templateOptions = { ...resolved.options };
  const effectiveOptions = suppressTemplate
    ? { ...resolved.options, includeTemplate: false }
    : resolved.options;

  const { markdown, imageList, sourceImageMap } = await convertArticleToMarkdown(article, null, effectiveOptions);

  article.title = await formatTitle(article, effectiveOptions);
  const mdClipsFolder = await formatMdClipsFolder(article, effectiveOptions);

  return {
    markdown,
    article,
    imageList,
    sourceImageMap,
    mdClipsFolder,
    effectiveOptions,
    templateOptions,
    matchedSiteRule: resolved.matchedRule,
    overriddenKeys: resolved.overriddenKeys
  };
}

async function processContent(message) {
  try {
    const { data, requestId, options } = message;
    const result = await buildMarkdownResultFromPageContent(data, options || defaultOptions);

    // Send results back to service worker
    await browser.runtime.sendMessage({
      type: 'markdown-result',
      requestId: requestId,
      result
    });
  } catch (error) {
    console.error('Error processing content:', error);
    // Notify service worker of error
    await browser.runtime.sendMessage({
      type: 'process-error',
      error: error.message
    });
  }
}

async function processContentForReturn(message) {
  try {
    const { data, options } = message;
    const result = await buildMarkdownResultFromPageContent(
      data,
      options || defaultOptions,
      !!message.suppressTemplate
    );
    return { ok: true, result };
  } catch (error) {
    console.error('Error processing content:', error);
    return {
      ok: false,
      error: error.message
    };
  }
}

function buildArticleFromSelectedElement(data = {}, options = defaultOptions) {
  const domString = data.dom || '';
  if (!domString) {
    throw new Error('Missing selected element DOM');
  }

  const parser = new DOMParser();
  const dom = parser.parseFromString(domString, 'text/html');
  if (dom.documentElement.nodeName === 'parsererror' || !dom.body) {
    throw new Error('Unable to parse selected element DOM');
  }

  const selectedTitle = String(
    data.elementTitle ||
    data.documentTitle ||
    'Selected Element'
  ).trim() || 'Selected Element';
  const recoveryApi = getReadabilityRecoveryApi();
  const prepared = prepareDomForReadability(dom, options, recoveryApi);
  prepared.dom.title = selectedTitle;
  const content = prepared.dom.body?.innerHTML || '';
  if (!content.trim()) {
    throw new Error('Selected element did not contain convertible HTML');
  }

  const textContent = normalizeMeaningfulText(prepared.dom.body?.textContent || '');

  const article = {
    title: selectedTitle,
    content,
    textContent,
    length: textContent.length,
    excerpt: textContent.substring(0, 200),
    byline: '',
    dir: prepared.dom.dir || '',
    siteName: '',
    lang: prepared.dom.documentElement?.lang || ''
  };

  const finalizedArticle = finalizeArticleMetadata(
    article,
    prepared.dom,
    data.pageUrl,
    prepared.math,
    recoveryApi,
    options,
    prepared.dom
  );

  finalizedArticle.manualElement = true;
  finalizedArticle.manualElementLabel = data.elementLabel || '';
  return finalizedArticle;
}

async function processElementContent(message) {
  try {
    const { data, options } = message;
    const article = buildArticleFromSelectedElement(data, options || defaultOptions);
    const resolved = resolveOptionsForArticle(article, options || defaultOptions);

    // Preserve the resolved options BEFORE any template suppression. resolveOptionsForArticle
    // re-applies site rules, so a rule can re-enable templates; callers that need to know the
    // true effective template intent (e.g. Click & Clip combined output, which renders one
    // document-level frontmatter) read templateOptions rather than effectiveOptions.
    const templateOptions = { ...resolved.options };
    if (message.suppressTemplate) {
      resolved.options = { ...resolved.options, includeTemplate: false };
    }

    const { markdown, imageList, sourceImageMap } = await convertArticleToMarkdown(article, null, resolved.options);
    article.title = await formatTitle(article, resolved.options);
    const mdClipsFolder = await formatMdClipsFolder(article, resolved.options);

    return {
      ok: true,
      result: {
        markdown,
        article,
        imageList,
        sourceImageMap,
        mdClipsFolder,
        effectiveOptions: resolved.options,
        templateOptions,
        matchedSiteRule: resolved.matchedRule,
        overriddenKeys: resolved.overriddenKeys
      }
    };
  } catch (error) {
    console.error('Error processing selected element:', error);
    return {
      ok: false,
      error: error.message
    };
  }
}

/**
 * Render a single document-level frontmatter/backmatter pair for Click & Clip's
 * combined output. createEffectiveMarkdownOptions already runs textReplace over
 * the templates, so this just surfaces the rendered strings.
 */
function renderClickClipTemplate(message) {
  try {
    const article = message.article || {};
    const options = message.options || defaultOptions;
    const eff = createEffectiveMarkdownOptions(article, options);
    return {
      ok: true,
      frontmatter: eff.frontmatter || '',
      backmatter: eff.backmatter || ''
    };
  } catch (error) {
    console.error('Error rendering Click & Clip template:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Process context menu actions
 */
async function processContextMenu(message) {
  const { action, info, tabId, options, customTitle, collectOnly, notificationDelta } = message;

  try {
    if (action === 'download') {
      await handleContextMenuDownload(info, tabId, options, customTitle, collectOnly, notificationDelta, message.suppressTemplate, message.captureTemplate);
    } else if (action === 'copy') {
      const copied = await handleContextMenuCopy(info, tabId, options);
      return { ok: copied === true, action };
    }

    return { ok: true, action };
  } catch (error) {
    console.error(`Error processing context menu ${action}:`, error);
    return {
      ok: false,
      action,
      error: error.message
    };
  }
}

async function handleBridgeCapture(message) {
  const { requestId, tabId, options } = message || {};

  try {
    const article = await getArticleFromContent(tabId, false, options || defaultOptions);
    if (!article?.content) {
      throw new Error(`Failed to get valid article content from tab ${tabId}`);
    }

    const resolved = resolveOptionsForArticle(article, options || defaultOptions);
    const title = await formatTitle(article, resolved.options);
    const { markdown } = await convertArticleToMarkdown(article, false, resolved.options);
    const pageUrl = String(
      article?.pageURL ||
      article?.tabURL ||
      article?.pageUrl ||
      article?.baseURI ||
      ''
    ).trim();

    await browser.runtime.sendMessage({
      type: 'bridge-capture-result',
      requestId,
      result: {
        markdown,
        title,
        pageUrl,
        capturedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    await browser.runtime.sendMessage({
      type: 'bridge-capture-result',
      requestId,
      error: error.message
    });
  }
}

/**
 * Handle context menu download action
 */
function isLikelyIncompleteMarkdown(markdown) {
  if (!markdown || !markdown.trim()) return true;

  const normalized = markdown.replace(/\r/g, '');
  const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean);
  const headingLines = lines.filter(line => /^#{1,6}\s/.test(line)).length;
  const listLines = lines.filter(line => /^[-*+]\s/.test(line)).length;
  const nonStructuralLines = lines.filter(line => (
    !/^#{1,6}\s/.test(line) &&
    !/^[-*+]\s/.test(line) &&
    !/^\d+\.\s/.test(line) &&
    !/^>\s/.test(line) &&
    !/^!\[/.test(line)
  ));
  const nonStructuralChars = nonStructuralLines.join(' ').replace(/`/g, '').trim().length;
  const hasTocMarker = /\bOn this page\b/i.test(normalized) || /\bTable of contents\b/i.test(normalized);

  return (
    nonStructuralChars < 320 &&
    (headingLines + listLines) >= 4
  ) || (
    hasTocMarker &&
    nonStructuralChars < 500
  );
}

async function handleContextMenuDownload(info, tabId, providedOptions = null, customTitle = null, collectOnly = false, notificationDelta = null, suppressTemplate = false, captureTemplate = false) {
  console.log(`Starting download for tab ${tabId}`);
  try {
    const options = providedOptions || defaultOptions;

    const article = await getArticleFromContent(tabId,
      info.menuItemId === "download-markdown-selection",
      options
    );
    if (!article?.content) {
      throw new Error(`Failed to get valid article content from tab ${tabId}`);
    }

    if (customTitle && customTitle.trim()) {
      article.title = customTitle.trim();
      article.pageTitle = customTitle.trim();
    }

    const resolved = resolveOptionsForArticle(article, options);
    // Capture the resolved (post-site-rule) template intent before suppression
    // so combined batch output can render one document-level template.
    const templateOptions = captureTemplate ? { ...resolved.options } : null;
    if (suppressTemplate) {
      // Combined batch output joins every page into one file, so per-page
      // frontmatter/backmatter would repeat. resolveOptionsForArticle can
      // re-enable templates via site rules, so suppress after it runs.
      resolved.options = { ...resolved.options, includeTemplate: false };
    }
    const effectiveOptions = collectOnly
      ? {
        ...resolved.options,
        downloadImages: false
      }
      : resolved.options;

    console.log(`Got article for tab ${tabId}, processing...`);
    const title = await formatTitle(article, effectiveOptions);
    const { markdown, imageList } = await convertArticleToMarkdown(article, null, effectiveOptions);
    const mdClipsFolder = await formatMdClipsFolder(article, effectiveOptions);
    let fullFilename = mdClipsFolder;
    if (fullFilename && !fullFilename.endsWith('/')) fullFilename += '/';
    fullFilename = (fullFilename || '') + title + '.md';
    const likelyIncomplete = isLikelyIncompleteMarkdown(markdown);

    if (!collectOnly) {
      console.log(`Downloading markdown for tab ${tabId}`);
      await downloadMarkdown(markdown, title, tabId, imageList, mdClipsFolder, effectiveOptions, notificationDelta);
    }
    
    // Signal completion
    await browser.runtime.sendMessage({
      type: 'process-complete',
      tabId: tabId,
      success: true,
      likelyIncomplete: likelyIncomplete,
      markdownLength: markdown.length,
      markdown: collectOnly ? markdown : undefined,
      fullFilename: collectOnly ? fullFilename : undefined,
      templateArticle: captureTemplate ? article : undefined,
      templateOptions: captureTemplate ? templateOptions : undefined
    });
  } catch (error) {
    console.error(`Error processing tab ${tabId}:`, error);
    await browser.runtime.sendMessage({
      type: 'process-complete',
      tabId: tabId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Handle context menu copy action
 */
async function handleContextMenuCopy(info, tabId, providedOptions = null) {
  const platformOS = navigator.platform;
  const folderSeparator = platformOS.indexOf("Win") === 0 ? "\\" : "/";
  const options = providedOptions || defaultOptions;

  if (info.menuItemId === "copy-markdown-link") {
    const article = await getArticleFromContent(tabId, false, options);
    const resolved = resolveOptionsForArticle(article, options);
    const localOptions = { ...resolved.options };
    localOptions.frontmatter = localOptions.backmatter = '';
    const { markdown } = turndown(
      `<a href="${info.linkUrl}">${info.linkText || info.selectionText}</a>`,
      { ...localOptions, downloadImages: false },
      article
    );
    return await copyToClipboard(markdown);
  }
  else if (info.menuItemId === "copy-markdown-image") {
    return await copyToClipboard(`![](${info.srcUrl})`);
  }
  else if (info.menuItemId === "copy-markdown-obsidian") {
    const article = await getArticleFromContent(tabId, true, options);
    const resolved = resolveOptionsForArticle(article, options);
    const title = article.title;
    const obsidianVault = resolved.options.obsidianVault;
    const obsidianFolder = await formatObsidianFolder(article, resolved.options);
    const obsidianOptions = markSnipObsidian.getObsidianTransportOptions(resolved.options);
    const { markdown } = await convertArticleToMarkdown(article, null, obsidianOptions);

    console.log('[Offscreen] Sending markdown to service worker for Obsidian integration...');
    // Offscreen document can't access clipboard, send to service worker to handle
    await browser.runtime.sendMessage({
      type: 'obsidian-integration',
      markdown: markdown,
      tabId: tabId,
      vault: obsidianVault,
      folder: obsidianFolder,
      title: generateValidFileName(title, resolved.options.disallowedChars, resolved.options.disallowedCharReplacement)
    });
    return true;
  }
  else if (info.menuItemId === "copy-markdown-obsall") {
    const article = await getArticleFromContent(tabId, false, options);
    const resolved = resolveOptionsForArticle(article, options);
    const title = article.title;
    const obsidianVault = resolved.options.obsidianVault;
    const obsidianFolder = await formatObsidianFolder(article, resolved.options);
    const obsidianOptions = markSnipObsidian.getObsidianTransportOptions(resolved.options);
    const { markdown } = await convertArticleToMarkdown(article, null, obsidianOptions);

    console.log('[Offscreen] Sending markdown to service worker for Obsidian integration...');
    // Offscreen document can't access clipboard, send to service worker to handle
    await browser.runtime.sendMessage({
      type: 'obsidian-integration',
      markdown: markdown,
      tabId: tabId,
      vault: obsidianVault,
      folder: obsidianFolder,
      title: generateValidFileName(title, resolved.options.disallowedChars, resolved.options.disallowedCharReplacement)
    });
    return true;
  }
  else {
    const article = await getArticleFromContent(tabId, info.menuItemId === "copy-markdown-selection", options);
    const resolved = resolveOptionsForArticle(article, options);
    const { markdown } = await convertArticleToMarkdown(article, false, resolved.options);
    return await copyToClipboard(markdown);
  }
}


/**
 * Copy text to clipboard
 */
async function copyToClipboard(text) {
  // Try modern Clipboard API first (but it usually fails in offscreen documents)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      console.log('✅ [Offscreen] Successfully copied to clipboard using Clipboard API:', text.substring(0, 100) + '...');
      return true;
    } catch (clipboardError) {
      console.log('⚠️ [Offscreen] Clipboard API failed (document not focused), falling back to execCommand:', clipboardError.message);
      // Fall through to execCommand method
    }
  }

  // Fallback to execCommand method (works in offscreen documents)
  try {
    const textArea = document.getElementById('clipboard-text');
    if (!textArea) {
      console.error('❌ [Offscreen] Clipboard textarea not found');
      return false;
    }

    textArea.value = text;
    textArea.focus();
    textArea.select();

    // Try to copy using execCommand
    const success = document.execCommand('copy');

    if (success) {
      console.log('✅ [Offscreen] Successfully copied to clipboard using execCommand:', text.substring(0, 100) + '...');
      return true;
    } else {
      console.error('❌ [Offscreen] Failed to copy to clipboard using execCommand');
      return false;
    }
  } catch (error) {
    console.error('❌ [Offscreen] Error in execCommand fallback:', error);
    return false;
  }
}

function createEffectiveMarkdownOptions(article, providedOptions = null, downloadImages = null) {
  const sharedApi = getMarkdownOptionsApi();
  if (sharedApi?.createEffectiveMarkdownOptions) {
    return sharedApi.createEffectiveMarkdownOptions(article, providedOptions, downloadImages);
  }

  const baseOptions = providedOptions || defaultOptions;
  const options = {
    ...baseOptions,
    tableFormatting: baseOptions.tableFormatting
      ? { ...baseOptions.tableFormatting }
      : baseOptions.tableFormatting
  };

  if (downloadImages != null) {
    options.downloadImages = downloadImages;
  }

  if (options.includeTemplate) {
    options.frontmatter = textReplace(options.frontmatter, article) + '\n';
    options.backmatter = '\n' + textReplace(options.backmatter, article);
  } else {
    options.frontmatter = '';
    options.backmatter = '';
  }

  options.imagePrefix = textReplace(options.imagePrefix, article, options.disallowedChars, options.disallowedCharReplacement)
    .split('/').map(s => generateValidFileName(s, options.disallowedChars, options.disallowedCharReplacement)).join('/');

  return options;
}

/**
 * Convert article to markdown with options provided
 */
async function convertArticleToMarkdown(article, downloadImages = null, providedOptions = null) {
  const options = createEffectiveMarkdownOptions(article, providedOptions, downloadImages);

  let result = turndown(article.content, options, article);
  let sourceImageMap = markSnipObsidian.createObsidianSourceImageMap(result.imageList);
  if (options.downloadImages && options.downloadMode === 'downloadsApi') {
    // Pre-download the images
    result = await preDownloadImages(result.imageList, result.markdown, options);
    sourceImageMap = result.sourceImageMap;
  }
  return {
    ...result,
    sourceImageMap
  };
}

function processCodeBlock(node, options) {
  const shouldAutoDetectLanguage = options.autoDetectCodeLanguage !== false;
  const sharedApi = getCodeBlockUtilsApi();

  // If preserveCodeFormatting is enabled, return original HTML content
  if (options.preserveCodeFormatting) {
    return {
      code: sharedApi?.extractCodeText
        ? sharedApi.extractCodeText(node, options)
        : node.innerHTML,
      language: getCodeLanguage(node)
    };
  }

  // Get the raw text content
  let code;
  if (sharedApi?.extractCodeText) {
    code = sharedApi.extractCodeText(node, options).trim();
  } else {
    const clonedNode = node.cloneNode(true);
    clonedNode.querySelectorAll('br-keep, br').forEach(br => {
      br.replaceWith('\n');
    });
    code = clonedNode.textContent.trim();
  }
  
  // Detect language
  let language = getCodeLanguage(node);
  
  // If no language detected and auto-detection is needed
  if (
    !language &&
    shouldAutoDetectLanguage &&
    typeof hljs !== 'undefined' &&
    typeof hljs.highlightAuto === 'function'
  ) {
    try {
      const result = hljs.highlightAuto(code);
      language = result.language || '';
    } catch (e) {
      console.warn('Language detection failed:', e);
    }
  }
  
  return {
    code: code,
    language: language
  };
}

function getCodeLanguage(node) {
  // Check for explicit language class
  const languageMatch = node.className.match(/language-(\w+)/);
  if (languageMatch) {
    return languageMatch[1];
  }
  
  // Check for highlight.js classes
  const hljsMatch = node.className.match(/hljs\s+(\w+)/);
  if (hljsMatch) {
    return hljsMatch[1];
  }
  
  return '';
}

const hashtagEscapeSentinel = '\uE000';

function normalizeHashtagHandlingMode(mode) {
  const sharedApi = getHashtagUtilsApi();
  if (sharedApi?.normalizeHashtagHandlingMode) {
    return sharedApi.normalizeHashtagHandlingMode(mode);
  }

  if (mode === 'remove' || mode === 'escape' || mode === 'keep') {
    return mode;
  }
  return 'keep';
}

function replaceHashtagTokensInText(text, mode) {
  if (!text) return text;

  // Matches hashtag-like tokens in prose while skipping markdown escapes and URL fragments.
  const hashtagTokenRegex = /(^|[^\p{L}\p{N}_\\/])#([\p{L}\p{N}_][\p{L}\p{N}_-]*)/gu;
  return text.replace(hashtagTokenRegex, (match, prefix, tag) => {
    if (mode === 'remove') {
      return `${prefix}${tag}`;
    }
    if (mode === 'escape') {
      return `${prefix}${hashtagEscapeSentinel}${tag}`;
    }
    return match;
  });
}

function applyHashtagHandlingToHtml(content, mode) {
  const sharedApi = getHashtagUtilsApi();
  if (sharedApi?.applyHashtagHandlingToHtml) {
    return sharedApi.applyHashtagHandlingToHtml(content, mode);
  }

  const normalizedMode = normalizeHashtagHandlingMode(mode);
  if (normalizedMode === 'keep' || !content) {
    return content;
  }

  const container = document.createElement('div');
  container.innerHTML = content;
  const excludedParents = new Set(['CODE', 'PRE', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA']);
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);

  let node = walker.nextNode();
  while (node) {
    const parentTag = node.parentElement?.tagName;
    if (!excludedParents.has(parentTag)) {
      node.nodeValue = replaceHashtagTokensInText(node.nodeValue, normalizedMode);
    }
    node = walker.nextNode();
  }

  return container.innerHTML;
}

function applyHashtagHandlingToMarkdown(markdown, mode) {
  const sharedApi = getHashtagUtilsApi();
  if (sharedApi?.applyHashtagHandlingToMarkdown) {
    return sharedApi.applyHashtagHandlingToMarkdown(markdown, mode);
  }

  if (!markdown) return markdown;
  const normalizedMode = normalizeHashtagHandlingMode(mode);
  if (normalizedMode !== 'escape') return markdown;
  return markdown.replaceAll(hashtagEscapeSentinel, '\\#');
}

/**
 * Turndown HTML to Markdown conversion
 */
function turndown(content, options, article) {
  console.log("Starting turndown with options:", options.tableFormatting); // Debug log
  const uriBase = article.uriBase || article.baseURI;

  if (options.turndownEscape) TurndownService.prototype.escape = TurndownService.prototype.defaultEscape;
  else TurndownService.prototype.escape = s => s;

  var turndownService = new TurndownService(options);

  // Add only non-table GFM features
  turndownService.use([
    turndownPluginGfm.highlightedCodeBlock,
    turndownPluginGfm.strikethrough,
    turndownPluginGfm.taskListItems
  ]);

  // Add rule to convert <mark> tags to inline code
  turndownService.addRule('mark', {
    filter: ['mark'],
    replacement: function(content) {
      return '`' + content + '`';
    }
  });

  // Add rule to prevent wrapping headings in links
  turndownService.addRule('headingLinks', {
    filter: function(node) {
      // Check if this is a link containing a heading
      if (node.nodeName === 'A') {
        const hasHeading = Array.from(node.children).some(child =>
          /^H[1-6]$/.test(child.nodeName)
        );
        return hasHeading;
      }
      return false;
    },
    replacement: function(content) {
      // Just return the content (the heading) without link syntax
      return content;
    }
  });

  // Add our custom table rule
  turndownService.addRule('table', {
    filter: 'table',
    replacement: function(content, node) {
      try {
        // Create a mini-turndown instance for cell content processing
        const cellTurndownService = new TurndownService({
          ...options,
          headingStyle: options.headingStyle,
          hr: options.hr,
          bulletListMarker: options.bulletListMarker,
          codeBlockStyle: options.codeBlockStyle,
          fence: options.fence,
          emDelimiter: options.emDelimiter,
          strongDelimiter: options.strongDelimiter,
          linkStyle: options.tableFormatting?.stripLinks ? 'stripLinks' : options.linkStyle,
          linkReferenceStyle: options.linkReferenceStyle,
          // Reset frontmatter/backmatter to avoid duplication
          frontmatter: '',
          backmatter: ''
        });

        // Disable escaping in table cells to prevent underscore escaping
        cellTurndownService.escape = function(text) {
          return text;
        };

        // Apply necessary plugins
        cellTurndownService.use([
          turndownPluginGfm.strikethrough,
          turndownPluginGfm.taskListItems
        ]);

        // Handle <br> tags in table cells - convert to <br> HTML (Markdown tables support this)
        cellTurndownService.addRule('tableBr', {
          filter: 'br',
          replacement: function() {
            return '<br>';
          }
        });
        
        // Add custom rules for images, links, etc. to the cell turndown instance
        if (options.imageStyle === 'noImage') {
          cellTurndownService.addRule('images', {
            filter: (node) => node.nodeName === 'IMG',
            replacement: () => ''
          });
        }

        if (options.tableFormatting?.stripLinks) {
          cellTurndownService.addRule('links', {
            filter: (node, tdopts) => {
              return node.nodeName === 'A' && node.getAttribute('href');
            },
            replacement: (content, node, tdopts) => {
              return content;
            }
          });
        }
        
        // Process table structure
        const thead = node.querySelector('thead');
        const tbody = node.querySelector('tbody');
        const headerRow = thead?.querySelector('tr');
        const rows = headerRow ? 
          [headerRow, ...(tbody ? Array.from(tbody.children) : [])] :
          (tbody ? Array.from(tbody.children) : Array.from(node.querySelectorAll('tr')));
        
        let tableMatrix = Array.from({ length: rows.length }, () => []);
        let columnWidths = [];
        
        // Process each row
        rows.forEach((row, rowIndex) => {
          Array.from(row.children).forEach(cell => {
            // Process cell content using the cell-specific turndown service
            let processedContent = '';
            
            // Create a container for the cell content
            const cellContainer = document.createElement('div');
            cellContainer.innerHTML = cell.innerHTML;
            
            // Apply formatting stripping if configured
            if (options.tableFormatting?.stripFormatting) {
              // Replace formatting elements with their text content
              ['b', 'strong', 'i', 'em', 'u', 'mark', 'sub', 'sup'].forEach(tag => {
                const elements = cellContainer.getElementsByTagName(tag);
                // We need to convert to array because the collection changes as we modify
                Array.from(elements).forEach(el => {
                  el.replaceWith(document.createTextNode(el.textContent.trim()));
                });
              });
            }
            
            // Process the cell content through turndown
            processedContent = cellTurndownService.turndown(cellContainer.innerHTML);
            
            // Handle rowspan and colspan (keeping original behavior)
            const colspan = parseInt(cell.getAttribute('colspan')) || 1;
            const rowspan = parseInt(cell.getAttribute('rowspan')) || 1;
            
            // Add content to the matrix - keep existing behavior for rowspan/colspan
            for (let i = 0; i < rowspan; i++) {
              for (let j = 0; j < colspan; j++) {
                const targetRow = rowIndex + i;
                if (!tableMatrix[targetRow]) {
                  tableMatrix[targetRow] = [];
                }
                const targetCol = tableMatrix[targetRow].length;
                
                // Use the same content for all spanned cells (original behavior)
                tableMatrix[targetRow][targetCol] = processedContent;
                
                // Calculate column width based on visible content
                const simplifiedContent = processedContent
                  .replace(/\n/g, ' ')
                  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // Links
                  .replace(/[*_~`]+(.*?)[*_~`]+/g, '$1');    // Formatting
                
                const visibleLength = simplifiedContent.length;
                
                if (!columnWidths[targetCol] || visibleLength > columnWidths[targetCol]) {
                  columnWidths[targetCol] = visibleLength;
                }
              }
            }
          });
        });
        
        // Build markdown table
        let markdown = '\n\n';
        
        // Format cells with proper alignment and spacing
        const formatCell = (content, columnIndex) => {
          // Ensure content is a string
          const safeContent = content || '';
          
          if (!options.tableFormatting?.prettyPrint) {
            return ` ${safeContent} `;
          }
          
          // Ensure columnIndex is valid
          if (columnIndex === undefined || !Array.isArray(columnWidths) || columnIndex >= columnWidths.length) {
            return ` ${safeContent} `;
          }
          
          // For multi-line content, preserve structure but don't pad
          if (safeContent.includes('\n')) {
            return ` ${safeContent} `;
          }
          
          // Calculate visible length for centering - account for markdown syntax
          const visibleText = safeContent
            .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // Links
            .replace(/[*_~`]+(.*?)[*_~`]+/g, '$1');    // Formatting
          const visibleLength = visibleText.length;
          
          const width = columnWidths[columnIndex] || 0;
          const totalWidth = width + 2; // Add 2 for standard padding
          
          if (!options.tableFormatting?.centerText) {
            return ` ${safeContent}${' '.repeat(Math.max(0, totalWidth - visibleLength - 1))}`;
          }
          
          // Center content
          const leftSpace = ' '.repeat(Math.floor(Math.max(0, totalWidth - visibleLength) / 2));
          const rightSpace = ' '.repeat(Math.ceil(Math.max(0, totalWidth - visibleLength) / 2));
          return leftSpace + safeContent + rightSpace;
        };
        
        // Build header row and separator
        if (tableMatrix.length > 0 && tableMatrix[0] && Array.isArray(tableMatrix[0])) {
          const headerContent = tableMatrix[0].map((cell, i) => formatCell(cell, i)).join('|');
          markdown += '|' + headerContent + '|\n';
          
          // Build separator with proper column widths
          const separator = columnWidths.map(width => {
            const minWidth = Math.max(3, width);
            return '-'.repeat(minWidth + 2); // +2 for padding
          }).join('|');
          
          markdown += '|' + separator + '|\n';
          
          // Build data rows
          for (let i = 1; i < tableMatrix.length; i++) {
            if (tableMatrix[i] && Array.isArray(tableMatrix[i])) {
              const row = tableMatrix[i].map((cell, j) => formatCell(cell, j)).join('|');
              markdown += '|' + row + '|\n';
            }
          }
        } else {
          // Fallback for tables with no rows or invalid structure
          markdown += '| No data available |\n|-|\n';
        }
        
        return markdown;
      } catch (error) {
        console.error('Error in table conversion:', error);
        return content;
      }
    }
  });

  turndownService.keep(['iframe', 'sub', 'sup', 'u', 'ins', 'del', 'small', 'big']);

  let imageList = {};
  // add an image rule
  turndownService.addRule('images', {
    filter: function (node, tdopts) {
      // if we're looking at an img node with a src
      if (node.nodeName == 'IMG' && node.getAttribute('src')) {
        
        // get the original src
        let src = node.getAttribute('src')
        const resolvedSrc = validateUri(src, uriBase);
        // set the new src
        node.setAttribute('src', resolvedSrc);
        
        // if we're downloading images, there's more to do.
        if (options.downloadImages) {
          // generate a file name for the image
          let imageFilename = getImageFilename(resolvedSrc, options, false);
          if (!imageList[resolvedSrc] || imageList[resolvedSrc] != imageFilename) {
            // if the imageList already contains this file, add a number to differentiate
            let i = 1;
            while (Object.values(imageList).includes(imageFilename)) {
              const parts = imageFilename.split('.');
              if (i == 1) parts.splice(parts.length - 1, 0, i++);
              else parts.splice(parts.length - 2, 1, i++);
              imageFilename = parts.join('.');
            }
            // add it to the list of images to download later
            imageList[resolvedSrc] = imageFilename;
          }
          // check if we're doing an obsidian style link
          const obsidianLink = options.imageStyle.startsWith("obsidian");
          // figure out the (local) src of the image
          const localSrc = options.imageStyle === 'obsidian-nofolder'
            // if using "nofolder" then we just need the filename, no folder
            ? imageFilename.substring(imageFilename.lastIndexOf('/') + 1)
            // otherwise we may need to modify the filename to uri encode parts for a pure markdown link
            : imageFilename.split('/').map(s => obsidianLink ? s : encodeURI(s)).join('/')
          
          // set the new src attribute to be the local filename
          if(options.imageStyle != 'originalSource' && options.imageStyle != 'base64') node.setAttribute('src', localSrc);
          // pass the filter if we're making an obsidian link (or stripping links)
          return true;
        }
        else return true
      }
      // don't pass the filter, just output a normal markdown link
      return false;
    },
    replacement: function (content, node, tdopts) {
      // if we're stripping images, output nothing
      if (options.imageStyle == 'noImage') return '';
      // if this is an obsidian link, so output that
      else if (options.imageStyle.startsWith('obsidian')) return `![[${node.getAttribute('src')}]]`;
      // otherwise, output the normal markdown link
      else {
        var alt = cleanAttribute(node.getAttribute('alt'));
        var src = node.getAttribute('src') || '';
        var title = cleanAttribute(node.getAttribute('title'));
        var titlePart = title ? ' "' + title + '"' : '';
        if (options.imageRefStyle == 'referenced') {
          var id = this.references.length + 1;
          this.references.push('[fig' + id + ']: ' + src + titlePart);
          return '![' + alt + '][fig' + id + ']';
        }
        else return src ? '![' + alt + ']' + '(' + src + titlePart + ')' : ''
      }
    },
    references: [],
    append: function (options) {
      var references = '';
      if (this.references.length) {
        references = '\n\n' + this.references.join('\n') + '\n\n';
        this.references = []; // Reset references
      }
      return references
    }

  });

  // Utility function to check if an element is inside a table
  function isInsideTable(node) {
    let parent = node.parentNode;
    while (parent) {
      if (parent.nodeName === 'TABLE') {
        return true;
      }
      parent = parent.parentNode;
    }
    return false;
  }

  // add a rule for links
  turndownService.addRule('links', {
    filter: (node, tdopts) => {
      // Only process links if linkStyle is NOT 'referenced'
      // This allows the built-in referenceLink rule to handle referenced links
      return node.nodeName == 'A' && 
            node.getAttribute('href') && 
            tdopts.linkStyle !== 'referenced'
    },
    replacement: (content, node, tdopts) => {
      // get the href
      const href = validateUri(node.getAttribute('href'), uriBase);
      
      // If we're in a table AND strip links is enabled, OR if linkStyle is set to stripLinks
      // just return the text content without the link
      if ((isInsideTable(node) && options.tableFormatting?.stripLinks === true) || 
          options.linkStyle === "stripLinks") {
        return content;
      }
      
      // Otherwise, convert to proper markdown link format
      const title = cleanAttribute(node.getAttribute('title'));
      const titlePart = title ? ` "${title}"` : '';
      return `[${content}](${href}${titlePart})`
    }
  });

  // handle multiple lines math
  turndownService.addRule('mathjax', {
    filter(node, options) {
      return article.math?.hasOwnProperty(node.id) || String(node.nodeName).toLowerCase() === 'math';
    },
    replacement(content, node, options) {
      const math = article.math?.[node.id] || extractMathMLInfoFromNode(node);
      if (!math?.tex) {
        return content;
      }

      let tex = math.tex.trim().replaceAll('\xa0', '');

      if (math.inline) {
        tex = tex.replaceAll('\n', ' ');
        return `$${tex}$`;
      }
      else
        return `$$\n${tex}\n$$`;
    }
  });

  function repeat(character, count) {
    return Array(count + 1).join(character);
  }

  function convertToFencedCodeBlock(node, options) {
    const sharedApi = getCodeBlockUtilsApi();
    if (sharedApi?.convertToFencedCodeBlock) {
      return sharedApi.convertToFencedCodeBlock(node, options);
    }

    function normalizeCodeBlockSpacing(text, maxBlankLines = 2) {
      const lines = text.split('\n');
      const normalizedLines = [];
      let blankLineCount = 0;

      lines.forEach(line => {
        if (/^[ \t]*$/.test(line)) {
          blankLineCount += 1;
          if (blankLineCount <= maxBlankLines) {
            normalizedLines.push('');
          }
        } else {
          blankLineCount = 0;
          normalizedLines.push(line);
        }
      });

      return normalizedLines.join('\n');
    }

    function detectPreLanguage(node, code) {
      const shouldAutoDetectLanguage = options.autoDetectCodeLanguage !== false;
      const idMatch = node.id?.match(/code-lang-(.+)/);
      if (idMatch?.length > 1) {
        return idMatch[1];
      }

      const classTokens = (node.className || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      const candidates = new Set();

      classTokens.forEach(token => {
        candidates.add(token);
        if (token.startsWith('language-')) candidates.add(token.substring(9));
        if (token.startsWith('lang-')) candidates.add(token.substring(5));
        if (token.startsWith('source-')) candidates.add(token.substring(7));
        if (token.startsWith('highlight-')) candidates.add(token.substring(10));
      });

      if (typeof hljs !== 'undefined' && typeof hljs.getLanguage === 'function') {
        for (const candidate of candidates) {
          if (candidate && hljs.getLanguage(candidate)) {
            return candidate;
          }
        }
      }

      if (
        shouldAutoDetectLanguage &&
        typeof hljs !== 'undefined' &&
        typeof hljs.highlightAuto === 'function' &&
        code.trim()
      ) {
        try {
          const detected = hljs.highlightAuto(code);
          if (
            detected?.language &&
            typeof detected.relevance === 'number' &&
            detected.relevance >= 2
          ) {
            return detected.language;
          }
        } catch (e) {
          console.warn('Language detection failed for <pre> block:', e);
        }
      }

      return '';
    }

    let code;

    if (options.preserveCodeFormatting) {
      code = node.innerHTML.replaceAll('<br-keep></br-keep>', '<br>');
    } else {
      const clonedNode = node.cloneNode(true);
      clonedNode.querySelectorAll('br-keep, br').forEach(br => {
        br.replaceWith('\n');
      });
      code = clonedNode.textContent || '';
      code = normalizeCodeBlockSpacing(code, 2);
    }
    const language = detectPreLanguage(node, code);

    var fenceChar = options.fence.charAt(0);
    var fenceSize = 3;
    var fenceInCodeRegex = new RegExp('^' + fenceChar + '{3,}', 'gm');

    var match;
    while ((match = fenceInCodeRegex.exec(code))) {
      if (match[0].length >= fenceSize) {
        fenceSize = match[0].length + 1;
      }
    }

    var fence = repeat(fenceChar, fenceSize);

    return (
      '\n\n' + fence + language + '\n' +
      code.replace(/\n$/, '') +
      '\n' + fence + '\n\n'
    )
  }

  turndownService.addRule('fencedCodeBlock', {
    filter: function (node, options) {
      return (
        options.codeBlockStyle === 'fenced' &&
        node.nodeName === 'PRE' &&
        node.firstChild &&
        node.firstChild.nodeName === 'CODE'
      )
    },
    replacement: function (content, node, options) {
      const codeNode = node.firstChild;
      const processedCode = processCodeBlock(codeNode, options);
      
      const fenceChar = options.fence.charAt(0);
      const fenceSize = 3;
      const fence = repeat(fenceChar, fenceSize);
      
      return (
        '\n\n' + 
        fence + 
        processedCode.language + 
        '\n' + 
        processedCode.code +
        '\n' + 
        fence + 
        '\n\n'
      )
    }
  });

  // handle <pre> as code blocks
  turndownService.addRule('pre', {
    filter: (node, tdopts) => node.nodeName == 'PRE' && (!node.firstChild || node.firstChild.nodeName != 'CODE'),
    replacement: (content, node, tdopts) => {
      return convertToFencedCodeBlock(node, tdopts);
    }
  });

  const hashtagMode = normalizeHashtagHandlingMode(options.hashtagHandling);
  const normalizedContent = applyHashtagHandlingToHtml(content, hashtagMode);
  let bodyMarkdown = turndownService.turndown(normalizedContent);
  bodyMarkdown = applyHashtagHandlingToMarkdown(bodyMarkdown, hashtagMode);

  let markdown = options.frontmatter + bodyMarkdown + options.backmatter;

  // strip out non-printing special characters which CodeMirror displays as a red dot
  // see: https://codemirror.net/doc/manual.html#option_specialChars
  markdown = markdown.replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028\u2029\ufeff\ufff9-\ufffc]/g, '');
  
  return { markdown: markdown, imageList: imageList };
}

/**
* Get article from DOM string
*/
function safeParseUrl(urlString) {
  const sharedApi = getUrlUtilsApi();
  if (sharedApi?.safeParseUrl) {
    return sharedApi.safeParseUrl(urlString);
  }

  try {
    return new URL(urlString);
  } catch {
    return null;
  }
}

function resolveArticleUrl(domBaseUri, pageUrl) {
  const sharedApi = getUrlUtilsApi();
  if (sharedApi?.resolveArticleUrl) {
    return sharedApi.resolveArticleUrl(domBaseUri, pageUrl);
  }

  const normalizedPageUrl = typeof pageUrl === 'string' ? pageUrl.trim() : '';
  const preferredUrl = normalizedPageUrl ? safeParseUrl(normalizedPageUrl) : null;
  if (preferredUrl) {
    return preferredUrl;
  }
  return safeParseUrl(domBaseUri);
}

function getReadabilityRecoveryApi() {
  return globalThis.MarkSnipReadabilityRecovery || {
    anchorAttribute: 'data-marksnip-node-id',
    annotateStructuralAnchors: () => 0,
    analyzeNarrowExtraction: () => null,
    applyRepeatedSectionPromotion: () => ({ changed: false, promotedIds: [] }),
    buildRepeatedSectionFragment: () => null,
    stripStructuralAnchorsFromHtml: html => html
  };
}

function normalizeMeaningfulText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function parseArticleHtmlFragment(articleHtml) {
  const parser = new DOMParser();
  return parser.parseFromString(`<!DOCTYPE html><html><body>${articleHtml || ''}</body></html>`, 'text/html');
}

function meaningfulTextLengthFromArticleHtml(articleHtml) {
  const documentFragment = parseArticleHtmlFragment(articleHtml);
  return normalizeMeaningfulText(documentFragment.body.textContent).length;
}

function linkDensityFromArticleHtml(articleHtml) {
  const documentFragment = parseArticleHtmlFragment(articleHtml);
  const textLength = meaningfulTextLengthFromArticleHtml(articleHtml);
  if (!textLength) {
    return 0;
  }

  let linkTextLength = 0;
  documentFragment.body.querySelectorAll('a').forEach(anchor => {
    linkTextLength += normalizeMeaningfulText(anchor.textContent).length;
  });
  return linkTextLength / textLength;
}

function articleHtmlContainsAnyWitness(articleHtml, witnessIds, anchorAttribute) {
  if (!witnessIds?.length) {
    return false;
  }

  const documentFragment = parseArticleHtmlFragment(articleHtml);
  return witnessIds.some(witnessId => (
    !!documentFragment.body.querySelector(`[${anchorAttribute}="${witnessId}"]`)
  ));
}

function buildRecoveredArticle(firstPassArticle, recoveredHtml) {
  const textContent = normalizeMeaningfulText(parseArticleHtmlFragment(recoveredHtml).body.textContent);
  const excerpt = textContent.substring(0, 200);

  return {
    ...firstPassArticle,
    content: recoveredHtml,
    textContent,
    length: textContent.length,
    excerpt
  };
}

function getMathMLApi() {
  return typeof MarkSnipMathML !== 'undefined' ? MarkSnipMathML : null;
}

function extractMathMLInfoFromNode(mathNode) {
  const mathMLApi = getMathMLApi();
  if (!mathNode || !mathMLApi?.mathmlToTex) {
    return null;
  }

  const tex = mathMLApi.mathmlToTex(mathNode);
  if (!tex) {
    return null;
  }

  return {
    tex,
    inline: !mathMLApi.isDisplayMath?.(mathNode)
  };
}

function extractMathMLInfoFromString(mathMLSource) {
  if (!mathMLSource?.trim()) {
    return null;
  }

  const findMathElement = documentNode => (
    documentNode.querySelector('math') ||
    documentNode.getElementsByTagName('math')?.[0] ||
    documentNode.getElementsByTagNameNS?.('*', 'math')?.[0] ||
    null
  );

  const parser = new DOMParser();
  const parsed = parser.parseFromString(mathMLSource, "application/xml");
  const mathNode = findMathElement(parsed);
  const hasParserError = !!parsed.querySelector('parsererror');
  if (mathNode && !hasParserError) {
    return extractMathMLInfoFromNode(mathNode);
  }

  const htmlParsed = parser.parseFromString(mathMLSource, "text/html");
  return extractMathMLInfoFromNode(findMathElement(htmlParsed));
}

function isMathMLSourceType(type) {
  return /(?:^|[/+])mml\b|mathml/i.test(String(type || ''));
}

function prepareDomForReadability(dom, options, recoveryApi) {
  // Now options is defined
  if (!options.preserveCodeFormatting) {
    dom.querySelectorAll('pre code').forEach(codeBlock => {
      const processed = processCodeBlock(codeBlock, options);
      // Replace content with clean version
      codeBlock.textContent = processed.code;
      // Add language class if detected
      if (processed.language) {
        codeBlock.className = `language-${processed.language}`;
      }
    });
  }

  if (dom.documentElement.nodeName == "parsererror") {
    console.error("Error while parsing DOM");
  }

  const math = {};

  const storeMathInfo = (el, mathInfo) => {
    let randomId = URL.createObjectURL(new Blob([]));
    randomId = randomId.substring(randomId.length - 36);
    el.id = randomId;
    math[randomId] = mathInfo;
  };

  const extractKaTeXTex = (kaTeXNode) => {
    const annotationNode = kaTeXNode.querySelector('annotation');
    if (annotationNode?.textContent?.trim()) {
      return annotationNode.textContent.trim();
    }

    const mathNode = kaTeXNode.querySelector('math');
    const altText = mathNode?.getAttribute('alttext') || mathNode?.getAttribute('aria-label');
    if (altText?.trim()) {
      return altText.trim();
    }

    const fallbackText = kaTeXNode.textContent?.trim();
    if (!fallbackText) {
      return null;
    }

    // Some KaTeX variants append the original TeX as the final non-empty line.
    const lines = fallbackText.split('\n').map(line => line.trim()).filter(Boolean);
    return lines.length ? lines[lines.length - 1] : fallbackText;
  };

  // Process MathJax elements (same as original)
  dom.body.querySelectorAll('script[id^=MathJax-Element-]')?.forEach(mathSource => {
    const type = mathSource.getAttribute('type') || '';
    const mathMLInfo = isMathMLSourceType(type)
      ? extractMathMLInfoFromString(mathSource.innerText)
      : null;
    storeMathInfo(mathSource, {
      tex: mathMLInfo?.tex || mathSource.innerText,
      inline: mathMLInfo?.inline ?? (type ? !type.includes('mode=display') : false)
    });
  });

  // Process MathJax 3 elements
  dom.body.querySelectorAll('[marksnip-latex]')?.forEach(mathJax3Node => {
    // Same implementation as original
    const tex = mathJax3Node.getAttribute('marksnip-latex');
    const display = mathJax3Node.getAttribute('display');
    const inline = !(display && display === 'true');

    const mathNode = dom.createElement(inline ? "i" : "p");
    mathNode.textContent = tex;
    mathJax3Node.parentNode.insertBefore(mathNode, mathJax3Node.nextSibling);
    mathJax3Node.parentNode.removeChild(mathJax3Node);

    storeMathInfo(mathNode, {
      tex: tex,
      inline: inline
    });
  });

  // Process KaTeX elements
  dom.body.querySelectorAll('.katex-mathml')?.forEach(kaTeXNode => {
    const tex = extractKaTeXTex(kaTeXNode);
    if (!tex) {
      return;
    }

    storeMathInfo(kaTeXNode, {
      tex: tex,
      inline: true
    });
  });

  // Process native MathML, including MathJax assistive MathML and pages that
  // publish MathML directly instead of source TeX.
  dom.body.querySelectorAll('math')?.forEach(mathNode => {
    if (mathNode.closest('.katex-mathml') || mathNode.closest('[marksnip-latex]')) {
      return;
    }

    const mathInfo = extractMathMLInfoFromNode(mathNode);
    if (!mathInfo) {
      return;
    }

    storeMathInfo(mathNode, mathInfo);
  });

  dom.body.querySelectorAll('[data-mathml]')?.forEach(mathMLContainer => {
    if (mathMLContainer.querySelector('math')) {
      return;
    }

    const mathInfo = extractMathMLInfoFromString(mathMLContainer.getAttribute('data-mathml'));
    if (!mathInfo) {
      return;
    }

    storeMathInfo(mathMLContainer, mathInfo);
  });

  // Process code highlight elements
  dom.body.querySelectorAll('[class*=highlight-text],[class*=highlight-source]')?.forEach(codeSource => {
    const language = codeSource.className.match(/highlight-(?:text|source)-([a-z0-9]+)/)?.[1];
    if (codeSource.firstChild && codeSource.firstChild.nodeName == "PRE") {
      codeSource.firstChild.id = `code-lang-${language}`;
    }
  });

  // Process language-specific code elements
  dom.body.querySelectorAll('[class*=language-]')?.forEach(codeSource => {
    const language = codeSource.className.match(/language-([a-z0-9]+)/)?.[1];
    codeSource.id = `code-lang-${language}`;
  });

  // Process BR tags in PRE elements
  dom.body.querySelectorAll('pre br')?.forEach(br => {
    // We need to keep <br> tags because they are removed by Readability.js
    br.outerHTML = '<br-keep></br-keep>';
  });

  // Process code highlight elements with no language
  dom.body.querySelectorAll('.codehilite > pre')?.forEach(codeSource => {
    if (codeSource.firstChild && codeSource.firstChild.nodeName !== 'CODE' && !codeSource.className.includes('language')) {
      codeSource.id = `code-lang-text`;
    }
  });

  // Unwrap headers from anchor tags to prevent Readability from filtering them
  dom.body.querySelectorAll('a')?.forEach(anchor => {
    const heading = Array.from(anchor.children).find(child =>
      /^H[1-6]$/.test(child.nodeName)
    );
    if (heading && anchor.children.length === 1) {
      // If the anchor only contains a heading, unwrap it
      anchor.parentNode.insertBefore(heading, anchor);
      anchor.parentNode.removeChild(anchor);
    }
  });

  // Process headers to avoid Readability.js stripping them
  dom.body.querySelectorAll('h1, h2, h3, h4, h5, h6')?.forEach(header => {
    header.className = '';
    header.outerHTML = header.outerHTML;
  });

  recoveryApi.annotateStructuralAnchors(dom);

  return { dom, math };
}

function finalizeArticleMetadata(article, dom, pageUrl, math, recoveryApi, options = defaultOptions, recoveryDom = dom) {
  if (!article) {
    throw new Error('Readability failed to extract article');
  }

  let recoveredContent = article.content;

  const restoredTableContent = typeof recoveryApi.restoreSemanticTables === 'function'
    ? recoveryApi.restoreSemanticTables(recoveryDom || dom, recoveredContent)
    : null;
  if (restoredTableContent) {
    recoveredContent = restoredTableContent;
  }

  const restoredHeadingContent = typeof recoveryApi.restoreMissingPrimaryHeadings === 'function'
    ? recoveryApi.restoreMissingPrimaryHeadings(recoveryDom || dom, recoveredContent)
    : null;
  if (restoredHeadingContent) {
    recoveredContent = restoredHeadingContent;
  }

  if (options?.skipHiddenContent !== true && typeof recoveryApi.restoreHiddenContentFromSource === 'function') {
    const restoredHiddenContent = recoveryApi.restoreHiddenContentFromSource(dom, recoveredContent);
    if (restoredHiddenContent) {
      recoveredContent = restoredHiddenContent;
    }
  }

  if (recoveredContent !== article.content) {
    Object.assign(article, buildRecoveredArticle(article, recoveredContent));
  }

  article.content = recoveryApi.stripStructuralAnchorsFromHtml(article.content);

  // Add essential metadata with fallbacks.
  // Keep baseURI semantics tied to the parsed document/base tag, and expose pageURL/tabURL separately.
  const baseUrl = safeParseUrl(dom.baseURI);
  const resolvedUrl = resolveArticleUrl(dom.baseURI, pageUrl);
  const baseURI = baseUrl?.href || dom.baseURI || resolvedUrl?.href || '';
  const pageURL = resolvedUrl?.href || baseURI;

  article.uriBase = baseURI;
  article.baseURI = baseURI;
  article.pageURL = pageURL;
  article.tabURL = pageURL;
  
  // Ensure pageTitle has a value - fallback chain: dom.title -> article.title -> 'Untitled'
  article.pageTitle = dom.title || article.title || 'Untitled';
  
  // Ensure title has a value - use pageTitle as fallback
  if (!article.title) {
    article.title = article.pageTitle;
  }
  
  // Legacy URL components (baseURI-based).
  article.hash = baseUrl?.hash || '';
  article.host = baseUrl?.host || '';
  article.origin = baseUrl?.origin || '';
  article.hostname = baseUrl?.hostname || '';
  article.pathname = baseUrl?.pathname || '';
  article.port = baseUrl?.port || '';
  article.protocol = baseUrl?.protocol || '';
  article.search = baseUrl?.search || '';

  // SPA-safe page URL components (actual tab/location URL when available).
  article.pageHash = resolvedUrl?.hash || article.hash;
  article.pageHost = resolvedUrl?.host || article.host;
  article.pageOrigin = resolvedUrl?.origin || article.origin;
  article.pageHostname = resolvedUrl?.hostname || article.hostname;
  article.pagePathname = resolvedUrl?.pathname || article.pathname;
  article.pagePort = resolvedUrl?.port || article.port;
  article.pageProtocol = resolvedUrl?.protocol || article.protocol;
  article.pageSearch = resolvedUrl?.search || article.search;

  // Extract meta tags if head exists
  if (dom.head) {
    // Extract keywords
    article.keywords = dom.head.querySelector('meta[name="keywords"]')?.content?.split(',')?.map(s => s.trim());

    // Add all meta tags for template variables
    dom.head.querySelectorAll('meta[name][content], meta[property][content]')?.forEach(meta => {
      const key = (meta.getAttribute('name') || meta.getAttribute('property'));
      const val = meta.getAttribute('content');
      if (key && val && !article[key]) {
        article[key] = val;
      }
    });
  }

  article.math = math;

  return article;
}

function extractArticleWithRecovery(domString, options) {
  const recoveryApi = getReadabilityRecoveryApi();
  const shouldIncludeHiddenContent = options?.skipHiddenContent !== true;
  const readabilityOptions = {
    skipHiddenContent: true
  };

  const firstPassParser = new DOMParser();
  const firstPassDom = firstPassParser.parseFromString(domString, "text/html");
  const firstPassPrepared = prepareDomForReadability(firstPassDom, options, recoveryApi);
  // Keep Readability scoring anchored to the visible page. Hidden content is restored
  // into the selected article later so collapsible bodies do not become the article.
  const firstPassRecoveryDom = shouldIncludeHiddenContent && typeof recoveryApi.cloneDocumentWithoutHiddenContent === 'function'
    ? recoveryApi.cloneDocumentWithoutHiddenContent(firstPassPrepared.dom)
    : firstPassPrepared.dom;
  const firstPassReadabilityDom = firstPassRecoveryDom.cloneNode(true);
  let firstPassArticle = new Readability(firstPassReadabilityDom, readabilityOptions).parse();
  let firstPassUsesHiddenFallback = false;

  if (!firstPassArticle?.content && shouldIncludeHiddenContent) {
    const hiddenFallbackDom = firstPassPrepared.dom.cloneNode(true);
    firstPassArticle = new Readability(hiddenFallbackDom, { skipHiddenContent: false }).parse();
    firstPassUsesHiddenFallback = !!firstPassArticle?.content;
  }

  if (!firstPassArticle?.content) {
    return null;
  }

  const firstPassSourceDom = firstPassUsesHiddenFallback ? firstPassPrepared.dom : firstPassRecoveryDom;
  const recoveryPlan = recoveryApi.analyzeNarrowExtraction(firstPassSourceDom, firstPassArticle.content);
  if (!recoveryPlan) {
    return {
      article: firstPassArticle,
      dom: firstPassPrepared.dom,
      recoveryDom: firstPassSourceDom,
      math: firstPassPrepared.math
    };
  }

  const secondPassParser = new DOMParser();
  const secondPassDom = secondPassParser.parseFromString(domString, "text/html");
  const secondPassPrepared = prepareDomForReadability(secondPassDom, options, recoveryApi);
  const secondPassRecoveryDom = shouldIncludeHiddenContent && typeof recoveryApi.cloneDocumentWithoutHiddenContent === 'function'
    ? recoveryApi.cloneDocumentWithoutHiddenContent(secondPassPrepared.dom)
    : secondPassPrepared.dom;
  const recoveryResult = recoveryApi.applyRepeatedSectionPromotion(secondPassRecoveryDom, recoveryPlan);
  if (!recoveryResult.changed) {
    return {
      article: firstPassArticle,
      dom: firstPassPrepared.dom,
      recoveryDom: firstPassSourceDom,
      math: firstPassPrepared.math
    };
  }

  const recoveryFragment = recoveryApi.buildRepeatedSectionFragment
    ? recoveryApi.buildRepeatedSectionFragment(secondPassRecoveryDom, recoveryPlan)
    : null;
  if (!recoveryFragment?.html) {
    return {
      article: firstPassArticle,
      dom: firstPassPrepared.dom,
      recoveryDom: firstPassSourceDom,
      math: firstPassPrepared.math
    };
  }

  const secondPassArticle = buildRecoveredArticle(firstPassArticle, recoveryFragment.html);

  const secondPassTextLength = meaningfulTextLengthFromArticleHtml(secondPassArticle.content);
  const firstPassTextLength = recoveryPlan.extractedTextLength || meaningfulTextLengthFromArticleHtml(firstPassArticle.content);
  const recoveredGrowth = secondPassTextLength - firstPassTextLength;
  const growthThreshold = Math.max(400, firstPassTextLength * 0.2);
  const recoveredLinkDensity = linkDensityFromArticleHtml(secondPassArticle.content);
  const recoveredMissingContent = articleHtmlContainsAnyWitness(
    secondPassArticle.content,
    recoveryPlan.missingWitnessIds,
    recoveryApi.anchorAttribute
  );
  const keepsComparableLength = secondPassTextLength >= firstPassTextLength * 0.9;

  if (
    recoveredGrowth < growthThreshold ||
    !recoveredMissingContent ||
    recoveredLinkDensity > 0.4 ||
    !keepsComparableLength
  ) {
    return {
      article: firstPassArticle,
      dom: firstPassPrepared.dom,
      recoveryDom: firstPassSourceDom,
      math: firstPassPrepared.math
    };
  }

  return {
    article: secondPassArticle,
    dom: secondPassPrepared.dom,
    recoveryDom: secondPassRecoveryDom,
    math: secondPassPrepared.math
  };
}

async function getArticleFromDom(domString, options, pageUrl = null) {
  if (!domString) {
    throw new Error('Invalid DOM string provided');
  }

  const extracted = extractArticleWithRecovery(domString, options);
  if (!extracted) {
    throw new Error('Readability failed to extract article');
  }

  return finalizeArticleMetadata(
    extracted.article,
    extracted.dom,
    pageUrl,
    extracted.math,
    getReadabilityRecoveryApi(),
    options,
    extracted.recoveryDom
  );
}

/**
* Get article from tab content
*/
async function getArticleFromContent(tabId, selection = false, options = null) {  // Add options parameter
  try {
    console.log(`Getting article content for tab ${tabId}`);
    const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    
    const resultPromise = new Promise((resolve, reject) => {
      const messageListener = (message) => {
        if (message.type === 'article-content-result' && message.requestId === requestId) {
          console.log(`Received article content result for tab ${tabId}:`, message);
          browser.runtime.onMessage.removeListener(messageListener);
          if (message.error) {
            reject(new Error(message.error));
          } else {
            resolve(message.article);
          }
        }
      };
      
      setTimeout(() => {
        browser.runtime.onMessage.removeListener(messageListener);
        reject(new Error(`Timeout getting article content for tab ${tabId}`));
      }, 30000);
      
      browser.runtime.onMessage.addListener(messageListener);
    });
    
    await browser.runtime.sendMessage({
      type: "get-tab-content",
      tabId: tabId,
      selection: selection,
      requestId: requestId,
      options: options || defaultOptions
    });
    
    const articlePayload = await resultPromise;
    if (!articlePayload?.dom) {
      throw new Error(`Missing DOM content for tab ${tabId}`);
    }
    
    console.log(`Processing DOM content for tab ${tabId}`);
    const domForArticle = buildDomWithSelection(articlePayload.dom, articlePayload.selection, selection);
    return await getArticleFromDom(domForArticle, options, articlePayload.pageUrl);
  } catch (error) {
    console.error(`Error getting content from tab ${tabId}:`, error);
    return null;
  }
}

/**
 * Format title using template with provided options
 */
async function formatTitle(article, providedOptions = null) {
  const options = providedOptions || defaultOptions;
  
  let title = textReplace(options.title, article, options.disallowedChars + '/', options.disallowedCharReplacement);
  title = title.split('/').map(s => generateValidFileName(s, options.disallowedChars, options.disallowedCharReplacement)).join('/');
  return title;
}

/**
 * Format Markdown clips folder with provided options
 */
async function formatMdClipsFolder(article, providedOptions = null) {
  const options = providedOptions || defaultOptions;

  let mdClipsFolder = '';
  if (options.mdClipsFolder && options.downloadMode == 'downloadsApi') {
    mdClipsFolder = textReplace(options.mdClipsFolder, article, options.disallowedChars, options.disallowedCharReplacement);
    mdClipsFolder = mdClipsFolder.split('/').map(s => generateValidFileName(s, options.disallowedChars, options.disallowedCharReplacement)).join('/');
    if (!mdClipsFolder.endsWith('/')) mdClipsFolder += '/';
  }

  return mdClipsFolder;
}

/**
 * Format Obsidian folder with provided options
 */
async function formatObsidianFolder(article, providedOptions = null) {
  const options = providedOptions || defaultOptions;

  let obsidianFolder = '';
  if (options.obsidianFolder) {
    obsidianFolder = textReplace(options.obsidianFolder, article, options.disallowedChars, options.disallowedCharReplacement);
    obsidianFolder = obsidianFolder.split('/').map(s => generateValidFileName(s, options.disallowedChars, options.disallowedCharReplacement)).join('/');
    if (!obsidianFolder.endsWith('/')) obsidianFolder += '/';
  }

  return obsidianFolder;
}

/**
* Replace placeholder strings with article info — delegates to shared module.
*/
function textReplace(string, article, disallowedChars = null, disallowedCharReplacement = '') {
  return getTemplateUtilsApi().textReplace(string, article, disallowedChars, disallowedCharReplacement);
}

/**
* Generate valid filename \u2014 delegates to shared module.
*/
function generateValidFileName(title, disallowedChars = null, disallowedCharReplacement = '') {
  return getTemplateUtilsApi().generateValidFileName(title, disallowedChars, disallowedCharReplacement);
}

/**
* Clean attribute
*/
function cleanAttribute(attribute) {
 return attribute ? attribute.replace(/(\n+\s*)+/g, '\n') : '';
}

/**
* Validate URI
*/
function validateUri(href, baseURI) {
 const sharedApi = getUrlUtilsApi();
 if (sharedApi?.validateUri) {
   return sharedApi.validateUri(href, baseURI);
 }

 // Check if the href is a valid url
 try {
   new URL(href);
 }
 catch {
   // If it's not a valid url, that likely means we have to prepend the base uri
   const baseUri = new URL(baseURI);

   // If the href starts with '/', we need to go from the origin
   if (href.startsWith('/')) {
     href = baseUri.origin + href;
   }
   // Otherwise we need to go from the local folder
   else {
     href = baseUri.href + (baseUri.href.endsWith('/') ? '' : '/') + href;
   }
 }
 return href;
}

/**
* Get image filename
*/
function getImageFilename(src, options, prependFilePath = true) {
 const sharedApi = getUrlUtilsApi();
 if (sharedApi?.getImageFilename) {
   return sharedApi.getImageFilename(src, options, prependFilePath);
 }

 const slashPos = src.lastIndexOf('/');
 const queryPos = src.indexOf('?');
 let filename = src.substring(slashPos + 1, queryPos > 0 ? queryPos : src.length);

 let imagePrefix = (options.imagePrefix || '');

 if (prependFilePath && options.title.includes('/')) {
   imagePrefix = options.title.substring(0, options.title.lastIndexOf('/') + 1) + imagePrefix;
 }
 else if (prependFilePath) {
   imagePrefix = options.title + (imagePrefix.startsWith('/') ? '' : '/') + imagePrefix;
 }
 
 if (filename.includes(';base64,')) {
   // This is a base64 encoded image
   filename = 'image.' + filename.substring(0, filename.indexOf(';'));
 }
 
 let extension = filename.substring(filename.lastIndexOf('.'));
 if (extension == filename) {
   // There is no extension, give it an 'idunno' extension
   filename = filename + '.idunno';
 }

 filename = generateValidFileName(filename, options.disallowedChars, options.disallowedCharReplacement);

 return imagePrefix + filename;
}

/**
* Pre-download images
*/
async function preDownloadImages(imageList, markdown, providedOptions = null) {
  const options = providedOptions || defaultOptions;
  let newImageList = {};
  let sourceImageMap = {};

 // Process all images in parallel
 await Promise.all(Object.entries(imageList).map(([src, filename]) => new Promise(async (resolve) => {
   try {
     // Fetch the image using fetch instead of XMLHttpRequest
     const response = await fetch(src);
     if (!response.ok) {
       throw new Error(`HTTP ${response.status}`);
     }
     const blob = await response.blob();

     if (options.imageStyle == 'base64') {
       // Convert to base64
       const reader = new FileReader();
       reader.onloadend = () => {
         markdown = markdown.replaceAll(src, reader.result);
         resolve();
       };
       reader.readAsDataURL(blob);
     } else {
       let newFilename = filename;
       
       // Handle unknown extensions
       if (newFilename.endsWith('.idunno')) {
         const mimeType = blob.type || 'application/octet-stream';
         const extension = mimedb[mimeType] || 'bin';
         newFilename = filename.replace('.idunno', `.${extension}`);

         // Update filename in markdown
         if (!options.imageStyle.startsWith("obsidian")) {
           markdown = markdown.replaceAll(
             filename.split('/').map(s => encodeURI(s)).join('/'),
             newFilename.split('/').map(s => encodeURI(s)).join('/')
           );
         } else {
           markdown = markdown.replaceAll(filename, newFilename);
         }
       }

       // Create object URL for the blob
       const blobUrl = URL.createObjectURL(blob);
       newImageList[blobUrl] = newFilename;
       Object.assign(sourceImageMap, markSnipObsidian.createObsidianSourceImageMap({
         [src]: newFilename
       }));
       resolve();
     }
   } catch (error) {
     console.error('Error pre-downloading image:', error);
     resolve();
   }
 })));

 return { imageList: newImageList, markdown: markdown, sourceImageMap: sourceImageMap };
}

/**
* Download Markdown file
*/
async function downloadMarkdown(markdown, title, tabId, imageList = {}, mdClipsFolder = '', providedOptions = null, notificationDelta = null) {
  const options = providedOptions || defaultOptions;
  
  // CRITICAL: Ensure title is never empty to prevent download failures
  if (!title || title.trim() === '') {
    console.warn('⚠️ [Offscreen] Empty title detected, using fallback');
    title = 'Untitled-' + Date.now();
  }
  
  console.log(`📁 [Offscreen] Downloading markdown: title="${title}", folder="${mdClipsFolder}", saveAs=${options.saveAs}`);
  console.log(`🔧 [Offscreen] Download mode: ${options.downloadMode}, browser.downloads available: ${!!browser.downloads}`);
 
 // Check if Downloads API is available in offscreen context
 const hasDownloadsAPI = !!(browser.downloads || (typeof chrome !== 'undefined' && chrome.downloads));
 
 if (options.downloadMode === 'downloadsApi' && hasDownloadsAPI) {
   // Downloads API is available in offscreen - use it directly
   const downloadsAPI = browser.downloads || chrome.downloads;
   
   try {
     // Create blob for markdown content
     const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
     const url = URL.createObjectURL(blob);
     
     if(mdClipsFolder && !mdClipsFolder.endsWith('/')) mdClipsFolder += '/';
     
     const fullFilename = mdClipsFolder + title + ".md";
     
     console.log(`🚀 [Offscreen] Starting Downloads API download: URL=${url}, filename="${fullFilename}"`);
     
     // CRITICAL: Notify service worker to track this URL BEFORE starting download
     await browser.runtime.sendMessage({
       type: 'track-download-url',
       url: url,
       filename: fullFilename,
       isMarkdown: true,
       notificationDelta: notificationDelta,
       tabId: tabId
     });
     
     // Start the markdown download using the available API
     const id = await downloadsAPI.download({
       url: url,
       filename: fullFilename,
       saveAs: options.saveAs
     });

     console.log(`✅ [Offscreen] Downloads API download started with ID: ${id}`);
     
     // Notify service worker about download completion
     browser.runtime.sendMessage({
       type: 'download-complete',
       downloadId: id,
       url: url,
       filename: fullFilename
     });

     // FIXED: Delegate image downloads to service worker instead of handling here
     if (options.downloadImages && Object.keys(imageList).length > 0) {
       console.log('🖼️ [Offscreen] Delegating image downloads to service worker:', Object.keys(imageList).length, 'images');
       
       // Send image download request to service worker
       await browser.runtime.sendMessage({
         type: 'download-images',
         imageList: imageList,
         mdClipsFolder: mdClipsFolder,
         title: title,
         options: options
       });
     }
   } catch (err) {
     console.error("❌ [Offscreen] Downloads API failed, notifying service worker to take over:", err);
     
     // Signal service worker to take over the download
     await browser.runtime.sendMessage({
       type: 'offscreen-download-failed',
       markdown: markdown,
       title: title,
       tabId: tabId,
       imageList: imageList,
       mdClipsFolder: mdClipsFolder,
       options: options,
       error: err.message
     });
   }
 } else if (options.downloadMode === 'downloadsApi') {
   // Downloads API requested but not available in offscreen - create blob and delegate to service worker
   console.log(`🔄 [Offscreen] Downloads API not available in offscreen, creating blob and delegating to service worker`);
   
   try {
     // Create blob URL in offscreen document (has DOM access)
     const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
     const url = URL.createObjectURL(blob);
     
     if(mdClipsFolder && !mdClipsFolder.endsWith('/')) mdClipsFolder += '/';
     const fullFilename = mdClipsFolder + title + ".md";
     
     console.log(`🎯 [Offscreen] Created blob URL: ${url}, delegating to service worker`);
     
     // Send blob URL to service worker for Downloads API
     await browser.runtime.sendMessage({
       type: 'service-worker-download',
       blobUrl: url,
       filename: fullFilename,
       tabId: tabId,
       imageList: imageList,
       mdClipsFolder: mdClipsFolder,
       options: options,
       notificationDelta: notificationDelta
     });
   } catch (err) {
     console.error("❌ [Offscreen] Failed to create blob, falling back to content script:", err);
     await downloadViaContentScript(markdown, title, tabId, imageList, mdClipsFolder, options, notificationDelta);
   }
 } else {
    // Use content script method via service worker
    console.log(`🔗 [Offscreen] Using content script method (downloadMode: ${options.downloadMode})`);
    await downloadViaContentScript(markdown, title, tabId, imageList, mdClipsFolder, options, notificationDelta);
  }
}

async function downloadGeneratedFileExport(content, filename, tabId, providedOptions = null, mimeType = 'application/octet-stream', notificationDelta = null) {
  const options = providedOptions || defaultOptions;
  const downloadsAPI = browser.downloads || (typeof chrome !== 'undefined' ? chrome.downloads : null);
  const hasDownloadsAPI = !!downloadsAPI;
  const nextFilename = String(filename || '').trim() || `Untitled-${Date.now()}.bin`;
  const nextMimeType = String(mimeType || 'application/octet-stream');
  const nextContent = String(content || '');

  console.log(`ðŸ“„ [Offscreen] Downloading generated file: filename="${nextFilename}", mimeType="${nextMimeType}"`);

  if (options.downloadMode === 'downloadsApi' && hasDownloadsAPI) {
    try {
      const blob = new Blob([nextContent], { type: nextMimeType });
      const url = URL.createObjectURL(blob);

      await browser.runtime.sendMessage({
        type: 'track-download-url',
        url: url,
        filename: nextFilename,
        isMarkdown: false,
        notificationDelta: notificationDelta,
        tabId: tabId
      });

      const id = await downloadsAPI.download({
        url: url,
        filename: nextFilename,
        saveAs: options.saveAs
      });

      browser.runtime.sendMessage({
        type: 'download-complete',
        downloadId: id,
        url: url,
        filename: nextFilename
      });
      return;
    } catch (err) {
      console.error('âŒ [Offscreen] Generated file download via Downloads API failed, delegating to service worker:', err);
    }
  }

  const blob = new Blob([nextContent], { type: nextMimeType });
  const url = URL.createObjectURL(blob);

  await browser.runtime.sendMessage({
    type: 'service-worker-download',
    blobUrl: url,
    filename: nextFilename,
    tabId: tabId,
    imageList: {},
    mdClipsFolder: '',
    options: {
      ...options,
      downloadImages: false
    },
    notificationDelta: notificationDelta
  });
}

/**
 * Download via content script method (fallback when Downloads API not available)
 */
async function downloadViaContentScript(markdown, title, tabId, imageList, mdClipsFolder, options, notificationDelta = null) {
  try {
    // For content script downloads, we need to handle the subfolder differently
    // since data URI downloads don't support subfolders
    let filename;
    if (mdClipsFolder) {
      // Flatten the path by including folder in filename
      filename = `${mdClipsFolder.replace(/\//g, '_')}${generateValidFileName(title, options.disallowedChars, options.disallowedCharReplacement)}.md`;
      console.log(`🔗 [Offscreen] Flattening subfolder path: "${mdClipsFolder}" + "${title}" -> "${filename}"`);
    } else {
      filename = generateValidFileName(title, options.disallowedChars, options.disallowedCharReplacement) + ".md";
    }
    
    const base64Content = base64EncodeUnicode(markdown);
    
    console.log(`🔗 [Offscreen] Using content script download: ${filename}`);
    
    // Send message to service worker to handle the download
    await browser.runtime.sendMessage({
      type: "execute-content-download",
      tabId: tabId,
      filename: filename,
      content: base64Content,
      notificationDelta: notificationDelta
    });

    // Handle image downloads for content script method
    if (options.downloadImages && Object.keys(imageList).length > 0) {
      await browser.runtime.sendMessage({
        type: 'download-images-content-script',
        imageList: imageList,
        tabId: tabId,
        options: options
      });
    }
  } catch (error) {
    console.error("❌ [Offscreen] Failed to initiate content script download:", error);
  }
}

/**
* Base64 encode Unicode string
*/
function base64EncodeUnicode(str) {
 // Encode UTF-8 string to base64
 const utf8Bytes = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
   return String.fromCharCode('0x' + p1);
 });

 return btoa(utf8Bytes);
}

/**
* Convert to fenced code block
*/
function convertToFencedCodeBlock(node, options) {
 const sharedApi = getCodeBlockUtilsApi();
 if (sharedApi?.convertToFencedCodeBlock) {
   return sharedApi.convertToFencedCodeBlock(node, options);
 }

 function normalizeCodeBlockSpacing(text, maxBlankLines = 2) {
   const lines = text.split('\n');
   const normalizedLines = [];
   let blankLineCount = 0;

   lines.forEach(line => {
     if (/^[ \t]*$/.test(line)) {
       blankLineCount += 1;
       if (blankLineCount <= maxBlankLines) {
         normalizedLines.push('');
       }
     } else {
       blankLineCount = 0;
       normalizedLines.push(line);
     }
   });

   return normalizedLines.join('\n');
 }

 function detectPreLanguage(node, code) {
   const shouldAutoDetectLanguage = options.autoDetectCodeLanguage !== false;
   const idMatch = node.id?.match(/code-lang-(.+)/);
   if (idMatch?.length > 1) {
     return idMatch[1];
   }

   const classTokens = (node.className || '')
     .toLowerCase()
     .split(/\s+/)
     .filter(Boolean);
   const candidates = new Set();

   classTokens.forEach(token => {
     candidates.add(token);
     if (token.startsWith('language-')) candidates.add(token.substring(9));
     if (token.startsWith('lang-')) candidates.add(token.substring(5));
     if (token.startsWith('source-')) candidates.add(token.substring(7));
     if (token.startsWith('highlight-')) candidates.add(token.substring(10));
   });

   if (typeof hljs !== 'undefined' && typeof hljs.getLanguage === 'function') {
     for (const candidate of candidates) {
       if (candidate && hljs.getLanguage(candidate)) {
         return candidate;
       }
     }
   }

   if (
     shouldAutoDetectLanguage &&
     typeof hljs !== 'undefined' &&
     typeof hljs.highlightAuto === 'function' &&
     code.trim()
   ) {
     try {
       const detected = hljs.highlightAuto(code);
       if (
         detected?.language &&
         typeof detected.relevance === 'number' &&
         detected.relevance >= 2
       ) {
         return detected.language;
       }
     } catch (e) {
       console.warn('Language detection failed for <pre> block:', e);
     }
   }

   return '';
 }

 let code;

 if (options.preserveCodeFormatting) {
   code = node.innerHTML.replaceAll('<br-keep></br-keep>', '<br>');
 } else {
   const clonedNode = node.cloneNode(true);
   clonedNode.querySelectorAll('br-keep, br').forEach(br => {
     br.replaceWith('\n');
   });
   code = clonedNode.textContent || '';
   code = normalizeCodeBlockSpacing(code, 2);
 }
 const language = detectPreLanguage(node, code);

 var fenceChar = options.fence.charAt(0);
 var fenceSize = 3;
 var fenceInCodeRegex = new RegExp('^' + fenceChar + '{3,}', 'gm');

 var match;
 while ((match = fenceInCodeRegex.exec(code))) {
   if (match[0].length >= fenceSize) {
     fenceSize = match[0].length + 1;
   }
 }

 var fence = repeat(fenceChar, fenceSize);

 return (
   '\n\n' + fence + language + '\n' +
   code.replace(/\n$/, '') +
   '\n' + fence + '\n\n'
 );
}

/**
* Repeat string
*/
function repeat(character, count) {
  return Array(count + 1).join(character);
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

  const { dosDate, dosTime } = getDosDateTime();

  files.forEach(file => {
    const entryName = (file.filename || 'untitled.md').replace(/\\/g, '/').replace(/^\/+/, '');
    const nameBytes = encoder.encode(entryName);
    const dataBytes = encoder.encode(file.content || '');
    const entryCrc = crc32(dataBytes);
    const size = dataBytes.length;

    const localHeader = new Uint8Array(30 + nameBytes.length + size);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
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
    centralView.setUint16(8, 0, true);
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

async function downloadBatchZip(message) {
  try {
    const files = Array.isArray(message.files) ? message.files : [];
    if (!files.length) {
      console.warn('[Offscreen] download-batch-zip called without files');
      return;
    }

    const options = message.options || defaultOptions;
    const zipFilename = message.zipFilename || `MarkSnip-batch-${Date.now()}.zip`;
    const zipBlob = createStoredZipBlob(files);
    console.log(`[Offscreen] ZIP blob created (${zipBlob.size} bytes) for ${files.length} files`);

    const zipUrl = URL.createObjectURL(zipBlob);
    const downloadsAPI = browser.downloads || (typeof chrome !== 'undefined' ? chrome.downloads : null);

    if (!downloadsAPI) {
      console.log('[Offscreen] Downloads API unavailable in offscreen, delegating ZIP download to service worker');
      const fallbackTabId = Number.isInteger(message.fallbackTabId) ? message.fallbackTabId : 0;
      await browser.runtime.sendMessage({
        type: 'service-worker-download',
        blobUrl: zipUrl,
        filename: zipFilename,
        tabId: fallbackTabId,
        imageList: {},
        mdClipsFolder: '',
        options: {
          ...options,
          downloadImages: false
        }
      });
      return;
    }

    console.log(`[Offscreen] Creating batch ZIP download: ${zipFilename} (${files.length} files)`);

    await downloadsAPI.download({
      url: zipUrl,
      filename: zipFilename,
      saveAs: !!options.saveAs
    });

    // Delay cleanup briefly to avoid revoking URL before the download starts.
    setTimeout(() => {
      try {
        URL.revokeObjectURL(zipUrl);
      } catch (err) {
        console.warn('[Offscreen] Failed to revoke ZIP blob URL:', err);
      }
    }, 15000);
  } catch (error) {
    console.error('[Offscreen] ZIP download failed:', error);
    throw error;
  }
}

/**
 * Get article content from tab
 */
async function handleGetArticleContent(message) {
  try {
    const { tabId, selection, requestId, options } = message;
    
    // Forward the request to the service worker
    await browser.runtime.sendMessage({
      type: 'forward-get-article-content',
      originalRequestId: requestId,
      tabId: tabId,
      selection: selection,
      options: options || defaultOptions
    });
    
  } catch (error) {
    console.error('Error handling get article content:', error);
    await browser.runtime.sendMessage({
      type: 'article-error',
      requestId: message.requestId,
      error: error.message
    });
  }
}
