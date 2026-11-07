const {
  assertFirefoxSmokeResult,
  parseArgs
} = require('../../scripts/run-firefox-live-smoke');

describe('firefox live smoke script arguments', () => {
  test('uses headed mode and a 60s default timeout', () => {
    expect(parseArgs([])).toEqual({
      headless: false,
      keepProfile: false,
      firefoxBinary: process.env.FIREFOX_BINARY || '',
      timeoutMs: 60000
    });
  });

  test('parses the documented flags', () => {
    const args = parseArgs([
      '--headless',
      '--keep-profile',
      '--firefox-binary', '/usr/bin/firefox-trunk',
      '--timeout-ms', '45000'
    ]);

    expect(args.headless).toBe(true);
    expect(args.keepProfile).toBe(true);
    expect(args.firefoxBinary).toBe('/usr/bin/firefox-trunk');
    expect(args.timeoutMs).toBe(45000);
  });

  test('rejects a non-positive --timeout-ms', () => {
    expect(() => parseArgs(['--timeout-ms', '0'])).toThrow(/--timeout-ms/);
    expect(() => parseArgs(['--timeout-ms', '-5'])).toThrow(/--timeout-ms/);
    expect(() => parseArgs(['--timeout-ms', 'abc'])).toThrow(/--timeout-ms/);
  });

  test('rejects unknown arguments', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown argument: --nope/);
  });
});

describe('firefox live smoke result assertions', () => {
  const passingMarkdown = [
    'Before $P_{i,j,t_a}$ after.',
    '',
    '$$',
    'E=mc^{2}',
    '$$'
  ].join('\n');

  function buildResult(markdown, tabs = []) {
    return { markdown, tabs };
  }

  test('accepts MathML conversion output with no fallback tabs', () => {
    expect(() => assertFirefoxSmokeResult(buildResult(passingMarkdown, [
      { id: 1, active: true, pinned: false, url: 'http://127.0.0.1:4173/mathml.html' },
      { id: 2, active: false, pinned: true, url: 'moz-extension://uuid/popup/popup.html' }
    ]))).not.toThrow();
  });

  test('requires inline MathML to be converted to TeX', () => {
    expect(() => assertFirefoxSmokeResult(buildResult('No TeX here.')))
      .toThrow(/inline MathML/);
  });

  test('requires block MathML to be converted to display TeX', () => {
    expect(() => assertFirefoxSmokeResult(buildResult('$P_{i,j,t_a}$ but no block')))
      .toThrow(/display TeX/);
  });

  test('rejects a Firefox fallback offscreen tab', () => {
    expect(() => assertFirefoxSmokeResult(buildResult(passingMarkdown, [
      { id: 1, active: false, pinned: true, url: 'moz-extension://uuid/offscreen/offscreen.html' }
    ]))).toThrow(/offscreen tab was opened/);
  });

  test('rejects a leftover about:blank tab', () => {
    expect(() => assertFirefoxSmokeResult(buildResult(passingMarkdown, [
      { id: 3, active: false, pinned: false, url: 'about:blank' }
    ]))).toThrow(/about:blank/);
  });

  test('handles a missing result gracefully', () => {
    expect(() => assertFirefoxSmokeResult(null)).toThrow(/inline MathML/);
  });
});
