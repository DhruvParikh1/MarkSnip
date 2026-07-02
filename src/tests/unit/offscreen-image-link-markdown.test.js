const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const offscreenSource = fs.readFileSync(
  path.join(__dirname, '../../offscreen/offscreen.js'),
  'utf8'
);

function createOffscreenSandbox() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com',
    runScripts: 'outside-only'
  });

  const loadIntoWindow = (relativePath) => {
    const source = fs.readFileSync(path.join(__dirname, '../..', relativePath), 'utf8');
    dom.window.eval(source);
  };

  loadIntoWindow('background/turndown.js');
  loadIntoWindow('background/turndown-plugin-gfm.js');

  const sandbox = {
    console,
    TurndownService: dom.window.TurndownService,
    turndownPluginGfm: dom.window.turndownPluginGfm,
    DOMParser: dom.window.DOMParser,
    Node: dom.window.Node,
    Document: dom.window.Document,
    TextEncoder,
    TextDecoder,
    Blob,
    URL,
    fetch: jest.fn(),
    document: {
      addEventListener: jest.fn(),
      createElement: () => ({ innerHTML: '', querySelectorAll: () => [] })
    },
    browser: {
      runtime: {
        onMessage: { addListener: jest.fn() },
        sendMessage: jest.fn()
      }
    },
    chrome: {},
    defaultOptions: {},
    markSnipUrlUtils: require('../../shared/url-utils'),
    markSnipTemplateUtils: require('../../shared/template-utils'),
    markSnipObsidian: require('../../shared/obsidian-utils'),
    markSnipCodeBlockUtils: require('../../shared/code-block-utils'),
    markSnipMathML: require('../../shared/mathml-to-tex')
  };

  vm.createContext(sandbox);
  vm.runInContext(offscreenSource, sandbox, { filename: 'offscreen.js' });
  return sandbox;
}

describe('offscreen linked image markdown', () => {
  test('keeps a linked image on one Markdown link line', () => {
    const sandbox = createOffscreenSandbox();
    const result = sandbox.turndown(
      '<a href="https://example.com/media"><p><img alt="Image" src="https://cdn.example.com/photo.jpeg"></p></a>',
      {
        downloadImages: true,
        imageStyle: 'markdown',
        imageRefStyle: 'inlined',
        turndownEscape: false,
        tableFormatting: {},
        frontmatter: '',
        backmatter: '',
        title: 'Article',
        imagePlacement: 'sidecar',
        imagePrefix: '{pageTitle}/',
        disallowedChars: '#[]{}|<>:?*"\\/'
      },
      { uriBase: 'https://example.com/', baseURI: 'https://example.com/' }
    );

    expect(result.markdown).toBe('[![Image](Article/photo.jpeg)](https://example.com/media)');
  });

  test('preserves spacing for linked images with surrounding text', () => {
    const sandbox = createOffscreenSandbox();
    const result = sandbox.turndown(
      '<a href="https://example.com/media"><p>caption</p><img alt="Image" src="https://cdn.example.com/photo.jpeg"></a>',
      {
        downloadImages: true,
        imageStyle: 'markdown',
        imageRefStyle: 'inlined',
        turndownEscape: false,
        tableFormatting: {},
        frontmatter: '',
        backmatter: '',
        title: 'Article',
        imagePlacement: 'sidecar',
        imagePrefix: '{pageTitle}/',
        disallowedChars: '#[]{}|<>:?*"\\/'
      },
      { uriBase: 'https://example.com/', baseURI: 'https://example.com/' }
    );

    expect(result.markdown).toBe('[\n\ncaption\n\n![Image](Article/photo.jpeg)](https://example.com/media)');
  });
});
