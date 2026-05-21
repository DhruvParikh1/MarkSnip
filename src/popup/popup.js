
// default variables
var imageList = null;
var sourceImageMap = null;
var mdClipsFolder = '';
let librarySettings = null;
let libraryItems = [];
let currentClipState = {
    title: '',
    markdown: '',
    pageUrl: '',
    excerpt: '',
    byline: '',
    keywords: [],
    publishedTime: ''
};
let libraryExportInProgress = false;
let libraryCardCountMode = 'words';
const autoSavedLibraryUrls = new Set();
let agentBridgeClipPersistTimeout = null;
let cm = null;
let editorInitPromise = null;
let pendingEditorValue = '';
let pendingEditorRefresh = false;
let notificationHostLoadPromise = null;
let libraryStateLoadPromise = null;
let libraryStateLoaded = false;
let batchSettingsLoadPromise = null;
let batchSettingsLoaded = false;
// Batch Processing redesign state
let batchCaptureMethod = 'manual';   // manual | pick | click
let batchOutputFormat = 'zip';       // zip | individual | combined
let batchPickedLinks = [];           // array of URL strings collected via the link picker
let batchManualValidCount = 0;       // valid URLs in the manual textarea (drives Start button)
let activeTabPromise = null;
let activeTabCache = null;
let currentOptions = null;
let activeSiteRuleState = {
    matchedRule: null,
    overriddenKeys: [],
    effectiveOptions: null
};
let deferredStartupScheduled = false;
let deferredLibraryWarmupScheduled = false;
let previewActive = false;
let markedLoadPromise = null;
let printStylesPromise = null;
let themeTransitionCleanupTimer = null;
let themeTransitionPendingLink = null;
let themeTransitionPendingHandler = null;
let hasAppliedThemeSettings = false;
let lastResolvedThemeName = null;
let lastResolvedDarkMode = null;
const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const POPUP_VIEW_TRANSITION_MS = 180;
const POPUP_THEME_CACHE_KEY = 'marksnip-popup-theme-cache-v1';
const THEME_TRANSITION_FALLBACK_MS = 220;
const ELEMENT_PICKER_RESULT_STORAGE_KEY = 'elementPickerResult';
const ELEMENT_PICKER_RESULT_MAX_AGE_MS = 10 * 60 * 1000;
const countUtils = globalThis.markSnipCountUtils;
const COUNT_MODES = Array.isArray(countUtils?.COUNT_MODES) && countUtils.COUNT_MODES.length > 0
    ? countUtils.COUNT_MODES
    : ['chars', 'words', 'minRead', 'tokens'];
let lastRenderedLibraryStateKey = '';
const SPECIAL_THEME_CLASS_NAMES = ['special-theme-claude', 'special-theme-perplexity', 'special-theme-openai', 'special-theme-atla', 'special-theme-ben10', 'special-theme-colorblind'];
const COLORBLIND_VARIANT_CLASS_NAMES = ['colorblind-theme-deuteranopia', 'colorblind-theme-protanopia', 'colorblind-theme-tritanopia'];
const ACCENT_CLASS_NAMES = ['accent-sage', 'accent-ocean', 'accent-slate', 'accent-rose', 'accent-amber'];
const DEFAULT_SEND_TO_TARGET = 'chatgpt';
const DEFAULT_SEND_TO_MAX_URL_LENGTH = 3600;
const POPUP_PRIMARY_ACTION_SET = new Set(['markdown', 'text', 'html', 'pdf', 'copy', 'sendTo']);
const WEBHOOK_EXPORT_PREFIX = 'webhook:';

function isWebhookExportType(value) {
  return String(value || '').startsWith(WEBHOOK_EXPORT_PREFIX);
}

function getWebhookTargetIdFromExportType(value) {
  return String(value || '').startsWith(WEBHOOK_EXPORT_PREFIX)
    ? String(value).slice(WEBHOOK_EXPORT_PREFIX.length)
    : null;
}
const EXPORT_TYPE_ORDER = ['markdown', 'text', 'html', 'pdf'];
const EXPORT_TYPE_SET = new Set(EXPORT_TYPE_ORDER);
const SEND_TO_TARGETS = {
    chatgpt: {
        id: 'chatgpt',
        label: 'ChatGPT',
        urlTemplate: 'https://chatgpt.com/?q={prompt}',
        fallbackUrl: 'https://chatgpt.com/',
        iconKey: 'assistantChatgpt'
    },
    claude: {
        id: 'claude',
        label: 'Claude',
        urlTemplate: 'https://claude.ai/new?q={prompt}',
        fallbackUrl: 'https://claude.ai/new',
        iconKey: 'assistantClaude'
    },
    perplexity: {
        id: 'perplexity',
        label: 'Perplexity',
        urlTemplate: 'https://perplexity.ai/search/new?q={prompt}',
        fallbackUrl: 'https://perplexity.ai/search/new',
        iconKey: 'assistantPerplexity'
    }
};
const EXPORT_BUTTON_ICONS = {
    download: `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
    `,
    file: `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="9" y1="13" x2="15" y2="13"/>
            <line x1="9" y1="17" x2="15" y2="17"/>
        </svg>
    `,
    send: `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2 11 13"/>
            <path d="m22 2-7 20-4-9-9-4Z"/>
        </svg>
    `,
    copy: `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
    `,
    assistantChatgpt: `
        <svg class="assistant-icon assistant-icon--chatgpt" width="16" height="16" viewBox="0 0 721 721" fill="currentColor" aria-hidden="true">
            <path d="M304.246 295.411V249.828C304.246 245.989 305.687 243.109 309.044 241.191L400.692 188.412C413.167 181.215 428.042 177.858 443.394 177.858C500.971 177.858 537.44 222.482 537.44 269.982C537.44 273.34 537.44 277.179 536.959 281.018L441.954 225.358C436.197 222 430.437 222 424.68 225.358L304.246 295.411ZM518.245 472.945V364.024C518.245 357.304 515.364 352.507 509.608 349.149L389.174 279.096L428.519 256.543C431.877 254.626 434.757 254.626 438.115 256.543L529.762 309.323C556.154 324.679 573.905 357.304 573.905 388.971C573.905 425.436 552.315 459.024 518.245 472.941V472.945ZM275.937 376.982L236.592 353.952C233.235 352.034 231.794 349.154 231.794 345.315V239.756C231.794 188.416 271.139 149.548 324.4 149.548C344.555 149.548 363.264 156.268 379.102 168.262L284.578 222.964C278.822 226.321 275.942 231.119 275.942 237.838V376.986L275.937 376.982ZM360.626 425.922L304.246 394.255V327.083L360.626 295.416L417.002 327.083V394.255L360.626 425.922ZM396.852 571.789C376.698 571.789 357.989 565.07 342.151 553.075L436.674 498.374C442.431 495.017 445.311 490.219 445.311 483.499V344.352L485.138 367.382C488.495 369.299 489.936 372.179 489.936 376.018V481.577C489.936 532.917 450.109 571.785 396.852 571.785V571.789ZM283.134 464.79L191.486 412.01C165.094 396.654 147.343 364.029 147.343 332.362C147.343 295.416 169.415 262.309 203.48 248.393V357.791C203.48 364.51 206.361 369.308 212.117 372.665L332.074 442.237L292.729 464.79C289.372 466.707 286.491 466.707 283.134 464.79ZM277.859 543.48C223.639 543.48 183.813 502.695 183.813 452.314C183.813 448.475 184.294 444.636 184.771 440.797L279.295 495.498C285.051 498.856 290.812 498.856 296.568 495.498L417.002 425.927V471.509C417.002 475.349 415.562 478.229 412.204 480.146L320.557 532.926C308.081 540.122 293.206 543.48 277.854 543.48H277.859ZM396.852 600.576C454.911 600.576 503.37 559.313 514.41 504.612C568.149 490.696 602.696 440.315 602.696 388.976C602.696 355.387 588.303 322.762 562.392 299.25C564.791 289.173 566.231 279.096 566.231 269.024C566.231 200.411 510.571 149.067 446.274 149.067C433.322 149.067 420.846 150.984 408.37 155.305C386.775 134.192 357.026 120.758 324.4 120.758C266.342 120.758 217.883 162.02 206.843 216.721C153.104 230.637 118.557 281.018 118.557 332.357C118.557 365.946 132.95 398.571 158.861 422.083C156.462 432.16 155.022 442.237 155.022 452.309C155.022 520.922 210.682 572.266 274.978 572.266C287.931 572.266 300.407 570.349 312.883 566.028C334.473 587.141 364.222 600.576 396.852 600.576Z"/>
        </svg>
    `,
    assistantClaude: `
        <svg class="assistant-icon assistant-icon--claude" width="16" height="16" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">
            <path d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z"/>
        </svg>
    `,
    assistantPerplexity: `
        <svg class="assistant-icon assistant-icon--perplexity" width="16" height="16" viewBox="0 0 172 172" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M85.6758 22.7223C87.5821 22.7223 89.1279 24.2681 89.1279 26.1744V57.5016L122.896 23.734C123.884 22.747 125.369 22.451 126.658 22.985C127.948 23.5193 128.789 24.7784 128.789 26.1744V62.275H140.215C142.121 62.2751 143.666 63.821 143.666 65.7272V115.415C143.666 117.321 142.121 118.867 140.215 118.867H128.788V145.156C128.788 146.552 127.947 147.81 126.657 148.344C125.367 148.879 123.883 148.583 122.896 147.596L89.1279 113.829V145.174C89.1277 147.081 87.582 148.626 85.6758 148.626C83.7697 148.626 82.2239 147.081 82.2236 145.174V113.83L48.457 147.596C47.4699 148.583 45.9851 148.879 44.6953 148.344C43.4058 147.81 42.5646 146.552 42.5645 145.156V118.867H31.1348C29.2285 118.867 27.6826 117.321 27.6826 115.415V65.7272C27.6828 63.8211 29.2286 62.2752 31.1348 62.275H42.5645V26.1744C42.5645 24.7784 43.4056 23.5193 44.6953 22.985C45.9851 22.4508 47.4699 22.7469 48.457 23.734L82.2236 57.4996V26.1744C82.2237 24.2682 83.7695 22.7224 85.6758 22.7223ZM49.4688 102.101V136.822L82.2236 104.067V73.442L49.4688 102.101ZM89.1279 104.065L121.885 136.822V115.45C121.885 115.438 121.884 115.426 121.884 115.415C121.884 115.403 121.885 115.391 121.885 115.379V102.101L89.1279 73.4401V104.065ZM127.609 97.9371C128.359 98.5926 128.788 99.5404 128.788 100.536V111.964H136.763V69.1793H94.7402L127.609 97.9371ZM34.5869 111.964H42.5645V100.536C42.5645 99.5404 42.995 98.5926 43.7441 97.9371L76.6123 69.1793H34.5869V111.964ZM49.4688 62.275H77.2354L49.4688 34.5074V62.275ZM94.1191 62.275H121.886V34.5074L94.1191 62.275Z"/>
        </svg>
    `
};
const EXPORT_TYPE_CONFIG = {
    markdown: {
        mainLabelKey: 'popupDownloadBtn',
        mainLabelFallback: 'Download',
        selectionLabelKey: 'popupDownloadSelectionBtn',
        selectionLabelFallback: 'Download Selection',
        dropdownLabelKey: 'popupExportMarkdown',
        dropdownLabelFallback: 'Markdown (.md)',
        icon: 'download'
    },
    text: {
        mainLabelKey: 'popupDownloadTextBtn',
        mainLabelFallback: 'Download TXT',
        selectionLabelKey: 'popupDownloadTextSelectionBtn',
        selectionLabelFallback: 'Download Selection as TXT',
        dropdownLabelKey: 'popupExportText',
        dropdownLabelFallback: 'Plain Text (.txt)',
        icon: 'download',
        fileExtension: 'txt',
        mimeType: 'text/plain;charset=utf-8'
    },
    html: {
        mainLabelKey: 'popupDownloadHtmlBtn',
        mainLabelFallback: 'Download HTML',
        selectionLabelKey: 'popupDownloadHtmlSelectionBtn',
        selectionLabelFallback: 'Download Selection as HTML',
        dropdownLabelKey: 'popupExportHtml',
        dropdownLabelFallback: 'HTML (.html)',
        icon: 'download',
        fileExtension: 'html',
        mimeType: 'text/html;charset=utf-8'
    },
    pdf: {
        mainLabelKey: 'popupExportPdf',
        mainLabelFallback: 'Save as PDF',
        selectionLabelKey: 'popupDownloadPdfSelectionBtn',
        selectionLabelFallback: 'Save Selection as PDF',
        dropdownLabelKey: 'popupExportPdf',
        dropdownLabelFallback: 'Save as PDF',
        icon: 'file'
    }
};

function popupMessage(key, substitutions, fallback) {
    return globalThis.markSnipI18n?.t(key, substitutions, fallback) || fallback || key;
}

function popupI18nReady() {
    return globalThis.markSnipI18n?.ready?.().catch(() => {}) || Promise.resolve();
}

function normalizeColorBlindTheme(value) {
    return ['deuteranopia', 'protanopia', 'tritanopia'].includes(value) ? value : 'deuteranopia';
}

function getColorBlindThemeClassName(value) {
    return 'colorblind-theme-' + normalizeColorBlindTheme(value);
}

function getResolvedSpecialThemeKey(specialTheme, colorBlindTheme) {
    if (specialTheme === 'colorblind') {
        return 'colorblind-' + normalizeColorBlindTheme(colorBlindTheme);
    }
    return specialTheme;
}

function getOptionsStateApi() {
    return globalThis.markSnipOptionsState || null;
}

function validateSendToUrlTemplate(value) {
    const normalizedValue = String(value || '').trim();
    const matches = normalizedValue.match(/\{prompt\}/g) || [];
    if (!normalizedValue || matches.length !== 1) {
        return { valid: false, normalizedValue };
    }

    const queryStartIndex = normalizedValue.indexOf('?');
    const hashStartIndex = normalizedValue.indexOf('#');
    const promptIndex = normalizedValue.indexOf('{prompt}');
    const queryEndIndex = hashStartIndex === -1 ? normalizedValue.length : hashStartIndex;
    if (queryStartIndex === -1 || promptIndex < queryStartIndex || promptIndex >= queryEndIndex) {
        return { valid: false, normalizedValue };
    }

    try {
        const parsedUrl = new URL(normalizedValue.replace('{prompt}', '__MARKSNIP_PROMPT__'));
        return {
            valid: parsedUrl.protocol === 'https:',
            normalizedValue
        };
    } catch {
        return { valid: false, normalizedValue };
    }
}

function normalizeSendToCustomTargets(targets) {
    const optionsStateApi = getOptionsStateApi();
    if (optionsStateApi?.normalizeCustomSendToTargets) {
        return optionsStateApi.normalizeCustomSendToTargets(targets);
    }

    if (!Array.isArray(targets)) {
        return [];
    }

    const seenIds = new Set();
    return targets.reduce((normalizedTargets, target, index) => {
        if (!target || typeof target !== 'object') {
            return normalizedTargets;
        }

        const name = String(target.name || '').trim();
        const urlTemplate = target.urlTemplate ?? target.url;
        const validation = validateSendToUrlTemplate(urlTemplate);
        if (!name || !validation.valid) {
            return normalizedTargets;
        }

        const id = String(target.id || '').trim() || `custom-target-${index + 1}`;
        if (seenIds.has(id)) {
            return normalizedTargets;
        }

        seenIds.add(id);
        normalizedTargets.push({
            id,
            name,
            urlTemplate: validation.normalizedValue
        });
        return normalizedTargets;
    }, []);
}

function normalizeDefaultSendToTarget(value, customTargets = normalizeSendToCustomTargets(currentOptions?.sendToCustomTargets)) {
    const optionsStateApi = getOptionsStateApi();
    if (optionsStateApi?.normalizeDefaultSendToTarget) {
        return optionsStateApi.normalizeDefaultSendToTarget(value, customTargets, DEFAULT_SEND_TO_TARGET);
    }

    const normalizedValue = String(value || '').trim();
    if (SEND_TO_TARGETS[normalizedValue]) {
        return normalizedValue;
    }

    return customTargets.some((target) => target.id === normalizedValue)
        ? normalizedValue
        : DEFAULT_SEND_TO_TARGET;
}

function normalizeSendToMaxUrlLength(value, fallbackValue = defaultOptions?.sendToMaxUrlLength ?? DEFAULT_SEND_TO_MAX_URL_LENGTH) {
    const optionsStateApi = getOptionsStateApi();
    if (optionsStateApi?.normalizeSendToMaxUrlLength) {
        return optionsStateApi.normalizeSendToMaxUrlLength(value, fallbackValue);
    }

    const normalizedFallback = Number.isFinite(Number(fallbackValue)) && Number(fallbackValue) > 0
        ? Math.floor(Number(fallbackValue))
        : DEFAULT_SEND_TO_MAX_URL_LENGTH;
    const parsedValue = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsedValue) && parsedValue > 0
        ? parsedValue
        : normalizedFallback;
}

function normalizePopupOptions(source = {}) {
    const optionsStateApi = getOptionsStateApi();
    if (optionsStateApi?.normalizeImportedOptions) {
        return optionsStateApi.normalizeImportedOptions(source, defaultOptions);
    }

    const normalizedOptions = {
        ...defaultOptions,
        ...(source || {})
    };
    normalizedOptions.sendToCustomTargets = normalizeSendToCustomTargets(normalizedOptions.sendToCustomTargets);
    normalizedOptions.defaultSendToTarget = normalizeDefaultSendToTarget(
        normalizedOptions.defaultSendToTarget,
        normalizedOptions.sendToCustomTargets
    );
    normalizedOptions.sendToMaxUrlLength = normalizeSendToMaxUrlLength(
        normalizedOptions.sendToMaxUrlLength,
        defaultOptions?.sendToMaxUrlLength
    );
    normalizedOptions.webhookTargets = normalizeWebhookTargets(normalizedOptions.webhookTargets);
    normalizedOptions.defaultExportType = POPUP_PRIMARY_ACTION_SET.has(normalizedOptions.defaultExportType) || isWebhookExportType(normalizedOptions.defaultExportType)
        ? normalizedOptions.defaultExportType
        : defaultOptions.defaultExportType;
    normalizedOptions.elementPickerEnabled = normalizedOptions.elementPickerEnabled !== false;
    normalizedOptions.elementPickerDoneAction = normalizedOptions.elementPickerDoneAction === 'copy' ? 'copy' : 'popup';
    if (isWebhookExportType(normalizedOptions.defaultExportType)) {
        const targetId = getWebhookTargetIdFromExportType(normalizedOptions.defaultExportType);
        const targetExists = normalizedOptions.webhookTargets.some((t) => t.id === targetId);
        if (!targetExists) {
            normalizedOptions.defaultExportType = defaultOptions.defaultExportType;
        }
    }
    return normalizedOptions;
}

function resolvePopupPrimaryActionType(options = currentOptions) {
    const actionType = String(options?.defaultExportType || '').trim();
    if (POPUP_PRIMARY_ACTION_SET.has(actionType) || isWebhookExportType(actionType)) {
        return actionType;
    }
    return 'markdown';
}

function resolveSendToTarget(targetId = currentOptions?.defaultSendToTarget, options = currentOptions) {
    const customTargets = normalizeSendToCustomTargets(options?.sendToCustomTargets);
    const normalizedTargetId = normalizeDefaultSendToTarget(targetId, customTargets);
    if (SEND_TO_TARGETS[normalizedTargetId]) {
        return SEND_TO_TARGETS[normalizedTargetId];
    }

    const customTarget = customTargets.find((target) => target.id === normalizedTargetId);
    if (customTarget) {
        return {
            id: customTarget.id,
            label: customTarget.name,
            urlTemplate: customTarget.urlTemplate,
            fallbackUrl: customTarget.urlTemplate.replace('{prompt}', ''),
            iconKey: 'send'
        };
    }

    return SEND_TO_TARGETS[DEFAULT_SEND_TO_TARGET];
}

function resolveWebhookTarget(targetId, options = currentOptions) {
    const targets = normalizeWebhookTargets(options?.webhookTargets);
    return targets.find((t) => t.id === targetId) || null;
}

function normalizeWebhookTargets(targets) {
    if (!Array.isArray(targets)) {
        return [];
    }
    const optionsStateApi = globalThis.markSnipOptionsState;
    if (optionsStateApi?.normalizeWebhookTargets) {
        return optionsStateApi.normalizeWebhookTargets(targets);
    }
    return targets;
}

