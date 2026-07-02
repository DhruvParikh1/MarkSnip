const { buildCaseRecord } = require('../../scripts/capture-live-markdown-snapshots');

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
