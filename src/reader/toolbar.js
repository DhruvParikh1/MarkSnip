(function (root, factory) {
  const api = factory(root);
  root.markSnipReader = Object.assign(root.markSnipReader || {}, api);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const FONT_RANGE = { min: 9, max: 32, step: 1 };
  const WIDTH_RANGE = { min: 24, max: 72, step: 2 };
  const LINE_HEIGHT_RANGE = { min: 1.1, max: 2.4, step: 0.1 };

  /* ---------- Icons ---------- */
  // All icons are 24x24, currentColor. The CSS sizes them via .ms-reader-btn svg.
  const ICONS = {
    typography:
      '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
    highlighter:
      '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
    export:
      '<path d="M12 17V3"/><path d="m6 11 6 6 6-6"/><path d="M19 21H5"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    minus:
      '<path d="M5 12h14"/>',
    plus:
      '<path d="M12 5v14"/><path d="M5 12h14"/>',
    narrow:
      '<path d="M9 6L4 12l5 6"/><path d="M15 6l5 6-5 6"/>',
    wide:
      '<path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/>',
    lineDecrease:
      '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
    lineIncrease:
      '<path d="M4 5h16"/><path d="M4 19h16"/><path d="M4 12h16"/><path d="M4 8h16"/><path d="M4 16h16"/>',
    close:
      '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
    copy:
      '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    download:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'
  };

  function svgIcon(name, opts = {}) {
    const inner = ICONS[name];
    const stroke = opts.strokeWidth || 1.85;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  }

  /* ---------- DOM helpers ---------- */

  function makeButton(doc, opts) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = `ms-reader-btn${opts.variant ? ` ms-reader-btn--${opts.variant}` : ''}`;
    if (opts.action) button.dataset.action = opts.action;
    if (opts.value != null) button.dataset.value = String(opts.value);
    if (opts.ariaLabel) button.setAttribute('aria-label', opts.ariaLabel);
    if (opts.title) button.title = opts.title;
    if (opts.icon) button.insertAdjacentHTML('beforeend', svgIcon(opts.icon, opts.iconOpts));
    if (opts.label) {
      const span = doc.createElement('span');
      span.textContent = opts.label;
      button.appendChild(span);
    }
    return button;
  }

  function makeStepperRow(doc, opts) {
    const row = doc.createElement('div');
    row.className = 'ms-reader-control';
    const label = doc.createElement('span');
    label.className = 'ms-reader-control-label';
    label.textContent = opts.label;
    row.appendChild(label);

    const stepper = doc.createElement('div');
    stepper.className = 'ms-reader-stepper';

    const dec = doc.createElement('button');
    dec.type = 'button';
    dec.dataset.action = opts.decAction;
    dec.setAttribute('aria-label', `${opts.label} decrease`);
    dec.insertAdjacentHTML('beforeend', svgIcon(opts.decIcon || 'minus'));

    const value = doc.createElement('span');
    value.className = 'ms-reader-stepper-value';
    value.dataset.role = opts.valueRole;
    value.textContent = opts.format(opts.value);

    const inc = doc.createElement('button');
    inc.type = 'button';
    inc.dataset.action = opts.incAction;
    inc.setAttribute('aria-label', `${opts.label} increase`);
    inc.insertAdjacentHTML('beforeend', svgIcon(opts.incIcon || 'plus'));

    stepper.appendChild(dec);
    stepper.appendChild(value);
    stepper.appendChild(inc);
    row.appendChild(stepper);
    return row;
  }

  function makeSegmented(doc, opts) {
    const row = doc.createElement('div');
    row.className = 'ms-reader-control';
    const label = doc.createElement('span');
    label.className = 'ms-reader-control-label';
    label.textContent = opts.label;
    row.appendChild(label);

    const group = doc.createElement('div');
    group.className = 'ms-reader-segmented';
    group.setAttribute('role', 'radiogroup');
    group.dataset.role = opts.role;
    opts.options.forEach((option) => {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.dataset.action = opts.action;
      btn.dataset.value = option.value;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(option.value === opts.current));
      btn.textContent = option.label;
      group.appendChild(btn);
    });
    row.appendChild(group);
    return row;
  }

  /* ---------- Settings ---------- */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function applyReaderSettings(rootEl, settings = {}) {
    rootEl.style.setProperty('--ms-reader-font-size', `${settings.fontSize || 16}px`);
    rootEl.style.setProperty('--ms-reader-line-height', String(settings.lineHeight || 1.6));
    rootEl.style.setProperty('--ms-reader-line-width', `${settings.maxWidth || 38}em`);
    rootEl.dataset.msTheme = settings.appearance || 'auto';
    rootEl.dataset.msFont = settings.fontFamily === '__serif__' ? 'serif' : 'sans';
  }

  async function saveReaderSettings(patch) {
    if (!root.browser?.runtime?.sendMessage) {
      return { ok: false, reason: 'runtime-unavailable' };
    }
    try {
      return await root.browser.runtime.sendMessage({
        type: 'reader-save-settings',
        patch
      });
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }

  /* ---------- Popover plumbing ---------- */

  function setExpanded(button, expanded) {
    button.setAttribute('aria-expanded', String(expanded));
  }

  function bindOutsideClose(doc, popover, anchor, onClose) {
    // Bind to the popover's own root. In overlay mode this is the reader's
    // shadow root; binding on document sees closed-shadow events retargeted
    // to #ms-reader-mount and would treat every popover click as outside.
    const eventRoot = popover.getRootNode?.() || doc;

    function handler(event) {
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
      if (path.indexOf(popover) !== -1) return;
      if (path.indexOf(anchor) !== -1) return;
      onClose();
    }
    function escHandler(event) {
      if (event.key === 'Escape') {
        onClose();
        anchor.focus();
      }
    }
    // Defer binding to the next tick so the click that opened the popover
    // doesn't immediately match this listener and close it.
    let cancelBind = false;
    const bindTimer = setTimeout(() => {
      if (cancelBind) return;
      eventRoot.addEventListener('mousedown', handler, true);
      eventRoot.addEventListener('keydown', escHandler);
    }, 0);
    return () => {
      cancelBind = true;
      clearTimeout(bindTimer);
      eventRoot.removeEventListener('mousedown', handler, true);
      eventRoot.removeEventListener('keydown', escHandler);
    };
  }

  /* ---------- Settings popover ---------- */

  function buildSettingsPopover(doc, ctx, settingsState) {
    const popover = doc.createElement('div');
    popover.className = 'ms-reader-popover ms-reader-popover--settings';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Reader settings');
    popover.hidden = true;

    const fontRow = makeStepperRow(doc, {
      label: 'Text size',
      decAction: 'font-decrease',
      incAction: 'font-increase',
      decIcon: 'minus',
      incIcon: 'plus',
      valueRole: 'font-size',
      value: settingsState.fontSize,
      format: (v) => `${Math.round(v)}px`
    });

    const widthRow = makeStepperRow(doc, {
      label: 'Width',
      decAction: 'width-decrease',
      incAction: 'width-increase',
      decIcon: 'narrow',
      incIcon: 'wide',
      valueRole: 'width',
      value: settingsState.maxWidth,
      format: (v) => `${Math.round(v)}em`
    });

    const lineRow = makeStepperRow(doc, {
      label: 'Line height',
      decAction: 'line-height-decrease',
      incAction: 'line-height-increase',
      decIcon: 'lineDecrease',
      incIcon: 'lineIncrease',
      valueRole: 'line-height',
      value: settingsState.lineHeight,
      format: (v) => v.toFixed(1)
    });

    const themeRow = makeSegmented(doc, {
      label: 'Theme',
      action: 'theme',
      role: 'theme',
      current: settingsState.appearance || 'auto',
      options: [
        { value: 'auto',  label: 'Auto'  },
        { value: 'light', label: 'Light' },
        { value: 'dark',  label: 'Dark'  }
      ]
    });

    const fontRow2 = makeSegmented(doc, {
      label: 'Font',
      action: 'font-family',
      role: 'font-family',
      current: settingsState.fontFamily === '__serif__' ? '__serif__' : '',
      options: [
        { value: '',          label: 'Sans'  },
        { value: '__serif__', label: 'Serif' }
      ]
    });

    popover.appendChild(fontRow);
    popover.appendChild(widthRow);
    popover.appendChild(lineRow);
    popover.appendChild(themeRow);
    popover.appendChild(fontRow2);

    return popover;
  }

  function updatePopoverDisplay(popover, settingsState) {
    const setValue = (role, formatted) => {
      const el = popover.querySelector(`.ms-reader-stepper-value[data-role="${role}"]`);
      if (el) el.textContent = formatted;
    };
    setValue('font-size', `${Math.round(settingsState.fontSize)}px`);
    setValue('width', `${Math.round(settingsState.maxWidth)}em`);
    setValue('line-height', settingsState.lineHeight.toFixed(1));

    popover.querySelectorAll('.ms-reader-segmented').forEach((group) => {
      const role = group.dataset.role;
      const value = role === 'theme'
        ? (settingsState.appearance || 'auto')
        : (settingsState.fontFamily === '__serif__' ? '__serif__' : '');
      group.querySelectorAll('button').forEach((btn) => {
        btn.setAttribute('aria-checked', String(btn.dataset.value === value));
      });
    });
  }

  /* ---------- Actions menu ---------- */

  function buildActionsPopover(doc) {
    const popover = doc.createElement('div');
    popover.className = 'ms-reader-popover ms-reader-popover--actions';
    popover.setAttribute('role', 'menu');
    popover.hidden = true;

    const items = [
      { action: 'copy',     icon: 'copy',     label: 'Copy markdown' },
      { action: 'download', icon: 'download', label: 'Download .md' }
    ];

    items.forEach((item) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'ms-reader-menu-item';
      button.setAttribute('role', 'menuitem');
      button.dataset.action = item.action;
      button.insertAdjacentHTML('beforeend', svgIcon(item.icon));
      const label = doc.createElement('span');
      label.textContent = item.label;
      button.appendChild(label);
      const status = doc.createElement('span');
      status.className = 'ms-reader-menu-item-status';
      status.dataset.role = `status-${item.action}`;
      button.appendChild(status);
      popover.appendChild(button);
    });

    return popover;
  }

  function flashActionStatus(popover, action, state, label) {
    const status = popover.querySelector(`.ms-reader-menu-item-status[data-role="status-${action}"]`);
    if (!status) return;
    status.dataset.state = state;
    status.textContent = label;
    setTimeout(() => {
      if (status.dataset.state !== state) return;
      status.removeAttribute('data-state');
      status.textContent = '';
    }, 1600);
  }

  /* ---------- Toolbar ---------- */

  function mountToolbar(doc, rootEl, ctx = {}) {
    const settingsState = {
      fontSize: 16,
      lineHeight: 1.6,
      maxWidth: 38,
      appearance: 'auto',
      fontFamily: '',
      ...(ctx.settings || {})
    };

    const toolbar = doc.createElement('div');
    toolbar.className = 'ms-reader-bar';

    const titleWrap = doc.createElement('div');
    titleWrap.className = 'ms-reader-bar-title';
    titleWrap.textContent = ctx.title || ctx.payload?.title || ctx.payload?.article?.title || 'Reader View';
    toolbar.appendChild(titleWrap);

    const actions = doc.createElement('div');
    actions.className = 'ms-reader-bar-actions';

    /* Typography popover anchor (Aa) */
    const settingsWrap = doc.createElement('div');
    settingsWrap.className = 'ms-reader-popover-wrap';
    const settingsBtn = makeButton(doc, {
      action: 'toggle-settings',
      ariaLabel: 'Typography',
      title: 'Typography',
      icon: 'typography'
    });
    settingsBtn.setAttribute('aria-haspopup', 'dialog');
    settingsBtn.setAttribute('aria-expanded', 'false');
    const settingsPopover = buildSettingsPopover(doc, ctx, settingsState);
    settingsWrap.appendChild(settingsBtn);
    settingsWrap.appendChild(settingsPopover);
    actions.appendChild(settingsWrap);

    /* Highlighter — overlay only (chrome-extension tab can't run highlighter) */
    if (ctx.mode === 'overlay') {
      const highlightBtn = makeButton(doc, {
        action: 'highlight',
        ariaLabel: 'Highlight text on this page',
        title: 'Highlight',
        icon: 'highlighter'
      });
      highlightBtn.setAttribute('aria-pressed', 'false');
      actions.appendChild(highlightBtn);
    }

    /* Export popover (Copy / Download / Send to Obsidian) — both modes */
    const actionsWrap = doc.createElement('div');
    actionsWrap.className = 'ms-reader-popover-wrap';
    const actionsBtn = makeButton(doc, {
      action: 'toggle-actions',
      ariaLabel: 'Export article',
      title: 'Export',
      icon: 'export'
    });
    actionsBtn.setAttribute('aria-haspopup', 'menu');
    actionsBtn.setAttribute('aria-expanded', 'false');
    const actionsPopover = buildActionsPopover(doc);
    actionsWrap.appendChild(actionsBtn);
    actionsWrap.appendChild(actionsPopover);
    actions.appendChild(actionsWrap);

    /* Open MarkSnip options on the Reader View tab */
    const optionsBtn = makeButton(doc, {
      action: 'open-options',
      ariaLabel: 'Reader View settings',
      title: 'Reader View settings',
      icon: 'settings'
    });
    actions.appendChild(optionsBtn);

    const divider = doc.createElement('span');
    divider.className = 'ms-reader-bar-divider';
    divider.setAttribute('aria-hidden', 'true');
    actions.appendChild(divider);

    /* Close */
    const closeBtn = makeButton(doc, {
      action: 'close',
      ariaLabel: ctx.mode === 'overlay' ? 'Close reader view' : 'Close reader tab',
      title: ctx.mode === 'overlay' ? 'Close reader' : 'Close',
      icon: 'close',
      variant: 'close'
    });
    actions.appendChild(closeBtn);

    toolbar.appendChild(actions);

    /* ---- popover open/close state ---- */
    let unbindSettingsClose = null;
    let unbindActionsClose = null;

    function closeSettings() {
      if (settingsPopover.hidden) return;
      settingsPopover.hidden = true;
      setExpanded(settingsBtn, false);
      unbindSettingsClose?.();
      unbindSettingsClose = null;
    }

    function openSettings() {
      if (!settingsPopover.hidden) return;
      closeActions();
      settingsPopover.hidden = false;
      setExpanded(settingsBtn, true);
      unbindSettingsClose = bindOutsideClose(doc, settingsPopover, settingsBtn, closeSettings);
    }

    function closeActions() {
      if (actionsPopover.hidden) return;
      actionsPopover.hidden = true;
      setExpanded(actionsBtn, false);
      unbindActionsClose?.();
      unbindActionsClose = null;
    }

    function openActions() {
      if (!actionsPopover.hidden) return;
      closeSettings();
      actionsPopover.hidden = false;
      setExpanded(actionsBtn, true);
      unbindActionsClose = bindOutsideClose(doc, actionsPopover, actionsBtn, closeActions);
    }

    /* ---- update settings and propagate ---- */
    async function commitSettings(patch) {
      Object.assign(settingsState, patch);
      applyReaderSettings(rootEl, settingsState);
      updatePopoverDisplay(settingsPopover, settingsState);
      ctx.settings = settingsState;
      await saveReaderSettings(patch);
    }

    async function runReaderAction(action) {
      const sessionId = ctx.sessionId;
      if (!sessionId) {
        flashActionStatus(actionsPopover, action, 'error', 'No session');
        return;
      }
      flashActionStatus(actionsPopover, action, 'pending', 'Working…');
      const type = action === 'copy'
        ? 'reader-copy-markdown'
        : 'reader-download-markdown';
      try {
        const response = await root.browser.runtime.sendMessage({ type, sessionId });
        if (response?.ok === false) {
          flashActionStatus(actionsPopover, action, 'error', response.reason || 'Failed');
        } else {
          flashActionStatus(actionsPopover, action,
            'success',
            action === 'copy' ? 'Copied' : 'Saved');
        }
      } catch (error) {
        flashActionStatus(actionsPopover, action, 'error', 'Failed');
      }
    }

    async function runHighlightAction(button) {
      try {
        const response = await ctx.onToggleHighlight?.();
        if (response?.active != null) {
          button?.setAttribute?.('aria-pressed', String(!!response.active));
        }
      } catch {}
    }

    async function runOpenOptionsAction() {
      try {
        await root.browser?.runtime?.sendMessage?.({ type: 'open-reader-options' });
      } catch {}
    }

    /* ---- event delegation ---- */
    async function handleClick(event) {
      const btn = event.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      if (!action) return;

      if (action === 'close') {
        ctx.onClose?.();
        return;
      }

      if (action === 'toggle-settings') {
        settingsPopover.hidden ? openSettings() : closeSettings();
        return;
      }

      if (action === 'toggle-actions') {
        actionsPopover.hidden ? openActions() : closeActions();
        return;
      }

      if (action === 'highlight') {
        await runHighlightAction(btn);
        return;
      }

      if (action === 'open-options') {
        await runOpenOptionsAction();
        return;
      }

      if (action === 'copy' || action === 'download') {
        await runReaderAction(action);
        return;
      }

      if (action === 'theme') {
        await commitSettings({ appearance: btn.dataset.value });
        return;
      }

      if (action === 'font-family') {
        await commitSettings({ fontFamily: btn.dataset.value });
        return;
      }

      if (action === 'font-increase' || action === 'font-decrease') {
        const dir = action.endsWith('increase') ? 1 : -1;
        await commitSettings({
          fontSize: clamp(settingsState.fontSize + dir * FONT_RANGE.step, FONT_RANGE.min, FONT_RANGE.max)
        });
        return;
      }
      if (action === 'width-increase' || action === 'width-decrease') {
        const dir = action.endsWith('increase') ? 1 : -1;
        await commitSettings({
          maxWidth: clamp(settingsState.maxWidth + dir * WIDTH_RANGE.step, WIDTH_RANGE.min, WIDTH_RANGE.max)
        });
        return;
      }
      if (action === 'line-height-increase' || action === 'line-height-decrease') {
        const dir = action.endsWith('increase') ? 1 : -1;
        const next = Math.round((settingsState.lineHeight + dir * LINE_HEIGHT_RANGE.step) * 10) / 10;
        await commitSettings({
          lineHeight: clamp(next, LINE_HEIGHT_RANGE.min, LINE_HEIGHT_RANGE.max)
        });
        return;
      }
    }

    toolbar.addEventListener('click', handleClick);

    /* ---- apply initial state ---- */
    applyReaderSettings(rootEl, settingsState);
    updatePopoverDisplay(settingsPopover, settingsState);

    return {
      element: toolbar,
      teardown() {
        toolbar.removeEventListener('click', handleClick);
        closeSettings();
        closeActions();
      }
    };
  }

  return {
    mountToolbar,
    applyReaderSettings,
    saveReaderSettings,
    _bindReaderOutsideClose: bindOutsideClose,
    _readerToolbarIcons: ICONS
  };
});
