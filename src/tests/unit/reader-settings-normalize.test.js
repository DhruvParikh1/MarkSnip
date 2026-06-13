const {
  defaultOptions,
  getOptions,
  normalizeReaderSettings,
  sanitizeReaderCustomCss
} = require('../../shared/default-options.js');

describe('normalizeReaderSettings', () => {
  test('returns defaults for missing settings', () => {
    expect(normalizeReaderSettings(null)).toEqual(defaultOptions.readerSettings);
  });

  test('clamps numeric settings and rejects unknown enum values', () => {
    expect(normalizeReaderSettings({
      fontSize: 100,
      lineHeight: 0.5,
      maxWidth: 3,
      appearance: 'sepia',
      fontFamily: 'Comic Sans'
    })).toEqual({
      ...defaultOptions.readerSettings,
      fontSize: 32,
      lineHeight: 1.1,
      maxWidth: 24
    });
  });

  test('preserves supported appearance and font values', () => {
    expect(normalizeReaderSettings({
      appearance: 'dark',
      fontFamily: '__serif__'
    })).toEqual({
      ...defaultOptions.readerSettings,
      appearance: 'dark',
      fontFamily: '__serif__'
    });
  });

  test('strips dangerous custom CSS patterns', () => {
    const sanitized = sanitizeReaderCustomCss("@import url('x'); a{background:url(javascript:alert(1)); width:expression(alert(1));}");
    expect(sanitized).not.toMatch(/@import/i);
    expect(sanitized).not.toMatch(/javascript:/i);
    expect(sanitized).not.toMatch(/expression\s*\(/i);
  });

  test('getOptions does not mutate shared defaults when storage lookup fails', async () => {
    const originalBrowser = global.browser;
    const defaultsSnapshot = JSON.parse(JSON.stringify(defaultOptions));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.browser = {
      storage: {
        sync: {
          get: jest.fn().mockRejectedValue(new Error('storage unavailable'))
        }
      }
    };

    try {
      const options = await getOptions();
      expect(options.downloadMode).toBe('contentLink');
      expect(defaultOptions).toEqual(defaultsSnapshot);
    } finally {
      errorSpy.mockRestore();
      global.browser = originalBrowser;
    }
  });
});
