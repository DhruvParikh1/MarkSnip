const optionsState = require('../../shared/options-state');

describe('options-state helpers', () => {
const defaultOptions = {
  contextMenus: true,
  contextMenuItems: {
    downloadTab: true,
    downloadAllTabs: true,
    downloadSelection: true,
    pickElement: true,
    copySelection: true,
    copyLink: true,
    copyImage: true,
    copyTab: true,
    copyTabLink: true,
    copyAllTabLinks: true,
    copySelectedTabLinks: true,
    sendSelectionToObsidian: true,
    sendTabToObsidian: true,
    toggleIncludeTemplate: true,
    toggleDownloadImages: true
  },
  batchProcessingEnabled: true,
  includeTemplate: false,
  imagePlacement: '',
  imagePrefix: '{pageTitle}/',
  defaultExportType: 'markdown',
  defaultSendToTarget: 'chatgpt',
  sendToCustomTargets: [],
  sendToMaxUrlLength: 3600,
  webhookTargets: [],
  specialTheme: 'none',
  colorBlindTheme: 'deuteranopia',
  elementPickerEnabled: true,
  elementPickerDoneAction: 'popup',
  showUserGuideIcon: true,
  siteRules: [],
  tableFormatting: {
    stripLinks: true,
    stripFormatting: false,
    prettyPrint: true,
    centerText: true
  }
};

  test('buildExportFilename returns deterministic MarkSnip filename', () => {
    const filename = optionsState.buildExportFilename(new Date('2026-03-17T10:15:00Z'));
    expect(filename).toBe('MarkSnip-export-2026-03-17.json');
  });

  test('normalizeImportedOptions merges defaults and nested tableFormatting', () => {
    const importedOptions = {
      includeTemplate: true,
      specialTheme: 'ben10',
      colorBlindTheme: 'tritanopia',
      tableFormatting: {
        stripLinks: false
      }
    };

    const normalized = optionsState.normalizeImportedOptions(importedOptions, defaultOptions);

    expect(normalized.includeTemplate).toBe(true);
    expect(normalized.imagePlacement).toBe('sidecar');
    expect(normalized.imagePrefix).toBe('{pageTitle}/');
    expect(normalized.specialTheme).toBe('ben10');
    expect(normalized.colorBlindTheme).toBe('tritanopia');
    expect(normalized.tableFormatting).toEqual({
      stripLinks: false,
      stripFormatting: false,
      prettyPrint: true,
      centerText: true
    });
  });

  test('normalizeImportedOptions merges and sanitizes context menu item preferences', () => {
    const normalized = optionsState.normalizeImportedOptions({
      contextMenuItems: {
        downloadTab: false,
        copyLink: true,
        unknownItem: false
      }
    }, defaultOptions);

    expect(normalized.contextMenuItems.downloadTab).toBe(false);
    expect(normalized.contextMenuItems.copyLink).toBe(true);
    expect(normalized.contextMenuItems.copyImage).toBe(true);
    expect(normalized.contextMenuItems.unknownItem).toBeUndefined();
  });

  test('normalizeImportedOptions does not mutate inputs', () => {
    const importedOptions = {
      tableFormatting: {
        stripFormatting: true
      }
    };
    const importedSnapshot = JSON.parse(JSON.stringify(importedOptions));
    const defaultsSnapshot = JSON.parse(JSON.stringify(defaultOptions));

    optionsState.normalizeImportedOptions(importedOptions, defaultOptions);

    expect(importedOptions).toEqual(importedSnapshot);
    expect(defaultOptions).toEqual(defaultsSnapshot);
  });

  test('normalizeImportedOptions preserves specialTheme default when omitted', () => {
    const normalized = optionsState.normalizeImportedOptions({}, defaultOptions);
    expect(normalized.specialTheme).toBe('none');
  });

  test('normalizeImportedOptions preserves the OpenAI special theme when imported', () => {
    const normalized = optionsState.normalizeImportedOptions({ specialTheme: 'openai' }, defaultOptions);
    expect(normalized.specialTheme).toBe('openai');
  });

  test('normalizeImportedOptions preserves colorBlindTheme default when omitted', () => {
    const normalized = optionsState.normalizeImportedOptions({}, defaultOptions);
    expect(normalized.colorBlindTheme).toBe('deuteranopia');
  });

  test('normalizeImportedOptions preserves default export type when omitted', () => {
    const normalized = optionsState.normalizeImportedOptions({}, defaultOptions);
    expect(normalized.defaultExportType).toBe('markdown');
  });

  test('normalizeImportedOptions keeps copy as a valid popup primary action', () => {
    const normalized = optionsState.normalizeImportedOptions({
      defaultExportType: 'copy'
    }, defaultOptions);

    expect(normalized.defaultExportType).toBe('copy');
  });

  test('normalizeImportedOptions preserves default send target when omitted', () => {
    const normalized = optionsState.normalizeImportedOptions({}, defaultOptions);
    expect(normalized.defaultSendToTarget).toBe('chatgpt');
    expect(normalized.sendToCustomTargets).toEqual([]);
    expect(normalized.sendToMaxUrlLength).toBe(3600);
  });

  test('normalizeImportedOptions keeps valid send-to settings and sanitizes custom targets', () => {
    const normalized = optionsState.normalizeImportedOptions({
      defaultExportType: 'sendTo',
      defaultSendToTarget: 'custom-1',
      sendToCustomTargets: [
        { id: 'custom-1', name: 'Perplexity', urlTemplate: 'https://example.com/new?q={prompt}' },
        { id: 'ignored', name: '', urlTemplate: 'https://invalid.com/new?q={prompt}' },
        { id: 'ignored-2', name: 'Bad Protocol', urlTemplate: 'http://invalid.com/new?q={prompt}' }
      ]
    }, defaultOptions);

    expect(normalized.defaultExportType).toBe('sendTo');
    expect(normalized.defaultSendToTarget).toBe('custom-1');
    expect(normalized.sendToCustomTargets).toEqual([
      { id: 'custom-1', name: 'Perplexity', urlTemplate: 'https://example.com/new?q={prompt}' }
    ]);
  });

  test('normalizeImportedOptions preserves webhook URL path placeholders after saving', () => {
    const normalized = optionsState.normalizeImportedOptions({
      webhookTargets: [
        {
          id: 'notes',
          name: 'Notes',
          url: 'https://example.com/hooks/{title:kebab}',
          method: 'POST',
          headers: [],
          bodyTemplate: JSON.stringify({ content: '{content}' })
        }
      ]
    }, defaultOptions);

    expect(normalized.webhookTargets).toEqual([
      {
        id: 'notes',
        name: 'Notes',
        url: 'https://example.com/hooks/{title:kebab}',
        method: 'POST',
        headers: [],
        bodyTemplate: JSON.stringify({ content: '{content}' })
      }
    ]);
  });

  test('normalizeImportedOptions falls back to ChatGPT when the selected custom target is missing', () => {
    const normalized = optionsState.normalizeImportedOptions({
      defaultExportType: 'sendTo',
      defaultSendToTarget: 'custom-missing',
      sendToCustomTargets: []
    }, defaultOptions);

    expect(normalized.defaultSendToTarget).toBe('chatgpt');
  });

  test('normalizeImportedOptions keeps built-in Perplexity as a valid default send target', () => {
    const normalized = optionsState.normalizeImportedOptions({
      defaultExportType: 'sendTo',
      defaultSendToTarget: 'perplexity'
    }, defaultOptions);

    expect(normalized.defaultSendToTarget).toBe('perplexity');
  });

  test('normalizeImportedOptions normalizes the assistant URL length cap', () => {
    const normalized = optionsState.normalizeImportedOptions({
      sendToMaxUrlLength: '4200'
    }, defaultOptions);

    expect(normalized.sendToMaxUrlLength).toBe(4200);
  });

  test('normalizeImportedOptions falls back to the default assistant URL length cap when invalid', () => {
    const normalized = optionsState.normalizeImportedOptions({
      sendToMaxUrlLength: 0
    }, defaultOptions);

    expect(normalized.sendToMaxUrlLength).toBe(3600);
  });

  test('resetOptionKeys resets top-level and tableFormatting keys', () => {
    const currentOptions = {
      ...defaultOptions,
      includeTemplate: true,
      tableFormatting: {
        stripLinks: false,
        stripFormatting: true,
        prettyPrint: false,
        centerText: false
      }
    };

    const result = optionsState.resetOptionKeys(currentOptions, defaultOptions, [
      'includeTemplate',
      'tableFormatting.stripFormatting'
    ]);

    expect(result.options.includeTemplate).toBe(false);
    expect(result.options.tableFormatting).toEqual({
      stripLinks: false,
      stripFormatting: false,
      prettyPrint: false,
      centerText: false
    });
    expect(result.contextMenuAction).toBe('none');
  });

  test('resetOptionKeys returns context menu transition when contextMenus changes', () => {
    const currentOptions = {
      ...defaultOptions,
      contextMenus: false
    };

    const result = optionsState.resetOptionKeys(currentOptions, defaultOptions, ['contextMenus']);
    expect(result.options.contextMenus).toBe(true);
    expect(result.contextMenuAction).toBe('create');
  });

  test('normalizeImportedOptions infers legacy image placement from image prefix', () => {
    expect(optionsState.normalizeImportedOptions({ imagePrefix: '' }, defaultOptions).imagePlacement)
      .toBe('sameFolder');
    expect(optionsState.normalizeImportedOptions({ imagePrefix: 'assets/' }, defaultOptions).imagePlacement)
      .toBe('customPrefix');
    expect(optionsState.normalizeImportedOptions({ imagePlacement: 'sameFolder', imagePrefix: '{pageTitle}/' }, defaultOptions).imagePlacement)
      .toBe('sameFolder');
  });

  test('resetOptionKeys recreates context menus when item preferences change while enabled', () => {
    const currentOptions = {
      ...defaultOptions,
      contextMenuItems: {
        ...defaultOptions.contextMenuItems,
        copyImage: false
      }
    };

    const result = optionsState.resetOptionKeys(currentOptions, defaultOptions, ['contextMenuItems']);
    expect(result.options.contextMenuItems.copyImage).toBe(true);
    expect(result.contextMenuAction).toBe('create');
  });

  test('resetAllOptions returns cloned defaults and context menu transition', () => {
    const defaultsWithoutMenus = {
      ...defaultOptions,
      contextMenus: false
    };
    const currentOptions = {
      ...defaultOptions,
      contextMenus: true,
      includeTemplate: true
    };

    const result = optionsState.resetAllOptions(currentOptions, defaultsWithoutMenus);
    expect(result.options).toEqual({
      ...defaultsWithoutMenus,
      imagePlacement: 'sidecar'
    });
  expect(result.contextMenuAction).toBe('remove');
});

test('normalizeImportedOptions ignores non-plain option inputs', () => {
  const normalized = optionsState.normalizeImportedOptions('text', 123);
  expect(normalized).toEqual({
    tableFormatting: {},
    contextMenuItems: {},
    siteRules: [],
    defaultExportType: 'markdown',
    defaultSendToTarget: 'chatgpt',
    imagePlacement: 'sameFolder',
    sendToCustomTargets: [],
    sendToMaxUrlLength: 3600,
    webhookTargets: []
  });
});

test('buildExportFilename handles invalid date values', () => {
  const filename = optionsState.buildExportFilename('invalid-date', 'Custom');
  expect(filename).toMatch(/^Custom-\d{4}-\d{2}-\d{2}\.json$/);
});

test('resetOptionKeys clears tableFormatting when defaults lack that object', () => {
  const defaults = {
    ...defaultOptions,
    tableFormatting: null
  };
  const current = {
    ...defaults,
    tableFormatting: { stripLinks: false, extra: true }
  };

  const result = optionsState.resetOptionKeys(current, defaults, ['tableFormatting.stripLinks']);

  expect(result.options.tableFormatting).toEqual({ extra: true });
});

test('resetAllOptions handles non-plain defaults without blowing up', () => {
  const result = optionsState.resetAllOptions({ contextMenus: true }, null);
  expect(result.options).toEqual({
    tableFormatting: {},
    contextMenuItems: {},
    siteRules: [],
    defaultExportType: 'markdown',
    defaultSendToTarget: 'chatgpt',
    imagePlacement: 'sameFolder',
    sendToCustomTargets: [],
    sendToMaxUrlLength: 3600,
    webhookTargets: []
  });
  expect(result.contextMenuAction).toBe('remove');
});

test('resetOptionKeys resets the entire tableFormatting object to defaults', () => {
  const currentOptions = {
    ...defaultOptions,
    tableFormatting: {
      stripLinks: false,
      stripFormatting: true,
      prettyPrint: false,
      centerText: false
    }
  };

  const result = optionsState.resetOptionKeys(currentOptions, defaultOptions, ['tableFormatting']);

  expect(result.options.tableFormatting).toEqual(defaultOptions.tableFormatting);
});

test('resetOptionKeys accepts a comma-delimited string and ignores empty entries', () => {
  const result = optionsState.resetOptionKeys(
    {
      ...defaultOptions,
      includeTemplate: true,
      tableFormatting: null
    },
    defaultOptions,
    'includeTemplate, tableFormatting.stripLinks, tableFormatting.'
  );

  expect(result.options.includeTemplate).toBe(false);
  expect(result.options.tableFormatting.stripLinks).toBe(true);
});

test('normalizeImportedOptions deep-clones array values from defaults', () => {
  const defaultsWithArray = {
    ...defaultOptions,
    allowedDomains: ['example.com']
  };

  const normalized = optionsState.normalizeImportedOptions({}, defaultsWithArray);
  normalized.allowedDomains.push('docs.example.com');

  expect(defaultsWithArray.allowedDomains).toEqual(['example.com']);
});

test('resetOptionKeys resets tableFormatting block when requested', () => {
  const defaults = {
    ...defaultOptions,
    tableFormatting: {
      stripLinks: true,
      extra: true
    }
  };
  const current = {
    ...defaults,
    tableFormatting: {
      stripLinks: false,
      extra: false
    }
  };

  const result = optionsState.resetOptionKeys(current, defaults, ['tableFormatting']);

  expect(result.options.tableFormatting).toEqual(defaults.tableFormatting);
});

test('resetOptionKeys handles comma-separated strings and ignores empty keys', () => {
  const current = {
    ...defaultOptions,
    includeTemplate: true
  };

  const result = optionsState.resetOptionKeys(current, defaultOptions, 'includeTemplate,,  ');

  expect(result.options.includeTemplate).toBe(false);
  expect(result.contextMenuAction).toBe('none');
});

test('resetOptionKeys restores the popup guide icon toggle to its default', () => {
  const current = {
    ...defaultOptions,
    showUserGuideIcon: false
  };

  const result = optionsState.resetOptionKeys(current, defaultOptions, ['showUserGuideIcon']);

  expect(result.options.showUserGuideIcon).toBe(true);
  expect(result.contextMenuAction).toBe('none');
});

test('resetOptionKeys restores the batch processing toggle to its default', () => {
  const current = {
    ...defaultOptions,
    batchProcessingEnabled: false
  };

  const result = optionsState.resetOptionKeys(current, defaultOptions, ['batchProcessingEnabled']);

  expect(result.options.batchProcessingEnabled).toBe(true);
  expect(result.contextMenuAction).toBe('none');
});

test('resetOptionKeys restores the element picker toggle to its default', () => {
  const current = {
    ...defaultOptions,
    elementPickerEnabled: false
  };

  const result = optionsState.resetOptionKeys(current, defaultOptions, ['elementPickerEnabled']);

  expect(result.options.elementPickerEnabled).toBe(true);
  expect(result.contextMenuAction).toBe('none');
});

test('resetOptionKeys restores the element picker done action to its default', () => {
  const current = {
    ...defaultOptions,
    elementPickerDoneAction: 'copy'
  };

  const result = optionsState.resetOptionKeys(current, defaultOptions, ['elementPickerDoneAction']);

  expect(result.options.elementPickerDoneAction).toBe('popup');
  expect(result.contextMenuAction).toBe('none');
});

test('resetOptionKeys ignores empty tableFormatting target entries', () => {
  const result = optionsState.resetOptionKeys(defaultOptions, defaultOptions, ['tableFormatting.']);

  expect(result.options.tableFormatting).toEqual(defaultOptions.tableFormatting);
});

test('normalizeImportedOptions clones array fields', () => {
  const defaults = {
    ...defaultOptions,
    list: [1, 2],
    tableFormatting: {}
  };

  const normalized = optionsState.normalizeImportedOptions({ list: [3, 4] }, defaults);

  expect(normalized.list).toEqual([3, 4]);
  normalized.list.push(5);
  expect(defaults.list).toEqual([1, 2]);
});

test('normalizeImportedOptions sanitizes and clones siteRules', () => {
  const normalized = optionsState.normalizeImportedOptions({
    siteRules: [
      {
        pattern: 'example.com/*',
        overrides: {
          includeTemplate: true,
          rogue: true
        }
      }
    ]
  }, defaultOptions);

  expect(normalized.siteRules).toHaveLength(1);
  expect(normalized.siteRules[0].overrides).toEqual({
    includeTemplate: true
  });

  normalized.siteRules[0].name = 'changed';
  expect(defaultOptions.siteRules).toEqual([]);
});

test('resetOptionKeys restores siteRules to defaults', () => {
  const current = {
    ...defaultOptions,
    siteRules: [
      {
        id: 'rule-1',
        name: 'Docs',
        enabled: true,
        pattern: 'docs.example.com/*',
        overrides: {
          title: 'Docs/{pageTitle}'
        }
      }
    ]
  };

  const result = optionsState.resetOptionKeys(current, defaultOptions, ['siteRules']);

  expect(result.options.siteRules).toEqual([]);
  expect(result.contextMenuAction).toBe('none');
});
	});
