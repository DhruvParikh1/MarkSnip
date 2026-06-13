(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.markSnipHighlightState = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const STORAGE_KEYS = Object.freeze({
    RECORDS: 'marksnipHighlights',
    INDEX: 'marksnipHighlightIndex'
  });

  const DEFAULT_COLORS = Object.freeze({
    yellow: '#ffeb00',
    green: '#a8d977',
    blue: '#8ec8ff',
    pink: '#f2a0bd',
    purple: '#c9a7ff'
  });

  const DEFAULT_COLOR = 'yellow';
  const TRACKING_PARAMS = new Set([
    'fbclid',
    'gclid',
    'igshid',
    'mc_cid',
    'mc_eid',
    'mkt_tok',
    'msclkid',
    'oly_anon_id',
    'oly_enc_id',
    'ref',
    'spm',
    'utm_campaign',
    'utm_content',
    'utm_medium',
    'utm_source',
    'utm_term'
  ]);

  function deepClone(value) {
    if (Array.isArray(value)) {
      return value.map((item) => deepClone(item));
    }
    if (!value || typeof value !== 'object') {
      return value;
    }
    const next = {};
    Object.keys(value).forEach((key) => {
      next[key] = deepClone(value[key]);
    });
    return next;
  }

  function createId(prefix = 'hl') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function normalizeUrl(url) {
    if (!url || typeof url !== 'string') {
      return '';
    }

    try {
      const parsed = new URL(url);
      parsed.hash = '';
      Array.from(parsed.searchParams.keys()).forEach((key) => {
        if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
          parsed.searchParams.delete(key);
        }
      });
      parsed.searchParams.sort();
      return parsed.href;
    } catch {
      return String(url || '').trim();
    }
  }

  function normalizeColor(color) {
    const value = String(color || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(DEFAULT_COLORS, value) ? value : DEFAULT_COLOR;
  }

  function normalizeHighlight(highlight = {}, now = new Date().toISOString()) {
    const type = highlight.type === 'element' ? 'element' : 'text';
    const id = String(highlight.id || '').trim() || createId(type === 'element' ? 'el' : 'tx');
    const text = String(highlight.text || highlight.contentText || '').trim();
    const contentHtml = String(highlight.contentHtml || highlight.content || text || '').trim();
    const xpath = String(highlight.xpath || '').trim();
    const createdAt = String(highlight.createdAt || now);
    const updatedAt = String(highlight.updatedAt || createdAt);

    const normalized = {
      id,
      type,
      xpath,
      text,
      contentHtml,
      color: normalizeColor(highlight.color),
      note: String(highlight.note || highlight.notes || '').trim(),
      groupId: String(highlight.groupId || '').trim(),
      createdAt,
      updatedAt
    };

    if (type === 'text') {
      normalized.startOffset = Math.max(0, Number.parseInt(highlight.startOffset, 10) || 0);
      normalized.endOffset = Math.max(normalized.startOffset, Number.parseInt(highlight.endOffset, 10) || 0);
    }

    return normalized;
  }

  function normalizeHighlightList(highlights = []) {
    if (!Array.isArray(highlights)) {
      return [];
    }

    return highlights
      .map((highlight) => normalizeHighlight(highlight))
      .filter((highlight) => highlight.xpath || highlight.contentHtml || highlight.text);
  }

  function normalizePageRecord(record = {}, fallbackUrl = '') {
    const url = String(record.url || fallbackUrl || '').trim();
    const normalizedUrl = normalizeUrl(record.normalizedUrl || url || fallbackUrl);
    const highlights = normalizeHighlightList(record.highlights);
    const title = String(record.title || '').trim();
    const siteName = String(record.siteName || '').trim();
    const updatedAt = String(record.updatedAt || new Date().toISOString());
    const createdAt = String(record.createdAt || updatedAt);

    return {
      url,
      normalizedUrl,
      title,
      siteName,
      highlights,
      createdAt,
      updatedAt
    };
  }

  function normalizeRecords(records = {}) {
    const source = records && typeof records === 'object' ? records : {};
    return Object.keys(source).reduce((next, key) => {
      const record = normalizePageRecord(source[key], key);
      const normalizedUrl = record.normalizedUrl || normalizeUrl(key);
      if (normalizedUrl) {
        next[normalizedUrl] = {
          ...record,
          normalizedUrl
        };
      }
      return next;
    }, {});
  }

  function buildIndex(records = {}) {
    const normalized = normalizeRecords(records);
    return Object.keys(normalized).reduce((index, normalizedUrl) => {
      const record = normalized[normalizedUrl];
      const count = Array.isArray(record.highlights) ? record.highlights.length : 0;
      if (count > 0) {
        index[normalizedUrl] = {
          url: record.url || normalizedUrl,
          title: record.title || '',
          siteName: record.siteName || '',
          count,
          updatedAt: record.updatedAt || new Date().toISOString()
        };
      }
      return index;
    }, {});
  }

  async function loadRecords(storage = root.browser?.storage?.local) {
    if (!storage?.get) {
      return {};
    }
    const stored = await storage.get(STORAGE_KEYS.RECORDS);
    return normalizeRecords(stored?.[STORAGE_KEYS.RECORDS]);
  }

  async function saveRecords(records = {}, storage = root.browser?.storage?.local) {
    const normalized = normalizeRecords(records);
    if (storage?.set) {
      await storage.set({
        [STORAGE_KEYS.RECORDS]: normalized,
        [STORAGE_KEYS.INDEX]: buildIndex(normalized)
      });
    }
    return normalized;
  }

  async function loadIndex(storage = root.browser?.storage?.local) {
    if (!storage?.get) {
      return {};
    }
    const stored = await storage.get(STORAGE_KEYS.INDEX);
    const index = stored?.[STORAGE_KEYS.INDEX];
    return index && typeof index === 'object' ? deepClone(index) : {};
  }

  async function loadPageRecord(url, storage = root.browser?.storage?.local) {
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) {
      return normalizePageRecord({ url });
    }
    const records = await loadRecords(storage);
    return normalizePageRecord(records[normalizedUrl] || { url, normalizedUrl }, url);
  }

  async function savePageRecord(record = {}, storage = root.browser?.storage?.local) {
    const normalizedRecord = normalizePageRecord(record);
    const normalizedUrl = normalizedRecord.normalizedUrl || normalizeUrl(normalizedRecord.url);
    if (!normalizedUrl) {
      return normalizedRecord;
    }

    const records = await loadRecords(storage);
    if (normalizedRecord.highlights.length > 0) {
      records[normalizedUrl] = {
        ...normalizedRecord,
        normalizedUrl,
        updatedAt: new Date().toISOString()
      };
    } else {
      delete records[normalizedUrl];
    }
    await saveRecords(records, storage);
    return records[normalizedUrl] || {
      ...normalizedRecord,
      normalizedUrl,
      highlights: []
    };
  }

  function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function isDuplicateOrOverlappingHighlight(existing, next) {
    if (!existing || !next || existing.id === next.id) {
      return false;
    }
    if (existing.type !== next.type || existing.xpath !== next.xpath) {
      return false;
    }
    if (existing.type === 'element') {
      return true;
    }
    return rangesOverlap(existing.startOffset, existing.endOffset, next.startOffset, next.endOffset);
  }

  function mergeHighlights(existing = [], additions = []) {
    const prepared = normalizeHighlightList(existing);
    const nextHighlights = normalizeHighlightList(additions);
    let merged = prepared.slice();

    nextHighlights.forEach((next) => {
      merged = merged.filter((existingHighlight) => !isDuplicateOrOverlappingHighlight(existingHighlight, next));
      merged.push(next);
    });

    return merged.sort((a, b) => {
      const aTime = Date.parse(a.createdAt) || 0;
      const bTime = Date.parse(b.createdAt) || 0;
      return aTime - bTime;
    });
  }

  function removeHighlightById(highlights = [], id) {
    const targetId = String(id || '').trim();
    const source = normalizeHighlightList(highlights);
    const target = source.find((highlight) => highlight.id === targetId);
    if (!target) {
      return source;
    }
    if (target.groupId) {
      return source.filter((highlight) => highlight.groupId !== target.groupId);
    }
    return source.filter((highlight) => highlight.id !== targetId);
  }

  function updateHighlight(highlights = [], id, updates = {}) {
    const targetId = String(id || '').trim();
    const now = new Date().toISOString();
    return normalizeHighlightList(highlights).map((highlight) => {
      if (highlight.id !== targetId && (!highlight.groupId || highlight.groupId !== updates.groupId)) {
        return highlight;
      }
      return normalizeHighlight({
        ...highlight,
        ...updates,
        id: highlight.id,
        groupId: highlight.groupId,
        updatedAt: now
      });
    });
  }

  function stripHtml(html = '') {
    const text = String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|table|pre|blockquote|figure)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+\n/g, '\n')
      .replace(/\n\s+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return text;
  }

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getHighlightPlainText(highlight = {}) {
    return String(highlight.text || '').trim() || stripHtml(highlight.contentHtml || highlight.content || '');
  }

  function getHighlightHtml(highlight = {}) {
    const html = String(highlight.contentHtml || highlight.content || '').trim();
    if (html) {
      return html;
    }
    return escapeHtml(getHighlightPlainText(highlight));
  }

  function collapseGroups(highlights = []) {
    const source = normalizeHighlightList(highlights);
    const groups = new Map();
    const output = [];

    source.forEach((highlight) => {
      if (!highlight.groupId) {
        output.push(highlight);
        return;
      }
      if (!groups.has(highlight.groupId)) {
        const grouped = {
          ...highlight,
          id: highlight.groupId,
          type: 'group',
          parts: []
        };
        groups.set(highlight.groupId, grouped);
        output.push(grouped);
      }
      const grouped = groups.get(highlight.groupId);
      grouped.parts.push(highlight);
      grouped.text = grouped.parts.map(getHighlightPlainText).filter(Boolean).join('\n\n');
      grouped.contentHtml = grouped.parts.map(getHighlightHtml).filter(Boolean).join('\n\n');
      grouped.color = grouped.parts[0]?.color || DEFAULT_COLOR;
      grouped.note = grouped.parts.find((part) => part.note)?.note || grouped.note || '';
      grouped.createdAt = grouped.parts[0]?.createdAt || grouped.createdAt;
      grouped.updatedAt = grouped.parts[grouped.parts.length - 1]?.updatedAt || grouped.updatedAt;
    });

    return output;
  }

  function wrapInlineText(text, syntax = 'html-mark', color = DEFAULT_COLOR) {
    const value = String(text || '');
    if (!value) {
      return '';
    }
    if (syntax === 'obsidian') {
      return `==${value}==`;
    }
    const colorValue = DEFAULT_COLORS[normalizeColor(color)] || DEFAULT_COLORS[DEFAULT_COLOR];
    return `<mark style="background-color: ${colorValue};">${escapeHtml(value)}</mark>`;
  }

  function formatHighlightsMarkdown(highlights = [], options = {}) {
    const syntax = options.highlightInlineSyntax === 'obsidian' ? 'obsidian' : 'html-mark';
    const grouped = collapseGroups(highlights);
    if (!grouped.length) {
      return '';
    }

    return grouped.map((highlight) => {
      const text = getHighlightPlainText(highlight);
      const note = String(highlight.note || '').trim();
      const marker = wrapInlineText(text, syntax, highlight.color);
      return note ? `${marker}\n\n> ${note.replace(/\n/g, '\n> ')}` : marker;
    }).join('\n\n');
  }

  function highlightsToJson(highlights = []) {
    return JSON.stringify(collapseGroups(highlights).map((highlight) => ({
      id: highlight.id,
      type: highlight.type,
      text: getHighlightPlainText(highlight),
      contentHtml: getHighlightHtml(highlight),
      color: normalizeColor(highlight.color),
      note: String(highlight.note || ''),
      createdAt: highlight.createdAt,
      updatedAt: highlight.updatedAt
    })), null, 2);
  }

  function attachHighlightFields(article = {}, highlights = [], options = {}) {
    const grouped = collapseGroups(highlights);
    return {
      ...article,
      highlights: formatHighlightsMarkdown(grouped, options),
      highlightsJson: highlightsToJson(grouped),
      highlightCount: String(grouped.length)
    };
  }

  function getElementByXPath(doc, xpath) {
    if (!doc || !xpath || typeof doc.evaluate !== 'function') {
      return null;
    }
    try {
      return doc.evaluate(xpath, doc, null, 9, null).singleNodeValue || null;
    } catch {
      return null;
    }
  }

  function getTextNodeAtOffset(rootNode, offset) {
    const ownerDocument = rootNode?.ownerDocument || rootNode;
    if (!rootNode || !ownerDocument?.createTreeWalker) {
      return null;
    }

    const walker = ownerDocument.createTreeWalker(rootNode, 4);
    let current = walker.nextNode();
    let remaining = Math.max(0, Number(offset) || 0);

    while (current) {
      const length = current.nodeValue.length;
      if (remaining <= length) {
        return {
          node: current,
          offset: remaining
        };
      }
      remaining -= length;
      current = walker.nextNode();
    }

    return {
      node: rootNode,
      offset: rootNode.childNodes?.length || 0
    };
  }

  function createRangeFromOffsets(element, startOffset, endOffset) {
    const doc = element?.ownerDocument;
    if (!doc?.createRange || !element) {
      return null;
    }
    const start = getTextNodeAtOffset(element, startOffset);
    const end = getTextNodeAtOffset(element, endOffset);
    if (!start?.node || !end?.node) {
      return null;
    }

    try {
      const range = doc.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      if (range.collapsed) {
        return null;
      }
      return range;
    } catch {
      return null;
    }
  }

  function createMarkedElement(doc, highlight, syntax = 'html-mark') {
    const color = normalizeColor(highlight.color);
    if (syntax === 'obsidian') {
      const fragment = doc.createDocumentFragment();
      fragment.appendChild(doc.createTextNode('=='));
      return {
        wrapper: fragment,
        closeText: '=='
      };
    }

    const mark = doc.createElement('mark');
    mark.setAttribute('data-marksnip-highlight-id', highlight.id);
    mark.setAttribute('data-marksnip-highlight-color', color);
    mark.style.backgroundColor = DEFAULT_COLORS[color] || DEFAULT_COLORS[DEFAULT_COLOR];
    return {
      wrapper: mark,
      closeText: ''
    };
  }

  function applyTextHighlightToDom(doc, highlight, syntax = 'html-mark') {
    const element = getElementByXPath(doc, highlight.xpath);
    const range = createRangeFromOffsets(element, highlight.startOffset, highlight.endOffset);
    if (!range) {
      return false;
    }

    try {
      if (syntax === 'obsidian') {
        const text = range.toString();
        if (!text) {
          return false;
        }
        range.deleteContents();
        range.insertNode(doc.createTextNode(wrapInlineText(text, 'obsidian', highlight.color)));
        return true;
      }

      const { wrapper } = createMarkedElement(doc, highlight, syntax);
      range.surroundContents(wrapper);
      return true;
    } catch {
      try {
        const text = range.toString();
        if (!text) {
          return false;
        }
        range.deleteContents();
        if (syntax === 'obsidian') {
          range.insertNode(doc.createTextNode(wrapInlineText(text, 'obsidian', highlight.color)));
        } else {
          const { wrapper } = createMarkedElement(doc, highlight, syntax);
          wrapper.textContent = text;
          range.insertNode(wrapper);
        }
        return true;
      } catch {
        return false;
      }
    }
  }

  function applyElementHighlightToDom(doc, highlight, syntax = 'html-mark') {
    const element = getElementByXPath(doc, highlight.xpath);
    if (!element?.parentNode) {
      return false;
    }
    if (syntax === 'obsidian') {
      const text = getHighlightPlainText(highlight) || element.textContent || '';
      element.replaceWith(doc.createTextNode(wrapInlineText(text, 'obsidian', highlight.color)));
      return true;
    }

    const wrapper = doc.createElement('mark');
    const color = normalizeColor(highlight.color);
    wrapper.setAttribute('data-marksnip-highlight-id', highlight.id);
    wrapper.setAttribute('data-marksnip-highlight-color', color);
    wrapper.style.backgroundColor = DEFAULT_COLORS[color] || DEFAULT_COLORS[DEFAULT_COLOR];
    element.parentNode.insertBefore(wrapper, element);
    wrapper.appendChild(element);
    return true;
  }

  function applyInlineHighlightsToDomString(domString, highlights = [], options = {}) {
    const DomParser = root.DOMParser;
    if (typeof DomParser !== 'function' || !domString || !Array.isArray(highlights) || highlights.length === 0) {
      return domString;
    }
    const syntax = options.highlightInlineSyntax === 'obsidian' ? 'obsidian' : 'html-mark';

    try {
      const parser = new DomParser();
      const doc = parser.parseFromString(domString, 'text/html');
      if (doc.documentElement.nodeName === 'parsererror') {
        return domString;
      }

      normalizeHighlightList(highlights)
        .slice()
        .sort((a, b) => {
          if (a.xpath !== b.xpath) return a.xpath < b.xpath ? -1 : 1;
          return (b.startOffset || 0) - (a.startOffset || 0);
        })
        .forEach((highlight) => {
          if (highlight.type === 'element') {
            applyElementHighlightToDom(doc, highlight, syntax);
          } else {
            applyTextHighlightToDom(doc, highlight, syntax);
          }
        });

      return doc.documentElement.outerHTML;
    } catch {
      return domString;
    }
  }

  function buildHighlightsOnlyHtml(highlights = [], options = {}) {
    const syntax = options.highlightInlineSyntax === 'obsidian' ? 'obsidian' : 'html-mark';
    const grouped = collapseGroups(highlights);
    return grouped.map((highlight) => {
      const color = normalizeColor(highlight.color);
      const note = String(highlight.note || '').trim();
      if (syntax === 'obsidian') {
        const text = escapeHtml(wrapInlineText(getHighlightPlainText(highlight), 'obsidian', color));
        const noteHtml = note ? `<blockquote>${escapeHtml(note)}</blockquote>` : '';
        return `<p>${text}</p>${noteHtml}`;
      }
      const html = getHighlightHtml(highlight);
      const noteHtml = note ? `<blockquote>${escapeHtml(note)}</blockquote>` : '';
      return `<section data-marksnip-highlight-export="true" data-marksnip-highlight-color="${color}"><mark data-marksnip-highlight-id="${escapeHtml(highlight.id)}" data-marksnip-highlight-color="${color}" style="background-color: ${DEFAULT_COLORS[color]};">${html}</mark>${noteHtml}</section>`;
    }).join('\n');
  }

  const api = {
    STORAGE_KEYS,
    DEFAULT_COLORS,
    DEFAULT_COLOR,
    TRACKING_PARAMS,
    createId,
    deepClone,
    normalizeUrl,
    normalizeColor,
    normalizeHighlight,
    normalizeHighlightList,
    normalizePageRecord,
    normalizeRecords,
    buildIndex,
    loadRecords,
    saveRecords,
    loadIndex,
    loadPageRecord,
    savePageRecord,
    mergeHighlights,
    removeHighlightById,
    updateHighlight,
    stripHtml,
    escapeHtml,
    getHighlightPlainText,
    getHighlightHtml,
    collapseGroups,
    wrapInlineText,
    formatHighlightsMarkdown,
    highlightsToJson,
    attachHighlightFields,
    getElementByXPath,
    getTextNodeAtOffset,
    createRangeFromOffsets,
    applyInlineHighlightsToDomString,
    buildHighlightsOnlyHtml
  };

  return api;
});
