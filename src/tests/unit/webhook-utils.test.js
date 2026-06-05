const fs = require('fs');
const path = require('path');
const vm = require('vm');

const {
  buildWebhookFetchRequest,
  buildWebhookSendMessage,
  buildWebhookArticleFromMessage,
  summarizeWebhookResponseText,
  resolveWebhookSendErrorMessage,
  validateWebhookUrl
} = require('../../shared/webhook-utils');

describe('Webhook utilities', () => {
  test('builds a valid JSON webhook request from a JSON template and multiline markdown content', () => {
    const request = buildWebhookFetchRequest({
      target: {
        url: 'https://example.com/hooks/notes',
        method: 'POST',
        headers: [],
        bodyTemplate: JSON.stringify({
          vault: 'Obsidian Vault',
          path: 'Obsidian Vault/Clippings/{title}.md',
          content: '{content}'
        }, null, 2)
      },
      article: {
        title: 'Sample Title',
        content: '# heading\n- item\n```js\nconsole.log("x")\nconst payload = { ok: true };\n```',
        pageURL: 'https://example.com/post',
        excerpt: '',
        byline: '',
        keywords: [],
        publishedTime: '2026-05-05T00:00:00.000Z'
      }
    });

    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://example.com/hooks/notes');
    expect(request.headers['Content-Type']).toBe('application/json');

    expect(JSON.parse(request.body)).toEqual({
      vault: 'Obsidian Vault',
      path: 'Obsidian Vault/Clippings/Sample Title.md',
      content: '# heading\n- item\n```js\nconsole.log("x")\nconst payload = { ok: true };\n```'
    });
  });

  test('preserves an explicit content-type header while rendering header templates', () => {
    const request = buildWebhookFetchRequest({
      target: {
        url: 'https://example.com/hooks/notes/{title:kebab}',
        method: 'PATCH',
        headers: [
          { key: 'Content-Type', value: 'application/vnd.api+json' },
          { key: 'X-Clip-Title', value: '{title}' }
        ],
        bodyTemplate: JSON.stringify({
          content: '{content}'
        })
      },
      article: {
        title: 'Quoted Title',
        content: 'plain body',
        pageURL: 'https://example.com/post',
        excerpt: '',
        byline: '',
        keywords: [],
        publishedTime: '2026-05-05T00:00:00.000Z'
      }
    });

    expect(request.method).toBe('PATCH');
    expect(request.url).toBe('https://example.com/hooks/notes/quoted-title');
    expect(request.headers).toEqual({
      'Content-Type': 'application/vnd.api+json',
      'X-Clip-Title': 'Quoted Title'
    });
    expect(JSON.parse(request.body)).toEqual({
      content: 'plain body'
    });
  });

  test('preserves webhook metadata across the popup-to-service-worker message handoff', () => {
    const message = buildWebhookSendMessage({
      targetId: 'notes-target',
      markdown: '# heading\nBody',
      clipState: {
        title: 'Webhook Clip',
        pageUrl: 'https://example.com/post',
        excerpt: 'Compact summary',
        byline: 'By Example Author',
        keywords: ['clip', 'webhook'],
        publishedTime: '2026-05-05T10:09:52.000Z'
      }
    });

    expect(message).toEqual({
      type: 'webhook-send',
      targetId: 'notes-target',
      markdown: '# heading\nBody',
      title: 'Webhook Clip',
      sourceUrl: 'https://example.com/post',
      article: {
        title: 'Webhook Clip',
        content: '# heading\nBody',
        pageURL: 'https://example.com/post',
        excerpt: 'Compact summary',
        byline: 'By Example Author',
        keywords: ['clip', 'webhook'],
        publishedTime: '2026-05-05T10:09:52.000Z'
      }
    });

    expect(buildWebhookArticleFromMessage(message)).toEqual({
      title: 'Webhook Clip',
      content: '# heading\nBody',
      pageURL: 'https://example.com/post',
      excerpt: 'Compact summary',
      byline: 'By Example Author',
      keywords: ['clip', 'webhook'],
      publishedTime: '2026-05-05T10:09:52.000Z'
    });
  });

  test('maps legacy article date metadata to publishedTime during webhook message handoff', () => {
    const legacyPublishedAt = '2026-05-05T10:09:52.000Z';
    const message = buildWebhookSendMessage({
      targetId: 'notes-target',
      markdown: '# heading\nBody',
      clipState: {
        title: 'Webhook Clip',
        pageUrl: 'https://example.com/post',
        date: legacyPublishedAt
      }
    });

    expect(message.article.publishedTime).toBe(legacyPublishedAt);
    expect(buildWebhookArticleFromMessage({
      type: 'webhook-send',
      targetId: 'notes-target',
      markdown: '# heading\nBody',
      title: 'Webhook Clip',
      sourceUrl: 'https://example.com/post',
      article: {
        title: 'Webhook Clip',
        content: '# heading\nBody',
        pageURL: 'https://example.com/post',
        date: legacyPublishedAt
      }
    }).publishedTime).toBe(legacyPublishedAt);
  });

  test('registers browser globals without default options already loaded', () => {
    const webhookUtilsSource = fs.readFileSync(
      path.join(__dirname, '../../shared/webhook-utils.js'),
      'utf8'
    );

    const sandbox = {
      globalThis: {},
      console
    };
    sandbox.globalThis = sandbox;

    expect(() => {
      vm.runInNewContext(webhookUtilsSource, sandbox, {
        filename: 'webhook-utils.js'
      });
    }).not.toThrow();

    expect(typeof sandbox.markSnipWebhookUtils?.buildWebhookSendMessage).toBe('function');
  });

  test('summarizes structured server error payloads into a compact user-facing message', () => {
    const summary = summarizeWebhookResponseText(JSON.stringify({
      code: 305,
      status: false,
      message: 'Invalid Params',
      data: '[{"vault":"vault is a required field"},{"path":"path is a required field"}]',
      details: 'vault is a required field,path is a required field'
    }));

    expect(summary).toBe('Invalid Params: vault is a required field, path is a required field');
  });

  test('preserves runtime exception details for popup error feedback', () => {
    expect(resolveWebhookSendErrorMessage(new Error('Could not establish connection. Receiving end does not exist.')))
      .toBe('Could not establish connection. Receiving end does not exist.');
    expect(resolveWebhookSendErrorMessage('  Request failed upstream  '))
      .toBe('Request failed upstream');
    expect(resolveWebhookSendErrorMessage({}))
      .toBe('Failed to send to webhook target');
  });

  test('renders URL path templates with kebab-case placeholders', () => {
    const request = buildWebhookFetchRequest({
      target: {
        url: 'https://example.com/api/{title:kebab}',
        method: 'POST',
        headers: [],
        bodyTemplate: JSON.stringify({ content: '{content}' })
      },
      article: {
        title: 'My Test Article',
        content: 'body text',
        pageURL: 'https://example.com/post',
        excerpt: '',
        byline: '',
        keywords: [],
        publishedTime: '2026-05-05T00:00:00.000Z'
      }
    });

    expect(request.url).toBe('https://example.com/api/my-test-article');
  });

  test('rejects non-public webhook URLs before fetch', () => {
    [
      'file:///tmp/clip.json',
      'http://example.com/hook',
      'ftp://example.com/hook',
      'https://localhost/hook',
      'https://localhost.localdomain/hook',
      'https://internal/hook',
      'https://service.internal/hook',
      'https://service.lan/hook',
      'https://127.0.0.1/hook',
      'https://10.0.0.5/hook',
      'https://172.16.0.5/hook',
      'https://172.31.255.255/hook',
      'https://192.168.1.10/hook',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/hook',
      'https://[fe80::1]/hook',
      'https://[fc00::1]/hook',
      'https://[fd12:3456::1]/hook',
      'https://user:pass@example.com/hook'
    ].forEach((url) => {
      expect(validateWebhookUrl(url).valid).toBe(false);
    });

    expect(validateWebhookUrl('https://example.com/hooks/notes').valid).toBe(true);
    expect(validateWebhookUrl('https://8.8.8.8/hooks/notes').valid).toBe(true);
  });

  test('rejects unsafe URLs after webhook template rendering', () => {
    expect(() => buildWebhookFetchRequest({
      target: {
        url: 'https://example.com.evil/{title}',
        method: 'POST',
        headers: [],
        bodyTemplate: JSON.stringify({ content: '{content}' })
      },
      article: {
        title: '../../hooks',
        content: 'body text',
        pageURL: 'https://example.com/post',
        excerpt: '',
        byline: '',
        keywords: [],
        publishedTime: '2026-05-05T00:00:00.000Z'
      }
    })).not.toThrow();

    expect(() => buildWebhookFetchRequest({
      target: {
        url: 'https://{title}/hooks',
        method: 'POST',
        headers: [],
        bodyTemplate: JSON.stringify({ content: '{content}' })
      },
      article: {
        title: 'localhost',
        content: 'body text',
        pageURL: 'https://example.com/post',
        excerpt: '',
        byline: '',
        keywords: [],
        publishedTime: '2026-05-05T00:00:00.000Z'
      }
    })).toThrow(/public hostname|public HTTPS host|not allowed/i);
  });

  test('renders publishedTime templates independently from the current clip date', () => {
    const request = buildWebhookFetchRequest({
      target: {
        url: 'https://example.com/hooks/{publishedTime:YYYY-MM-DD}',
        method: 'POST',
        headers: [
          { key: 'X-Published', value: '{publishedTime:YYYY-MM-DD}' }
        ],
        bodyTemplate: JSON.stringify({ published: '{publishedTime:YYYY-MM-DD}' })
      },
      article: {
        title: 'My Test Article',
        content: 'body text',
        pageURL: 'https://example.com/post',
        excerpt: '',
        byline: '',
        keywords: [],
        publishedTime: '2026-05-05T10:09:52.000Z'
      }
    });

    expect(request.url).toBe('https://example.com/hooks/2026-05-05');
    expect(request.headers['X-Published']).toBe('2026-05-05');
    expect(JSON.parse(request.body)).toEqual({ published: '2026-05-05' });
  });
});
