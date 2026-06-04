/**
 * Tests shared offscreen markdown option normalization helper.
 */

const { createEffectiveMarkdownOptions } = require('../../shared/markdown-options');
const templateUtils = require('../../shared/template-utils');

describe('Offscreen markdown option handling', () => {
  const article = {
    title: 'Article Title',
    pageTitle: 'Doc/Page Title',
    excerpt: 'A summary',
    byline: 'Author Name',
    pageURL: 'https://example.com/docs/page',
    baseURI: 'https://example.com/docs/page',
    keywords: ['docs', 'markdown']
  };

  test('creates a derived options object without mutating the caller options', () => {
    const originalOptions = {
      includeTemplate: false,
      downloadImages: true,
      frontmatter: 'front',
      backmatter: 'back',
      imagePrefix: '{pageTitle}/assets',
      disallowedChars: '[]#^',
      tableFormatting: {
        stripLinks: true,
        prettyPrint: true
      }
    };

    const snapshot = JSON.parse(JSON.stringify(originalOptions));
    const derivedOptions = createEffectiveMarkdownOptions(article, originalOptions, false);

    expect(derivedOptions).not.toBe(originalOptions);
    expect(derivedOptions.tableFormatting).not.toBe(originalOptions.tableFormatting);
    expect(derivedOptions.downloadImages).toBe(false);
    expect(derivedOptions.frontmatter).toBe('');
    expect(derivedOptions.backmatter).toBe('');
    expect(derivedOptions.imagePlacement).toBe('customPrefix');
    expect(derivedOptions.imagePrefix).toBe('DocPage Title/assets');
    expect(originalOptions).toEqual(snapshot);
  });

  test('expands templated fields on the derived copy only', () => {
    const originalOptions = {
      includeTemplate: true,
      downloadImages: false,
      frontmatter: 'title: {pageTitle}',
      backmatter: 'source: {pageURL}',
      imagePrefix: '{pageTitle}/images',
      disallowedChars: '[]#^',
      tableFormatting: {
        stripLinks: true
      }
    };

    const derivedOptions = createEffectiveMarkdownOptions(article, originalOptions, null);

    expect(derivedOptions.frontmatter).toBe('title: Doc/Page Title\n');
    expect(derivedOptions.backmatter).toBe('\nsource: https://example.com/docs/page');
    expect(derivedOptions.imagePlacement).toBe('customPrefix');
    expect(derivedOptions.imagePrefix).toBe('DocPage Title/images');
    expect(originalOptions.frontmatter).toBe('title: {pageTitle}');
    expect(originalOptions.backmatter).toBe('source: {pageURL}');
    expect(originalOptions.imagePrefix).toBe('{pageTitle}/images');
  });

  test('strips prompt placeholders from frontmatter and backmatter when interpreter is disabled', () => {
    const derivedOptions = createEffectiveMarkdownOptions(article, {
      includeTemplate: true,
      interpreterEnabled: false,
      downloadImages: false,
      frontmatter: 'tags: {{prompt:"Pick tags"}}\ntitle: {pageTitle}',
      backmatter: 'next: {{"Follow up"|kebab}}',
      imagePrefix: '',
      disallowedChars: '[]#^',
      tableFormatting: {}
    }, null);

    expect(derivedOptions.frontmatter).toBe('tags: \ntitle: Doc/Page Title\n');
    expect(derivedOptions.backmatter).toBe('\nnext: ');
  });

  test('preserves prompt placeholders in frontmatter and backmatter when interpreter is enabled', () => {
    const derivedOptions = createEffectiveMarkdownOptions(article, {
      includeTemplate: true,
      interpreterEnabled: true,
      downloadImages: false,
      frontmatter: 'tags: {{prompt:"Pick tags"}}',
      backmatter: 'next: {{"Follow up"|kebab}}',
      imagePrefix: '',
      disallowedChars: '[]#^',
      tableFormatting: {}
    }, null);

    expect(derivedOptions.frontmatter).toBe('tags: {{prompt:"Pick tags"}}\n');
    expect(derivedOptions.backmatter).toBe('\nnext: {{"Follow up"|kebab}}');
  });

  test('honors downloadImages override parameter', () => {
    const originalOptions = {
      includeTemplate: false,
      downloadImages: false,
      frontmatter: '',
      backmatter: '',
      imagePrefix: 'assets/',
      disallowedChars: '',
      tableFormatting: {}
    };

    const derived = createEffectiveMarkdownOptions(article, originalOptions, true);

    expect(derived.downloadImages).toBe(true);
    expect(originalOptions.downloadImages).toBe(false);
    expect(derived.imagePrefix).toBe('assets/');
  });

  test('infers legacy sidecar placement before imagePrefix templates are expanded', () => {
    const derived = createEffectiveMarkdownOptions(article, {
      includeTemplate: false,
      downloadImages: true,
      imagePrefix: '{pageTitle}/',
      disallowedChars: '[]#^',
      tableFormatting: {}
    }, null);

    expect(derived.imagePlacement).toBe('sidecar');
    expect(derived.imagePrefix).toBe('DocPage Title/');
  });

  test('infers legacy same-folder placement for blank imagePrefix', () => {
    const derived = createEffectiveMarkdownOptions(article, {
      includeTemplate: false,
      downloadImages: true,
      imagePrefix: '',
      disallowedChars: '[]#^',
      tableFormatting: {}
    }, null);

    expect(derived.imagePlacement).toBe('sameFolder');
    expect(derived.imagePrefix).toBe('');
  });

  test('sanitizes imagePrefix segments via generateValidFileName', () => {
    const spy = jest.spyOn(templateUtils, 'generateValidFileName');
    const options = {
      includeTemplate: false,
      imagePrefix: '{pageTitle}/assets /snapshots',
      disallowedChars: '[]',
      tableFormatting: {}
    };

    const derived = createEffectiveMarkdownOptions(article, options, null);

    expect(spy).toHaveBeenCalled();
    expect(derived.imagePrefix).toContain('assets');
    spy.mockRestore();
  });

  test('applies configured replacement while preserving template folder separators', () => {
    const derived = createEffectiveMarkdownOptions(article, {
      includeTemplate: false,
      imagePrefix: '{pageTitle}/assets',
      disallowedChars: '[]#^',
      disallowedCharReplacement: '_',
      tableFormatting: {}
    }, null);

    expect(derived.imagePrefix).toBe('Doc_Page Title/assets');
  });

  test('prefers runtime template utils when the helper is predefined before module loads', () => {
    const originalHelper = global.markSnipTemplateUtils;
    global.markSnipTemplateUtils = {
      textReplace: jest.fn((value) => String(value || '').replace('{title}', 'Preloaded')),
      generateValidFileName: jest.fn((value) => value)
    };
    jest.resetModules();

    try {
      const { createEffectiveMarkdownOptions: runtimeOptions } = require('../../shared/markdown-options');
      const derived = runtimeOptions(article, {
        includeTemplate: true,
        frontmatter: 'title: {title}',
        backmatter: '',
        imagePrefix: '{title}/assets',
        disallowedChars: ''
      }, null);

      expect(global.markSnipTemplateUtils.textReplace).toHaveBeenCalled();
      expect(derived.imagePrefix).toBe('Preloaded/assets');
    } finally {
      global.markSnipTemplateUtils = originalHelper;
      jest.resetModules();
    }
  });

  test('handles missing tableFormatting without throwing', () => {
    const derived = createEffectiveMarkdownOptions(article, {
      includeTemplate: false,
      imagePrefix: '',
      backmatter: '',
      frontmatter: '',
      disallowedChars: ''
    }, null);

    expect(derived.tableFormatting).toBeUndefined();
  });

  test('falls back to global defaultOptions when no explicit options are provided', () => {
    const originalDefaults = global.defaultOptions;
    global.defaultOptions = {
      includeTemplate: false,
      imagePrefix: 'defaults/',
      disallowedChars: '',
      tableFormatting: {
        prettyPrint: true
      }
    };

    try {
      const derived = createEffectiveMarkdownOptions(article, null, null);
      expect(derived.imagePrefix).toBe('defaults/');
      expect(derived.tableFormatting).toEqual({ prettyPrint: true });
    } finally {
      global.defaultOptions = originalDefaults;
    }
  });

  test('returns safe defaults when neither explicit options nor defaultOptions exist', () => {
    const originalDefaults = global.defaultOptions;
    delete global.defaultOptions;

    try {
      const derived = createEffectiveMarkdownOptions(article, null, null);
      expect(derived.frontmatter).toBe('');
      expect(derived.backmatter).toBe('');
      expect(derived.imagePrefix).toBe('');
      expect(derived.tableFormatting).toBeUndefined();
    } finally {
      global.defaultOptions = originalDefaults;
    }
  });

  test('uses fallback template utils when the runtime helper is missing', () => {
    const originalHelper = global.markSnipTemplateUtils;
    delete global.markSnipTemplateUtils;
    jest.resetModules();

    jest.isolateModules(() => {
      const { createEffectiveMarkdownOptions: fallbackOptions } = require('../../shared/markdown-options');
      const fallbackArticle = {
        title: 'Fallback Title',
        pageURL: 'https://fallback.test/page',
        baseURI: 'https://fallback.test',
        keywords: ['fallback']
      };

      const derived = fallbackOptions(fallbackArticle, {
        includeTemplate: true,
        frontmatter: 'title: {title}',
        backmatter: 'source: {pageURL}',
        imagePrefix: '{title}/assets',
        disallowedChars: '[]'
      }, null);

      expect(derived.frontmatter).toBe('title: Fallback Title\n');
      expect(derived.imagePrefix).toContain('Fallback Title/assets');
    });

    global.markSnipTemplateUtils = originalHelper;
    jest.resetModules();
  });

  test('uses runtime template utils when the global helper is present', () => {
    const originalHelper = global.markSnipTemplateUtils;
    global.markSnipTemplateUtils = {
      textReplace: jest.fn((value) => String(value || '').replace('{pageTitle}', 'Injected Title')),
      generateValidFileName: jest.fn((value) => value)
    };
    jest.resetModules();

    try {
      jest.isolateModules(() => {
        const { createEffectiveMarkdownOptions: runtimeOptions } = require('../../shared/markdown-options');
        const derived = runtimeOptions(article, {
          includeTemplate: true,
          frontmatter: 'title: {pageTitle}',
          backmatter: 'source: {pageTitle}',
          imagePrefix: '{pageTitle}/images',
          disallowedChars: '',
          tableFormatting: {}
        });

        expect(global.markSnipTemplateUtils.textReplace).toHaveBeenCalled();
        expect(derived.frontmatter).toBe('title: Injected Title\n');
        expect(derived.imagePrefix).toBe('Injected Title/images');
      });
    } finally {
      global.markSnipTemplateUtils = originalHelper;
      jest.resetModules();
    }
  });

  test('falls back to inert helpers when template utils cannot be required', () => {
    const originalHelper = global.markSnipTemplateUtils;
    delete global.markSnipTemplateUtils;
    jest.resetModules();
    jest.doMock('../../shared/template-utils', () => {
      throw new Error('template utils unavailable');
    });

    try {
      jest.isolateModules(() => {
        const { createEffectiveMarkdownOptions: fallbackOptions } = require('../../shared/markdown-options');
        const derived = fallbackOptions(article, {
          includeTemplate: true,
          frontmatter: 'front',
          backmatter: 'back',
          imagePrefix: 'images/',
          disallowedChars: '',
          tableFormatting: {}
        });

        expect(derived.frontmatter).toBe('front\n');
        expect(derived.backmatter).toBe('\nback');
        expect(derived.imagePrefix).toBe('images/');
      });
    } finally {
      jest.dontMock('../../shared/template-utils');
      global.markSnipTemplateUtils = originalHelper;
      jest.resetModules();
    }
  });
});
