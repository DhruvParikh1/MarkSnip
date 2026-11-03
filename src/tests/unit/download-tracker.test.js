const { createDownloadTracker } = require('../../shared/download-tracker');

function createTracker() {
  const sentCleanup = [];
  const revoked = [];
  const tracker = createDownloadTracker({
    sendCleanupBlobUrl: (url) => { sentCleanup.push(url); return Promise.resolve(); },
    revokeBlobUrl: (url) => revoked.push(url)
  });
  return { tracker, sentCleanup, revoked };
}

function trackedCount(tracker) {
  const state = tracker.getState();
  return state.activeDownloads.size + state.markSnipDownloads.size + state.markSnipUrls.size +
    state.markSnipBlobUrls.size + state.ownedBlobUrls.size;
}

describe('download tracker', () => {
  test('moves a URL to its download id and suggests its filename on conflicts', () => {
    const { tracker } = createTracker();
    tracker.trackUrl('blob:chrome-extension://x/1', { filename: 'Folder/Clip.md', isMarkdown: true });

    const suggestions = [];
    expect(tracker.handleFilenameConflict({ id: 5, url: 'blob:chrome-extension://x/1' }, s => suggestions.push(s))).toBe(true);

    tracker.handleDownloadComplete({ downloadId: 5, url: 'blob:chrome-extension://x/1' });
    expect(tracker.handleFilenameConflict({ id: 5, url: 'blob:chrome-extension://x/1' }, s => suggestions.push(s))).toBe(true);
    expect(suggestions).toEqual([
      { filename: 'Folder/Clip.md', conflictAction: 'uniquify' },
      { filename: 'Folder/Clip.md', conflictAction: 'uniquify' }
    ]);
  });

  test('leaves downloads it does not own alone', () => {
    const { tracker } = createTracker();
    const suggest = jest.fn();
    expect(tracker.handleFilenameConflict({ id: 9, url: 'https://example.com/file.pdf' }, suggest)).toBe(false);
    expect(suggest).not.toHaveBeenCalled();
  });

  test('records metrics and releases an offscreen blob when the download completes', async () => {
    const { tracker, sentCleanup, revoked } = createTracker();
    const url = 'blob:chrome-extension://x/2';
    tracker.trackUrl(url, { filename: 'Clip.md', notificationDelta: { downloads: 1 }, tabId: 3 });
    tracker.handleDownloadComplete({ downloadId: 7, url });

    const recordNotificationMetrics = jest.fn(async () => {});
    await tracker.handleDownloadChange({ id: 7, state: { current: 'complete' } }, { recordNotificationMetrics });

    expect(recordNotificationMetrics).toHaveBeenCalledWith({ downloads: 1 }, 3);
    expect(sentCleanup).toEqual([url]);
    expect(revoked).toEqual([]);
    expect(trackedCount(tracker)).toBe(0);
  });

  test('revokes a blob URL created in this context instead of messaging the offscreen page', async () => {
    const { tracker, sentCleanup, revoked } = createTracker();
    const url = 'blob:moz-extension://x/3';
    tracker.trackOwnedBlobUrl(url);
    tracker.trackUrl(url, { filename: 'Clip.md' });
    tracker.handleDownloadComplete({ downloadId: 8, url });

    await tracker.handleDownloadChange({ id: 8, state: { current: 'interrupted' }, error: { current: 'FILE_FAILED' } });

    expect(revoked).toEqual([url]);
    expect(sentCleanup).toEqual([]);
    expect(trackedCount(tracker)).toBe(0);
  });

  test('a metrics failure still cleans up the download', async () => {
    const { tracker } = createTracker();
    tracker.trackUrl('blob:chrome-extension://x/4', { filename: 'Clip.md', notificationDelta: { downloads: 1 } });
    tracker.handleDownloadComplete({ downloadId: 10, url: 'blob:chrome-extension://x/4' });
    const onMetricsError = jest.fn();

    await tracker.handleDownloadChange({ id: 10, state: { current: 'complete' } }, {
      recordNotificationMetrics: async () => { throw new Error('storage full'); },
      onMetricsError
    });

    expect(onMetricsError).toHaveBeenCalled();
    expect(trackedCount(tracker)).toBe(0);
  });

  test('ignores progress updates that are not a final state', async () => {
    const { tracker } = createTracker();
    tracker.trackUrl('blob:chrome-extension://x/5', { filename: 'Clip.md' });
    tracker.handleDownloadComplete({ downloadId: 11, url: 'blob:chrome-extension://x/5' });

    await tracker.handleDownloadChange({ id: 11, state: { current: 'in_progress' } });
    await tracker.handleDownloadChange({ id: 11, filename: { current: 'Clip.md' } });
    expect(tracker.getState().markSnipDownloads.has(11)).toBe(true);
  });
});
