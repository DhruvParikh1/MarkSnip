(function (root, factory) {
  const api = factory(root);
  root.MarkSnipReaderSemantics = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (_root) {
  const MS_BLOCK = 'data-ms-reader-block';
  const MS_TYPE = 'data-ms-reader-type';
  const MS_ROLE = 'data-ms-reader-role';
  const MS_SOURCE = 'data-ms-reader-source';
  const MS_TITLE = 'data-ms-reader-title';

  const CALLOUT_TYPES = new Set([
    'abstract',
    'bug',
    'caution',
    'danger',
    'example',
    'failure',
    'important',
    'info',
    'note',
    'question',
    'quote',
    'success',
    'tip',
    'warning'
  ]);

  const CALLOUT_ALIASES = {
    attention: 'warning',
    check: 'success',
    done: 'success',
    error: 'danger',
    fail: 'failure',
    help: 'question',
    hint: 'tip',
    missing: 'failure',
    success: 'success',
    todo: 'note',
    warn: 'warning'
  };

  const COMMON_LANGUAGES = new Set([
    'bash',
    'c',
    'cpp',
    'csharp',
    'css',
    'go',
    'html',
    'java',
    'javascript',
    'js',
    'json',
    'jsx',
    'kotlin',
    'lua',
    'php',
    'powershell',
    'python',
    'rb',
    'ruby',
    'rust',
    'scss',
    'shell',
    'sql',
    'swift',
    'text',
    'ts',
    'tsx',
    'typescript',
    'xml',
    'yaml',
    'yml'
  ]);

  const CODE_CONTAINER_SELECTOR = [
    'pre',
    '.syntaxhighlighter',
    '.codehilite',
    '.highlight-source',
    'div[class*="highlight-source-"]',
    'div[class*="highlight-text-"]',
    '.wp-block-syntaxhighlighter-code',
    '.wp-block-code',
    'div[class*="language-"]',
    'div[class*="lang-"]',
    'div[class*="brush:"]',
    'div[data-lang]',
    'div[data-language]',
    'table.rouge-table',
    '.cm-content'
  ].join(',');

  function getBody(root) {
    return root?.body || root;
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function getClassTokens(el) {
    return String(el?.getAttribute?.('class') || '')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function queryAll(root, selector) {
    try {
      return Array.from(root?.querySelectorAll?.(selector) || []);
    } catch {
      return [];
    }
  }

  function uniqueElements(elements) {
    return Array.from(new Set(elements)).filter((el) => el?.parentNode);
  }

  function normalizeCalloutType(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/^callout-/, '').replace(/^alert-/, '');
    const token = raw.replace(/[^a-z0-9_-]/g, '');
    if (!token) return 'note';
    const aliased = CALLOUT_ALIASES[token] || token;
    return CALLOUT_TYPES.has(aliased) ? aliased : aliased;
  }

  function titleForType(type) {
    const normalized = normalizeCalloutType(type);
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  function findFirstCalloutTextNode(root) {
    const nodeFilter = root.ownerDocument.defaultView?.NodeFilter ||
      (typeof NodeFilter !== 'undefined' ? NodeFilter : { SHOW_TEXT: 4 });
    const walker = root.ownerDocument.createTreeWalker(root, nodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (String(node.nodeValue || '').trim()) {
        return node;
      }
      node = walker.nextNode();
    }
    return null;
  }

  function hasMeaningfulContentAfter(root, textNode) {
    const nodeFilter = root.ownerDocument.defaultView?.NodeFilter ||
      (typeof NodeFilter !== 'undefined' ? NodeFilter : { SHOW_TEXT: 4, SHOW_ELEMENT: 1 });
    const walker = root.ownerDocument.createTreeWalker(root, nodeFilter.SHOW_TEXT | nodeFilter.SHOW_ELEMENT);
    let seenTextNode = false;
    let node = walker.nextNode();
    while (node) {
      if (node === textNode) {
        seenTextNode = true;
      } else if (seenTextNode) {
        if (node.nodeType === Node.TEXT_NODE && normalizeText(node.nodeValue)) {
          return true;
        }
        if (node.nodeType === Node.ELEMENT_NODE && /^(IMG|PICTURE|PRE|CODE|TABLE|UL|OL|P|DIV)$/.test(node.tagName)) {
          if (normalizeText(node.textContent) || node.querySelector?.('img, picture, pre, code, table')) {
            return true;
          }
        }
      }
      node = walker.nextNode();
    }
    return false;
  }

  function removeLeadingEmptyNodes(root) {
    while (root.firstChild) {
      const node = root.firstChild;
      if (node.nodeType === Node.TEXT_NODE && !normalizeText(node.nodeValue)) {
        node.remove();
        continue;
      }
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
        node.remove();
        continue;
      }
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        /^(P|DIV|SPAN)$/.test(node.tagName) &&
        !normalizeText(node.textContent) &&
        !node.querySelector?.('img, picture, pre, code, table')
      ) {
        node.remove();
        continue;
      }
      break;
    }
  }

  function markdownCalloutDetails(blockquote) {
    const textNode = findFirstCalloutTextNode(blockquote);
    const value = String(textNode?.nodeValue || '');
    const marker = value.match(/^\s*\[!([a-z][\w-]*)\]([+-])?\s*/i);
    if (!textNode || !marker) return null;

    const type = normalizeCalloutType(marker[1]);
    const defaultTitle = titleForType(type);
    const afterMarker = value.slice(marker[0].length);
    const hasFollowingContent = hasMeaningfulContentAfter(blockquote, textNode);
    let title = defaultTitle;
    let leadingContent = '';

    if (afterMarker.includes('\n')) {
      const lines = afterMarker.split(/\n+/);
      title = normalizeText(lines.shift()) || defaultTitle;
      leadingContent = lines.join('\n').trimStart();
    } else if (hasFollowingContent) {
      title = normalizeText(afterMarker) || defaultTitle;
    } else {
      const trimmed = normalizeText(afterMarker);
      if (trimmed.toLowerCase().startsWith(`${defaultTitle.toLowerCase()} `)) {
        title = defaultTitle;
        leadingContent = trimmed.slice(defaultTitle.length).trimStart();
      } else if (trimmed && trimmed.length <= 48) {
        title = trimmed;
      } else {
        leadingContent = trimmed;
      }
    }

    textNode.nodeValue = leadingContent;
    let current = textNode.parentNode;
    while (current && current !== blockquote) {
      removeLeadingEmptyNodes(current);
      current = current.parentNode;
    }
    removeLeadingEmptyNodes(blockquote);

    return {
      type,
      title,
      foldState: marker[2] || '',
      source: 'markdown-callout'
    };
  }

  function transferChildren(source, target) {
    while (source?.firstChild) {
      target.appendChild(source.firstChild);
    }
  }

  function cloneChildren(source, target) {
    Array.from(source?.childNodes || []).forEach((child) => {
      target.appendChild(child.cloneNode(true));
    });
  }

  function removeIfContained(root, node) {
    if (node && root?.contains?.(node)) {
      node.remove();
    }
  }

  function createCalloutCarrier(doc, type, title, contentSource, sourceName, foldState) {
    const blockquote = doc.createElement('blockquote');
    blockquote.setAttribute(MS_BLOCK, 'callout');
    blockquote.setAttribute(MS_TYPE, normalizeCalloutType(type));
    blockquote.setAttribute(MS_SOURCE, sourceName || 'generic');
    blockquote.setAttribute(MS_TITLE, title || titleForType(type));
    if (foldState) {
      blockquote.setAttribute('data-ms-reader-fold', foldState);
    }

    const titleParagraph = doc.createElement('p');
    titleParagraph.setAttribute(MS_ROLE, 'title');
    const strong = doc.createElement('strong');
    strong.textContent = title || titleForType(type);
    titleParagraph.appendChild(strong);
    blockquote.appendChild(titleParagraph);

    if (contentSource) {
      transferChildren(contentSource, blockquote);
    }

    return blockquote;
  }

  function cleanCollapsedCallouts(root) {
    queryAll(root, '.callout.is-collapsed, .callout.is-collapsible').forEach((el) => {
      const wasCollapsed = el.classList?.contains('is-collapsed');
      el.classList?.remove('is-collapsed', 'is-collapsible');
      if (!el.hasAttribute('data-callout-fold')) {
        el.setAttribute('data-callout-fold', wasCollapsed ? '-' : '+');
      }
      queryAll(el, '.callout-fold').forEach((fold) => fold.remove());
      const content = el.querySelector?.('.callout-content');
      const style = content?.getAttribute?.('style') || '';
      if (/display\s*:\s*none/i.test(style)) {
        const cleaned = style.replace(/display\s*:\s*none\s*;?/gi, '').trim();
        if (cleaned) content.setAttribute('style', cleaned);
        else content.removeAttribute('style');
      }
      if (content?.hasAttribute?.('hidden')) {
        content.removeAttribute('hidden');
      }
      if (content?.getAttribute?.('aria-hidden') === 'true') {
        content.removeAttribute('aria-hidden');
      }
    });
  }

  function replaceWithCallout(el, details) {
    if (!el?.parentNode || el.hasAttribute(MS_BLOCK)) return false;
    const doc = el.ownerDocument;
    const type = normalizeCalloutType(details.type);
    const titleEl = details.titleEl || null;
    const title = normalizeText(details.title || titleEl?.textContent) || titleForType(type);
    const contentEl = details.contentEl || el;

    if (titleEl && titleEl !== contentEl) {
      removeIfContained(el, titleEl);
    }

    const holder = doc.createElement('div');
    if (contentEl === el) {
      transferChildren(el, holder);
    } else {
      transferChildren(contentEl, holder);
    }

    const callout = createCalloutCarrier(doc, type, title, holder, details.source, details.foldState);
    el.replaceWith(callout);
    return true;
  }

  function classContainsType(el, allowedTypes) {
    const tokens = getClassTokens(el).map((token) => token.toLowerCase());
    return tokens.find((token) => allowedTypes.has(token)) || '';
  }

  function standardizeCallouts(root) {
    const body = getBody(root);
    if (!body) return;
    cleanCollapsedCallouts(body);

    uniqueElements([
      ...queryAll(body, '[data-callout]'),
      ...queryAll(body, '.markdown-alert'),
      ...queryAll(body, '.admonition'),
      ...queryAll(body, '.alert[class*="alert-"]'),
      ...queryAll(body, '.notecard'),
      ...queryAll(body, 'blockquote'),
      ...queryAll(body, 'aside[class*="callout"], aside.note, aside.tip, aside.caution, aside.warning, aside.important')
    ]).forEach((el) => {
      if (!el.parentNode || el.closest?.(`[${MS_BLOCK}="callout"]`)) return;

      if (el.tagName === 'BLOCKQUOTE') {
        const details = markdownCalloutDetails(el);
        if (!details) return;
        replaceWithCallout(el, {
          type: details.type,
          title: details.title,
          contentEl: el,
          source: details.source,
          foldState: details.foldState
        });
        return;
      }

      if (el.matches?.('[data-callout]')) {
        const type = normalizeCalloutType(el.getAttribute('data-callout'));
        const titleEl = el.querySelector('.callout-title-inner, .callout-title, [data-callout-title]');
        const contentEl = el.querySelector('.callout-content') || el;
        replaceWithCallout(el, {
          type,
          titleEl,
          contentEl,
          source: 'data-callout',
          foldState: el.getAttribute('data-callout-fold') || ''
        });
        return;
      }

      if (el.classList?.contains('markdown-alert')) {
        const typeClass = getClassTokens(el).find((token) => /^markdown-alert-/.test(token) && token !== 'markdown-alert');
        const type = normalizeCalloutType(typeClass ? typeClass.replace(/^markdown-alert-/, '') : 'note');
        const titleEl = el.querySelector('.markdown-alert-title');
        replaceWithCallout(el, {
          type,
          title: titleEl?.textContent || titleForType(type),
          titleEl,
          contentEl: el,
          source: 'markdown-alert'
        });
        return;
      }

      if (el.classList?.contains('admonition')) {
        const type = normalizeCalloutType(classContainsType(el, CALLOUT_TYPES) || 'note');
        const titleEl = el.querySelector('.admonition-title');
        const contentEl = el.querySelector('.admonition-content, .details-content') || el;
        replaceWithCallout(el, {
          type,
          titleEl,
          contentEl,
          source: 'admonition'
        });
        return;
      }

      if (el.classList?.contains('alert')) {
        const typeClass = getClassTokens(el).find((token) => /^alert-/.test(token) && token !== 'alert-dismissible');
        const type = normalizeCalloutType(typeClass ? typeClass.replace(/^alert-/, '') : 'note');
        const titleEl = el.querySelector('.alert-heading, .alert-title');
        replaceWithCallout(el, {
          type,
          titleEl,
          contentEl: el,
          source: 'alert'
        });
        return;
      }

      if (el.classList?.contains('notecard')) {
        const type = normalizeCalloutType(classContainsType(el, CALLOUT_TYPES) || 'note');
        const firstStrong = el.querySelector('p:first-child strong, strong:first-child');
        replaceWithCallout(el, {
          type,
          title: firstStrong?.textContent?.replace(/:$/, '') || titleForType(type),
          titleEl: firstStrong,
          contentEl: el,
          source: 'notecard'
        });
        return;
      }

      if (el.tagName === 'ASIDE') {
        const typeClass = getClassTokens(el).find((token) => (
          /^callout-/.test(token) || CALLOUT_TYPES.has(token.toLowerCase())
        ));
        const type = normalizeCalloutType(typeClass || 'note');
        const titleEl = el.querySelector('.callout-title, .title, h1, h2, h3, h4, h5, h6');
        const contentEl = el.querySelector('.callout-content') || el;
        replaceWithCallout(el, {
          type,
          titleEl,
          contentEl,
          source: 'aside'
        });
      }
    });
  }

  function sanitizeLanguage(value) {
    const token = String(value || '').trim().toLowerCase().replace(/^language-/, '').replace(/^lang-/, '');
    const cleaned = token.replace(/[^a-z0-9_+#.-]/g, '');
    if (!cleaned) return '';
    if (COMMON_LANGUAGES.has(cleaned)) return cleaned;
    return /^[a-z][a-z0-9_+#.-]{0,30}$/.test(cleaned) ? cleaned : '';
  }

  function detectCodeLanguage(el) {
    const attrs = [
      el.getAttribute?.('data-lang'),
      el.getAttribute?.('data-language'),
      el.getAttribute?.('language'),
      el.id?.match?.(/code-lang-([a-z0-9_+#.-]+)/i)?.[1]
    ];
    for (const attr of attrs) {
      const lang = sanitizeLanguage(attr);
      if (lang) return lang;
    }

    const className = String(el.getAttribute?.('class') || '');
    const patterns = [
      /(?:^|\s)language-([a-z0-9_+#.-]+)(?:\s|$)/i,
      /(?:^|\s)lang-([a-z0-9_+#.-]+)(?:\s|$)/i,
      /(?:^|\s)brush:\s*([a-z0-9_+#.-]+)/i,
      /(?:^|\s)highlight-source-([a-z0-9_+#.-]+)(?:\s|$)/i,
      /(?:^|\s)([a-z0-9_+#.-]+)-code(?:\s|$)/i
    ];
    for (const pattern of patterns) {
      const lang = sanitizeLanguage(className.match(pattern)?.[1]);
      if (lang) return lang;
    }

    const bare = getClassTokens(el).map(sanitizeLanguage).find((token) => COMMON_LANGUAGES.has(token));
    return bare || '';
  }

  function removeCodeChrome(root) {
    queryAll(root, [
      'button',
      '[role="button"]',
      '[class*="copy"]',
      '[class*="clipboard"]',
      '[class*="codeblock-button"]',
      '[class*="fullscreen"]',
      'style',
      'svg'
    ].join(',')).forEach((node) => {
      if (node.tagName === 'SPAN' && normalizeText(node.textContent).length > 30) return;
      node.remove();
    });

    queryAll(root, '[class*="header"], [class*="toolbar"], [class*="titlebar"], [class*="title-bar"]').forEach((node) => {
      if (normalizeText(node.textContent).split(/\s+/).length <= 6 && !node.querySelector('code, pre, [data-line], .line')) {
        node.remove();
      }
    });
  }

  function removeLineGutters(root) {
    queryAll(root, [
      '.lineno',
      '.rouge-gutter',
      '.react-syntax-highlighter-line-number',
      '.line-number',
      '.gutter',
      '[class*="line-number"]',
      '[class*="gutter"]'
    ].join(',')).forEach((node) => node.remove());
  }

  function replaceBreaksWithNewlines(root) {
    queryAll(root, 'br, br-keep').forEach((br) => {
      br.replaceWith(root.ownerDocument.createTextNode('\n'));
    });
  }

  function dedentCode(text) {
    const normalized = String(text || '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').replace(/\u200b/g, '');
    const lines = normalized.replace(/[ \t]+$/gm, '').split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    const indents = lines
      .filter((line) => line.trim())
      .map((line) => line.match(/^[ \t]*/)?.[0]?.length || 0);
    const minIndent = indents.length ? Math.min(...indents) : 0;
    return minIndent > 0
      ? lines.map((line) => line.slice(Math.min(minIndent, line.match(/^[ \t]*/)?.[0]?.length || 0))).join('\n')
      : lines.join('\n');
  }

  function lineTextFromElement(lineEl) {
    const clone = lineEl.cloneNode(true);
    removeCodeChrome(clone);
    removeLineGutters(clone);
    replaceBreaksWithNewlines(clone);

    const children = Array.from(clone.children || []);
    if (children.length === 2 && /^\d+$/.test(normalizeText(children[0].textContent))) {
      return children[1].textContent || '';
    }
    return clone.textContent || '';
  }

  function extractStructuredCodeText(el) {
    const clone = el.cloneNode(true);
    removeCodeChrome(clone);
    removeLineGutters(clone);

    const lineNodes = queryAll(clone, '[data-line], [data-line-number], .ec-line, .line')
      .filter((line) => normalizeText(line.textContent));
    if (lineNodes.length >= 2) {
      return dedentCode(lineNodes.map(lineTextFromElement).join('\n'));
    }

    const cmContent = clone.matches?.('.cm-content') ? clone : clone.querySelector?.('.cm-content');
    if (cmContent) {
      return dedentCode(Array.from(cmContent.children || [])
        .map((child) => child.textContent || '')
        .join('\n'));
    }

    replaceBreaksWithNewlines(clone);

    const directRows = Array.from(clone.children || []).filter((child) => (
      /^(DIV|SPAN)$/.test(child.tagName) && normalizeText(child.textContent)
    ));
    if (directRows.length >= 3 && !clone.querySelector('p, article, section')) {
      return dedentCode(directRows.map((row) => row.textContent || '').join('\n'));
    }

    return dedentCode(clone.textContent || '');
  }

  function looksLikeCodeContainer(el) {
    if (!el) return false;
    if (el.tagName === 'PRE' || el.tagName === 'CODE') return true;
    if (el.querySelector?.('pre, code, [data-line], [data-line-number], .ec-line, .cm-content')) return true;
    const combined = `${el.tagName || ''} ${el.getAttribute?.('class') || ''} ${el.getAttribute?.('data-lang') || ''} ${el.getAttribute?.('data-language') || ''}`;
    if (/\b(syntaxhighlighter|codehilite|highlight-source|wp-block-code|language-|lang-|brush:|cm-content)\b/i.test(combined)) {
      return true;
    }
    const text = el.textContent || '';
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    return lines.length >= 3 && /[{}();=<>\[\]$]|^\s*(const|let|var|function|class|import|def|SELECT|curl|npm)\b/im.test(text);
  }

  function standardizeCodeBlocks(root) {
    const body = getBody(root);
    if (!body) return;
    const candidates = uniqueElements(queryAll(body, CODE_CONTAINER_SELECTOR));
    candidates.forEach((el) => {
      if (!el.parentNode || el.closest?.('[data-ms-reader-code-normalized]')) return;
      if (el.tagName !== 'PRE' && el.closest?.('pre')) return;
      if (!looksLikeCodeContainer(el)) return;

      const codeText = extractStructuredCodeText(el);
      if (!codeText.trim()) return;

      const doc = el.ownerDocument;
      const language = detectCodeLanguage(el) || detectCodeLanguage(el.querySelector?.('code') || {});
      const pre = doc.createElement('pre');
      pre.setAttribute('data-ms-reader-code-normalized', 'true');
      const code = doc.createElement('code');
      if (language) {
        code.className = `language-${language}`;
        code.setAttribute('data-ms-reader-language', language);
      }
      code.textContent = codeText;
      pre.appendChild(code);
      el.replaceWith(pre);
    });
  }

  function isPlaceholderImageSrc(src) {
    const value = String(src || '').trim();
    if (!value) return true;
    if (/^data:image\/svg\+xml/i.test(value)) return true;
    const match = value.match(/^data:image\/[^;]+;base64,(.+)$/i);
    return !!match && match[1].length < 140;
  }

  function isUsableImageSrc(src) {
    const value = String(src || '').trim();
    if (!value || isPlaceholderImageSrc(value)) return false;
    if (/^(?:javascript|mailto|tel|about):/i.test(value)) return false;
    return true;
  }

  function parseSrcsetCandidates(srcset) {
    const value = String(srcset || '').trim();
    if (!value) return [];
    return value.split(',')
      .map((candidate, index) => {
        const parts = candidate.trim().split(/\s+/);
        const url = parts.shift() || '';
        const descriptor = parts.find((part) => /^[\d.]+[wx]$/i.test(part)) || '';
        const amount = parseFloat(descriptor) || 0;
        const unit = descriptor.slice(-1).toLowerCase();
        return { url, amount, unit, index };
      })
      .filter((candidate) => isUsableImageSrc(candidate.url));
  }

  function bestSrcsetUrl(srcset) {
    const candidates = parseSrcsetCandidates(srcset);
    if (!candidates.length) return '';
    const widthCandidates = candidates.filter((candidate) => candidate.unit === 'w' && candidate.amount > 0);
    if (widthCandidates.length) {
      widthCandidates.sort((a, b) => a.amount - b.amount || a.index - b.index);
      return widthCandidates[widthCandidates.length - 1].url;
    }
    const densityCandidates = candidates.filter((candidate) => candidate.unit === 'x' && candidate.amount > 0);
    if (densityCandidates.length) {
      densityCandidates.sort((a, b) => a.amount - b.amount || a.index - b.index);
      return densityCandidates[densityCandidates.length - 1].url;
    }
    return candidates[candidates.length - 1].url;
  }

  function srcsetStrength(srcset, fallbackIndex = 0) {
    const candidates = parseSrcsetCandidates(srcset);
    const widths = candidates.filter((candidate) => candidate.unit === 'w' && candidate.amount > 0);
    if (widths.length) {
      return {
        group: 2,
        amount: Math.max(...widths.map((candidate) => candidate.amount)),
        fallbackIndex
      };
    }
    const densities = candidates.filter((candidate) => candidate.unit === 'x' && candidate.amount > 0);
    if (densities.length) {
      return {
        group: 1,
        amount: Math.max(...densities.map((candidate) => candidate.amount)),
        fallbackIndex
      };
    }
    return {
      group: candidates.length ? 0 : -1,
      amount: candidates.length,
      fallbackIndex
    };
  }

  function compareSrcsetStrength(a, b) {
    return a.group - b.group || a.amount - b.amount || a.fallbackIndex - b.fallbackIndex;
  }

  const LAZY_SRC_ATTRS = [
    'data-src',
    'data-original',
    'data-original-src',
    'data-lazy-src',
    'data-actualsrc',
    'data-full-src',
    'data-large-src',
    'data-hi-res-src',
    'data-image-src'
  ];

  const LAZY_SRCSET_ATTRS = [
    'data-srcset',
    'data-lazy-srcset',
    'data-original-set',
    'data-original-srcset',
    'data-responsive-srcset'
  ];

  function getFirstAttributeValue(el, names) {
    for (const name of names) {
      const value = el.getAttribute?.(name);
      if (value) return value;
    }
    return '';
  }

  function findSrcsetLikeAttribute(el) {
    const ignored = new Set([
      'alt',
      'class',
      'height',
      'id',
      'loading',
      'role',
      'sizes',
      'src',
      'srcset',
      'style',
      'title',
      'width'
    ]);
    const attrs = Array.from(el?.attributes || []);
    for (const attr of attrs) {
      const name = String(attr.name || '').toLowerCase();
      const value = String(attr.value || '').trim();
      if (!value || ignored.has(name) || /^aria-|^data-ms-reader-/.test(name)) continue;
      if (/\s+[\d.]+[wx](?:\s*,|$)/i.test(value) && bestSrcsetUrl(value)) {
        return value;
      }
    }
    return '';
  }

  function normalizeImageElement(img) {
    if (!img) return;
    const srcSetAttr = img.getAttribute('srcSet');
    if (!img.getAttribute('srcset') && srcSetAttr) {
      img.setAttribute('srcset', srcSetAttr);
      img.removeAttribute('srcSet');
    }

    const lazySrcset = getFirstAttributeValue(img, LAZY_SRCSET_ATTRS) || findSrcsetLikeAttribute(img);
    if (!img.getAttribute('srcset') && lazySrcset) {
      img.setAttribute('srcset', lazySrcset);
    }

    const src = img.getAttribute('src') || '';
    const lazySrc = getFirstAttributeValue(img, LAZY_SRC_ATTRS);
    if ((!src || isPlaceholderImageSrc(src)) && isUsableImageSrc(lazySrc)) {
      img.setAttribute('src', lazySrc);
    }

    const currentSrc = img.getAttribute('src') || '';
    if ((!currentSrc || isPlaceholderImageSrc(currentSrc)) && img.getAttribute('srcset')) {
      const best = bestSrcsetUrl(img.getAttribute('srcset'));
      if (best) img.setAttribute('src', best);
    }

    [...LAZY_SRC_ATTRS, ...LAZY_SRCSET_ATTRS].forEach((attr) => {
      img.removeAttribute(attr);
    });
  }

  function normalizeSourceElement(source) {
    if (!source) return;
    const srcSetAttr = source.getAttribute('srcSet');
    if (!source.getAttribute('srcset') && srcSetAttr) {
      source.setAttribute('srcset', srcSetAttr);
      source.removeAttribute('srcSet');
    }
    const lazySrcset = getFirstAttributeValue(source, LAZY_SRCSET_ATTRS) || findSrcsetLikeAttribute(source);
    if (!source.getAttribute('srcset') && lazySrcset) {
      source.setAttribute('srcset', lazySrcset);
    }
    LAZY_SRCSET_ATTRS.forEach((attr) => {
      source.removeAttribute(attr);
    });
  }

  function normalizeImageAttributes(root) {
    queryAll(root, 'source').forEach(normalizeSourceElement);
    queryAll(root, 'img').forEach(normalizeImageElement);
  }

  function parseNoscriptImages(noscript) {
    const doc = noscript?.ownerDocument;
    if (!doc) return [];
    const sources = Array.from(new Set([
      noscript.innerHTML || '',
      noscript.textContent || ''
    ].map((value) => String(value || '').trim()).filter(Boolean)));

    const images = [];
    sources.forEach((source) => {
      const holder = doc.createElement('template');
      holder.innerHTML = source;
      const fragment = holder.content || holder;
      queryAll(fragment, 'img').forEach((img) => {
        normalizeImageElement(img);
        if (isUsableImageSrc(img.getAttribute('src')) || bestSrcsetUrl(img.getAttribute('srcset'))) {
          images.push(img);
        }
      });
    });
    return images;
  }

  function imageAltKey(img) {
    return normalizeText(img?.getAttribute?.('alt') || '').toLowerCase();
  }

  function isPlaceholderImageElement(img) {
    const src = img?.getAttribute?.('src') || '';
    const srcset = img?.getAttribute?.('srcset') || '';
    return (!src || isPlaceholderImageSrc(src)) && !bestSrcsetUrl(srcset);
  }

  function contextTextForLazyImage(node) {
    const values = [];
    let current = node?.parentElement || null;
    for (let depth = 0; current && depth < 3; depth += 1, current = current.parentElement) {
      values.push(current.tagName || '', current.getAttribute?.('class') || '', current.getAttribute?.('id') || '', current.getAttribute?.('role') || '');
    }
    [node?.previousElementSibling, node?.nextElementSibling].forEach((sibling) => {
      if (sibling) values.push(sibling.tagName || '', sibling.getAttribute?.('class') || '', sibling.getAttribute?.('id') || '');
    });
    return values.join(' ');
  }

  function isLazyImageContext(node) {
    const parent = node?.parentElement;
    if (!parent) return false;
    if (parent.closest?.('figure, picture')) return true;
    const adjacentMedia = [node.previousElementSibling, node.nextElementSibling].some((sibling) => (
      sibling?.matches?.('img, picture') || !!sibling?.querySelector?.('img, picture, source')
    ));
    if (adjacentMedia) return true;
    if ((parent.children?.length || 0) <= 4 && parent.querySelector?.('img, picture, source')) return true;
    return /\b(lazy|image|img|picture|photo|media|figure|embed|responsive|thumbnail|poster|nimg)\b/i.test(contextTextForLazyImage(node));
  }

  function findNoscriptPlaceholder(noscript, sourceImg) {
    const parent = noscript?.parentElement;
    if (!parent) return null;
    const sourceAlt = imageAltKey(sourceImg);
    const candidates = queryAll(parent, 'img').filter((img) => (
      !img.closest?.('noscript') &&
      isPlaceholderImageElement(img)
    ));
    if (!candidates.length) return null;
    if (sourceAlt) {
      const matchingAlt = candidates.find((img) => imageAltKey(img) === sourceAlt);
      if (matchingAlt) return matchingAlt;
    }
    return candidates.length === 1 && isLazyImageContext(noscript) ? candidates[0] : null;
  }

  function copyImageSourceAttributes(source, target) {
    if (!source || !target) return;
    ['src', 'srcset', 'sizes', 'alt', 'title', 'width', 'height', 'loading', 'decoding'].forEach((attr) => {
      const value = source.getAttribute?.(attr);
      if (value && (attr !== 'src' || isUsableImageSrc(value))) {
        target.setAttribute(attr, value);
      }
    });
    normalizeImageElement(target);
  }

  function resolveNoscriptImages(root) {
    queryAll(root, 'noscript').forEach((noscript) => {
      const images = parseNoscriptImages(noscript);
      if (!images.length) return;

      let recovered = false;
      images.forEach((sourceImg) => {
        const placeholder = findNoscriptPlaceholder(noscript, sourceImg);
        if (placeholder) {
          copyImageSourceAttributes(sourceImg, placeholder);
          recovered = true;
          return;
        }

        if (isLazyImageContext(noscript)) {
          const clone = sourceImg.cloneNode(true);
          clone.setAttribute('data-ms-reader-recovered-image', 'noscript');
          noscript.parentNode?.insertBefore(clone, noscript);
          recovered = true;
        }
      });

      if (recovered) {
        noscript.remove();
      }
    });
  }

  function normalizeLazyImages(root) {
    queryAll(root, 'img').forEach((img) => {
      normalizeImageElement(img);
    });
  }

  function normalizePictures(root) {
    queryAll(root, 'picture').forEach((picture) => {
      queryAll(picture, 'source').forEach(normalizeSourceElement);
      let img = picture.querySelector('img');
      const sources = Array.from(picture.querySelectorAll('source')).filter((candidate) => candidate.getAttribute('srcset'));
      const source = sources
        .map((candidate, index) => ({
          candidate,
          strength: srcsetStrength(candidate.getAttribute('srcset'), index)
        }))
        .sort((a, b) => compareSrcsetStrength(a.strength, b.strength))[sources.length - 1]?.candidate || null;
      const srcset = source?.getAttribute('srcset') || '';
      if (!img && srcset) {
        img = picture.ownerDocument.createElement('img');
        picture.appendChild(img);
      }
      if (img && srcset && !img.getAttribute('srcset')) {
        img.setAttribute('srcset', srcset);
      }
      if (img) {
        normalizeImageElement(img);
        if (!img.getAttribute('src')) {
          const best = bestSrcsetUrl(img.getAttribute('srcset') || srcset);
          if (best) img.setAttribute('src', best);
        }
      }
    });
  }

  function removeResolvedImagePlaceholders(root) {
    queryAll(root, 'img').forEach((img) => {
      if (!img.parentNode || !isPlaceholderImageElement(img)) return;
      const container = img.closest?.('picture, figure, p, div, span') || img.parentElement;
      const nearbyImages = queryAll(container, 'img').filter((candidate) => candidate !== img);
      const alt = imageAltKey(img);
      const hasResolvedPeer = nearbyImages.some((candidate) => (
        !isPlaceholderImageElement(candidate) &&
        (!alt || imageAltKey(candidate) === alt || nearbyImages.length === 1)
      ));
      if (hasResolvedPeer) {
        img.remove();
      }
    });
  }

  function captionCandidate(container) {
    const selectors = [
      'figcaption',
      '[class*="caption"]',
      '[class*="credit"]',
      '[class*="description"]',
      'em',
      'small'
    ];
    for (const selector of selectors) {
      const found = container.querySelector?.(selector);
      if (found && normalizeText(found.textContent).length >= 5 && !found.querySelector('img, picture')) {
        return found;
      }
    }
    return null;
  }

  function cloneMediaNodeForFigure(media, container) {
    const link = media.closest?.('a');
    if (
      link &&
      container?.contains?.(link) &&
      link.querySelectorAll?.('img, picture').length === 1 &&
      !normalizeText(link.textContent)
    ) {
      return link.cloneNode(true);
    }
    return media.cloneNode(true);
  }

  function mediaCaptionText(media) {
    const img = media.matches?.('img') ? media : media.querySelector?.('img');
    const raw = img?.getAttribute?.('alt') || img?.getAttribute?.('title') || media.getAttribute?.('title') || '';
    const text = normalizeText(raw);
    if (text.length < 5 || text.length > 180) return '';
    if (/^(?:image|photo|picture|screenshot|figure|diagram|logo|icon|thumbnail|avatar|decorative)$/i.test(text)) {
      return '';
    }
    if (/^(?:https?:|data:image\/)/i.test(text)) return '';
    return text;
  }

  function normalizeImageFigures(root) {
    queryAll(root, 'span, div, p').forEach((container) => {
      if (!container.parentNode || container.closest('figure')) return;
      const images = queryAll(container, 'img, picture');
      if (images.length !== 1) return;
      const caption = captionCandidate(container);
      if (!caption && container.closest?.(`blockquote[${MS_BLOCK}="callout"]`)) return;
      const inferredCaption = caption ? '' : mediaCaptionText(images[0]);
      if (!caption && !inferredCaption) return;
      const textWithoutCaption = caption
        ? normalizeText(container.textContent).replace(normalizeText(caption.textContent), '').trim()
        : normalizeText(container.textContent);
      if (caption ? textWithoutCaption.length > 80 : textWithoutCaption.length > 0) return;

      const doc = container.ownerDocument;
      const figure = doc.createElement('figure');
      figure.appendChild(cloneMediaNodeForFigure(images[0], container));
      const figcaption = doc.createElement('figcaption');
      if (caption) {
        cloneChildren(caption, figcaption);
      } else {
        figcaption.textContent = inferredCaption;
      }
      figure.appendChild(figcaption);
      container.replaceWith(figure);
    });
  }

  function standardizeImages(root) {
    const body = getBody(root);
    if (!body) return;
    normalizeImageAttributes(body);
    resolveNoscriptImages(body);
    normalizePictures(body);
    normalizeLazyImages(body);
    removeResolvedImagePlaceholders(body);
    normalizeImageFigures(body);
  }

  function normalizeFootnoteKey(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/^#/, '');
    if (!raw) return '';
    return raw
      .replace(/^fnref[:_-]?/, '')
      .replace(/^footnoteref[:_-]?/, '')
      .replace(/^footnote-reference[:_-]?/, '')
      .replace(/^footnote[:_-]?/, '')
      .replace(/^fn[:_-]?/, '')
      .replace(/^_?ftn(?:ref)?[:_-]?/, '')
      .replace(/^ftnt(?:_ref)?[:_-]?/, '')
      .replace(/[^a-z0-9]+/g, '');
  }

  function cleanFootnoteContent(node) {
    const clone = node.cloneNode(true);
    queryAll(clone, 'a[href^="#fnref"], a[href^="#footnoteref"], .footnote-backref, .reversefootnote').forEach((el) => el.remove());
    const leadingMarker = clone.querySelector?.('sup:first-child, .footnote-definition-label');
    if (leadingMarker && /^\[?\d+\]?$/.test(normalizeText(leadingMarker.textContent))) {
      leadingMarker.remove();
    }
    return clone;
  }

  function collectFootnoteDefinitions(root) {
    const definitions = [];
    uniqueElements([
      ...queryAll(root, '#footnotes li[id], .footnotes li[id], [role="doc-endnotes"] li[id], [role="doc-endnote"][id]'),
      ...queryAll(root, 'li[id^="fn"], li[id^="footnote"], .footnote-definition[id], div.footnote[id], p[id^="ftnt"], p.footnote')
    ]).forEach((el) => {
      if (!el.parentNode || el.closest?.('#ms-reader-footnotes, [data-ms-reader-block="footnotes"]')) return;
      let originalId = el.id || '';
      let explicitNumber = '';
      if (!originalId && el.matches?.('p.footnote')) {
        explicitNumber = normalizeText(el.querySelector('sup')?.textContent || el.textContent).match(/\d{1,4}/)?.[0] || '';
        originalId = explicitNumber ? `footnote-${explicitNumber}` : '';
      }
      const key = normalizeFootnoteKey(originalId || explicitNumber);
      if (!key) return;
      const strongFootnoteSignal = !!el.closest?.('#footnotes, .footnotes, [role="doc-endnotes"]') ||
        el.matches?.('[role="doc-endnote"], .footnote-definition, div.footnote, p.footnote, p[id^="ftnt"]');
      if (!strongFootnoteSignal && !/\d/.test(key)) return;
      definitions.push({
        key,
        originalId,
        node: el,
        content: cleanFootnoteContent(el)
      });
    });
    return definitions;
  }

  function createFootnoteRef(doc, number, refId) {
    const sup = doc.createElement('sup');
    sup.className = 'ms-reader-footnote-ref';
    const anchor = doc.createElement('a');
    anchor.href = `#ms-reader-fn-${number}`;
    anchor.id = refId;
    anchor.className = 'ms-reader-footnote-link';
    anchor.rel = 'footnote';
    anchor.textContent = String(number);
    sup.appendChild(anchor);
    return sup;
  }

  function standardizeFootnotes(root) {
    const body = getBody(root);
    if (!body || body.querySelector('#ms-reader-footnotes')) return;
    const definitions = collectFootnoteDefinitions(body);
    if (!definitions.length) return;

    const byKey = new Map();
    definitions.forEach((definition) => {
      if (!byKey.has(definition.key)) {
        byKey.set(definition.key, {
          ...definition,
          number: byKey.size + 1,
          refs: []
        });
      }
    });

    queryAll(body, 'a[href^="#"]').forEach((anchor) => {
      if (!anchor.parentNode || anchor.closest('#footnotes, .footnotes, [role="doc-endnotes"], [role="doc-endnote"]')) return;
      const key = normalizeFootnoteKey(anchor.getAttribute('href'));
      const definition = byKey.get(key);
      if (!definition) return;
      const refId = `ms-reader-fnref-${definition.number}-${definition.refs.length + 1}`;
      definition.refs.push(refId);
      const container = anchor.parentElement?.tagName === 'SUP' ? anchor.parentElement : anchor;
      container.replaceWith(createFootnoteRef(anchor.ownerDocument, definition.number, refId));
    });

    const usedDefinitions = Array.from(byKey.values()).filter((definition) => definition.refs.length > 0);
    if (!usedDefinitions.length) return;

    const doc = body.ownerDocument;
    const section = doc.createElement('section');
    section.id = 'ms-reader-footnotes';
    section.className = 'ms-reader-footnotes';
    section.setAttribute(MS_BLOCK, 'footnotes');
    const list = doc.createElement('ol');
    usedDefinitions.forEach((definition) => {
      const item = doc.createElement('li');
      item.id = `ms-reader-fn-${definition.number}`;
      item.className = 'ms-reader-footnote';
      cloneChildren(definition.content, item);
      definition.refs.forEach((refId) => {
        const backref = doc.createElement('a');
        backref.href = `#${refId}`;
        backref.className = 'ms-reader-footnote-backref';
        backref.rel = 'reversefootnote';
        backref.textContent = 'back';
        item.appendChild(doc.createTextNode(' '));
        item.appendChild(backref);
      });
      list.appendChild(item);
    });
    section.appendChild(list);

    const containersToClean = new Set();
    definitions.forEach((definition) => {
      const container = definition.node.closest?.('#footnotes, .footnotes, [role="doc-endnotes"]');
      if (container) containersToClean.add(container);
      else definition.node.remove();
    });
    containersToClean.forEach((container) => container.remove());
    body.appendChild(section);
  }

  function replaceElementTag(el, tagName) {
    const doc = el.ownerDocument;
    const replacement = doc.createElement(tagName);
    Array.from(el.attributes || []).forEach((attr) => replacement.setAttribute(attr.name, attr.value));
    transferChildren(el, replacement);
    el.replaceWith(replacement);
    return replacement;
  }

  function standardizeDropCaps(root) {
    queryAll(root, 'span[data-caps="initial"]').forEach((span) => {
      const next = span.nextSibling;
      if (next?.nodeType === 3 && /^[A-Z][A-Z\s]+/.test(next.nodeValue || '')) {
        next.nodeValue = String(next.nodeValue || '').replace(/^\s+/, '');
      }
    });
  }

  function convertDataAsSpans(root) {
    const allowed = new Set(['p', 'div', 'section', 'aside', 'figure', 'figcaption']);
    queryAll(root, 'span[data-as]').forEach((span) => {
      const tag = String(span.getAttribute('data-as') || '').toLowerCase();
      if (allowed.has(tag)) {
        replaceElementTag(span, tag);
      }
    });
  }

  function convertBlockSpans(root) {
    queryAll(root, 'span[class*="block"], span[style*="block"]').forEach((span) => {
      if (span.closest('pre, code')) return;
      replaceElementTag(span, 'p');
    });
  }

  function replaceCustomElements(root) {
    queryAll(root, '*').forEach((el) => {
      const tag = String(el.tagName || '').toLowerCase();
      if (!tag.includes('-')) return;
      if (tag === 'br-keep' || tag.startsWith('mjx-') || tag.includes('math')) return;
      if (el.hasAttribute('marksnip-latex') || el.querySelector('math, [marksnip-latex]')) return;
      replaceElementTag(el, 'div');
    });
  }

  function unwrapLayoutTables(root) {
    queryAll(root, 'table').forEach((table) => {
      if (table.querySelector('th, caption, thead, tfoot')) return;
      const rows = queryAll(table, 'tr');
      const cells = queryAll(table, 'td');
      if (rows.length > 1 || cells.length !== 1) return;
      const cell = cells[0];
      const fragment = table.ownerDocument.createDocumentFragment();
      transferChildren(cell, fragment);
      table.replaceWith(fragment);
    });
  }

  function removePermalinkAnchors(root) {
    queryAll(root, 'a').forEach((anchor) => {
      const combined = `${anchor.getAttribute('class') || ''} ${anchor.getAttribute('id') || ''} ${anchor.getAttribute('aria-label') || ''} ${anchor.getAttribute('title') || ''}`;
      const text = normalizeText(anchor.textContent);
      const isPermalinkGlyph = text === '#' || (text.length === 1 && [167, 182].includes(text.charCodeAt(0)));
      if (/\b(anchor|permalink|heading-link)\b/i.test(combined) && (!text || isPermalinkGlyph)) {
        anchor.remove();
      }
    });
  }

  function removeTrailingHeadings(root) {
    let node = root.lastElementChild;
    while (node && (/^H[1-6]$/.test(node.tagName) || node.tagName === 'HR') && !normalizeText(node.textContent)) {
      const prev = node.previousElementSibling;
      node.remove();
      node = prev;
    }
  }

  function removeOrphanedDividers(root) {
    while (root.firstElementChild?.tagName === 'HR') {
      root.firstElementChild.remove();
    }
    while (root.lastElementChild?.tagName === 'HR') {
      root.lastElementChild.remove();
    }
  }

  const PAGE_METADATA_KEYS = new Set([
    'alias',
    'aliases',
    'author',
    'canonical',
    'categories',
    'category',
    'cover',
    'date',
    'description',
    'draft',
    'excerpt',
    'image',
    'keywords',
    'lang',
    'language',
    'layout',
    'mobile',
    'permalink',
    'publish',
    'published',
    'slug',
    'summary',
    'tag',
    'tags',
    'title',
    'type',
    'url'
  ]);

  function metadataKeyFromLine(line) {
    const match = String(line || '').match(/^\s*([a-z][a-z0-9_. -]{0,40})\s*:/i);
    return match ? match[1].toLowerCase().replace(/[\s_.-]+/g, '') : '';
  }

  function metadataValueFromLine(line) {
    const match = String(line || '').match(/^\s*[a-z][a-z0-9_. -]{0,40}\s*:\s*(.+?)\s*$/i);
    return normalizeText(match?.[1] || '');
  }

  function followingTextFrom(node, limit = 1200) {
    const parts = [];
    let scope = node || null;
    while (scope?.parentNode && parts.join(' ').length < limit) {
      let current = scope.nextSibling;
      while (current && parts.join(' ').length < limit) {
        if (current.nodeType === Node.TEXT_NODE) {
          parts.push(current.nodeValue || '');
        } else if (current.nodeType === Node.ELEMENT_NODE && !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(current.tagName)) {
          parts.push(current.textContent || '');
        }
        current = current.nextSibling;
      }
      scope = scope.parentNode;
    }
    return normalizeText(parts.join(' '));
  }

  function isLikelyPageMetadataText(text, followingText) {
    const lines = String(text || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 3 || lines.length > 40) return false;
    if (lines.join('\n').length > 2400) return false;

    let keyedLines = 0;
    let continuationLines = 0;
    let unrecognizedLines = 0;
    const recognizedKeys = new Set();
    const values = [];
    let previousWasKey = false;
    let hasDelimiter = false;

    lines.forEach((line) => {
      if (/^(?:---|\+\+\+)$/.test(line)) {
        hasDelimiter = true;
        previousWasKey = false;
        return;
      }

      const key = metadataKeyFromLine(line);
      if (key) {
        keyedLines += 1;
        previousWasKey = true;
        if (PAGE_METADATA_KEYS.has(key)) {
          recognizedKeys.add(key);
          values.push(metadataValueFromLine(line));
        }
        return;
      }

      if (previousWasKey && /^[-*]\s+\S+/.test(line)) {
        continuationLines += 1;
        return;
      }

      previousWasKey = false;
      unrecognizedLines += 1;
    });

    const structuralLines = keyedLines + continuationLines + (hasDelimiter ? 1 : 0);
    const structuralRatio = structuralLines / lines.length;
    const recognizedCount = recognizedKeys.size;
    const hasPageOnlyKey = ['aliases', 'draft', 'layout', 'permalink', 'publish', 'slug', 'tags'].some((key) => (
      recognizedKeys.has(key)
    ));
    const normalizedFollowing = normalizeText(followingText).toLowerCase();
    const repeatsVisibleSummary = values.some((value) => (
      value.length >= 40 && normalizedFollowing.includes(value.slice(0, 120).toLowerCase())
    ));

    return keyedLines >= 3 &&
      structuralRatio >= 0.72 &&
      unrecognizedLines <= 2 &&
      (
        repeatsVisibleSummary ||
        (hasDelimiter && recognizedCount >= 2) ||
        recognizedCount >= 4 ||
        (recognizedCount >= 3 && hasPageOnlyKey && normalizedFollowing.length >= 200)
      );
  }

  function firstSignificantElement(root) {
    let node = root?.firstChild || null;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE && !normalizeText(node.nodeValue)) {
        node = node.nextSibling;
        continue;
      }
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
        node = node.nextSibling;
        continue;
      }
      return node.nodeType === Node.ELEMENT_NODE ? node : null;
    }
    return null;
  }

  function leadingContentRoots(root) {
    const roots = [];
    let current = root;
    for (let depth = 0; current && depth < 4; depth += 1) {
      roots.push(current);
      const first = firstSignificantElement(current);
      if (
        !first ||
        !/^(ARTICLE|DIV|MAIN|SECTION)$/.test(first.tagName) ||
        first.hasAttribute(MS_BLOCK) ||
        first.matches?.('pre, code, figure, table, blockquote')
      ) {
        break;
      }
      current = first;
    }
    return roots;
  }

  function metadataCandidateText(el) {
    if (!el) return '';
    if (el.matches?.('pre, code')) return el.textContent || '';
    const pre = Array.from(el.children || []).find((child) => /^(PRE|CODE)$/.test(child.tagName));
    if (pre && queryAll(el, 'pre, code').length === 1) {
      return pre.textContent || '';
    }
    const combined = `${el.getAttribute?.('class') || ''} ${el.getAttribute?.('id') || ''} ${el.getAttribute?.('data-type') || ''}`;
    if (/\b(?:frontmatter|metadata|properties|property-list)\b/i.test(combined)) {
      return el.textContent || '';
    }
    return '';
  }

  function stripLeadingPageMetadataBlocks(root) {
    leadingContentRoots(root).forEach((contentRoot) => {
      removeLeadingEmptyNodes(contentRoot);
      const candidate = firstSignificantElement(contentRoot);
      if (!candidate) return;
      const text = metadataCandidateText(candidate);
      if (!text) return;
      const followingText = followingTextFrom(candidate);
      if (followingText.length < 200) return;
      if (!isLikelyPageMetadataText(text, followingText)) return;
      candidate.remove();
      removeLeadingEmptyNodes(contentRoot);
    });
  }

  function standardizeCleanup(root) {
    const body = getBody(root);
    if (!body) return;
    stripLeadingPageMetadataBlocks(body);
    standardizeDropCaps(body);
    convertDataAsSpans(body);
    convertBlockSpans(body);
    replaceCustomElements(body);
    unwrapLayoutTables(body);
    removePermalinkAnchors(body);
    removeOrphanedDividers(body);
    removeTrailingHeadings(body);
  }

  function prepareReaderDomForReadability(dom) {
    const body = getBody(dom);
    if (!body) return dom;
    standardizeCallouts(body);
    standardizeCodeBlocks(body);
    standardizeImages(body);
    standardizeFootnotes(body);
    standardizeCleanup(body);
    return dom;
  }

  function convertCalloutCarriers(root) {
    queryAll(root, `[${MS_BLOCK}="callout"]`).forEach((carrier) => {
      if (!carrier.parentNode) return;
      const doc = carrier.ownerDocument;
      const type = normalizeCalloutType(carrier.getAttribute(MS_TYPE));
      const titleRole = carrier.querySelector(`[${MS_ROLE}="title"]`);
      const title = normalizeText(carrier.getAttribute(MS_TITLE) || titleRole?.textContent) || titleForType(type);
      if (titleRole) titleRole.remove();

      const card = doc.createElement('div');
      card.className = `ms-reader-card ms-reader-callout ms-reader-callout-${type}`;
      card.setAttribute(MS_BLOCK, 'callout');
      card.setAttribute(MS_TYPE, type);
      const source = carrier.getAttribute(MS_SOURCE);
      if (source) card.setAttribute(MS_SOURCE, source);

      const titleEl = doc.createElement('div');
      titleEl.className = 'ms-reader-callout-title';
      titleEl.setAttribute(MS_ROLE, 'title');
      titleEl.textContent = title;
      card.appendChild(titleEl);

      const contentEl = doc.createElement('div');
      contentEl.className = 'ms-reader-callout-content';
      contentEl.setAttribute(MS_ROLE, 'content');
      transferChildren(carrier, contentEl);
      card.appendChild(contentEl);
      carrier.replaceWith(card);
    });
  }

  function markReaderCodeBlocks(root) {
    queryAll(root, 'pre code').forEach((code) => {
      const language = detectCodeLanguage(code) || detectCodeLanguage(code.parentElement || {});
      code.parentElement?.classList?.add('ms-reader-code-block');
      if (language) {
        code.className = `language-${language}`;
        code.setAttribute('data-ms-reader-language', language);
      }
    });
  }

  function markFigures(root) {
    queryAll(root, 'figure').forEach((figure) => {
      figure.classList?.add('ms-reader-figure');
      figure.setAttribute(MS_BLOCK, 'figure');
      figure.querySelector('figcaption')?.classList?.add('ms-reader-figcaption');
    });
  }

  function enhanceReaderArticleHtml(articleHtml) {
    const html = String(articleHtml || '');
    if (!html.trim()) return html;
    const parser = new DOMParser();
    const parsed = parser.parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
    const body = parsed.body;
    stripLeadingPageMetadataBlocks(body);
    standardizeFootnotes(body);
    convertCalloutCarriers(body);
    standardizeImages(body);
    standardizeCleanup(body);
    markReaderCodeBlocks(body);
    markFigures(body);
    return body.innerHTML;
  }

  return {
    prepareReaderDomForReadability,
    enhanceReaderArticleHtml,
    _standardizeCallouts: standardizeCallouts,
    _standardizeCodeBlocks: standardizeCodeBlocks,
    _standardizeFootnotes: standardizeFootnotes,
    _standardizeImages: standardizeImages,
    _standardizeCleanup: standardizeCleanup
  };
});
