/**
 * MarkSnip — Options Search (adapter over shared search-core)
 *
 * Builds a search index from the options DOM and delegates scoring
 * to the shared fuzzy engine in search-core.js.
 *
 * Public API (attached to root.markSnipOptionsSearch):
 *   buildSearchIndex(rootNode)    → index[]
 *   normalizeSearchText(value)    → string
 *   searchSettings(index, query)  → { query, tokens, stage, results, matches }
 */
(function (root) {
  const core = root.markSnipSearchCore;

  /* Re-export helpers the options page already depends on */
  const normalizeSearchText = core.normalizeSearchText;

  /* ── DOM helpers ── */
  function getCleanText(element, selectorsToRemove) {
    if (!element) return '';
    const clone = element.cloneNode(true);
    (selectorsToRemove || []).forEach(sel => {
      clone.querySelectorAll(sel).forEach(n => n.remove());
    });
    return clone.textContent || '';
  }

  function addField(entry, rawText, options) {
    const field = core.createField(rawText, options);
    if (!field) return;
    const key = [
      field.primary ? 'primary' : 'secondary',
      field.qualifies ? 'qualifies' : 'boost',
      field.isAlias ? 'alias' : 'field',
      field.normalized
    ].join('|');
    if (entry.fieldKeys.has(key)) return;
    entry.fieldKeys.add(key);
    entry.fields.push(field);
  }

  function isSearchExcluded(node) {
    return !!node?.closest?.('[data-search-exclude]');
  }

  function addFieldsFromNodeList(entry, nodes, options) {
    nodes.forEach(node => {
      if (isSearchExcluded(node)) return;
      addField(entry, options.clean ? options.clean(node) : node.textContent, options);
    });
  }

  function addControlFields(entry, card) {
    card.querySelectorAll('input, textarea, select').forEach(control => {
      if (isSearchExcluded(control)) return;
      addField(entry, control.name, { source: 'control-name', primary: true, qualifies: true, allowFuzzy: true });
      addField(entry, control.id,   { source: 'control-id',   primary: true, qualifies: true, allowFuzzy: true });
    });
  }

  function addAliasFields(entry, card) {
    const raw = card.dataset.searchKeywords;
    if (!raw) return;
    raw.split(',').forEach(kw => {
      addField(entry, kw, { source: 'alias', primary: true, qualifies: true, isAlias: true, allowFuzzy: true });
    });
  }

  function createEntry(card, section, sectionTitle) {
    const entry = { card, section, fields: [], fieldKeys: new Set() };

    addField(entry, sectionTitle, { source: 'section-title', primary: true, qualifies: false, allowFuzzy: true });
    addField(entry, card.closest('.setting-subgroup')?.querySelector('.setting-subgroup__label')?.textContent, { source: 'subgroup-label', primary: true, qualifies: true, allowFuzzy: false });
    addField(entry, card.querySelector('.card-title')?.textContent, { source: 'card-title', primary: true, qualifies: true });

    addFieldsFromNodeList(entry, card.querySelectorAll('.toggle-label-text'), { source: 'toggle-label', primary: true, qualifies: true });
    addFieldsFromNodeList(entry, card.querySelectorAll('.input-label'),       { source: 'input-label',  primary: true, qualifies: true });
    addFieldsFromNodeList(entry, card.querySelectorAll('.radio-card-title'),  { source: 'radio-card-title', primary: true, qualifies: true });
    addFieldsFromNodeList(entry, card.querySelectorAll('.radio-pill label'),  {
      source: 'radio-pill-label', primary: true, qualifies: true,
      clean: label => getCleanText(label, ['.radio-pill-tooltip'])
    });

    addControlFields(entry, card);
    addAliasFields(entry, card);

    addFieldsFromNodeList(entry, card.querySelectorAll('.card-desc'),    { source: 'card-desc',    primary: false, qualifies: false, allowFuzzy: false, clean: n => getCleanText(n, ['a']) });
    addFieldsFromNodeList(entry, card.querySelectorAll('.toggle-hint'),  { source: 'toggle-hint',  primary: false, qualifies: false, allowFuzzy: false });
    addFieldsFromNodeList(entry, card.querySelectorAll('.option-note'),  { source: 'option-note',  primary: false, qualifies: false, allowFuzzy: false });

    delete entry.fieldKeys;
    return entry;
  }

  function buildSearchIndex(rootNode) {
    const rootEl = rootNode?.querySelectorAll ? rootNode : document;
    const index = [];
    rootEl.querySelectorAll('.section').forEach(section => {
      const sectionTitle = section.querySelector('.section-title')?.textContent || section.dataset.sectionLabel || '';
      section.querySelectorAll('.setting-card').forEach(card => {
        index.push(createEntry(card, section, sectionTitle));
      });
    });
    return index;
  }

  function searchSettings(index, query) {
    const nq = normalizeSearchText(query);
    if (!nq) {
      return {
        query: '', tokens: [], stage: 'none',
        results: index.map(e => ({ ...e, matches: false, score: 0, tokenMatches: [] })),
        matches: []
      };
    }
    const strict = core.runSearch(index, nq, core.STRICT_THRESHOLDS, 'strict');
    return strict.matches.length > 0
      ? strict
      : core.runSearch(index, nq, core.FALLBACK_THRESHOLDS, 'fallback');
  }

  const api = { buildSearchIndex, normalizeSearchText, searchSettings };
  root.markSnipOptionsSearch = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
