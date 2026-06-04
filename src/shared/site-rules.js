(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.markSnipSiteRules = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const BOOLEAN_OVERRIDE_KEYS = ['includeTemplate', 'downloadImages'];
  const TEXT_OVERRIDE_KEYS = ['frontmatter', 'backmatter', 'title', 'imagePrefix', 'mdClipsFolder'];
  const ENUM_OVERRIDE_VALUES = {
    imageStyle: new Set(['originalSource', 'noImage', 'markdown', 'base64', 'obsidian', 'obsidian-nofolder']),
    imageRefStyle: new Set(['inlined', 'referenced']),
    imagePlacement: new Set(['sameFolder', 'sidecar', 'customPrefix'])
  };
  const TABLE_FORMATTING_KEYS = ['stripLinks', 'stripFormatting', 'prettyPrint', 'centerText'];
  const DEFAULT_RULE_NAME_PREFIX = 'Site Rule';

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
  }

  function deepClone(value) {
    if (Array.isArray(value)) {
      return value.map((item) => deepClone(item));
    }

    if (!isPlainObject(value)) {
      return value;
    }

    const clone = {};
    Object.keys(value).forEach((key) => {
      clone[key] = deepClone(value[key]);
    });
    return clone;
  }

  function buildSiteRuleId(index = 0) {
    return `site-rule-${index + 1}`;
  }

  function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function wildcardToRegexFragment(value) {
    return escapeRegex(value).replace(/\\\*/g, '.*');
  }

  function safeParseUrl(urlString) {
    try {
      return new URL(urlString);
    } catch {
      return null;
    }
  }

  function validateSiteRulePattern(pattern) {
    const rawPattern = String(pattern || '').trim();
    if (!rawPattern) {
      return {
        valid: false,
        error: 'Pattern is required',
        normalizedPattern: ''
      };
    }

    let sanitizedPattern = rawPattern.replace(/[?#].*$/, '');
    let scheme = '*';
    let hostAndPath = sanitizedPattern;

    const schemeMatch = sanitizedPattern.match(/^([a-z*]+):\/\/(.+)$/i);
    if (schemeMatch) {
      scheme = String(schemeMatch[1] || '').trim().toLowerCase();
      hostAndPath = String(schemeMatch[2] || '').trim();
      if (!['http', 'https', '*'].includes(scheme)) {
        return {
          valid: false,
          error: 'Only http://, https://, or no scheme are supported',
          normalizedPattern: rawPattern
        };
      }
    } else if (sanitizedPattern.includes('://')) {
      return {
        valid: false,
        error: 'Pattern has an unsupported scheme',
        normalizedPattern: rawPattern
      };
    }

    const slashIndex = hostAndPath.indexOf('/');
    let host = slashIndex >= 0 ? hostAndPath.slice(0, slashIndex) : hostAndPath;
    let path = slashIndex >= 0 ? hostAndPath.slice(slashIndex) : '/*';

    host = String(host || '').trim().toLowerCase();
    path = String(path || '').trim() || '/*';

    if (!host) {
      return {
        valid: false,
        error: 'Pattern host is required',
        normalizedPattern: rawPattern
      };
    }

    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    const normalizedPattern = `${scheme === '*' ? '' : `${scheme}://`}${host}${path}`;
    return {
      valid: true,
      error: '',
      scheme,
      host,
      path,
      normalizedPattern
    };
  }

  function isValidEnumOverride(key, value) {
    const allowedValues = ENUM_OVERRIDE_VALUES[key];
    return !!allowedValues && allowedValues.has(value);
  }

  function normalizeSiteRuleOverrides(overrides = {}) {
    if (!isPlainObject(overrides)) {
      return {};
    }

    const normalized = {};

    BOOLEAN_OVERRIDE_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(overrides, key) && typeof overrides[key] === 'boolean') {
        normalized[key] = overrides[key];
      }
    });

    TEXT_OVERRIDE_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(overrides, key) && overrides[key] != null) {
        normalized[key] = String(overrides[key]);
      }
    });

    Object.keys(ENUM_OVERRIDE_VALUES).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(overrides, key)) {
        return;
      }

      const value = String(overrides[key] || '').trim();
      if (isValidEnumOverride(key, value)) {
        normalized[key] = value;
      }
    });

    if (isPlainObject(overrides.tableFormatting)) {
      const tableFormatting = {};
      TABLE_FORMATTING_KEYS.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(overrides.tableFormatting, key) &&
          typeof overrides.tableFormatting[key] === 'boolean') {
          tableFormatting[key] = overrides.tableFormatting[key];
        }
      });

      if (Object.keys(tableFormatting).length > 0) {
        normalized.tableFormatting = tableFormatting;
      }
    }

    return normalized;
  }

  function normalizeSiteRule(rule, index = 0) {
    if (!isPlainObject(rule)) {
      return null;
    }

    const pattern = String(rule.pattern || '').trim();
    if (!pattern) {
      return null;
    }

    const name = String(rule.name || '').trim() || `${DEFAULT_RULE_NAME_PREFIX} ${index + 1}`;
    const id = String(rule.id || '').trim() || buildSiteRuleId(index);

    return {
      id,
      name,
      enabled: rule.enabled !== false,
      pattern,
      overrides: normalizeSiteRuleOverrides(rule.overrides)
    };
  }

  function normalizeSiteRules(rules = []) {
    if (!Array.isArray(rules)) {
      return [];
    }

    const seenIds = new Set();
    const normalized = [];

    rules.forEach((rule, index) => {
      const nextRule = normalizeSiteRule(rule, index);
      if (!nextRule) {
        return;
      }

      let nextId = nextRule.id;
      if (seenIds.has(nextId)) {
        nextId = `${nextId}-${index + 1}`;
      }
      seenIds.add(nextId);

      normalized.push({
        ...nextRule,
        id: nextId
      });
    });

    return normalized;
  }

  function collectOverrideKeys(overrides = {}) {
    const keys = [];

    BOOLEAN_OVERRIDE_KEYS.concat(TEXT_OVERRIDE_KEYS, Object.keys(ENUM_OVERRIDE_VALUES)).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        keys.push(key);
      }
    });

    if (isPlainObject(overrides.tableFormatting)) {
      TABLE_FORMATTING_KEYS.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(overrides.tableFormatting, key)) {
          keys.push(`tableFormatting.${key}`);
        }
      });
    }

    return keys;
  }

  function applySiteRuleOverrides(baseOptions = {}, overrides = {}) {
    const nextOptions = deepClone(isPlainObject(baseOptions) ? baseOptions : {});
    const hasImagePrefixOverride = Object.prototype.hasOwnProperty.call(overrides, 'imagePrefix');
    const hasImagePlacementOverride = Object.prototype.hasOwnProperty.call(overrides, 'imagePlacement');

    delete nextOptions.siteRules;

    BOOLEAN_OVERRIDE_KEYS.concat(TEXT_OVERRIDE_KEYS, Object.keys(ENUM_OVERRIDE_VALUES)).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        nextOptions[key] = deepClone(overrides[key]);
      }
    });

    if (hasImagePrefixOverride && !hasImagePlacementOverride) {
      nextOptions.imagePlacement = '';
    }

    if (isPlainObject(overrides.tableFormatting)) {
      const nextTableFormatting = isPlainObject(nextOptions.tableFormatting)
        ? deepClone(nextOptions.tableFormatting)
        : {};
      nextOptions.tableFormatting = {
        ...nextTableFormatting,
        ...deepClone(overrides.tableFormatting)
      };
    }

    return nextOptions;
  }

  function matchesSiteRulePattern(pattern, pageUrl) {
    const validation = validateSiteRulePattern(pattern);
    if (!validation.valid) {
      return false;
    }

    const parsedUrl = safeParseUrl(pageUrl);
    if (!parsedUrl) {
      return false;
    }

    const scheme = parsedUrl.protocol.replace(/:$/, '').toLowerCase();
    if (!['http', 'https'].includes(scheme)) {
      return false;
    }

    if (validation.scheme !== '*' && validation.scheme !== scheme) {
      return false;
    }

    const hostRegex = new RegExp(`^${wildcardToRegexFragment(validation.host)}$`, 'i');
    const pathRegex = new RegExp(`^${wildcardToRegexFragment(validation.path)}$`);

    return hostRegex.test(parsedUrl.hostname) && pathRegex.test(parsedUrl.pathname || '/');
  }

  function resolveSiteRuleOptions(pageUrl, baseOptions = {}) {
    const safeBaseOptions = deepClone(isPlainObject(baseOptions) ? baseOptions : {});
    const siteRules = normalizeSiteRules(safeBaseOptions.siteRules);
    delete safeBaseOptions.siteRules;

    const matchedRule = siteRules.find((rule) => rule.enabled && matchesSiteRulePattern(rule.pattern, pageUrl)) || null;
    if (!matchedRule) {
      return {
        options: safeBaseOptions,
        matchedRule: null,
        overriddenKeys: []
      };
    }

    return {
      options: applySiteRuleOverrides(safeBaseOptions, matchedRule.overrides),
      matchedRule: {
        id: matchedRule.id,
        name: matchedRule.name,
        enabled: matchedRule.enabled,
        pattern: matchedRule.pattern
      },
      overriddenKeys: collectOverrideKeys(matchedRule.overrides)
    };
  }

  return {
    BOOLEAN_OVERRIDE_KEYS,
    ENUM_OVERRIDE_VALUES,
    TABLE_FORMATTING_KEYS,
    TEXT_OVERRIDE_KEYS,
    applySiteRuleOverrides,
    buildSiteRuleId,
    collectOverrideKeys,
    matchesSiteRulePattern,
    normalizeSiteRule,
    normalizeSiteRuleOverrides,
    normalizeSiteRules,
    resolveSiteRuleOptions,
    validateSiteRulePattern
  };
});
