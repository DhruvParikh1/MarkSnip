const { applyHighlights } = require('../../reader/highlights.js');

describe('applyHighlights', () => {
  test('maps exactly one normalized text match inline', () => {
    document.body.innerHTML = '<article><p>Hello <strong>reader</strong> world.</p></article><ul id="side"></ul>';
    const article = document.querySelector('article');
    const sidebar = document.getElementById('side');

    const result = applyHighlights(document, article, [
      { id: 'h1', text: 'Hello reader world.', color: 'yellow' }
    ], sidebar);

    expect(result.mapped).toHaveLength(1);
    expect(article.querySelector('mark.ms-reader-mark[data-id="h1"]')).not.toBeNull();
    expect(sidebar.children).toHaveLength(0);
    expect(sidebar.hidden).toBe(true);
  });

  test('leaves zero and ambiguous matches in the sidebar', () => {
    document.body.innerHTML = '<article><p>Repeat phrase.</p><p>Repeat phrase.</p></article><ul id="side"></ul>';
    const article = document.querySelector('article');
    const sidebar = document.getElementById('side');

    const result = applyHighlights(document, article, [
      { id: 'missing', text: 'Not here', color: 'blue' },
      { id: 'ambiguous', text: 'Repeat phrase.', color: 'green', note: 'choose one' }
    ], sidebar);

    expect(result.mapped).toHaveLength(0);
    expect(result.unmapped).toHaveLength(2);
    expect(article.querySelector('mark')).toBeNull();
    expect(sidebar.querySelector('[data-id="missing"]').dataset.reason).toBe('missing');
    expect(sidebar.querySelector('[data-id="ambiguous"]').dataset.reason).toBe('ambiguous');
    expect(sidebar.textContent).toContain('choose one');
  });
});
