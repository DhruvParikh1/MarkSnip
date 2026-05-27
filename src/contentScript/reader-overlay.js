(function () {
  if (window.__marksnipReaderOverlayLoaded) {
    return;
  }
  window.__marksnipReaderOverlayLoaded = true;

  const MOUNT_ID = 'ms-reader-mount';
  const SURFACE_ID = 'reader-overlay';
  let originalOverflow = '';
  let originalScrollY = 0;

  function getMount() {
    return document.getElementById(MOUNT_ID);
  }

  function closeReaderOverlay() {
    const mount = getMount();
    if (!mount) return { ok: true, active: false };

    try {
      window.markSnipHighlighter?.unregisterSurface?.(SURFACE_ID);
    } catch {}
    try {
      window.__marksnipReaderOverlayTeardown?.teardown?.();
    } catch {}
    window.__marksnipReaderOverlayTeardown = null;
    mount.remove();
    document.documentElement.style.overflow = originalOverflow;
    window.scrollTo(0, originalScrollY);
    return { ok: true, active: false };
  }

  function openReaderOverlay(payload) {
    if (getMount()) {
      return { ok: true, active: true };
    }
    if (!window.markSnipReader?.renderShell) {
      return { ok: false, reason: 'reader-runtime-missing' };
    }

    originalOverflow = document.documentElement.style.overflow || '';
    originalScrollY = window.scrollY || 0;
    document.documentElement.style.overflow = 'hidden';

    const mount = document.createElement('div');
    mount.id = MOUNT_ID;
    mount.style.position = 'fixed';
    mount.style.inset = '0';
    mount.style.zIndex = '2147483646';
    mount.style.overflow = 'auto';
    document.body.appendChild(mount);

    const shadow = mount.attachShadow({ mode: 'closed' });
    if (payload.readerCssText) {
      const style = document.createElement('style');
      style.textContent = String(payload.readerCssText || '');
      shadow.appendChild(style);
    }

    const teardown = window.markSnipReader.renderShell(
      document,
      shadow,
      payload,
      payload.settings || {},
      'overlay',
      {
        onClose: closeReaderOverlay,
        onToggleHighlight: () => {
          if (!window.markSnipHighlighter?.toggle) {
            return Promise.resolve({ ok: false, reason: 'highlighter-unavailable' });
          }
          return window.markSnipHighlighter.toggle({
            surfaceId: SURFACE_ID,
            defaultColor: payload.highlightDefaultColor || payload.options?.highlightDefaultColor,
            highlightDefaultColor: payload.highlightDefaultColor || payload.options?.highlightDefaultColor
          });
        }
      }
    );
    window.__marksnipReaderOverlayTeardown = teardown;
    Promise.resolve(window.markSnipHighlighter?.registerSurface?.({
      id: SURFACE_ID,
      root: teardown.root,
      article: teardown.article,
      eventRoot: teardown.root,
      selectionRoot: shadow,
      scrollRoot: mount,
      pageUrl: payload.pageUrl || payload.article?.pageURL || payload.article?.baseURI,
      title: payload.title || payload.article?.title || document.title,
      forceOverlay: true,
      overlayZIndex: 2147483647,
      excludeSelector: '.ms-reader-bar, .ms-reader-outline, .ms-reader-highlights'
    })).catch(() => {});
    return { ok: true, active: true };
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'MARKSNIP_READER_STATUS') {
      return Promise.resolve({ active: !!getMount() });
    }
    if (message?.type === 'MARKSNIP_READER_CLOSE') {
      return Promise.resolve(closeReaderOverlay());
    }
    if (message?.type === 'MARKSNIP_READER_APPLY') {
      return Promise.resolve(openReaderOverlay(message.payload || message));
    }
    return false;
  });
})();
