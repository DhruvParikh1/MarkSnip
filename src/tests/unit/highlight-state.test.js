const highlightState = require('../../shared/highlight-state');
const { createTurndownService } = require('../helpers/browser-env');

describe('highlight state utilities', () => {
  test('normalizes URLs by dropping fragments and tracking parameters', () => {
    const url = 'https://example.com/post?utm_source=x&b=2&a=1#section';
    expect(highlightState.normalizeUrl(url)).toBe('https://example.com/post?a=1&b=2');
  });

  test('merges overlapping text highlights on the same XPath', () => {
    const existing = [
      {
        id: 'one',
        type: 'text',
        xpath: '/html[1]/body[1]/p[1]',
        startOffset: 2,
        endOffset: 8,
        text: 'old'
      }
    ];
    const additions = [
      {
        id: 'two',
        type: 'text',
        xpath: '/html[1]/body[1]/p[1]',
        startOffset: 6,
        endOffset: 12,
        text: 'new'
      }
    ];

    const merged = highlightState.mergeHighlights(existing, additions);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('two');
  });

  test('keeps adjacent text highlights on the same XPath', () => {
    const existing = [
      {
        id: 'one',
        type: 'text',
        xpath: '/html[1]/body[1]/p[1]',
        startOffset: 2,
        endOffset: 8,
        text: 'first'
      }
    ];
    const additions = [
      {
        id: 'two',
        type: 'text',
        xpath: '/html[1]/body[1]/p[1]',
        startOffset: 8,
        endOffset: 12,
        text: 'next'
      }
    ];

    const merged = highlightState.mergeHighlights(existing, additions);
    expect(merged.map((highlight) => highlight.id)).toEqual(['one', 'two']);
  });

  test('applies MarkSnip-owned inline highlights to a DOM string', () => {
    const html = '<!doctype html><html><body><main><p>Hello world again.</p></main></body></html>';
    const marked = highlightState.applyInlineHighlightsToDomString(html, [
      {
        id: 'highlight-1',
        type: 'text',
        xpath: '/html[1]/body[1]/main[1]/p[1]',
        startOffset: 6,
        endOffset: 11,
        text: 'world',
        color: 'blue'
      }
    ], {
      highlightInlineSyntax: 'html-mark'
    });

    expect(marked).toContain('data-marksnip-highlight-id="highlight-1"');
    expect(marked).toContain('data-marksnip-highlight-color="blue"');
    expect(marked).toContain('<mark');
    expect(marked).toContain('world</mark>');
  });

  test('formats highlight fields for templates', () => {
    const article = highlightState.attachHighlightFields({}, [
      {
        id: 'highlight-1',
        type: 'text',
        xpath: '/html[1]/body[1]/p[1]',
        startOffset: 0,
        endOffset: 4,
        text: 'Note',
        color: 'yellow',
        note: 'Remember this'
      }
    ], {
      highlightInlineSyntax: 'obsidian'
    });

    expect(article.highlightCount).toBe('1');
    expect(article.highlights).toContain('==Note==');
    expect(article.highlights).toContain('Remember this');
    expect(JSON.parse(article.highlightsJson)[0].text).toBe('Note');
  });

  test('keeps normal page mark tags as code but exports MarkSnip marks as highlights', () => {
    const { service } = createTurndownService({ highlightInlineSyntax: 'html-mark' });
    const markdown = service.turndown(`
      <p>Endpoint <mark>/v1</mark></p>
      <p>Saved <mark data-marksnip-highlight-id="h1" data-marksnip-highlight-color="green" style="background-color: #a8d977;">phrase</mark></p>
    `);

    expect(markdown).toContain('`/v1`');
    expect(markdown).toContain('<mark data-color="green"');
    expect(markdown).toContain('phrase</mark>');
  });

  test('supports Obsidian inline syntax for MarkSnip-owned marks', () => {
    const { service } = createTurndownService({ highlightInlineSyntax: 'obsidian' });
    const markdown = service.turndown('<p><mark data-marksnip-highlight-id="h1">phrase</mark></p>');

    expect(markdown).toContain('==phrase==');
  });
});
