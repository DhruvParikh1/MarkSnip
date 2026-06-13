/**
 * Download Filename Conflict Tests
 * Tests for the fix that prevents conflicts with other extensions
 * and handles empty filenames properly
 */

const { createDownloadTracker } = require('../../shared/download-tracker');

describe('Download Filename Conflict Handling', () => {
  let tracker;
  let trackerState;
  let cleanupCalls;

  beforeEach(() => {
    cleanupCalls = [];
    tracker = createDownloadTracker({
      activeDownloads: new Map(),
      sendCleanupBlobUrl: (url) => {
        cleanupCalls.push(url);
        return Promise.resolve();
      }
    });
    trackerState = tracker.getState();
  });

  describe('handleFilenameConflict', () => {
    test('should suggest filename for download tracked by ID', () => {
      trackerState.markSnipDownloads.set(123, { filename: 'folder/article.md' });
      
      const suggest = jest.fn();
      const downloadItem = { id: 123, url: 'blob:chrome-extension://test/abc' };
      
      const result = tracker.handleFilenameConflict(downloadItem, suggest);
      
      expect(result).toBe(true);
      expect(suggest).toHaveBeenCalledWith({
        filename: 'folder/article.md',
        conflictAction: 'uniquify'
      });
    });

    test('should suggest filename for download tracked by URL', () => {
      const blobUrl = 'blob:chrome-extension://test/abc123';
      trackerState.markSnipUrls.set(blobUrl, { filename: 'downloads/note.md', isMarkdown: true });
      trackerState.markSnipBlobUrls.add(blobUrl);
      
      const suggest = jest.fn();
      const downloadItem = { id: 456, url: blobUrl };
      
      const result = tracker.handleFilenameConflict(downloadItem, suggest);
      
      expect(result).toBe(true);
      expect(suggest).toHaveBeenCalledWith({
        filename: 'downloads/note.md',
        conflictAction: 'uniquify'
      });
    });

    test('should suggest filename for blob URL in tracking set', () => {
      const blobUrl = 'blob:chrome-extension://test/xyz789';
      trackerState.markSnipBlobUrls.add(blobUrl);
      trackerState.markSnipUrls.set(blobUrl, { filename: 'clip.md' });
      
      const suggest = jest.fn();
      const downloadItem = { id: 789, url: blobUrl };
      
      const result = tracker.handleFilenameConflict(downloadItem, suggest);
      
      expect(result).toBe(true);
      expect(suggest).toHaveBeenCalledWith({
        filename: 'clip.md',
        conflictAction: 'uniquify'
      });
    });

    test('should suggest filename for blob URL after URL tracking moves to download ID', () => {
      const blobUrl = 'blob:chrome-extension://test/moved';
      tracker.trackUrl(blobUrl, { filename: 'moved-clip.md' });
      tracker.moveTrackedUrlToDownloadId(222, blobUrl);

      const suggest = jest.fn();
      const downloadItem = { id: 999, url: blobUrl };

      const result = tracker.handleFilenameConflict(downloadItem, suggest);

      expect(result).toBe(true);
      expect(suggest).toHaveBeenCalledWith({
        filename: 'moved-clip.md',
        conflictAction: 'uniquify'
      });
    });

    test('should NOT call suggest for untracked downloads', () => {
      const suggest = jest.fn();
      const downloadItem = { id: 999, url: 'https://example.com/file.pdf' };
      
      const result = tracker.handleFilenameConflict(downloadItem, suggest);
      
      expect(result).toBe(false);
      expect(suggest).not.toHaveBeenCalled();
    });

    test('should NOT call suggest for blob URLs not in our tracking set', () => {
      const otherBlobUrl = 'blob:chrome-extension://other-extension/abc';
      
      const suggest = jest.fn();
      const downloadItem = { id: 111, url: otherBlobUrl };
      
      const result = tracker.handleFilenameConflict(downloadItem, suggest);
      
      expect(result).toBe(false);
      expect(suggest).not.toHaveBeenCalled();
    });

    test('should NOT call suggest when download is identified but filename is missing', () => {
      trackerState.markSnipDownloads.set(123, { filename: null });
      
      const suggest = jest.fn();
      const downloadItem = { id: 123, url: 'blob:chrome-extension://test/abc' };
      
      const result = tracker.handleFilenameConflict(downloadItem, suggest);
      
      expect(result).toBe(false);
      expect(suggest).not.toHaveBeenCalled();
    });

    test('should prioritize ID tracking over URL tracking', () => {
      const blobUrl = 'blob:chrome-extension://test/abc';
      trackerState.markSnipDownloads.set(123, { filename: 'from-id.md' });
      trackerState.markSnipUrls.set(blobUrl, { filename: 'from-url.md' });
      
      const suggest = jest.fn();
      const downloadItem = { id: 123, url: blobUrl };
      
      tracker.handleFilenameConflict(downloadItem, suggest);
      
      expect(suggest).toHaveBeenCalledWith({
        filename: 'from-id.md',
        conflictAction: 'uniquify'
      });
    });
  });

  describe('Blob URL Tracking', () => {
    test('should track blob URL in both Map and Set', () => {
      const blobUrl = 'blob:chrome-extension://test/blob123';
      const filename = 'article.md';
      
      tracker.trackUrl(blobUrl, { filename, isMarkdown: true });
      
      expect(trackerState.markSnipUrls.has(blobUrl)).toBe(true);
      expect(trackerState.markSnipBlobUrls.has(blobUrl)).toBe(true);
      expect(trackerState.markSnipUrls.get(blobUrl).filename).toBe(filename);
    });

    test('should clean up tracking after download completes', async () => {
      const blobUrl = 'blob:chrome-extension://test/blob456';
      const downloadId = 100;
      
      tracker.trackUrl(blobUrl, { filename: 'test.md' });
      trackerState.markSnipDownloads.set(downloadId, { filename: 'test.md', url: blobUrl });
      trackerState.activeDownloads.set(downloadId, blobUrl);
      
      await tracker.handleDownloadChange({
        id: downloadId,
        state: { current: 'complete' }
      });
      
      expect(trackerState.markSnipDownloads.has(downloadId)).toBe(false);
      expect(trackerState.markSnipUrls.has(blobUrl)).toBe(false);
      expect(trackerState.markSnipBlobUrls.has(blobUrl)).toBe(false);
      expect(cleanupCalls).toContain(blobUrl);
    });

    test('should handle multiple concurrent downloads', () => {
      const urls = [
        'blob:chrome-extension://test/1',
        'blob:chrome-extension://test/2',
        'blob:chrome-extension://test/3'
      ];

      urls.forEach((url, index) => {
        tracker.trackUrl(url, { filename: `article-${index}.md` });
      });
      
      expect(trackerState.markSnipBlobUrls.size).toBe(3);
      expect(trackerState.markSnipUrls.size).toBe(3);
      
      urls.forEach((url, index) => {
        const suggest = jest.fn();
        tracker.handleFilenameConflict({ id: index, url }, suggest);
        expect(suggest).toHaveBeenCalledWith({
          filename: `article-${index}.md`,
          conflictAction: 'uniquify'
        });
      });
    });

    test('records metrics and cleanup for complete and interrupted states', async () => {
      const metricsSpy = jest.fn().mockResolvedValue(undefined);
      tracker.trackUrl('blob:chrome-extension://test/metrics', {
        filename: 'metrics.md',
        notificationDelta: { downloads: 1, exports: 1 },
        tabId: 77
      });
      tracker.handleDownloadComplete({
        downloadId: 500,
        url: 'blob:chrome-extension://test/metrics'
      });

      await tracker.handleDownloadChange({
        id: 500,
        state: { current: 'complete' }
      }, {
        recordNotificationMetrics: metricsSpy
      });

      expect(metricsSpy).toHaveBeenCalledWith({ downloads: 1, exports: 1 }, 77);
      expect(cleanupCalls).toContain('blob:chrome-extension://test/metrics');

      tracker.trackUrl('blob:chrome-extension://test/interrupted', {
        filename: 'interrupted.md'
      });
      tracker.handleDownloadComplete({
        downloadId: 501,
        url: 'blob:chrome-extension://test/interrupted'
      });

      await tracker.handleDownloadChange({
        id: 501,
        state: { current: 'interrupted' },
        error: { current: 'NETWORK_FAILED' }
      });

      expect(trackerState.markSnipDownloads.has(501)).toBe(false);
      expect(cleanupCalls).toContain('blob:chrome-extension://test/interrupted');
    });
  });
});

