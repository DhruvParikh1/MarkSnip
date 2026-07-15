const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

describe('Popup startup assets', () => {
  test('popup HTML no longer eagerly loads all CodeMirror theme styles or the notification host', () => {
    const popupHtml = fs.readFileSync(
      path.join(__dirname, '../../popup/popup.html'),
      'utf8'
    );
    const dom = new JSDOM(popupHtml, {
      url: 'https://example.com/popup/popup.html'
    });
    const document = dom.window.document;

    const stylesheetHrefs = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((link) => link.getAttribute('href'));

    expect(stylesheetHrefs).toContain('lib/codemirror.css');
    expect(stylesheetHrefs).not.toContain('lib/xq-dark.css');
    expect(stylesheetHrefs).not.toContain('lib/xq-light.css');
    expect(stylesheetHrefs).not.toContain('lib/dracula.css');
    expect(stylesheetHrefs).not.toContain('lib/material.css');
    expect(stylesheetHrefs).not.toContain('lib/material-darker.css');
    expect(stylesheetHrefs).not.toContain('lib/monokai.css');
    expect(stylesheetHrefs).not.toContain('lib/nord.css');
    expect(stylesheetHrefs).not.toContain('lib/solarized.css');
    expect(stylesheetHrefs).not.toContain('lib/twilight.css');

    // marked must not be eagerly loaded — it is lazy-loaded on first Preview toggle
    expect(stylesheetHrefs).not.toContain('lib/github-markdown.css');

    const scriptHrefs = Array.from(document.querySelectorAll('script[src]'))
      .map((script) => script.getAttribute('src'));

    expect(scriptHrefs).toContain('popup.js');
    expect(scriptHrefs).not.toContain('../notifications/notification-host.js');
    expect(scriptHrefs).not.toContain('lib/marked.min.js');

    const splitButton = document.getElementById('splitBtnWrap');
    expect(splitButton).not.toBeNull();
    expect(document.getElementById('download')).not.toBeNull();
    expect(document.getElementById('splitArrow')).not.toBeNull();
    expect(document.getElementById('splitDropdown')).not.toBeNull();
    expect(document.getElementById('elementPickerRow')).not.toBeNull();
    expect(document.getElementById('pickElement')).not.toBeNull();
    expect(document.getElementById('ddSendToChatgpt')).not.toBeNull();
    expect(document.getElementById('ddSendToClaude')).not.toBeNull();
    expect(document.getElementById('ddSendToPerplexity')).not.toBeNull();
    expect(document.querySelector('#ddSendToChatgpt .assistant-icon--chatgpt')).not.toBeNull();
    expect(document.querySelector('#ddSendToClaude .assistant-icon--claude')).not.toBeNull();
    expect(document.querySelector('#ddSendToPerplexity .assistant-icon--perplexity')).not.toBeNull();
    expect(document.getElementById('ddSendToCustomTargets')).not.toBeNull();
    expect(document.getElementById('ddMarkdown')).not.toBeNull();
    expect(document.getElementById('ddText')).not.toBeNull();
    expect(document.getElementById('ddHtml')).not.toBeNull();
    expect(document.getElementById('ddPrint')).not.toBeNull();
    expect(document.getElementById('ddPdf')).not.toBeNull();
    expect(document.getElementById('splitDropdown').hasAttribute('hidden')).toBe(true);
  });

  test('popup local defaultOptions forwards clip-relevant option keys to the service worker', () => {
    // The popup maintains its own defaultOptions literal that gates which keys it
    // reads from storage and forwards with a clip request. Keys missing here are
    // sent as normalized empties and clobber the stored values in
    // getClipRequestOptions(), silently disabling features (e.g. math-attribute
    // conversion) in the popup path only. Guard the math keys against regression.
    const popupSource = fs.readFileSync(path.join(__dirname, '../../popup/popup.js'), 'utf8');
    const literalStart = popupSource.indexOf('const defaultOptions = {');
    expect(literalStart).toBeGreaterThan(-1);
    const literal = popupSource.slice(literalStart, popupSource.indexOf('\n}', literalStart));

    expect(literal).toContain('mathAttributesEnabled');
    expect(literal).toContain('mathAttributeRules');
  });
});
