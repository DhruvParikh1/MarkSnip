(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.markSnipTemplateUtils = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  function getMomentLibrary() {
    if (typeof root.moment === 'function') {
      return root.moment;
    }

    if (typeof require === 'function') {
      try {
        return require('../background/moment.min.js');
      } catch {
        return null;
      }
    }

    return null;
  }

  function formatDate(now, format) {
    const momentLib = getMomentLibrary();
    if (typeof momentLib === 'function') {
      return momentLib(now).format(format);
    }

    if (format === 'YYYY-MM-DD') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return now.toISOString();
  }

  const ILLEGAL_FILENAME_RE = /[\/?<>\\:*|"]/g;
  const NON_BREAKING_SPACE_RE = new RegExp('\u00A0', 'g');

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizeFileNameReplacement(replacement = '') {
    if (!replacement) return '';
    return String(replacement)
      .replace(ILLEGAL_FILENAME_RE, '')
      .replace(NON_BREAKING_SPACE_RE, ' ');
  }

  function generateValidFileName(title, disallowedChars = null, disallowedCharReplacement = '') {
    if (!title) return title;
    title = title + '';

    const replacement = normalizeFileNameReplacement(disallowedCharReplacement);
    let name = title
      .replace(ILLEGAL_FILENAME_RE, () => replacement)
      .replace(NON_BREAKING_SPACE_RE, ' ');

    if (disallowedChars) {
      for (let c of disallowedChars) {
        name = name.replace(new RegExp(escapeRegExp(c), 'g'), () => replacement);
      }
    }

    return name;
  }

  const FILTERS = {
    kebab:     (s) => s.replace(/ /g, '-').toLowerCase(),
    snake:     (s) => s.replace(/ /g, '_').toLowerCase(),
    camel:     (s) => s.replace(/ ./g, (m) => m.trim().toUpperCase()).replace(/^./, (m) => m.toLowerCase()),
    pascal:    (s) => s.replace(/ ./g, (m) => m.trim().toUpperCase()).replace(/^./, (m) => m.toUpperCase()),
    lowercase: (s) => s.toLowerCase(),
    uppercase: (s) => s.toUpperCase(),
    ascii:     (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x00-\x7F]/g, ''),
    slugify:   (s) => FILTERS.ascii(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  };

  const FILTER_NAMES = Object.keys(FILTERS).join('|');

  function applyFilters(value, chain) {
    return chain.split(':').filter(Boolean).reduce((acc, name) => FILTERS[name](acc), value);
  }

  // Interpreter prompt placeholders: {{prompt:"..."}} / {{"..."}}, optional
  // trailing |filter chain. Kept in sync with interpreter-utils.createPromptRegex.
  // A fresh instance per call — global-flag regexes carry stateful lastIndex.
  function promptPlaceholderRegex() {
    return /\{\{(?:prompt:)?"[\s\S]*?"(?:\|[^}]*)?\}\}/g;
  }

  // Swap every prompt placeholder for a collision-checked sentinel so that
  // textReplace / generateValidFileName cannot delete or mangle it. The
  // sentinel contains only [A-Za-z0-9_] so it survives filename sanitization.
  // Returns { text, restore } — call restore() once the unsafe pass is done.
  function protectPromptPlaceholders(str) {
    const text = String(str == null ? '' : str);
    if (!promptPlaceholderRegex().test(text)) {
      return { text, restore: (value) => String(value == null ? '' : value) };
    }

    let base = '__MARKSNIP_PROMPT__';
    while (text.includes(base)) {
      base += 'X';
    }

    const map = [];
    let index = 0;
    const protectedText = text.replace(promptPlaceholderRegex(), (token) => {
      const sentinel = base + (index++) + '__';
      map.push([sentinel, token]);
      return sentinel;
    });

    return {
      text: protectedText,
      restore(value) {
        let result = String(value == null ? '' : value);
        for (const [sentinel, token] of map) {
          result = result.split(sentinel).join(token);
        }
        return result;
      }
    };
  }

  // Remove every interpreter prompt placeholder from a string. Used when the
  // Interpreter feature is disabled, so a {{prompt:"..."}} that can never be
  // resolved does not leak into the output.
  function stripPromptPlaceholders(str) {
    return String(str == null ? '' : str).replace(promptPlaceholderRegex(), '');
  }

  function textReplace(string, article, disallowedChars = null, disallowedCharReplacement = '') {
    const protectedPrompts = protectPromptPlaceholders(string);
    string = protectedPrompts.text;
    const shouldSanitizeValues = disallowedChars !== null && disallowedChars !== undefined;

    const keys = Object.keys(article)
      .filter((k) => k !== 'content' && Object.prototype.hasOwnProperty.call(article, k))
      .sort((a, b) => b.length - a.length);

    for (const key of keys) {
      let s = (article[key] || '') + '';
      if (s && shouldSanitizeValues) s = generateValidFileName(s, disallowedChars, disallowedCharReplacement);

      const pattern = new RegExp(
        '{' + escapeRegExp(key) + '((?::(?:' + FILTER_NAMES + '))*)}',
        'g'
      );
      string = string.replace(pattern, (_, chain) => (chain ? applyFilters(s, chain) : s));
    }

    const now = new Date();
    const dateRegex = /{date:(.+?)}/g;
    const matches = string.match(dateRegex);
    if (matches && matches.forEach) {
      matches.forEach((match) => {
        const format = match.substring(6, match.length - 1);
        const dateString = formatDate(now, format);
        string = string.replaceAll(match, dateString);
      });
    }

    const publishedTimeRegex = /{publishedTime:(.+?)}/g;
    const publishedTimeMatches = string.match(publishedTimeRegex);
    if (publishedTimeMatches && publishedTimeMatches.forEach) {
      const parsedPublishedTime = article.publishedTime ? new Date(article.publishedTime) : null;
      if (parsedPublishedTime && !isNaN(parsedPublishedTime.getTime())) {
        publishedTimeMatches.forEach((match) => {
          const format = match.substring(15, match.length - 1);
          const dateString = formatDate(parsedPublishedTime, format);
          string = string.replaceAll(match, dateString);
        });
      }
    }

    const keywordRegex = /{keywords:?(.*)?}/g;
    const keywordMatches = string.match(keywordRegex);
    if (keywordMatches && keywordMatches.forEach) {
      keywordMatches.forEach((match) => {
        let separator = match.substring(10, match.length - 1);
        try {
          separator = JSON.parse(JSON.stringify(separator).replace(/\\\\/g, '\\'));
        } catch { }
        const keywordsString = (article.keywords || []).join(separator);
        string = string.replace(new RegExp(match.replace(/\\/g, '\\\\'), 'g'), keywordsString);
      });
    }

    const defaultRegex = /{(.*?)}/g;
    string = string.replace(defaultRegex, '');

    return protectedPrompts.restore(string);
  }

  return {
    textReplace,
    generateValidFileName,
    protectPromptPlaceholders,
    stripPromptPlaceholders,
    applyFilters,
    FILTERS
  };
});
