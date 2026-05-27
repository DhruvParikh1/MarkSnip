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
      // shadow root — attach inside the reader root for style scoping
      return root.querySelector?.('.ms-reader-root') || root;
    }
    return doc.body;
  }

  function mountLightbox(doc, articleEl) {
    let overlay = null;

    function close() {
      overlay?.remove();
      overlay = null;
    }

    function open(src, alt) {
      close();
      overlay = doc.createElement('div');
      overlay.className = 'ms-reader-lightbox';
      overlay.tabIndex = -1;
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Image viewer');

      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'ms-reader-lightbox-close';
      button.setAttribute('aria-label', 'Close image viewer');
      button.addEventListener('click', close);

      const image = doc.createElement('img');
      image.src = src;
      image.alt = alt || '';

      overlay.appendChild(button);
      overlay.appendChild(image);
      // Click on the overlay backdrop (not the image) closes the viewer
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
      });
      getReaderHost(articleEl, doc).appendChild(overlay);
      overlay.focus();
    }

    function handleClick(event) {
      const image = event.target?.closest?.('img');
      if (!image || !articleEl.contains(image) || !image.currentSrc && !image.src) return;
      event.preventDefault();
      open(image.currentSrc || image.src, image.alt);
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') close();
    }

    articleEl.addEventListener('click', handleClick);
    doc.addEventListener('keydown', handleKeydown);

    return {
      teardown() {
        articleEl.removeEventListener('click', handleClick);
        doc.removeEventListener('keydown', handleKeydown);
        close();
      }
    };
  }

  return { mountLightbox };
});
