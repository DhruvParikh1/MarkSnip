(function (root) {
  const LOCAL_SESSION_PREFIX = 'reader-session:';
  const LOCAL_SESSION_TTL_MS = 60 * 60 * 1000;
  let currentTeardown = null;
  let currentSession = null;
  let currentSessionId = '';

  function getSessionIdFromLocation() {
    return new URLSearchParams(root.location.search).get('id') || '';
  }

  async function readReaderSession(id) {
    if (!id) return null;
    if (root.browser?.storage?.session) {
      const stored = await root.browser.storage.session.get(id);
      if (stored?.[id]) return stored[id];
    }

    const key = LOCAL_SESSION_PREFIX + id;
    const stored = await root.browser.storage.local.get(key);
    const entry = stored?.[key];
    if (!entry) return null;
    if (Date.now() - Number(entry.capturedAt || 0) > LOCAL_SESSION_TTL_MS) {
      await root.browser.storage.local.remove(key).catch(() => {});
      return null;
    }
    return entry;
  }

  function getMount() {
    let mount = document.getElementById('reader-root');
    if (!mount) {
      mount = document.createElement('main');
      mount.id = 'reader-root';
      document.body.appendChild(mount);
    }
    return mount;
  }

  function showMessage(message) {
    const mount = getMount();
    mount.textContent = '';
    const p = document.createElement('p');
    p.textContent = message;
    mount.appendChild(p);
  }

  async function renderSession(sessionId, replaceState) {
    currentTeardown?.teardown?.();
    currentTeardown = null;
    currentSession = null;
    currentSessionId = sessionId;

    const mount = getMount();
    mount.textContent = '';
    const stored = await readReaderSession(sessionId);
    if (!stored) {
      showMessage('Reader session expired or could not be found.');
      return;
    }

    currentSession = stored;
    const payload = { ...stored, sessionId };
    currentTeardown = root.markSnipReader.renderShell(
      document,
      mount,
      payload,
      stored.settings || {},
      'tab',
      {
        sessionId,
        onClose() {
          window.close();
        }
      }
    );

    if (replaceState) {
      history.replaceState({ sessionId }, '', `reader.html?id=${encodeURIComponent(sessionId)}`);
    }
  }

  function resolveHref(href) {
    try {
      return new URL(href, currentSession?.pageUrl || currentSession?.article?.baseURI || location.href).href;
    } catch {
      return '';
    }
  }

  async function followReaderLink(anchor) {
    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#')) return false;
    const resolved = resolveHref(href);
    if (!resolved) return false;
    const parsed = new URL(resolved);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const response = await root.browser.runtime.sendMessage({
      type: 'reader-fetch-article',
      url: resolved
    });
    if (!response?.ok || !response.sessionId) {
      location.href = resolved;
      return true;
    }

    history.pushState({ sessionId: response.sessionId }, '', `reader.html?id=${encodeURIComponent(response.sessionId)}`);
    await renderSession(response.sessionId, false);
    return true;
  }

  document.addEventListener('click', (event) => {
    const anchor = event.target?.closest?.('a[href]');
    if (!anchor || !getMount().contains(anchor)) return;
    const resolved = resolveHref(anchor.getAttribute('href'));
    let protocol = '';
    try {
      protocol = new URL(resolved).protocol;
    } catch {}
    if (protocol !== 'http:' && protocol !== 'https:') return;
    event.preventDefault();
    followReaderLink(anchor).then(() => {}).catch(() => {
      const resolved = resolveHref(anchor.getAttribute('href'));
      if (resolved) location.href = resolved;
    });
  });

  window.addEventListener('popstate', (event) => {
    const sessionId = event.state?.sessionId || getSessionIdFromLocation();
    renderSession(sessionId, false).catch((error) => showMessage(error.message));
  });

  document.addEventListener('DOMContentLoaded', () => {
    const sessionId = getSessionIdFromLocation();
    renderSession(sessionId, true).catch((error) => showMessage(error.message));
  });

  root.markSnipReaderPage = {
    readReaderSession,
    renderSession
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
