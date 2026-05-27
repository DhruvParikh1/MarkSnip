(function (root, factory) {
  const api = factory(root);
  root.markSnipReader = Object.assign(root.markSnipReader || {}, api);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeWhitespace(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function getHighlightText(highlight) {
    return normalizeWhitespace(highlight?.text || highlight?.contentText || highlight?.contentHtml || '');
  }

  function collectTextNodes(root) {
    const doc = root.ownerDocument || document;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parentTag = node.parentElement?.tagName?.toLowerCase();
        if (!node.nodeValue || parentTag === 'script' || parentTag === 'style') {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let node = walker.nextNode();
    while (node) {
      nodes.push(node);
      node = walker.nextNode();
    }
    return nodes;
  }

  function buildNormalizedTextMap(root) {
    const nodes = collectTextNodes(root);
    let text = '';
    const map = [];
    let lastWasSpace = true;

    nodes.forEach((node) => {
      const value = node.nodeValue || '';
      for (let offset = 0; offset < value.length; offset++) {
        const char = value[offset];
        if (/\s/.test(char)) {
          if (!lastWasSpace) {
            text += ' ';
            map.push({ node, offset });
            lastWasSpace = true;
          }
        } else {
          text += char;
          map.push({ node, offset });
          lastWasSpace = false;
        }
      }
    });

    let start = 0;
    let end = text.length;
    while (start < end && text[start] === ' ') start++;
    while (end > start && text[end - 1] === ' ') end--;

    return {
      text: text.slice(start, end),
      map: map.slice(start, end)
    };
  }

  function findOccurrences(haystack, needle) {
    if (!needle) return [];
    const matches = [];
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      matches.push(index);
      index = haystack.indexOf(needle, index + Math.max(needle.length, 1));
    }
    return matches;
  }

  function appendUnmappedHighlight(doc, sidebarEl, highlight, reason) {
    if (!sidebarEl) return;
    const li = doc.createElement('li');
    li.className = 'ms-reader-highlight-unmapped';
    li.dataset.reason = reason;
    li.dataset.id = String(highlight?.id || '');
    li.dataset.color = String(highlight?.color || 'yellow');

    const snippet = doc.createElement('span');
    snippet.className = 'ms-reader-highlight-text';
    snippet.textContent = getHighlightText(highlight);
    li.appendChild(snippet);

    if (highlight?.note) {
      const note = doc.createElement('span');
      note.className = 'ms-reader-highlight-note';
      note.textContent = String(highlight.note);
      li.appendChild(note);
    }

    sidebarEl.appendChild(li);
  }

  function wrapNormalizedRange(doc, map, start, length, highlight) {
    const startEntry = map[start];
    const endEntry = map[start + length - 1];
    if (!startEntry || !endEntry) return false;

    const range = doc.createRange();
    range.setStart(startEntry.node, startEntry.offset);
    range.setEnd(endEntry.node, endEntry.offset + 1);

    const mark = doc.createElement('mark');
    mark.className = 'ms-reader-mark';
    mark.dataset.id = String(highlight?.id || '');
    mark.dataset.color = String(highlight?.color || 'yellow');
    mark.title = highlight?.note ? String(highlight.note) : '';

    try {
      const contents = range.extractContents();
      mark.appendChild(contents);
      range.insertNode(mark);
      range.detach();
      return true;
    } catch {
      range.detach();
      return false;
    }
  }

  function applyHighlights(doc, articleEl, highlights, sidebarEl, options = {}) {
    const list = Array.isArray(highlights)
      ? highlights
      : Array.isArray(highlights?.highlights)
        ? highlights.highlights
        : [];
    const result = { mapped: [], unmapped: [] };
    const inline = options.inline !== false;

    list.forEach((highlight) => {
      const needle = getHighlightText(highlight);
      if (!needle) {
        result.unmapped.push(highlight);
        appendUnmappedHighlight(doc, sidebarEl, highlight, 'empty');
        return;
      }

      if (!inline) {
        result.unmapped.push(highlight);
        appendUnmappedHighlight(doc, sidebarEl, highlight, 'managed-by-highlighter');
        return;
      }

      const normalized = buildNormalizedTextMap(articleEl);
      const occurrences = findOccurrences(normalized.text, needle);
      if (occurrences.length !== 1) {
        result.unmapped.push(highlight);
        appendUnmappedHighlight(doc, sidebarEl, highlight, occurrences.length === 0 ? 'missing' : 'ambiguous');
        return;
      }

      const didWrap = wrapNormalizedRange(doc, normalized.map, occurrences[0], needle.length, highlight);
      if (didWrap) {
        result.mapped.push(highlight);
      } else {
        result.unmapped.push(highlight);
        appendUnmappedHighlight(doc, sidebarEl, highlight, 'range-failed');
      }
    });

    if (sidebarEl && !sidebarEl.children.length) {
      sidebarEl.hidden = true;
    }

    return result;
  }

  return {
    applyHighlights,
    _normalizeReaderHighlightText: normalizeWhitespace,
    _buildReaderHighlightTextMap: buildNormalizedTextMap,
    _findReaderHighlightOccurrences: findOccurrences
  };
});
