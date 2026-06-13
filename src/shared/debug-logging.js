(function (root) {
  const DEBUG_LOG_STORAGE_KEY = 'markSnipDebugLogging';
  const DEBUG_METHODS = ['debug', 'info', 'log'];
  const nativeConsole = root.console;

  if (!nativeConsole || root.markSnipDebugLogging?.installed) {
    return;
  }

  const originalMethods = {};
  let enabled = root.MARKSNIP_DEBUG_LOGGING === true;
  let storageWatcherInstalled = false;

  for (const method of DEBUG_METHODS) {
    if (typeof nativeConsole[method] === 'function') {
      originalMethods[method] = nativeConsole[method].bind(nativeConsole);
    }
  }

  function applyLoggingState() {
    for (const method of DEBUG_METHODS) {
      if (!originalMethods[method]) continue;
      nativeConsole[method] = enabled ? originalMethods[method] : () => {};
    }
  }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled === true;
    applyLoggingState();
    return enabled;
  }

  async function configureFromStorage() {
    const storage = root.browser?.storage?.local;
    if (!storage?.get) return enabled;

    const stored = await storage.get({ [DEBUG_LOG_STORAGE_KEY]: enabled });
    return setEnabled(stored[DEBUG_LOG_STORAGE_KEY] === true);
  }

  function watchStorage() {
    if (storageWatcherInstalled) return;

    const onChanged = root.browser?.storage?.onChanged;
    if (!onChanged?.addListener) return;

    onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (!Object.prototype.hasOwnProperty.call(changes, DEBUG_LOG_STORAGE_KEY)) return;

      setEnabled(changes[DEBUG_LOG_STORAGE_KEY].newValue === true);
    });
    storageWatcherInstalled = true;
  }

  function configureWhenReady(attempt = 0) {
    if (root.browser?.storage?.local?.get) {
      configureFromStorage().catch(() => {});
      watchStorage();
      return;
    }

    if (attempt < 20 && typeof root.setTimeout === 'function') {
      root.setTimeout(() => configureWhenReady(attempt + 1), 0);
    }
  }

  root.markSnipDebugLogging = {
    installed: true,
    key: DEBUG_LOG_STORAGE_KEY,
    configureFromStorage,
    isEnabled: () => enabled,
    setEnabled,
    watchStorage
  };

  applyLoggingState();
  configureWhenReady();
})(typeof globalThis !== 'undefined' ? globalThis : this);
