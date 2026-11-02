const {
  defaultOptions,
  normalizeMathAttributeRules,
  resolveMathAttributeNames
} = require('../../shared/default-options');

describe('normalizeMathAttributeRules', () => {
  test('defaults ship with gemini.google.com -> data-math', () => {
    expect(defaultOptions.mathAttributeRules).toEqual([
      { domain: 'gemini.google.com', attributes: ['data-math'] }
    ]);
    expect(defaultOptions.mathAttributesEnabled).toBe(true);
  });

  test('returns [] for non-array input', () => {
    expect(normalizeMathAttributeRules(undefined)).toEqual([]);
    expect(normalizeMathAttributeRules(null)).toEqual([]);
    expect(normalizeMathAttributeRules('nope')).toEqual([]);
  });

  test('lowercases/trims domains and dedupes attributes', () => {
    expect(normalizeMathAttributeRules([
      { domain: '  Gemini.Google.com ', attributes: [' data-math ', 'data-math', 'data-tex'] }
    ])).toEqual([
      { domain: 'gemini.google.com', attributes: ['data-math', 'data-tex'] }
    ]);
  });

  test('accepts a comma-separated attribute string', () => {
    expect(normalizeMathAttributeRules([
      { domain: 'example.com', attributes: 'data-math, data-tex ,,' }
    ])).toEqual([
      { domain: 'example.com', attributes: ['data-math', 'data-tex'] }
    ]);
  });

  test('keeps incomplete rows (so the options list never silently drops them)', () => {
    expect(normalizeMathAttributeRules([
      { domain: '', attributes: [] },
      { domain: 'example.com', attributes: [] }
    ])).toEqual([
      { domain: '', attributes: [] },
      { domain: 'example.com', attributes: [] }
    ]);
  });

  test('drops non-object entries', () => {
    expect(normalizeMathAttributeRules(['x', 42, null, { domain: 'a.com', attributes: ['data-math'] }])).toEqual([
      { domain: 'a.com', attributes: ['data-math'] }
    ]);
  });
});

describe('resolveMathAttributeNames', () => {
  const options = {
    mathAttributesEnabled: true,
    mathAttributeRules: [
      { domain: 'gemini.google.com', attributes: ['data-math'] },
      { domain: 'example.org', attributes: ['data-tex', 'data-latex'] }
    ]
  };

  test('matches an exact domain', () => {
    expect(resolveMathAttributeNames(options, 'https://gemini.google.com/app')).toEqual(['data-math']);
  });

  test('matches a subdomain of a configured domain', () => {
    expect(resolveMathAttributeNames(options, 'https://beta.gemini.google.com/x')).toEqual(['data-math']);
  });

  test('returns all attributes configured for the matching domain', () => {
    expect(resolveMathAttributeNames(options, 'https://notes.example.org/p')).toEqual(['data-tex', 'data-latex']);
  });

  test('returns [] for a non-matching domain', () => {
    expect(resolveMathAttributeNames(options, 'https://other.com/p')).toEqual([]);
  });

  test('returns [] when the feature is disabled', () => {
    expect(resolveMathAttributeNames({ ...options, mathAttributesEnabled: false }, 'https://gemini.google.com/app')).toEqual([]);
  });

  test('returns [] for an unparseable or missing URL', () => {
    expect(resolveMathAttributeNames(options, '')).toEqual([]);
    expect(resolveMathAttributeNames(options, 'not a url')).toEqual([]);
    expect(resolveMathAttributeNames(options, null)).toEqual([]);
  });

  test('does not partial-match a domain suffix that is not a real subdomain', () => {
    // "notgemini.google.com" must not match "gemini.google.com"
    expect(resolveMathAttributeNames(options, 'https://notgemini.google.com/app')).toEqual([]);
  });

  test('rejects attribute names that are unsafe in a CSS selector', () => {
    const unsafe = {
      mathAttributesEnabled: true,
      mathAttributeRules: [{ domain: 'evil.com', attributes: ['data-math]', 'data ok', 'data-good'] }]
    };
    expect(resolveMathAttributeNames(unsafe, 'https://evil.com/x')).toEqual(['data-good']);
  });
});