const dom = {
    root: document.documentElement,
    body: document.body,
    spinner: document.getElementById('spinner'),
    container: document.getElementById('container'),
    batchContainer: document.getElementById('batchContainer'),
    editorTextarea: document.getElementById('md'),
    titleInput: document.getElementById('title'),
    charCount: document.getElementById('char-count'),
    downloadButton: document.getElementById('download'),
    downloadSelectionButton: document.getElementById('downloadSelection'),
    copyButton: document.getElementById('copy'),
    copySelectionButton: document.getElementById('copySelection'),
    includeTemplate: document.getElementById('includeTemplate'),
    downloadImages: document.getElementById('downloadImages'),
    includeTemplateRuleHint: document.getElementById('includeTemplateRuleHint'),
    downloadImagesRuleHint: document.getElementById('downloadImagesRuleHint'),
    selectedButton: document.getElementById('selected'),
    documentButton: document.getElementById('document'),
    elementPickerRow: document.getElementById('elementPickerRow'),
    pickElementButton: document.getElementById('pickElement'),
    clipOption: document.getElementById('clipOption'),
    urlList: document.getElementById('urlList'),
    startBatchButton: document.getElementById('startBatch'),
    startBatchLabel: document.getElementById('startBatchLabel'),
    batchFooter: document.getElementById('batchFooter'),
    pickLinksButton: document.getElementById('pickLinks'),
    batchStep2Title: document.getElementById('batchStep2Title'),
    batchStep2Desc: document.getElementById('batchStep2Desc'),
    batchStep2Hint: document.getElementById('batchStep2Hint'),
    batchLinkList: document.getElementById('batchLinkList'),
    batchProcessButton: document.getElementById('batchProcess'),
    themeToggleButton: document.getElementById('themeToggle'),
    openGuideButton: document.getElementById('openGuide'),
    guideDropdownWrap:      document.getElementById('guideDropdownWrap'),
    guideDropdown:          document.getElementById('guideDropdown'),
    guideLink:              document.getElementById('guideLink'),
    showShortcutsBtn:       document.getElementById('showShortcuts'),
    shortcutsModal:         document.getElementById('shortcutsModal'),
    shortcutsModalBackdrop: document.getElementById('shortcutsModalBackdrop'),
    shortcutsModalBody:     document.getElementById('shortcutsModalBody'),
    closeShortcutsModalBtn: document.getElementById('closeShortcutsModal'),
    sendToObsidianButton: document.getElementById('sendToObsidian'),
    previewToggle: document.getElementById('previewToggle'),
    editorPreview: document.getElementById('editorPreview'),
    editorBody: document.getElementById('editorBody'),
    splitExport: document.getElementById('splitExport'),
    splitButtonWrap: document.getElementById('splitBtnWrap'),
    splitButtonArrow: document.getElementById('splitArrow'),
    splitDropdown: document.getElementById('splitDropdown'),
    sendToChatgptButton: document.getElementById('ddSendToChatgpt'),
    sendToClaudeButton: document.getElementById('ddSendToClaude'),
    sendToPerplexityButton: document.getElementById('ddSendToPerplexity'),
    sendToCustomTargets: document.getElementById('ddSendToCustomTargets'),
    markdownButton: document.getElementById('ddMarkdown'),
    textButton: document.getElementById('ddText'),
    htmlButton: document.getElementById('ddHtml'),
    printButton: document.getElementById('ddPrint'),
    pdfButton: document.getElementById('ddPdf')
};

globalThis.cm = null;

const libraryUI = {
    toggle: document.getElementById('libraryViewToggle'),
    container: document.getElementById('libraryContainer'),
    close: document.getElementById('closeLibraryView'),
    countBadge: document.getElementById('libraryCountBadge'),
    saveButton: document.getElementById('saveLibraryClip'),
    exportButton: document.getElementById('exportLibraryAll'),
    exportDropdown: document.getElementById('exportLibraryAll')?.closest('.export-dropdown'),
    exportDropdownMenu: document.getElementById('exportDropdownMenu'),
    toolbarNote: document.getElementById('libraryToolbarNote'),
    status: document.getElementById('libraryStatus'),
    emptyState: document.getElementById('libraryEmptyState'),
    emptyText: document.getElementById('libraryEmptyText'),
    list: document.getElementById('libraryList')
};

const popupViews = {
    main: dom.container,
    batch: dom.batchContainer,
    library: libraryUI.container
};

const progressUI = {
    container: document.getElementById('progressContainer'),
    bar: document.getElementById('progressBar'),
    count: document.getElementById('progressCount'),
    status: document.getElementById('progressStatus'),
    currentUrl: document.getElementById('currentUrl'),
    
    show() {
        this.container.style.display = 'flex';
    },
    
    hide() {
        this.container.style.display = 'none';
    },
    
    reset() {
        this.bar.style.width = '0%';
        this.count.textContent = '0/0';
        this.status.textContent = popupMessage('popupProcessingUrls', null, 'Processing URLs...');
        this.currentUrl.textContent = '';
    },
    
    cancelBtn: document.getElementById('cancelBatchProgress'),

    updateProgress(current, total, url, title) {
        const percentage = (current / total) * 100;
        this.bar.style.width = `${percentage}%`;
        this.count.textContent = `${current}/${total}`;
        this.currentUrl.textContent = title || url;
    },

    showCancelButton() {
        this.cancelBtn.style.display = 'block';
        this.cancelBtn.disabled = false;
        this.cancelBtn.textContent = popupMessage('popupCancelBtn', null, 'Cancel');
    },

    hideCancelButton() {
        this.cancelBtn.style.display = 'none';
    },
    
    setStatus(status) {
        this.status.textContent = status;
    }
};

function resolveDefaultExportType(options = currentOptions) {
    const exportType = String(options?.defaultExportType || '').trim().toLowerCase();
    return EXPORT_TYPE_SET.has(exportType) ? exportType : 'markdown';
}

function getExportTypeConfig(exportType) {
    const config = EXPORT_TYPE_CONFIG[resolveDefaultExportType({ defaultExportType: exportType })] || EXPORT_TYPE_CONFIG.markdown;
    return {
        ...config,
        mainLabel: popupMessage(config.mainLabelKey, null, config.mainLabelFallback),
        selectionLabel: popupMessage(config.selectionLabelKey, null, config.selectionLabelFallback),
        dropdownLabel: popupMessage(config.dropdownLabelKey, null, config.dropdownLabelFallback)
    };
}

function getPopupPrimaryActionConfig(options = currentOptions) {
    const primaryActionType = resolvePopupPrimaryActionType(options);
    if (primaryActionType === 'sendTo') {
        const target = resolveSendToTarget(undefined, options);
        return {
            mainLabel: popupMessage('popupSendToTargetTitle', [target.label], `Send to ${target.label}`),
            selectionLabel: popupMessage('popupSendSelectionToTargetTitle', [target.label], `Send Selection to ${target.label}`),
            icon: target.iconKey || 'send'
        };
    }

    if (primaryActionType === 'copy') {
        return {
            mainLabel: popupMessage('popupCopyBtn', null, 'Copy'),
            selectionLabel: popupMessage('popupCopySelectionBtn', null, 'Copy Selection'),
            icon: 'copy'
        };
    }

    const webhookTargetId = getWebhookTargetIdFromExportType(primaryActionType);
    if (webhookTargetId) {
        const target = resolveWebhookTarget(webhookTargetId, options);
        if (target) {
            return {
                mainLabel: `Send to ${target.name}`,
                selectionLabel: `Send Selection to ${target.name}`,
                icon: 'send'
            };
        }
    }

    return getExportTypeConfig(primaryActionType);
}

function getDropdownExportButtons() {
    return {
        markdown: dom.markdownButton,
        text: dom.textButton,
        html: dom.htmlButton,
        pdf: dom.pdfButton
    };
}

function getDropdownSendButtons() {
    return {
        chatgpt: dom.sendToChatgptButton,
        claude: dom.sendToClaudeButton,
        perplexity: dom.sendToPerplexityButton
    };
}

function setActionButtonContent(button, label, iconKey = 'download') {
    if (!button) {
        return;
    }

    const iconMarkup = EXPORT_BUTTON_ICONS[iconKey] || EXPORT_BUTTON_ICONS.download;
    const labelClassName = button.classList.contains('split-btn__main') ? 'split-btn__label' : 'btn__label';
    button.innerHTML = `${iconMarkup}<span class="${labelClassName}"></span>`;
    const labelElement = button.querySelector(`.${labelClassName}`);
    if (labelElement) {
        labelElement.textContent = label;
    }
}

function renderSendToDropdownOptions(options = currentOptions) {
    const primaryActionType = resolvePopupPrimaryActionType(options);
    const activeTarget = resolveSendToTarget(undefined, options);
    const dropdownButtons = getDropdownSendButtons();
    Object.entries(dropdownButtons).forEach(([targetId, button]) => {
        if (!button) {
            return;
        }

        button.hidden = primaryActionType === 'sendTo' && activeTarget.id === targetId;
    });

    if (!dom.sendToCustomTargets) {
        return;
    }

    dom.sendToCustomTargets.innerHTML = '';
    const customTargets = normalizeSendToCustomTargets(options?.sendToCustomTargets);
    customTargets.forEach((target) => {
        const button = document.createElement('button');
        button.className = 'dd-item';
        button.type = 'button';
        button.role = 'menuitem';
        button.hidden = primaryActionType === 'sendTo' && activeTarget.id === target.id;
        button.dataset.targetId = target.id;
        button.innerHTML = `
            ${EXPORT_BUTTON_ICONS.send}
            <span class="dd-item__label"></span>
        `;
        button.querySelector('.dd-item__label').textContent = target.name;
        button.title = popupMessage('popupSendToTargetTitle', [target.name], `Send to ${target.name}`);
        button.addEventListener('click', async (event) => {
            event.preventDefault();
            try {
                await handleSendToAction(target.id, { triggerButton: dom.downloadButton });
            } catch (error) {
                console.error(`Error sending to ${target.name}:`, error);
            }
        });
        dom.sendToCustomTargets.appendChild(button);
    });

    // Render webhook targets in the Send To section
    const webhookTargets = normalizeWebhookTargets(options?.webhookTargets);
    if (customTargets.length > 0 && webhookTargets.length > 0) {
        const divider = document.createElement('hr');
        divider.className = 'dd-section-divider';
        divider.setAttribute('aria-hidden', 'true');
        dom.sendToCustomTargets.appendChild(divider);
    }
    renderWebhookDropdownOptions(options);
}

