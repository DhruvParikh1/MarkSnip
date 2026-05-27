const { scopeReaderCustomCss } = require('../../reader/renderer.js');

describe('scopeReaderCustomCss', () => {
  test('prefixes grouped selectors without splitting :not arguments', () => {
    expect(scopeReaderCustomCss('article p, a:not(.skip, .keep){ color: red; }')).toBe(
      '.ms-reader-root article p, .ms-reader-root a:not(.skip, .keep){color: red;}'
    );
  });

  test('does not double-prefix scoped selectors', () => {
    expect(scopeReaderCustomCss('.ms-reader-root p{ margin: 0; }')).toBe(
      '.ms-reader-root p{margin: 0;}'
    );
  });

  test('leaves keyframes and font-face rules untouched', () => {
    const scoped = scopeReaderCustomCss('@keyframes fade{from{opacity:0}to{opacity:1}} @font-face{font-family:x;src:url(x)} p{color:blue}');
    expect(scoped).toContain('@keyframes fade{from{opacity:0}to{opacity:1}}');
    expect(scoped).toContain('@font-face{font-family:x;src:url(x)}');
    expect(scoped).toContain('.ms-reader-root p{color:blue}');
  });

  test('scopes nested media rule contents', () => {
    expect(scopeReaderCustomCss('@media (min-width: 700px){p{color:red}}')).toBe(
      '@media (min-width: 700px){.ms-reader-root p{color:red}}'
    );
  });
});
