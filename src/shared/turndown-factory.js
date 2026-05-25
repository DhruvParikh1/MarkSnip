(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.markSnipTurndownFactory = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const defaultOptions = {
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    linkReferenceStyle: 'full',
    turndownEscape: false
  };

  function createTurndownService(options = {}, deps = {}) {
    const TurndownService = deps.TurndownService || root.TurndownService;
    const turndownPluginGfm = deps.turndownPluginGfm || root.turndownPluginGfm;
    const mathMLApi = deps.mathMLApi || root.MarkSnipMathML;

    if (!TurndownService) {
      throw new Error('TurndownService is required to create a Turndown instance.');
    }

    const mergedOptions = { ...defaultOptions, ...options };
    const service = new TurndownService(mergedOptions);

    if (mergedOptions.turndownEscape === false) {
      service.escape = function (text) { return text; };
    }

    if (turndownPluginGfm) {
      service.use([
        turndownPluginGfm.highlightedCodeBlock,
        turndownPluginGfm.strikethrough,
        turndownPluginGfm.taskListItems
      ]);
    }

    service.addRule('mark', {
      filter: ['mark'],
      replacement: function (content, node) {
        if (node?.getAttribute?.('data-marksnip-highlight-id')) {
          if (mergedOptions.highlightInlineSyntax === 'obsidian') {
            return `==${content}==`;
          }
          const color = node.getAttribute('data-marksnip-highlight-color') || '';
          const style = node.getAttribute('style') || '';
          const styleAttr = style ? ` style="${style.replace(/"/g, '&quot;')}"` : '';
          const colorAttr = color ? ` data-color="${color.replace(/"/g, '&quot;')}"` : '';
          return `<mark${colorAttr}${styleAttr}>${content}</mark>`;
        }
        return '`' + content + '`';
      }
    });

    service.addRule('headingLinks', {
      filter: function (node) {
        if (node.nodeName === 'A') {
          const hasHeading = Array.from(node.children).some((child) =>
            /^H[1-6]$/.test(child.nodeName)
          );
          return hasHeading;
        }
        return false;
      },
      replacement: function (content) {
        return content;
      }
    });

    service.addRule('mathml', {
      filter: function (node) {
        return String(node.nodeName).toLowerCase() === 'math' && typeof mathMLApi?.mathmlToTex === 'function';
      },
      replacement: function (content, node) {
        const tex = mathMLApi.mathmlToTex(node);
        if (!tex) return content;

        if (mathMLApi.isDisplayMath?.(node)) {
          return `$$\n${tex}\n$$`;
        }
        return `$${tex}$`;
      }
    });

    service.addRule('customTables', {
      filter: 'table',
      replacement: function (content, node) {
        const rows = Array.from(node.querySelectorAll('tr'));
        if (rows.length === 0) return '';

        let markdown = '\n\n';

        rows.forEach((row, rowIndex) => {
          const cells = Array.from(row.querySelectorAll('th, td'));
          const cellContents = cells.map((cell) => {
            const tempService = new TurndownService(mergedOptions);
            tempService.escape = function (text) { return text; };

            tempService.addRule('mark', {
              filter: ['mark'],
              replacement: function (content, node) {
                if (node?.getAttribute?.('data-marksnip-highlight-id')) {
                  if (mergedOptions.highlightInlineSyntax === 'obsidian') {
                    return `==${content}==`;
                  }
                  const color = node.getAttribute('data-marksnip-highlight-color') || '';
                  const style = node.getAttribute('style') || '';
                  const styleAttr = style ? ` style="${style.replace(/"/g, '&quot;')}"` : '';
                  const colorAttr = color ? ` data-color="${color.replace(/"/g, '&quot;')}"` : '';
                  return `<mark${colorAttr}${styleAttr}>${content}</mark>`;
                }
                return '`' + content + '`';
              }
            });

            if (mergedOptions.imageStyle === 'noImage') {
              tempService.addRule('images', {
                filter: (node) => node.nodeName === 'IMG',
                replacement: () => ''
              });
            }

            return tempService.turndown(cell.innerHTML).trim().replace(/\n/g, '<br>');
          });

          markdown += '| ' + cellContents.join(' | ') + ' |\n';

          if (rowIndex === 0) {
            const separator = cellContents.map(() => '---').join(' | ');
            markdown += '| ' + separator + ' |\n';
          }
        });

        markdown += '\n';
        return markdown;
      }
    });

    return { service };
  }

  return {
    createTurndownService,
    defaultOptions
  };
});