function renderWebhookDropdownOptions(options = currentOptions) {
    if (!dom.sendToCustomTargets) {
        return;
    }

    const primaryActionType = resolvePopupPrimaryActionType(options);
    const webhookTargets = normalizeWebhookTargets(options?.webhookTargets);
    if (webhookTargets.length === 0) {
        return;
    }

    const existingItems = dom.sendToCustomTargets.querySelectorAll('.webhook-dd-item');
    existingItems.forEach((el) => el.remove());

    webhookTargets.forEach((target) => {
        const button = document.createElement('button');
        button.className = 'dd-item webhook-dd-item';
        button.type = 'button';
        button.role = 'menuitem';
        button.hidden = primaryActionType === `webhook:${target.id}`;
        button.dataset.targetId = target.id;
        button.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <span class="dd-item__label"></span>
        `;
        button.querySelector('.dd-item__label').textContent = target.name;
        button.title = `Send to ${target.name}`;
        button.addEventListener('click', async (event) => {
            event.preventDefault();
            try {
                await handleWebhookSendAction(target.id, { triggerButton: dom.downloadButton });
            } catch (error) {
                console.error(`Error sending to webhook target ${target.name}:`, error);
            }
        });
        dom.sendToCustomTargets.appendChild(button);
    });
}

function updatePopupExportControls(options = currentOptions) {
    const primaryActionType = resolvePopupPrimaryActionType(options);
    const config = getPopupPrimaryActionConfig(options);

    dom.downloadButton?.classList.remove('success', 'error');
    dom.downloadSelectionButton?.classList.remove('success', 'error');
    setActionButtonContent(dom.downloadButton, config.mainLabel, config.icon);
    setActionButtonContent(dom.downloadSelectionButton, config.selectionLabel, config.icon);

    if (dom.downloadButton) {
        dom.downloadButton.setAttribute('aria-label', config.mainLabel);
        dom.downloadButton.title = config.mainLabel;
    }

    if (dom.downloadSelectionButton) {
        dom.downloadSelectionButton.setAttribute('aria-label', config.selectionLabel);
        dom.downloadSelectionButton.title = config.selectionLabel;
    }

    const dropdownButtons = getDropdownExportButtons();
    EXPORT_TYPE_ORDER.forEach((kind) => {
        const button = dropdownButtons[kind];
        if (!button) {
            return;
        }

        button.hidden = primaryActionType !== 'sendTo' && kind === primaryActionType;
    });

    renderSendToDropdownOptions(options);
}

let popupViewsInitialized = false;
let activePopupView = null;
let lastNonLibraryView = 'main';
let popupViewTransitionToken = 0;

let darkMode = prefersDarkScheme.matches;

function initializePopupViews() {
    if (popupViewsInitialized) {
        return;
    }

    Object.values(popupViews).forEach((viewEl) => {
        if (!viewEl) {
            return;
        }
        viewEl.classList.add('popup-view');
        viewEl.classList.remove('is-active', 'is-entering', 'is-exiting');
    });

    if (libraryUI.container) {
        libraryUI.container.setAttribute('aria-hidden', 'true');
    }

    popupViewsInitialized = true;
}

function syncPopupViewUi(nextView) {
    if (libraryUI.container) {
        libraryUI.container.setAttribute('aria-hidden', String(nextView !== 'library'));
    }

    libraryUI.toggle?.classList.toggle('active', nextView === 'library');
}

function getPopupViewFocusTarget(viewName) {
    switch (viewName) {
        case 'main':
            return dom.downloadButton;
        case 'batch':
            return batchCaptureMethod === 'manual'
                ? (dom.urlList || dom.startBatchButton)
                : dom.startBatchButton;
        case 'library':
            return libraryUI.close;
        default:
            return null;
    }
}

function canFocusPopupTarget(target) {
    if (!target || target.disabled) {
        return false;
    }

    const style = window.getComputedStyle(target);
    return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        target.getClientRects().length > 0;
}

async function focusPopupView(viewName) {
    const target = getPopupViewFocusTarget(viewName);
    await afterNextPaint();
    if (canFocusPopupTarget(target)) {
        target.focus({ preventScroll: true });
    }
}

async function setPopupView(nextView, options = {}) {
    const { immediate = false, focus = true } = options;
    const targetView = popupViews[nextView];
    if (!targetView) {
        return;
    }

    initializePopupViews();

    if (nextView !== 'library') {
        lastNonLibraryView = nextView;
    }

    const previousView = activePopupView;
    activePopupView = nextView;
    const transitionToken = ++popupViewTransitionToken;
    const shouldSkipAnimation = immediate || prefersReducedMotion.matches || !previousView || previousView === nextView;

    if (shouldSkipAnimation) {
        Object.entries(popupViews).forEach(([viewName, viewEl]) => {
            if (!viewEl) {
                return;
            }

            viewEl.classList.remove('is-entering', 'is-exiting');
            viewEl.classList.toggle('is-active', viewName === nextView);
        });

        syncPopupViewUi(nextView);

        if (focus) {
            await focusPopupView(nextView);
        }
        return;
    }

    Object.entries(popupViews).forEach(([viewName, viewEl]) => {
        if (!viewEl) {
            return;
        }

        viewEl.classList.remove('is-active', 'is-entering', 'is-exiting');

        if (viewName === previousView) {
            viewEl.classList.add('is-exiting');
        } else if (viewName === nextView) {
            viewEl.classList.add('is-entering');
        }
    });

    syncPopupViewUi(nextView);

    await new Promise((resolve) => {
        window.setTimeout(resolve, POPUP_VIEW_TRANSITION_MS);
    });

    if (transitionToken !== popupViewTransitionToken || activePopupView !== nextView) {
        return;
    }

    Object.entries(popupViews).forEach(([viewName, viewEl]) => {
        if (!viewEl) {
            return;
        }

        viewEl.classList.remove('is-entering', 'is-exiting');
        viewEl.classList.toggle('is-active', viewName === nextView);
    });

    syncPopupViewUi(nextView);

    if (focus) {
        await focusPopupView(nextView);
    }
}

function getLibraryStateApi() {
    return globalThis.markSnipLibraryState || null;
}

function getAgentBridgeStateApi() {
    return globalThis.markSnipAgentBridgeState || null;
}

function queuePersistAgentBridgeClip(snapshot = currentClipState) {
    const api = getAgentBridgeStateApi();
    if (!api?.saveLatestClip) {
        return;
    }

    const nextSnapshot = {
        title: String(snapshot?.title || '').trim(),
        markdown: String(snapshot?.markdown || ''),
        pageUrl: String(snapshot?.pageUrl || '').trim(),
        source: 'popup'
    };

    if (!nextSnapshot.pageUrl || !nextSnapshot.markdown.trim()) {
        return;
    }

    if (agentBridgeClipPersistTimeout) {
        clearTimeout(agentBridgeClipPersistTimeout);
    }

    agentBridgeClipPersistTimeout = setTimeout(() => {
        api.saveLatestClip(nextSnapshot).catch((error) => {
            console.error('Failed to persist Agent Bridge clip snapshot:', error);
        });
    }, 250);
}

// Theme application
const EDITOR_THEME_MAP = {
    default:   { dark: 'xq-dark',        light: 'xq-light' },
    claude:    { dark: 'claude-dark',    light: 'claude-light' },
    perplexity:{ dark: 'perplexity-dark',light: 'perplexity-light' },
    openai:    { dark: 'openai-dark',    light: 'openai-light' },
    atla:      { dark: 'atla-dark',      light: 'atla-light' },
    ben10:     { dark: 'ben10-dark',     light: 'ben10-light' },
    'colorblind-deuteranopia': { dark: 'colorblind-deuteranopia-dark', light: 'colorblind-deuteranopia-light' },
    'colorblind-protanopia': { dark: 'colorblind-protanopia-dark', light: 'colorblind-protanopia-light' },
    'colorblind-tritanopia': { dark: 'colorblind-tritanopia-dark', light: 'colorblind-tritanopia-light' },
    dracula:   { dark: 'dracula',         light: 'dracula' },
    material:  { dark: 'material-darker', light: 'material' },
    monokai:   { dark: 'monokai',         light: 'xq-light' },
    nord:      { dark: 'nord',            light: 'xq-light' },
    solarized: { dark: 'solarized dark',  light: 'solarized light' },
    twilight:  { dark: 'twilight',         light: 'xq-light' },
};
const EDITOR_THEME_STYLESHEET_MAP = Object.freeze({
    'xq-dark': 'lib/xq-dark.css',
    'xq-light': 'lib/xq-light.css',
    'claude-dark': 'lib/claude-dark.css',
    'claude-light': 'lib/claude-light.css',
    'perplexity-dark': 'lib/perplexity-dark.css',
    'perplexity-light': 'lib/perplexity-light.css',
    'openai-dark': 'lib/openai-dark.css',
    'openai-light': 'lib/openai-light.css',
    'atla-dark': 'lib/atla-dark.css',
    'atla-light': 'lib/atla-light.css',
    'ben10-dark': 'lib/ben10-dark.css',
    'ben10-light': 'lib/ben10-light.css',
    'colorblind-deuteranopia-dark': 'lib/colorblind-deuteranopia-dark.css',
    'colorblind-deuteranopia-light': 'lib/colorblind-deuteranopia-light.css',
    'colorblind-protanopia-dark': 'lib/colorblind-protanopia-dark.css',
    'colorblind-protanopia-light': 'lib/colorblind-protanopia-light.css',
    'colorblind-tritanopia-dark': 'lib/colorblind-tritanopia-dark.css',
    'colorblind-tritanopia-light': 'lib/colorblind-tritanopia-light.css',
    'dracula': 'lib/dracula.css',
    'material': 'lib/material.css',
    'material-darker': 'lib/material-darker.css',
    'monokai': 'lib/monokai.css',
    'nord': 'lib/nord.css',
    'solarized dark': 'lib/solarized.css',
    'solarized light': 'lib/solarized.css',
    'twilight': 'lib/twilight.css'
});

function getFallbackWordCount(text) {
    const normalized = String(text || '').trim();
    return normalized === '' ? 0 : normalized.split(/\s+/).length;
}

function formatCounterDisplay(text, mode) {
    if (typeof countUtils?.formatCountDisplay === 'function') {
        return countUtils.formatCountDisplay(text, mode);
    }

    const normalized = String(text || '');
    if (mode === 'words') {
        return getFallbackWordCount(normalized).toLocaleString() + ' words';
    }

    if (mode === 'minRead') {
        const words = getFallbackWordCount(normalized);
        const minutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 200));
        return minutes.toLocaleString() + ' min read';
    }

    if (mode === 'tokens') {
        const remaining = normalized.replace(/\s+/g, ' ').trim();
        return Math.ceil((remaining.length || 0) / 4).toLocaleString() + ' tokens';
    }

    return normalized.length.toLocaleString() + ' chars';
}

function afterNextPaint() {
    return new Promise((resolve) => {
        requestAnimationFrame(() => resolve());
    });
}

function scheduleDeferredTask(task, timeout = 800) {
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => {
            Promise.resolve().then(task).catch((error) => {
                console.error('Deferred popup task failed:', error);
            });
        }, { timeout });
        return;
    }

    setTimeout(() => {
        Promise.resolve().then(task).catch((error) => {
            console.error('Deferred popup task failed:', error);
        });
    }, 0);
}

function getEditorThemeStylesheetLink() {
    let link = document.getElementById('cm-theme-stylesheet');
    if (link) {
        return link;
    }

    link = document.createElement('link');
    link.id = 'cm-theme-stylesheet';
    link.rel = 'stylesheet';
    dom.root.querySelector('head')?.appendChild(link);
    return link;
}

function ensureEditorThemeStylesheet(themeName) {
    const href = EDITOR_THEME_STYLESHEET_MAP[themeName];
    if (!href) {
        return false;
    }

    const link = getEditorThemeStylesheetLink();
    if (link.getAttribute('href') === href) {
        link.setAttribute('data-theme-name', themeName);
        return false;
    }

    link.setAttribute('href', href);
    link.setAttribute('data-theme-name', themeName);
    return true;
}

function resolvePopupDarkMode(options = currentOptions) {
    return options?.popupTheme === 'dark' ||
        (options?.popupTheme !== 'light' && prefersDarkScheme.matches);
}

function clearPendingThemeTransitionListeners() {
    if (themeTransitionPendingLink && themeTransitionPendingHandler) {
        themeTransitionPendingLink.removeEventListener('load', themeTransitionPendingHandler);
        themeTransitionPendingLink.removeEventListener('error', themeTransitionPendingHandler);
    }

    themeTransitionPendingLink = null;
    themeTransitionPendingHandler = null;
}

function finishThemeTransition() {
    clearTimeout(themeTransitionCleanupTimer);
    themeTransitionCleanupTimer = null;
    clearPendingThemeTransitionListeners();
    window.requestAnimationFrame(() => {
        dom.root.classList.remove('theme-transition-active');
    });
}

function beginThemeTransition(waitForStylesheet = false) {
    if (prefersReducedMotion.matches) {
        return;
    }

    clearTimeout(themeTransitionCleanupTimer);
    clearPendingThemeTransitionListeners();
    dom.root.classList.add('theme-transition-active');

    const finish = () => finishThemeTransition();
    if (waitForStylesheet) {
        const link = getEditorThemeStylesheetLink();
        themeTransitionPendingLink = link;
        themeTransitionPendingHandler = finish;
        link.addEventListener('load', finish, { once: true });
        link.addEventListener('error', finish, { once: true });
    }

    themeTransitionCleanupTimer = window.setTimeout(finish, THEME_TRANSITION_FALLBACK_MS);
}

function updateThemeToggleButton(options = currentOptions) {
    if (!dom.themeToggleButton) {
        return;
    }

    const shouldShow = options?.showThemeToggleInPopup !== false;
    const isDark = resolvePopupDarkMode(options);
    const nextLabel = isDark ? 'Switch to light mode' : 'Switch to dark mode';

    dom.root.classList.toggle('hide-popup-theme-toggle', !shouldShow);
    dom.themeToggleButton.hidden = !shouldShow;
    dom.themeToggleButton.setAttribute('aria-hidden', String(!shouldShow));
    dom.themeToggleButton.classList.toggle('is-dark', isDark);
    dom.themeToggleButton.setAttribute('aria-pressed', String(isDark));
    dom.themeToggleButton.setAttribute('aria-label', nextLabel);
    dom.themeToggleButton.title = nextLabel;
}

async function handleThemeToggleClick(event) {
    event?.preventDefault?.();
    if (!currentOptions) {
        return;
    }

    const previousTheme = currentOptions.popupTheme || 'system';
    const nextTheme = resolvePopupDarkMode(currentOptions) ? 'light' : 'dark';

    currentOptions = normalizePopupOptions({
        ...currentOptions,
        popupTheme: nextTheme
    });
    applyThemeSettings(currentOptions);

    try {
        await browser.storage.sync.set({ popupTheme: nextTheme });
    } catch (error) {
        console.error('Failed to persist popup theme toggle:', error);
        currentOptions = normalizePopupOptions({
            ...currentOptions,
            popupTheme: previousTheme
        });
        applyThemeSettings(currentOptions);
    }
}

function getEditorValue() {
    if (cm?.getValue) {
        return cm.getValue();
    }
    return dom.editorTextarea?.value || pendingEditorValue || currentClipState.markdown || '';
}

function editorHasSelection() {
    return Boolean(cm?.somethingSelected && cm.somethingSelected());
}

function getEditorSelection() {
    return cm?.getSelection ? cm.getSelection() : '';
}

function syncSelectionActionVisibility(showSelectionActions) {
    if (dom.downloadSelectionButton) {
        dom.downloadSelectionButton.style.display = showSelectionActions ? 'block' : 'none';
    }
    if (dom.copySelectionButton) {
        dom.copySelectionButton.style.display = showSelectionActions ? 'block' : 'none';
    }
}

function setEditorValue(value) {
    const nextValue = String(value || '');
    pendingEditorValue = nextValue;
    currentClipState.markdown = nextValue;

    if (cm?.getValue) {
        if (cm.getValue() !== nextValue) {
            cm.setValue(nextValue);
            return;
        }
    } else if (dom.editorTextarea) {
        dom.editorTextarea.value = nextValue;
    }

    updateSaveLibraryButtonState();
    updateCharCount(nextValue);
}

function refreshEditor() {
    if (cm?.refresh) {
        cm.refresh();
        return;
    }
    pendingEditorRefresh = true;
}

function initializeEditor() {
    if (editorInitPromise) {
        return editorInitPromise;
    }

    editorInitPromise = Promise.resolve().then(() => {
        const initialValue = pendingEditorValue || dom.editorTextarea?.value || currentClipState.markdown || '';
        if (dom.editorTextarea) {
            dom.editorTextarea.value = initialValue;
        }

        cm = CodeMirror.fromTextArea(dom.editorTextarea, {
            theme: resolveEditorTheme(
                currentOptions?.editorTheme || 'default',
                darkMode,
                currentOptions?.specialTheme || 'none',
                currentOptions?.colorBlindTheme
            ),
            mode: 'markdown',
            lineWrapping: true
        });
        globalThis.cm = cm;

        cm.on('change', (instance) => {
            const nextValue = instance.getValue();
            pendingEditorValue = nextValue;
            currentClipState.markdown = nextValue;
            updateSaveLibraryButtonState();
            updateCharCount(nextValue);
            queuePersistAgentBridgeClip();
            if (previewActive) {
                renderPreviewContent();
            }
        });

        cm.on('cursorActivity', (instance) => {
            const somethingSelected = instance.somethingSelected();
            syncSelectionActionVisibility(somethingSelected);
            updateCharCount(somethingSelected ? instance.getSelection() : currentClipState.markdown);
        });

        syncSelectionActionVisibility(false);
        updateCharCount(initialValue);

        if (pendingEditorRefresh) {
            pendingEditorRefresh = false;
            requestAnimationFrame(() => cm.refresh());
        }

        return cm;
    });

    return editorInitPromise;
}

function loadScriptOnce(src, id) {
    if (id) {
        const existingById = document.getElementById(id);
        if (existingById) {
            return Promise.resolve(existingById);
        }
    }

    const existing = Array.from(document.scripts).find((script) => script.getAttribute('src') === src);
    if (existing) {
        return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.type = 'application/javascript';
        script.src = src;
        if (id) {
            script.id = id;
        }
        script.addEventListener('load', () => resolve(script), { once: true });
        script.addEventListener('error', () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
        document.body.appendChild(script);
    });
}

function loadStylesheetOnce(href, id) {
    if (id) {
        const existingById = document.getElementById(id);
        if (existingById) {
            return Promise.resolve(existingById);
        }
    }

    const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .find((link) => link.getAttribute('href') === href);
    if (existing) {
        return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        if (id) {
            link.id = id;
        }
        link.addEventListener('load', () => resolve(link), { once: true });
        link.addEventListener('error', () => reject(new Error(`Failed to load stylesheet: ${href}`)), { once: true });
        document.head.appendChild(link);
    });
}

// --- Markdown Preview ---

const UNSAFE_LINK_RE = /^\s*javascript\s*:/i;
const SAFE_PREVIEW_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getPreviewBaseUrl() {
    if (currentClipState?.pageUrl) {
        return currentClipState.pageUrl;
    }

    return window.location.href;
}

function resolveSafePreviewHref(href) {
    const nextHref = String(href || '').trim();
    if (!nextHref || UNSAFE_LINK_RE.test(nextHref)) {
        return null;
    }

    try {
        const resolved = new URL(nextHref, getPreviewBaseUrl());
        if (!SAFE_PREVIEW_PROTOCOLS.has(resolved.protocol)) {
            return null;
        }

        return resolved.href;
    } catch (_error) {
        return null;
    }
}

function ensureMarkedLoaded() {
    if (markedLoadPromise) {
        return markedLoadPromise;
    }

    markedLoadPromise = Promise.all([
        loadScriptOnce('lib/marked.min.js', 'marked-script'),
        loadStylesheetOnce('lib/github-markdown.css', 'github-markdown-css')
    ]).then(() => {
        if (typeof marked === 'undefined' || !marked.parse) {
            throw new Error('marked library failed to initialize');
        }
    }).catch((error) => {
        markedLoadPromise = null;
        throw error;
    });

    return markedLoadPromise;
}

function resolveSafePrintAssetHref(href) {
    const nextHref = String(href || '').trim();
    if (!nextHref || UNSAFE_LINK_RE.test(nextHref)) {
        return null;
    }

    try {
        const resolved = new URL(nextHref, getPreviewBaseUrl());
        if (!['http:', 'https:', 'data:'].includes(resolved.protocol)) {
            return null;
        }

        return resolved.href;
    } catch (_error) {
        return null;
    }
}

function buildMarkedRenderer({ renderImages = false } = {}) {
    const renderer = new marked.Renderer();

    renderer.html = function ({ text }) {
        return escapeHtml(text || '');
    };

    renderer.image = function ({ href, title, text }) {
        const alt = escapeHtml(text || '');
        const safeSrc = resolveSafePrintAssetHref(href);
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';

        if (!safeSrc) {
            return `<span class="preview-image-placeholder">[image: ${alt || 'image'}]</span>`;
        }

        if (!renderImages) {
            return `<span class="preview-image-placeholder">[image: <a href="${escapeHtml(safeSrc)}" target="_blank" rel="noopener noreferrer"${titleAttr}>${alt || escapeHtml(safeSrc)}</a>]</span>`;
        }

        return `<img src="${escapeHtml(safeSrc)}" alt="${alt}" loading="eager"${titleAttr}>`;
    };

    renderer.link = function ({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const safeHref = resolveSafePreviewHref(href);
        if (!safeHref) {
            return text;
        }

        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
    };

    return renderer;
}

function renderMarkdownToHtml(raw, options = {}) {
    return marked.parse(raw, {
        renderer: buildMarkedRenderer(options)
    });
}

function renderPreviewContent() {
    if (!previewActive || !dom.editorPreview) {
        return;
    }

    const raw = getEditorValue();

    const body = dom.editorPreview.querySelector('.markdown-body');
    if (!body) {
        return;
    }

    try {
        body.innerHTML = renderMarkdownToHtml(raw);
    } catch (err) {
        body.textContent = 'Preview rendering failed: ' + err.message;
    }
}

async function togglePreview() {
    previewActive = !previewActive;

    if (dom.previewToggle) {
        dom.previewToggle.setAttribute('aria-pressed', String(previewActive));
        dom.previewToggle.classList.toggle('active', previewActive);
    }

    if (previewActive) {
        try {
            await ensureMarkedLoaded();
        } catch (err) {
            console.error('Failed to load preview dependencies:', err);
            previewActive = false;
            if (dom.previewToggle) {
                dom.previewToggle.setAttribute('aria-pressed', 'false');
                dom.previewToggle.classList.remove('active');
            }
            return;
        }
        renderPreviewContent();
    }

    // Toggle visibility: hide editor, show preview (or vice versa)
    const cmWrapper = document.querySelector('.editor-section .CodeMirror');
    const textarea = dom.editorTextarea;

    if (previewActive) {
        if (cmWrapper) cmWrapper.style.display = 'none';
        else if (textarea) textarea.style.display = 'none';
        if (dom.editorPreview) dom.editorPreview.hidden = false;
    } else {
        if (cmWrapper) cmWrapper.style.display = '';
        else if (textarea) textarea.style.display = '';
        if (dom.editorPreview) dom.editorPreview.hidden = true;
        // Refresh CodeMirror after re-showing to fix layout
        if (cm?.refresh) {
            requestAnimationFrame(() => cm.refresh());
        }
    }
}

dom.previewToggle?.addEventListener('click', togglePreview);

async function getPrintStyles() {
    if (printStylesPromise) {
        return printStylesPromise;
    }

    const assetPaths = ['popup/lib/github-markdown.css', 'print/print.css'];
    printStylesPromise = Promise.all(assetPaths.map(async (assetPath) => {
        const response = await fetch(browser.runtime.getURL(assetPath));
        if (!response.ok) {
            throw new Error(`Failed to load print asset: ${assetPath}`);
        }

        return await response.text();
    })).then((parts) => parts.join('\n\n')).catch((error) => {
        printStylesPromise = null;
        throw error;
    });

    return printStylesPromise;
}

function buildPrintableDocument({ title, bodyHtml, styles }) {
    const safeTitle = escapeHtml(title || popupMessage('popupUntitledFallback', null, 'Untitled'));
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <style>${styles}</style>
</head>
<body>
  <main class="print-shell">
    <article class="markdown-body">
      ${bodyHtml}
    </article>
  </main>
</body>
</html>`;
}

function getCurrentExportTitle() {
    const fallbackTitle = popupMessage('popupUntitledFallback', null, 'Untitled');
    return String(dom.titleInput?.value || currentClipState.title || fallbackTitle).trim() || fallbackTitle;
}

function renderHtmlToPlainText(bodyHtml) {
    const parser = new DOMParser();
    const parsedDocument = parser.parseFromString(`<body>${bodyHtml}</body>`, 'text/html');
    const rawText = typeof parsedDocument.body.innerText === 'string'
        ? parsedDocument.body.innerText
        : (parsedDocument.body.textContent || '');

    return rawText
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function buildHtmlExportDocument(markdown, title) {
    const nextMarkdown = String(markdown || '').trim();
    if (!nextMarkdown) {
        throw new Error('No Markdown content available to export');
    }

    await ensureMarkedLoaded();
    const [styles] = await Promise.all([
        getPrintStyles()
    ]);
    const bodyHtml = renderMarkdownToHtml(nextMarkdown, { renderImages: true });

    return buildPrintableDocument({
        title,
        bodyHtml,
        styles
    });
}

async function buildGeneratedExport(kind, markdown, title) {
    const nextMarkdown = String(markdown || '').trim();
    if (!nextMarkdown) {
        throw new Error('No Markdown content available to export');
    }

    const exportType = resolveDefaultExportType({ defaultExportType: kind });
    const config = getExportTypeConfig(exportType);

    if (exportType === 'text') {
        await ensureMarkedLoaded();
        const bodyHtml = renderMarkdownToHtml(nextMarkdown, { renderImages: false });
        return {
            content: renderHtmlToPlainText(bodyHtml),
            fileExtension: config.fileExtension,
            mimeType: config.mimeType
        };
    }

    if (exportType === 'html') {
        return {
            content: await buildHtmlExportDocument(nextMarkdown, title),
            fileExtension: config.fileExtension,
            mimeType: config.mimeType
        };
    }

    throw new Error(`Unsupported generated export type: ${kind}`);
}

async function executePrintDocument(tabId, htmlDocument, kind) {
    return browser.scripting.executeScript({
        target: { tabId },
        func: async ({ htmlDocument: nextHtmlDocument, kind: nextKind }) => {
            const cleanupExisting = () => {
                document.getElementById('__marksnip-print-frame__')?.remove();
            };

            cleanupExisting();

            const iframe = document.createElement('iframe');
            iframe.id = '__marksnip-print-frame__';
            iframe.setAttribute('aria-hidden', 'true');
            iframe.style.position = 'fixed';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.opacity = '0';
            iframe.style.pointerEvents = 'none';
            iframe.style.border = '0';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.dataset.printKind = nextKind || 'print';
            iframe.srcdoc = nextHtmlDocument;
            document.documentElement.appendChild(iframe);

            const waitForFrameLoad = () => new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timed out while preparing print document')), 10000);
                iframe.addEventListener('load', () => {
                    clearTimeout(timeout);
                    resolve();
                }, { once: true });
            });

            const waitForImages = async (frameDocument) => {
                const images = Array.from(frameDocument.images || []).filter((image) => !image.complete);
                if (images.length === 0) {
                    return;
                }

                await Promise.race([
                    Promise.all(images.map((image) => new Promise((resolve) => {
                        image.addEventListener('load', resolve, { once: true });
                        image.addEventListener('error', resolve, { once: true });
                    }))),
                    new Promise((resolve) => setTimeout(resolve, 1500))
                ]);
            };

            try {
                await waitForFrameLoad();
                const frameWindow = iframe.contentWindow;
                const frameDocument = frameWindow?.document;
                if (!frameWindow || !frameDocument) {
                    throw new Error('Print frame is unavailable');
                }

                await waitForImages(frameDocument);
                await new Promise((resolve) => setTimeout(resolve, 100));

                const cleanup = () => {
                    setTimeout(cleanupExisting, 250);
                };

                frameWindow.addEventListener('afterprint', cleanup, { once: true });
                setTimeout(cleanup, 10000);
                frameWindow.focus();
                frameWindow.print();
                return { ok: true };
            } catch (error) {
                cleanupExisting();
                throw error;
            }
        },
        args: [{
            htmlDocument,
            kind
        }]
    });
}

async function handlePrintExport(kind = 'print', { markdown = getEditorValue(), title = getCurrentExportTitle() } = {}) {
    closeSplitDropdown();

    const nextMarkdown = String(markdown || '').trim();
    if (!nextMarkdown) {
        throw new Error('No Markdown content available to print');
    }

    const nextTitle = String(title || '').trim() || popupMessage('popupUntitledFallback', null, 'Untitled');
    const [htmlDocument, activeTab] = await Promise.all([
        buildHtmlExportDocument(nextMarkdown, nextTitle),
        getActiveTab()
    ]);

    if (!activeTab?.id) {
        throw new Error(popupMessage('popupNoActiveTabError', null, 'No active tab found'));
    }

    await executePrintDocument(activeTab.id, htmlDocument, kind);
}

function loadNotificationHostDeferred() {
    if (notificationHostLoadPromise) {
        return notificationHostLoadPromise;
    }

    notificationHostLoadPromise = loadScriptOnce('../notifications/notification-host.js', 'notification-host-script').catch((error) => {
        console.error('Failed to load notification host:', error);
        throw error;
    });
    return notificationHostLoadPromise;
}

async function getActiveTab(forceRefresh = false) {
    if (!forceRefresh && activeTabCache) {
        return activeTabCache;
    }

    if (!forceRefresh && activeTabPromise) {
        return activeTabPromise;
    }

    activeTabPromise = browser.tabs.query({
        currentWindow: true,
        active: true
    }).then((tabs) => {
        activeTabCache = tabs?.[0] || null;
        return activeTabCache;
    }).finally(() => {
        activeTabPromise = null;
    });

    return activeTabPromise;
}

async function getActiveTabId(forceRefresh = false) {
    return (await getActiveTab(forceRefresh))?.id ?? null;
}

function isRestrictedTabUrl(url) {
    if (!url) {
        return false;
    }

    return url.startsWith('chrome://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:') ||
        url.startsWith('moz-extension://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('view-source:');
}

function getRestrictedPageMessage(url) {
    if (!url) {
        return 'MarkSnip cannot clip this page.';
    }

    return `MarkSnip cannot clip this page: ${url}`;
}

async function resolveClipTargetTab(id) {
    if (!id) {
        return getActiveTab();
    }

    if (activeTabCache?.id === id) {
        return activeTabCache;
    }

    const tab = await browser.tabs.get(id).catch(() => null);
    if (tab?.id === id) {
        if (tab.active) {
            activeTabCache = tab;
        }
        return tab;
    }

    return null;
}

function resolveEditorTheme(editorTheme, isDark, specialTheme = 'none', colorBlindTheme = currentOptions?.colorBlindTheme) {
    const resolvedSpecialTheme = getResolvedSpecialThemeKey(specialTheme, colorBlindTheme);
    if (specialTheme !== 'none' && EDITOR_THEME_MAP[resolvedSpecialTheme]) {
        const specialEntry = EDITOR_THEME_MAP[resolvedSpecialTheme];
        return isDark ? specialEntry.dark : specialEntry.light;
    }

    const entry = EDITOR_THEME_MAP[editorTheme] || EDITOR_THEME_MAP.default;
    return isDark ? entry.dark : entry.light;
}

function buildPopupThemeCacheSnapshot(options = currentOptions || defaultOptions) {
    return {
        popupTheme: options?.popupTheme || 'system',
        specialTheme: options?.specialTheme || 'none',
        colorBlindTheme: normalizeColorBlindTheme(options?.colorBlindTheme),
        specialThemeIcon: options?.specialThemeIcon !== false,
        popupAccent: options?.popupAccent || 'sage',
        showThemeToggleInPopup: options?.showThemeToggleInPopup !== false,
        editorTheme: options?.editorTheme || 'default'
    };
}

function persistPopupThemeCache(options = currentOptions || defaultOptions) {
    try {
        localStorage.setItem(POPUP_THEME_CACHE_KEY, JSON.stringify(buildPopupThemeCacheSnapshot(options)));
    } catch (error) {
        console.debug('Unable to persist popup theme cache:', error);
    }
}

function applyThemeSettings(options) {
    const specialTheme = options.specialTheme || 'none';
    const isDark = resolvePopupDarkMode(options);
    const themeName = resolveEditorTheme(options.editorTheme || 'default', isDark, specialTheme, options.colorBlindTheme);
    const shouldAnimateThemeChange = hasAppliedThemeSettings &&
        (lastResolvedDarkMode !== isDark || lastResolvedThemeName !== themeName);

    // Apply theme mode
    dom.root.classList.remove('theme-light', 'theme-dark', 'theme-system');
    dom.root.classList.add('theme-' + (options.popupTheme || 'system'));

    dom.root.classList.remove(...SPECIAL_THEME_CLASS_NAMES);
    dom.root.classList.remove(...COLORBLIND_VARIANT_CLASS_NAMES);
    if (specialTheme !== 'none') {
        dom.root.classList.add('special-theme-' + specialTheme);
        if (specialTheme === 'colorblind') {
            dom.root.classList.add(getColorBlindThemeClassName(options.colorBlindTheme));
        }
    }

    dom.root.classList.toggle('hide-theme-icon', options.specialThemeIcon === false);
    dom.root.classList.toggle('hide-popup-theme-toggle', options.showThemeToggleInPopup === false);

    // Apply accent color
    dom.root.classList.remove(...ACCENT_CLASS_NAMES);
    const accent = options.popupAccent || 'sage';
    if (specialTheme === 'none' && accent !== 'sage') {
        dom.root.classList.add('accent-' + accent);
    }

    // Compact mode
    dom.body.classList.toggle('compact-mode', !!options.compactMode);

    // Update CodeMirror theme based on resolved dark mode + editor theme
    darkMode = isDark;
    if (shouldAnimateThemeChange) {
        beginThemeTransition(lastResolvedThemeName !== themeName);
    }
    ensureEditorThemeStylesheet(themeName);
    if (typeof cm !== 'undefined' && cm) {
        cm.setOption('theme', themeName);
    }

    updateThemeToggleButton(options);

    // Re-render preview if active (theme classes affect preview styling)
    if (previewActive) {
        renderPreviewContent();
    }

    hasAppliedThemeSettings = true;
    lastResolvedDarkMode = isDark;
    lastResolvedThemeName = themeName;
    persistPopupThemeCache(options);
}

// Char/word/token counter
let countMode = 'chars';
let _lastCounterText = '';

function updateCharCount(value) {
    _lastCounterText = value;
    if (!dom.charCount) return;
    dom.charCount.textContent = formatCounterDisplay(value, countMode);
}

dom.charCount?.addEventListener('click', () => {
    const idx = COUNT_MODES.indexOf(countMode);
    countMode = COUNT_MODES[(idx + 1) % COUNT_MODES.length];
    updateCharCount(_lastCounterText);
    browser.storage.local.set({ countMode });
});

function getCardCountDisplay(markdown, mode) {
    return formatCounterDisplay(markdown, mode);
}

function updateAllCardCountBadges() {
    if (!libraryUI.list) return;
    libraryUI.list.querySelectorAll('.library-card-count-badge').forEach((badge) => {
        const id = badge.dataset.itemId;
        const entry = libraryItems.find((i) => i.id === id);
        if (entry !== undefined) {
            badge.textContent = getCardCountDisplay(entry.markdown || '', libraryCardCountMode);
        }
    });
}
dom.downloadButton?.addEventListener("click", download);
dom.downloadSelectionButton?.addEventListener("click", downloadSelection);
dom.titleInput?.addEventListener("input", (event) => {
    currentClipState.title = event.target.value;
    queuePersistAgentBridgeClip();
});

dom.copyButton?.addEventListener("click", copyToClipboard);
dom.copySelectionButton?.addEventListener("click", copySelectionToClipboard);

dom.sendToObsidianButton?.addEventListener("click", sendToObsidian);
dom.splitButtonArrow?.addEventListener("click", toggleSplitDropdown);
dom.sendToChatgptButton?.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
        await handleSendToAction('chatgpt', { triggerButton: dom.downloadButton });
    } catch (error) {
        console.error('Error sending to ChatGPT:', error);
    }
});
dom.sendToClaudeButton?.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
        await handleSendToAction('claude', { triggerButton: dom.downloadButton });
    } catch (error) {
        console.error('Error sending to Claude:', error);
    }
});
dom.sendToPerplexityButton?.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
        await handleSendToAction('perplexity', { triggerButton: dom.downloadButton });
    } catch (error) {
        console.error('Error sending to Perplexity:', error);
    }
});
dom.markdownButton?.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
        await handleExplicitExport('markdown');
    } catch (error) {
        console.error('Error exporting Markdown:', error);
    }
});
dom.textButton?.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
        await handleExplicitExport('text');
    } catch (error) {
        console.error('Error exporting plain text:', error);
    }
});
dom.htmlButton?.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
        await handleExplicitExport('html');
    } catch (error) {
        console.error('Error exporting HTML:', error);
    }
});
dom.printButton?.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
        await handleExplicitExport('print');
    } catch (error) {
        console.error('Error starting print flow:', error);
    }
});
dom.pdfButton?.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
        await handleExplicitExport('pdf');
    } catch (error) {
        console.error('Error starting PDF flow:', error);
    }
});

