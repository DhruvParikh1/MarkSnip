// create the context menus
function contextMenuMessage(key, substitutions, fallback) {
  return globalThis.markSnipI18n?.t(key, substitutions, fallback) || fallback || key;
}

function contextMenuI18nReady() {
  return globalThis.markSnipI18n?.ready?.().catch(() => {}) || Promise.resolve();
}

function isPlainContextMenuObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function getContextMenuItems(options) {
  const defaults = isPlainContextMenuObject(globalThis.defaultOptions?.contextMenuItems)
    ? globalThis.defaultOptions.contextMenuItems
    : {};
  const stored = isPlainContextMenuObject(options?.contextMenuItems)
    ? options.contextMenuItems
    : {};

  const keys = new Set([...Object.keys(defaults), ...Object.keys(stored)]);
  return Array.from(keys).reduce((items, key) => {
    items[key] = Object.prototype.hasOwnProperty.call(stored, key)
      ? stored[key] !== false
      : defaults[key] !== false;
    return items;
  }, {});
}

function shouldCreateContextMenuItem(definition, options, contextMenuItems) {
  if (!definition?.key || contextMenuItems[definition.key] === false) {
    return false;
  }
  if (typeof definition.enabledWhen === 'function' && !definition.enabledWhen(options)) {
    return false;
  }
  return true;
}

function createContextMenuItem(definition, options) {
  browser.contextMenus.create(definition.getProps(options), () => {});
}

function createContextMenuGroups(groups, options, contextMenuItems, separatorPrefix, separatorContexts = ["all"]) {
  let renderedGroups = 0;
  groups.forEach((group) => {
    const visibleItems = group.filter((definition) => (
      shouldCreateContextMenuItem(definition, options, contextMenuItems)
    ));
    if (!visibleItems.length) {
      return;
    }

    if (renderedGroups > 0) {
      browser.contextMenus.create({
        id: `${separatorPrefix}-${renderedGroups}`,
        type: "separator",
        contexts: separatorContexts
      }, () => {});
    }

    visibleItems.forEach((definition) => createContextMenuItem(definition, options));
    renderedGroups += 1;
  });
}

const CONTEXT_MENU_TAB_GROUPS = [
  [
    {
      key: "downloadTab",
      getProps: () => ({
        id: "download-markdown-tab",
        title: contextMenuMessage("contextDownloadTab", null, "Download Tab as Markdown"),
        contexts: ["tab"]
      })
    },
    {
      key: "downloadAllTabs",
      getProps: () => ({
        id: "tab-download-markdown-alltabs",
        title: contextMenuMessage("contextDownloadAllTabs", null, "Download All Tabs as Markdown"),
        contexts: ["tab"]
      })
    },
    {
      key: "copyTabLink",
      getProps: () => ({
        id: "copy-tab-as-markdown-link-tab",
        title: contextMenuMessage("contextCopyTabLink", null, "Copy Tab URL as Markdown Link"),
        contexts: ["tab"]
      })
    },
    {
      key: "copyAllTabLinks",
      getProps: () => ({
        id: "copy-tab-as-markdown-link-all-tab",
        title: contextMenuMessage("contextCopyAllTabLinks", null, "Copy All Tab URLs as Markdown Link List"),
        contexts: ["tab"]
      })
    },
    {
      key: "copySelectedTabLinks",
      getProps: () => ({
        id: "copy-tab-as-markdown-link-selected-tab",
        title: contextMenuMessage("contextCopySelectedTabLinks", null, "Copy Selected Tab URLs as Markdown Link List"),
        contexts: ["tab"]
      })
    }
  ],
  [
    {
      key: "toggleIncludeTemplate",
      getProps: (options) => ({
        id: "tabtoggle-includeTemplate",
        type: "checkbox",
        title: contextMenuMessage("contextToggleTemplate", null, "Include front/back template"),
        contexts: ["tab"],
        checked: options.includeTemplate
      })
    },
    {
      key: "toggleDownloadImages",
      getProps: (options) => ({
        id: "tabtoggle-downloadImages",
        type: "checkbox",
        title: contextMenuMessage("contextToggleImages", null, "Download Images"),
        contexts: ["tab"],
        checked: options.downloadImages
      })
    }
  ]
];

