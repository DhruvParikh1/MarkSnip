require('../../reader/sanitize.js');
const fs = require('fs');
const path = require('path');
const { renderShell } = require('../../reader/renderer.js');

describe('renderShell', () => {
  test('renders readerContent when semantic reader HTML is available', () => {
    document.body.innerHTML = '<div id="mount"></div>';
    const mount = document.getElementById('mount');

    renderShell(
      document,
      mount,
      {
        title: 'Reader',
        pageUrl: 'https://example.com/article',
        article: {
          title: 'Reader',
          content: '<p>Plain article content.</p>',
          readerContent: '<div class="ms-reader-card" data-ms-reader-block="callout"><p>Semantic reader content.</p></div>'
        }
      },
      {},
      'tab'
    );

    expect(mount.textContent).toContain('Semantic reader content.');
    expect(mount.textContent).not.toContain('Plain article content.');
    expect(mount.querySelector('[data-ms-reader-block="callout"]')).not.toBeNull();
  });

  test('reader stylesheet contains callout card rules', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../reader/reader.css'), 'utf8');
    expect(css).toContain('.ms-reader-content article .ms-reader-callout');
    expect(css).toContain('.ms-reader-callout-title');
    expect(css).toContain('.ms-reader-callout-note');
  });
});
