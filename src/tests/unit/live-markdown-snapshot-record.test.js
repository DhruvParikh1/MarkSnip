const {
  buildCaseRecord,
  parseArgs
} = require('../../scripts/capture-live-markdown-snapshots');

describe('live markdown snapshot script arguments', () => {
  test('defaults to the documented case ids, HEAD ref, headed mode, and 60s captcha wait', () => {
    const args = parseArgs([]);

    expect(args.cases).toEqual(['runjs-equations', 'ruby-data-docs', 'virginia-beach-celebrating-children']);
    expect(args.ref).toBe('HEAD');
    expect(args.headless).toBe(false);
    expect(args.keepWorkDir).toBe(false);
    expect(args.captchaWaitMs).toBe(60000);
    expect(args.storageOptions).toEqual({});
  });

  test('parses case selection, ref, headless, and wait overrides', () => {
    const args = parseArgs([
      '--cases', 'alpha,beta',
      '--ref', 'v5.1.0',
      '--headless',
      '--wait-after-load', '2.5',
      '--captcha-wait', '30',
      '--allow-skips',
      '--no-stealth'
    ]);

    expect(args.cases).toEqual(['alpha', 'beta']);
    expect(args.ref).toBe('v5.1.0');
    expect(args.headless).toBe(true);
    expect(args.waitAfterLoadMs).toBe(2500);
    expect(args.captchaWaitMs).toBe(30000);
    expect(args.allowSkips).toBe(true);
    expect(args.stealth).toBe(false);
  });

  test('supports the all shortcut for case selection', () => {
    expect(parseArgs(['--cases', 'all']).cases).toEqual(['all']);
  });

  test('maps skip-hidden-content variants onto the storage option', () => {
    expect(parseArgs(['--skip-hidden-content', 'off']).storageOptions.skipHiddenContent).toBe(false);
    expect(parseArgs(['--skip-hidden-content', 'false']).storageOptions.skipHiddenContent).toBe(false);
    expect(parseArgs(['--skip-hidden-content', 'on']).storageOptions.skipHiddenContent).toBe(true);
    expect(parseArgs(['--include-hidden-content']).storageOptions.skipHiddenContent).toBe(false);
  });

  test('rejects invalid skip-hidden-content values', () => {
    expect(() => parseArgs(['--skip-hidden-content', 'maybe']))
      .toThrow(/--skip-hidden-content must be "on", "off", "true", or "false"/);
  });

  test('rejects negative wait overrides and unknown arguments', () => {
    expect(() => parseArgs(['--wait-after-load', '-1'])).toThrow(/--wait-after-load/);
    expect(() => parseArgs(['--captcha-wait', 'nope'])).toThrow(/--captcha-wait/);
    expect(() => parseArgs(['--unknown-flag'])).toThrow(/Unknown argument/);
  });
});

describe('live markdown snapshot records', () => {
  function buildRecord(markdown, expectedMarkdownImageCount) {
    return buildCaseRecord(
      'current',
      {
        id: 'image-count-case',
        name: 'Image count case',
        url: 'https://example.com/article',
        expectedMarkdownImageCount
      },
      {
        ok: true,
        clip: {
          title: 'Image count case',
          markdown
        }
      },
      {}
    );
  }

  function buildExtensionRecord(markdown, expectedMarkdownImageExtensions) {
    return buildCaseRecord(
      'current',
      {
        id: 'image-extension-case',
        name: 'Image extension case',
        url: 'https://example.com/article',
        expectedMarkdownImageExtensions
      },
      {
        ok: true,
        clip: {
          title: 'Image extension case',
          markdown
        }
      },
      {}
    );
  }

  test('preserves and passes an expected zero markdown image count', () => {
    const record = buildRecord('Article without markdown images.', 0);

    expect(record.status).toBe('passed');
    expect(record.clip.markdownImageCount).toBe(0);
    expect(record.clip.expectedMarkdownImageCount).toBe(0);
    expect(record.clip.imageCountMismatch).toBe(false);
  });

  test('fails a passed capture when markdown image count does not match', () => {
    const record = buildRecord('![only one](https://example.com/image.png)', 2);

    expect(record.status).toBe('failed');
    expect(record.ok).toBe(false);
    expect(record.clip.markdownImageCount).toBe(1);
    expect(record.clip.expectedMarkdownImageCount).toBe(2);
    expect(record.clip.imageCountMismatch).toBe(true);
  });

  test('records a matching expected markdown image count', () => {
    const record = buildRecord(
      [
        '![first](https://example.com/first.png)',
        '![second](https://example.com/second.png)'
      ].join('\n'),
      2
    );

    expect(record.status).toBe('passed');
    expect(record.clip.markdownImageCount).toBe(2);
    expect(record.clip.expectedMarkdownImageCount).toBe(2);
    expect(record.clip.imageCountMismatch).toBe(false);
  });

  test('fails a passed capture when expected markdown image extensions are missing', () => {
    const record = buildExtensionRecord(
      [
        '![first](first.jpeg)',
        '![second](second.png)'
      ].join('\n'),
      ['jpeg', 'png', 'webp']
    );

    expect(record.status).toBe('failed');
    expect(record.ok).toBe(false);
    expect(record.clip.markdownImageExtensions).toEqual(['jpeg', 'png']);
    expect(record.clip.expectedMarkdownImageExtensions).toEqual(['jpeg', 'png', 'webp']);
    expect(record.clip.missingMarkdownImageExtensions).toEqual(['webp']);
  });
});
