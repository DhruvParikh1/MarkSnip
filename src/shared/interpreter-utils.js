(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.markSnipInterpreterUtils = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const INTERPRETER_STORAGE_KEY = 'interpreterConfig';

  // Prompt placeholder syntax: {{prompt:"..."}} or {{"..."}}, optionally with a
  // trailing |filter chain. Kept identical to the protector regex in
  // template-utils.js so detection and stripping stay in sync.
  function createPromptRegex() {
    return /\{\{(?:prompt:)?"([\s\S]*?)"(\|[^}]*)?\}\}/g;
  }

  const SYSTEM_PROMPT =
    'You are a helpful assistant. Please respond with one JSON object named ' +
    '`prompts_responses` - no explanatory text before or after. Use the ' +
    'keys provided, e.g. `prompt_1`, `prompt_2`, and fill in the values. ' +
    'Values should be Markdown strings unless otherwise specified. Make your ' +
    'responses concise. For example, your response should look like: ' +
    '{"prompts_responses":{"prompt_1":"tag1, tag2, tag3","prompt_2":"- bullet1\n- bullet 2\n- bullet3"}}';

  // Built-in provider presets. baseUrls verbatim from obsidian-clipper
  // providers.json. `family` drives request routing and is immutable.
  const PROVIDER_PRESETS = [
    {
      id: 'anthropic',
      name: 'Anthropic',
      family: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      apiKeyRequired: true,
      apiKeyUrl: 'https://console.anthropic.com/settings/keys',
      popularModels: [
        { id: 'claude-haiku-4-5', name: 'Claude 4.5 Haiku' },
        { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku' },
        { id: 'claude-sonnet-4-5', name: 'Claude 4.5 Sonnet' },
        { id: 'claude-opus-4-5', name: 'Claude 4.5 Opus' }
      ]
    },
    {
      id: 'openai',
      name: 'OpenAI',
      family: 'openai',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      apiKeyRequired: true,
      apiKeyUrl: 'https://platform.openai.com/api-keys',
      popularModels: [
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
        { id: 'gpt-4o', name: 'GPT-4o' },
        { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
        { id: 'gpt-5', name: 'GPT-5' }
      ]
    },
    {
      id: 'google-gemini',
      name: 'Google Gemini',
      family: 'openai',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      apiKeyRequired: true,
      apiKeyUrl: 'https://aistudio.google.com/apikey',
      popularModels: [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }
      ]
    },
    {
      id: 'ollama',
      name: 'Ollama',
      family: 'ollama',
      baseUrl: 'http://127.0.0.1:11434/api/chat',
      apiKeyRequired: false,
      apiKeyUrl: '',
      popularModels: [
        { id: 'llama3.2', name: 'Llama 3.2 3B' },
        { id: 'llama3.2:1b', name: 'Llama 3.2 1B' },
        { id: 'gpt-oss:20b', name: 'GPT OSS 20B' }
      ]
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      family: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
      apiKeyRequired: true,
      apiKeyUrl: 'https://openrouter.ai/settings/keys',
      popularModels: [
        { id: 'meta-llama/llama-3.2-3b-instruct', name: 'Llama 3.2 3B Instruct' },
        { id: 'meta-llama/llama-3.2-1b-instruct', name: 'Llama 3.2 1B Instruct' }
      ]
    }
  ];

  const OPENROUTER_REFERER = 'https://github.com/DhruvParikh1/markdownload-extension-updated';
  const OPENROUTER_TITLE = 'MarkSnip';

  const CURLY_DOUBLE_QUOTE_OPEN = String.fromCharCode(0x201c);
  const CURLY_DOUBLE_QUOTE_CLOSE = String.fromCharCode(0x201d);
  const CURLY_QUOTE_REGEX = new RegExp(
    '[' + CURLY_DOUBLE_QUOTE_OPEN + CURLY_DOUBLE_QUOTE_CLOSE + ']',
    'g'
  );

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // Remove JSON-breaking control characters without a regex (keeps this source
  // file pure ASCII). Strips C0/C1 ranges except \t \n \r.
  function stripControlChars(value) {
    let out = '';
    const str = String(value);
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      const isC0 = (code <= 8) || (code >= 11 && code <= 31);
      const isC1 = (code >= 127 && code <= 159);
      if (isC0 || isC1) {
        continue;
      }
      out += str[i];
    }
    return out;
  }

  // Interpreter starts with nothing configured. PROVIDER_PRESETS only seed the
  // "Add Provider" form; they are not auto-added to a user's config.
  const DEFAULT_INTERPRETER_CONFIG = { providers: [], models: [] };

  function getBrowser() {
    if (typeof browser !== 'undefined' && browser && browser.storage) {
      return browser;
    }
    if (typeof chrome !== 'undefined' && chrome && chrome.storage) {
      return chrome;
    }
    return null;
  }

  function getTemplateUtils() {
    if (root.markSnipTemplateUtils) {
      return root.markSnipTemplateUtils;
    }
    if (typeof require === 'function') {
      try {
        return require('./template-utils');
      } catch {}
    }
    return null;
  }

  function getFilterMap() {
    const templateUtils = getTemplateUtils();
    if (templateUtils && templateUtils.FILTERS && typeof templateUtils.FILTERS === 'object') {
      return templateUtils.FILTERS;
    }
    return {};
  }

  // Apply a pipe-separated filter chain (e.g. "kebab|uppercase"). Unknown
  // filter names are skipped silently -- never thrown -- so a typo in a
  // template cannot break a clip.
  function applyPromptFilters(value, chain) {
    const filters = getFilterMap();
    return String(chain || '')
      .split('|')
      .map((name) => name.trim())
      .filter(Boolean)
      .reduce((acc, name) => {
        const fn = filters[name];
        return typeof fn === 'function' ? fn(acc) : acc;
      }, String(value));
  }

  // Scan one or more strings for {{prompt:"..."}} placeholders. Deduped by
  // prompt text; keys assigned prompt_1, prompt_2, ... in encounter order.
  function collectPromptVariables() {
    const sources = Array.prototype.slice.call(arguments);
    const map = new Map();

    sources.forEach((source) => {
      if (typeof source !== 'string' || !source) {
        return;
      }
      const regex = createPromptRegex();
      let match;
      while ((match = regex.exec(source)) !== null) {
        const prompt = match[1];
        if (!map.has(prompt)) {
          map.set(prompt, {
            key: 'prompt_' + (map.size + 1),
            prompt,
            filters: match[2] || ''
          });
        }
      }
    });

    return Array.from(map.values());
  }

  function hasPromptPlaceholders() {
    const sources = Array.prototype.slice.call(arguments);
    return sources.some((source) => {
      if (typeof source !== 'string' || !source) {
        return false;
      }
      return createPromptRegex().test(source);
    });
  }

  function buildPromptContent(promptVariables) {
    const prompts = {};
    (promptVariables || []).forEach(({ key, prompt }) => {
      prompts[key] = prompt;
    });
    return { prompts };
  }

  // Build {url, headers, body} for an LLM request. `body` is a plain object --
  // the caller JSON-stringifies it. Branches on provider.family.
  function buildLLMRequest({ provider, model, promptContext, promptVariables } = {}) {
    if (!provider) {
      throw new Error('Provider is required to build an LLM request');
    }
    if (!model) {
      throw new Error('Model is required to build an LLM request');
    }

    const family = provider.family || 'openai';
    const promptContent = buildPromptContent(promptVariables);
    const contextText = String(promptContext || '');
    const url = String(provider.baseUrl || '').trim();
    const headers = { 'Content-Type': 'application/json' };
    let body;

    if (family === 'anthropic') {
      body = {
        model: model.providerModelId,
        max_tokens: 1600,
        messages: [
          { role: 'user', content: contextText },
          { role: 'user', content: JSON.stringify(promptContent) }
        ],
        temperature: 0.5,
        system: SYSTEM_PROMPT
      };
      headers['x-api-key'] = provider.apiKey || '';
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    } else if (family === 'ollama') {
      body = {
        model: model.providerModelId,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: contextText },
          { role: 'user', content: JSON.stringify(promptContent) }
        ],
        format: 'json',
        num_ctx: 120000,
        temperature: 0.5,
        stream: false
      };
    } else {
      body = {
        model: model.providerModelId,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: contextText },
          { role: 'user', content: JSON.stringify(promptContent) }
        ]
      };
      // Only send an auth header when a key exists — a no-key OpenAI-compatible
      // provider (e.g. a local server) can reject an empty bearer token.
      if (provider.apiKey) {
        headers.Authorization = 'Bearer ' + provider.apiKey;
      }
      if (provider.id === 'openrouter' || /openrouter\.ai/i.test(url)) {
        headers['HTTP-Referer'] = OPENROUTER_REFERER;
        headers['X-Title'] = OPENROUTER_TITLE;
      }
    }

    return { url, headers, body };
  }

  // Pull the raw assistant text out of a parsed provider response.
  function extractLLMContent(provider, data) {
    const family = (provider && provider.family) || 'openai';

    if (family === 'anthropic') {
      const text = data && data.content && data.content[0] && data.content[0].text;
      if (text) {
        try {
          return JSON.stringify(JSON.parse(text));
        } catch {
          return text;
        }
      }
      return JSON.stringify(data);
    }

    if (family === 'ollama') {
      const text = data && data.message && data.message.content;
      if (text) {
        try {
          return JSON.stringify(JSON.parse(text));
        } catch {
          return text;
        }
      }
      return JSON.stringify(data);
    }

    const openaiText = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    return openaiText || JSON.stringify(data);
  }

  function sanitizeJsonString(str) {
    let result = String(str).replace(/\r\n/g, '\n');
    result = result.replace(/\n/g, '\\n');
    result = result.replace(/(?<!\\)"/g, '\\"');
    result = result
      .replace(/(?<=[{[,:]\s*)\\"/g, '"')
      .replace(/\\"(?=\s*[}\],:}])/g, '"');
    result = result
      .replace(CURLY_QUOTE_REGEX, '\\"')
      .replace(/"\s*:/g, '":')
      .replace(/:\s*"/g, ':"')
      .replace(/\\{3,}/g, '\\\\');
    return stripControlChars(result);
  }

  // Robust multi-stage parser for the LLM's prompts_responses JSON. Mirrors
  // obsidian-clipper's interpreter so flaky model output still maps to keys.
  function parseLLMResponse(responseContent, promptVariables) {
    try {
      let content = responseContent;
      if (typeof content === 'object') {
        content = JSON.stringify(content);
      }
      content = String(content);

      let parsedResponse;
      try {
        parsedResponse = JSON.parse(sanitizeJsonString(content));
      } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON object found in response');
        }

        try {
          const minimalSanitized = jsonMatch[0]
            .replace(CURLY_QUOTE_REGEX, '"')
            .replace(/\r\n/g, '\\n')
            .replace(/\n/g, '\\n');
          parsedResponse = JSON.parse(minimalSanitized);
        } catch {
          try {
            parsedResponse = JSON.parse(sanitizeJsonString(jsonMatch[0]));
          } catch {
            const promptsResponses = {};
            (promptVariables || []).forEach((variable, index) => {
              const promptKey = 'prompt_' + (index + 1);
              const promptRegex = new RegExp(
                '"' + promptKey + '"\\s*:\\s*"([^]*?)(?:"\\s*,|"\\s*})',
                'g'
              );
              const match = promptRegex.exec(jsonMatch[0]);
              if (match) {
                promptsResponses[promptKey] = match[1]
                  .replace(/"/g, '\\"')
                  .replace(/\r\n/g, '\\n')
                  .replace(/\n/g, '\\n');
              }
            });
            parsedResponse = JSON.parse(JSON.stringify({ prompts_responses: promptsResponses }));
          }
        }
      }

      if (!parsedResponse || !parsedResponse.prompts_responses) {
        return { promptResponses: [] };
      }

      Object.keys(parsedResponse.prompts_responses).forEach((key) => {
        if (typeof parsedResponse.prompts_responses[key] === 'string') {
          parsedResponse.prompts_responses[key] = parsedResponse.prompts_responses[key]
            .replace(/\\n/g, '\n')
            .replace(/\r/g, '');
        }
      });

      const promptResponses = (promptVariables || []).map((variable) => ({
        key: variable.key,
        prompt: variable.prompt,
        user_response: parsedResponse.prompts_responses[variable.key] || ''
      }));

      return { promptResponses };
    } catch {
      return { promptResponses: [] };
    }
  }

  // Replace every {{prompt:"..."}} token in `text` with its response. Filters
  // come from each individual match, not the deduped variable.
  function replacePromptVariables(text, promptVariables, promptResponses) {
    if (typeof text !== 'string' || !text) {
      return text;
    }

    const regex = createPromptRegex();
    return text.replace(regex, (match, promptText, filters) => {
      const variable = (promptVariables || []).find((v) => v.prompt === promptText);
      if (!variable) {
        return match;
      }

      const response = (promptResponses || []).find((r) => r.key === variable.key);
      if (!response || response.user_response === undefined || response.user_response === '') {
        return match;
      }

      let value = response.user_response;
      if (typeof value === 'object') {
        try {
          value = JSON.stringify(value, null, 2);
        } catch {
          value = String(value);
        }
      }
      value = String(value);

      if (filters) {
        value = applyPromptFilters(value, filters.slice(1));
      }

      return value;
    });
  }

  function normalizeProvider(raw) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const id = String(raw.id || '').trim();
    if (!id) {
      return null;
    }
    const family = raw.family === 'anthropic' || raw.family === 'ollama'
      ? raw.family
      : 'openai';
    const provider = {
      id,
      name: String(raw.name || id).trim() || id,
      family,
      baseUrl: String(raw.baseUrl || '').trim(),
      apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
      apiKeyRequired: raw.apiKeyRequired !== false
    };
    if (raw.presetId) {
      provider.presetId = String(raw.presetId);
    }
    return provider;
  }

  function normalizeModel(raw) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const id = String(raw.id || '').trim();
    const providerId = String(raw.providerId || '').trim();
    if (!id || !providerId) {
      return null;
    }
    return {
      id,
      providerId,
      providerModelId: String(raw.providerModelId || '').trim(),
      name: String(raw.name || raw.providerModelId || id).trim(),
      enabled: raw.enabled !== false
    };
  }

  // Coerce stored config into a valid shape: drop malformed entries and drop
  // models whose provider no longer exists. Nothing is auto-seeded — the
  // interpreter is empty until the user adds providers and models themselves.
  function normalizeInterpreterConfig(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};

    const providers = Array.isArray(source.providers)
      ? source.providers.map(normalizeProvider).filter(Boolean)
      : [];

    const providerIds = new Set(providers.map((p) => p.id));

    const models = Array.isArray(source.models)
      ? source.models
        .map(normalizeModel)
        .filter(Boolean)
        .filter((model) => providerIds.has(model.providerId))
      : [];

    return { providers, models };
  }

  function loadInterpreterConfig() {
    const api = getBrowser();
    if (!api || !api.storage || !api.storage.local) {
      return Promise.resolve(clone(DEFAULT_INTERPRETER_CONFIG));
    }
    return Promise.resolve(api.storage.local.get(INTERPRETER_STORAGE_KEY))
      .then((stored) => normalizeInterpreterConfig(stored ? stored[INTERPRETER_STORAGE_KEY] : null))
      .catch(() => clone(DEFAULT_INTERPRETER_CONFIG));
  }

  function saveInterpreterConfig(config) {
    const api = getBrowser();
    if (!api || !api.storage || !api.storage.local) {
      return Promise.resolve();
    }
    const normalized = normalizeInterpreterConfig(config);
    return Promise.resolve(api.storage.local.set({ [INTERPRETER_STORAGE_KEY]: normalized }));
  }

  return {
    INTERPRETER_STORAGE_KEY,
    SYSTEM_PROMPT,
    PROVIDER_PRESETS,
    DEFAULT_INTERPRETER_CONFIG,
    createPromptRegex,
    collectPromptVariables,
    hasPromptPlaceholders,
    buildLLMRequest,
    extractLLMContent,
    parseLLMResponse,
    replacePromptVariables,
    applyPromptFilters,
    normalizeInterpreterConfig,
    loadInterpreterConfig,
    saveInterpreterConfig
  };
});