document.getElementById("batchProcess").addEventListener("click", showBatchProcess);
dom.startBatchButton?.addEventListener("click", handleStartBatch);
document.getElementById("cancelBatch").addEventListener("click", hideBatchProcess);
libraryUI.toggle?.addEventListener("click", showLibraryView);
libraryUI.close?.addEventListener("click", hideLibraryView);
libraryUI.saveButton?.addEventListener("click", handleManualLibrarySave);
libraryUI.exportButton?.addEventListener("click", toggleExportDropdown);
libraryUI.exportDropdownMenu?.addEventListener("click", handleExportDropdownChoice);
document.addEventListener("click", closeExportDropdownOnOutsideClick);
document.addEventListener("keydown", handlePopupKeydown);
dom.themeToggleButton?.addEventListener('click', handleThemeToggleClick);
dom.openGuideButton?.addEventListener('click', toggleGuideDropdown);
dom.guideLink?.addEventListener('click', closeGuideDropdown);
dom.showShortcutsBtn?.addEventListener('click', showShortcutsModal);
dom.closeShortcutsModalBtn?.addEventListener('click', closeShortcutsModal);
dom.shortcutsModalBackdrop?.addEventListener('click', closeShortcutsModal);
dom.shortcutsModalBody?.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="open-shortcut-settings"]')) {
        browser.tabs.create({ url: 'chrome://extensions/shortcuts' });
    }
});
dom.pickLinksButton?.addEventListener("click", activateLinkPicker);
dom.pickElementButton?.addEventListener("click", activateElementPicker);
document.querySelectorAll('[data-capture-method]').forEach((card) => {
    card.addEventListener('click', () => setCaptureMethod(card.dataset.captureMethod));
});
document.querySelectorAll('[data-output-format]').forEach((card) => {
    card.addEventListener('click', () => setOutputFormat(card.dataset.outputFormat));
});
dom.batchLinkList?.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-remove-link]');
    if (removeBtn) {
        const index = Number(removeBtn.dataset.removeLink);
        if (Number.isInteger(index)) {
            batchPickedLinks.splice(index, 1);
            renderBatchPickedLinks();
            saveBatchSettings();
            updateStartBatchButton();
        }
        return;
    }
    if (e.target.closest('[data-clear-links]')) {
        batchPickedLinks = [];
        renderBatchPickedLinks();
        saveBatchSettings();
        updateStartBatchButton();
    }
});
progressUI.cancelBtn?.addEventListener("click", () => {
    browser.runtime.sendMessage({ type: 'cancel-batch' }).catch(() => {});
    progressUI.cancelBtn.disabled = true;
    progressUI.cancelBtn.textContent = popupMessage('popupCancelling', null, 'Cancelling...');
});

const CAPTURE_METHODS = ['manual', 'pick', 'click'];
const OUTPUT_FORMATS = ['zip', 'individual', 'combined'];

const BATCH_STEP2_META = {
    manual: {
        titleKey: 'popupBatchStepUrlsTitle',
        titleFallback: 'URLs',
        descKey: null,
        descFallback: '',
        hintKey: 'popupBatchStepUrlsHint',
        hintFallback: 'One per line'
    },
    pick: {
        titleKey: 'popupBatchStepLinksTitle',
        titleFallback: 'Links to Capture',
        descKey: 'popupBatchStepLinksDesc',
        descFallback: 'Collect links from the current page and add them to the batch list.',
        hintKey: null,
        hintFallback: ''
    },
    click: {
        titleKey: 'popupBatchStepElementsTitle',
        titleFallback: 'Elements to Capture',
        descKey: 'popupBatchStepElementsDesc',
        descFallback: 'Click & Clip runs directly on the active tab.',
        hintKey: null,
        hintFallback: ''
    }
};

function getSelectedOutputFormat() {
    return OUTPUT_FORMATS.includes(batchOutputFormat) ? batchOutputFormat : 'zip';
}

// Translate the unified output format into Click & Clip's two-axis model.
function clickClipModesFromOutputFormat(format) {
    if (format === 'combined') {
        return { clickClipOutputMode: 'combined', batchSaveMode: 'zip' };
    }
    if (format === 'individual') {
        return { clickClipOutputMode: 'files', batchSaveMode: 'individual' };
    }
    return { clickClipOutputMode: 'files', batchSaveMode: 'zip' };
}

function syncCaptureMethodUi() {
    document.querySelectorAll('[data-capture-method]').forEach((card) => {
        const selected = card.dataset.captureMethod === batchCaptureMethod;
        card.classList.toggle('is-selected', selected);
        card.setAttribute('aria-checked', String(selected));
    });
    document.querySelectorAll('[data-capture-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.capturePanel !== batchCaptureMethod;
    });

    const meta = BATCH_STEP2_META[batchCaptureMethod] || BATCH_STEP2_META.manual;
    const title = meta.titleKey ? popupMessage(meta.titleKey, null, meta.titleFallback) : meta.titleFallback;
    const desc = meta.descKey ? popupMessage(meta.descKey, null, meta.descFallback) : meta.descFallback;
    const hint = meta.hintKey ? popupMessage(meta.hintKey, null, meta.hintFallback) : meta.hintFallback;

    if (dom.batchStep2Title) dom.batchStep2Title.textContent = title;
    if (dom.batchStep2Desc) {
        dom.batchStep2Desc.textContent = desc;
        dom.batchStep2Desc.hidden = !desc;
    }
    if (dom.batchStep2Hint) {
        dom.batchStep2Hint.textContent = hint;
        dom.batchStep2Hint.hidden = !hint;
    }
}

function syncOutputFormatUi() {
    document.querySelectorAll('[data-output-format]').forEach((card) => {
        const selected = card.dataset.outputFormat === batchOutputFormat;
        card.classList.toggle('is-selected', selected);
        card.setAttribute('aria-checked', String(selected));
    });
}

function setCaptureMethod(method, { persist = true } = {}) {
    if (!CAPTURE_METHODS.includes(method)) return;
    batchCaptureMethod = method;
    syncCaptureMethodUi();
    if (method === 'manual') {
        validateAndPreviewUrls();
    } else {
        updateStartBatchButton();
    }
    if (persist) saveBatchSettings();
}

function setOutputFormat(format, { persist = true } = {}) {
    if (!OUTPUT_FORMATS.includes(format)) return;
    batchOutputFormat = format;
    syncOutputFormatUi();
    if (persist) saveBatchSettings();
}

// Reflect the Start button label/disabled state for the active capture method.
function updateStartBatchButton() {
    const button = dom.startBatchButton;
    if (!button) return;

    if (dom.startBatchLabel) {
        dom.startBatchLabel.textContent = batchCaptureMethod === 'click'
            ? popupMessage('popupBatchStartClickClipBtn', null, 'Start Click & Clip')
            : popupMessage('popupBatchStartProcessingBtn', null, 'Start Batch Processing');
    }

    let disabled = false;
    if (batchCaptureMethod === 'manual') {
        const trimmed = (dom.urlList?.value || '').trim();
        disabled = trimmed.length > 0 && batchManualValidCount === 0;
    } else if (batchCaptureMethod === 'pick') {
        disabled = batchPickedLinks.length === 0;
    }
    button.disabled = disabled;
}

// Render the picked-links list (or empty state) for the Pick Links method.
function renderBatchPickedLinks() {
    const list = dom.batchLinkList;
    if (!list) return;

    list.querySelectorAll('.batch-link-list-head, .batch-link-row').forEach((node) => node.remove());
    const emptyState = document.getElementById('batchLinkEmpty');

    if (batchPickedLinks.length === 0) {
        if (emptyState) emptyState.hidden = false;
        return;
    }
    if (emptyState) emptyState.hidden = true;

    const head = document.createElement('div');
    head.className = 'batch-link-list-head';
    const count = document.createElement('span');
    count.textContent = batchPickedLinks.length === 1
        ? popupMessage('popupBatchLinksSelectedOne', null, '1 link selected')
        : popupMessage('popupBatchLinksSelectedMany', [batchPickedLinks.length], `${batchPickedLinks.length} links selected`);
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'batch-link-clear';
    clear.dataset.clearLinks = 'true';
    clear.textContent = popupMessage('popupBatchClearLinksBtn', null, 'Clear all');
    head.append(count, clear);
    list.appendChild(head);

    batchPickedLinks.forEach((url, index) => {
        const row = document.createElement('div');
        row.className = 'batch-link-row';
        const urlEl = document.createElement('span');
        urlEl.className = 'batch-link-row__url';
        urlEl.textContent = url;
        urlEl.title = url;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'batch-link-row__remove';
        remove.dataset.removeLink = String(index);
        remove.setAttribute('aria-label', popupMessage('popupBatchRemoveLinkAria', null, 'Remove link'));
        remove.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        row.append(urlEl, remove);
        list.appendChild(row);
    });
}

// Save batch settings to storage
function saveBatchSettings() {
    browser.storage.local.set({
        batchUrlList: dom.urlList?.value || '',
        batchCaptureMethod,
        batchOutputFormat,
        batchPickedLinks
    }).catch(err => {
        console.error("Error saving batch settings:", err);
    });
}

// Load batch settings from storage
async function loadBatchSettings() {
    try {
        const data = await browser.storage.local.get([
            'batchUrlList', 'batchCaptureMethod', 'batchOutputFormat', 'batchPickedLinks',
            'batchSaveMode', 'clickClipOutputMode'
        ]);
        if (data.batchUrlList && dom.urlList) {
            dom.urlList.value = data.batchUrlList;
        }

        batchCaptureMethod = CAPTURE_METHODS.includes(data.batchCaptureMethod)
            ? data.batchCaptureMethod
            : 'manual';

        // Prefer the unified key; otherwise migrate from the pre-redesign
        // settings — a legacy "individual" save mode or a legacy "combined"
        // Click & Clip output each carry forward to the matching format.
        let format = data.batchOutputFormat;
        if (!OUTPUT_FORMATS.includes(format)) {
            if (data.batchSaveMode === 'individual') {
                format = 'individual';
            } else if (data.clickClipOutputMode === 'combined') {
                format = 'combined';
            } else {
                format = 'zip';
            }
        }
        batchOutputFormat = format;

        batchPickedLinks = Array.isArray(data.batchPickedLinks)
            ? data.batchPickedLinks.filter((url) => typeof url === 'string' && url)
            : [];

        syncCaptureMethodUi();
        syncOutputFormatUi();
        renderBatchPickedLinks();
        validateAndPreviewUrls();
        batchSettingsLoaded = true;
        return data;
    } catch (err) {
        console.error("Error loading batch settings:", err);
        return null;
    }
}

function ensureBatchSettingsLoaded() {
    if (batchSettingsLoaded) {
        return Promise.resolve();
    }

    if (batchSettingsLoadPromise) {
        return batchSettingsLoadPromise;
    }

    batchSettingsLoadPromise = loadBatchSettings().finally(() => {
        batchSettingsLoadPromise = null;
    });
    return batchSettingsLoadPromise;
}

// Save batch URL list as user types and validate
dom.urlList?.addEventListener("input", () => {
    saveBatchSettings();
    debouncedValidateUrls();
});

async function showBatchProcess(e) {
    e.preventDefault();
    if (currentOptions?.batchProcessingEnabled === false) {
        showError(popupMessage('popupBatchDisabledError', null, 'Batch Processing is disabled in Options'), false);
        return;
    }

    showBatchView();
    await ensureBatchSettingsLoaded();

    // Check if there are pending link picker results from storage
    try {
        const result = await browser.storage.local.get(['linkPickerResults', 'linkPickerTimestamp']);
        if (result.linkPickerResults && result.linkPickerResults.length > 0) {
            // Check if results are recent (within last 30 seconds)
            const age = Date.now() - (result.linkPickerTimestamp || 0);
            if (age < 30000) {
                console.log(`Found ${result.linkPickerResults.length} links from link picker`);
                handleLinkPickerComplete(result.linkPickerResults);
                // Clear the stored results after using them
                await browser.storage.local.remove(['linkPickerResults', 'linkPickerTimestamp']);
            }
        }
    } catch (err) {
        console.error("Error checking for link picker results:", err);
    }
}

function hideBatchProcess(e) {
    e.preventDefault();
    showMainView();
}

async function activateLinkPicker(e) {
    e.preventDefault();

    try {
        const activeTab = await getActiveTab();
        if (!activeTab?.id) {
            console.error("No active tab found");
            return;
        }

        // Ensure content script is injected
        await browser.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ["/browser-polyfill.min.js", "/shared/i18n.js", "/contentScript/contentScript.js"]
        }).catch(err => {
            // Script might already be injected, that's okay
            console.log("Content script may already be injected:", err);
        });

        // Send message to activate link picker mode
        await browser.tabs.sendMessage(activeTab.id, {
            type: "ACTIVATE_LINK_PICKER"
        });

        // Focus the tab to bring it to front
        await browser.tabs.update(activeTab.id, { active: true });

    } catch (error) {
        console.error("Error activating link picker:", error);
        alert(popupMessage('popupAlertFailedToActivateLinkPicker', null, 'Failed to activate link picker. Please try again.'));
    }
}

