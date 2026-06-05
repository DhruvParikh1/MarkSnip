const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadPreviewRenderer() {
  const markedSource = fs.readFileSync(
    path.join(__dirname, '../../popup/lib/marked.min.js'),
    'utf8'
  );
  const popupSource = fs.readFileSync(
    path.join(__dirname, '../../popup/popup.js'),
    'utf8'
  );
  const start = popupSource.indexOf('const UNSAFE_LINK_RE');
  const end = popupSource.indexOf("dom.previewToggle?.addEventListener('click', togglePreview);");
  const previewSource = popupSource.slice(start, end);
  const sandbox = {
    currentClipState: { pageUrl: 'https://example.com/articles/post' },
    window: { location: { href: 'chrome-extension://test/popup/popup.html' } }
  };

  vm.createContext(sandbox);
  vm.runInContext(markedSource, sandbox, { filename: 'marked.min.js' });
  vm.runInContext(previewSource, sandbox, { filename: 'popup-preview.js' });
  return sandbox.renderMarkdownToHtml;
}

describe('popup markdown preview renderer', () => {
  const renderMarkdownToHtml = loadPreviewRenderer();

  test('escapes raw HTML and SVG script payloads', () => {
    const image = renderMarkdownToHtml('<img src=x onerror="alert(1)">');
    expect(image).not.toContain('<img');
    expect(image).toContain('&lt;img');

    const svg = renderMarkdownToHtml('<svg><script>alert(1)</script></svg>');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  test('drops javascript links and image sources', () => {
    expect(renderMarkdownToHtml('[click](javascript:alert(1))'))
      .toBe('<p>click</p>\n');
    expect(renderMarkdownToHtml('![alt](javascript:alert(1))', { renderImages: true }))
      .toContain('[image: alt]');
  });

  test('escapes code-fence language and inline HTML in link labels', () => {
    const code = renderMarkdownToHtml('```x" onmouseover="alert(1)\ncode\n```');
    expect(code).not.toContain('onmouseover');
    expect(code).toContain('class="language-x&quot;"');

    const link = renderMarkdownToHtml('[<img src=x onerror=alert(1)>](https://safe.example/)');
    expect(link).not.toContain('<img src=x');
    expect(link).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
