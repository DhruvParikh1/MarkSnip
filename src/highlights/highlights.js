(function () {
  const api = globalThis.markSnipHighlightState;
  const state = {
    records: {},
    search: '',
    color: '',
    scope: { type: 'all', key: '' },
    collapsedSources: new Set(),
    editingHighlights: new Set()
  };

  const dom = {
    searchInput: document.getElementById('searchInput'),
    colorFilter: document.getElementById('colorFilter'),
    summaryText: document.getElementById('summaryText'),
    clearAll: document.getElementById('clearAll'),
    pagesList: document.getElementById('pagesList'),
    emptyState: document.getElementById('emptyState'),
    exportMenuButton: document.getElementById('exportMenuButton'),
    exportMenu: document.getElementById('exportMenu'),
    exportMarkdown: document.getElementById('exportMarkdown'),
    exportJson: document.getElementById('exportJson'),
    openOptions: document.getElementById('openOptions'),
    allHighlightsButton: document.getElementById('allHighlightsButton'),
    allHighlightsCount: document.getElementById('allHighlightsCount'),
    sourceList: document.getElementById('sourceList'),
    breadcrumbAll: document.getElementById('breadcrumbAll'),
    breadcrumbSeparator: document.getElementById('breadcrumbSeparator'),
    breadcrumbCurrent: document.getElementById('breadcrumbCurrent')
  };

  function getQueryUrl() {
    try {
      return new URL(location.href).searchParams.get('url') || '';
    } catch {
      return '';
    }
  }

  function escapeHtml(value = '') {
    return api.escapeHtml(value);
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }

  function formatUrl(value = '') {
    try {
      const url = new URL(value);
      return `${url.hostname.replace(/^www\./, '')}${url.pathname === '/' ? '' : url.pathname}`;
    } catch {
      return value;
    }
  }

  function allRecords() {
    return Object.values(api.normalizeRecords(state.records));
  }

  function sortRecords(records) {
    return [...records].sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
  }

  function countHighlights(records) {
    return records.reduce((count, record) => count + api.normalizeHighlightList(record.highlights).length, 0);
  }

  function getRecordUrl(record) {
    return record.url || record.normalizedUrl || '';
  }

  function getRecordTitle(record) {
    return record.title || formatUrl(getRecordUrl(record)) || 'Untitled';
  }

  function getSourceMeta(record) {
    const url = getRecordUrl(record);
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');
      const label = String(record.siteName || host || 'Saved pages').trim();
      return {
        key: parsed.origin,
        label,
        domain: host || label,
        faviconUrl: ['http:', 'https:'].includes(parsed.protocol) ? new URL('/favicon.ico', parsed.origin).href : '',
        fallback: (label.match(/[a-z0-9]/i)?.[0] || 'H').toUpperCase()
      };
    } catch {
      const label = String(record.siteName || 'Saved pages').trim();
      return {
        key: `site:${label.toLowerCase()}`,
        label,
        domain: label,
        faviconUrl: '',
        fallback: (label.match(/[a-z0-9]/i)?.[0] || 'H').toUpperCase()
      };
    }
  }

  function recordMatchesSearch(record) {
    const query = state.search.trim().toLowerCase();
    if (!query) {
      return true;
    }
    const haystack = [
      record.title,
      record.url,
      record.normalizedUrl,
      record.siteName,
      ...(record.highlights || []).flatMap((highlight) => [
        api.getHighlightPlainText(highlight),
        highlight.note,
        highlight.color
      ])
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  }

  function filteredHighlights(record) {
    return api.normalizeHighlightList(record.highlights).filter((highlight) => {
      if (state.color && api.normalizeColor(highlight.color) !== state.color) {
        return false;
      }
      const query = state.search.trim().toLowerCase();
      if (!query) {
        return true;
      }
      const text = [
        api.getHighlightPlainText(highlight),
        highlight.note,
        highlight.color,
        record.title,
        record.url,
        record.normalizedUrl,
        record.siteName
      ].join(' ').toLowerCase();
      return text.includes(query);
    });
  }

  function recordsMatchingFilters() {
    return sortRecords(allRecords()
      .filter(recordMatchesSearch)
      .map((record) => ({
        ...record,
        highlights: filteredHighlights(record)
      }))
      .filter((record) => record.highlights.length > 0));
  }

  function recordInScope(record) {
    if (state.scope.type === 'source') {
      return getSourceMeta(record).key === state.scope.key;
    }
    if (state.scope.type === 'page') {
      return record.normalizedUrl === state.scope.key;
    }
    return true;
  }

  function filteredRecords() {
    return recordsMatchingFilters().filter(recordInScope);
  }

  function findRecord(normalizedUrl) {
    return allRecords().find((record) => record.normalizedUrl === normalizedUrl) || null;
  }

  function findSource(sourceKey) {
    return allRecords().map(getSourceMeta).find((source) => source.key === sourceKey) || null;
  }

  function getScopeLabel() {
    if (state.scope.type === 'page') {
      const record = findRecord(state.scope.key);
      return record ? getRecordTitle(record) : 'All highlights';
    }
    if (state.scope.type === 'source') {
      const source = findSource(state.scope.key);
      return source?.label || 'All highlights';
    }
    return 'All highlights';
  }

  function setScope(type, key = '') {
    state.scope = { type, key };
    render();
  }

  function ensureScopeStillValid() {
    if (state.scope.type === 'page' && !findRecord(state.scope.key)) {
      state.scope = { type: 'all', key: '' };
    }
    if (state.scope.type === 'source' && !findSource(state.scope.key)) {
      state.scope = { type: 'all', key: '' };
    }
  }

  function buildSourceGroups(records) {
    const groups = new Map();
    records.forEach((record) => {
      const source = getSourceMeta(record);
      if (!groups.has(source.key)) {
        groups.set(source.key, {
          ...source,
          count: 0,
          updatedAt: record.updatedAt,
          pages: []
        });
      }
      const group = groups.get(source.key);
      const highlightCount = api.normalizeHighlightList(record.highlights).length;
      group.count += highlightCount;
      if ((Date.parse(record.updatedAt) || 0) > (Date.parse(group.updatedAt) || 0)) {
        group.updatedAt = record.updatedAt;
      }
      group.pages.push({
        normalizedUrl: record.normalizedUrl,
        title: getRecordTitle(record),
        count: highlightCount,
        updatedAt: record.updatedAt
      });
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        pages: sortRecords(group.pages)
      }))
      .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
  }

  async function load() {
    const queryUrl = api.normalizeUrl(getQueryUrl());
    state.records = await api.loadRecords();
    if (queryUrl) {
      state.scope = { type: 'page', key: queryUrl };
    }
    render();
  }

  async function persistRecords(records) {
    state.records = await api.saveRecords(records);
    render();
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportMarkdown() {
    const records = filteredRecords();
    const markdown = records.map((record) => {
      const title = getRecordTitle(record);
      const header = `# ${title}\n\nSource: ${record.url || record.normalizedUrl}\n`;
      const body = api.formatHighlightsMarkdown(record.highlights, { highlightInlineSyntax: 'html-mark' });
      return `${header}\n${body}`.trim();
    }).join('\n\n---\n\n');
    downloadFile(`MarkSnip-highlights-${Date.now()}.md`, markdown || '# MarkSnip Highlights\n', 'text/markdown');
  }

  function exportJson() {
    const payload = filteredRecords().map((record) => ({
      url: record.url,
      normalizedUrl: record.normalizedUrl,
      title: record.title,
      siteName: record.siteName,
      highlights: api.collapseGroups(record.highlights)
    }));
    downloadFile(`MarkSnip-highlights-${Date.now()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  }

  async function deleteHighlight(normalizedUrl, highlightId) {
    const records = api.normalizeRecords(state.records);
    const record = records[normalizedUrl];
    if (!record) {
      return;
    }
    record.highlights = api.removeHighlightById(record.highlights, highlightId);
    if (record.highlights.length > 0) {
      record.updatedAt = new Date().toISOString();
      records[normalizedUrl] = record;
    } else {
      delete records[normalizedUrl];
    }
    state.editingHighlights.delete(highlightId);
    await persistRecords(records);
  }

  async function updateHighlight(normalizedUrl, highlightId, updates) {
    const records = api.normalizeRecords(state.records);
    const record = records[normalizedUrl];
    if (!record) {
      return;
    }
    record.highlights = api.updateHighlight(record.highlights, highlightId, updates);
    record.updatedAt = new Date().toISOString();
    records[normalizedUrl] = record;
    await persistRecords(records);
  }

  async function writeClipboardText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  async function copyHighlight(record, highlightId, highlightEl) {
    const highlight = api.normalizeHighlightList(record?.highlights).find((item) => item.id === highlightId);
    const text = api.getHighlightPlainText(highlight) || '';
    if (!text) {
      return;
    }
    await writeClipboardText(text);
    highlightEl.dataset.copyState = 'done';
    window.setTimeout(() => {
      if (highlightEl.isConnected && highlightEl.dataset.copyState === 'done') {
        delete highlightEl.dataset.copyState;
      }
    }, 900);
  }

  async function clearAll() {
    if (!confirm('Delete all saved highlights from this browser? This cannot be undone.')) {
      return;
    }
    state.scope = { type: 'all', key: '' };
    state.editingHighlights.clear();
    await persistRecords({});
  }

  function createSwatches(highlight) {
    return Object.keys(api.DEFAULT_COLORS).map((color) => (
      `<button class="swatch${api.normalizeColor(highlight.color) === color ? ' is-active' : ''}" type="button" data-action="color" data-color="${color}" aria-label="${color}"></button>`
    )).join('');
  }

  function copyIcon() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy-icon lucide-copy" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
  }

  function editIcon() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>';
  }

  function trashIcon() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2" aria-hidden="true"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  }

  function noteIcon() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="highlight-note-icon" aria-hidden="true"><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M16 2v20"/></svg>';
  }

  function renderHighlight(record, highlight) {
    const text = api.getHighlightPlainText(highlight) || api.stripHtml(highlight.contentHtml || '');
    const type = highlight.type ? `${highlight.type} highlight` : 'Highlight';
    const date = formatDate(highlight.updatedAt || highlight.createdAt);
    const isEditing = state.editingHighlights.has(highlight.id);
    const note = String(highlight.note || '');
    const notePreview = note
      ? `<p class="highlight-note">${noteIcon()}<span class="highlight-note-text">${escapeHtml(note)}</span></p>`
      : '';
    const editPanel = isEditing
      ? `
          <div class="highlight-edit-panel">
            <label class="highlight-note-label">
              <span>Note</span>
              <textarea data-action="note" aria-label="Highlight note" placeholder="Add a note">${escapeHtml(note)}</textarea>
            </label>
            <div class="highlight-edit-row">
              <div class="color-row" aria-label="Highlight color">${createSwatches(highlight)}</div>
              <button class="btn btn-primary btn-compact" type="button" data-action="save-edit">Done</button>
            </div>
          </div>
        `
      : '';
    return `
      <article class="highlight-item" data-highlight-id="${escapeHtml(highlight.id)}" data-color="${api.normalizeColor(highlight.color)}">
        <div class="highlight-strip" aria-hidden="true"></div>
        <div class="highlight-body">
          <div class="highlight-top-actions" aria-label="Highlight actions">
            <button class="icon-action" type="button" data-action="copy" aria-label="Copy highlight" title="Copy highlight">${copyIcon()}</button>
            <button class="icon-action${isEditing ? ' is-active' : ''}" type="button" data-action="toggle-edit" aria-label="Edit highlight" title="Edit highlight">${editIcon()}</button>
            <button class="icon-action icon-action--danger" type="button" data-action="delete" aria-label="Delete highlight" title="Delete highlight">${trashIcon()}</button>
          </div>
          <p class="highlight-text">${escapeHtml(text || 'Empty highlight')}</p>
          ${notePreview}
          ${editPanel}
          <div class="highlight-meta">
            <div class="highlight-meta-text">
              <span class="highlight-type">${escapeHtml(type)}</span>
              <span class="highlight-date">${escapeHtml(date)}</span>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderPage(record) {
    const title = getRecordTitle(record);
    const pageUrl = getRecordUrl(record);
    return `
      <section class="page-group" data-page-url="${escapeHtml(record.normalizedUrl)}">
        <header class="page-header">
          <div>
            <h2 class="page-title">${escapeHtml(title)}</h2>
            <div class="page-url" title="${escapeHtml(pageUrl)}">${escapeHtml(formatUrl(pageUrl))}</div>
          </div>
          <div class="page-actions">
            <button class="btn" type="button" data-action="open-page">Open source</button>
          </div>
        </header>
        <div class="highlight-list">
          ${record.highlights.map((highlight) => renderHighlight(record, highlight)).join('')}
        </div>
      </section>
    `;
  }

  function renderSourceIcon(group) {
    const fallback = escapeHtml(group.fallback || 'H');
    if (!group.faviconUrl) {
      return `<span class="source-icon source-icon--fallback-only" aria-hidden="true"><span class="source-icon-fallback">${fallback}</span></span>`;
    }
    return `
      <span class="source-icon" aria-hidden="true">
        <img class="source-icon-img" src="${escapeHtml(group.faviconUrl)}" alt="" loading="lazy">
        <span class="source-icon-fallback">${fallback}</span>
      </span>
    `;
  }

  function renderSourceGroups(groups) {
    return groups.map((group) => {
      const isCollapsed = state.collapsedSources.has(group.key);
      const isSourceActive = state.scope.type === 'source' && state.scope.key === group.key;
      const isPageInSourceActive = state.scope.type === 'page' && group.pages.some((page) => page.normalizedUrl === state.scope.key);
      const pages = group.pages.map((page) => {
        const isPageActive = state.scope.type === 'page' && state.scope.key === page.normalizedUrl;
        return `
          <button class="source-page${isPageActive ? ' is-active' : ''}" type="button" data-action="select-page" data-page-url="${escapeHtml(page.normalizedUrl)}">
            <span class="source-page-title">${escapeHtml(page.title)}</span>
            <span class="source-count">${page.count}</span>
          </button>
        `;
      }).join('');

      return `
        <section class="source-group" data-source-key="${escapeHtml(group.key)}">
          <div class="source-group-row">
            <button class="source-disclosure${isCollapsed ? ' is-collapsed' : ''}" type="button" data-action="toggle-source" data-source-key="${escapeHtml(group.key)}" aria-label="${isCollapsed ? 'Expand' : 'Collapse'} ${escapeHtml(group.label)}" aria-expanded="${String(!isCollapsed)}">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5l6 5-6 5"/></svg>
            </button>
            <button class="source-item source-item--group${isSourceActive || isPageInSourceActive ? ' is-active' : ''}" type="button" data-action="select-source" data-source-key="${escapeHtml(group.key)}">
              ${renderSourceIcon(group)}
              <span class="source-item-title">${escapeHtml(group.label)}</span>
              <span class="source-count">${group.count}</span>
            </button>
          </div>
          <div class="source-pages" ${isCollapsed ? 'hidden' : ''}>
            ${pages}
          </div>
        </section>
      `;
    }).join('');
  }

  function updateBreadcrumb() {
    const isAll = state.scope.type === 'all';
    dom.breadcrumbAll.disabled = isAll;
    dom.breadcrumbSeparator.hidden = isAll;
    dom.breadcrumbCurrent.hidden = isAll;
    dom.breadcrumbCurrent.textContent = getScopeLabel();
  }

  function setExportMenuOpen(open) {
    dom.exportMenu.hidden = !open;
    dom.exportMenuButton.setAttribute('aria-expanded', String(open));
  }

  function render() {
    ensureScopeStillValid();
    const navigationRecords = recordsMatchingFilters();
    const records = filteredRecords();
    const totalPages = records.length;
    const totalHighlights = countHighlights(records);
    const navigationCount = countHighlights(navigationRecords);

    dom.summaryText.textContent = `${totalHighlights} highlight${totalHighlights === 1 ? '' : 's'} across ${totalPages} page${totalPages === 1 ? '' : 's'}`;
    dom.emptyState.hidden = totalHighlights > 0;
    dom.pagesList.innerHTML = records.map(renderPage).join('');
    dom.sourceList.innerHTML = renderSourceGroups(buildSourceGroups(navigationRecords));
    dom.allHighlightsCount.textContent = String(navigationCount);
    dom.allHighlightsButton.classList.toggle('is-active', state.scope.type === 'all');
    dom.clearAll.disabled = allRecords().length === 0;
    dom.exportMenuButton.disabled = totalHighlights === 0;
    dom.exportMarkdown.disabled = totalHighlights === 0;
    dom.exportJson.disabled = totalHighlights === 0;
    updateBreadcrumb();
    if (totalHighlights === 0) {
      setExportMenuOpen(false);
    }
  }

  dom.searchInput.addEventListener('input', () => {
    state.search = dom.searchInput.value || '';
    render();
  });

  dom.colorFilter.addEventListener('change', () => {
    state.color = dom.colorFilter.value || '';
    render();
  });

  dom.allHighlightsButton.addEventListener('click', () => setScope('all'));
  dom.breadcrumbAll.addEventListener('click', () => setScope('all'));

  dom.exportMenuButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!dom.exportMenuButton.disabled) {
      setExportMenuOpen(dom.exportMenu.hidden);
    }
  });

  dom.exportMarkdown.addEventListener('click', () => {
    setExportMenuOpen(false);
    exportMarkdown();
  });
  dom.exportJson.addEventListener('click', () => {
    setExportMenuOpen(false);
    exportJson();
  });
  dom.clearAll.addEventListener('click', clearAll);

  dom.openOptions.addEventListener('click', async () => {
    if (browser.runtime?.openOptionsPage) {
      await browser.runtime.openOptionsPage();
      return;
    }
    await browser.tabs.create({ url: browser.runtime.getURL('options/options.html') });
  });

  dom.sourceList.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    const action = target?.dataset.action;
    if (!action) {
      return;
    }
    if (action === 'toggle-source') {
      const sourceKey = target.dataset.sourceKey || '';
      if (state.collapsedSources.has(sourceKey)) {
        state.collapsedSources.delete(sourceKey);
      } else {
        state.collapsedSources.add(sourceKey);
      }
      render();
    } else if (action === 'select-source') {
      setScope('source', target.dataset.sourceKey || '');
    } else if (action === 'select-page') {
      setScope('page', target.dataset.pageUrl || '');
    }
  });

  dom.sourceList.addEventListener('error', (event) => {
    const image = event.target;
    if (image?.classList?.contains('source-icon-img')) {
      image.closest('.source-icon')?.classList.add('source-icon--fallback-only');
    }
  }, true);

  dom.pagesList.addEventListener('click', async (event) => {
    const page = event.target.closest('.page-group');
    const highlightEl = event.target.closest('.highlight-item');
    const actionTarget = event.target.closest('[data-action]');
    const action = actionTarget?.dataset.action;
    if (!page || !action) {
      return;
    }
    const normalizedUrl = page.dataset.pageUrl;
    const records = api.normalizeRecords(state.records);
    const record = records[normalizedUrl];

    if (action === 'open-page' && record?.url) {
      await browser.tabs.create({ url: record.url });
    } else if (highlightEl) {
      const highlightId = highlightEl.dataset.highlightId;
      if (action === 'delete') {
        await deleteHighlight(normalizedUrl, highlightId);
      } else if (action === 'copy') {
        await copyHighlight(record, highlightId, highlightEl);
      } else if (action === 'toggle-edit') {
        if (state.editingHighlights.has(highlightId)) {
          state.editingHighlights.delete(highlightId);
        } else {
          state.editingHighlights.add(highlightId);
        }
        render();
      } else if (action === 'save-edit') {
        const note = highlightEl.querySelector('textarea[data-action="note"]')?.value || '';
        state.editingHighlights.delete(highlightId);
        await updateHighlight(normalizedUrl, highlightId, { note });
      } else if (action === 'color') {
        const note = highlightEl.querySelector('textarea[data-action="note"]')?.value || '';
        await updateHighlight(normalizedUrl, highlightId, {
          color: actionTarget.dataset.color,
          note
        });
      }
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.export-menu')) {
      setExportMenuOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setExportMenuOpen(false);
    }
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[api.STORAGE_KEYS.RECORDS]) {
      return;
    }
    state.records = api.normalizeRecords(changes[api.STORAGE_KEYS.RECORDS].newValue || {});
    render();
  });

  load().catch((error) => {
    dom.summaryText.textContent = `Failed to load highlights: ${error.message}`;
  });
})();