async function activateClickClip(e) {
    e.preventDefault();

    try {
        const activeTab = await getActiveTab();
        if (!activeTab?.id) {
            throw new Error(popupMessage('popupNoActiveTabError', null, 'No active tab found'));
        }

        if (isRestrictedTabUrl(activeTab.url || '')) {
            showError(getRestrictedPageMessage(activeTab.url || ''));
            return;
        }

        // Ensure content script is injected
        await browser.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ["/browser-polyfill.min.js", "/shared/i18n.js", "/contentScript/contentScript.js"]
        }).catch(err => {
            console.log("Content script may already be injected:", err);
        });

        // Persist current settings, then seed the in-page picker with them.
        await ensureBatchSettingsLoaded();
        const clickClipModes = clickClipModesFromOutputFormat(getSelectedOutputFormat());
        const response = await browser.tabs.sendMessage(activeTab.id, {
            type: "ACTIVATE_CLICK_CLIP",
            captureOptions: {
                skipHiddenContent: currentOptions?.skipHiddenContent === true
            },
            clickClipOutputMode: clickClipModes.clickClipOutputMode,
            batchSaveMode: clickClipModes.batchSaveMode
        });
        if (response?.success === false) {
            throw new Error(response.error || popupMessage('popupAlertFailedToActivateClickClip', null, 'Failed to activate Click & Clip. Please try again.'));
        }

        // Focus the tab — the picker runs in-page and the popup closes.
        await browser.tabs.update(activeTab.id, { active: true });
        window.close();
    } catch (error) {
        console.error("Error activating Click & Clip:", error);
        alert(popupMessage('popupAlertFailedToActivateClickClip', null, 'Failed to activate Click & Clip. Please try again.'));
    }
}

function setElementPickerButtonFeedback(label, state = null) {
    const button = dom.pickElementButton;
    if (!button) {
        return;
    }

    const normalizedState = ['pending', 'success', 'error'].includes(state) ? state : 'idle';
    button.classList.remove('success', 'error');
    if (normalizedState === 'success' || normalizedState === 'error') {
        button.classList.add(normalizedState);
    }
    button.dataset.state = normalizedState;

    const labelElement = button.querySelector('.element-picker-label') || button.querySelector('span');
    if (labelElement) {
        labelElement.textContent = label;
    }
    button.title = label;
    button.setAttribute('aria-label', label);
}

function resetElementPickerButtonFeedback() {
    setElementPickerButtonFeedback(popupMessage('popupPickElementBtn', null, 'Pick Element'));
}

async function activateElementPicker(e) {
    e.preventDefault();

    try {
        if (currentOptions?.elementPickerEnabled === false) {
            return;
        }

        const activeTab = await getActiveTab();
        if (!activeTab?.id) {
            throw new Error(popupMessage('popupNoActiveTabError', null, 'No active tab found'));
        }

        if (isRestrictedTabUrl(activeTab.url || '')) {
            showError(getRestrictedPageMessage(activeTab.url || ''));
            return;
        }

        setElementPickerButtonFeedback(popupMessage('popupPickElementStarting', null, 'Picking on page...'), 'pending');

        await browser.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ["/browser-polyfill.min.js", "/shared/i18n.js", "/contentScript/contentScript.js"]
        }).catch(err => {
            console.log("Content script may already be injected:", err);
        });

        const response = await browser.tabs.sendMessage(activeTab.id, {
            type: "ACTIVATE_ELEMENT_PICKER",
            captureOptions: {
                skipHiddenContent: currentOptions?.skipHiddenContent === true
            }
        });
        if (response?.success === false) {
            throw new Error(response.error || popupMessage('popupAlertFailedToActivateElementPicker', null, 'Failed to activate element picker. Please try again.'));
        }

        setElementPickerButtonFeedback(popupMessage('popupPickElementStarting', null, 'Picking on page...'), 'success');
        await browser.tabs.update(activeTab.id, { active: true });
        setTimeout(resetElementPickerButtonFeedback, 1200);
    } catch (error) {
        console.error("Error activating element picker:", error);
        setElementPickerButtonFeedback(popupMessage('popupPickElementFailed', null, 'Picker failed'), 'error');
        setTimeout(resetElementPickerButtonFeedback, 2200);
        alert(popupMessage('popupAlertFailedToActivateElementPicker', null, 'Failed to activate element picker. Please try again.'));
    }
}

const defaultOptions = {
    includeTemplate: false,
    clipSelection: true,
    downloadImages: false,
    skipHiddenContent: false,
    defaultExportType: 'markdown',
    defaultSendToTarget: DEFAULT_SEND_TO_TARGET,
    sendToCustomTargets: [],
    sendToMaxUrlLength: DEFAULT_SEND_TO_MAX_URL_LENGTH,
    webhookTargets: [],
    obsidianIntegration: false,
    batchProcessingEnabled: true,
    popupTheme: 'system',
    specialTheme: 'none',
    colorBlindTheme: 'deuteranopia',
    specialThemeIcon: true,
    popupAccent: 'sage',
    compactMode: false,
    elementPickerEnabled: true,
    elementPickerDoneAction: 'popup',
    showThemeToggleInPopup: true,
    showUserGuideIcon: true,
    editorTheme: 'default',
}
currentOptions = normalizePopupOptions({ ...defaultOptions });

const updateObsidianButtonVisibility = (options) => {
    if (!dom.sendToObsidianButton) return;
    dom.sendToObsidianButton.style.display = options.obsidianIntegration ? "inline-flex" : "none";
}

const updateGuideButtonVisibility = (options) => {
    if (!dom.guideDropdownWrap) return;
    const shouldShow = options.showUserGuideIcon !== false;
    dom.guideDropdownWrap.hidden = !shouldShow;
    dom.guideDropdownWrap.style.display = shouldShow ? "" : "none";
    dom.guideDropdownWrap.setAttribute("aria-hidden", String(!shouldShow));
}

const updateBatchProcessButtonVisibility = (options) => {
    if (!dom.batchProcessButton) return;

    const batchProcessingEnabled = options.batchProcessingEnabled !== false;
    dom.batchProcessButton.hidden = !batchProcessingEnabled;
    dom.batchProcessButton.style.display = batchProcessingEnabled ? "" : "none";
    dom.batchProcessButton.setAttribute("aria-hidden", String(!batchProcessingEnabled));

    if (!batchProcessingEnabled && activePopupView === 'batch' && progressUI.container?.style.display !== 'flex') {
        showMainView();
    }
}

function resolveClipPageUrl(article = {}) {
    const api = getLibraryStateApi();
    const candidates = [
        article?.pageURL,
        article?.tabURL,
        article?.pageUrl,
        article?.baseURI
    ];

    for (const candidate of candidates) {
        if (!candidate) continue;
        const normalized = api?.normalizePageUrl ? api.normalizePageUrl(candidate) : String(candidate).trim();
        if (normalized) {
            return normalized;
        }
    }

    return '';
}

function updateCurrentClipState(nextState = {}) {
    const normalizeKeywords = globalThis.markSnipWebhookUtils?.normalizeWebhookKeywords
        || ((v) => Array.isArray(v) ? v.filter(k => String(k || '').trim()) : []);
    currentClipState = {
        title: String(nextState.title || '').trim(),
        markdown: String(nextState.markdown || ''),
        pageUrl: String(nextState.pageUrl || '').trim(),
        excerpt: String(nextState.excerpt || ''),
        byline: String(nextState.byline || ''),
        keywords: normalizeKeywords(nextState.keywords),
        publishedTime: String(nextState.publishedTime || '').trim()
    };
    updateSaveLibraryButtonState();
    queuePersistAgentBridgeClip(currentClipState);
}

function isPendingElementPickerResultForTab(result, tab) {
    if (!result || !tab?.id) {
        return false;
    }

    const capturedAt = Number(result.capturedAt || 0);
    if (!capturedAt || Date.now() - capturedAt > ELEMENT_PICKER_RESULT_MAX_AGE_MS) {
        return false;
    }

    if (Number.isInteger(result.tabId) && result.tabId === tab.id) {
        return true;
    }

    const resultUrl = String(result.pageUrl || result.article?.pageURL || result.article?.tabURL || '').trim();
    const tabUrl = String(tab.url || '').trim();
    return Boolean(resultUrl && tabUrl && resultUrl === tabUrl);
}

async function consumePendingElementPickerResult(activeTab) {
    try {
        const stored = await browser.storage.local.get(ELEMENT_PICKER_RESULT_STORAGE_KEY);
        const pendingResult = stored?.[ELEMENT_PICKER_RESULT_STORAGE_KEY];

        if (!pendingResult) {
            return false;
        }

        if (!isPendingElementPickerResultForTab(pendingResult, activeTab)) {
            if (Number(pendingResult.capturedAt || 0) &&
                Date.now() - Number(pendingResult.capturedAt || 0) > ELEMENT_PICKER_RESULT_MAX_AGE_MS) {
                await browser.storage.local.remove(ELEMENT_PICKER_RESULT_STORAGE_KEY);
            }
            return false;
        }

        await browser.storage.local.remove(ELEMENT_PICKER_RESULT_STORAGE_KEY);
        notify({
            type: 'display.md',
            markdown: pendingResult.markdown,
            article: pendingResult.article,
            imageList: pendingResult.imageList,
            sourceImageMap: pendingResult.sourceImageMap,
            mdClipsFolder: pendingResult.mdClipsFolder,
            options: pendingResult.effectiveOptions || currentOptions,
            effectiveOptions: pendingResult.effectiveOptions || null,
            matchedSiteRule: pendingResult.matchedSiteRule || null,
            overriddenKeys: Array.isArray(pendingResult.overriddenKeys) ? pendingResult.overriddenKeys : []
        });
        showOrHideClipOption(false);
        return true;
    } catch (error) {
        console.error('Failed to load pending element picker result:', error);
        return false;
    }
}

const updateElementPickerButtonVisibility = (options) => {
    const shouldShow = options?.elementPickerEnabled !== false;
    const target = dom.elementPickerRow || dom.pickElementButton;
    if (!target) return;

    target.hidden = !shouldShow;
    target.style.display = shouldShow ? "" : "none";
    target.setAttribute("aria-hidden", String(!shouldShow));
    target.closest('.quick-actions-row')?.classList.toggle('is-picker-hidden', !shouldShow);
    if (dom.pickElementButton) {
        dom.pickElementButton.disabled = !shouldShow;
    }
}

function clonePopupOptionsSnapshot(source = currentOptions || defaultOptions) {
    const nextOptions = {
        ...(source || {})
    };
    if (source?.tableFormatting && typeof source.tableFormatting === 'object') {
        nextOptions.tableFormatting = {
            ...source.tableFormatting
        };
    }
    if (Array.isArray(source?.siteRules)) {
        nextOptions.siteRules = source.siteRules.map((rule) => ({ ...rule }));
    }
    if (Array.isArray(source?.sendToCustomTargets)) {
        nextOptions.sendToCustomTargets = source.sendToCustomTargets.map((target) => ({ ...target }));
    }
    return nextOptions;
}

function isActiveRuleOverriding(fieldName) {
    return Array.isArray(activeSiteRuleState.overriddenKeys) &&
        activeSiteRuleState.overriddenKeys.includes(fieldName);
}

function getPopupExportOptions() {
    const base = activeSiteRuleState.effectiveOptions || currentOptions || defaultOptions;
    const nextOptions = clonePopupOptionsSnapshot(base);

    if (dom.includeTemplate) {
        nextOptions.includeTemplate = dom.includeTemplate.checked;
    }
    if (dom.downloadImages) {
        nextOptions.downloadImages = dom.downloadImages.checked;
    }

    return nextOptions;
}

function updateRuleOverrideHint(fieldName, hintEl, inputEl) {
    if (!hintEl || !inputEl) {
        return;
    }

    const overridden = isActiveRuleOverriding(fieldName);
    const ruleName = activeSiteRuleState.matchedRule?.name || 'Site Rule';
    hintEl.hidden = !overridden;
    hintEl.textContent = overridden ? `Overridden by ${ruleName}` : '';
    inputEl.disabled = overridden;
    inputEl.closest('.toggle-label')?.classList.toggle('is-locked', overridden);
}

function applyActiveSiteRuleUi(sourceOptions = currentOptions || defaultOptions) {
    const effectiveOptions = activeSiteRuleState.effectiveOptions || sourceOptions || defaultOptions;

    if (dom.includeTemplate) {
        dom.includeTemplate.checked = Boolean(effectiveOptions.includeTemplate);
    }
    if (dom.downloadImages) {
        dom.downloadImages.checked = Boolean(effectiveOptions.downloadImages);
    }

    updateRuleOverrideHint('includeTemplate', dom.includeTemplateRuleHint, dom.includeTemplate);
    updateRuleOverrideHint('downloadImages', dom.downloadImagesRuleHint, dom.downloadImages);
}

function setActiveSiteRuleState(matchedRule = null, overriddenKeys = [], effectiveOptions = null) {
    activeSiteRuleState = {
        matchedRule: matchedRule && typeof matchedRule === 'object'
            ? {
                id: matchedRule.id || '',
                name: matchedRule.name || '',
                pattern: matchedRule.pattern || ''
            }
            : null,
        overriddenKeys: Array.isArray(overriddenKeys) ? overriddenKeys.slice() : [],
        effectiveOptions: effectiveOptions ? clonePopupOptionsSnapshot(effectiveOptions) : null
    };

    applyActiveSiteRuleUi(currentOptions || defaultOptions);
}

function hasSavableClip() {
    return Boolean(currentClipState.pageUrl && currentClipState.markdown.trim());
}

function updateSaveLibraryButtonState() {
    if (!libraryUI.saveButton) {
        return;
    }

    const manualMode = librarySettings?.enabled && !librarySettings?.autoSaveOnPopupOpen;
    libraryUI.saveButton.hidden = !manualMode;
    libraryUI.saveButton.style.display = manualMode ? 'flex' : 'none';
    libraryUI.saveButton.disabled = !manualMode || !hasSavableClip();
}

function updateLibraryExportButtonState() {
    if (!libraryUI.exportButton) {
        return;
    }

    const hasItems = libraryItems.length > 0;
    libraryUI.exportButton.disabled = libraryExportInProgress || !hasItems;
    libraryUI.exportButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        ${libraryExportInProgress ? 'Exporting...' : 'Export All'}
        <svg class="export-dropdown-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"/>
        </svg>
    `;

    if (libraryExportInProgress) {
        closeExportDropdown();
    }
}

function setLibraryStatus(message = '', isError = false) {
    if (!libraryUI.status) {
        return;
    }

    libraryUI.status.textContent = message;
    libraryUI.status.style.color = isError ? 'var(--error)' : 'var(--accent-dark)';
}

function formatSavedAt(savedAt) {
    if (!savedAt) {
        return '';
    }

    const date = new Date(savedAt);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

async function copyLibraryItemMarkdown(itemId, buttonElement) {
    const item = libraryItems.find((entry) => entry.id === itemId);
    if (!item?.markdown) {
        return;
    }

    try {
        await navigator.clipboard.writeText(item.markdown);

        if (buttonElement) {
            const originalHTML = buttonElement.innerHTML;
            buttonElement.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                Copied!
            `;
            buttonElement.classList.add("success");
            setTimeout(() => {
                buttonElement.innerHTML = originalHTML;
                buttonElement.classList.remove("success");
            }, 2000);
        }
    } catch (error) {
        console.error('Failed to copy library item:', error);

        if (buttonElement) {
            const originalHTML = buttonElement.innerHTML;
            buttonElement.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/>
                </svg>
                Failed
            `;
            buttonElement.classList.add("error");
            setTimeout(() => {
                buttonElement.innerHTML = originalHTML;
                buttonElement.classList.remove("error");
            }, 2000);
        }
    }
}

async function deleteLibraryItem(itemId) {
    const api = getLibraryStateApi();
    if (!api) {
        return;
    }

    const item = libraryItems.find((entry) => entry.id === itemId);
    const itemTitle = item?.title || popupMessage('popupUntitledFallback', null, 'Untitled');
    const filtered = libraryItems.filter((entry) => entry.id !== itemId);

    try {
        libraryItems = await api.saveLibraryItems(filtered);
        syncLibrarySummaryUi();
        if (isLibraryViewVisible()) {
            renderLibraryItems();
        }
        setLibraryStatus(`Removed "${itemTitle}"`);
    } catch (error) {
        console.error('Failed to delete library item:', error);
        setLibraryStatus('Failed to remove clip', true);
    }
}

function animateDeleteLibraryItem(itemId, cardEl) {
    cardEl.classList.add('library-card--removing');
    let settled = false;
    function proceed() {
        if (settled) return;
        settled = true;
        deleteLibraryItem(itemId);
    }
    cardEl.addEventListener('animationend', proceed, { once: true });
    setTimeout(proceed, 400);
}

function syncLibrarySummaryUi() {
    if (libraryUI.countBadge) {
        libraryUI.countBadge.textContent = String(libraryItems.length);
    }
    updateLibraryExportButtonState();
}

function getLibraryRenderStateKey() {
    return JSON.stringify({
        items: libraryItems.map((item) => ({
            id: item.id,
            title: item.title,
            markdown: item.markdown,
            pageUrl: item.pageUrl,
            previewText: item.previewText,
            savedAt: item.savedAt
        })),
        autoSaveEnabled: librarySettings?.autoSaveOnPopupOpen !== false,
        currentPageUrl: currentClipState.pageUrl,
        countMode: libraryCardCountMode
    });
}

function renderLibraryItems(options = {}) {
    const { force = false } = options;
    if (!libraryUI.list || !libraryUI.emptyState || !libraryUI.emptyText || !libraryUI.countBadge) {
        return;
    }

    syncLibrarySummaryUi();

    const autoSaveEnabled = librarySettings?.autoSaveOnPopupOpen !== false;
    libraryUI.emptyText.textContent = autoSaveEnabled
        ? popupMessage('popupLibraryAutoSaveEmpty', null, 'Open the popup on any page and the current clip will be saved here automatically.')
        : popupMessage('popupLibraryManualModeEmpty', null, 'Manual mode is on. Use "Save Clip" to add the current page to your local library.');
    libraryUI.emptyState.hidden = libraryItems.length > 0;

    const nextRenderStateKey = getLibraryRenderStateKey();
    if (!force && nextRenderStateKey === lastRenderedLibraryStateKey) {
        return;
    }

    lastRenderedLibraryStateKey = nextRenderStateKey;
    libraryUI.list.innerHTML = '';

    const api = getLibraryStateApi();
    const currentNormalized = api?.normalizePageUrl(currentClipState.pageUrl) || '';

    libraryItems.forEach((item, index) => {
        const card = document.createElement('article');
        card.className = 'library-card';
        card.setAttribute('role', 'listitem');
        card.style.animationDelay = `${index * 40}ms`;

        const itemNormalized = item.normalizedPageUrl || (api?.normalizePageUrl(item.pageUrl) ?? '');
        if (currentNormalized && itemNormalized && currentNormalized === itemNormalized) {
            card.classList.add('library-card--current');
        }

        const header = document.createElement('div');
        header.className = 'library-card-header';

        const title = document.createElement('h3');
        title.className = 'library-card-title';
        title.textContent = item.title || popupMessage('popupUntitledFallback', null, 'Untitled');

        const timestamp = document.createElement('time');
        timestamp.className = 'library-card-time';
        timestamp.dateTime = item.savedAt || '';
        timestamp.textContent = formatSavedAt(item.savedAt);

        header.appendChild(title);
        header.appendChild(timestamp);

        const preview = document.createElement('p');
        preview.className = 'library-card-preview';
        preview.textContent = item.previewText || '';

        const source = document.createElement('a');
        source.className = 'library-card-source';
        source.href = item.pageUrl;
        source.target = '_blank';
        source.rel = 'noopener noreferrer';
        source.textContent = item.pageUrl;

        const actions = document.createElement('div');
        actions.className = 'library-card-actions';

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'btn btn-secondary btn-sm';
        copyButton.textContent = popupMessage('popupCopyBtn', null, 'Copy');
        copyButton.addEventListener('click', () => {
            copyLibraryItemMarkdown(item.id, copyButton);
        });

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'btn btn-sm library-card-delete';
        deleteButton.setAttribute(
            'aria-label',
            popupMessage(
                'popupDeleteClipAria',
                [item.title || popupMessage('popupUntitledFallback', null, 'Untitled')],
                `Delete clip: ${item.title || popupMessage('popupUntitledFallback', null, 'Untitled')}`
            )
        );
        deleteButton.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Delete
        `;
        deleteButton.addEventListener('click', () => {
            animateDeleteLibraryItem(item.id, card);
        });

        actions.appendChild(deleteButton);
        actions.appendChild(copyButton);

        const metaRow = document.createElement('div');
        metaRow.className = 'library-card-meta';
        const countBadge = document.createElement('button');
        countBadge.type = 'button';
        countBadge.className = 'library-card-count-badge';
        countBadge.dataset.itemId = item.id;
        countBadge.textContent = getCardCountDisplay(item.markdown || '', libraryCardCountMode);
        countBadge.addEventListener('click', () => {
            const idx = COUNT_MODES.indexOf(libraryCardCountMode);
            libraryCardCountMode = COUNT_MODES[(idx + 1) % COUNT_MODES.length];
            updateAllCardCountBadges();
        });
        metaRow.appendChild(countBadge);

        card.appendChild(header);
        card.appendChild(metaRow);
        if (card.classList.contains('library-card--current')) {
            const badge = document.createElement('span');
            badge.className = 'library-card-current-badge';
            badge.textContent = popupMessage('popupLibraryCurrentPageBadge', null, 'Current page');
            card.appendChild(badge);
        }
        if (item.previewText) {
            card.appendChild(preview);
        }
        card.appendChild(source);
        card.appendChild(actions);
        libraryUI.list.appendChild(card);
    });
}

