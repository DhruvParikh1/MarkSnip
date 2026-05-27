(function (root, factory) {
  const api = factory(root);
  root.markSnipReader = Object.assign(root.markSnipReader || {}, api);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ALLOWED_TAGS = new Set([
    'article', 'section', 'header', 'footer', 'main', 'aside',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'kbd', 'samp',
    'em', 'strong', 'b', 'i', 'u', 's', 'del', 'ins', 'sub', 'sup', 'small',
    'mark', 'br', 'hr', 'a', 'img', 'picture', 'source', 'figure',
    'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'caption', 'colgroup', 'col', 'span', 'div', 'dl', 'dt', 'dd', 'abbr',
    'cite', 'q', 'time', 'video', 'audio', 'details', 'summary'
  ]);

  const STRIP_SUBTREE_TAGS = new Set([
    'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button',
    'select', 'textarea', 'link', 'meta', 'svg'
  ]);

  const GLOBAL_ATTRS = new Set(['class', 'id', 'lang', 'dir', 'title', 'datetime', 'cite', 'rel']);
  const TAG_ATTRS = {
    a: new Set(['href']),
    img: new Set(['src', 'srcset', 'alt', 'loading', 'width', 'height']),
    source: new Set(['src', 'srcset', 'type', 'media', 'width', 'height']),
    picture: new Set(['src', 'srcset', 'alt', 'loading', 'width', 'height']),
    video: new Set(['src', 'srcset', 'alt', 'loading', 'width', 'height', 'controls', 'poster']),
    audio: new Set(['src', 'srcset', 'alt', 'loading', 'width', 'height', 'controls']),
    th: new Set(['colspan', 'rowspan', 'scope']),
    td: new Set(['colspan', 'rowspan', 'scope'])
  };

  const URL_ATTRS = new Set(['href', 'src', 'poster']);

  function isAllowedAttr(tag, attr, mode) {
    const name = String(attr || '').toLowerCase();
    if (!name || name === 'style' || name === 'srcdoc' || name.startsWith('on')) {
      return false;
    }
    if (name.startsWith('data-ms-reader-')) {
      return true;
    }
    // Obsidian/GitHub-style callouts surface their kind via data-callout="note"
    // (etc.). Preserving the attribute lets the stylesheet match
    // blockquote[data-callout="..."] without a class transformation pass.
    if (name === 'data-callout') {
      return true;
    }
    if (mode === 'overlay' && (name === 'class' || name === 'id')) {
      return true;
    }
    return GLOBAL_ATTRS.has(name) || TAG_ATTRS[tag]?.has(name) === true;
  }

  function sanitizeClassValue(value, mode) {
    const tokens = String(value || '')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    if (mode !== 'overlay') {
      return tokens.join(' ');
    }
    return tokens.filter((token) =>
      token.startsWith('ms-reader-')
      || token.startsWith('language-')
      // Obsidian/MkDocs/Material admonition markup. Keeping these in overlay
      // mode lets the reader stylesheet target callouts directly.
      || token === 'callout'
      || token.startsWith('callout-')
      || token === 'admonition'
      || token.startsWith('admonition-')
    ).join(' ');
  }

  function sanitizeIdValue(value, mode) {
    const id = String(value || '').trim();
    if (mode !== 'overlay') {
      return id;
    }
    return id.startsWith('ms-reader-') ? id : '';
  }

  function sanitizeUrl(value, baseUrl, attr, tag) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (attr === 'href' && raw.startsWith('#')) return raw;
    if (/^data:/i.test(raw)) {
      return attr !== 'href' && /^data:image\//i.test(raw) ? raw : '';
    }
    try {
      const parsed = new URL(raw, baseUrl || undefined);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
      if (attr === 'href' && parsed.protocol === 'mailto:') {
        return parsed.href;
      }
      if (attr !== 'href' && tag === 'audio' && parsed.protocol === 'blob:') {
        return '';
      }
      return '';
    } catch {
      return '';
    }
  }

  function sanitizeSrcset(value, baseUrl, tag) {
    return String(value || '')
      .split(',')
      .map((candidate) => {
        const trimmed = candidate.trim();
        if (!trimmed) return '';
        const parts = trimmed.split(/\s+/);
        const url = sanitizeUrl(parts.shift(), baseUrl, 'src', tag);
        return url ? [url].concat(parts).join(' ') : '';
      })
      .filter(Boolean)
      .join(', ');
  }

  function copyAllowedAttributes(source, target, tag, baseUrl, mode) {
    source.getAttributeNames().forEach((attrName) => {
      const attr = attrName.toLowerCase();
      if (!isAllowedAttr(tag, attr, mode)) return;
      let value = source.getAttribute(attrName);
      if (URL_ATTRS.has(attr)) {
        value = sanitizeUrl(value, baseUrl, attr, tag);
      } else if (attr === 'srcset') {
        value = sanitizeSrcset(value, baseUrl, tag);
      } else if (attr === 'class') {
        value = sanitizeClassValue(value, mode);
      } else if (attr === 'id') {
        value = sanitizeIdValue(value, mode);
      } else if (attr === 'controls') {
        value = '';
      }
      if (value || attr === 'controls') {
        target.setAttribute(attr, value);
      }
    });
  }

  function sanitizeNode(doc, node, baseUrl, mode) {
    if (node.nodeType === Node.TEXT_NODE) {
      return doc.createTextNode(node.nodeValue || '');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const tag = node.tagName.toLowerCase();
    if (STRIP_SUBTREE_TAGS.has(tag)) {
      return null;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      const fragment = doc.createDocumentFragment();
      Array.from(node.childNodes).forEach((child) => {
        const clean = sanitizeNode(doc, child, baseUrl, mode);
        if (clean) fragment.appendChild(clean);
      });
      return fragment;
    }

    const cleanEl = doc.createElement(tag);
    copyAllowedAttributes(node, cleanEl, tag, baseUrl, mode);
    Array.from(node.childNodes).forEach((child) => {
      const clean = sanitizeNode(doc, child, baseUrl, mode);
      if (clean) cleanEl.appendChild(clean);
    });
    return cleanEl;
  }

  function sanitizeArticleHtml(htmlString, baseUrl, mode) {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(String(htmlString || ''), 'text/html');
    const output = document.implementation.createHTMLDocument('');
    Array.from(parsed.body.childNodes).forEach((node) => {
      const clean = sanitizeNode(output, node, baseUrl, mode);
      if (clean) output.body.appendChild(clean);
    });
    return output.body.innerHTML;
  }

  return {
    sanitizeArticleHtml,
    _sanitizeReaderUrl: sanitizeUrl,
    _sanitizeReaderSrcset: sanitizeSrcset
  };
});
