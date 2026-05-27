const {
  defaultOptions,
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
});