function updateLibraryUIState() {
    const enabled = librarySettings?.enabled !== false;
    const manualMode = enabled && !librarySettings?.autoSaveOnPopupOpen;

    if (libraryUI.toggle) {
        libraryUI.toggle.style.display = enabled ? 'flex' : 'none';
    }

    if (!enabled) {
        hideLibraryView();
    }

    if (libraryUI.toolbarNote) {
        libraryUI.toolbarNote.textContent = manualMode
            ? popupMessage('popupLibraryManualToolbarNote', null, 'Manual mode is on. Press Save Clip to save the current page.')
            : popupMessage('popupLibraryAutoToolbarNote', null, 'Library saves the current page automatically the first time this popup loads it.');
    }

    updateSaveLibraryButtonState();
    syncLibrarySummaryUi();
    if (isLibraryViewVisible()) {
        renderLibraryItems();
    }
}

function showMainView() {
    return setPopupView('main');
}

function isLibraryViewVisible() {
    return activePopupView === 'library';
}

function showBatchView() {
    return setPopupView('batch');
}

async function showLibraryView(e) {
    if (e) {
        e.preventDefault();
    }
    if (librarySettings?.enabled === false || !libraryUI.container) {
        return;
    }

    await ensureLibraryStateLoaded();
    await setPopupView('library');
    renderLibraryItems();
}

function hideLibraryView(e) {
    if (e) {
        e.preventDefault();
    }

    closeExportDropdown();
    return setPopupView(lastNonLibraryView);
}

async function loadLibraryState() {
    const api = getLibraryStateApi();
    if (!api) {
        return;
    }

    try {
        const [settings, items] = await Promise.all([
            api.loadLibrarySettings(),
            api.loadLibraryItems()
        ]);
        librarySettings = settings;
        libraryItems = items;
        libraryStateLoaded = true;
        updateLibraryUIState();
        await maybeAutoSaveCurrentClip();
    } catch (error) {
        console.error('Failed to load library state:', error);
    }
}

function ensureLibraryStateLoaded() {
    if (libraryStateLoaded) {
        return Promise.resolve();
    }

    if (libraryStateLoadPromise) {
        return libraryStateLoadPromise;
    }

    libraryStateLoadPromise = loadLibraryState().finally(() => {
        libraryStateLoadPromise = null;
    });
    return libraryStateLoadPromise;
}

async function persistLibrarySnapshot(snapshot, successMessage) {
    const api = getLibraryStateApi();
    if (!api || !librarySettings?.enabled) {
        return null;
    }

    const nextItems = api.upsertLibraryItem(libraryItems, snapshot, librarySettings.itemsToKeep);
    libraryItems = await api.saveLibraryItems(nextItems);
    syncLibrarySummaryUi();
    if (isLibraryViewVisible()) {
        renderLibraryItems();
    }
    if (successMessage) {
        setLibraryStatus(successMessage);
    }
    return nextItems[0] || null;
}

async function handleManualLibrarySave(e) {
    e.preventDefault();
    const snapshot = {
        title: dom.titleInput?.value || currentClipState.title,
        markdown: getEditorValue(),
        pageUrl: currentClipState.pageUrl,
        excerpt: currentClipState.excerpt,
        byline: currentClipState.byline,
        keywords: currentClipState.keywords,
        publishedTime: currentClipState.publishedTime
    };

    if (!snapshot.pageUrl || !String(snapshot.markdown || '').trim()) {
        return;
    }

    try {
        updateCurrentClipState(snapshot);
        await persistLibrarySnapshot(snapshot, 'Saved current clip to Library');
    } catch (error) {
        console.error('Failed to save library item:', error);
        setLibraryStatus('Failed to save clip to Library', true);
    }
}

async function resolveLibraryExportTabId() {
    return await getActiveTabId();
}

function toggleExportDropdown(e) {
    e.preventDefault();
    e.stopPropagation();
    if (libraryExportInProgress || libraryItems.length === 0) return;

    const dropdown = libraryUI.exportDropdown;
    const menu = libraryUI.exportDropdownMenu;
    if (!dropdown || !menu) return;

    const isOpen = !menu.hidden;
    if (isOpen) {
        closeExportDropdown();
    } else {
        menu.hidden = false;
        dropdown.classList.add('open');
    }
}

function closeExportDropdown() {
    const dropdown = libraryUI.exportDropdown;
    const menu = libraryUI.exportDropdownMenu;
    if (menu) menu.hidden = true;
    if (dropdown) dropdown.classList.remove('open');
}

function closeExportDropdownOnOutsideClick(e) {
    if (!libraryUI.exportDropdown?.contains(e.target)) {
        closeExportDropdown();
    }

    if (!dom.splitButtonWrap?.contains(e.target)) {
        closeSplitDropdown();
    }

    if (!dom.guideDropdownWrap?.contains(e.target)) {
        closeGuideDropdown();
    }
}

function toggleSplitDropdown(e) {
    e.preventDefault();
    e.stopPropagation();

    if (!dom.splitDropdown || !dom.splitButtonArrow) {
        return;
    }

    const isOpen = !dom.splitDropdown.hidden;
    if (isOpen) {
        closeSplitDropdown();
        return;
    }

    closeExportDropdown();
    dom.splitDropdown.hidden = false;
    dom.splitButtonArrow.setAttribute('aria-expanded', 'true');
    dom.splitExport?.classList.add('open');
}

function closeSplitDropdown() {
    if (dom.splitDropdown) {
        dom.splitDropdown.hidden = true;
    }
    if (dom.splitButtonArrow) {
        dom.splitButtonArrow.setAttribute('aria-expanded', 'false');
    }
    dom.splitExport?.classList.remove('open');
}

function toggleGuideDropdown(e) {
    e.stopPropagation();
    if (!dom.guideDropdown) return;
    if (!dom.guideDropdown.hidden) {
        closeGuideDropdown();
    } else {
        closeExportDropdown();
        closeSplitDropdown();
        dom.guideDropdown.hidden = false;
        dom.openGuideButton?.setAttribute('aria-expanded', 'true');
    }
}

function closeGuideDropdown() {
    if (dom.guideDropdown) dom.guideDropdown.hidden = true;
    dom.openGuideButton?.setAttribute('aria-expanded', 'false');
}

async function showShortcutsModal() {
    closeGuideDropdown();
    if (!dom.shortcutsModal || !dom.shortcutsModalBody) return;

    const loading = document.createElement('p');
    loading.className = 'shortcuts-loading';
    loading.textContent = 'Loading\u2026';
    dom.shortcutsModalBody.replaceChildren(loading);

    dom.shortcutsModal.hidden = false;
    document.querySelectorAll('body > :not(#shortcutsModal)').forEach(el => { el.inert = true; });
    dom.closeShortcutsModalBtn?.focus();

    try {
        const commands = await browser.commands.getAll();
        const fragment = globalThis.markSnipPopupShortcuts.buildShortcutsFragment(document, commands);
        dom.shortcutsModalBody.replaceChildren(fragment);
    } catch {
        const err = document.createElement('p');
        err.className = 'shortcuts-modal__error';
        err.textContent = 'Could not load shortcuts.';
        dom.shortcutsModalBody.replaceChildren(err);
    }
}

function closeShortcutsModal() {
    if (!dom.shortcutsModal || dom.shortcutsModal.hidden) return;
    dom.shortcutsModal.hidden = true;
    document.querySelectorAll('body > :not(#shortcutsModal)').forEach(el => { el.inert = false; });
    dom.openGuideButton?.focus();
}

function trapShortcutsModalTab(event) {
    if (!dom.shortcutsModal || dom.shortcutsModal.hidden) return;
    const focusable = Array.from(
        dom.shortcutsModal.querySelectorAll(
            'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
    );
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0], last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
        if (active === first || !dom.shortcutsModal.contains(active)) {
            event.preventDefault(); last.focus();
        }
    } else {
        if (active === last || !dom.shortcutsModal.contains(active)) {
            event.preventDefault(); first.focus();
        }
    }
}

function handlePopupKeydown(event) {
    if (event.key === 'Escape') {
        if (!dom.shortcutsModal?.hidden) {
            closeShortcutsModal();
        } else {
            closeExportDropdown();
            closeSplitDropdown();
            closeGuideDropdown();
        }
        return;
    }
    if (event.key === 'Tab') {
        trapShortcutsModalTab(event);
    }
}

async function handleExportDropdownChoice(e) {
    const item = e.target.closest('[data-export]');
    if (!item) return;

    closeExportDropdown();
    const mode = item.dataset.export;

    if (mode === 'links') {
        handleLibraryExportLinks();
        return;
    }

    if (mode === 'zip') {
        await handleLibraryExportZip();
    } else if (mode === 'individual') {
        await handleLibraryExportIndividual();
    }
}

async function handleLibraryExportZip() {
    if (libraryExportInProgress || libraryItems.length === 0) return;

    libraryExportInProgress = true;
    updateLibraryExportButtonState();
    setLibraryStatus('Exporting library as ZIP...');

    try {
        const tabId = await resolveLibraryExportTabId();
        const result = await browser.runtime.sendMessage({
            type: 'export-library-items',
            items: libraryItems.map((item) => ({
                title: item?.title || '',
                markdown: item?.markdown || '',
                savedAt: item?.savedAt || '',
                pageUrl: item?.pageUrl || ''
            })),
            tabId
        });

        const exportedCount = Number(result?.exportedCount || 0);
        if (exportedCount > 0) {
            setLibraryStatus(`Exported ${exportedCount} clip${exportedCount === 1 ? '' : 's'} to ZIP`);
        } else {
            setLibraryStatus('No saved clips to export', true);
        }
    } catch (error) {
        console.error('Failed to export library items:', error);
        setLibraryStatus('Failed to export Library', true);
    } finally {
        libraryExportInProgress = false;
        updateLibraryExportButtonState();
    }
}

async function handleLibraryExportIndividual() {
    if (libraryExportInProgress || libraryItems.length === 0) return;

    libraryExportInProgress = true;
    updateLibraryExportButtonState();
    setLibraryStatus('Exporting individual files...');

    try {
        const tabId = await resolveLibraryExportTabId();
        const result = await browser.runtime.sendMessage({
            type: 'export-library-items-individual',
            items: libraryItems.map((item) => ({
                title: item?.title || '',
                markdown: item?.markdown || '',
                savedAt: item?.savedAt || '',
                pageUrl: item?.pageUrl || ''
            })),
            tabId
        });

        const exportedCount = Number(result?.exportedCount || 0);
        if (exportedCount > 0) {
            setLibraryStatus(`Exported ${exportedCount} individual file${exportedCount === 1 ? '' : 's'}`);
        } else {
            setLibraryStatus('No saved clips to export', true);
        }
    } catch (error) {
        console.error('Failed to export individual files:', error);
        setLibraryStatus('Failed to export files', true);
    } finally {
        libraryExportInProgress = false;
        updateLibraryExportButtonState();
    }
}

function handleLibraryExportLinks() {
    if (libraryItems.length === 0) return;

    const links = libraryItems
        .map((item) => item?.pageUrl || '')
        .filter(Boolean);

    if (links.length === 0) {
        setLibraryStatus('No links found in library clips', true);
        return;
    }

    const text = links.join('\n');
    navigator.clipboard.writeText(text).then(() => {
        setLibraryStatus(`Copied ${links.length} link${links.length === 1 ? '' : 's'} to clipboard`);
    }).catch(() => {
        setLibraryStatus('Failed to copy links to clipboard', true);
    });
}

async function maybeAutoSaveCurrentClip() {
    const api = getLibraryStateApi();
    if (!api || !librarySettings?.enabled || !librarySettings?.autoSaveOnPopupOpen || !hasSavableClip()) {
        return;
    }

    const normalizedUrl = api.normalizePageUrl(currentClipState.pageUrl);
    if (!normalizedUrl || autoSavedLibraryUrls.has(normalizedUrl)) {
        return;
    }

    autoSavedLibraryUrls.add(normalizedUrl);

    try {
        await persistLibrarySnapshot(currentClipState);
    } catch (error) {
        autoSavedLibraryUrls.delete(normalizedUrl);
        console.error('Failed to auto-save library item:', error);
    }
}

function getPopupBatchUtilsApi() {
    return globalThis.markSnipPopupBatchUtils || null;
}

// Function to parse markdown links
function parseMarkdownLink(text) {
    const sharedApi = getPopupBatchUtilsApi();
    if (sharedApi?.parseMarkdownLink) {
        return sharedApi.parseMarkdownLink(text);
    }

    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/;
    const match = text.match(markdownLinkRegex);
    if (match) {
        return {
            title: match[1].trim(),
            url: match[2].trim()
        };
    }
    return null;
}

// Function to validate and normalize URL
function normalizeUrl(url) {
    const sharedApi = getPopupBatchUtilsApi();
    if (sharedApi?.normalizeUrl) {
        return sharedApi.normalizeUrl(url);
    }

    // Add https:// if no protocol specified
    if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
    }
    
    try {
        const urlObj = new URL(url);
        return urlObj.href;
    } catch (e) {
        return null;
    }
}

// Function to process URLs from textarea
function processUrlInput(text) {
    const sharedApi = getPopupBatchUtilsApi();
    if (sharedApi?.processUrlInput) {
        return sharedApi.processUrlInput(text);
    }

    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    const urlObjects = [];

    for (const line of lines) {
        // Try to parse as markdown link first
        const mdLink = parseMarkdownLink(line);
        
        if (mdLink) {
            const normalizedUrl = normalizeUrl(mdLink.url);
            if (normalizedUrl) {
                urlObjects.push({
                    title: mdLink.title,
                    url: normalizedUrl
                });
            }
        } else if (line) {
            // Try as regular URL
            const normalizedUrl = normalizeUrl(line);
            if (normalizedUrl) {
                urlObjects.push({
                    title: null, // Will be extracted from page
                    url: normalizedUrl
                });
            }
        }
    }

    return urlObjects;
}

// URL validation preview
let _urlValidationTimer = null;

function validateAndPreviewUrls() {
    const urlValidation = document.getElementById('urlValidation');
    const text = dom.urlList?.value || '';
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const sharedApi = getPopupBatchUtilsApi();
    const summary = sharedApi?.summarizeUrlValidation
        ? sharedApi.summarizeUrlValidation(text)
        : null;

    if ((summary?.totalLines ?? lines.length) === 0) {
        urlValidation.style.display = 'none';
        batchManualValidCount = 0;
        updateStartBatchButton();
        return;
    }

    let validCount = summary?.validCount;
    let invalidCount = summary?.invalidCount;

    if (validCount == null || invalidCount == null) {
        validCount = 0;
        invalidCount = 0;

        for (const line of lines) {
            const mdLink = parseMarkdownLink(line);
            const url = mdLink ? normalizeUrl(mdLink.url) : normalizeUrl(line);
            if (url) {
                validCount++;
            } else {
                invalidCount++;
            }
        }
    }

    batchManualValidCount = validCount;

    urlValidation.style.display = 'block';
    urlValidation.classList.remove('has-invalid', 'all-invalid');

    const validPart = validCount === 1
        ? popupMessage('popupUrlValidationValidOne', null, '1 valid URL')
        : popupMessage('popupUrlValidationValidMany', [validCount], `${validCount} valid URLs`);
    const invalidPart = invalidCount === 1
        ? popupMessage('popupUrlValidationInvalidOne', null, '1 invalid line')
        : popupMessage('popupUrlValidationInvalidMany', [invalidCount], `${invalidCount} invalid lines`);

    if (validCount === 0) {
        urlValidation.textContent = invalidCount === 1
            ? popupMessage('popupUrlValidationNoValidOne', null, '1 invalid line - no valid URLs')
            : popupMessage('popupUrlValidationNoValidMany', [invalidCount], `${invalidCount} invalid lines - no valid URLs`);
        urlValidation.classList.add('all-invalid');
    } else if (invalidCount > 0) {
        urlValidation.textContent = popupMessage(
            'popupUrlValidationMixedFormat',
            [validPart, invalidPart],
            `${validPart}, ${invalidPart}`
        );
        urlValidation.classList.add('has-invalid');
    } else {
        urlValidation.textContent = validPart;
    }

    updateStartBatchButton();
}

function debouncedValidateUrls() {
    clearTimeout(_urlValidationTimer);
    _urlValidationTimer = setTimeout(validateAndPreviewUrls, 300);
}

// Wait for dynamically-rendered pages to populate meaningful content before clipping.
// Some docs sites report `status: complete` before the main article hydrates.
async function waitForTabContentReady(tabId, maxWaitMs = 12000, pollIntervalMs = 500) {
    const start = Date.now();
    let previousTextLength = 0;
    let stablePolls = 0;

    while (Date.now() - start < maxWaitMs) {
        try {
            const results = await browser.scripting.executeScript({
                target: { tabId },
                func: () => {
                    const root = document.querySelector('main, article, [role="main"]') || document.body;
                    const text = (root?.innerText || '').replace(/\s+/g, ' ').trim();

                    return {
                        readyState: document.readyState,
                        textLength: text.length,
                        paragraphCount: root ? root.querySelectorAll('p').length : 0,
                        headingCount: root ? root.querySelectorAll('h1, h2, h3').length : 0
                    };
                }
            });

            const snapshot = results?.[0]?.result;
            if (snapshot) {
                const elapsed = Date.now() - start;
                const lengthStable = Math.abs(snapshot.textLength - previousTextLength) < 40;
                stablePolls = lengthStable ? stablePolls + 1 : 0;

                const richContentStable =
                    snapshot.textLength >= 900 &&
                    stablePolls >= 2 &&
                    elapsed >= 2000;

                const shortPageStable =
                    snapshot.textLength >= 120 &&
                    snapshot.paragraphCount >= 1 &&
                    stablePolls >= 3 &&
                    elapsed >= 2000;

                if (snapshot.readyState === 'complete' && (richContentStable || shortPageStable)) {
                    return;
                }

                previousTextLength = snapshot.textLength;
            }
        } catch (error) {
            // Ignore intermittent scripting issues and continue polling until timeout.
            console.debug(`Content readiness check failed for tab ${tabId}:`, error);
        }

        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
}

async function waitForTabLoadComplete(tabId, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            browser.tabs.onUpdated.removeListener(listener);
            reject(new Error(`Timeout loading tab ${tabId}`));
        }, timeoutMs);

        function listener(updatedTabId, info) {
            if (updatedTabId === tabId && info.status === 'complete') {
                clearTimeout(timeout);
                browser.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        }

        browser.tabs.onUpdated.addListener(listener);
    });
}

async function activateTabForCapture(tabId, settleMs = 1500) {
    await browser.tabs.update(tabId, { active: true });
    if (settleMs > 0) {
        await new Promise(resolve => setTimeout(resolve, settleMs));
    }
}

