const fs = require('fs');
const path = require('path');
const {
  createChromeManifest,
  createFirefoxManifest
} = require('../../scripts/generate-browser-manifests');

const srcRoot = path.join(__dirname, '../..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(srcRoot, relativePath), 'utf8'));
}

describe('Firefox build configuration', () => {
  test('generates a Firefox-compatible background configuration', () => {
    const sourceManifest = readJson('manifest.json');
    const firefoxManifest = createFirefoxManifest(sourceManifest);

    expect(firefoxManifest.background).toEqual({
      scripts: expect.arrayContaining([
        'browser-polyfill.min.js',
        'shared/default-options.js',
        'shared/notifications.js',
        'shared/template-utils.js',
        'shared/url-utils.js',
        'service-worker.js'
      ])
    });

    const scripts = firefoxManifest.background.scripts;
    expect(scripts.indexOf('shared/template-utils.js')).toBeLessThan(scripts.indexOf('service-worker.js'));
    expect(scripts.indexOf('shared/url-utils.js')).toBeLessThan(scripts.indexOf('service-worker.js'));
    expect(firefoxManifest.background.service_worker).toBeUndefined();
    expect(firefoxManifest.permissions).not.toContain('offscreen');
    expect(firefoxManifest.permissions).toEqual(expect.arrayContaining([
      'activeTab',
      'downloads',
      'storage',
      'scripting'
    ]));
    expect(firefoxManifest.browser_specific_settings?.gecko?.id).toBe('marksnip@dhruvparikh');
  });

  test('keeps Chrome-only manifest changes out of Firefox output', () => {
    const sourceManifest = readJson('manifest.json');
    const chromeManifest = createChromeManifest(sourceManifest);
    const firefoxManifest = createFirefoxManifest(sourceManifest);

    expect(chromeManifest.background).toEqual({ service_worker: 'service-worker.js' });
    expect(chromeManifest.browser_specific_settings).toBeUndefined();
    expect(chromeManifest.permissions).toContain('offscreen');
    expect(firefoxManifest.background.scripts).toContain('service-worker.js');
    expect(firefoxManifest.permissions).not.toContain('offscreen');
  });

  test('preserves explicit extension CSP in generated browser manifests', () => {
    const sourceManifest = readJson('manifest.json');
    const chromeManifest = createChromeManifest(sourceManifest);
    const firefoxManifest = createFirefoxManifest(sourceManifest);

    expect(chromeManifest.content_security_policy).toEqual(sourceManifest.content_security_policy);
    expect(firefoxManifest.content_security_policy).toEqual(sourceManifest.content_security_policy);
  });

  test('loads MathML conversion before the offscreen runtime', () => {
    const offscreenHtml = fs.readFileSync(path.join(srcRoot, 'offscreen/offscreen.html'), 'utf8');
    const mathMLScriptIndex = offscreenHtml.indexOf('../shared/mathml-to-tex.js');
    const offscreenRuntimeIndex = offscreenHtml.indexOf('offscreen.js');

    expect(mathMLScriptIndex).toBeGreaterThan(-1);
    expect(offscreenRuntimeIndex).toBeGreaterThan(-1);
    expect(mathMLScriptIndex).toBeLessThan(offscreenRuntimeIndex);
    expect(fs.existsSync(path.join(srcRoot, 'shared/mathml-to-tex.js'))).toBe(true);
  });
});
