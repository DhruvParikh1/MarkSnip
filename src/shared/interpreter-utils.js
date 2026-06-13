(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.markSnipInterpreterUtils = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const INTERPRETER_STORAGE_KEY = 'interpreterConfig';
  const INTERPRETER_KEYS_STORAGE_KEY = 'interpreterApiKeys';
  const MAX_PROVIDER_MODEL_ID_LENGTH = 160;
  const MAX_PROVIDER_MODEL_NAME_LENGTH = 160;

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

  // Bundled provider presets. Model suggestions update only with extension
  // releases so installed clients do not silently trust a remote catalog.
  // `family` drives request routing and is immutable.
  const RAW_PROVIDER_PRESETS = [
    {
      id: 'anthropic',
      name: 'Anthropic',
      family: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      apiKeyRequired: true,
      apiKeyUrl: 'https://console.anthropic.com/settings/keys',
      modelsList: 'https://platform.claude.com/docs/en/about-claude/models/overview',
      popularModels: [
        { id: 'claude-opus-4-7', name: 'Claude 4.7 Opus' },
        { id: 'claude-sonnet-4-6', name: 'Claude 4.6 Sonnet' },
        { id: 'claude-haiku-4-5', name: 'Claude 4.5 Haiku' }
      ]
    },
    {
      id: 'openai',
      name: 'OpenAI',
      family: 'openai',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      apiKeyRequired: true,
      apiKeyUrl: 'https://platform.openai.com/api-keys',
      modelsList: 'https://platform.openai.com/docs/models',
      popularModels: [
        { id: 'gpt-5.5-pro', name: 'GPT-5.5 Pro' },
        { id: 'gpt-5.5', name: 'GPT-5.5' },
        { id: 'gpt-5.5-instant', name: 'GPT-5.5 Instant' },
        { id: 'gpt-5.4', name: 'GPT-5.4' },
        { id: 'gpt-4o', name: 'GPT-4o' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini' }
      ]
    },
    {
      id: 'azure-openai',
      name: 'Azure OpenAI',
      family: 'azure',
      baseUrl: 'https://{resource-name}.openai.azure.com/openai/deployments/{deployment-id}/chat/completions?api-version=2024-10-21',
      apiKeyRequired: true,
      apiKeyUrl: 'https://oai.azure.com/portal/',
      modelsList: 'https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/models',
      popularModels: [
        { id: 'gpt-5.5-pro', name: 'GPT-5.5 Pro' },
        { id: 'gpt-5.5', name: 'GPT-5.5' },
        { id: 'gpt-4o', name: 'GPT-4o' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini' }
      ]
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      family: 'openai',
      baseUrl: 'https://api.deepseek.com/v1/chat/completions',
      apiKeyRequired: true,
      apiKeyUrl: 'https://platform.deepseek.com/api_keys',
      modelsList: 'https://api-docs.deepseek.com/quick_start/pricing',
      popularModels: [
        { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
        { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' }
      ]
    },
    {
      id: 'google-gemini',
      name: 'Google Gemini',
      family: 'openai',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      apiKeyRequired: true,
      apiKeyUrl: 'https://aistudio.google.com/apikey',
      modelsList: 'https://ai.google.dev/gemini-api/docs/models',
      popularModels: [
        { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Preview)' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }
      ]
    },
    {
      id: 'huggingface',
      name: 'Hugging Face',
      family: 'huggingface',
      baseUrl: 'https://api-inference.huggingface.co/models/{model-id}/chat/completions',
      apiKeyRequired: true,
      apiKeyUrl: 'https://huggingface.co/settings/tokens',
      modelsList: 'https://huggingface.co/models',
      popularModels: []
    },
    {
      id: 'meta',
      name: 'Meta',
      family: 'openai',
      baseUrl: 'https://api.llama.com/v1/chat/completions',
      apiKeyRequired: true,
      apiKeyUrl: 'https://llama.developer.meta.com',
      modelsList: 'https://llama.developer.meta.com/docs/models',
      popularModels: [
        { id: 'Llama-3.3-8B-Instruct', name: 'Llama 3.3 8B' },
        { id: 'Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B' }
      ]
    },
    {
      id: 'ollama',
      name: 'Ollama',
      family: 'ollama',
      baseUrl: 'http://127.0.0.1:11434/api/chat',
      apiKeyRequired: false,
      apiKeyUrl: '',
      modelsList: 'https://ollama.com/models',
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
      modelsList: 'https://openrouter.ai/models',
      popularModels: [
        { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro (OpenRouter)' },
        { id: 'google/gemini-3.5-flash', name: 'Gemini 3.5 Flash (OpenRouter)' },
        { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct (OpenRouter)' },
        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (OpenRouter)' }
      ]
    },
    {
      id: 'perplexity',
      name: 'Perplexity',
      family: 'openai',
      baseUrl: 'https://api.perplexity.ai/chat/completions',
      apiKeyRequired: true,
      apiKeyUrl: 'https://www.perplexity.ai/settings/api',
      modelsList: 'https://docs.perplexity.ai/getting-started/models',
      popularModels: [
        { id: 'sonar', name: 'Sonar' },
        { id: 'sonar-pro', name: 'Sonar Pro' },
        { id: 'sonar-reasoning', name: 'Sonar Reasoning' }
      ]
    },
    {
      id: 'xai',
      name: 'xAI',
      family: 'openai',
      baseUrl: 'https://api.x.ai/v1/chat/completions',
      apiKeyRequired: true,
      apiKeyUrl: 'https://console.x.ai/team/default/api-keys',
      modelsList: 'https://docs.x.ai/docs/models',
      popularModels: [
        { id: 'grok-4.3', name: 'Grok 4.3' },
        { id: 'grok-build-0.1', name: "Grok Build 0.1" }
      ]
    }
  ];

  const PROVIDER_PRESETS = sanitizeProviderPresets(RAW_PROVIDER_PRESETS);

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

  function containsControlChars(value) {
    return stripControlChars(value) !== String(value);
  }

  function sanitizeProviderModel(raw) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const id = String(raw.id || '').trim();
    if (!id || containsControlChars(id)) {
      return null;
    }

    const name = String(raw.name || id).trim();
    const cleanName = stripControlChars(name).trim() || id;
    return {
      id: id.slice(0, MAX_PROVIDER_MODEL_ID_LENGTH),
      name: cleanName.slice(0, MAX_PROVIDER_MODEL_NAME_LENGTH)
    };
  }

  function sanitizePopularModels(models) {
    if (!Array.isArray(models)) {
      return [];
    }

    const seenIds = new Set();
    return models.reduce((normalized, model) => {
      const next = sanitizeProviderModel(model);
      if (!next || seenIds.has(next.id)) {
        return normalized;
      }
      seenIds.add(next.id);
      normalized.push(next);
      return normalized;
    }, []);
  }

  function sanitizeProviderPresets(presets) {
    return (Array.isArray(presets) ? presets : []).map((preset) => ({
      ...preset,
      popularModels: sanitizePopularModels(preset?.popularModels)
    }));
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
    let url = String(provider.baseUrl || '').trim();
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
    } else if (family === 'azure') {
      // Azure deployments embed the selected model/deployment in the URL; the
      // body omits `model`.
      if (!url.includes('{deployment-id}')) {
        throw new Error('Azure base URL must include {deployment-id} so the selected model can supply the deployment name');
      }
      url = url.replace('{deployment-id}', encodeURIComponent(model.providerModelId || ''));
      body = {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: contextText },
          { role: 'user', content: JSON.stringify(promptContent) }
        ],
        max_tokens: 1600,
        stream: false
      };
      headers['api-key'] = provider.apiKey || '';
    } else if (family === 'huggingface') {
      // Hugging Face base URLs may carry a {model-id} placeholder.
      url = url.replace('{model-id}', model.providerModelId || '');
      body = {
        model: model.providerModelId,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: contextText },
          { role: 'user', content: JSON.stringify(promptContent) }
        ],
        max_tokens: 1600,
        stream: false
      };
      if (provider.apiKey) {
        headers.Authorization = 'Bearer ' + provider.apiKey;
      }
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
    const family = ['anthropic', 'ollama', 'azure', 'huggingface'].indexOf(raw.family) !== -1
      ? raw.family
      : 'openai';
    const provider = {
      id,
      name: String(raw.name || id).trim() || id,
      family,
      baseUrl: String(raw.baseUrl || '').trim(),
      apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
      apiKeyRequired: raw.apiKeyRequired !== false,
      rememberApiKey: raw.rememberApiKey === true
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

  function normalizeApiKeyStore(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return Object.keys(source).reduce((normalized, providerId) => {
      const id = String(providerId || '').trim();
      const key = typeof source[providerId] === 'string' ? source[providerId] : '';
      if (id && key) {
        normalized[id] = key;
      }
      return normalized;
    }, {});
  }

  async function readStorageKey(area, key) {
    if (!area || !key) {
      return null;
    }
    const stored = await Promise.resolve(area.get(key));
    return stored ? stored[key] : null;
  }

  function stripApiKeysFromConfig(config) {
    const normalized = normalizeInterpreterConfig(config);
    return {
      ...normalized,
      providers: normalized.providers.map((provider) => ({
        ...provider,
        apiKey: ''
      }))
    };
  }

  function collectApiKeys(config) {
    const normalized = normalizeInterpreterConfig(config);
    return normalized.providers.reduce((keys, provider) => {
      if (provider.apiKey) {
        keys[provider.id] = provider.apiKey;
      }
      return keys;
    }, {});
  }

  function attachApiKeys(config, keyStore) {
    const keys = normalizeApiKeyStore(keyStore);
    const normalized = normalizeInterpreterConfig(config);
    return {
      ...normalized,
      providers: normalized.providers.map((provider) => ({
        ...provider,
        apiKey: keys[provider.id] || ''
      }))
    };
  }

  let presetsMemoryCache = null;

  // Provider presets are bundled and never fetched remotely at runtime.
  async function getPresetProviders() {
    if (!presetsMemoryCache) {
      presetsMemoryCache = clone(PROVIDER_PRESETS);
    }
    return presetsMemoryCache;
  }

  async function loadInterpreterConfig() {
    const api = getBrowser();
    if (!api || !api.storage || !api.storage.local) {
      return clone(DEFAULT_INTERPRETER_CONFIG);
    }

    try {
      const sessionArea = api.storage.session || null;
      const storedConfig = await readStorageKey(api.storage.local, INTERPRETER_STORAGE_KEY);
      const normalized = normalizeInterpreterConfig(storedConfig);
      const legacyKeys = collectApiKeys(normalized);
      let localKeys = normalizeApiKeyStore(await readStorageKey(api.storage.local, INTERPRETER_KEYS_STORAGE_KEY));
      let sessionKeys = normalizeApiKeyStore(await readStorageKey(sessionArea, INTERPRETER_KEYS_STORAGE_KEY));

      if (Object.keys(legacyKeys).length) {
        if (sessionArea) {
          sessionKeys = { ...sessionKeys, ...legacyKeys };
          await Promise.resolve(sessionArea.set({ [INTERPRETER_KEYS_STORAGE_KEY]: sessionKeys }));
        } else {
          normalized.providers.forEach((provider) => {
            if (provider.rememberApiKey && legacyKeys[provider.id]) {
              localKeys[provider.id] = legacyKeys[provider.id];
            }
          });
        }
        await Promise.resolve(api.storage.local.set({
          [INTERPRETER_STORAGE_KEY]: stripApiKeysFromConfig(normalized),
          [INTERPRETER_KEYS_STORAGE_KEY]: localKeys
        }));
      }

      return attachApiKeys(normalized, { ...localKeys, ...sessionKeys });
    } catch {
      return clone(DEFAULT_INTERPRETER_CONFIG);
    }
  }

  async function saveInterpreterConfig(config) {
    const api = getBrowser();
    if (!api || !api.storage || !api.storage.local) {
      return;
    }

    const normalized = normalizeInterpreterConfig(config);
    const sessionArea = api.storage.session || null;
    const providerIds = new Set(normalized.providers.map((provider) => provider.id));

    if (!sessionArea) {
      const hasSessionOnlyKey = normalized.providers.some((provider) => provider.apiKey && !provider.rememberApiKey);
      if (hasSessionOnlyKey) {
        throw new Error('Session storage is unavailable. Enable "Remember API key on this device" to save this key.');
      }
    }

    const nextLocalKeys = normalizeApiKeyStore(await readStorageKey(api.storage.local, INTERPRETER_KEYS_STORAGE_KEY));
    const nextSessionKeys = normalizeApiKeyStore(await readStorageKey(sessionArea, INTERPRETER_KEYS_STORAGE_KEY));

    Object.keys(nextLocalKeys).forEach((providerId) => {
      if (!providerIds.has(providerId)) {
        delete nextLocalKeys[providerId];
      }
    });
    Object.keys(nextSessionKeys).forEach((providerId) => {
      if (!providerIds.has(providerId)) {
        delete nextSessionKeys[providerId];
      }
    });

    normalized.providers.forEach((provider) => {
      delete nextLocalKeys[provider.id];
      delete nextSessionKeys[provider.id];
      if (!provider.apiKey) {
        return;
      }
      if (provider.rememberApiKey) {
        nextLocalKeys[provider.id] = provider.apiKey;
      } else if (sessionArea) {
        nextSessionKeys[provider.id] = provider.apiKey;
      }
    });

    if (sessionArea) {
      await Promise.resolve(sessionArea.set({ [INTERPRETER_KEYS_STORAGE_KEY]: nextSessionKeys }));
    }
    await Promise.resolve(api.storage.local.set({
      [INTERPRETER_STORAGE_KEY]: stripApiKeysFromConfig(normalized),
      [INTERPRETER_KEYS_STORAGE_KEY]: nextLocalKeys
    }));
  }

  return {
    INTERPRETER_STORAGE_KEY,
    INTERPRETER_KEYS_STORAGE_KEY,
    SYSTEM_PROMPT,
    PROVIDER_PRESETS,
    DEFAULT_INTERPRETER_CONFIG,
    getPresetProviders,
    sanitizeProviderPresets,
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