function isLikelyIncompleteMarkdown(markdown) {
    const sharedApi = getPopupBatchUtilsApi();
    if (sharedApi?.isLikelyIncompleteMarkdown) {
        return sharedApi.isLikelyIncompleteMarkdown(markdown);
    }

    if (!markdown || !markdown.trim()) return true;

    const normalized = markdown.replace(/\r/g, '');
    const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean);
    const headingLines = lines.filter(line => /^#{1,6}\s/.test(line)).length;
    const listLines = lines.filter(line => /^[-*+]\s/.test(line)).length;
    const nonStructuralLines = lines.filter(line => (
        !/^#{1,6}\s/.test(line) &&
        !/^[-*+]\s/.test(line) &&
        !/^\d+\.\s/.test(line) &&
        !/^>\s/.test(line) &&
        !/^!\[/.test(line)
    ));
    const nonStructuralChars = nonStructuralLines.join(' ').replace(/`/g, '').trim().length;
    const hasTocMarker = /\bOn this page\b/i.test(normalized) || /\bTable of contents\b/i.test(normalized);

    return (
        nonStructuralChars < 320 &&
        (headingLines + listLines) >= 4
    ) || (
        hasTocMarker &&
        nonStructuralChars < 500
    );
}

async function clipTabWithRetry(tab, maxAttempts = 2) {
    let lastMessage = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const displayMdPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                browser.runtime.onMessage.removeListener(messageListener);
                reject(new Error('Timeout waiting for markdown generation'));
            }, 45000);

            function messageListener(message) {
                if (message.type === "display.md") {
                    clearTimeout(timeout);
                    browser.runtime.onMessage.removeListener(messageListener);

                    if (tab.customTitle) {
                        message.article.title = tab.customTitle;
                    }

                    updateCurrentClipState({
                        title: message.article?.title,
                        markdown: message.markdown,
                        pageUrl: resolveClipPageUrl(message.article),
                        excerpt: message.article?.excerpt,
                        byline: message.article?.byline,
                        keywords: message.article?.keywords,
                        publishedTime: message.article?.publishedTime
                    });
                    setEditorValue(message.markdown);
                    if (dom.titleInput) {
                        dom.titleInput.value = message.article.title;
                    }
                    imageList = message.imageList;
                    sourceImageMap = message.sourceImageMap;
                    mdClipsFolder = message.mdClipsFolder;

                    resolve(message);
                }
            }

            browser.runtime.onMessage.addListener(messageListener);
        });

        await waitForTabContentReady(tab.id, attempt === 1 ? 12000 : 20000, 500);
        await clipSite(tab.id);
        lastMessage = await displayMdPromise;

        const markdownLength = (lastMessage?.markdown || '').length;
        const incomplete = isLikelyIncompleteMarkdown(lastMessage.markdown);
        console.log(`[Batch] Tab ${tab.id} attempt ${attempt}/${maxAttempts}: markdownLength=${markdownLength}, incomplete=${incomplete}`);

        if (!incomplete) {
            return lastMessage;
        }

        if (attempt < maxAttempts) {
            progressUI.setStatus(`Detected partial content. Retrying ${attempt + 1}/${maxAttempts}...`);
            await browser.tabs.reload(tab.id);
            await waitForTabLoadComplete(tab.id, 45000);
            await browser.scripting.executeScript({
                target: { tabId: tab.id },
                files: ["/browser-polyfill.min.js", "/contentScript/contentScript.js"]
            });
        }
    }

    return lastMessage;
}

function setBatchFooterVisible(visible) {
    if (dom.batchFooter) {
        dom.batchFooter.style.display = visible ? '' : 'none';
    }
}

// Single entry point for the "Start Batch Processing" button. Routes to the
// right flow based on the selected capture method.
async function handleStartBatch(e) {
    if (e) e.preventDefault();

    if (currentOptions?.batchProcessingEnabled === false) {
        showError(popupMessage('popupBatchDisabledError', null, 'Batch Processing is disabled in Options'), false);
        return;
    }

    if (batchCaptureMethod === 'click') {
        await activateClickClip(e);
        return;
    }

    const source = batchCaptureMethod === 'pick'
        ? batchPickedLinks.join('\n')
        : (dom.urlList?.value || '');
    const urlObjects = processUrlInput(source);

    if (urlObjects.length === 0) {
        showError(popupMessage('popupEnterValidUrlsError', null, 'Please enter valid URLs or markdown links (one per line)'), false);
        return;
    }

    await handleBatchConversion(e, urlObjects);
}

async function handleBatchConversion(e, providedUrlObjects = null) {
    if (e) e.preventDefault();

    if (currentOptions?.batchProcessingEnabled === false) {
        showError(popupMessage('popupBatchDisabledError', null, 'Batch Processing is disabled in Options'), false);
        return;
    }

    const urlObjects = Array.isArray(providedUrlObjects)
        ? providedUrlObjects
        : processUrlInput(dom.urlList?.value || '');

    if (urlObjects.length === 0) {
        showError(popupMessage('popupEnterValidUrlsError', null, 'Please enter valid URLs or markdown links (one per line)'), false);
        return;
    }
    const batchSaveMode = getSelectedOutputFormat();

    // Default path: run batch in service worker so popup lifecycle doesn't interrupt processing.
    // Keep inline mode for e2e tests by setting window.__MARKSNIP_FORCE_INLINE_BATCH__ = true.
    if (!window.__MARKSNIP_FORCE_INLINE_BATCH__) {
        dom.spinner.style.display = 'flex';
        setBatchFooterVisible(false);
        progressUI.show();
        progressUI.reset();
        progressUI.setStatus(popupMessage('popupStartingBackgroundBatch', null, 'Starting background batch...'));

        try {
            const originalTabId = await getActiveTabId();

            browser.runtime.sendMessage({
                type: 'start-batch-conversion',
                urlObjects,
                originalTabId,
                batchSaveMode
            }).catch(error => {
                console.error('Background batch failed to start:', error);
            });

            progressUI.setStatus('Batch started. Tabs will be visited automatically.');
            setTimeout(() => window.close(), 350);
        } catch (error) {
            console.error('Failed to start background batch:', error);
            progressUI.setStatus(`Error: ${error.message}`);
            dom.spinner.style.display = 'none';
            setBatchFooterVisible(true);
        }
        return;
    }

    dom.spinner.style.display = 'flex';
    setBatchFooterVisible(false);
    progressUI.show();
    progressUI.reset();

    let originalTabId = null;
    const restoreOriginalTab = async () => {
        if (originalTabId) {
            await browser.tabs.update(originalTabId, { active: true }).catch(() => {});
        }
    };

    try {
        originalTabId = await getActiveTabId();

        const total = urlObjects.length;
        let current = 0;
        
        console.log('Starting batch conversion...');

        for (const urlObj of urlObjects) {
            let tab = null;
            try {
                current++;
                progressUI.updateProgress(current, total, `Loading: ${urlObj.url}`);
                progressUI.setStatus('Loading pages...');

                console.log(`Creating tab for ${urlObj.url}`);
                tab = await browser.tabs.create({
                    url: urlObj.url,
                    active: true
                });

                if (urlObj.title) {
                    tab.customTitle = urlObj.title;
                }

                await waitForTabLoadComplete(tab.id, 45000);

                await browser.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ["/browser-polyfill.min.js", "/shared/i18n.js", "/contentScript/contentScript.js"]
                });

                await activateTabForCapture(tab.id, 1500);

                progressUI.updateProgress(current, total, `Converting: ${urlObj.url}`);
                progressUI.setStatus('Converting pages to Markdown...');
                console.log(`Processing tab ${tab.id}`);

                const message = await clipTabWithRetry(tab, 2);
                await sendDownloadMessage(message?.markdown || getEditorValue());

            } catch (error) {
                console.error(`Error processing URL ${urlObj.url}:`, error);
                progressUI.setStatus(`Error: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Show error briefly
            } finally {
                if (tab && tab.id) {
                    await browser.tabs.remove(tab.id).catch(() => {});
                }
            }
        }

        progressUI.setStatus('Complete!');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Show completion briefly

        // Clear saved batch URLs after successful completion
        batchPickedLinks = [];
        await browser.storage.local.remove(['batchUrlList', 'batchPickedLinks']);

        await restoreOriginalTab();

        console.log('Batch conversion complete');
        hideBatchProcess(e);
        window.close();

    } catch (error) {
        await restoreOriginalTab();
        console.error('Batch processing error:', error);
        progressUI.setStatus(`Error: ${error.message}`);
        dom.spinner.style.display = 'none';
        setBatchFooterVisible(true);
    }
}

const checkInitialSettings = options => {
    currentOptions = normalizePopupOptions({
        ...defaultOptions,
        ...options
    });

    // Apply theme settings
    applyThemeSettings(currentOptions);

    setActiveSiteRuleState(null, [], null);
    applyActiveSiteRuleUi(currentOptions);
    updateObsidianButtonVisibility(currentOptions);
    updateGuideButtonVisibility(currentOptions);
    updateBatchProcessButtonVisibility(currentOptions);
    updateElementPickerButtonVisibility(currentOptions);
    updatePopupExportControls(currentOptions);
    resetElementPickerButtonFeedback();

    // Set segmented control state
    setClipSelectionState(currentOptions.clipSelection);
}

const setClipSelectionState = clipSelection => {
    dom.selectedButton?.classList.toggle("active", clipSelection);
    dom.selectedButton?.setAttribute("aria-pressed", String(clipSelection));

    dom.documentButton?.classList.toggle("active", !clipSelection);
    dom.documentButton?.setAttribute("aria-pressed", String(!clipSelection));
}

const setClipSelection = (options, clipSelection) => {
    if (options.clipSelection === clipSelection) {
        setClipSelectionState(clipSelection);
        return;
    }

    options.clipSelection = clipSelection;
    setClipSelectionState(clipSelection);
    browser.storage.sync.set(options).then(() => clipSite()).catch((error) => {
        console.error(error);
    });
}

const toggleIncludeTemplate = options => {
    if (dom.includeTemplate) {
        options.includeTemplate = dom.includeTemplate.checked;
    }

    browser.storage.sync.set(options).then(() => {
        return getActiveTab();
    }).then((tab) => {
        if (tab?.id) {
            return clipSite(tab.id);
        }
    }).catch((error) => {
        console.error("Error toggling include template:", error);
    });
}

const toggleDownloadImages = options => {
    if (dom.downloadImages) {
        options.downloadImages = dom.downloadImages.checked;
    }

    browser.storage.sync.set(options).catch((error) => {
        console.error("Error updating options:", error);
    });
}

const showOrHideClipOption = selection => {
    if (selection) {
        dom.clipOption.style.display = "flex";
    }
    else {
        dom.clipOption.style.display = "none";
    }
}

let popupOffscreenBridgePromise = null;

function hasNativeOffscreenDocumentSupport() {
    return typeof chrome !== 'undefined' && !!chrome.offscreen;
}

function ensurePopupOffscreenBridge() {
    if (hasNativeOffscreenDocumentSupport()) {
        return Promise.resolve(false);
    }

    if (popupOffscreenBridgePromise) {
        return popupOffscreenBridgePromise;
    }

    popupOffscreenBridgePromise = new Promise((resolve) => {
        const existingFrame = document.getElementById('marksnip-offscreen-bridge');
        if (existingFrame) {
            resolve(true);
            return;
        }

        const frame = document.createElement('iframe');
        let settled = false;
        const finish = (ready) => {
            if (settled) return;
            settled = true;
            resolve(ready);
        };

        frame.id = 'marksnip-offscreen-bridge';
        frame.src = browser.runtime.getURL('offscreen/offscreen.html');
        frame.setAttribute('aria-hidden', 'true');
        frame.tabIndex = -1;
        frame.style.cssText = 'position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none;';
        frame.addEventListener('load', () => {
            setTimeout(() => finish(true), 50);
        }, { once: true });
        frame.addEventListener('error', () => finish(true), { once: true });

        document.body.appendChild(frame);
        setTimeout(() => finish(true), 2500);
    });

    return popupOffscreenBridgePromise;
}

// Updated clipSite function to use scripting API
const clipSite = id => {
    return resolveClipTargetTab(id).then(async (tab) => {
        if (!tab?.id) {
            throw new Error(popupMessage('popupNoActiveTabError', null, 'No active tab found'));
        }

        if (isRestrictedTabUrl(tab.url || '')) {
            showOrHideClipOption(false);
            showError(getRestrictedPageMessage(tab.url || ''));
            return null;
        }

        const captureOptions = {
            skipHiddenContent: currentOptions?.skipHiddenContent === true
        };
        const offscreenBridgeReady = await ensurePopupOffscreenBridge();

        return browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: async (captureOptions) => {
                if (typeof marksnipPrepareForCapture === 'function') {
                    await marksnipPrepareForCapture();
                }
                if (typeof getSelectionAndDom === 'function') {
                    return getSelectionAndDom(captureOptions);
                }
                return null;
            },
            args: [captureOptions]
        })
        .then((result) => {
            if (result && result[0]?.result) {
                showOrHideClipOption(result[0].result.selection);
                let message = {
                    type: "clip",
                    dom: result[0].result.dom,
                    selection: result[0].result.selection,
                    pageUrl: result[0].result.pageUrl || null,
                    offscreenBridgeReady
                }
                if (currentOptions) {
                    return browser.runtime.sendMessage({
                        ...message,
                        ...currentOptions
                    });
                }
                return browser.storage.sync.get(defaultOptions).then(options => {
                    currentOptions = normalizePopupOptions({
                        ...defaultOptions,
                        ...options
                    });
                    return browser.runtime.sendMessage({
                        ...message,
                        ...currentOptions
                    });
                }).catch(err => {
                    console.error(err);
                    showError(err)
                    return browser.runtime.sendMessage({
                        ...message,
                        ...defaultOptions
                    });
                });
            }
        });
    }).catch(err => {
        console.error(err);
        showError(err)
    });
}

function ensureContentScriptInjected(tabId) {
    return browser.scripting.executeScript({
        target: { tabId },
        files: ["/browser-polyfill.min.js"]
    }).then(() => {
        return browser.scripting.executeScript({
            target: { tabId },
            files: ["/contentScript/contentScript.js"]
        });
    });
}

function scheduleDeferredLibraryWarmup() {
    if (deferredLibraryWarmupScheduled) {
        return;
    }

    deferredLibraryWarmupScheduled = true;
    scheduleDeferredTask(() => ensureLibraryStateLoaded(), 1200);
}

function scheduleDeferredStartupTasks() {
    if (deferredStartupScheduled) {
        return;
    }

    deferredStartupScheduled = true;
    setTimeout(() => {
        restoreBatchState().catch(() => {});
    }, 0);
    scheduleDeferredTask(() => ensureBatchSettingsLoaded(), 1000);
    scheduleDeferredTask(() => ensureLibraryStateLoaded(), 1200);
    scheduleDeferredTask(() => loadNotificationHostDeferred(), 1500);
}

async function restoreBatchState() {
    const state = await browser.runtime.sendMessage({ type: 'get-batch-state' }).catch(() => null);
    if (!state || !['started', 'loading', 'converting', 'retrying'].includes(state.status)) {
        return;
    }

    await ensureBatchSettingsLoaded();
    await setPopupView('batch', { immediate: true });
    dom.spinner.style.display = 'none';
    setBatchFooterVisible(false);
    progressUI.show();
    progressUI.showCancelButton();
    const current = state.current || 0;
    const total = state.total || 0;
    if (total > 0) {
        progressUI.updateProgress(current, total, state.url || '', state.pageTitle || null);
    }
    progressUI.setStatus(state.status === 'loading' ? 'Loading page...' :
                         state.status === 'converting' ? 'Converting page...' :
                         state.status === 'retrying' ? 'Retrying page capture...' : 'Processing...');
}

async function initializePopup() {
    try {
        const [options, localState, activeTab] = await Promise.all([
            browser.storage.sync.get(defaultOptions).catch(() => ({ ...defaultOptions })),
            browser.storage.local.get('countMode').catch(() => ({})),
            getActiveTab(),
            popupI18nReady()
        ]);

        if (localState.countMode && COUNT_MODES.includes(localState.countMode)) {
            countMode = localState.countMode;
        }

        checkInitialSettings(options);
        updateCharCount(getEditorValue());
        syncSelectionActionVisibility(false);

        dom.selectedButton?.addEventListener("click", (e) => {
            e.preventDefault();
            setClipSelection(currentOptions, true);
        });
        dom.documentButton?.addEventListener("click", (e) => {
            e.preventDefault();
            setClipSelection(currentOptions, false);
        });
        dom.includeTemplate?.addEventListener("click", () => {
            toggleIncludeTemplate(currentOptions);
        });
        dom.downloadImages?.addEventListener("click", () => {
            toggleDownloadImages(currentOptions);
        });

        await afterNextPaint();

        const editorPromise = initializeEditor();
        scheduleDeferredStartupTasks();

        if (!activeTab?.id) {
            showError(popupMessage('popupNoActiveTabError', null, 'No active tab found'));
            await editorPromise;
            return;
        }

        if (isRestrictedTabUrl(activeTab.url || '')) {
            showOrHideClipOption(false);
            showError(getRestrictedPageMessage(activeTab.url || ''));
            await editorPromise;
            return;
        }

        const consumedElementPickerResult = await consumePendingElementPickerResult(activeTab);
        if (consumedElementPickerResult) {
            await editorPromise;
            return;
        }

        const clipPromise = ensureContentScriptInjected(activeTab.id).then(() => {
            console.info("Successfully injected MarkSnip content script");
            return clipSite(activeTab.id);
        });

        await Promise.all([editorPromise, clipPromise]);
    } catch (error) {
        console.error(error);
        showError(error);
        scheduleDeferredStartupTasks();
    }
}

initializePopup();

// listen for notifications from the background page
browser.runtime.onMessage.addListener(notify);

browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync") {
        const themeSettingKeys = ['popupTheme', 'specialTheme', 'colorBlindTheme', 'specialThemeIcon', 'popupAccent', 'compactMode', 'showThemeToggleInPopup', 'editorTheme'];
        const popupActionKeys = ['defaultExportType', 'defaultSendToTarget', 'sendToCustomTargets', 'sendToMaxUrlLength', 'webhookTargets'];
        if (themeSettingKeys.some((key) => Object.prototype.hasOwnProperty.call(changes, key))) {
            currentOptions = normalizePopupOptions({
                ...defaultOptions,
                ...currentOptions,
                ...themeSettingKeys.reduce((nextOptions, key) => {
                    if (Object.prototype.hasOwnProperty.call(changes, key)) {
                        nextOptions[key] = changes[key].newValue;
                    }
                    return nextOptions;
                }, {})
            });
            applyThemeSettings(currentOptions);
        }
        if (changes.batchProcessingEnabled) {
            currentOptions = normalizePopupOptions({
                ...currentOptions,
                batchProcessingEnabled: changes.batchProcessingEnabled.newValue !== false
            });
            updateBatchProcessButtonVisibility(currentOptions);
        }
        if (changes.elementPickerEnabled) {
            currentOptions = normalizePopupOptions({
                ...currentOptions,
                elementPickerEnabled: changes.elementPickerEnabled.newValue !== false
            });
            updateElementPickerButtonVisibility(currentOptions);
        }
        if (popupActionKeys.some((key) => Object.prototype.hasOwnProperty.call(changes, key))) {
            currentOptions = normalizePopupOptions({
                ...currentOptions,
                ...popupActionKeys.reduce((nextOptions, key) => {
                    if (Object.prototype.hasOwnProperty.call(changes, key)) {
                        nextOptions[key] = changes[key].newValue;
                    }
                    return nextOptions;
                }, {})
            });
            updatePopupExportControls(currentOptions);
        }
        if (changes.obsidianIntegration) {
            updateObsidianButtonVisibility({ obsidianIntegration: changes.obsidianIntegration.newValue });
        }
        if (changes.showUserGuideIcon) {
            updateGuideButtonVisibility({ showUserGuideIcon: changes.showUserGuideIcon.newValue });
        }
        return;
    }

    if (areaName !== "local") {
        return;
    }

    const libraryApi = getLibraryStateApi();
    if (!libraryApi) {
        return;
    }

    if (changes.librarySettings) {
        librarySettings = libraryApi.normalizeLibrarySettings(changes.librarySettings.newValue);
        libraryStateLoaded = true;
        updateLibraryUIState();
    }

    if (changes.libraryItems) {
        libraryItems = Array.isArray(changes.libraryItems.newValue) ? changes.libraryItems.newValue : [];
        libraryStateLoaded = true;
        syncLibrarySummaryUi();
        if (isLibraryViewVisible()) {
            renderLibraryItems();
        }
    }
});

// Listen for link picker results
browser.runtime.onMessage.addListener((message) => {
    if (message.type === "LINK_PICKER_COMPLETE") {
        handleLinkPickerComplete(message.links);
    }
});

