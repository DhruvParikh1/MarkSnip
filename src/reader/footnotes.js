(function (root, factory) {
  const api = factory(root);
  root.markSnipReader = Object.assign(root.markSnipReader || {}, api);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function getReaderHost(articleEl, doc) {
    const root = articleEl.getRootNode?.();
    if (root && root.host) {
      return root.querySelector?.('.ms-reader-root') || root;
    }
    return doc.body;
  }

  function getFootnoteTarget(articleEl, href) {
    if (!href || !href.startsWith('#')) return null;
    try {
      const id = decodeURIComponent(href.slice(1));
      const article = articleEl.ownerDocument === articleEl.getRootNode?.()
        ? articleEl.ownerDocument
        : articleEl.getRootNode?.() || articleEl.ownerDocument;
      return article.getElementById?.(id)
        || articleEl.querySelector?.(`#${CSS.escape(id)}`)
        || null;
    } catch {
      return null;
    }
  }

  function mountFootnotes(doc, articleEl) {
    let popover = null;

    function close() {
      popover?.remove();
      popover = null;
    }

    function open(anchor, target) {
      close();
      popover = doc.createElement('div');
      popover.className = 'ms-reader-footnote-popover';
      popover.tabIndex = -1;
      popover.setAttribute('role', 'dialog');
      popover.appendChild(target.cloneNode(true));
      getReaderHost(articleEl, doc).appendChild(popover);
      const rect = anchor.getBoundingClientRect();
      // Position after the popover is in the DOM so we have measured dimensions
      const popRect = popover.getBoundingClientRect();
      const margin = 8;
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const left = Math.max(margin, Math.min(rect.left, viewportW - popRect.width - margin));
      const wouldOverflowBottom = rect.bottom + margin + popRect.height > viewportH;
      const top = wouldOverflowBottom
        ? Math.max(margin, rect.top - popRect.height - margin)
        : rect.bottom + margin;
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
      popover.focus();
    }

    function handleClick(event) {
      const anchor = event.target?.closest?.('a[href^="#"]');
      if (!anchor || !articleEl.contains(anchor)) return;
      const target = getFootnoteTarget(articleEl, anchor.getAttribute('href'));
      if (!target) return;
      const relation = `${anchor.getAttribute('rel') || ''} ${anchor.className || ''} ${target.className || ''}`;
      if (!/footnote|fnref|reversefootnote/i.test(relation)) return;
      event.preventDefault();
      if (/reversefootnote/i.test(relation)) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        open(anchor, target);
      }
    }

    function handleDocumentClick(event) {
      if (popover && !popover.contains(event.target)) {
        close();
      }
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') close();
    }

    articleEl.addEventListener('click', handleClick);
    doc.addEventListener('click', handleDocumentClick);
    doc.addEventListener('keydown', handleKeydown);

    return {
      teardown() {
        articleEl.removeEventListener('click', handleClick);
        doc.removeEventListener('click', handleDocumentClick);
        doc.removeEventListener('keydown', handleKeydown);
        close();
      }
    };
  }

  return { mountFootnotes };
});
