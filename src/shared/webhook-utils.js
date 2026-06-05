(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.markSnipWebhookUtils = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  function getDefaultWebhookBodyTemplate() {
    if (typeof root.defaultOptions?.defaultWebhookBodyTemplate === 'string' && root.defaultOptions.defaultWebhookBodyTemplate.trim()) {
      return root.defaultOptions.defaultWebhookBodyTemplate;
    }

    if (typeof require === 'function') {
      try {
        const defaultsApi = require('./default-options');
        const template = defaultsApi?.defaultOptions?.defaultWebhookBodyTemplate;
        if (typeof template === 'string' && template.trim()) {
          return template;
        }
      } catch {}
    }

    throw new Error('Default webhook body template is unavailable');
  }

  function getTemplateUtils() {
    if (root.markSnipTemplateUtils) {
      return root.markSnipTemplateUtils;
    }

    if (typeof require === 'function') {
      try {
        return require('./template-utils');
      } catch {
        return {
          textReplace: (value) => String(value || '')
        };
      }
    }

    return {
      textReplace: (value) => String(value || '')
    };
  }

  function createContentSentinel(template, content) {
    let sentinel = '__MARKSNIP_WEBHOOK_CONTENT__';
    const templateText = String(template || '');
    const contentText = String(content || '');

    while (templateText.includes(sentinel) || contentText.includes(sentinel)) {
      sentinel += '_X';
    }

    return sentinel;
  }

  function normalizeWebhookKeywords(keywords) {
    if (!Array.isArray(keywords)) {
      return [];
    }

    return keywords.reduce((normalized, keyword) => {
      const value = String(keyword || '').trim();
      if (value) {
        normalized.push(value);
      }
      return normalized;
    }, []);
  }

  function normalizeWebhookHostname(hostname) {
    return String(hostname || '')
      .trim()
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .replace(/\.$/, '')
      .toLowerCase();
  }

  function parseIPv4Address(hostname) {
    const value = normalizeWebhookHostname(hostname);
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(value)) {
      return null;
    }

    const parts = value.split('.').map((part) => Number(part));
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return null;
    }

    return parts;
  }

  function isPrivateWebhookIPv4(parts) {
    if (!Array.isArray(parts) || parts.length !== 4) {
      return false;
    }

    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      a >= 224
    );
  }

  function parseIPv6Address(hostname) {
    const value = normalizeWebhookHostname(hostname);
    if (!value.includes(':') || value.includes('%')) {
      return null;
    }

    const ipv4Match = value.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/);
    let ipv4Parts = null;
    let ipv6Value = value;
    if (ipv4Match) {
      ipv4Parts = parseIPv4Address(ipv4Match[1]);
      if (!ipv4Parts) {
        return null;
      }
      const hi = ((ipv4Parts[0] << 8) | ipv4Parts[1]).toString(16);
      const lo = ((ipv4Parts[2] << 8) | ipv4Parts[3]).toString(16);
      ipv6Value = value.replace(ipv4Match[1], `${hi}:${lo}`);
    }

    const pieces = ipv6Value.split('::');
    if (pieces.length > 2) {
      return null;
    }

    const left = pieces[0] ? pieces[0].split(':') : [];
    const right = pieces.length === 2 && pieces[1] ? pieces[1].split(':') : [];
    const explicit = [...left, ...right];
    if (explicit.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) {
      return null;
    }

    const missing = pieces.length === 2 ? 8 - explicit.length : 0;
    if ((pieces.length === 1 && explicit.length !== 8) || missing < 0) {
      return null;
    }

    return [
      ...left.map((part) => Number.parseInt(part, 16)),
      ...Array(missing).fill(0),
      ...right.map((part) => Number.parseInt(part, 16))
    ];
  }

  function isPrivateWebhookIPv6(parts) {
    if (!Array.isArray(parts) || parts.length !== 8) {
      return false;
    }

    const isLoopback = parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1;
    const isUnspecified = parts.every((part) => part === 0);
    const isLinkLocal = (parts[0] & 0xffc0) === 0xfe80;
    const isUniqueLocal = (parts[0] & 0xfe00) === 0xfc00;
    const isMulticast = (parts[0] & 0xff00) === 0xff00;
    const isIPv4Mapped = parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff;
    const mappedIPv4 = isIPv4Mapped
      ? [(parts[6] >> 8) & 255, parts[6] & 255, (parts[7] >> 8) & 255, parts[7] & 255]
      : null;

    return (
      isLoopback ||
      isUnspecified ||
      isLinkLocal ||
      isUniqueLocal ||
      isMulticast ||
      (mappedIPv4 && isPrivateWebhookIPv4(mappedIPv4))
    );
  }

  // Blocks https-only webhook targets that point at loopback/RFC-1918/link-local
  // hosts. This is a literal check on the parsed (WHATWG-normalized) hostname, so
  // obfuscated IP forms (octal/hex/integer) are caught, but a public hostname that
  // *resolves* to a private address via DNS (e.g. 127.0.0.1.nip.io, or DNS
  // rebinding) is not — that would require resolving DNS, which fetch() does not
  // expose to the extension.
  function validateWebhookUrl(url) {
    const rawUrl = String(url || '').trim();
    if (!rawUrl) {
      return { valid: false, url: '', error: 'Webhook URL is required' };
    }

    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return { valid: false, url: rawUrl, error: 'Webhook URL must be a valid HTTPS URL' };
    }

    if (parsed.protocol !== 'https:') {
      return { valid: false, url: rawUrl, error: 'Webhook URL must use https://' };
    }

    if (parsed.username || parsed.password) {
      return { valid: false, url: rawUrl, error: 'Webhook URL must not include credentials' };
    }

    const hostname = normalizeWebhookHostname(parsed.hostname);
    if (!hostname) {
      return { valid: false, url: rawUrl, error: 'Webhook URL must include a public hostname' };
    }

    const ipv4 = parseIPv4Address(hostname);
    if (ipv4) {
      if (isPrivateWebhookIPv4(ipv4)) {
        return { valid: false, url: rawUrl, error: 'Webhook URL must point to a public HTTPS host' };
      }
      return { valid: true, url: parsed.href, error: '' };
    }

    const ipv6 = parseIPv6Address(hostname);
    if (ipv6) {
      if (isPrivateWebhookIPv6(ipv6)) {
        return { valid: false, url: rawUrl, error: 'Webhook URL must point to a public HTTPS host' };
      }
      return { valid: true, url: parsed.href, error: '' };
    }

    if (!hostname.includes('.')) {
      return { valid: false, url: rawUrl, error: 'Webhook URL must use a public hostname' };
    }

    if (/\.(local|localhost|localdomain|internal|lan|home|corp)$/.test(hostname)) {
      return { valid: false, url: rawUrl, error: 'Webhook URL must not target a local or internal hostname' };
    }

    return { valid: true, url: parsed.href, error: '' };
  }

  function assertValidWebhookUrl(url) {
    const result = validateWebhookUrl(url);
    if (!result.valid) {
      throw new Error(result.error || 'Webhook URL is not allowed');
    }
    return result.url;
  }

  function buildWebhookSendMessage({ targetId, markdown, title, sourceUrl, clipState } = {}) {
    const content = String(markdown ?? clipState?.markdown ?? '');
    const resolvedTitle = String(title ?? clipState?.title ?? '').trim();
    const resolvedSourceUrl = String(sourceUrl ?? clipState?.pageUrl ?? '').trim();
    const publishedTime = String(clipState?.publishedTime ?? clipState?.date ?? '').trim();
    const article = {
      title: resolvedTitle,
      content,
      pageURL: resolvedSourceUrl,
      excerpt: String(clipState?.excerpt ?? ''),
      byline: String(clipState?.byline ?? ''),
      keywords: normalizeWebhookKeywords(clipState?.keywords),
      publishedTime
    };

    return {
      type: 'webhook-send',
      targetId,
      markdown: content,
      title: resolvedTitle,
      sourceUrl: resolvedSourceUrl,
      article
    };
  }

  function buildWebhookArticleFromMessage(message = {}) {
    const messageArticle = message?.article && typeof message.article === 'object'
      ? message.article
      : {};
    const publishedTime = String(messageArticle.publishedTime ?? messageArticle.date ?? '').trim();

    return {
      title: String(messageArticle.title ?? message.title ?? '').trim(),
      content: String(messageArticle.content ?? message.markdown ?? ''),
      pageURL: String(messageArticle.pageURL ?? message.sourceUrl ?? '').trim(),
      excerpt: String(messageArticle.excerpt ?? ''),
      byline: String(messageArticle.byline ?? ''),
      keywords: normalizeWebhookKeywords(messageArticle.keywords),
      publishedTime
    };
  }

  function renderWebhookTemplateString(template, article) {
    if (typeof template !== 'string' || !template) {
      return template;
    }

    const templateUtils = getTemplateUtils();
    const content = String(article?.content || '');
    const sentinel = createContentSentinel(template, content);
    const preparedTemplate = template.replace(/\{content\}/g, sentinel);
    const renderedTemplate = typeof templateUtils.textReplace === 'function'
      ? templateUtils.textReplace(preparedTemplate, article || {})
      : preparedTemplate;

    return renderedTemplate.split(sentinel).join(content);
  }

  function renderWebhookJsonValue(value, article) {
    if (typeof value === 'string') {
      return renderWebhookTemplateString(value, article);
    }

    if (Array.isArray(value)) {
      return value.map((item) => renderWebhookJsonValue(item, article));
    }

    if (value && typeof value === 'object') {
      return Object.entries(value).reduce((result, [key, nestedValue]) => {
        result[renderWebhookTemplateString(key, article)] = renderWebhookJsonValue(nestedValue, article);
        return result;
      }, {});
    }

    return value;
  }

  function renderWebhookJsonBody(bodyTemplate, article) {
    const effectiveTemplate = String(bodyTemplate || getDefaultWebhookBodyTemplate()).trim();
    const parsedTemplate = JSON.parse(effectiveTemplate);
    const renderedPayload = renderWebhookJsonValue(parsedTemplate, article);
    return JSON.stringify(renderedPayload);
  }

  function buildWebhookHeaders(headers, article) {
    const renderedHeaders = {};

    if (Array.isArray(headers)) {
      headers.forEach((header) => {
        const key = renderWebhookTemplateString(String(header?.key || '').trim(), article);
        if (!key) {
          return;
        }

        renderedHeaders[key] = renderWebhookTemplateString(String(header?.value || ''), article);
      });
    }

    const hasContentTypeHeader = Object.keys(renderedHeaders)
      .some((key) => key.toLowerCase() === 'content-type');

    if (!hasContentTypeHeader) {
      renderedHeaders['Content-Type'] = 'application/json';
    }

    return renderedHeaders;
  }

  function compactWhitespace(value) {
    return String(value || '').replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();
  }

  function truncateWebhookMessage(value, maxLength = 160) {
    const text = compactWhitespace(value);
    if (!text) {
      return '';
    }

    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
  }

  function parseNestedWebhookValue(value) {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    if (!/^[\[{]/.test(trimmed)) {
      return trimmed;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  function collectWebhookSummaryParts(value, parts = [], seen = new Set()) {
    if (parts.length >= 3 || value == null) {
      return parts;
    }

    if (typeof value === 'string') {
      const text = compactWhitespace(value);
      if (!text || text.toLowerCase() === 'null') {
        return parts;
      }

      if (text.includes(', ')) {
        text.split(', ').forEach((segment) => {
          if (parts.length < 3) {
            collectWebhookSummaryParts(segment, parts, seen);
          }
        });
        return parts;
      }

      if (!seen.has(text)) {
        seen.add(text);
        parts.push(text);
      }
      return parts;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (parts.length < 3) {
          collectWebhookSummaryParts(parseNestedWebhookValue(item), parts, seen);
        }
      });
      return parts;
    }

    if (typeof value === 'object') {
      const objectEntries = Object.entries(value);
      if (objectEntries.length === 1) {
        const [, onlyValue] = objectEntries[0];
        collectWebhookSummaryParts(parseNestedWebhookValue(onlyValue), parts, seen);
        return parts;
      }

      const beforePriorityCount = parts.length;
      ['message', 'error', 'details', 'detail', 'data'].forEach((key) => {
        if (parts.length < 3 && Object.prototype.hasOwnProperty.call(value, key)) {
          collectWebhookSummaryParts(parseNestedWebhookValue(value[key]), parts, seen);
        }
      });

      if (parts.length > beforePriorityCount || parts.length >= 3) {
        return parts;
      }

      objectEntries.forEach(([key, nestedValue]) => {
        if (parts.length >= 3 || ['message', 'error', 'details', 'detail', 'data'].includes(key)) {
          return;
        }

        const candidateParts = [];
        collectWebhookSummaryParts(parseNestedWebhookValue(nestedValue), candidateParts, new Set());
        if (!candidateParts.length) {
          return;
        }

        const entryText = compactWhitespace(`${key}: ${candidateParts.join(', ')}`);
        if (entryText && !seen.has(entryText)) {
          seen.add(entryText);
          parts.push(entryText);
        }
      });
    }

    return parts;
  }

  function summarizeWebhookResponseText(responseText, maxLength = 160) {
    const rawText = String(responseText || '').trim();
    if (!rawText) {
      return '';
    }

    let source = rawText;
    try {
      source = JSON.parse(rawText);
    } catch {}

    const parts = collectWebhookSummaryParts(parseNestedWebhookValue(source));
    const summary = parts.length > 1
      ? `${parts[0]}: ${parts.slice(1).join(', ')}`
      : (parts[0] || '');
    return truncateWebhookMessage(summary || rawText, maxLength);
  }

  function resolveWebhookSendErrorMessage(error, fallback = 'Failed to send to webhook target') {
    if (typeof error === 'string' && error.trim()) {
      return error.trim();
    }

    if (typeof error?.message === 'string' && error.message.trim()) {
      return error.message.trim();
    }

    return fallback;
  }

  function buildWebhookFetchRequest({ target, article } = {}) {
    const renderedUrl = renderWebhookTemplateString(String(target?.url || ''), article);
    return {
      url: assertValidWebhookUrl(renderedUrl),
      method: String(target?.method || 'POST').trim().toUpperCase() || 'POST',
      headers: buildWebhookHeaders(target?.headers, article),
      body: renderWebhookJsonBody(target?.bodyTemplate, article)
    };
  }

  const api = {
    buildWebhookSendMessage,
    buildWebhookArticleFromMessage,
    normalizeWebhookKeywords,
    renderWebhookTemplateString,
    renderWebhookJsonBody,
    validateWebhookUrl,
    assertValidWebhookUrl,
    buildWebhookFetchRequest,
    summarizeWebhookResponseText,
    resolveWebhookSendErrorMessage
  };

  Object.defineProperty(api, 'DEFAULT_WEBHOOK_BODY_TEMPLATE', {
    enumerable: true,
    get: getDefaultWebhookBodyTemplate
  });

  return api;
});
