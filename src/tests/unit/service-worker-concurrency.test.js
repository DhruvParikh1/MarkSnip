/**
 * @jest-environment node
 *
 * Concurrency in the real service worker: offscreen document creation and
 * matching a conversion's completion message to the request that started it.
 */
const vm = require('vm');
const { loadServiceWorker } = require('../helpers/service-worker-harness');

function createChromeOffscreenApi() {
  const state = { created: 0, exists: false, createCalls: 0 };
  const api = {
    'runtime.getContexts': async () => (state.exists ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] : []),
    offscreen: {
      async createDocument() {
        state.createCalls += 1;
        // Real Chrome rejects a second document; resolve on the next tick like the API does.
        await new Promise(resolve => setTimeout(resolve, 5));
        if (state.exists) {
          throw new Error('Only a single offscreen document may be created.');
        }
        state.exists = true;
        state.created += 1;
      }
    }
  };
  return { state, api };
}

describe('offscreen document creation', () => {
  test('concurrent callers share one creation instead of failing', async () => {
    const { state, api } = createChromeOffscreenApi();
    const sw = loadServiceWorker({ apiOverrides: api });

    const results = await Promise.allSettled([
      sw.context.ensureOffscreenDocumentExists(),
      sw.context.ensureOffscreenDocumentExists(),
      sw.context.ensureAgentBridgeOffscreenReady(true)
    ]);

    expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
    expect(state.createCalls).toBe(1);
    expect(state.created).toBe(1);
  });

  test('a document created by another context in the meantime counts as success', async () => {
    const { state, api } = createChromeOffscreenApi();
    api['runtime.getContexts'] = async () => [];
    state.exists = true;
    const sw = loadServiceWorker({ apiOverrides: api });

    await expect(sw.context.ensureOffscreenDocumentExists()).resolves.toBeUndefined();
  });

  test('a later call after a finished creation does not create again', async () => {
    const { state, api } = createChromeOffscreenApi();
    const sw = loadServiceWorker({ apiOverrides: api });

    await sw.context.ensureOffscreenDocumentExists();
    await sw.context.ensureOffscreenDocumentExists();
    expect(state.createCalls).toBe(1);
  });

  test('Firefox opens a single offscreen tab for concurrent callers', async () => {
    const created = [];
    const sw = loadServiceWorker({
      apiOverrides: {
        'tabs.query': async () => [],
        'tabs.create': async (props) => {
          created.push(props);
          return { id: 700 + created.length, ...props };
        }
      }
    });

    await Promise.all([
      sw.context.ensureOffscreenDocumentExists(),
      sw.context.ensureOffscreenDocumentExists()
    ]);
    expect(created).toHaveLength(1);
  });
});

describe('conversion completion messages', () => {
  test('a completion for another request on the same tab is ignored', async () => {
    const listeners = new Set();
    const sent = [];
    const sw = loadServiceWorker({
      apiOverrides: {
        'runtime.onMessage': {
          addListener: (fn) => listeners.add(fn),
          removeListener: (fn) => listeners.delete(fn)
        },
        'runtime.sendMessage': async (message) => {
          sent.push(message);
        }
      }
    });
    vm.runInContext('ensureScripts = async () => {}; ensureOffscreenDocumentExists = async () => {};', sw.context);

    const pending = sw.context.downloadMarkdownFromContext({ menuItemId: 'download-markdown-all' }, { id: 9 }, null, sw.context.defaultOptions, true);
    await new Promise(resolve => setTimeout(resolve, 0));

    const request = sent.find(message => message.type === 'process-context-menu');
    expect(request.requestId).toBeTruthy();

    // An older conversion of the same tab finishing late must not resolve this one.
    listeners.forEach(fn => fn({ type: 'process-complete', tabId: 9, requestId: 'someone-else', markdown: 'stale' }));
    listeners.forEach(fn => fn({ type: 'process-complete', tabId: 9, requestId: request.requestId, markdown: 'fresh' }));

    await expect(pending).resolves.toEqual(expect.objectContaining({ markdown: 'fresh' }));
  });
});
