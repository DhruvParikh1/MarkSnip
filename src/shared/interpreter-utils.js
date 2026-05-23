(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.markSnipInterpreterUtils = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const INTERPRETER_STORAGE_KEY = 'interpreterConfig';
  // Remote provider catalog — refreshed without shipping an extension update.
  const PROVIDERS_URL = 'https://raw.githubusercontent.com/DhruvParikh1/markdownload-extension-updated/main/providers.json';
  const PRESETS_CACHE_KEY = 'interpreterProviderPresets';
  const PRESETS_CACHE_TTL = 21600000; // 6 hours

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

  // Bundled provider presets — the offline fallback for getPresetProviders().
  // The remote providers.json (same shape) is preferred when reachable.
  // `family` drives request routing and is immutable.
  const PROVIDER_PRESETS = [
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

  const VALID_PROVIDER_FAMILIES = ['anthropic', 'openai', 'ollama', 'azure', 'huggingface'];

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

  // Parse a providers.json object ({version, <id>:{...}}) into a preset array.
  function parsePresetProviders(data) {
    if (!data || typeof data !== 'object') {
      return null;
    }
    const presets = [];
    Object.keys(data).forEach((key) => {
      if (key === 'version') {
        return;
      }
      const entry = data[key];
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const id = String(entry.id || key).trim();
      if (!id) {
        return;
      }
      presets.push({
        id,
        name: String(entry.name || id),
        family: VALID_PROVIDER_FAMILIES.indexOf(entry.family) !== -1 ? entry.family : 'openai',
        baseUrl: String(entry.baseUrl || ''),
        apiKeyRequired: entry.apiKeyRequired !== false,
        apiKeyUrl: String(entry.apiKeyUrl || ''),
        modelsList: String(entry.modelsList || ''),
        popularModels: Array.isArray(entry.popularModels)
          ? entry.popularModels
            .filter((m) => m && m.id)
            .map((m) => ({ id: String(m.id), name: String(m.name || m.id) }))
          : []
      });
    });
    return presets.length ? presets : null;
  }

  let presetsMemoryCache = null;
  let presetsFetchedAt = 0;

  // Security boundary: request routing (baseUrl, family, apiKeyUrl, modelsList,
  // the provider set itself) ALWAYS comes from the bundled PROVIDER_PRESETS.
  // The remote providers.json may only refresh the `popularModels` list of an
  // already-bundled provider — so a changed/compromised remote catalog can
  // never redirect a trusted provider's requests or introduce a new endpoint.
  function mergePresets(remotePresets) {
    const merged = clone(PROVIDER_PRESETS);
    if (!Array.isArray(remotePresets)) {
      return merged;
    }
    const remoteById = {};
    remotePresets.forEach((preset) => {
      if (preset && preset.id) {
        remoteById[preset.id] = preset;
      }
    });
    merged.forEach((preset) => {
      const remote = remoteById[preset.id];
      if (remote && Array.isArray(remote.popularModels) && remote.popularModels.length) {
        preset.popularModels = remote.popularModels
          .filter((m) => m && m.id)
          .map((m) => ({ id: String(m.id), name: String(m.name || m.id) }));
      }
    });
    return merged;
  }

  // Provider presets — the bundled list with each provider's popular-model
  // list refreshed from the remote providers.json (cached in storage.local).
  // Never rejects; routing data stays bundled (see mergePresets).
  async function getPresetProviders() {
    const now = Date.now();
    if (presetsMemoryCache && (now - presetsFetchedAt) < PRESETS_CACHE_TTL) {
      return presetsMemoryCache;
    }

    const api = getBrowser();
    let cached = null;
    if (api && api.storage && api.storage.local) {
      try {
        const stored = await api.storage.local.get(PRESETS_CACHE_KEY);
        cached = stored ? stored[PRESETS_CACHE_KEY] : null;
      } catch {}
    }

    if (cached && Array.isArray(cached.presets) && (now - (cached.fetchedAt || 0)) < PRESETS_CACHE_TTL) {
      presetsMemoryCache = mergePresets(cached.presets);
      presetsFetchedAt = cached.fetchedAt || now;
      return presetsMemoryCache;
    }

    try {
      const response = await fetch(PROVIDERS_URL, { cache: 'no-cache' });
      if (response.ok) {
        const data = await response.json();
        const parsed = parsePresetProviders(data);
        if (parsed) {
          presetsMemoryCache = mergePresets(parsed);
          presetsFetchedAt = now;
          if (api && api.storage && api.storage.local) {
            try {
              await api.storage.local.set({
                [PRESETS_CACHE_KEY]: { presets: parsed, fetchedAt: now, version: String(data.version || '') }
              });
            } catch {}
          }
          return presetsMemoryCache;
        }
      }
    } catch {}

    if (cached && Array.isArray(cached.presets) && cached.presets.length) {
      presetsMemoryCache = mergePresets(cached.presets);
      presetsFetchedAt = now;
      return presetsMemoryCache;
    }
    return clone(PROVIDER_PRESETS);
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
    getPresetProviders,
    parsePresetProviders,
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