const CONTEXT_MENU_PAGE_GROUPS = [
  [
    {
      key: "downloadAllTabs",
      getProps: () => ({
        id: "download-markdown-alltabs",
        title: contextMenuMessage("contextDownloadAllTabs", null, "Download All Tabs as Markdown"),
        contexts: ["all"]
      })
    }
  ],
  [
    {
      key: "downloadSelection",
      getProps: () => ({
        id: "download-markdown-selection",
        title: contextMenuMessage("contextDownloadSelection", null, "Download Selection As Markdown"),
        contexts: ["selection"]
      })
    },
    {
      key: "downloadTab",
      getProps: () => ({
        id: "download-markdown-all",
        title: contextMenuMessage("contextDownloadTab", null, "Download Tab As Markdown"),
        contexts: ["all"]
      })
    },
    {
      key: "pickElement",
      enabledWhen: (options) => options.elementPickerEnabled !== false,
      getProps: () => ({
        id: "pick-element-markdown",
        title: contextMenuMessage("contextPickElement", null, "Pick Element for Markdown"),
        contexts: ["all"]
      })
    },
    {
      key: "toggleHighlighter",
      enabledWhen: (options) => options.highlighterEnabled !== false,
      getProps: () => ({
        id: "toggle-highlighter",
        title: contextMenuMessage("contextToggleHighlighter", null, "Toggle Highlighter"),
        contexts: ["all"]
      })
    },
    {
      key: "highlightSelection",
      enabledWhen: (options) => options.highlighterEnabled !== false,
      getProps: () => ({
        id: "highlight-selection",
        title: contextMenuMessage("contextHighlightSelection", null, "Highlight Selection"),
        contexts: ["selection"]
      })
    },
    {
      key: "openHighlights",
      enabledWhen: (options) => options.highlighterEnabled !== false,
      getProps: () => ({
        id: "open-highlights",
        title: contextMenuMessage("contextOpenHighlights", null, "Open Highlights"),
        contexts: ["all"]
      })
    }
  ],
  [
    {
      key: "copySelection",
      getProps: () => ({
        id: "copy-markdown-selection",
        title: contextMenuMessage("contextCopySelection", null, "Copy Selection As Markdown"),
        contexts: ["selection"]
      })
    },
    {
      key: "copyLink",
      getProps: () => ({
        id: "copy-markdown-link",
        title: contextMenuMessage("contextCopyLink", null, "Copy Link As Markdown"),
        contexts: ["link"]
      })
    },
    {
      key: "copyImage",
      getProps: () => ({
        id: "copy-markdown-image",
        title: contextMenuMessage("contextCopyImage", null, "Copy Image As Markdown"),
        contexts: ["image"]
      })
    },
    {
      key: "copyTab",
      getProps: () => ({
        id: "copy-markdown-all",
        title: contextMenuMessage("contextCopyTab", null, "Copy Tab As Markdown"),
        contexts: ["all"]
      })
    },
    {
      key: "copyTabLink",
      getProps: () => ({
        id: "copy-tab-as-markdown-link",
        title: contextMenuMessage("contextCopyTabLink", null, "Copy Tab URL as Markdown Link"),
        contexts: ["all"]
      })
    },
    {
      key: "copyAllTabLinks",
      getProps: () => ({
        id: "copy-tab-as-markdown-link-all",
        title: contextMenuMessage("contextCopyAllTabLinks", null, "Copy All Tab URLs as Markdown Link List"),
        contexts: ["all"]
      })
    },
    {
      key: "copySelectedTabLinks",
      getProps: () => ({
        id: "copy-tab-as-markdown-link-selected",
        title: contextMenuMessage("contextCopySelectedTabLinks", null, "Copy Selected Tab URLs as Markdown Link List"),
        contexts: ["all"]
      })
    }
  ],
  [
    {
      key: "sendSelectionToObsidian",
      enabledWhen: (options) => options.obsidianIntegration,
      getProps: () => ({
        id: "copy-markdown-obsidian",
        title: contextMenuMessage("contextSendSelectionObsidian", null, "Send Text selection to Obsidian"),
        contexts: ["selection"]
      })
    },
    {
      key: "sendTabToObsidian",
      enabledWhen: (options) => options.obsidianIntegration,
      getProps: () => ({
        id: "copy-markdown-obsall",
        title: contextMenuMessage("contextSendTabObsidian", null, "Send Tab to Obsidian"),
        contexts: ["all"]
      })
    }
  ],
  [
    {
      key: "toggleIncludeTemplate",
      getProps: (options) => ({
        id: "toggle-includeTemplate",
        type: "checkbox",
        title: contextMenuMessage("contextToggleTemplate", null, "Include front/back template"),
        contexts: ["all"],
        checked: options.includeTemplate
      })
    },
    {
      key: "toggleDownloadImages",
      getProps: (options) => ({
        id: "toggle-downloadImages",
        type: "checkbox",
        title: contextMenuMessage("contextToggleImages", null, "Download Images"),
        contexts: ["all"],
        checked: options.downloadImages
      })
    }
  ]
];

async function createMenus() {
  await contextMenuI18nReady();
  const options = await getOptions();
  const contextMenuItems = getContextMenuItems(options);

  browser.contextMenus.removeAll();

  if (options.contextMenus) {
    // tab menu (chrome does not support this)
    try {
      createContextMenuGroups(CONTEXT_MENU_TAB_GROUPS, options, contextMenuItems, "tab-separator", ["tab"]);
    } catch {

    }

    createContextMenuGroups(CONTEXT_MENU_PAGE_GROUPS, options, contextMenuItems, "separator");
  }
}
