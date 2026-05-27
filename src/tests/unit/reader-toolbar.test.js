describe('reader toolbar popovers', () => {
  let toolbarApi;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    global.browser = {
      runtime: {
        sendMessage: jest.fn().mockResolvedValue({ ok: true })
      }
    };
    toolbarApi = require('../../reader/toolbar.js');
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.browser;
    document.body.innerHTML = '';
  });

  test('clicks inside the typography popover apply settings without closing the popover', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    const rootEl = document.createElement('div');
    shadow.appendChild(rootEl);

    const toolbar = toolbarApi.mountToolbar(document, rootEl, {
      mode: 'overlay',
      settings: {
        fontSize: 16,
        lineHeight: 1.6,
        maxWidth: 38,
        appearance: 'auto',
        fontFamily: ''
      }
    });
    rootEl.appendChild(toolbar.element);

    const settingsButton = rootEl.querySelector('[data-action="toggle-settings"]');
    const popover = rootEl.querySelector('.ms-reader-popover--settings');
    settingsButton.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    jest.runOnlyPendingTimers();
    expect(popover.hidden).toBe(false);

    const increaseFont = rootEl.querySelector('[data-action="font-increase"]');
    increaseFont.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
    increaseFont.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await Promise.resolve();

    expect(popover.hidden).toBe(false);
    expect(rootEl.style.getPropertyValue('--ms-reader-font-size')).toBe('17px');
    expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'reader-save-settings',
      patch: { fontSize: 17 }
    });

    toolbar.teardown();
  });
});
