(function (root) {
  function createDownloadTracker(options = {}) {
    const activeDownloads = options.activeDownloads || new Map();
    const markSnipDownloads = options.markSnipDownloads || new Map();
    const markSnipUrls = options.markSnipUrls || new Map();
    const markSnipBlobUrls = options.markSnipBlobUrls || new Set();
    const sendCleanupBlobUrl = typeof options.sendCleanupBlobUrl === 'function'
      ? options.sendCleanupBlobUrl
      : () => Promise.resolve();

    function getState() {
      return {
        activeDownloads,
        markSnipDownloads,
        markSnipUrls,
        markSnipBlobUrls
      };
    }

    function trackUrl(url, info = {}) {
      if (!url) return;
      markSnipUrls.set(url, { ...info });
      if (url.startsWith('blob:')) {
        markSnipBlobUrls.add(url);
      }
    }

    function setActiveDownload(downloadId, url) {
      activeDownloads.set(downloadId, url);
    }

    function moveTrackedUrlToDownloadId(downloadId, url) {
      if (!url || !markSnipUrls.has(url)) {
        return null;
      }

      const urlInfo = markSnipUrls.get(url);
      markSnipDownloads.set(downloadId, {
        ...urlInfo,
        url
      });
      markSnipUrls.delete(url);
      return markSnipDownloads.get(downloadId);
    }

    function trackDownload(downloadId, info = {}) {
      markSnipDownloads.set(downloadId, { ...info });
    }

    function handleDownloadComplete(message = {}) {
      const { downloadId, url } = message;
      if (!downloadId || !url) {
        return;
      }

      setActiveDownload(downloadId, url);
      moveTrackedUrlToDownloadId(downloadId, url);
    }

    function cleanupTrackedDownload(downloadId, url, downloadInfo) {
      if (url && url.startsWith('blob:chrome-extension://')) {
        sendCleanupBlobUrl(url);
      }

      activeDownloads.delete(downloadId);
      markSnipDownloads.delete(downloadId);

      if (url) {
        markSnipBlobUrls.delete(url);
      }

      if (downloadInfo?.url && markSnipUrls.has(downloadInfo.url)) {
        markSnipUrls.delete(downloadInfo.url);
      } else if (url && markSnipUrls.has(url)) {
        markSnipUrls.delete(url);
      }
    }

    async function handleDownloadChange(delta, deps = {}) {
      if (!delta?.state) {
        return;
      }

      const downloadInfo = markSnipDownloads.get(delta.id);
      const url = activeDownloads.get(delta.id) || downloadInfo?.url || null;

      if (delta.state.current === 'complete') {
        deps.logComplete?.(delta.id);
        if (downloadInfo?.notificationDelta && typeof deps.recordNotificationMetrics === 'function') {
          try {
            await deps.recordNotificationMetrics(downloadInfo.notificationDelta, downloadInfo.tabId);
          } catch (error) {
            deps.onMetricsError?.(error);
          }
        }
        cleanupTrackedDownload(delta.id, url, downloadInfo);
        return;
      }

      if (delta.state.current === 'interrupted') {
        deps.logInterrupted?.(delta.id, delta.error);
        cleanupTrackedDownload(delta.id, url, downloadInfo);
      }
    }

    function handleFilenameConflict(downloadItem, suggest) {
      const trackedById = markSnipDownloads.has(downloadItem.id);
      const trackedByUrl = downloadItem.url && markSnipUrls.has(downloadItem.url);
      const isOurBlobUrl = downloadItem.url && markSnipBlobUrls.has(downloadItem.url);

      if (trackedById || trackedByUrl || isOurBlobUrl) {
        let filename = null;

        if (trackedById) {
          filename = markSnipDownloads.get(downloadItem.id)?.filename;
        } else if (trackedByUrl) {
          filename = markSnipUrls.get(downloadItem.url)?.filename;
        } else if (isOurBlobUrl) {
          filename = Array.from(markSnipDownloads.values())
            .find((downloadInfo) => downloadInfo?.url === downloadItem.url)?.filename;
        }

        if (filename) {
          suggest({
            filename,
            conflictAction: 'uniquify'
          });
          return true;
        }
      }

      return false;
    }

    return {
      getState,
      trackUrl,
      setActiveDownload,
      moveTrackedUrlToDownloadId,
      trackDownload,
      handleDownloadComplete,
      cleanupTrackedDownload,
      handleDownloadChange,
      handleFilenameConflict
    };
  }

  const api = { createDownloadTracker };
  root.markSnipDownloadTracker = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
