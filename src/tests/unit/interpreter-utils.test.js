const interpreter = require('../../shared/interpreter-utils');

function createStorageArea(initial = {}) {
  const data = { ...initial };
  return {
    data,
    get: jest.fn(async (key) => {
      if (Array.isArray(key)) {
        return key.reduce((result, item) => {
          result[item] = data[item];
          return result;
        }, {});
      }
      if (typeof key === 'string') {
        return { [key]: data[key] };
      }
      if (key && typeof key === 'object') {
        return Object.keys(key).reduce((result, item) => {
          result[item] = data[item] === undefined ? key[item] : data[item];
          return result;
        }, {});
      }
      return { ...data };
    }),
    set: jest.fn(async (value) => {
      Object.assign(data, value);
    })
  };
}

describe('interpreter-utils', () => {
  afterEach(() => {
    delete global.browser;
    delete global.chrome;
    delete global.fetch;
  });

  describe('collectPromptVariables', () => {
    test('finds placeholders and assigns sequential keys', () => {
      const vars = interpreter.collectPromptVariables('a {{prompt:"sum"}} b {{"tags"}} c');
      expect(vars).toEqual([
        { key: 'prompt_1', prompt: 'sum', filters: '' },
        { key: 'prompt_2', prompt: 'tags', filters: '' }
      ]);
    });

    test('dedupes by prompt text across multiple source strings', () => {
      const vars = interpreter.collectPromptVariables(
        'title {{prompt:"sum"}}',
        'body {{prompt:"sum"|kebab}} and {{prompt:"sum"|uppercase}}'
      );
      expect(vars).toHaveLength(1);
      expect(vars[0].key).toBe('prompt_1');
      expect(vars[0].prompt).toBe('sum');
    });

    test('returns an empty array when there are no placeholders', () => {
      expect(interpreter.collectPromptVariables('no placeholders {here}')).toEqual([]);
    });

    test('hasPromptPlaceholders detects placeholders', () => {
      expect(interpreter.hasPromptPlaceholders('x {{prompt:"y"}}')).toBe(true);
      expect(interpreter.hasPromptPlaceholders('x {y}')).toBe(false);
    });
  });

  describe('buildLLMRequest', () => {
    const promptVariables = [{ key: 'prompt_1', prompt: 'Summarize', filters: '' }];

    test('builds an Anthropic request', () => {
      const provider = { id: 'anthropic', family: 'anthropic', baseUrl: 'https://api.anthropic.com/v1/messages', apiKey: 'sk-ant' };
      const model = { providerModelId: 'claude-haiku-4-5' };
      const req = interpreter.buildLLMRequest({ provider, model, promptContext: 'CTX', promptVariables });

      expect(req.url).toBe('https://api.anthropic.com/v1/messages');
      expect(req.headers['x-api-key']).toBe('sk-ant');
      expect(req.headers['anthropic-version']).toBe('2023-06-01');
      expect(req.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
      expect(req.body.system).toEqual(expect.any(String));
      expect(req.body.model).toBe('claude-haiku-4-5');
      expect(req.body.max_tokens).toBe(1600);
      expect(req.body.messages).toHaveLength(2);
    });

    test('builds an Ollama request with json format and no auth header', () => {
      const provider = { id: 'ollama', family: 'ollama', baseUrl: 'http://127.0.0.1:11434/api/chat', apiKey: '' };
      const model = { providerModelId: 'llama3.2' };
      const req = interpreter.buildLLMRequest({ provider, model, promptContext: 'CTX', promptVariables });

      expect(req.body.format).toBe('json');
      expect(req.body.stream).toBe(false);
      expect(req.headers.Authorization).toBeUndefined();
      expect(req.headers['x-api-key']).toBeUndefined();
      expect(req.body.messages[0].role).toBe('system');
    });

    test('builds an OpenAI-compatible request with bearer auth', () => {
      const provider = { id: 'openai', family: 'openai', baseUrl: 'https://api.openai.com/v1/chat/completions', apiKey: 'sk-oai' };
      const model = { providerModelId: 'gpt-4o-mini' };
      const req = interpreter.buildLLMRequest({ provider, model, promptContext: 'CTX', promptVariables });

      expect(req.headers.Authorization).toBe('Bearer sk-oai');
      expect(req.headers['HTTP-Referer']).toBeUndefined();
      expect(req.body.messages).toHaveLength(3);
    });

    test('omits the Authorization header for a no-key OpenAI-compatible provider', () => {
      const provider = { id: 'local', family: 'openai', baseUrl: 'http://localhost:1234/v1/chat/completions', apiKey: '' };
      const model = { providerModelId: 'local-model' };
      const req = interpreter.buildLLMRequest({ provider, model, promptContext: 'CTX', promptVariables });

      expect(req.headers.Authorization).toBeUndefined();
    });

    test('adds OpenRouter attribution headers', () => {
      const provider = { id: 'openrouter', family: 'openai', baseUrl: 'https://openrouter.ai/api/v1/chat/completions', apiKey: 'sk-or' };
      const model = { providerModelId: 'meta-llama/llama-3.2-3b-instruct' };
      const req = interpreter.buildLLMRequest({ provider, model, promptContext: 'CTX', promptVariables });

      expect(req.headers['HTTP-Referer']).toEqual(expect.any(String));
      expect(req.headers['X-Title']).toBe('MarkSnip');
    });

    test('builds an Azure request with the selected deployment in the URL', () => {
      const provider = { id: 'azure-openai', family: 'azure', baseUrl: 'https://x.openai.azure.com/openai/deployments/{deployment-id}/chat/completions?api-version=2024-10-21', apiKey: 'az-key' };
      const model = { providerModelId: 'gpt-4o-prod' };
      const req = interpreter.buildLLMRequest({ provider, model, promptContext: 'CTX', promptVariables });

      expect(req.url).toBe('https://x.openai.azure.com/openai/deployments/gpt-4o-prod/chat/completions?api-version=2024-10-21');
      expect(req.headers['api-key']).toBe('az-key');
      expect(req.headers.Authorization).toBeUndefined();
      expect(req.body.model).toBeUndefined();
      expect(req.body.messages).toHaveLength(3);
    });

    test('builds a Hugging Face request, substituting {model-id} in the URL', () => {
      const provider = { id: 'huggingface', family: 'huggingface', baseUrl: 'https://api-inference.huggingface.co/models/{model-id}/chat/completions', apiKey: 'hf-key' };
      const model = { providerModelId: 'meta-llama/Llama-3' };
      const req = interpreter.buildLLMRequest({ provider, model, promptContext: 'CTX', promptVariables });

      expect(req.url).toBe('https://api-inference.huggingface.co/models/meta-llama/Llama-3/chat/completions');
      expect(req.headers.Authorization).toBe('Bearer hf-key');
      expect(req.body.model).toBe('meta-llama/Llama-3');
    });
  });

  describe('parseLLMResponse', () => {
    const promptVariables = [
      { key: 'prompt_1', prompt: 'a' },
      { key: 'prompt_2', prompt: 'b' }
    ];

    test('parses a clean prompts_responses object', () => {
      const raw = JSON.stringify({ prompts_responses: { prompt_1: 'tag1, tag2', prompt_2: 'summary' } });
      const { promptResponses } = interpreter.parseLLMResponse(raw, promptVariables);

      expect(promptResponses).toHaveLength(2);
      expect(promptResponses[0]).toEqual({ key: 'prompt_1', prompt: 'a', user_response: 'tag1, tag2' });
      expect(promptResponses[1].user_response).toBe('summary');
    });

    test('extracts JSON embedded in surrounding prose', () => {
      const raw = 'Sure! Here is the result:\n{"prompts_responses":{"prompt_1":"x","prompt_2":"y"}}\nHope that helps.';
      const { promptResponses } = interpreter.parseLLMResponse(raw, promptVariables);
      expect(promptResponses[0].user_response).toBe('x');
      expect(promptResponses[1].user_response).toBe('y');
    });

    test('returns empty responses for unparseable output', () => {
      const { promptResponses } = interpreter.parseLLMResponse('not json at all', promptVariables);
      expect(promptResponses).toEqual([]);
    });
  });

  describe('extractLLMContent', () => {
    test('reads Anthropic content', () => {
      const data = { content: [{ text: '{"prompts_responses":{"prompt_1":"hi"}}' }] };
      expect(interpreter.extractLLMContent({ family: 'anthropic' }, data)).toContain('prompts_responses');
    });

    test('reads OpenAI content', () => {
      const data = { choices: [{ message: { content: 'hello' } }] };
      expect(interpreter.extractLLMContent({ family: 'openai' }, data)).toBe('hello');
    });

    test('reads Ollama content', () => {
      const data = { message: { content: 'world' } };
      expect(interpreter.extractLLMContent({ family: 'ollama' }, data)).toBe('world');
    });
  });

  describe('replacePromptVariables', () => {
    test('substitutes a plain placeholder', () => {
      const result = interpreter.replacePromptVariables(
        'tags: {{prompt:"t"}}',
        [{ key: 'prompt_1', prompt: 't' }],
        [{ key: 'prompt_1', user_response: 'one, two' }]
      );
      expect(result).toBe('tags: one, two');
    });

    test('applies a single filter', () => {
      const result = interpreter.replacePromptVariables(
        '{{prompt:"t"|kebab}}',
        [{ key: 'prompt_1', prompt: 't' }],
        [{ key: 'prompt_1', user_response: 'Hello World' }]
      );
      expect(result).toBe('hello-world');
    });

    test('applies a chained filter', () => {
      const result = interpreter.replacePromptVariables(
        '{{prompt:"t"|kebab|uppercase}}',
        [{ key: 'prompt_1', prompt: 't' }],
        [{ key: 'prompt_1', user_response: 'Hello World' }]
      );
      expect(result).toBe('HELLO-WORLD');
    });

    test('skips unknown filters without throwing', () => {
      const result = interpreter.replacePromptVariables(
        '{{prompt:"t"|bogus}}',
        [{ key: 'prompt_1', prompt: 't' }],
        [{ key: 'prompt_1', user_response: 'Hello World' }]
      );
      expect(result).toBe('Hello World');
    });

    test('applies per-placeholder filters when one prompt is reused with different filters', () => {
      const template = '{{prompt:"tag"|kebab}} / {{prompt:"tag"|uppercase}}';
      const variables = interpreter.collectPromptVariables(template);
      const responses = [{ key: 'prompt_1', user_response: 'Hello World' }];
      const result = interpreter.replacePromptVariables(template, variables, responses);
      expect(result).toBe('hello-world / HELLO WORLD');
    });

    test('leaves a placeholder intact when there is no matching response', () => {
      const result = interpreter.replacePromptVariables(
        '{{prompt:"t"}}',
        [{ key: 'prompt_1', prompt: 't' }],
        []
      );
      expect(result).toBe('{{prompt:"t"}}');
    });
  });

  describe('normalizeInterpreterConfig', () => {
    test('returns an empty config for null input (nothing is auto-seeded)', () => {
      const config = interpreter.normalizeInterpreterConfig(null);
      expect(config).toEqual({ providers: [], models: [] });
    });

    test('DEFAULT_INTERPRETER_CONFIG is empty', () => {
      expect(interpreter.DEFAULT_INTERPRETER_CONFIG.providers).toEqual([]);
      expect(interpreter.DEFAULT_INTERPRETER_CONFIG.models).toEqual([]);
    });

    test('does not re-seed providers or models for an empty stored config', () => {
      const config = interpreter.normalizeInterpreterConfig({ providers: [], models: [] });
      expect(config.providers).toEqual([]);
      expect(config.models).toEqual([]);
    });

    test('keeps valid stored providers and models', () => {
      const config = interpreter.normalizeInterpreterConfig({
        providers: [{ id: 'p1', name: 'P1', family: 'openai', baseUrl: 'u', apiKey: 'k', apiKeyRequired: true }],
        models: [{ id: 'm1', providerId: 'p1', providerModelId: 'gpt-x', name: 'gpt-x', enabled: true }]
      });
      expect(config.providers).toHaveLength(1);
      expect(config.models).toHaveLength(1);
    });

    test('drops models whose provider cannot be resolved', () => {
      const config = interpreter.normalizeInterpreterConfig({
        providers: [{ id: 'p1', name: 'P1', family: 'anthropic', baseUrl: 'u', apiKey: '', apiKeyRequired: true }],
        models: [
          { id: 'm1', providerId: 'p1', providerModelId: 'claude', name: 'Claude', enabled: true },
          { id: 'm2', providerId: 'ghost-provider', providerModelId: 'x', name: 'Orphan', enabled: true }
        ]
      });
      const modelIds = config.models.map((m) => m.id);
      expect(modelIds).toContain('m1');
      expect(modelIds).not.toContain('m2');
    });

    test('coerces an unknown provider family to openai', () => {
      const config = interpreter.normalizeInterpreterConfig({
        providers: [{ id: 'custom', name: 'Custom', family: 'weird', baseUrl: 'u', apiKey: '', apiKeyRequired: true }],
        models: []
      });
      const custom = config.providers.find((p) => p.id === 'custom');
      expect(custom.family).toBe('openai');
    });

    test('keeps the azure and huggingface provider families', () => {
      const config = interpreter.normalizeInterpreterConfig({
        providers: [
          { id: 'a', name: 'A', family: 'azure', baseUrl: 'u', apiKey: '', apiKeyRequired: true },
          { id: 'h', name: 'H', family: 'huggingface', baseUrl: 'u', apiKey: '', apiKeyRequired: true }
        ],
        models: []
      });
      expect(config.providers.find((p) => p.id === 'a').family).toBe('azure');
      expect(config.providers.find((p) => p.id === 'h').family).toBe('huggingface');
    });
  });

  describe('provider presets', () => {
    test('Gemini preset uses the OpenAI-compatible endpoint path', () => {
      const gemini = interpreter.PROVIDER_PRESETS.find((p) => p.id === 'google-gemini');
      expect(gemini.baseUrl).toContain('/openai/');
    });

    test('getPresetProviders does not fetch a remote provider catalog', async () => {
      global.fetch = jest.fn();

      const presets = await interpreter.getPresetProviders();

      expect(presets.length).toBeGreaterThan(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('sanitizeProviderPresets drops invalid model IDs and caps model labels', () => {
      const longName = 'A'.repeat(300);
      const presets = interpreter.sanitizeProviderPresets([
        {
          id: 'openai',
          name: 'OpenAI',
          family: 'openai',
          baseUrl: 'https://api.openai.com/v1/chat/completions',
          popularModels: [
            { id: 'valid-model', name: longName },
            { id: 'bad\u0001model', name: 'Bad' },
            { id: '', name: 'Empty' }
          ]
        }
      ]);

      expect(presets[0].popularModels).toHaveLength(1);
      expect(presets[0].popularModels[0].id).toBe('valid-model');
      expect(presets[0].popularModels[0].name).toHaveLength(160);
    });
  });

  describe('interpreter API key storage', () => {
    test('saves API keys to session storage by default and strips local config', async () => {
      const local = createStorageArea();
      const session = createStorageArea();
      global.browser = { storage: { local, session } };

      await interpreter.saveInterpreterConfig({
        providers: [{ id: 'p1', name: 'P1', family: 'openai', baseUrl: 'https://api.example.com', apiKey: 'sk-session', apiKeyRequired: true }],
        models: []
      });

      expect(local.data[interpreter.INTERPRETER_STORAGE_KEY].providers[0].apiKey).toBe('');
      expect(local.data[interpreter.INTERPRETER_KEYS_STORAGE_KEY]).toEqual({});
      expect(session.data[interpreter.INTERPRETER_KEYS_STORAGE_KEY]).toEqual({ p1: 'sk-session' });

      const loaded = await interpreter.loadInterpreterConfig();
      expect(loaded.providers[0].apiKey).toBe('sk-session');
      expect(loaded.providers[0].rememberApiKey).toBe(false);
    });

    test('saves remembered API keys to the local key store', async () => {
      const local = createStorageArea();
      const session = createStorageArea();
      global.browser = { storage: { local, session } };

      await interpreter.saveInterpreterConfig({
        providers: [{ id: 'p1', name: 'P1', family: 'openai', baseUrl: 'https://api.example.com', apiKey: 'sk-local', apiKeyRequired: true, rememberApiKey: true }],
        models: []
      });

      expect(local.data[interpreter.INTERPRETER_STORAGE_KEY].providers[0].apiKey).toBe('');
      expect(local.data[interpreter.INTERPRETER_STORAGE_KEY].providers[0].rememberApiKey).toBe(true);
      expect(local.data[interpreter.INTERPRETER_KEYS_STORAGE_KEY]).toEqual({ p1: 'sk-local' });
      expect(session.data[interpreter.INTERPRETER_KEYS_STORAGE_KEY]).toEqual({});
    });

    test('migrates legacy plaintext config keys into session storage on load', async () => {
      const local = createStorageArea({
        [interpreter.INTERPRETER_STORAGE_KEY]: {
          providers: [{ id: 'p1', name: 'P1', family: 'openai', baseUrl: 'https://api.example.com', apiKey: 'sk-legacy', apiKeyRequired: true }],
          models: []
        }
      });
      const session = createStorageArea();
      global.browser = { storage: { local, session } };

      const loaded = await interpreter.loadInterpreterConfig();

      expect(loaded.providers[0].apiKey).toBe('sk-legacy');
      expect(session.data[interpreter.INTERPRETER_KEYS_STORAGE_KEY]).toEqual({ p1: 'sk-legacy' });
      expect(local.data[interpreter.INTERPRETER_STORAGE_KEY].providers[0].apiKey).toBe('');
    });

    test('requires remember opt-in when session storage is unavailable', async () => {
      const local = createStorageArea();
      global.browser = { storage: { local } };

      await expect(interpreter.saveInterpreterConfig({
        providers: [{ id: 'p1', name: 'P1', family: 'openai', baseUrl: 'https://api.example.com', apiKey: 'sk-session', apiKeyRequired: true }],
        models: []
      })).rejects.toThrow(/Session storage is unavailable/);

      await interpreter.saveInterpreterConfig({
        providers: [{ id: 'p1', name: 'P1', family: 'openai', baseUrl: 'https://api.example.com', apiKey: 'sk-local', apiKeyRequired: true, rememberApiKey: true }],
        models: []
      });
      expect(local.data[interpreter.INTERPRETER_KEYS_STORAGE_KEY]).toEqual({ p1: 'sk-local' });
    });
  });
});
