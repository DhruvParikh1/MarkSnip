const interpreter = require('../../shared/interpreter-utils');

describe('interpreter-utils', () => {
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
    test('returns the seeded defaults for null input', () => {
      const config = interpreter.normalizeInterpreterConfig(null);
      expect(config.providers).toHaveLength(interpreter.PROVIDER_PRESETS.length);
      expect(config.models.length).toBeGreaterThan(0);
    });

    test('re-merges missing seeded providers', () => {
      const config = interpreter.normalizeInterpreterConfig({ providers: [], models: [] });
      const ids = config.providers.map((p) => p.id);
      interpreter.PROVIDER_PRESETS.forEach((preset) => {
        expect(ids).toContain(preset.id);
      });
    });

    test('drops models whose provider cannot be resolved', () => {
      const config = interpreter.normalizeInterpreterConfig({
        providers: [{ id: 'anthropic', name: 'Anthropic', family: 'anthropic', baseUrl: 'u', apiKey: '', apiKeyRequired: true }],
        models: [
          { id: 'm1', providerId: 'anthropic', providerModelId: 'claude', name: 'Claude', enabled: true },
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

    test('respects an explicitly empty models array (no reseeding)', () => {
      const config = interpreter.normalizeInterpreterConfig({ providers: [], models: [] });
      expect(config.models).toEqual([]);
    });

    test('seeds models when the models key is absent (incomplete config)', () => {
      const config = interpreter.normalizeInterpreterConfig({ providers: [] });
      expect(config.models.length).toBeGreaterThan(0);
    });
  });

  describe('provider presets', () => {
    test('Gemini preset uses the OpenAI-compatible endpoint path', () => {
      const gemini = interpreter.PROVIDER_PRESETS.find((p) => p.id === 'google-gemini');
      expect(gemini.baseUrl).toContain('/openai/');
    });
  });
});
