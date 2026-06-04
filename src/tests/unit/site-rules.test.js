const siteRules = require('../../shared/site-rules');

describe('site-rules helper', () => {
  const baseOptions = {
    includeTemplate: false,
    downloadImages: true,
    imageStyle: 'markdown',
    imageRefStyle: 'inlined',
    imagePlacement: 'sidecar',
    frontmatter: 'front',
    backmatter: 'back',
    title: '{pageTitle}',
    imagePrefix: '{pageTitle}/',
    mdClipsFolder: 'Clips',
    tableFormatting: {
      stripLinks: true,
      stripFormatting: false,
      prettyPrint: true,
      centerText: true
    }
  };

  test('matches exact host and wildcard paths', () => {
    expect(siteRules.matchesSiteRulePattern('example.com/docs/*', 'https://example.com/docs/page')).toBe(true);
    expect(siteRules.matchesSiteRulePattern('example.com/docs/*', 'https://example.com/blog/page')).toBe(false);
  });

  test('matches subdomain wildcard but not bare host', () => {
    expect(siteRules.matchesSiteRulePattern('*.example.com/*', 'https://docs.example.com/page')).toBe(true);
    expect(siteRules.matchesSiteRulePattern('*.example.com/*', 'https://example.com/page')).toBe(false);
  });

  test('ignores query strings and hashes when matching', () => {
    expect(siteRules.matchesSiteRulePattern('docs.example.com/blog/*', 'https://docs.example.com/blog/post?ref=1#top')).toBe(true);
  });

  test('normalizes malformed imports and drops invalid entries', () => {
    const normalized = siteRules.normalizeSiteRules([
      null,
      { pattern: 'example.com/*', enabled: false, overrides: { includeTemplate: true, rogue: 'nope' } },
      { id: 'dup', pattern: 'docs.example.com/*' },
      { id: 'dup', pattern: 'news.example.com/*', overrides: { tableFormatting: { stripLinks: false, rogue: true } } },
      { pattern: '' }
    ]);

    expect(normalized).toHaveLength(3);
    expect(normalized[0]).toEqual({
      id: 'site-rule-2',
      name: 'Site Rule 2',
      enabled: false,
      pattern: 'example.com/*',
      overrides: { includeTemplate: true }
    });
    expect(normalized[2].id).toBe('dup-4');
    expect(normalized[2].overrides.tableFormatting).toEqual({ stripLinks: false });
  });

  test('resolves topmost enabled match and deep-merges table formatting', () => {
    const result = siteRules.resolveSiteRuleOptions('https://docs.example.com/blog/post', {
      ...baseOptions,
      siteRules: [
        {
          id: 'first',
          name: 'Docs',
          enabled: true,
          pattern: 'docs.example.com/blog/*',
          overrides: {
            title: 'Docs/{pageTitle}',
            tableFormatting: {
              stripLinks: false
            }
          }
        },
        {
          id: 'second',
          name: 'Fallback',
          enabled: true,
          pattern: '*.example.com/*',
          overrides: {
            includeTemplate: true
          }
        }
      ]
    });

    expect(result.matchedRule).toEqual({
      id: 'first',
      name: 'Docs',
      enabled: true,
      pattern: 'docs.example.com/blog/*'
    });
    expect(result.options.title).toBe('Docs/{pageTitle}');
    expect(result.options.includeTemplate).toBe(false);
    expect(result.options.tableFormatting).toEqual({
      stripLinks: false,
      stripFormatting: false,
      prettyPrint: true,
      centerText: true
    });
    expect(result.overriddenKeys).toEqual(['title', 'tableFormatting.stripLinks']);
    expect(result.options.siteRules).toBeUndefined();
  });

  test('keeps empty string text overrides and false boolean overrides', () => {
    const result = siteRules.resolveSiteRuleOptions('https://news.example.com/page', {
      ...baseOptions,
      siteRules: [
        {
          id: 'news',
          name: 'News',
          enabled: true,
          pattern: 'news.example.com/*',
          overrides: {
            backmatter: '',
            mdClipsFolder: '',
            downloadImages: false,
            imageStyle: 'noImage'
          }
        }
      ]
    });

    expect(result.options.backmatter).toBe('');
    expect(result.options.mdClipsFolder).toBe('');
    expect(result.options.downloadImages).toBe(false);
    expect(result.options.imageStyle).toBe('noImage');
  });

  test('lets legacy imagePrefix overrides infer placement after site-rule resolution', () => {
    const result = siteRules.resolveSiteRuleOptions('https://assets.example.com/page', {
      ...baseOptions,
      siteRules: [
        {
          id: 'assets',
          name: 'Assets',
          enabled: true,
          pattern: 'assets.example.com/*',
          overrides: {
            imagePrefix: 'assets/'
          }
        }
      ]
    });

    expect(result.options.imagePrefix).toBe('assets/');
    expect(result.options.imagePlacement).toBe('');
    expect(result.overriddenKeys).toEqual(['imagePrefix']);
  });

  test('accepts explicit imagePlacement overrides', () => {
    const normalized = siteRules.normalizeSiteRuleOverrides({
      imagePlacement: 'sameFolder'
    });

    expect(normalized).toEqual({ imagePlacement: 'sameFolder' });
  });

  test('skips disabled rules and falls back to base options', () => {
    const result = siteRules.resolveSiteRuleOptions('https://example.com/page', {
      ...baseOptions,
      siteRules: [
        {
          id: 'disabled',
          name: 'Disabled',
          enabled: false,
          pattern: 'example.com/*',
          overrides: {
            includeTemplate: true
          }
        }
      ]
    });

    expect(result.matchedRule).toBeNull();
    expect(result.options.includeTemplate).toBe(false);
    expect(result.overriddenKeys).toEqual([]);
  });
});
