/**
 * Real HTML to Markdown Conversion Tests
 * Tests actual conversion using Turndown.js library
 */

const { createTurndownService } = require('../helpers/browser-env');
const htmlSamples = require('../fixtures/html-samples');

describe('Real HTML to Markdown Conversion', () => {
  /**
   * Helper to normalize markdown for comparison
   */
  function normalizeMarkdown(markdown) {
    return markdown
      .trim()
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+$/gm, ''); // Remove trailing spaces
  }

  describe('Basic HTML Elements', () => {
    test('should convert headings to markdown', () => {
      const { service } = createTurndownService();
      const html = '<h1>Heading 1</h1><h2>Heading 2</h2><h3>Heading 3</h3>';
      const result = service.turndown(html);

      expect(result).toContain('# Heading 1');
      expect(result).toContain('## Heading 2');
      expect(result).toContain('### Heading 3');
    });

    test('should convert paragraphs to markdown', () => {
      const { service } = createTurndownService();
      const html = '<p>First paragraph.</p><p>Second paragraph.</p>';
      const result = service.turndown(html);

      expect(result).toContain('First paragraph.');
      expect(result).toContain('Second paragraph.');
    });

    test('should convert bold text with ** delimiter', () => {
      const { service } = createTurndownService({ strongDelimiter: '**' });
      const html = '<p>This is <strong>bold</strong> text</p>';
      const result = service.turndown(html);

      expect(result).toContain('**bold**');
    });

    test('should convert bold text with __ delimiter', () => {
      const { service } = createTurndownService({ strongDelimiter: '__' });
      const html = '<p>This is <strong>bold</strong> text</p>';
      const result = service.turndown(html);

      expect(result).toContain('__bold__');
    });

    test('should convert italic text with * delimiter', () => {
      const { service } = createTurndownService({ emDelimiter: '*', strongDelimiter: '**' });
      const html = '<p>This is <em>italic</em> text</p>';
      const result = service.turndown(html);

      expect(result).toContain('*italic*');
    });

    test('should convert italic text with _ delimiter', () => {
      const { service } = createTurndownService({ emDelimiter: '_', strongDelimiter: '**' });
      const html = '<p>This is <em>italic</em> text</p>';
      const result = service.turndown(html);

      expect(result).toContain('_italic_');
    });
  });

  describe('Links and Images', () => {
    test('should convert inline links', () => {
      const { service } = createTurndownService({ linkStyle: 'inlined' });
      const html = '<a href="https://example.com">Example</a>';
      const result = service.turndown(html);

      expect(result).toBe('[Example](https://example.com)');
    });

    test('should convert links with title attribute', () => {
      const { service } = createTurndownService();
      const html = '<a href="https://example.com" title="Example Site">Example</a>';
      const result = service.turndown(html);

      expect(result).toContain('[Example](https://example.com "Example Site")');
    });

    test('should convert images', () => {
      const { service } = createTurndownService();
      const html = '<img src="https://example.com/image.jpg" alt="Test Image">';
      const result = service.turndown(html);

      expect(result).toBe('![Test Image](https://example.com/image.jpg)');
    });

    test('should convert images with title', () => {
      const { service } = createTurndownService();
      const html = '<img src="https://example.com/image.jpg" alt="Test" title="Image Title">';
      const result = service.turndown(html);

      expect(result).toContain('![Test](https://example.com/image.jpg "Image Title")');
    });
  });

  describe('Lists', () => {
    test('should convert unordered lists with - marker', () => {
      const { service } = createTurndownService({ bulletListMarker: '-' });
      const html = '<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>';
      const result = service.turndown(html);

      expect(result).toMatch(/-\s+Item 1/);
      expect(result).toMatch(/-\s+Item 2/);
      expect(result).toMatch(/-\s+Item 3/);
    });

    test('should convert unordered lists with * marker', () => {
      const { service } = createTurndownService({ bulletListMarker: '*' });
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const result = service.turndown(html);

      expect(result).toMatch(/\*\s+Item 1/);
      expect(result).toMatch(/\*\s+Item 2/);
    });

    test('should convert ordered lists', () => {
      const { service } = createTurndownService();
      const html = '<ol><li>First</li><li>Second</li><li>Third</li></ol>';
      const result = service.turndown(html);

      expect(result).toMatch(/1\.\s+First/);
      expect(result).toMatch(/2\.\s+Second/);
      expect(result).toMatch(/3\.\s+Third/);
    });

    test('should convert nested lists', () => {
      const { service } = createTurndownService({ bulletListMarker: '-' });
      const html = `
        <ul>
          <li>Item 1</li>
          <li>Item 2
            <ul>
              <li>Nested 1</li>
              <li>Nested 2</li>
            </ul>
          </li>
          <li>Item 3</li>
        </ul>
      `;
      const result = service.turndown(html);

      expect(result).toMatch(/-\s+Item 1/);
      expect(result).toMatch(/-\s+Item 2/);
      expect(result).toMatch(/\s+-\s+Nested 1/);
      expect(result).toMatch(/\s+-\s+Nested 2/);
    });
  });

  describe('Code Blocks', () => {
    test('should convert inline code', () => {
      const { service } = createTurndownService();
      const html = '<p>Use the <code>console.log()</code> function.</p>';
      const result = service.turndown(html);

      expect(result).toContain('`console.log()`');
    });

    test('should convert fenced code blocks', () => {
      const { service } = createTurndownService({ codeBlockStyle: 'fenced', fence: '```' });
      const html = '<pre><code>function hello() {\n  console.log("Hello");\n}</code></pre>';
      const result = service.turndown(html);

      expect(result).toContain('```');
      expect(result).toContain('function hello()');
    });

    test('should convert code blocks with language', () => {
      const { service } = createTurndownService({ fence: '```' });
      const html = '<pre><code class="language-javascript">const x = 1;</code></pre>';
      const result = service.turndown(html);

      expect(result).toContain('```javascript');
      expect(result).toContain('const x = 1;');
    });

    test('should use ~~~ fence when configured', () => {
      const { service } = createTurndownService({ codeBlockStyle: 'fenced', fence: '~~~' });
      const html = '<pre><code>code here</code></pre>';
      const result = service.turndown(html);

      expect(result).toContain('~~~');
    });
  });

  describe('Blockquotes', () => {
    test('should convert simple blockquotes', () => {
      const { service } = createTurndownService();
      const html = '<blockquote><p>This is a quote.</p></blockquote>';
      const result = service.turndown(html);

      expect(result).toContain('> This is a quote.');
    });

    test('should convert multi-paragraph blockquotes', () => {
      const { service } = createTurndownService();
      const html = '<blockquote><p>First paragraph.</p><p>Second paragraph.</p></blockquote>';
      const result = service.turndown(html);

      expect(result).toContain('> First paragraph.');
      expect(result).toContain('>');
      expect(result).toContain('> Second paragraph.');
    });

    test('should convert nested blockquotes', () => {
      const { service } = createTurndownService();
      const html = '<blockquote><p>Outer quote</p><blockquote><p>Inner quote</p></blockquote></blockquote>';
      const result = service.turndown(html);

      expect(result).toContain('> Outer quote');
      expect(result).toContain('> >');
    });
  });

  describe('Tables (with GFM plugin)', () => {
    test('should convert simple tables', () => {
      const { service } = createTurndownService();
      const html = `
        <table>
          <thead>
            <tr><th>Name</th><th>Age</th></tr>
          </thead>
          <tbody>
            <tr><td>John</td><td>25</td></tr>
            <tr><td>Jane</td><td>30</td></tr>
          </tbody>
        </table>
      `;
      const result = service.turndown(html);

      expect(result).toContain('Name');
      expect(result).toContain('Age');
      expect(result).toContain('John');
      expect(result).toContain('25');
      expect(result).toContain('|');
    });
  });

  describe('Horizontal Rules', () => {
    test('should convert hr with --- style', () => {
      const { service } = createTurndownService({ hr: '---' });
      const html = '<p>Before</p><hr><p>After</p>';
      const result = service.turndown(html);

      expect(result).toContain('---');
    });

    test('should convert hr with *** style', () => {
      const { service } = createTurndownService({ hr: '***' });
      const html = '<p>Before</p><hr><p>After</p>';
      const result = service.turndown(html);

      expect(result).toContain('***');
    });
  });

  describe('MathML', () => {
    test('should convert native MathML to TeX instead of plain text', () => {
      const { service } = createTurndownService();
      const html = `
        <p>
          Equation
          <math>
            <mrow>
              <msub>
                <mi>P</mi>
                <mrow><mi>i</mi><mo>,</mo><mi>j</mi><mo>,</mo><mi>t</mi><mo>_</mo><mi>a</mi></mrow>
              </msub>
            </mrow>
          </math>
          should stay as math.
        </p>
      `;
      const result = service.turndown(html);

      expect(result).toContain('$P_{i,j,t_a}$');
      expect(result).toContain('should stay as math');
      expect(result).not.toContain('Pi,j,t_a');
    });

    test('should wrap display MathML in block math fences', () => {
      const { service } = createTurndownService();
      const html = `
        <math display="block">
          <mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow>
        </math>
      `;
      const result = normalizeMarkdown(service.turndown(html));

      expect(result).toBe('$$\nE=mc^{2}\n$$');
    });
  });

  describe('Complex Real-World HTML', () => {
    test('should convert article with mixed formatting', () => {
      const { service } = createTurndownService();
      const html = `
        <article>
          <h1>Article Title</h1>
          <p>This is a paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
          <p>Here's a <a href="https://example.com">link</a>.</p>
          <ul>
            <li>List item 1</li>
            <li>List item 2</li>
          </ul>
          <pre><code class="language-javascript">console.log('Hello');</code></pre>
        </article>
      `;
      const result = service.turndown(html);

      expect(result).toContain('# Article Title');
      expect(result).toContain('**bold**');
      expect(result).toContain('_italic_');
      expect(result).toContain('[link](https://example.com)');
      expect(result).toMatch(/-\s+List item 1/);
      expect(result).toContain('```javascript');
    });

    test('should handle HTML with special characters', () => {
      const { service } = createTurndownService();
      const html = '<p>Special chars: &lt; &gt; &amp; &quot;</p>';
      const result = service.turndown(html);

      expect(result).toContain('< > & "');
    });

    test('should handle empty elements gracefully', () => {
      const { service } = createTurndownService();
      const html = '<p></p><div></div><h1>Title</h1>';
      const result = service.turndown(html);

      expect(result).toContain('# Title');
      expect(result.trim()).not.toBe('');
    });

    test('should handle malformed HTML', () => {
      const { service } = createTurndownService();
      const html = '<p>Unclosed paragraph<div>Nested incorrectly</div>';

      // Should not throw
      expect(() => service.turndown(html)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    test('should handle very long text', () => {
      const { service } = createTurndownService();
      const longText = 'a'.repeat(10000);
      const html = `<p>${longText}</p>`;
      const result = service.turndown(html);

      expect(result.length).toBeGreaterThan(9000);
    });

    test('should handle deeply nested elements', () => {
      const { service } = createTurndownService();
      const html = '<div><div><div><div><p>Deeply nested</p></div></div></div></div>';
      const result = service.turndown(html);

      expect(result).toContain('Deeply nested');
    });

    test('should handle multiple line breaks', () => {
      const { service } = createTurndownService();
      const html = '<p>Line 1<br><br><br>Line 2</p>';
      const result = service.turndown(html);

      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
    });

    test('should preserve whitespace in pre tags', () => {
      const { service } = createTurndownService();
      const html = '<pre>  indented\n    more indented</pre>';
      const result = service.turndown(html);

      expect(result).toContain('  indented');
      expect(result).toContain('    more indented');
    });
  });
});
