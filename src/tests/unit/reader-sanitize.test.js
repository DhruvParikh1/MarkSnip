const { sanitizeArticleHtml } = require('../../reader/sanitize.js');

describe('sanitizeArticleHtml', () => {
  test('strips dangerous tags, event handlers, styles, srcdoc, and javascript URLs', () => {
    const html = `
      <article onclick="evil()" style="color:red">
        <script>alert(1)</script>
        <iframe srcdoc="<p>x</p>"></iframe>
        <a href="javascript:alert(1)">bad</a>
        <img src="/image.png" onerror="evil()" style="width:1px">
      </article>
    `;

    const clean = sanitizeArticleHtml(html, 'https://example.com/posts/page.html', 'tab');
    expect(clean).not.toMatch(/script|iframe|onclick|onerror|style=|srcdoc|javascript:/i);
    expect(clean).toContain('src="https://example.com/image.png"');
  });

  test('keeps safe article tags and resolves relative links', () => {
    const clean = sanitizeArticleHtml(
      '<figure><a href="../next"><img src="./pic.jpg" alt="Pic"></a><figcaption>Caption</figcaption></figure>',
      'https://example.com/posts/page.html',
      'tab'
    );
    expect(clean).toContain('href="https://example.com/next"');
    expect(clean).toContain('src="https://example.com/posts/pic.jpg"');
    expect(clean).toContain('<figcaption>Caption</figcaption>');
  });

  test('allows data image sources but blocks data HTML', () => {
    const clean = sanitizeArticleHtml(
      '<img src="data:image/png;base64,abc"><a href="data:text/html;base64,abc">x</a>',
      'https://example.com/',
      'tab'
    );
    expect(clean).toContain('src="data:image/png;base64,abc"');
    expect(clean).not.toContain('data:text/html');
  });

  test('drops class and id only in overlay mode', () => {
    const html = '<p id="intro" class="lead">Hello</p>';
    expect(sanitizeArticleHtml(html, 'https://example.com/', 'tab')).toContain('class="lead"');
    expect(sanitizeArticleHtml(html, 'https://example.com/', 'overlay')).not.toMatch(/class=|id=/);
  });

  test('keeps reader-owned semantic attributes in overlay mode', () => {
    const html = `
      <div id="ms-reader-fn-1" class="lead ms-reader-card" data-ms-reader-block="callout" data-ms-reader-type="note">
        <a href="#ms-reader-fnref-1" rel="reversefootnote">back</a>
      </div>
    `;
    const clean = sanitizeArticleHtml(html, 'https://example.com/', 'overlay');
    expect(clean).toContain('id="ms-reader-fn-1"');
    expect(clean).toContain('class="ms-reader-card"');
    expect(clean).toContain('data-ms-reader-block="callout"');
    expect(clean).toContain('data-ms-reader-type="note"');
    expect(clean).toContain('rel="reversefootnote"');
    expect(clean).not.toContain('class="lead');
  });
});
