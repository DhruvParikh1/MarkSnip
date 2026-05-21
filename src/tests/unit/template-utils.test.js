describe('Template utils helpers', () => {

  describe('generateValidFileName', () => {
    const { generateValidFileName } = require('../../shared/template-utils');

    test('removes custom disallowed regex characters when provided', () => {
      const raw = 'Archived [Notes] (2026)';
      const cleaned = generateValidFileName(raw, '[]()');

      expect(cleaned).toBe('Archived Notes 2026');
      expect(cleaned).not.toContain('[');
      expect(cleaned).not.toContain(']');
      expect(cleaned).not.toContain('(');
      expect(cleaned).not.toContain(')');
    });

    test('escapes regex metacharacters inside disallowedChars', () => {
      const raw = 'Funky *file* name';
      const cleaned = generateValidFileName(raw, '*');

      expect(cleaned).toBe('Funky file name');
    });

    test('replaces reserved filename characters when configured', () => {
      const cleaned = generateValidFileName('billing/plans:pro400', '', '_');

      expect(cleaned).toBe('billing_plans_pro400');
    });

    test('replaces custom disallowed characters when configured', () => {
      const cleaned = generateValidFileName('Example [Draft] #2', '[]#', '-');

      expect(cleaned).toBe('Example -Draft- -2');
    });

    test('strips reserved characters from unsafe replacement text', () => {
      const cleaned = generateValidFileName('billing/plans', '', '/');

      expect(cleaned).toBe('billingplans');
    });
  });

  describe('textReplace filename sanitization', () => {
    const { textReplace } = require('../../shared/template-utils');

    test('replaces reserved characters in substituted article values only', () => {
      const result = textReplace(
        '{pageTitle}/archive',
        { pageTitle: 'Billing/Plans:Pro400' },
        '/',
        '_'
      );

      expect(result).toBe('Billing_Plans_Pro400/archive');
    });
  });

  describe('prompt placeholder protection', () => {
    const {
      textReplace,
      protectPromptPlaceholders,
      stripPromptPlaceholders,
      generateValidFileName,
      FILTERS
    } = require('../../shared/template-utils');

    // Mirrors the composition in offscreen.js / service-worker.js formatTitle:
    // strip placeholders when the interpreter is off, otherwise textReplace then
    // protect placeholders around generateValidFileName.
    function formatTitleHarness(titleTemplate, article, { interpreterEnabled = true, disallowedChars = '[]#^', replacement = '' } = {}) {
      const effectiveTemplate = interpreterEnabled
        ? titleTemplate
        : stripPromptPlaceholders(titleTemplate);
      let title = textReplace(effectiveTemplate, article, disallowedChars + '/', replacement);
      const protectedPrompts = protectPromptPlaceholders(title);
      title = protectedPrompts.text
        .split('/')
        .map((segment) => generateValidFileName(segment, disallowedChars, replacement))
        .join('/');
      return protectedPrompts.restore(title);
    }

    test('FILTERS map is exported with the expected filters', () => {
      expect(typeof FILTERS.kebab).toBe('function');
      expect(typeof FILTERS.uppercase).toBe('function');
      expect(FILTERS.kebab('Hello World')).toBe('hello-world');
    });

    test('protectPromptPlaceholders is a no-op when there are no placeholders', () => {
      const { text, restore } = protectPromptPlaceholders('plain {pageTitle} text');
      expect(text).toBe('plain {pageTitle} text');
      expect(restore('plain {pageTitle} text')).toBe('plain {pageTitle} text');
    });

    test('protectPromptPlaceholders swaps placeholders for sentinels and restores them', () => {
      const { text, restore } = protectPromptPlaceholders('a {{prompt:"x"}} b {{"y"|kebab}} c');
      expect(text).not.toContain('{{');
      expect(restore(text)).toBe('a {{prompt:"x"}} b {{"y"|kebab}} c');
    });

    test('textReplace preserves prompt placeholders while resolving and stripping other tokens', () => {
      const result = textReplace(
        'tags: {{prompt:"Suggest 3 tags"}}\nsource: {pageURL}\nstray: {junk}',
        { pageURL: 'https://example.com' }
      );
      expect(result).toContain('{{prompt:"Suggest 3 tags"}}');
      expect(result).toContain('source: https://example.com');
      expect(result).toContain('stray: ');
      expect(result).not.toContain('{junk}');
    });

    test('textReplace preserves a filtered prompt placeholder', () => {
      const result = textReplace('x {{prompt:"tag"|kebab}} y', {});
      expect(result).toBe('x {{prompt:"tag"|kebab}} y');
    });

    test('textReplace preserves a chained-filter prompt placeholder', () => {
      const result = textReplace('x {{prompt:"tag"|kebab|uppercase}} y', {});
      expect(result).toBe('x {{prompt:"tag"|kebab|uppercase}} y');
    });

    test('plain prompt placeholder survives the full formatTitle path', () => {
      // The placeholder keeps its internal ":" and quotes even though
      // generateValidFileName would otherwise strip them as illegal filename
      // characters. The " - " separator is ordinary title text.
      const result = formatTitleHarness('{pageTitle} - {{prompt:"AI Title"}}', { pageTitle: 'My Page' });
      expect(result).toBe('My Page - {{prompt:"AI Title"}}');
    });

    test('filtered prompt placeholder survives the full formatTitle path', () => {
      const result = formatTitleHarness('{pageTitle} {{prompt:"AI"|kebab|uppercase}}', { pageTitle: 'Page' });
      expect(result).toBe('Page {{prompt:"AI"|kebab|uppercase}}');
    });

    test('stripPromptPlaceholders removes prompt tokens but keeps other text', () => {
      const stripped = stripPromptPlaceholders('a {{prompt:"x"}} b {{"y"|kebab}} {pageTitle}');
      expect(stripped).toBe('a  b  {pageTitle}');
    });

    test('stripPromptPlaceholders is a no-op when there are no placeholders', () => {
      expect(stripPromptPlaceholders('plain {pageTitle}')).toBe('plain {pageTitle}');
    });

    test('formatTitle path strips the prompt placeholder when the interpreter is off', () => {
      const result = formatTitleHarness(
        '{pageTitle} {{prompt:"AI Title"}}',
        { pageTitle: 'My Page' },
        { interpreterEnabled: false }
      );
      expect(result).toBe('My Page ');
      expect(result).not.toContain('{{');
    });

    test('textReplace still preserves placeholders for frontmatter regardless of interpreter state', () => {
      // textReplace itself is interpreter-agnostic; the disabled-state strip is
      // applied by the caller before textReplace runs.
      const result = textReplace('tags: {{prompt:"t"}}', {});
      expect(result).toBe('tags: {{prompt:"t"}}');
    });
  });

  describe('formatDate fallback', () => {
    const originalMoment = global.moment;

    afterEach(() => {
      jest.resetModules();
      jest.dontMock('../../background/moment.min.js');
      global.moment = originalMoment;
    });

    test('falls back to ISO date when moment cannot be loaded', () => {
      jest.resetModules();
      jest.doMock('../../background/moment.min.js', () => {
        throw new Error('Moment unavailable');
      });
      delete global.moment;

      jest.isolateModules(() => {
        const { textReplace } = require('../../shared/template-utils');
        const result = textReplace('Date: {date:YYYY-MM-DD}', {});

        expect(result).toMatch(/^Date: \d{4}-\d{2}-\d{2}$/);
      });
    });
  });
});
