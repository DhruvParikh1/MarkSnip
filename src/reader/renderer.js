(function (root, factory) {
  const api = factory(root);
  root.markSnipReader = Object.assign(root.markSnipReader || {}, api);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  function splitSelectorList(selectorText) {
    const selectors = [];
    let current = '';
    let depth = 0;
    let quote = '';
    for (let i = 0; i < selectorText.length; i++) {
      const char = selectorText[i];
      if (quote) {
        current += char;
        if (char === quote && selectorText[i - 1] !== '\\') quote = '';
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        current += char;
        continue;
      }
      if (char === '(' || char === '[') depth += 1;
      if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
      if (char === ',' && depth === 0) {
        selectors.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) selectors.push(current.trim());
    return selectors;
  }

  function prefixSelector(selector, prefix) {
    const trimmed = selector.trim();
    if (!trimmed || trimmed.startsWith(prefix)) return trimmed;
    return `${prefix} ${trimmed}`;
  }

  function scopeReaderCustomCss(cssText, prefix = '.ms-reader-root') {
    const css = String(cssText || '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!css) return '';

    let output = '';
    let index = 0;
    while (index < css.length) {
      const open = css.indexOf('{', index);
      if (open === -1) {
        output += css.slice(index);
        break;
      }
      const prelude = css.slice(index, open).trim();
      let depth = 1;
      let cursor = open + 1;
      while (cursor < css.length && depth > 0) {
        if (css[cursor] === '{') depth += 1;
        if (css[cursor] === '}') depth -= 1;
        cursor += 1;
      }
      const body = css.slice(open + 1, cursor - 1).trim();
      if (!prelude) {
        index = cursor;
        continue;
      }
      if (/^@(keyframes|font-face|page|property)\b/i.test(prelude)) {
        output += `${prelude}{${body}}\n`;
      } else if (/^@(media|supports|container|layer)\b/i.test(prelude)) {
        output += `${prelude}{${scopeReaderCustomCss(body, prefix)}}\n`;
      } else if (prelude.startsWith('@')) {
        output += `${prelude}{${body}}\n`;
      } else {
        const scopedSelector = splitSelectorList(prelude)
          .map((selector) => prefixSelector(selector, prefix))
          .join(', ');
        output += `${scopedSelector}{${body}}\n`;
      }
      index = cursor;
    }
    return output.trim();
  }

  function appendTextEl(doc, parent, tag, className, text) {
    if (!text) return null;
    const el = doc.createElement(tag);
    if (className) el.className = className;
    el.textContent = text;
    parent.appendChild(el);
    return el;
  }

  function getArticleBaseUrl(payload) {
    return payload?.article?.uriBase || payload?.article?.baseURI || payload?.article?.pageURL || payload?.pageUrl || '';
  }

  function appendCustomCss(doc, rootEl, settings) {
    const customCss = settings?.customCss ? scopeReaderCustomCss(settings.customCss) : '';
    if (!customCss) return null;
    const style = doc.createElement('style');
    style.dataset.msReaderCustomCss = 'true';
    style.textContent = customCss;
    rootEl.appendChild(style);
    return style;
  }

  function renderShell(doc, mountEl, payload = {}, settings = {}, mode = 'overlay', extraContext = {}) {
    const reader = root.markSnipReader || {};
    const cleanups = [];
    const rootEl = doc.createElement('div');
    rootEl.className = 'ms-reader-root';
    rootEl.dataset.msReaderMode = mode;
    rootEl.dataset.msTheme = settings.appearance || 'auto';

    if (reader.applyReaderSettings) {
      reader.applyReaderSettings(rootEl, settings);
    }

    const ctx = {
      mode,
      payload,
      settings,
      sessionId: extraContext.sessionId || payload.sessionId || '',
      title: payload.title || payload.article?.title || 'Reader View',
      onClose: extraContext.onClose || (() => {}),
      onToggleHighlight: extraContext.onToggleHighlight || null
    };
    const toolbar = reader.mountToolbar?.(doc, rootEl, ctx);
    if (toolbar?.element) {
      rootEl.appendChild(toolbar.element);
      cleanups.push(toolbar);
    }

    const container = doc.createElement('div');
    container.className = 'ms-reader-container';
    const outline = doc.createElement('aside');
    outline.className = 'ms-reader-outline';
    outline.setAttribute('aria-label', 'Article outline');
    const main = doc.createElement('main');
    main.className = 'ms-reader-content';
    const highlightsAside = doc.createElement('aside');
    highlightsAside.className = 'ms-reader-highlights';
    highlightsAside.setAttribute('aria-label', 'Saved highlights');
    highlightsAside.dataset.label = 'Highlights';
    const highlightsList = doc.createElement('ul');
    highlightsList.className = 'ms-reader-highlights-list';
    highlightsAside.appendChild(highlightsList);

    appendTextEl(doc, main, 'h1', 'ms-reader-title', payload.article?.title || payload.title || '');
    const formatDate = (raw) => {
      if (!raw) return '';
      try {
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) return String(raw);
        return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
      } catch {
        return String(raw);
      }
    };
    const metadataParts = [
      payload.article?.byline,
      formatDate(payload.article?.publishedTime),
      (() => {
        try {
          return new URL(payload.pageUrl || payload.article?.pageURL || payload.article?.baseURI || '').hostname.replace(/^www\./, '');
        } catch {
          return '';
        }
      })()
    ].filter(Boolean);
    appendTextEl(doc, main, 'div', 'ms-reader-metadata', metadataParts.join(' · '));

    const articleEl = doc.createElement('article');
    const sanitize = reader.sanitizeArticleHtml || ((html) => String(html || ''));
    articleEl.innerHTML = sanitize(payload.article?.readerContent || payload.article?.content || '', getArticleBaseUrl(payload), mode);
    main.appendChild(articleEl);

    const outlineResult = reader.buildOutline?.(doc, articleEl, { container: outline });
    if (outlineResult?.teardown) cleanups.push(outlineResult);
    reader.applyHighlights?.(doc, articleEl, payload.highlights || [], highlightsList, { inline: false });
    if (!highlightsList.children.length) highlightsAside.hidden = true;

    const lightbox = reader.mountLightbox?.(doc, articleEl);
    if (lightbox?.teardown) cleanups.push(lightbox);
    const footnotes = reader.mountFootnotes?.(doc, articleEl);
    if (footnotes?.teardown) cleanups.push(footnotes);

    container.appendChild(outline);
    container.appendChild(main);
    container.appendChild(highlightsAside);
    rootEl.appendChild(container);
    appendTextEl(doc, rootEl, 'footer', 'ms-reader-footer', payload.pageUrl || payload.article?.pageURL || '');
    appendCustomCss(doc, rootEl, settings);

    mountEl.appendChild(rootEl);

    return {
      root: rootEl,
      article: articleEl,
      teardown() {
        while (cleanups.length) {
          const cleanup = cleanups.pop();
          try {
            cleanup.teardown?.();
          } catch {}
        }
        rootEl.remove();
      }
    };
  }

  return {
    renderShell,
    scopeReaderCustomCss,
    _splitReaderSelectorList: splitSelectorList
  };
});