function handleLinkPickerComplete(links) {
    if (!links || links.length === 0) {
        console.log("No links collected");
        return;
    }

    const cleanLinks = links.filter((url) => typeof url === 'string' && url);
    if (cleanLinks.length === 0) {
        return;
    }

    // Merge into the picked-links list (deduplicated) and switch to the
    // Pick Links capture method so the results are visible immediately.
    batchPickedLinks = [...new Set([...batchPickedLinks, ...cleanLinks])];
    setCaptureMethod('pick');
    renderBatchPickedLinks();
    saveBatchSettings();
    updateStartBatchButton();

    console.log(`Added ${cleanLinks.length} links to batch processor`);

    // Show a temporary success indicator on the pick button.
    const pickLinksBtn = dom.pickLinksButton;
    if (!pickLinksBtn) {
        return;
    }
    const originalText = pickLinksBtn.innerHTML;
    pickLinksBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
        </svg>
        ${popupMessage('popupAddedLinksFeedback', [cleanLinks.length], `Added ${cleanLinks.length} links!`)}
    `;
    pickLinksBtn.classList.add("success");

    setTimeout(() => {
        pickLinksBtn.innerHTML = originalText;
        pickLinksBtn.classList.remove("success");
    }, 2000);
}

//function to send the download message to the background page
function sendDownloadMessage(text, title = dom.titleInput?.value || '') {
    if (text != null) {
        return getActiveTab().then(tab => {
            if (!tab?.id) {
                throw new Error(popupMessage('popupNoActiveTabError', null, 'No active tab found'));
            }
            const message = {
                type: "download",
                markdown: text,
                title,
                tab,
                imageList: imageList,
                mdClipsFolder: mdClipsFolder,
                options: getPopupExportOptions()
            };
            return browser.runtime.sendMessage(message);
        });
    }
}

function shouldClosePopupAfterExport(kind) {
    return kind === 'markdown' || kind === 'text' || kind === 'html';
}

async function sendGeneratedDownloadMessage(kind, markdown, title = getCurrentExportTitle()) {
    const nextTitle = String(title || '').trim() || popupMessage('popupUntitledFallback', null, 'Untitled');
    const exportType = resolveDefaultExportType({ defaultExportType: kind });
    const config = getExportTypeConfig(exportType);
    const { content, fileExtension, mimeType } = await buildGeneratedExport(exportType, markdown, nextTitle);
    const activeTab = await getActiveTab();

    if (!activeTab?.id) {
        throw new Error(popupMessage('popupNoActiveTabError', null, 'No active tab found'));
    }

    return browser.runtime.sendMessage({
        type: 'download-generated-file',
        content,
        title: nextTitle,
        tabId: activeTab.id,
        mdClipsFolder: mdClipsFolder,
        fileExtension: fileExtension || config.fileExtension,
        mimeType: mimeType || config.mimeType,
        notificationDelta: {
            downloads: 1,
            exports: 1
        }
    });
}

function setPrimaryActionFeedback(button, label, state = 'success', iconKey = null) {
    if (!button) {
        return;
    }

    button.classList.remove('success', 'error');
    if (state) {
        button.classList.add(state);
    }
    const defaultIconKey = getPopupPrimaryActionConfig(currentOptions).icon;
    setActionButtonContent(button, label, iconKey || defaultIconKey);
    button.setAttribute('aria-label', label);
    button.title = label;
}

function resetPrimaryActionFeedback() {
    updatePopupExportControls(currentOptions);
}

function buildAssistantLaunchUrls(target, prompt, options = currentOptions) {
    const encodedPrompt = encodeURIComponent(String(prompt || ''));
    const launchUrl = String(target?.urlTemplate || '').replace('{prompt}', encodedPrompt);
    const fallbackUrl = String(target?.fallbackUrl || target?.urlTemplate || '').replace('{prompt}', '');
    const maxUrlLength = normalizeSendToMaxUrlLength(options?.sendToMaxUrlLength);
    return {
        launchUrl,
        fallbackUrl,
        requiresClipboardFallback: launchUrl.length > maxUrlLength
    };
}

async function recordSuccessfulSendMetric() {
    const tabId = await getActiveTabId();

    return browser.runtime.sendMessage({
        type: 'record-notification-metrics',
        tabId,
        delta: {
            exports: 1
        }
    }).catch(() => {});
}

async function handleSendToAction(targetId = currentOptions?.defaultSendToTarget, { selectionOnly = false, triggerButton = null } = {}) {
    closeSplitDropdown();
    if (selectionOnly && !editorHasSelection()) {
        return;
    }

    const content = selectionOnly ? getEditorSelection() : getEditorValue();
    if (!String(content || '').trim()) {
        if (triggerButton) {
            setPrimaryActionFeedback(triggerButton, popupMessage('popupNothingToSendFeedback', null, 'Nothing to send'), 'error');
            setTimeout(resetPrimaryActionFeedback, 1800);
        }
        return;
    }

    const target = resolveSendToTarget(targetId, currentOptions);
    const { launchUrl, fallbackUrl, requiresClipboardFallback } = buildAssistantLaunchUrls(target, content, currentOptions);

    try {
        if (requiresClipboardFallback) {
            await navigator.clipboard.writeText(content);
        }

        if (triggerButton) {
            setPrimaryActionFeedback(
                triggerButton,
                requiresClipboardFallback
                    ? `Copied. Opening ${target.label}...`
                    : `Opening ${target.label}...`,
                'success',
                target.iconKey || 'send'
            );
            await new Promise((resolve) => setTimeout(resolve, requiresClipboardFallback ? 420 : 180));
        }

        await recordSuccessfulSendMetric();
        await browser.tabs.create({ url: requiresClipboardFallback ? fallbackUrl : launchUrl });
        window.close();
    } catch (error) {
        if (triggerButton) {
            setPrimaryActionFeedback(triggerButton, popupMessage('popupFailedFeedback', null, 'Failed'), 'error');
            setTimeout(resetPrimaryActionFeedback, 2200);
        }
        throw error;
    }
}

async function handleWebhookSendAction(targetId, { selectionOnly = false, triggerButton = null } = {}) {
    closeSplitDropdown();
    if (selectionOnly && !editorHasSelection()) {
        return;
    }

    const content = selectionOnly ? getEditorSelection() : getEditorValue();
    if (!String(content || '').trim()) {
        if (triggerButton) {
            setPrimaryActionFeedback(triggerButton, 'Nothing to send', 'error');
            setTimeout(resetPrimaryActionFeedback, 1800);
        }
        return;
    }

    const target = resolveWebhookTarget(targetId, currentOptions);
    if (!target) {
        if (triggerButton) {
            setPrimaryActionFeedback(triggerButton, 'Target not found', 'error');
            setTimeout(resetPrimaryActionFeedback, 2200);
        }
        return;
    }

    if (triggerButton) {
        setPrimaryActionFeedback(triggerButton, `Sending to ${target.name}...`, 'success', 'send');
    }

    try {
        const result = await browser.runtime.sendMessage({
            ...(globalThis.markSnipWebhookUtils?.buildWebhookSendMessage
                ? globalThis.markSnipWebhookUtils.buildWebhookSendMessage({
                    targetId,
                    markdown: content,
                    title: getCurrentExportTitle(),
                    clipState: currentClipState
                })
                : {
                    type: 'webhook-send',
                    targetId,
                    markdown: content,
                    title: getCurrentExportTitle(),
                    sourceUrl: currentClipState?.pageUrl || ''
                })
        });

        if (result?.success) {
            await recordSuccessfulSendMetric();
            window.close();
        } else {
            if (triggerButton) {
                setPrimaryActionFeedback(triggerButton, 'Failed', 'error', 'send');
                setTimeout(resetPrimaryActionFeedback, 3000);
            }
            showToastWithRetry(result?.error || 'Failed to send to webhook target', targetId, { selectionOnly, triggerButton });
        }
    } catch (error) {
        console.error('Webhook send error:', error);
        if (triggerButton) {
            setPrimaryActionFeedback(triggerButton, 'Error', 'error', 'send');
            setTimeout(resetPrimaryActionFeedback, 3000);
        }
        const message = globalThis.markSnipWebhookUtils?.resolveWebhookSendErrorMessage
            ? globalThis.markSnipWebhookUtils.resolveWebhookSendErrorMessage(error)
            : (error?.message || 'Failed to send to webhook target');
        showToastWithRetry(message, targetId, { selectionOnly, triggerButton });
    }
}

function showToastWithRetry(message, targetId, sendOptions) {
    const existing = document.querySelector('.popup-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'popup-toast popup-toast--error';
    toast.setAttribute('role', 'alert');
    document.body.appendChild(toast);

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    toast.appendChild(msgSpan);

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn btn-sm btn-text popup-toast__retry';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', () => {
        toast.remove();
        handleWebhookSendAction(targetId, sendOptions).catch((e) =>
            console.error('Retry webhook send failed:', e)
        );
    });
    toast.appendChild(retryBtn);
}

async function exportCurrentContent(kind, { selectionOnly = false, closeAfter = false } = {}) {
    if (selectionOnly && !editorHasSelection()) {
        return;
    }

    const exportKind = kind === 'print'
        ? 'print'
        : resolveDefaultExportType({ defaultExportType: kind });
    const markdown = selectionOnly ? getEditorSelection() : getEditorValue();
    const title = getCurrentExportTitle();

    if (exportKind === 'markdown') {
        await sendDownloadMessage(markdown, dom.titleInput?.value || '');
        if (closeAfter) {
            window.close();
        }
        return;
    }

    if (exportKind === 'pdf' || exportKind === 'print') {
        await handlePrintExport(exportKind, { markdown, title });
        return;
    }

    await sendGeneratedDownloadMessage(exportKind, markdown, title);
    if (closeAfter) {
        window.close();
    }
}

async function handlePrimaryCopyAction({ selectionOnly = false, triggerButton = null } = {}) {
    closeSplitDropdown();
    if (selectionOnly && !editorHasSelection()) {
        return;
    }

    const textToCopy = selectionOnly ? getEditorSelection() : getEditorValue();
    if (!String(textToCopy || '').trim()) {
        if (triggerButton) {
            setPrimaryActionFeedback(triggerButton, popupMessage('popupNothingToCopyFeedback', null, 'Nothing to copy'), 'error', 'copy');
            setTimeout(resetPrimaryActionFeedback, 1800);
        }
        return;
    }

    try {
        await navigator.clipboard.writeText(textToCopy);
        await recordSuccessfulCopyMetric();

        if (triggerButton) {
            setPrimaryActionFeedback(
                triggerButton,
                selectionOnly
                    ? popupMessage('popupCopiedSelectionFeedback', null, 'Copied Selection!')
                    : popupMessage('popupCopiedFeedback', null, 'Copied!'),
                'success',
                'copy'
            );
            setTimeout(resetPrimaryActionFeedback, 2000);
        }
    } catch (error) {
        if (triggerButton) {
            setPrimaryActionFeedback(triggerButton, popupMessage('popupFailedFeedback', null, 'Failed'), 'error', 'copy');
            setTimeout(resetPrimaryActionFeedback, 2000);
        }
        throw error;
    }
}

async function handleExplicitExport(kind) {
    closeSplitDropdown();
    await exportCurrentContent(kind, {
        closeAfter: shouldClosePopupAfterExport(kind)
    });
}

// Download event handler - updated to use promises
async function download(e) {
    e.preventDefault();
    const primaryActionType = resolvePopupPrimaryActionType(currentOptions);
    try {
        if (primaryActionType === 'sendTo') {
            await handleSendToAction(currentOptions?.defaultSendToTarget, {
                triggerButton: dom.downloadButton
            });
            return;
        }

        if (primaryActionType === 'copy') {
            await handlePrimaryCopyAction({
                triggerButton: dom.downloadButton
            });
            return;
        }

        const webhookTargetId = getWebhookTargetIdFromExportType(primaryActionType);
        if (webhookTargetId) {
            await handleWebhookSendAction(webhookTargetId, {
                triggerButton: dom.downloadButton
            });
            return;
        }

        await exportCurrentContent(primaryActionType, {
            closeAfter: shouldClosePopupAfterExport(primaryActionType)
        });
    } catch (error) {
        console.error("Error exporting content:", error);
    }
}

// Download selection handler - updated to use promises
async function downloadSelection(e) {
    e.preventDefault();
    const primaryActionType = resolvePopupPrimaryActionType(currentOptions);
    try {
        if (primaryActionType === 'sendTo') {
            await handleSendToAction(currentOptions?.defaultSendToTarget, {
                selectionOnly: true,
                triggerButton: dom.downloadSelectionButton
            });
            return;
        }

        if (primaryActionType === 'copy') {
            await handlePrimaryCopyAction({
                selectionOnly: true,
                triggerButton: dom.downloadSelectionButton
            });
            return;
        }

        const webhookTargetId = getWebhookTargetIdFromExportType(primaryActionType);
        if (webhookTargetId) {
            await handleWebhookSendAction(webhookTargetId, {
                selectionOnly: true,
                triggerButton: dom.downloadSelectionButton
            });
            return;
        }

        await exportCurrentContent(primaryActionType, {
            selectionOnly: true
        });
    } catch (error) {
        console.error("Error exporting selected content:", error);
    }
}

async function recordSuccessfulCopyMetric() {
    const tabId = await getActiveTabId();

    return browser.runtime.sendMessage({
        type: 'record-notification-metrics',
        tabId,
        delta: {
            copies: 1,
            exports: 1
        }
    }).catch(() => {});
}

// Function to handle copying text to clipboard
async function copyToClipboard(e) {
    e.preventDefault();
    const copyButton = dom.copyButton;
    if (!copyButton) return;

    try {
        const hasSelection = editorHasSelection();
        const textToCopy = hasSelection ? getEditorSelection() : getEditorValue();

        if (!textToCopy.trim()) {
            return;
        }

        await navigator.clipboard.writeText(textToCopy);
        await recordSuccessfulCopyMetric();

        // Show success feedback
        const originalHTML = copyButton.innerHTML;
        copyButton.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
            Copied!
        `;
        copyButton.classList.add("success");

        // Reset button after 2 seconds
        setTimeout(() => {
            copyButton.innerHTML = originalHTML;
            copyButton.classList.remove("success");
        }, 2000);

    } catch (error) {
        console.error('Failed to copy text:', error);

        // Show error feedback
        const originalHTML = copyButton.innerHTML;
        copyButton.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/>
            </svg>
            Failed
        `;
        copyButton.classList.add("error");

        setTimeout(() => {
            copyButton.innerHTML = originalHTML;
            copyButton.classList.remove("error");
        }, 2000);
    }
}

function copySelectionToClipboard(e) {
    e.preventDefault();
    const copySelButton = dom.copySelectionButton;
    if (!editorHasSelection() || !copySelButton) return;

    const selectedText = getEditorSelection();
    navigator.clipboard.writeText(selectedText).then(async () => {
        await recordSuccessfulCopyMetric();

        // Show success feedback
        const originalHTML = copySelButton.innerHTML;
        copySelButton.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
            Copied!
        `;
        copySelButton.classList.add("success");

        setTimeout(() => {
            copySelButton.innerHTML = originalHTML;
            copySelButton.classList.remove("success");
        }, 2000);
    }).catch(err => {
        console.error("Error copying selection:", err);
    });
}

// Function to send markdown to Obsidian
async function sendToObsidian(e) {
    e.preventDefault();
    const obsidianButton = dom.sendToObsidianButton;
    if (!obsidianButton) return;

    const originalHTML = obsidianButton.innerHTML;

    try {
        // Get current options including Obsidian settings
        const options = await browser.storage.sync.get();

        // Check if Obsidian integration is enabled
        if (!options.obsidianIntegration) {
            // Show error state
            obsidianButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/>
                </svg>
                Not Enabled
            `;
            obsidianButton.classList.add("error");

            setTimeout(() => {
                obsidianButton.innerHTML = originalHTML;
                obsidianButton.classList.remove("error");
            }, 3000);
            return;
        }

        // Get markdown content
        const markdown = markSnipObsidian.prepareMarkdownForObsidian(
            getEditorValue(),
            sourceImageMap || {}
        );
        const title = dom.titleInput?.value || popupMessage('popupUntitledFallback', null, 'Untitled');

        const currentTab = await getActiveTab();
        if (!currentTab?.id) {
            throw new Error(popupMessage('popupNoActiveTabError', null, 'No active tab found'));
        }

        // Send message to service worker to handle Obsidian integration
        await browser.runtime.sendMessage({
            type: 'obsidian-integration',
            markdown: markdown,
            tabId: currentTab.id,
            vault: options.obsidianVault || '',
            folder: options.obsidianFolder || '',
            title: title
        });

        // Show success state
        obsidianButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
            Sent to Obsidian!
        `;
        obsidianButton.classList.add("success");

        // Close popup after showing success
        setTimeout(() => {
            window.close();
        }, 1500);

    } catch (error) {
        console.error('Error sending to Obsidian:', error);

        // Show error state
        obsidianButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/>
            </svg>
            Failed
        `;
        obsidianButton.classList.add("error");

        setTimeout(() => {
            obsidianButton.innerHTML = originalHTML;
            obsidianButton.classList.remove("error");
        }, 3000);
    }
}

//function that handles messages from the injected script into the site
function notify(message) {
    // message for displaying markdown
    if (message.type == "display.md") {
        setActiveSiteRuleState(message.matchedSiteRule, message.overriddenKeys, message.effectiveOptions || message.options);
        imageList = message.imageList;
        sourceImageMap = message.sourceImageMap;
        mdClipsFolder = message.mdClipsFolder;
        updateCurrentClipState({
            title: message.article?.title,
            markdown: message.markdown,
            pageUrl: resolveClipPageUrl(message.article),
            excerpt: message.article?.excerpt,
            byline: message.article?.byline,
            keywords: message.article?.keywords,
            publishedTime: message.article?.publishedTime
        });
        if (dom.titleInput) {
            dom.titleInput.value = message.article.title;
        }
        setEditorValue(message.markdown);
        applyActiveSiteRuleUi(message.effectiveOptions || currentOptions);

        const shouldRevealMainView = activePopupView === null;
        if (shouldRevealMainView) {
            setPopupView('main', { immediate: true }).catch((error) => {
                console.error('Failed to show main popup view:', error);
            });
        }
        dom.spinner.style.display = 'none';
        maybeAutoSaveCurrentClip().catch((error) => {
            console.error('Failed during popup library auto-save:', error);
        });
        scheduleDeferredLibraryWarmup();

        if (!shouldRevealMainView && activePopupView === 'main') {
            dom.downloadButton?.focus();
        }
        refreshEditor();
    }
    else if (message.type === "batch-progress") {
        progressUI.show();
        setBatchFooterVisible(false);

        const total = message.total || 0;
        const current = message.current || 0;
        const url = message.url || '';
        const pageTitle = message.pageTitle || null;

        if (total > 0) {
            progressUI.updateProgress(current, total, url, pageTitle);
        }

        switch (message.status) {
            case 'started':
                progressUI.setStatus(message.batchSaveMode === 'zip' ? 'Batch started (ZIP mode)...' : 'Batch started...');
                progressUI.showCancelButton();
                break;
            case 'loading':
                progressUI.setStatus(popupMessage('popupBatchLoadingPage', null, 'Loading page...'));
                break;
            case 'converting':
                progressUI.setStatus(popupMessage('popupBatchConvertingPage', null, 'Converting page...'));
                break;
            case 'retrying':
                progressUI.setStatus(popupMessage('popupBatchRetryingPage', null, 'Retrying page capture...'));
                break;
            case 'zipping':
                progressUI.setStatus(popupMessage('popupBatchCreatingZip', null, 'Creating ZIP archive...'));
                break;
            case 'combining':
                progressUI.setStatus(popupMessage('popupBatchCombining', null, 'Building combined document...'));
                break;
            case 'warning':
                progressUI.setStatus(message.message || popupMessage('popupBatchWarning', null, 'Warning during conversion'));
                break;
            case 'item-error':
                progressUI.setStatus(popupMessage(
                    'popupBatchItemError',
                    [message.error || popupMessage('popupBatchFailedUrl', null, 'Failed URL')],
                    `Error: ${message.error || 'Failed URL'}`
                ));
                break;
            case 'cancelled':
                progressUI.setStatus(popupMessage('popupBatchCancelled', null, 'Batch cancelled'));
                progressUI.hideCancelButton();
                dom.spinner.style.display = 'none';
                setBatchFooterVisible(true);
                break;
            case 'failed':
                progressUI.setStatus(popupMessage(
                    'popupBatchFailed',
                    [message.error || popupMessage('popupBatchUnknownError', null, 'Unknown error')],
                    `Batch failed: ${message.error || 'Unknown error'}`
                ));
                progressUI.hideCancelButton();
                dom.spinner.style.display = 'none';
                setBatchFooterVisible(true);
                break;
            case 'finished':
                if (message.failed > 0) {
                    progressUI.setStatus(popupMessage(
                        'popupBatchFinishedWithErrors',
                        [message.failed],
                        `Finished with ${message.failed} error(s)`
                    ));
                } else if (message.batchSaveMode === 'zip') {
                    progressUI.setStatus(popupMessage('popupBatchZipDownloaded', null, 'ZIP downloaded'));
                } else if (message.batchSaveMode === 'combined') {
                    progressUI.setStatus(popupMessage('popupBatchCombinedDownloaded', null, 'Combined file downloaded'));
                } else {
                    progressUI.setStatus(popupMessage('popupBatchComplete', null, 'Batch complete'));
                }
                progressUI.hideCancelButton();
                dom.spinner.style.display = 'none';
                setBatchFooterVisible(true);
                break;
        }
    }
}

function showError(err, useEditor = true) {
    setPopupView('main', { immediate: true }).catch((error) => {
        console.error('Failed to show main popup view after error:', error);
    });
    dom.spinner.style.display = 'none';
    
    if (useEditor) {
        setEditorValue(`Error clipping the page\n\n${err}`);
    } else {
        const currentContent = getEditorValue();
        setEditorValue(`${currentContent}\n\nError: ${err}`);
    }
    refreshEditor();
}
