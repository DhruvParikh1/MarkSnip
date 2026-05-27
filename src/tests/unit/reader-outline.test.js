const { buildOutline } = require('../../reader/outline.js');

describe('buildOutline', () => {
  test('returns no outline for a single heading', () => {
    document.body.innerHTML = '<article><h2>Only section</h2><p>Body</p></article>';
    const result = buildOutline(document, document.querySelector('article'));
    expect(result.items).toEqual([]);
    expect(result.element.hidden).toBe(true);
  });

  test('builds stable IDs and levels for h2-h6 headings', () => {
    document.body.innerHTML = `
      <article>
        <h2>Intro</h2>
        <h3>Details</h3>
        <h2>Intro</h2>
      </article>
    `;
    const result = buildOutline(document, document.querySelector('article'));
    expect(result.items).toEqual([
      { id: 'intro', level: 2, text: 'Intro' },
      { id: 'details', level: 3, text: 'Details' },
      { id: 'intro-2', level: 2, text: 'Intro' }
    ]);
    expect(Array.from(result.element.querySelectorAll('a')).map(a => a.getAttribute('href'))).toEqual([
      '#intro',
      '#details',
      '#intro-2'
    ]);
    result.teardown();
  });
});