describe('Empty Filename Handling', () => {
  const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const normalizeFileNameReplacement = (replacement = '') => {
    if (!replacement) return '';
    return String(replacement)
      .replace(/[\/\?<>\\:\*\|":]/g, '')
      .replace(new RegExp('\u00A0', 'g'), ' ');
  };

  const generateValidFileName = (title, disallowedChars = null, disallowedCharReplacement = '') => {
    if (!title) return title;
    else title = title + '';
    
    var illegalRe = /[\/\?<>\\:\*\|":]/g;
    const replacement = normalizeFileNameReplacement(disallowedCharReplacement);
    var name = title.replace(illegalRe, () => replacement).replace(new RegExp('\u00A0', 'g'), ' ');
    
    if (disallowedChars) {
      for (let c of disallowedChars) {
        name = name.replace(new RegExp(escapeRegExp(c), 'g'), () => replacement);
      }
    }
    
    return name;
  };

  const validateAndFixFilename = (title) => {
    if (!title || title.trim() === '') {
      return 'Untitled-' + Date.now();
    }
    return title;
  };

  describe('Title Validation', () => {
    test('should use fallback for empty title', () => {
      const result = validateAndFixFilename('');
      expect(result).toMatch(/^Untitled-\d+$/);
    });

    test('should use fallback for whitespace-only title', () => {
      const result = validateAndFixFilename('   ');
      expect(result).toMatch(/^Untitled-\d+$/);
    });

    test('should use fallback for null title', () => {
      const result = validateAndFixFilename(null);
      expect(result).toMatch(/^Untitled-\d+$/);
    });

    test('should use fallback for undefined title', () => {
      const result = validateAndFixFilename(undefined);
      expect(result).toMatch(/^Untitled-\d+$/);
    });

    test('should preserve valid title', () => {
      const result = validateAndFixFilename('My Article Title');
      expect(result).toBe('My Article Title');
    });

    test('should preserve title with special chars that are allowed', () => {
      const result = validateAndFixFilename('Article (2024) - Draft #2');
      expect(result).toBe('Article (2024) - Draft #2');
    });
  });

  describe('Filename Generation', () => {
    test('should remove illegal characters', () => {
      expect(generateValidFileName('Test/File:Name')).toBe('TestFileName');
      expect(generateValidFileName('Test<File>Name')).toBe('TestFileName');
      expect(generateValidFileName('Test*File?Name')).toBe('TestFileName');
      expect(generateValidFileName('Test|File"Name')).toBe('TestFileName');
    });

    test('should remove custom disallowed characters', () => {
      expect(generateValidFileName('Test [File]', '[]')).toBe('Test File');
      expect(generateValidFileName('Test#File^Name', '#^')).toBe('TestFileName');
    });

    test('should replace illegal and custom disallowed characters when configured', () => {
      expect(generateValidFileName('Test/File:Name', '', '_')).toBe('Test_File_Name');
      expect(generateValidFileName('Test#File^Name', '#^', '-')).toBe('Test-File-Name');
    });

    test('should handle empty input', () => {
      expect(generateValidFileName('')).toBe('');
      expect(generateValidFileName(null)).toBeNull();
    });

    test('should replace non-breaking spaces', () => {
      expect(generateValidFileName('Test\u00A0File')).toBe('Test File');
    });
  });
});

describe('Blob Download Fallback Options', () => {
  test('should preserve saveAs=true when offscreen delegates blob download to the service worker', async () => {
    const markSnipDownloads = new Map();
    const markSnipUrls = new Map();
    const markSnipBlobUrls = new Set();
    const downloadsAPI = {
      download: jest.fn().mockResolvedValue(321)
    };

    const handleDownloadWithBlobUrl = async (blobUrl, filename, options = null) => {
      if (!options) options = { saveAs: false };

      markSnipUrls.set(blobUrl, {
        filename,
        isMarkdown: true
      });
      markSnipBlobUrls.add(blobUrl);

      const id = await downloadsAPI.download({
        url: blobUrl,
        filename,
        saveAs: !!options.saveAs
      });

      if (markSnipUrls.has(blobUrl)) {
        const urlInfo = markSnipUrls.get(blobUrl);
        markSnipDownloads.set(id, {
          ...urlInfo,
          url: blobUrl
        });
        markSnipUrls.delete(blobUrl);
      }

      return id;
    };

    const blobUrl = 'blob:chrome-extension://test/blob-save-as';
    const filename = 'batch/archive.zip';
    const downloadId = await handleDownloadWithBlobUrl(blobUrl, filename, { saveAs: true });

    expect(downloadId).toBe(321);
    expect(downloadsAPI.download).toHaveBeenCalledWith({
      url: blobUrl,
      filename,
      saveAs: true
    });
    expect(markSnipDownloads.get(321)).toMatchObject({
      filename,
      isMarkdown: true,
      url: blobUrl
    });
  });

  test('should default saveAs to false when no option is provided', async () => {
    const downloadsAPI = {
      download: jest.fn().mockResolvedValue(654)
    };

    const handleDownloadWithBlobUrl = async (blobUrl, filename, options = null) => {
      if (!options) options = { saveAs: false };

      return downloadsAPI.download({
        url: blobUrl,
        filename,
        saveAs: !!options.saveAs
      });
    };

    await handleDownloadWithBlobUrl('blob:chrome-extension://test/blob-default', 'article.md');

    expect(downloadsAPI.download).toHaveBeenCalledWith({
      url: 'blob:chrome-extension://test/blob-default',
      filename: 'article.md',
      saveAs: false
    });
  });
});

describe('Download tracker helpers', () => {
  test('trackDownload stores download info by id', () => {
    const tracker = createDownloadTracker();
    tracker.trackDownload(42, { filename: 'clip.md' });

    const state = tracker.getState();
    expect(state.markSnipDownloads.get(42)).toEqual({ filename: 'clip.md' });
  });

  test('moveTrackedUrlToDownloadId migrates url entries', () => {
    const tracker = createDownloadTracker();
    const state = tracker.getState();
    state.markSnipUrls.set('https://example.com/file', { filename: 'file.md' });

    const moved = tracker.moveTrackedUrlToDownloadId(777, 'https://example.com/file');

    expect(moved).toMatchObject({ filename: 'file.md', url: 'https://example.com/file' });
    expect(state.markSnipUrls.has('https://example.com/file')).toBe(false);
    expect(state.markSnipDownloads.has(777)).toBe(true);
  });

  test('handleDownloadComplete wires the download into active tracking', () => {
    const tracker = createDownloadTracker();
    const state = tracker.getState();
    state.markSnipUrls.set('https://example.com/complete', { filename: 'done.md' });

    tracker.handleDownloadComplete({ downloadId: 9, url: 'https://example.com/complete' });

    expect(state.activeDownloads.get(9)).toBe('https://example.com/complete');
    expect(state.markSnipDownloads.has(9)).toBe(true);
  });

  test('handleDownloadChange reports metric errors when notification metrics fail', async () => {
    const tracker = createDownloadTracker();
    const state = tracker.getState();
    state.markSnipUrls.set('https://example.com/metrics', {
      filename: 'metrics.md',
      notificationDelta: { downloads: 2 },
      tabId: 5
    });

    tracker.handleDownloadComplete({ downloadId: 88, url: 'https://example.com/metrics' });

    const metricsError = new Error('boom');
    const deps = {
      logComplete: jest.fn(),
      recordNotificationMetrics: jest.fn().mockRejectedValue(metricsError),
      onMetricsError: jest.fn()
    };

    await tracker.handleDownloadChange({
      id: 88,
      state: { current: 'complete' }
    }, deps);

    expect(deps.logComplete).toHaveBeenCalledWith(88);
    expect(deps.onMetricsError).toHaveBeenCalledWith(metricsError);
    expect(state.markSnipDownloads.has(88)).toBe(false);
  });
});

describe('Article PageTitle Fallback', () => {
  const createArticleWithFallbacks = (dom, readabilityResult, pageUrl = null) => {
    const article = readabilityResult || { title: null };
    
    const baseUri = dom.baseURI || pageUrl || 'https://example.com';
    const resolvedUrl = pageUrl || baseUri;
    article.uriBase = baseUri;
    article.baseURI = baseUri;
    article.pageURL = resolvedUrl;
    article.tabURL = resolvedUrl;
    
    article.pageTitle = dom.title || article.title || 'Untitled';
    
    if (!article.title) {
      article.title = article.pageTitle;
    }
    
    return article;
  };

  test('should use dom.title for pageTitle when available', () => {
    const dom = { baseURI: 'https://example.com', title: 'DOM Title' };
    const readability = { title: 'Readability Title' };
    
    const article = createArticleWithFallbacks(dom, readability);
    
    expect(article.pageTitle).toBe('DOM Title');
    expect(article.title).toBe('Readability Title');
  });

  test('should use article.title as fallback when dom.title is empty', () => {
    const dom = { baseURI: 'https://example.com', title: '' };
    const readability = { title: 'Readability Title' };
    
    const article = createArticleWithFallbacks(dom, readability);
    
    expect(article.pageTitle).toBe('Readability Title');
    expect(article.title).toBe('Readability Title');
  });

  test('should use Untitled fallback when both titles are empty', () => {
    const dom = { baseURI: 'https://example.com', title: '' };
    const readability = { title: null };
    
    const article = createArticleWithFallbacks(dom, readability);
    
    expect(article.pageTitle).toBe('Untitled');
    expect(article.title).toBe('Untitled');
  });

  test('should use Untitled fallback when dom.title is null', () => {
    const dom = { baseURI: 'https://example.com', title: null };
    const readability = { title: undefined };
    
    const article = createArticleWithFallbacks(dom, readability);
    
    expect(article.pageTitle).toBe('Untitled');
    expect(article.title).toBe('Untitled');
  });

  test('should set article.title from pageTitle when missing', () => {
    const dom = { baseURI: 'https://example.com', title: 'Page Title' };
    const readability = { title: null };
    
    const article = createArticleWithFallbacks(dom, readability);
    
    expect(article.pageTitle).toBe('Page Title');
    expect(article.title).toBe('Page Title');
  });

  test('should handle pages with no title element', () => {
    const dom = { baseURI: 'https://example.com', title: undefined };
    const readability = {};
    
    const article = createArticleWithFallbacks(dom, readability);
    
    expect(article.pageTitle).toBe('Untitled');
    expect(article.title).toBe('Untitled');
  });

  test('should prefer explicit page URL over baseURI for SPA routes', () => {
    const dom = { baseURI: 'https://gemini.google.com/', title: 'Google Gemini' };
    const readability = { title: 'Google Gemini' };
    const pageUrl = 'https://gemini.google.com/app/19a994212aad751c';

    const article = createArticleWithFallbacks(dom, readability, pageUrl);

    expect(article.baseURI).toBe(dom.baseURI);
    expect(article.pageURL).toBe(pageUrl);
    expect(article.uriBase).toBe(dom.baseURI);
  });
});

describe('Download Full Filename Construction', () => {
  const buildFullFilename = (mdClipsFolder, title) => {
    if (!title || title.trim() === '') {
      title = 'Untitled-' + Date.now();
    }
    
    let folder = mdClipsFolder || '';
    if (folder && !folder.endsWith('/')) {
      folder += '/';
    }
    
    return folder + title + '.md';
  };

  test('should build filename with folder and title', () => {
    expect(buildFullFilename('downloads', 'My Article')).toBe('downloads/My Article.md');
  });

  test('should add trailing slash to folder if missing', () => {
    expect(buildFullFilename('downloads', 'Article')).toBe('downloads/Article.md');
    expect(buildFullFilename('downloads/', 'Article')).toBe('downloads/Article.md');
  });

  test('should handle empty folder', () => {
    expect(buildFullFilename('', 'Article')).toBe('Article.md');
    expect(buildFullFilename(null, 'Article')).toBe('Article.md');
  });

  test('should use fallback for empty title', () => {
    const result = buildFullFilename('downloads', '');
    expect(result).toMatch(/^downloads\/Untitled-\d+\.md$/);
  });

  test('should handle nested folder paths', () => {
    expect(buildFullFilename('downloads/articles/2024', 'My Post')).toBe('downloads/articles/2024/My Post.md');
  });

  test('should use fallback when title is only whitespace', () => {
    const result = buildFullFilename('clips', '   ');
    expect(result).toMatch(/^clips\/Untitled-\d+\.md$/);
  });
});

describe('Extension Conflict Prevention', () => {
  test('should not interfere with downloads from other extensions', () => {
    const tracker = createDownloadTracker();

    const otherExtensionDownloads = [
      { id: 1, url: 'https://example.com/file.pdf' },
      { id: 2, url: 'blob:chrome-extension://other-ext-123/blob' },
      { id: 3, url: 'data:text/plain;base64,SGVsbG8=' }
    ];

    otherExtensionDownloads.forEach(downloadItem => {
      const suggest = jest.fn();
      const result = tracker.handleFilenameConflict(downloadItem, suggest);
      expect(result).toBe(false);
      expect(suggest).not.toHaveBeenCalled();
    });
  });

  test('should only handle MarkSnip downloads', () => {
    const tracker = createDownloadTracker();
    const trackerState = tracker.getState();

    const ourBlobUrl = 'blob:chrome-extension://test-ext/our-blob';
    trackerState.markSnipUrls.set(ourBlobUrl, { filename: 'article.md' });
    trackerState.markSnipBlobUrls.add(ourBlobUrl);

    const suggest = jest.fn();
    tracker.handleFilenameConflict({ id: 99, url: ourBlobUrl }, suggest);
    expect(suggest).toHaveBeenCalled();

    suggest.mockClear();
    tracker.handleFilenameConflict({ id: 100, url: 'blob:chrome-extension://other/blob' }, suggest);
    expect(suggest).not.toHaveBeenCalled();
  });
});
