let options = defaultOptions;
let librarySettings = {
    enabled: true,
    autoSaveOnPopupOpen: true,
    itemsToKeep: 10
};
let agentBridgeSettings = {
    enabled: false
};
let agentBridgeStatus = {
    enabled: false,
    permissionGranted: false,
    connecting: false,
    connected: false,
    hostInstalled: false,
    browser: '',
    hostVersion: '',
    lastError: '',
    updatedAt: ''
};
let agentBridgeInstallCommand = 'marksnip install-host';
let keyupTimeout = null;
let templatePreviewListenersBound = false;
const SPECIAL_THEME_CLASS_NAMES = ['special-theme-claude', 'special-theme-perplexity', 'special-theme-openai', 'special-theme-atla', 'special-theme-ben10', 'special-theme-colorblind'];
const COLORBLIND_VARIANT_CLASS_NAMES = ['colorblind-theme-deuteranopia', 'colorblind-theme-protanopia', 'colorblind-theme-tritanopia'];
const ACCENT_CLASS_NAMES = ['accent-sage', 'accent-ocean', 'accent-slate', 'accent-rose', 'accent-amber'];
const POPUP_THEME_CACHE_KEY = 'marksnip-popup-theme-cache-v1';
const DEFAULT_SEND_TO_TARGET = 'chatgpt';
const DEFAULT_SEND_TO_MAX_URL_LENGTH = 3600;
const SITE_RULE_BOOLEAN_FIELD_IDS = {
    includeTemplate: 'siteRuleIncludeTemplate',
    downloadImages: 'siteRuleDownloadImages'
};
const SITE_RULE_ENUM_FIELD_IDS = {
    imageStyle: 'siteRuleImageStyle',
    imageRefStyle: 'siteRuleImageRefStyle'
};
const SITE_RULE_TEXT_FIELD_IDS = {
    frontmatter: { toggleId: 'siteRuleFrontmatterEnabled', inputId: 'siteRuleFrontmatter' },
    backmatter: { toggleId: 'siteRuleBackmatterEnabled', inputId: 'siteRuleBackmatter' },
    title: { toggleId: 'siteRuleTitleEnabled', inputId: 'siteRuleTitle' },
    imagePrefix: { toggleId: 'siteRuleImagePrefixEnabled', inputId: 'siteRuleImagePrefix' },
    mdClipsFolder: { toggleId: 'siteRuleMdClipsFolderEnabled', inputId: 'siteRuleMdClipsFolder' }
};
	const SITE_RULE_TABLE_FIELD_IDS = {
	    stripLinks: 'siteRuleTableStripLinks',
	    stripFormatting: 'siteRuleTableStripFormatting',
	    prettyPrint: 'siteRuleTablePrettyPrint',
	    centerText: 'siteRuleTableCenterText'
	};
	const SITE_RULE_OVERRIDE_LABELS = {
	    includeTemplate: 'Template',
	    downloadImages: 'Download Images',
	    frontmatter: 'Frontmatter',
	    backmatter: 'Backmatter',
	    title: 'Title',
	    imagePrefix: 'Image Prefix',
	    mdClipsFolder: 'Downloads Folder',
	    imageStyle: 'Image Style',
	    imageRefStyle: 'Image Refs',
	    imagePlacement: 'Image Folder',
	    'tableFormatting.stripLinks': 'Strip Links',
	    'tableFormatting.stripFormatting': 'Strip Formatting',
	    'tableFormatting.prettyPrint': 'Pretty Print',
	    'tableFormatting.centerText': 'Center Text'
	};
	let siteRuleEditorState = {
	    mode: 'create',
	    ruleId: null
	};

	function optionsMessage(key, substitutions, fallback) {
	    return globalThis.markSnipI18n?.t(key, substitutions, fallback) || fallback || key;
	}

		function getOptionsStateApi() {
		    return globalThis.markSnipOptionsState || null;
		}

function getDefaultContextMenuItemsState() {
    return defaultOptions?.contextMenuItems && typeof defaultOptions.contextMenuItems === 'object'
        ? defaultOptions.contextMenuItems
        : {};
}

function normalizeContextMenuItemsState(contextMenuItems) {
    const optionsStateApi = getOptionsStateApi();
    if (optionsStateApi?.normalizeContextMenuItems) {
        return optionsStateApi.normalizeContextMenuItems(contextMenuItems, getDefaultContextMenuItemsState());
    }

    const defaults = getDefaultContextMenuItemsState();
    const source = contextMenuItems && typeof contextMenuItems === 'object' ? contextMenuItems : {};
    return Object.keys(defaults).reduce((normalized, key) => {
        normalized[key] = Object.prototype.hasOwnProperty.call(source, key)
            ? source[key] !== false
            : defaults[key] !== false;
        return normalized;
    }, {});
}

function setContextMenuItemControls(contextMenuItems) {
    const normalizedItems = normalizeContextMenuItemsState(contextMenuItems);
    document.querySelectorAll("input[name^='contextMenuItems.']").forEach((input) => {
        const itemKey = input.name.split('.')[1];
        input.checked = normalizedItems[itemKey] !== false;
    });
}

async function setAllContextMenuItems(enabled) {
    options.contextMenuItems = Object.keys(getDefaultContextMenuItemsState()).reduce((items, key) => {
        items[key] = Boolean(enabled);
        return items;
    }, {});
    setContextMenuItemControls(options.contextMenuItems);
    await save();
    refreshElements();
}

function getLibraryStateApi() {
    return globalThis.markSnipLibraryState || null;
}

	function getAgentBridgeStateApi() {
	    return globalThis.markSnipAgentBridgeState || null;
	}

	function getSiteRulesApi() {
	    return globalThis.markSnipSiteRules || null;
	}

	function getTemplateUtils() {
	    return globalThis.markSnipTemplateUtils || null;
	}

	function normalizeSiteRulesState(rules) {
	    const siteRulesApi = getSiteRulesApi();
	    if (siteRulesApi?.normalizeSiteRules) {
	        return siteRulesApi.normalizeSiteRules(rules);
	    }

	    return Array.isArray(rules) ? rules.slice() : [];
	}

	function normalizeSiteRuleOverridesState(overrides) {
	    const siteRulesApi = getSiteRulesApi();
	    if (siteRulesApi?.normalizeSiteRuleOverrides) {
	        return siteRulesApi.normalizeSiteRuleOverrides(overrides);
	    }

	    return overrides && typeof overrides === 'object' ? { ...overrides } : {};
	}

	function validateSiteRulePatternState(pattern) {
	    const siteRulesApi = getSiteRulesApi();
	    if (siteRulesApi?.validateSiteRulePattern) {
	        return siteRulesApi.validateSiteRulePattern(pattern);
	    }

	    const normalizedPattern = String(pattern || '').trim();
	    return {
	        valid: Boolean(normalizedPattern),
	        error: normalizedPattern ? '' : 'Pattern is required',
	        normalizedPattern
	    };
	}

	function buildSiteRuleIdState() {
	    return `site-rule-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
	}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildCustomSendToTargetId() {
    return `custom-target-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function getSendToUrlValidationState(value) {
    const optionsStateApi = getOptionsStateApi();
    if (optionsStateApi?.validateSendToUrlTemplate) {
        return optionsStateApi.validateSendToUrlTemplate(value);
    }

    const normalizedValue = String(value || '').trim();
    if (!normalizedValue) {
        return { valid: false, normalizedValue: '', error: 'URL template is required' };
    }

    const matches = normalizedValue.match(/\{prompt\}/g) || [];
    if (matches.length !== 1) {
        return { valid: false, normalizedValue, error: 'URL template must contain exactly one {prompt} placeholder' };
    }

    const queryStartIndex = normalizedValue.indexOf('?');
    const hashStartIndex = normalizedValue.indexOf('#');
    const promptIndex = normalizedValue.indexOf('{prompt}');
    const queryEndIndex = hashStartIndex === -1 ? normalizedValue.length : hashStartIndex;
    if (queryStartIndex === -1 || promptIndex < queryStartIndex || promptIndex >= queryEndIndex) {
        return { valid: false, normalizedValue, error: '{prompt} must appear in the query portion of the URL' };
    }

    try {
        const parsedUrl = new URL(normalizedValue.replace('{prompt}', '__MARKSNIP_PROMPT__'));
        if (parsedUrl.protocol !== 'https:') {
            return { valid: false, normalizedValue, error: 'URL template must start with https://' };
        }
    } catch {
        return { valid: false, normalizedValue, error: 'URL template must be a valid HTTPS URL' };
    }

    return { valid: true, normalizedValue, error: '' };
}

function normalizeCustomSendToTargetsState(targets) {
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
        const validation = getSendToUrlValidationState(target.urlTemplate ?? target.url);
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

function normalizeDefaultSendToTargetState(value, customTargets = normalizeCustomSendToTargetsState(options?.sendToCustomTargets)) {
    const optionsStateApi = getOptionsStateApi();
    if (optionsStateApi?.normalizeDefaultSendToTarget) {
        return optionsStateApi.normalizeDefaultSendToTarget(value, customTargets, DEFAULT_SEND_TO_TARGET);
    }

    const normalizedValue = String(value || '').trim();
    if (normalizedValue === 'chatgpt' || normalizedValue === 'claude' || normalizedValue === 'perplexity') {
        return normalizedValue;
    }

    return customTargets.some((target) => target.id === normalizedValue)
        ? normalizedValue
        : DEFAULT_SEND_TO_TARGET;
}

function normalizeSendToMaxUrlLengthState(value, fallbackValue = defaultOptions?.sendToMaxUrlLength ?? DEFAULT_SEND_TO_MAX_URL_LENGTH) {
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

function getDefaultWebhookBodyTemplate() {
    const explicitDefault = defaultOptions?.defaultWebhookBodyTemplate;
    if (typeof explicitDefault === 'string' && explicitDefault.trim()) {
        return explicitDefault;
    }

    const runtimeDefault = globalThis.markSnipWebhookUtils?.DEFAULT_WEBHOOK_BODY_TEMPLATE;
    if (typeof runtimeDefault === 'string' && runtimeDefault.trim()) {
        return runtimeDefault;
    }

    throw new Error('Default webhook body template is unavailable');
}

function normalizeWebhookTargetsState(targets) {
    const optionsStateApi = getOptionsStateApi();
    if (optionsStateApi?.normalizeWebhookTargets) {
        return optionsStateApi.normalizeWebhookTargets(targets);
    }

    if (!Array.isArray(targets)) {
        return [];
    }

    const VALID_METHODS = new Set(['POST', 'PUT', 'PATCH']);
    const seenIds = new Set();
    return targets.reduce((result, target, index) => {
        if (!target || typeof target !== 'object') {
            return result;
        }

        const id = String(target.id || '').trim() || `wh-${index + 1}`;
        const name = String(target.name || '').trim();
        const url = String(target.url || '').trim();
        if (!id || !name || !url) {
            return result;
        }

        if (seenIds.has(id)) {
            return result;
        }

        let parsedUrl;
        try { parsedUrl = new URL(url); } catch { return result; }
        if (parsedUrl.protocol !== 'https:') {
            return result;
        }

        const method = VALID_METHODS.has(String(target.method || '').toUpperCase())
            ? String(target.method).toUpperCase() : 'POST';

        let bodyTemplate = String(target.bodyTemplate || '').trim();
        if (bodyTemplate) {
            try { JSON.parse(bodyTemplate); } catch { bodyTemplate = ''; }
        }

        const headers = Array.isArray(target.headers) ? target.headers.filter((h) => {
            return h && typeof h === 'object' && String(h.key || '').trim().length > 0;
        }).map((h) => ({
            key: String(h.key).trim(),
            value: String(h.value || '').trim()
        })) : [];

        seenIds.add(id);
        result.push({ id, name, url, method, headers, bodyTemplate });
        return result;
    }, []);
}

function getNormalizedSendToTargets() {
    const targets = normalizeCustomSendToTargetsState(options?.sendToCustomTargets);
    options.sendToCustomTargets = targets;
    options.defaultSendToTarget = normalizeDefaultSendToTargetState(options?.defaultSendToTarget, targets);
    return targets;
}

function renderDefaultSendToTargetOptions() {
    const customContainer = document.getElementById('defaultSendToTargetCustomOptions');
    if (!customContainer) {
        return;
    }

    const defaultTarget = normalizeDefaultSendToTargetState(options?.defaultSendToTarget, getNormalizedSendToTargets());
    const builtInInputs = {
        chatgpt: document.getElementById('send-to-target-chatgpt'),
        claude: document.getElementById('send-to-target-claude'),
        perplexity: document.getElementById('send-to-target-perplexity')
    };
    Object.entries(builtInInputs).forEach(([targetId, input]) => {
        if (input) {
            input.checked = defaultTarget === targetId;
        }
    });

    const targets = getNormalizedSendToTargets();
    customContainer.innerHTML = '';
    targets.forEach((target) => {
        const radioPill = document.createElement('div');
        radioPill.className = 'radio-pill';

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'defaultSendToTarget';
        input.id = `send-to-target-${target.id}`;
        input.value = target.id;
        input.checked = defaultTarget === target.id;

        const label = document.createElement('label');
        label.setAttribute('for', input.id);
        label.textContent = target.name;

        radioPill.appendChild(input);
        radioPill.appendChild(label);
        customContainer.appendChild(radioPill);
    });
}

function renderAssistantTargetsList() {
    const list = document.getElementById('assistantTargetsList');
    if (!list) {
        return;
    }

    const targets = getNormalizedSendToTargets();
    list.innerHTML = '';
    if (targets.length === 0) {
        const emptyState = document.createElement('p');
        emptyState.className = 'assistant-targets-empty';
        emptyState.textContent = optionsMessage(
            'optionsAssistantTargetsEmpty',
            null,
            'No custom assistant targets yet. ChatGPT, Claude, and Perplexity are always available.'
        );
        list.appendChild(emptyState);
        return;
    }

    targets.forEach((target) => {
        const item = document.createElement('article');
        item.className = 'assistant-target-item';

        const body = document.createElement('div');
        body.className = 'assistant-target-item__body';

        const name = document.createElement('h4');
        name.className = 'assistant-target-item__name';
        name.textContent = target.name;

        const meta = document.createElement('code');
        meta.className = 'assistant-target-item__meta';
        meta.textContent = target.urlTemplate;
        meta.title = target.urlTemplate;

        body.appendChild(name);
        body.appendChild(meta);

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'btn btn-secondary btn-sm assistant-target-item__remove';
        removeButton.dataset.targetId = target.id;
        removeButton.textContent = optionsMessage('optionsAssistantTargetRemoveBtn', null, 'Remove');
        removeButton.setAttribute(
            'aria-label',
            optionsMessage('optionsAssistantTargetRemoveAria', [target.name], `Remove ${target.name}`)
        );

        item.appendChild(body);
        item.appendChild(removeButton);
        list.appendChild(item);
    });
}

function handleDefaultSendToTargetChoice(event) {
    const input = event.target;
    if (!input || input.name !== 'defaultSendToTarget') {
        return;
    }

    options.defaultSendToTarget = normalizeDefaultSendToTargetState(input.value, getNormalizedSendToTargets());
    renderDefaultSendToTargetOptions();
    save();
}

async function handleAddCustomSendToTarget() {
    const nameInput = document.getElementById('customSendToName');
    const urlInput = document.getElementById('customSendToUrl');
    const name = String(nameInput?.value || '').trim();
    const validation = getSendToUrlValidationState(urlInput?.value || '');

    if (!name) {
        showToast(optionsMessage('optionsAssistantTargetNameRequired', null, 'Please enter a target name'), 'error');
        nameInput?.focus();
        return;
    }

    if (!validation.valid) {
        showToast(validation.error || 'Please enter a valid URL template', 'error');
        urlInput?.focus();
        return;
    }

    const nextTargets = [
        ...getNormalizedSendToTargets(),
        {
            id: buildCustomSendToTargetId(),
            name,
            urlTemplate: validation.normalizedValue
        }
    ];

    options.sendToCustomTargets = normalizeCustomSendToTargetsState(nextTargets);
    options.defaultSendToTarget = normalizeDefaultSendToTargetState(options.defaultSendToTarget, options.sendToCustomTargets);
    renderDefaultSendToTargetOptions();
    renderAssistantTargetsList();

    if (nameInput) {
        nameInput.value = '';
    }
    if (urlInput) {
        urlInput.value = '';
    }

    save({
        message: optionsMessage('optionsAssistantTargetAdded', [name], `Added "${name}"`),
        type: 'success'
    });
    nameInput?.focus();
}

function removeCustomSendToTarget(targetId) {
    const currentTargets = getNormalizedSendToTargets();
    const removedTarget = currentTargets.find((target) => target.id === targetId);
    if (!removedTarget) {
        return;
    }

    options.sendToCustomTargets = currentTargets.filter((target) => target.id !== targetId);
    options.defaultSendToTarget = normalizeDefaultSendToTargetState(
        options.defaultSendToTarget === targetId ? DEFAULT_SEND_TO_TARGET : options.defaultSendToTarget,
        options.sendToCustomTargets
    );

    renderDefaultSendToTargetOptions();
    renderAssistantTargetsList();
    save({
        message: optionsMessage('optionsAssistantTargetRemoved', [removedTarget.name], `Removed "${removedTarget.name}"`),
        type: 'success'
    });
}

function initSendToControls() {
    document.getElementById('defaultSendToTargetOptions')?.addEventListener('change', handleDefaultSendToTargetChoice);
    document.getElementById('addSendToCustomTarget')?.addEventListener('click', () => {
        handleAddCustomSendToTarget().catch((error) => {
            console.error('Failed to add custom assistant target:', error);
            showToast(optionsMessage('optionsAssistantTargetAddFailed', null, 'Failed to add assistant target'), 'error');
        });
    });
    document.getElementById('assistantTargetsList')?.addEventListener('click', (event) => {
        const removeButton = event.target.closest('[data-target-id]');
        if (!removeButton) {
            return;
        }
        removeCustomSendToTarget(removeButton.dataset.targetId);
    });

    ['customSendToName', 'customSendToUrl'].forEach((inputId) => {
        document.getElementById(inputId)?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') {
                return;
            }
            event.preventDefault();
            handleAddCustomSendToTarget().catch((error) => {
                console.error('Failed to add custom assistant target:', error);
                showToast(optionsMessage('optionsAssistantTargetAddFailed', null, 'Failed to add assistant target'), 'error');
            });
        });
    });
}
// ── Webhook Targets ──────────────────────────────────────────

let editingWebhookTargetId = null;

function buildWebhookTargetId() {
    return `wh-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function getNormalizedWebhookTargets() {
    const optionsStateApi = getOptionsStateApi();
    if (optionsStateApi?.normalizeWebhookTargets) {
        return optionsStateApi.normalizeWebhookTargets(options.webhookTargets || []);
    }
    return Array.isArray(options.webhookTargets) ? options.webhookTargets : [];
}

function renderWebhookTargetsList() {
    const list = document.getElementById('webhookTargetsList');
    if (!list) {
        return;
    }

    const targets = getNormalizedWebhookTargets();

    list.innerHTML = '';
    if (targets.length === 0) {
        const emptyState = document.createElement('p');
        emptyState.className = 'assistant-targets-empty';
        emptyState.textContent = 'No webhook targets configured yet.';
        list.appendChild(emptyState);
        return;
    }

    targets.forEach((target) => {
        const item = document.createElement('article');
        item.className = 'assistant-target-item';

        const body = document.createElement('div');
        body.className = 'assistant-target-item__body';

        const header = document.createElement('div');
        header.className = 'assistant-target-item__header';

        const name = document.createElement('h4');
        name.className = 'assistant-target-item__name';
        name.textContent = target.name;

        const methodBadge = document.createElement('span');
        methodBadge.className = 'webhook-method-badge';
        methodBadge.textContent = target.method;

        header.appendChild(methodBadge);
        header.appendChild(name);

        const meta = document.createElement('code');
        meta.className = 'assistant-target-item__meta';
        meta.textContent = target.url;
        meta.title = target.url;

        body.appendChild(header);
        body.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'assistant-target-item__actions';

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'btn btn-secondary btn-sm';
        editButton.dataset.targetId = target.id;
        editButton.dataset.action = 'edit-webhook';
        editButton.textContent = 'Edit';
        editButton.setAttribute('aria-label', `Edit ${target.name}`);

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'btn btn-secondary btn-sm assistant-target-item__remove';
        removeButton.dataset.targetId = target.id;
        removeButton.textContent = 'Remove';
        removeButton.setAttribute('aria-label', `Remove ${target.name}`);

        actions.appendChild(editButton);
        actions.appendChild(removeButton);

        item.appendChild(body);
        item.appendChild(actions);
        list.appendChild(item);
    });
}

function renderDefaultExportTypeOptions() {
    const container = document.getElementById('defaultExportTypeGroup');
    if (!container) {
        return;
    }

    // Remove old webhook radio buttons (keep the built-in ones)
    const existingWebhookRadios = container.querySelectorAll('.radio-pill[data-webhook-target]');
    existingWebhookRadios.forEach((el) => el.remove());

    const targets = getNormalizedWebhookTargets();
    const radioGroup = container.querySelector('.radio-group');
    if (!radioGroup) {
        return;
    }

    targets.forEach((target) => {
        const pill = document.createElement('div');
        pill.className = 'radio-pill';
        pill.dataset.webhookTarget = target.id;

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'defaultExportType';
        input.id = `export-webhook-${target.id}`;
        input.value = `webhook:${target.id}`;
        // Attach change listener directly since dynamically created radios
        // are not covered by the synchronous event listener loop in loaded()
        input.addEventListener('change', inputChange);

        const label = document.createElement('label');
        label.setAttribute('for', input.id);
        label.textContent = `Webhook: ${target.name}`;

        pill.appendChild(input);
        pill.appendChild(label);
        radioGroup.appendChild(pill);
    });
}

function populateWebhookTargetForm(target) {
    const nameInput = document.getElementById('webhookTargetName');
    const urlInput = document.getElementById('webhookTargetUrl');
    const methodSelect = document.getElementById('webhookTargetMethod');
    const bodyTextarea = document.getElementById('webhookTargetBody');
    const headersList = document.getElementById('webhookHeadersList');

    if (nameInput) nameInput.value = target.name;
    if (urlInput) urlInput.value = target.url;
    if (methodSelect) methodSelect.value = target.method;
    if (bodyTextarea) bodyTextarea.value = target.bodyTemplate || getDefaultWebhookBodyTemplate();

    if (headersList) {
        headersList.innerHTML = '';
        (target.headers || []).forEach((h) => {
            const row = document.createElement('div');
            row.className = 'webhook-header-row';
            row.innerHTML = `
                <input type="text" class="text-input webhook-header-key" placeholder="Key" spellcheck="false" value="${escapeHtml(h.key)}" />
                <input type="text" class="text-input webhook-header-value" placeholder="Value" spellcheck="false" value="${escapeHtml(h.value)}" />
                <button type="button" class="btn btn-sm btn-text webhook-header-remove" aria-label="Remove header">&times;</button>
            `;
            row.querySelector('.webhook-header-remove').addEventListener('click', () => {
                row.remove();
            });
            headersList.appendChild(row);
        });
    }
}

function handleSaveWebhookTarget() {
    const nameInput = document.getElementById('webhookTargetName');
    const urlInput = document.getElementById('webhookTargetUrl');
    const methodSelect = document.getElementById('webhookTargetMethod');
    const bodyTextarea = document.getElementById('webhookTargetBody');

    const name = String(nameInput?.value || '').trim();
    const url = String(urlInput?.value || '').trim();
    const method = String(methodSelect?.value || 'POST').trim().toUpperCase();
    const bodyTemplate = String(bodyTextarea?.value || '').trim();

    if (!name) {
        showToast('Please enter a target name', 'error');
        nameInput?.focus();
        return;
    }

    if (!url) {
        showToast('Please enter a URL', 'error');
        urlInput?.focus();
        return;
    }

    const webhookValidation = globalThis.markSnipWebhookUtils?.validateWebhookUrl?.(url);
    if (!webhookValidation?.valid) {
        showToast(webhookValidation?.error || 'Please enter a valid public HTTPS URL', 'error');
        urlInput?.focus();
        return;
    }

    if (bodyTemplate) {
        try {
            JSON.parse(bodyTemplate);
        } catch {
            showToast('Body template must be valid JSON (or leave empty)', 'error');
            bodyTextarea?.focus();
            return;
        }
    }

    const headerInputs = document.querySelectorAll('#webhookHeadersList .webhook-header-row');
    const headers = Array.from(headerInputs).map((row) => ({
        key: row.querySelector('.webhook-header-key')?.value || '',
        value: row.querySelector('.webhook-header-value')?.value || ''
    })).filter((h) => h.key.trim().length > 0);

    if (editingWebhookTargetId) {
        // Edit existing target
        const currentTargets = getNormalizedWebhookTargets();
        const index = currentTargets.findIndex((t) => t.id === editingWebhookTargetId);
        if (index !== -1) {
            currentTargets[index] = { ...currentTargets[index], name, url, method, headers, bodyTemplate };
            options.webhookTargets = currentTargets;
        }
        editingWebhookTargetId = null;
        resetWebhookTargetForm();
        renderWebhookTargetsList();
        renderDefaultExportTypeOptions();
        save({ message: `Updated webhook target "${name}"`, type: 'success' });
    } else {
        // Add new target
        const newTarget = {
            id: buildWebhookTargetId(),
            name,
            url,
            method,
            headers,
            bodyTemplate
        };

        const currentTargets = getNormalizedWebhookTargets();
        options.webhookTargets = [...currentTargets, newTarget];

        resetWebhookTargetForm();

        renderWebhookTargetsList();
        renderDefaultExportTypeOptions();
        save({ message: `Added webhook target "${name}"`, type: 'success' });
    }
}

function removeWebhookTarget(targetId) {
    const targets = getNormalizedWebhookTargets();
    const removedTarget = targets.find((t) => t.id === targetId);
    options.webhookTargets = targets.filter((t) => t.id !== targetId);

    // If editing the removed target, cancel edit
    if (editingWebhookTargetId === targetId) {
        editingWebhookTargetId = null;
        resetWebhookTargetForm();
    }

    // If this target was the default, reset to markdown
    if (options.defaultExportType === `webhook:${targetId}`) {
        options.defaultExportType = 'markdown';
    }

    renderWebhookTargetsList();
    renderDefaultExportTypeOptions();
    save({ message: `Removed "${removedTarget?.name || targetId}"`, type: 'success' });
}

function resetWebhookTargetForm() {
    const editor = document.getElementById('webhookTargetEditor');
    if (editor) {
        editor.open = false;
    }
    const nameInput = document.getElementById('webhookTargetName');
    const urlInput = document.getElementById('webhookTargetUrl');
    const methodSelect = document.getElementById('webhookTargetMethod');
    const bodyTextarea = document.getElementById('webhookTargetBody');
    if (nameInput) nameInput.value = '';
    if (urlInput) urlInput.value = '';
    if (methodSelect) methodSelect.value = 'POST';
    if (bodyTextarea) bodyTextarea.value = getDefaultWebhookBodyTemplate();
    const headersList = document.getElementById('webhookHeadersList');
    if (headersList) headersList.innerHTML = '';

    const summary = document.getElementById('webhookEditorSummary');
    if (summary) summary.textContent = 'Add Webhook Target';
    editingWebhookTargetId = null;
}

function initWebhookTargetControls() {
    document.getElementById('webhookAddTarget')?.addEventListener('click', () => {
        try {
            handleSaveWebhookTarget();
        } catch (error) {
            console.error('Failed to save webhook target:', error);
            showToast('Failed to save webhook target', 'error');
        }
    });

    document.getElementById('webhookCancelEdit')?.addEventListener('click', () => {
        resetWebhookTargetForm();
    });

    // Pre-fill body template with default when the editor is opened
    const editor = document.getElementById('webhookTargetEditor');
    if (editor) {
        editor.addEventListener('toggle', () => {
            if (editor.open) {
                const bodyTextarea = document.getElementById('webhookTargetBody');
                if (bodyTextarea && !bodyTextarea.value.trim()) {
                    bodyTextarea.value = getDefaultWebhookBodyTemplate();
                }
            }
        });
    }

    const bodyTextarea = document.getElementById('webhookTargetBody');
    if (bodyTextarea) {
        bodyTextarea.placeholder = getDefaultWebhookBodyTemplate();
    }

    document.getElementById('webhookAddHeader')?.addEventListener('click', () => {
        const list = document.getElementById('webhookHeadersList');
        if (!list) {
            return;
        }

        const row = document.createElement('div');
        row.className = 'webhook-header-row';
        row.innerHTML = `
            <input type="text" class="text-input webhook-header-key" placeholder="Key" spellcheck="false" />
            <input type="text" class="text-input webhook-header-value" placeholder="Value" spellcheck="false" />
            <button type="button" class="btn btn-sm btn-text webhook-header-remove" aria-label="Remove header">&times;</button>
        `;
        row.querySelector('.webhook-header-remove').addEventListener('click', () => {
            row.remove();
        });
        list.appendChild(row);
        row.querySelector('.webhook-header-key')?.focus();
    });

    // Delegate click events on the targets list (edit + remove)
    document.getElementById('webhookTargetsList')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-target-id]');
        if (!button) {
            return;
        }

        const action = button.dataset.action;

        if (action === 'edit-webhook') {
            const targetId = button.dataset.targetId;
            const targets = getNormalizedWebhookTargets();
            const target = targets.find((t) => t.id === targetId);
            if (!target) {
                return;
            }

            editingWebhookTargetId = targetId;
            populateWebhookTargetForm(target);

            const summary = document.getElementById('webhookEditorSummary');
            if (summary) summary.textContent = `Edit: ${target.name}`;

            const editor = document.getElementById('webhookTargetEditor');
            if (editor) editor.open = true;
            return;
        }

        // Fallback: remove (also handles clicks on .assistant-target-item__remove without data-action)
        removeWebhookTarget(button.dataset.targetId);
    });
}

// ===== Interpreter: providers & models managers =====
let interpreterConfig = null;
let editingInterpreterProviderId = null;
let editingInterpreterModelId = null;
let interpreterClearProviderKeyFlag = false;
let interpreterPresets = null;
let interpreterDraggedModelId = null;

function getInterpreterUtilsApi() {
    return globalThis.markSnipInterpreterUtils || null;
}

function getInterpreterConfig() {
    const utils = getInterpreterUtilsApi();
    if (!interpreterConfig) {
        interpreterConfig = utils
            ? utils.normalizeInterpreterConfig(null)
            : { providers: [], models: [] };
    }
    return interpreterConfig;
}

function getInterpreterPresets() {
    if (Array.isArray(interpreterPresets) && interpreterPresets.length) {
        return interpreterPresets;
    }
    return getInterpreterUtilsApi()?.PROVIDER_PRESETS || [];
}

async function persistInterpreterConfig(feedback) {
    const utils = getInterpreterUtilsApi();
    if (!utils) {
        return;
    }
    interpreterConfig = utils.normalizeInterpreterConfig(interpreterConfig);
    try {
        await utils.saveInterpreterConfig(interpreterConfig);
        if (feedback) {
            showToast(feedback, 'success');
        }
    } catch (error) {
        console.error('Failed to save interpreter config:', error);
        showToast('Failed to save interpreter settings', 'error');
    }
}

function buildInterpreterId(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function renderInterpreterProvidersList() {
    const list = document.getElementById('interpreterProvidersList');
    if (!list) {
        return;
    }
    const config = getInterpreterConfig();
    list.innerHTML = '';

    if (config.providers.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'assistant-targets-empty';
        empty.textContent = 'No providers yet. Click "Add Provider" to configure one.';
        list.appendChild(empty);
        return;
    }

    config.providers.forEach((provider) => {
        const item = document.createElement('article');
        item.className = 'assistant-target-item';

        const body = document.createElement('div');
        body.className = 'assistant-target-item__body';

        const header = document.createElement('div');
        header.className = 'assistant-target-item__header';

        const badge = document.createElement('span');
        badge.className = 'interpreter-state-badge ' + (provider.apiKey ? 'is-on' : 'is-off');
        badge.textContent = provider.apiKey
            ? (provider.rememberApiKey ? 'KEY REMEMBERED' : 'SESSION KEY')
            : 'NO KEY';

        const name = document.createElement('h4');
        name.className = 'assistant-target-item__name';
        name.textContent = provider.name;

        header.appendChild(badge);
        header.appendChild(name);

        const meta = document.createElement('code');
        meta.className = 'assistant-target-item__meta';
        meta.textContent = provider.baseUrl;
        meta.title = provider.baseUrl;

        body.appendChild(header);
        body.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'assistant-target-item__actions';

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'btn btn-secondary btn-sm';
        editButton.dataset.providerId = provider.id;
        editButton.dataset.action = 'edit-provider';
        editButton.textContent = 'Edit';
        editButton.setAttribute('aria-label', `Edit ${provider.name}`);

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'btn btn-secondary btn-sm assistant-target-item__remove';
        removeButton.dataset.providerId = provider.id;
        removeButton.dataset.action = 'remove-provider';
        removeButton.textContent = 'Remove';
        removeButton.setAttribute('aria-label', `Remove ${provider.name}`);

        actions.appendChild(editButton);
        actions.appendChild(removeButton);

        item.appendChild(body);
        item.appendChild(actions);
        list.appendChild(item);
    });
}

function renderInterpreterModelsList() {
    const list = document.getElementById('interpreterModelsList');
    if (!list) {
        return;
    }
    const config = getInterpreterConfig();
    list.innerHTML = '';

    if (config.models.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'assistant-targets-empty';
        empty.textContent = 'No models yet. Click "Add Model" to add one.';
        list.appendChild(empty);
        return;
    }

    config.models.forEach((model) => {
        const provider = config.providers.find((p) => p.id === model.providerId);
        const modelLabel = model.providerModelId || model.name;

        const item = document.createElement('article');
        item.className = 'assistant-target-item interpreter-model-row';
        item.draggable = true;
        item.dataset.modelId = model.id;

        const handle = document.createElement('span');
        handle.className = 'interpreter-drag-handle';
        handle.setAttribute('aria-hidden', 'true');
        handle.title = 'Drag to reorder';

        const body = document.createElement('div');
        body.className = 'assistant-target-item__body';

        const name = document.createElement('h4');
        name.className = 'assistant-target-item__name';
        name.textContent = modelLabel;

        const meta = document.createElement('code');
        meta.className = 'assistant-target-item__meta';
        meta.textContent = provider ? provider.name : 'Unknown provider';

        body.appendChild(name);
        body.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'assistant-target-item__actions';

        // Inline enable/disable toggle — flips model.enabled without the modal.
        const toggle = document.createElement('label');
        toggle.className = 'toggle-switch interpreter-row-toggle';
        toggle.title = model.enabled ? 'Shown in popup' : 'Hidden from popup';
        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.checked = model.enabled !== false;
        toggleInput.dataset.modelId = model.id;
        toggleInput.dataset.action = 'toggle-model';
        toggleInput.setAttribute('aria-label', `Show ${modelLabel} in popup`);
        const slider = document.createElement('span');
        slider.className = 'toggle-slider';
        toggle.appendChild(toggleInput);
        toggle.appendChild(slider);

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'btn btn-secondary btn-sm';
        editButton.dataset.modelId = model.id;
        editButton.dataset.action = 'edit-model';
        editButton.textContent = 'Edit';
        editButton.setAttribute('aria-label', `Edit ${modelLabel}`);

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'btn btn-secondary btn-sm assistant-target-item__remove';
        removeButton.dataset.modelId = model.id;
        removeButton.dataset.action = 'remove-model';
        removeButton.textContent = 'Remove';
        removeButton.setAttribute('aria-label', `Remove ${modelLabel}`);

        actions.appendChild(toggle);
        actions.appendChild(editButton);
        actions.appendChild(removeButton);

        item.appendChild(handle);
        item.appendChild(body);
        item.appendChild(actions);
        list.appendChild(item);
    });
}

// Move a model next to another in config order (drag-and-drop reorder). The
// stored order is the order shown in the popup's model dropdown.
function reorderInterpreterModels(draggedId, targetId) {
    if (!draggedId || !targetId || draggedId === targetId) {
        return;
    }
    const config = getInterpreterConfig();
    const from = config.models.findIndex((m) => m.id === draggedId);
    const to = config.models.findIndex((m) => m.id === targetId);
    if (from === -1 || to === -1) {
        return;
    }
    const [moved] = config.models.splice(from, 1);
    config.models.splice(to, 0, moved);
    renderInterpreterModelsList();
    persistInterpreterConfig();
}

function renderInterpreterManagers() {
    renderInterpreterProvidersList();
    renderInterpreterModelsList();
}

function getInterpreterPresetById(presetId) {
    return getInterpreterPresets().find((preset) => preset.id === presetId) || null;
}

function populateProviderPresetSelect() {
    const select = document.getElementById('interpreterProviderPreset');
    if (!select) {
        return;
    }
    select.innerHTML = '';
    getInterpreterPresets().forEach((preset) => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.name;
        select.appendChild(option);
    });
    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = 'Custom';
    select.appendChild(customOption);
}

// Show/hide the Name + API Format fields and refresh the API-key hint to match
// the chosen provider preset (or reveal them for a custom provider).
function applyProviderPresetToForm(presetId) {
    const nameGroup = document.getElementById('interpreterProviderNameGroup');
    const familyGroup = document.getElementById('interpreterProviderFamilyGroup');
    const requiresKeyGroup = document.getElementById('interpreterProviderRequiresKeyGroup');
    const baseUrlInput = document.getElementById('interpreterProviderBaseUrl');
    const hint = document.getElementById('interpreterProviderApiKeyHint');
    const isCustom = presetId === 'custom';

    if (nameGroup) nameGroup.hidden = !isCustom;
    if (familyGroup) familyGroup.hidden = !isCustom;
    if (requiresKeyGroup) requiresKeyGroup.hidden = !isCustom;

    if (isCustom) {
        if (hint) hint.textContent = 'Your API key for this provider. Stored for this browser session unless remembered below.';
        return;
    }

    const preset = getInterpreterPresetById(presetId);
    if (!preset) {
        return;
    }
    if (baseUrlInput) baseUrlInput.value = preset.baseUrl;
    if (hint) {
        hint.textContent = 'Your API key for this provider. ';
        if (preset.apiKeyUrl) {
            const link = document.createElement('a');
            link.href = preset.apiKeyUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = `Get your ${preset.name} API key here.`;
            hint.appendChild(link);
        } else {
            hint.appendChild(document.createTextNode('Stored for this browser session unless remembered below.'));
        }
    }
}

function closeInterpreterDialog(dialogId) {
    const dialog = document.getElementById(dialogId);
    if (dialog && typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
    }
}

function openInterpreterProviderDialog(provider) {
    const dialog = document.getElementById('interpreterProviderDialog');
    if (!dialog) {
        return;
    }
    editingInterpreterProviderId = provider ? provider.id : null;
    interpreterClearProviderKeyFlag = false;

    const title = document.getElementById('interpreterProviderDialogTitle');
    if (title) title.textContent = provider ? 'Edit provider' : 'Add provider';

    const presetSelect = document.getElementById('interpreterProviderPreset');
    const nameInput = document.getElementById('interpreterProviderName');
    const familySelect = document.getElementById('interpreterProviderFamily');
    const requiresKeyInput = document.getElementById('interpreterProviderRequiresKey');
    const baseUrlInput = document.getElementById('interpreterProviderBaseUrl');
    const apiKeyInput = document.getElementById('interpreterProviderApiKey');
    const rememberKeyInput = document.getElementById('interpreterProviderRememberKey');
    const clearKeyButton = document.getElementById('interpreterClearProviderKey');

    let presetId;
    if (provider) {
        presetId = provider.presetId && getInterpreterPresetById(provider.presetId)
            ? provider.presetId
            : 'custom';
    } else {
        presetId = getInterpreterPresets()[0]?.id || 'custom';
    }
    if (presetSelect) presetSelect.value = presetId;
    applyProviderPresetToForm(presetId);

    // The API key field is always left blank; a saved key is preserved unless
    // the user types a replacement or explicitly clears it.
    if (apiKeyInput) apiKeyInput.value = '';

    if (provider) {
        if (presetId === 'custom') {
            if (nameInput) nameInput.value = provider.name || '';
            if (familySelect) familySelect.value = provider.family || 'openai';
            if (requiresKeyInput) requiresKeyInput.checked = provider.apiKeyRequired !== false;
        }
        if (baseUrlInput) baseUrlInput.value = provider.baseUrl || '';
        if (apiKeyInput) {
            apiKeyInput.placeholder = provider.apiKey
                ? 'Leave blank to keep the saved key'
                : 'API key';
        }
        if (rememberKeyInput) rememberKeyInput.checked = provider.rememberApiKey === true;
        if (clearKeyButton) clearKeyButton.hidden = !provider.apiKey;
    } else {
        if (nameInput) nameInput.value = '';
        if (familySelect) familySelect.value = 'openai';
        if (requiresKeyInput) requiresKeyInput.checked = true;
        if (apiKeyInput) apiKeyInput.placeholder = 'API key';
        if (rememberKeyInput) rememberKeyInput.checked = false;
        if (clearKeyButton) clearKeyButton.hidden = true;
    }

    dialog.showModal();
}

// Flags the saved key for removal on the next Save (edit mode only).
function handleClearInterpreterProviderKey() {
    interpreterClearProviderKeyFlag = true;
    const apiKeyInput = document.getElementById('interpreterProviderApiKey');
    const clearKeyButton = document.getElementById('interpreterClearProviderKey');
    if (apiKeyInput) {
        apiKeyInput.value = '';
        apiKeyInput.placeholder = 'Saved key will be removed on Save';
    }
    if (clearKeyButton) clearKeyButton.hidden = true;
}

function handleSaveInterpreterProvider() {
    const presetSelect = document.getElementById('interpreterProviderPreset');
    const nameInput = document.getElementById('interpreterProviderName');
    const familySelect = document.getElementById('interpreterProviderFamily');
    const requiresKeyInput = document.getElementById('interpreterProviderRequiresKey');
    const baseUrlInput = document.getElementById('interpreterProviderBaseUrl');
    const apiKeyInput = document.getElementById('interpreterProviderApiKey');
    const rememberKeyInput = document.getElementById('interpreterProviderRememberKey');

    const presetId = String(presetSelect?.value || 'custom');
    const isCustom = presetId === 'custom';
    const preset = isCustom ? null : getInterpreterPresetById(presetId);

    const name = isCustom
        ? String(nameInput?.value || '').trim()
        : (preset ? preset.name : '');
    const family = isCustom
        ? String(familySelect?.value || 'openai')
        : (preset ? preset.family : 'openai');
    const baseUrl = String(baseUrlInput?.value || '').trim();
    const apiKeyEntered = String(apiKeyInput?.value || '');
    const rememberApiKey = rememberKeyInput?.checked === true;
    const apiKeyRequired = isCustom
        ? Boolean(requiresKeyInput?.checked)
        : (preset ? preset.apiKeyRequired !== false : false);

    if (isCustom && !name) {
        showToast('Please enter a provider name', 'error');
        nameInput?.focus();
        return;
    }
    if (!baseUrl) {
        showToast('Please enter a base URL', 'error');
        baseUrlInput?.focus();
        return;
    }

    // Reject unfilled {placeholder} tokens. Hugging Face's {model-id} and
    // Azure's {deployment-id} are resolved from the selected model at request
    // time; anything else (e.g. Azure {resource-name}) must be filled in here.
    if (family === 'azure' && !baseUrl.includes('{deployment-id}')) {
        showToast('Azure base URLs must include {deployment-id}; each model supplies its deployment name.', 'error');
        baseUrlInput?.focus();
        return;
    }
    let baseUrlPlaceholderCheck = baseUrl;
    if (family === 'huggingface') {
        baseUrlPlaceholderCheck = baseUrlPlaceholderCheck.split('{model-id}').join('');
    }
    if (family === 'azure') {
        baseUrlPlaceholderCheck = baseUrlPlaceholderCheck.split('{deployment-id}').join('');
    }
    if (/\{[^}]+\}/.test(baseUrlPlaceholderCheck)) {
        showToast('Replace the remaining {placeholder} values in the base URL before saving.', 'error');
        baseUrlInput?.focus();
        return;
    }

    const config = getInterpreterConfig();
    const existingProvider = editingInterpreterProviderId
        ? config.providers.find((p) => p.id === editingInterpreterProviderId)
        : null;
    const existingKeyWouldBeKept = Boolean(existingProvider?.apiKey && !apiKeyEntered && !interpreterClearProviderKeyFlag);
    if (!rememberApiKey && !browser.storage?.session && (apiKeyEntered || existingKeyWouldBeKept)) {
        showToast('This browser cannot keep session-only API keys. Enable "Remember API key on this device" to save it.', 'error');
        rememberKeyInput?.focus();
        return;
    }

    if (editingInterpreterProviderId) {
        const provider = existingProvider;
        if (provider) {
            // A typed value replaces the key; an untouched field keeps the
            // saved key unless the user pressed "Clear saved key".
            let apiKey = provider.apiKey || '';
            if (apiKeyEntered) {
                apiKey = apiKeyEntered;
            } else if (interpreterClearProviderKeyFlag) {
                apiKey = '';
            }
            provider.name = name;
            provider.family = family;
            provider.baseUrl = baseUrl;
            provider.apiKey = apiKey;
            provider.apiKeyRequired = apiKeyRequired;
            provider.rememberApiKey = rememberApiKey;
            provider.presetId = isCustom ? undefined : presetId;
        }
    } else {
        const newProvider = {
            id: buildInterpreterId('prov'),
            name,
            family,
            baseUrl,
            apiKey: apiKeyEntered,
            apiKeyRequired,
            rememberApiKey
        };
        if (!isCustom) {
            newProvider.presetId = presetId;
        }
        config.providers.push(newProvider);
    }

    closeInterpreterDialog('interpreterProviderDialog');
    renderInterpreterManagers();
    persistInterpreterConfig(`Saved provider "${name}"`);
}

function removeInterpreterProvider(providerId) {
    const config = getInterpreterConfig();
    const removed = config.providers.find((p) => p.id === providerId);

    // Protect against orphaning models: block removal while any model uses it.
    const dependents = config.models.filter((m) => m.providerId === providerId);
    if (dependents.length > 0) {
        showToast(
            `Can't remove "${removed?.name || 'this provider'}" — ${dependents.length} model(s) still use it. Remove those models first.`,
            'error'
        );
        return;
    }

    config.providers = config.providers.filter((p) => p.id !== providerId);
    renderInterpreterManagers();
    persistInterpreterConfig(`Removed provider "${removed?.name || providerId}"`);
}

function refreshModelProviderSelect() {
    const select = document.getElementById('interpreterModelProvider');
    if (!select) {
        return;
    }
    const config = getInterpreterConfig();
    const previousValue = select.value;
    select.innerHTML = '';
    config.providers.forEach((provider) => {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = provider.name;
        select.appendChild(option);
    });
    if (config.providers.some((p) => p.id === previousValue)) {
        select.value = previousValue;
    }
}


// Guided picker — clickable chips for the selected provider's popular models.
function renderInterpreterModelPicker(providerId) {
    const group = document.getElementById('interpreterModelPickerGroup');
    const picker = document.getElementById('interpreterModelPicker');
    if (!group || !picker) {
        return;
    }
    picker.innerHTML = '';
    const provider = getInterpreterConfig().providers.find((p) => p.id === providerId);
    const preset = provider && provider.presetId ? getInterpreterPresetById(provider.presetId) : null;
    const models = preset && Array.isArray(preset.popularModels) ? preset.popularModels : [];
    if (models.length === 0) {
        group.hidden = true;
        return;
    }
    group.hidden = false;
    models.forEach((m) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'interpreter-model-chip';
        chip.dataset.modelPickId = m.id;
        chip.textContent = m.name;
        chip.title = m.id;
        picker.appendChild(chip);
    });
}

function updateInterpreterModelIdHint(providerId) {
    const hint = document.getElementById('interpreterModelModelIdHint');
    if (!hint) {
        return;
    }
    hint.textContent = optionsMessage(
        'optionsInterpreterModelIdHint',
        null,
        "The provider's model identifier, e.g. gemini-flash-latest."
    ) + ' ';
    const provider = getInterpreterConfig().providers.find((p) => p.id === providerId);
    const preset = provider && provider.presetId ? getInterpreterPresetById(provider.presetId) : null;
    if (preset && preset.modelsList) {
        const link = document.createElement('a');
        link.href = preset.modelsList;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = optionsMessage('optionsInterpreterModelsListLink', null, 'Browse available models.');
        hint.appendChild(link);
    }
}

function refreshInterpreterModelDialogForProvider(providerId) {
    renderInterpreterModelPicker(providerId);
    updateInterpreterModelIdHint(providerId);
}

function openInterpreterModelDialog(model) {
    const config = getInterpreterConfig();
    if (config.providers.length === 0) {
        showToast('Add a provider first', 'error');
        return;
    }
    const dialog = document.getElementById('interpreterModelDialog');
    if (!dialog) {
        return;
    }
    editingInterpreterModelId = model ? model.id : null;

    const title = document.getElementById('interpreterModelDialogTitle');
    if (title) title.textContent = model ? 'Edit model' : 'Add model';

    refreshModelProviderSelect();
    const providerSelect = document.getElementById('interpreterModelProvider');
    const modelIdInput = document.getElementById('interpreterModelModelId');
    const enabledInput = document.getElementById('interpreterModelEnabled');

    if (model) {
        if (providerSelect && config.providers.some((p) => p.id === model.providerId)) {
            providerSelect.value = model.providerId;
        }
        if (modelIdInput) modelIdInput.value = model.providerModelId || '';
        if (enabledInput) enabledInput.checked = model.enabled !== false;
    } else {
        if (modelIdInput) modelIdInput.value = '';
        if (enabledInput) enabledInput.checked = true;
    }
    refreshInterpreterModelDialogForProvider(providerSelect ? providerSelect.value : '');
    dialog.showModal();
}

function handleSaveInterpreterModel() {
    const providerSelect = document.getElementById('interpreterModelProvider');
    const modelIdInput = document.getElementById('interpreterModelModelId');
    const enabledInput = document.getElementById('interpreterModelEnabled');

    const providerId = String(providerSelect?.value || '').trim();
    const providerModelId = String(modelIdInput?.value || '').trim();
    const enabled = Boolean(enabledInput?.checked);

    if (!providerId) {
        showToast('Please select a provider', 'error');
        return;
    }
    if (!providerModelId) {
        showToast('Please enter a model ID', 'error');
        modelIdInput?.focus();
        return;
    }

    const config = getInterpreterConfig();
    if (editingInterpreterModelId) {
        const model = config.models.find((m) => m.id === editingInterpreterModelId);
        if (model) {
            model.providerId = providerId;
            model.providerModelId = providerModelId;
            model.name = providerModelId;
            model.enabled = enabled;
        }
    } else {
        config.models.push({
            id: buildInterpreterId('model'),
            providerId,
            providerModelId,
            name: providerModelId,
            enabled
        });
    }

    closeInterpreterDialog('interpreterModelDialog');
    renderInterpreterModelsList();
    persistInterpreterConfig(`Saved model "${providerModelId}"`);
}

function removeInterpreterModel(modelId) {
    const config = getInterpreterConfig();
    const removed = config.models.find((m) => m.id === modelId);
    config.models = config.models.filter((m) => m.id !== modelId);

    renderInterpreterModelsList();
    persistInterpreterConfig(`Removed model "${removed?.providerModelId || modelId}"`);
}

function initInterpreterControls() {
    populateProviderPresetSelect();

    // Provider presets are bundled. This async path keeps the model picker
    // reading the same source the service worker uses without rebuilding the
    // Add/Edit Provider dialog mid-edit.
    const interpreterUtils = getInterpreterUtilsApi();
    if (interpreterUtils && typeof interpreterUtils.getPresetProviders === 'function') {
        interpreterUtils.getPresetProviders().then((presets) => {
            if (Array.isArray(presets) && presets.length) {
                interpreterPresets = presets;
            }
        }).catch(() => {});
    }

    document.getElementById('interpreterAddProviderBtn')?.addEventListener('click', () => {
        openInterpreterProviderDialog(null);
    });
    document.getElementById('interpreterAddModelBtn')?.addEventListener('click', () => {
        openInterpreterModelDialog(null);
    });

    document.getElementById('interpreterProviderPreset')?.addEventListener('change', (event) => {
        applyProviderPresetToForm(event.target.value);
    });
    document.getElementById('interpreterSaveProvider')?.addEventListener('click', () => {
        try {
            handleSaveInterpreterProvider();
        } catch (error) {
            console.error('Failed to save provider:', error);
            showToast('Failed to save provider', 'error');
        }
    });
    document.getElementById('interpreterCancelProvider')?.addEventListener('click', () => {
        closeInterpreterDialog('interpreterProviderDialog');
    });
    document.getElementById('interpreterClearProviderKey')?.addEventListener('click', handleClearInterpreterProviderKey);

    document.getElementById('interpreterSaveModel')?.addEventListener('click', () => {
        try {
            handleSaveInterpreterModel();
        } catch (error) {
            console.error('Failed to save model:', error);
            showToast('Failed to save model', 'error');
        }
    });
    document.getElementById('interpreterCancelModel')?.addEventListener('click', () => {
        closeInterpreterDialog('interpreterModelDialog');
    });

    // Clicking the dim backdrop closes a dialog.
    ['interpreterProviderDialog', 'interpreterModelDialog'].forEach((dialogId) => {
        const dialog = document.getElementById(dialogId);
        dialog?.addEventListener('click', (event) => {
            if (event.target === dialog) {
                dialog.close();
            }
        });
    });

    document.getElementById('interpreterProvidersList')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-provider-id]');
        if (!button) {
            return;
        }
        const providerId = button.dataset.providerId;
        if (button.dataset.action === 'edit-provider') {
            const provider = getInterpreterConfig().providers.find((p) => p.id === providerId);
            if (provider) {
                openInterpreterProviderDialog(provider);
            }
        } else if (button.dataset.action === 'remove-provider') {
            removeInterpreterProvider(providerId);
        }
    });

    document.getElementById('interpreterModelsList')?.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-model-id]');
        if (!button) {
            return;
        }
        const modelId = button.dataset.modelId;
        if (button.dataset.action === 'edit-model') {
            const model = getInterpreterConfig().models.find((m) => m.id === modelId);
            if (model) {
                openInterpreterModelDialog(model);
            }
        } else if (button.dataset.action === 'remove-model') {
            removeInterpreterModel(modelId);
        }
    });

    // Inline model enable/disable toggle.
    document.getElementById('interpreterModelsList')?.addEventListener('change', (event) => {
        const input = event.target.closest('[data-action="toggle-model"]');
        if (!input) {
            return;
        }
        const model = getInterpreterConfig().models.find((m) => m.id === input.dataset.modelId);
        if (model) {
            model.enabled = input.checked;
            persistInterpreterConfig();
        }
    });

    // Drag-and-drop model reordering — stored order drives the popup dropdown.
    const modelsList = document.getElementById('interpreterModelsList');
    if (modelsList) {
        modelsList.addEventListener('dragstart', (event) => {
            const row = event.target.closest('.interpreter-model-row');
            if (!row) {
                return;
            }
            interpreterDraggedModelId = row.dataset.modelId;
            row.classList.add('is-dragging');
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
            }
        });
        modelsList.addEventListener('dragend', () => {
            interpreterDraggedModelId = null;
            modelsList.querySelectorAll('.is-dragging, .is-drop-target').forEach((el) => {
                el.classList.remove('is-dragging', 'is-drop-target');
            });
        });
        modelsList.addEventListener('dragover', (event) => {
            if (!interpreterDraggedModelId) {
                return;
            }
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move';
            }
            const row = event.target.closest('.interpreter-model-row');
            modelsList.querySelectorAll('.is-drop-target').forEach((el) => {
                if (el !== row) {
                    el.classList.remove('is-drop-target');
                }
            });
            if (row && row.dataset.modelId !== interpreterDraggedModelId) {
                row.classList.add('is-drop-target');
            }
        });
        modelsList.addEventListener('drop', (event) => {
            event.preventDefault();
            const row = event.target.closest('.interpreter-model-row');
            if (row && interpreterDraggedModelId) {
                reorderInterpreterModels(interpreterDraggedModelId, row.dataset.modelId);
            }
        });
    }

    // Model dialog: provider change refreshes the guided picker; chip clicks
    // fill the Model ID field.
    document.getElementById('interpreterModelProvider')?.addEventListener('change', (event) => {
        refreshInterpreterModelDialogForProvider(event.target.value);
    });
    document.getElementById('interpreterModelPicker')?.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-model-pick-id]');
        if (!chip) {
            return;
        }
        const modelIdInput = document.getElementById('interpreterModelModelId');
        if (modelIdInput) {
            modelIdInput.value = chip.dataset.modelPickId;
        }
    });
}

	function getSiteRulesList() {
	    return normalizeSiteRulesState(options?.siteRules);
	}

	function setSiteRules(nextRules) {
	    options.siteRules = normalizeSiteRulesState(nextRules);
	}

	function findSiteRule(ruleId) {
	    return getSiteRulesList().find((rule) => rule.id === ruleId) || null;
	}

	function readTriStateBoolean(id) {
	    const value = document.getElementById(id)?.value || 'inherit';
	    if (value === 'true') return true;
	    if (value === 'false') return false;
	    return undefined;
	}

	function setTriStateBoolean(id, value) {
	    const input = document.getElementById(id);
	    if (!input) return;
	    input.value = value === true ? 'true' : value === false ? 'false' : 'inherit';
	}

	function setTextOverrideControl(toggleId, inputId, value) {
	    const toggle = document.getElementById(toggleId);
	    const input = document.getElementById(inputId);
	    const enabled = value !== undefined;
	    if (toggle) {
	        toggle.checked = enabled;
	    }
	    if (input) {
	        input.value = enabled ? String(value) : '';
	        input.disabled = !enabled;
	    }
	}

	function refreshSiteRuleTextOverrideStates() {
	    Object.values(SITE_RULE_TEXT_FIELD_IDS).forEach(({ toggleId, inputId }) => {
	        const toggle = document.getElementById(toggleId);
	        const input = document.getElementById(inputId);
	        if (!toggle || !input) return;
	        input.disabled = !toggle.checked;
	        input.closest('.site-rule-text-override')?.classList.toggle('is-disabled', !toggle.checked);
	    });
	}

	function clearSiteRuleEditorFeedback() {
	    const feedback = document.getElementById('siteRulePatternFeedback');
	    const patternInput = document.getElementById('siteRulePattern');
	    if (feedback) {
	        feedback.textContent = '';
	        feedback.classList.remove('is-error', 'is-success');
	    }
	    if (patternInput) {
	        patternInput.classList.remove('is-invalid');
	    }
	}

	function resetSiteRuleEditor() {
	    siteRuleEditorState = { mode: 'create', ruleId: null };
	    document.getElementById('siteRuleEditorTitle').textContent = optionsMessage('optionsSiteRuleEditorTitle', null, 'Add Site Rule');
	    document.getElementById('siteRuleName').value = '';
	    document.getElementById('siteRulePattern').value = '';
	    document.getElementById('siteRuleEnabled').checked = true;

	    Object.values(SITE_RULE_BOOLEAN_FIELD_IDS).forEach((id) => setTriStateBoolean(id, undefined));
	    Object.values(SITE_RULE_ENUM_FIELD_IDS).forEach((id) => {
	        const input = document.getElementById(id);
	        if (input) input.value = 'inherit';
	    });
	    Object.values(SITE_RULE_TABLE_FIELD_IDS).forEach((id) => setTriStateBoolean(id, undefined));
	    Object.values(SITE_RULE_TEXT_FIELD_IDS).forEach(({ toggleId, inputId }) => {
	        setTextOverrideControl(toggleId, inputId, undefined);
	    });

	    clearSiteRuleEditorFeedback();
	    refreshSiteRuleTextOverrideStates();
	}

	function openSiteRuleEditor(ruleId = null) {
	    resetSiteRuleEditor();
	    const editor = document.getElementById('siteRuleEditor');
	    if (!editor) {
	        return;
	    }

	    if (ruleId) {
	        const rule = findSiteRule(ruleId);
	        if (rule) {
	            siteRuleEditorState = { mode: 'edit', ruleId };
	            document.getElementById('siteRuleEditorTitle').textContent = optionsMessage('optionsSiteRuleEditTitle', null, 'Edit Site Rule');
	            document.getElementById('siteRuleName').value = rule.name || '';
	            document.getElementById('siteRulePattern').value = rule.pattern || '';
	            document.getElementById('siteRuleEnabled').checked = rule.enabled !== false;

	            Object.keys(SITE_RULE_BOOLEAN_FIELD_IDS).forEach((key) => {
	                setTriStateBoolean(SITE_RULE_BOOLEAN_FIELD_IDS[key], rule.overrides?.[key]);
	            });
	            Object.keys(SITE_RULE_ENUM_FIELD_IDS).forEach((key) => {
	                const input = document.getElementById(SITE_RULE_ENUM_FIELD_IDS[key]);
	                if (input) {
	                    input.value = rule.overrides?.[key] || 'inherit';
	                }
	            });
	            Object.keys(SITE_RULE_TABLE_FIELD_IDS).forEach((key) => {
	                setTriStateBoolean(SITE_RULE_TABLE_FIELD_IDS[key], rule.overrides?.tableFormatting?.[key]);
	            });
	            Object.keys(SITE_RULE_TEXT_FIELD_IDS).forEach((key) => {
	                const config = SITE_RULE_TEXT_FIELD_IDS[key];
	                setTextOverrideControl(config.toggleId, config.inputId, rule.overrides?.[key]);
	            });
	        }
	    }

	    editor.hidden = false;
	    refreshSiteRuleTextOverrideStates();
	    document.getElementById('siteRuleName')?.focus();
	}

	function closeSiteRuleEditor() {
	    document.getElementById('siteRuleEditor')?.setAttribute('hidden', '');
	    const editor = document.getElementById('siteRuleEditor');
	    if (editor) {
	        editor.hidden = true;
	    }
	    resetSiteRuleEditor();
	}

	function buildSiteRuleOverridesFromEditor() {
	    const overrides = {};

	    Object.keys(SITE_RULE_BOOLEAN_FIELD_IDS).forEach((key) => {
	        const value = readTriStateBoolean(SITE_RULE_BOOLEAN_FIELD_IDS[key]);
	        if (value !== undefined) {
	            overrides[key] = value;
	        }
	    });

	    Object.keys(SITE_RULE_ENUM_FIELD_IDS).forEach((key) => {
	        const value = document.getElementById(SITE_RULE_ENUM_FIELD_IDS[key])?.value || 'inherit';
	        if (value !== 'inherit') {
	            overrides[key] = value;
	        }
	    });

	    Object.keys(SITE_RULE_TEXT_FIELD_IDS).forEach((key) => {
	        const { toggleId, inputId } = SITE_RULE_TEXT_FIELD_IDS[key];
	        if (document.getElementById(toggleId)?.checked) {
	            overrides[key] = document.getElementById(inputId)?.value ?? '';
	        }
	    });

	    const tableFormatting = {};
	    Object.keys(SITE_RULE_TABLE_FIELD_IDS).forEach((key) => {
	        const value = readTriStateBoolean(SITE_RULE_TABLE_FIELD_IDS[key]);
	        if (value !== undefined) {
	            tableFormatting[key] = value;
	        }
	    });
	    if (Object.keys(tableFormatting).length > 0) {
	        overrides.tableFormatting = tableFormatting;
	    }

	    return normalizeSiteRuleOverridesState(overrides);
	}

	function getSiteRuleOverrideLabels(rule) {
	    const siteRulesApi = getSiteRulesApi();
	    const overrideKeys = siteRulesApi?.collectOverrideKeys
	        ? siteRulesApi.collectOverrideKeys(rule?.overrides)
	        : [];

	    return overrideKeys.map((key) => SITE_RULE_OVERRIDE_LABELS[key] || key);
	}

	function updateSiteRulesSummary(rules) {
	    const summary = document.getElementById('siteRulesSummary');
	    if (!summary) {
	        return;
	    }

	    const enabledCount = rules.filter((rule) => rule.enabled !== false).length;
	    summary.textContent = rules.length === 1
	        ? optionsMessage('optionsSiteRulesSummaryOne', [enabledCount], `1 rule - ${enabledCount} enabled`)
	        : optionsMessage('optionsSiteRulesSummaryMany', [rules.length, enabledCount], `${rules.length} rules - ${enabledCount} enabled`);
	}

	function renderSiteRules() {
	    const rules = getSiteRulesList();
	    const list = document.getElementById('siteRulesList');
	    const empty = document.getElementById('siteRulesEmpty');
	    if (!list || !empty) {
	        return;
	    }

	    updateSiteRulesSummary(rules);
	    empty.hidden = rules.length > 0;
        const enabledLabel = optionsMessage('optionsSiteRuleEnabledLabel', null, 'Enabled');
        const noOverridesLabel = optionsMessage('optionsSiteRuleNoOverrides', null, 'No overrides');
        const invalidPatternLabel = optionsMessage('optionsSiteRuleInvalidPattern', null, 'Invalid pattern');
        const moveUpLabel = optionsMessage('optionsSiteRuleMoveUpBtn', null, 'Up');
        const moveDownLabel = optionsMessage('optionsSiteRuleMoveDownBtn', null, 'Down');
        const editLabel = optionsMessage('optionsSiteRuleEditBtn', null, 'Edit');
        const deleteLabel = optionsMessage('optionsSiteRuleDeleteBtn', null, 'Delete');
	    list.innerHTML = rules.map((rule, index) => {
	        const validation = validateSiteRulePatternState(rule.pattern);
	        const overrideLabels = getSiteRuleOverrideLabels(rule);
	        const chips = overrideLabels.length > 0
	            ? overrideLabels.map((label) => `<span class="site-rule-chip">${escapeHtml(label)}</span>`).join('')
	            : `<span class="site-rule-chip site-rule-chip--muted">${escapeHtml(noOverridesLabel)}</span>`;

	        return `
	            <article class="site-rule-item${rule.enabled === false ? ' is-disabled' : ''}">
	                <div class="site-rule-item__body">
	                    <div class="site-rule-item__header">
	                        <div>
	                            <h4 class="site-rule-item__title">${index + 1}. ${escapeHtml(rule.name)}</h4>
	                            <code class="site-rule-item__pattern">${escapeHtml(rule.pattern)}</code>
	                        </div>
	                        <label class="site-rule-toggle-inline">
	                            <input type="checkbox" data-site-rule-toggle="${escapeHtml(rule.id)}" ${rule.enabled === false ? '' : 'checked'} />
	                            <span>${escapeHtml(enabledLabel)}</span>
	                        </label>
	                    </div>
	                    <div class="site-rule-chip-list">${chips}</div>
	                    ${validation.valid ? '' : `<p class="site-rule-item__error">${escapeHtml(invalidPatternLabel)}: ${escapeHtml(validation.error)}</p>`}
	                </div>
	                <div class="site-rule-item__actions">
	                    <button type="button" class="btn btn-secondary btn-sm" data-site-rule-action="move-up" data-rule-id="${escapeHtml(rule.id)}" ${index === 0 ? 'disabled' : ''}>${escapeHtml(moveUpLabel)}</button>
	                    <button type="button" class="btn btn-secondary btn-sm" data-site-rule-action="move-down" data-rule-id="${escapeHtml(rule.id)}" ${index === rules.length - 1 ? 'disabled' : ''}>${escapeHtml(moveDownLabel)}</button>
	                    <button type="button" class="btn btn-secondary btn-sm" data-site-rule-action="edit" data-rule-id="${escapeHtml(rule.id)}">${escapeHtml(editLabel)}</button>
	                    <button type="button" class="btn btn-danger btn-sm" data-site-rule-action="delete" data-rule-id="${escapeHtml(rule.id)}">${escapeHtml(deleteLabel)}</button>
	                </div>
	            </article>
	        `;
	    }).join('');

	    if (siteRuleEditorState.ruleId && !findSiteRule(siteRuleEditorState.ruleId)) {
	        closeSiteRuleEditor();
	    }
	}

	async function saveSiteRuleEditor() {
	    const patternInput = document.getElementById('siteRulePattern');
	    const rawPattern = patternInput?.value || '';
	    const validation = validateSiteRulePatternState(rawPattern);
	    const feedback = document.getElementById('siteRulePatternFeedback');

	    if (!validation.valid) {
	        if (patternInput) {
	            patternInput.classList.add('is-invalid');
	            patternInput.focus();
	        }
	        if (feedback) {
	            feedback.textContent = validation.error;
	            feedback.classList.remove('is-success');
	            feedback.classList.add('is-error');
	        }
	        showToast(validation.error || 'Invalid site rule pattern', 'error');
	        return;
	    }

	    const nextRule = {
	        id: siteRuleEditorState.mode === 'edit' && siteRuleEditorState.ruleId
	            ? siteRuleEditorState.ruleId
	            : buildSiteRuleIdState(),
	        name: String(document.getElementById('siteRuleName')?.value || '').trim() || validation.normalizedPattern,
	        enabled: document.getElementById('siteRuleEnabled')?.checked !== false,
	        pattern: validation.normalizedPattern,
	        overrides: buildSiteRuleOverridesFromEditor()
	    };

	    const rules = getSiteRulesList();
	    const nextRules = siteRuleEditorState.mode === 'edit'
	        ? rules.map((rule) => rule.id === siteRuleEditorState.ruleId ? nextRule : rule)
	        : [...rules, nextRule];

	    setSiteRules(nextRules);
	    renderSiteRules();
	    closeSiteRuleEditor();
	    save();
	}

	function moveSiteRule(ruleId, direction) {
	    const rules = getSiteRulesList();
	    const index = rules.findIndex((rule) => rule.id === ruleId);
	    if (index < 0) {
	        return;
	    }

	    const targetIndex = direction === 'up' ? index - 1 : index + 1;
	    if (targetIndex < 0 || targetIndex >= rules.length) {
	        return;
	    }

	    const nextRules = rules.slice();
	    const [rule] = nextRules.splice(index, 1);
	    nextRules.splice(targetIndex, 0, rule);
	    setSiteRules(nextRules);
	    renderSiteRules();
	    save();
	}

	function deleteSiteRule(ruleId) {
	    const nextRules = getSiteRulesList().filter((rule) => rule.id !== ruleId);
	    setSiteRules(nextRules);
	    renderSiteRules();
	    if (siteRuleEditorState.ruleId === ruleId) {
	        closeSiteRuleEditor();
	    }
	    save();
	}

	function toggleSiteRuleEnabled(ruleId, enabled) {
	    const nextRules = getSiteRulesList().map((rule) => (
	        rule.id === ruleId ? { ...rule, enabled: enabled !== false } : rule
	    ));
	    setSiteRules(nextRules);
	    renderSiteRules();
	    save();
	}

	function initSiteRuleControls() {
	    document.getElementById('addSiteRule')?.addEventListener('click', () => openSiteRuleEditor());
	    document.getElementById('cancelSiteRule')?.addEventListener('click', () => closeSiteRuleEditor());
	    document.getElementById('saveSiteRule')?.addEventListener('click', () => {
	        saveSiteRuleEditor().catch((error) => {
	            console.error('Failed to save site rule:', error);
	            showToast(String(error), 'error');
	        });
	    });
	    document.getElementById('siteRulePattern')?.addEventListener('input', (event) => {
	        const validation = validateSiteRulePatternState(event.target.value);
	        const feedback = document.getElementById('siteRulePatternFeedback');
	        event.target.classList.toggle('is-invalid', !validation.valid && event.target.value.trim().length > 0);
	        if (!feedback) {
	            return;
	        }
	        if (!event.target.value.trim()) {
	            feedback.textContent = '';
	            feedback.classList.remove('is-error', 'is-success');
	            return;
	        }
	        feedback.textContent = validation.valid ? `Matches as ${validation.normalizedPattern}` : validation.error;
	        feedback.classList.toggle('is-error', !validation.valid);
	        feedback.classList.toggle('is-success', validation.valid);
	    });

	    Object.values(SITE_RULE_TEXT_FIELD_IDS).forEach(({ toggleId }) => {
	        document.getElementById(toggleId)?.addEventListener('change', refreshSiteRuleTextOverrideStates);
	    });

	    document.getElementById('siteRulesList')?.addEventListener('click', (event) => {
	        const button = event.target.closest('[data-site-rule-action]');
	        if (!button) {
	            return;
	        }

	        const ruleId = button.dataset.ruleId;
	        const action = button.dataset.siteRuleAction;
	        if (!ruleId || !action) {
	            return;
	        }

	        if (action === 'edit') {
	            openSiteRuleEditor(ruleId);
	            return;
	        }
	        if (action === 'move-up') {
	            moveSiteRule(ruleId, 'up');
	            return;
	        }
	        if (action === 'move-down') {
	            moveSiteRule(ruleId, 'down');
	            return;
	        }
	        if (action === 'delete') {
	            deleteSiteRule(ruleId);
	        }
	    });

	    document.getElementById('siteRulesList')?.addEventListener('change', (event) => {
	        const toggle = event.target.closest('[data-site-rule-toggle]');
	        if (!toggle) {
	            return;
	        }
	        toggleSiteRuleEnabled(toggle.dataset.siteRuleToggle, toggle.checked);
	    });

	    resetSiteRuleEditor();
	    renderSiteRules();
	}

function usesOptionalNativeMessagingPermission() {
    const optionalPermissions = browser.runtime?.getManifest?.().optional_permissions || [];
    return Array.isArray(optionalPermissions) && optionalPermissions.includes('nativeMessaging');
}

function isNativeMessagingApiAvailable() {
    return Boolean(
        browser.runtime?.connectNative ||
        (typeof chrome !== 'undefined' && chrome.runtime?.connectNative)
    );
}

function getAgentBridgeInstallCommandForPlatform(platformOs) {
    switch (String(platformOs || '').trim().toLowerCase()) {
        case 'win':
            return '.\\marksnip.exe install-host';
        case 'mac':
        case 'linux':
            return './marksnip install-host';
        default:
            return 'marksnip install-host';
    }
}

function renderAgentBridgeInstallCommand() {
    const commandEl = document.getElementById('agentBridgeInstallCommand');
    if (commandEl) {
        commandEl.textContent = agentBridgeInstallCommand;
    }
}

function updateAgentBridgeActionButton(state = 'disabled') {
    const button = document.getElementById('refreshAgentBridgeStatus');
    if (!button) {
        return;
    }

    if (state === 'permission-needed') {
        button.textContent = optionsMessage('optionsAgentBridgeGrantPermission', null, 'Grant Permission');
        button.setAttribute(
            'aria-label',
            optionsMessage('optionsAgentBridgeGrantPermissionAria', null, 'Grant native messaging permission for Agent Bridge')
        );
        return;
    }

    button.textContent = optionsMessage('optionsAgentBridgeCheckStatus', null, 'Check Connection');
    button.setAttribute(
        'aria-label',
        optionsMessage('optionsAgentBridgeCheckStatusAria', null, 'Check Agent Bridge connection status')
    );
}

async function resolveAgentBridgeInstallCommand() {
    const platformInfo = await browser.runtime?.getPlatformInfo?.().catch(() => null);
    agentBridgeInstallCommand = getAgentBridgeInstallCommandForPlatform(platformInfo?.os);
    renderAgentBridgeInstallCommand();
    return agentBridgeInstallCommand;
}

function normalizeLibrarySettingsState(settings) {
    const libraryApi = getLibraryStateApi();
    if (libraryApi?.normalizeLibrarySettings) {
        return libraryApi.normalizeLibrarySettings(settings);
    }

    const rawItemsToKeep = Number(String(settings?.itemsToKeep ?? '').trim());
    const safeItemsToKeep = Number.isFinite(rawItemsToKeep) && rawItemsToKeep >= 1
        ? Math.min(1000, Math.floor(rawItemsToKeep))
        : 10;

    return {
        enabled: settings?.enabled !== false,
        autoSaveOnPopupOpen: settings?.autoSaveOnPopupOpen !== false,
        itemsToKeep: safeItemsToKeep
    };
}

async function saveLibrarySettingsState(nextSettings) {
    const libraryApi = getLibraryStateApi();
    librarySettings = normalizeLibrarySettingsState(nextSettings);

    if (libraryApi?.saveLibrarySettings) {
        librarySettings = await libraryApi.saveLibrarySettings(librarySettings);
    } else {
        await browser.storage.local.set({ librarySettings });
    }

    return librarySettings;
}

async function loadLibrarySettingsState() {
    const libraryApi = getLibraryStateApi();
    if (libraryApi?.loadLibrarySettings) {
        librarySettings = await libraryApi.loadLibrarySettings();
    } else {
        const result = await browser.storage.local.get('librarySettings');
        librarySettings = normalizeLibrarySettingsState(result.librarySettings);
    }

    return librarySettings;
}

async function resetLibrarySettingsState() {
    const libraryApi = getLibraryStateApi();
    if (libraryApi?.resetLibrarySettings) {
        librarySettings = await libraryApi.resetLibrarySettings();
        return librarySettings;
    }

    librarySettings = normalizeLibrarySettingsState();
    await browser.storage.local.set({ librarySettings });
    return librarySettings;
}

async function trimLibraryItemsState(itemsToKeep) {
    const libraryApi = getLibraryStateApi();
    if (libraryApi?.trimStoredLibraryItems) {
        return await libraryApi.trimStoredLibraryItems(itemsToKeep);
    }

    return [];
}

async function clearLibraryItemsState() {
    const libraryApi = getLibraryStateApi();
    if (libraryApi?.clearLibraryItems) {
        return await libraryApi.clearLibraryItems();
    }

    await browser.storage.local.remove('libraryItems');
    return [];
}

function normalizeAgentBridgeSettingsState(settings) {
    const bridgeApi = getAgentBridgeStateApi();
    if (bridgeApi?.normalizeSettings) {
        return bridgeApi.normalizeSettings(settings);
    }

    return {
        enabled: settings?.enabled === true
    };
}

function normalizeAgentBridgeStatusState(status) {
    const bridgeApi = getAgentBridgeStateApi();
    if (bridgeApi?.normalizeStatus) {
        return bridgeApi.normalizeStatus(status);
    }

    return {
        enabled: status?.enabled === true,
        permissionGranted: status?.permissionGranted === true,
        connecting: status?.connecting === true,
        connected: status?.connected === true,
        hostInstalled: status?.hostInstalled === true,
        browser: typeof status?.browser === 'string' ? status.browser.trim().toLowerCase() : '',
        hostVersion: typeof status?.hostVersion === 'string' ? status.hostVersion.trim() : '',
        lastError: typeof status?.lastError === 'string' ? status.lastError.trim() : '',
        updatedAt: typeof status?.updatedAt === 'string' ? status.updatedAt.trim() : ''
    };
}

async function saveAgentBridgeSettingsState(nextSettings) {
    const bridgeApi = getAgentBridgeStateApi();
    agentBridgeSettings = normalizeAgentBridgeSettingsState(nextSettings);

    if (bridgeApi?.saveSettings) {
        agentBridgeSettings = await bridgeApi.saveSettings(agentBridgeSettings);
    } else {
        await browser.storage.local.set({ agentBridgeSettings });
    }

    return agentBridgeSettings;
}

async function loadAgentBridgeSettingsState() {
    const bridgeApi = getAgentBridgeStateApi();
    if (bridgeApi?.loadSettings) {
        agentBridgeSettings = await bridgeApi.loadSettings();
    } else {
        const result = await browser.storage.local.get('agentBridgeSettings');
        agentBridgeSettings = normalizeAgentBridgeSettingsState(result.agentBridgeSettings);
    }

    return agentBridgeSettings;
}

async function loadAgentBridgeStatusState() {
    const bridgeApi = getAgentBridgeStateApi();
    if (bridgeApi?.loadStatus) {
        agentBridgeStatus = await bridgeApi.loadStatus();
    } else {
        const result = await browser.storage.local.get('agentBridgeStatus');
        agentBridgeStatus = normalizeAgentBridgeStatusState(result.agentBridgeStatus);
    }

    return agentBridgeStatus;
}

async function refreshAgentBridgeStatusState() {
    if (!browser.runtime?.sendMessage) {
        await loadAgentBridgeStatusState();
        return agentBridgeStatus;
    }

    try {
        const status = await browser.runtime.sendMessage({
            type: 'refresh-agent-bridge-status'
        });
        agentBridgeStatus = normalizeAgentBridgeStatusState(status);
    } catch (error) {
        console.warn('Failed to refresh Agent Bridge status:', error);
        await loadAgentBridgeStatusState();
    }

    return agentBridgeStatus;
}

async function requestAgentBridgePermission() {
    if (!browser.permissions?.request) {
        showToast(optionsMessage('optionsAgentBridgePermissionUnsupported', null, "This browser cannot request native messaging permission here"), "error");
        return { granted: false, reloadRequired: false };
    }

    const granted = await browser.permissions.request({
        permissions: ['nativeMessaging']
    }).catch((error) => {
        console.error('Failed to request native messaging permission:', error);
        return false;
    });

    if (!granted) {
        showToast(optionsMessage('optionsAgentBridgePermissionNotGranted', null, "Agent Bridge permission was not granted"), "error");
        return { granted: false, reloadRequired: false };
    }

    return {
        granted: true,
        reloadRequired: usesOptionalNativeMessagingPermission() && !isNativeMessagingApiAvailable()
    };
}

async function reloadExtensionForAgentBridgePermissionGrant() {
    const container = document.getElementById('agent-bridge-container');
    const statusHint = document.getElementById('agentBridgeStatusHint');
    const statusText = document.getElementById('agentBridgeStatusText');
    const refreshBtn = document.getElementById('refreshAgentBridgeStatus');

    if (container) {
        container.dataset.bridgeState = 'starting';
        container.dataset.permissionState = 'idle';
    }
    hidePermissionPanel();
    if (statusText) {
        statusText.textContent = optionsMessage('optionsAgentBridgeReloadingStatus', null, 'Reloading extension');
    }
    if (statusHint) {
        statusHint.textContent = 'Permission granted. MarkSnip is reloading once to finish enabling the Agent Bridge.';
    }
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = optionsMessage('optionsAgentBridgeReloadingBtn', null, 'Reloading...');
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
    browser.runtime?.reload?.();
}

/* ── Permission Panel Management ── */

function showPermissionPanel(panelState) {
    const panel = document.getElementById('agentBridgePermissionPanel');
    const container = document.getElementById('agent-bridge-container');
    if (!panel) return;

    panel.hidden = false;
    panel.querySelectorAll('.permission-panel-state').forEach(el => {
        el.classList.toggle('is-active', el.dataset.panelState === panelState);
    });

    if (container) {
        container.dataset.permissionState = panelState;
    }
}

function hidePermissionPanel() {
    const panel = document.getElementById('agentBridgePermissionPanel');
    const container = document.getElementById('agent-bridge-container');
    if (panel) {
        panel.hidden = true;
        panel.querySelectorAll('.permission-panel-state').forEach(el => {
            el.classList.remove('is-active');
        });
    }
    if (container) {
        container.dataset.permissionState = 'idle';
    }
}

async function handlePermissionContinue() {
    const continueBtn = document.getElementById('agentBridgePermContinue');
    if (continueBtn) {
        continueBtn.disabled = true;
        continueBtn.textContent = optionsMessage('optionsAgentBridgeRequestingBtn', null, 'Requesting...');
    }

    try {
        const permissionResult = await requestAgentBridgePermission();

        if (!permissionResult.granted) {
            // Show denied state
            showPermissionPanel('denied');
            return;
        }

        // Permission granted
        hidePermissionPanel();
        agentBridgeSettings.enabled = true;
        await saveAgentBridgeSettingsState(agentBridgeSettings);

        if (permissionResult.reloadRequired) {
            await reloadExtensionForAgentBridgePermissionGrant();
            return;
        }

        const toggle = document.querySelector("[name='agentBridgeEnabled']");
        if (toggle) toggle.checked = true;

        const refreshedStatus = await refreshAgentBridgeStatusState();
        setCurrentAgentBridgeChoice(agentBridgeSettings, refreshedStatus);
        showToast(optionsMessage('optionsAgentBridgeEnabledToast', null, "Agent Bridge enabled"), "success");
    } catch (error) {
        console.error('Failed to request Agent Bridge permission:', error);
        showPermissionPanel('denied');
    } finally {
        if (continueBtn) {
            continueBtn.disabled = false;
            continueBtn.textContent = 'Continue';
        }
    }
}

function handlePermissionCancel() {
    hidePermissionPanel();
    const toggle = document.querySelector("[name='agentBridgeEnabled']");
    if (toggle) toggle.checked = false;
    agentBridgeSettings.enabled = false;
    setCurrentAgentBridgeChoice(agentBridgeSettings, agentBridgeStatus);
}

async function handlePermissionRetry() {
    showPermissionPanel('preflight');
}

function handlePermissionDismiss() {
    hidePermissionPanel();
    const toggle = document.querySelector("[name='agentBridgeEnabled']");
    if (toggle) toggle.checked = false;
    agentBridgeSettings.enabled = false;
    setCurrentAgentBridgeChoice(agentBridgeSettings, agentBridgeStatus);
}

function normalizeImportedOptionsState(importedOptions) {
    const optionsStateApi = getOptionsStateApi();
    if (optionsStateApi?.normalizeImportedOptions) {
        return optionsStateApi.normalizeImportedOptions(importedOptions, defaultOptions);
    }

    const normalizedOptions = {
        ...defaultOptions,
        ...(importedOptions || {}),
        tableFormatting: {
            ...(defaultOptions.tableFormatting || {}),
            ...((importedOptions && importedOptions.tableFormatting) || {})
        },
        readerSettings: {
            ...(defaultOptions.readerSettings || {}),
            ...((importedOptions && importedOptions.readerSettings) || {})
        }
    };

    normalizedOptions.sendToCustomTargets = normalizeCustomSendToTargetsState(normalizedOptions.sendToCustomTargets);
    normalizedOptions.defaultSendToTarget = normalizeDefaultSendToTargetState(
        normalizedOptions.defaultSendToTarget,
        normalizedOptions.sendToCustomTargets
    );
    normalizedOptions.sendToMaxUrlLength = normalizeSendToMaxUrlLengthState(
        normalizedOptions.sendToMaxUrlLength,
        defaultOptions?.sendToMaxUrlLength
    );
	    normalizedOptions.webhookTargets = normalizeWebhookTargetsState(normalizedOptions.webhookTargets);
	    normalizedOptions.contextMenuItems = normalizeContextMenuItemsState(normalizedOptions.contextMenuItems);

	    const validPrimaryActions = new Set(['markdown', 'text', 'html', 'pdf', 'copy', 'sendTo']);
    const exportType = String(normalizedOptions.defaultExportType || '').trim();
    normalizedOptions.defaultExportType = validPrimaryActions.has(exportType) || exportType.startsWith('webhook:')
      ? exportType
      : defaultOptions.defaultExportType;

    return normalizedOptions;
}

function getContextMenuTransitionState(previousOptions, nextOptions) {
    const optionsStateApi = getOptionsStateApi();
    if (optionsStateApi?.getContextMenuTransition) {
        return optionsStateApi.getContextMenuTransition(previousOptions, nextOptions);
    }

    const previousEnabled = Boolean(previousOptions?.contextMenus);
    const nextEnabled = Boolean(nextOptions?.contextMenus);
    if (previousEnabled === nextEnabled) {
        return 'none';
    }
    return nextEnabled ? 'create' : 'remove';
}

function resetOptionKeysState(keys) {
    const optionsStateApi = getOptionsStateApi();
    if (optionsStateApi?.resetOptionKeys) {
        return optionsStateApi.resetOptionKeys(options, defaultOptions, keys);
    }

    const nextOptions = JSON.parse(JSON.stringify(options));
    const keyList = Array.isArray(keys) ? keys : String(keys || '').split(',');
    keyList.forEach((rawKey) => {
        const key = String(rawKey || '').trim();
        if (!key) return;

        if (key === 'tableFormatting') {
            nextOptions.tableFormatting = JSON.parse(JSON.stringify(defaultOptions.tableFormatting || {}));
            return;
        }

        if (key.startsWith('tableFormatting.')) {
            const optionName = key.split('.')[1];
            if (!optionName) return;
            nextOptions.tableFormatting = nextOptions.tableFormatting || {};
            nextOptions.tableFormatting[optionName] = defaultOptions.tableFormatting?.[optionName];
            return;
        }

        if (key === 'readerSettings') {
            nextOptions.readerSettings = JSON.parse(JSON.stringify(defaultOptions.readerSettings || {}));
            return;
        }

        if (key.startsWith('readerSettings.')) {
            const optionName = key.split('.')[1];
            if (!optionName) return;
            nextOptions.readerSettings = { ...(defaultOptions.readerSettings || {}), ...(nextOptions.readerSettings || {}) };
            nextOptions.readerSettings[optionName] = defaultOptions.readerSettings?.[optionName];
            return;
        }

        nextOptions[key] = typeof defaultOptions[key] === 'object'
            ? JSON.parse(JSON.stringify(defaultOptions[key]))
            : defaultOptions[key];
    });

    return {
        options: normalizeImportedOptionsState(nextOptions),
        contextMenuAction: getContextMenuTransitionState(options, nextOptions)
    };
}

function resetAllOptionsState() {
    const optionsStateApi = getOptionsStateApi();
    if (optionsStateApi?.resetAllOptions) {
        return optionsStateApi.resetAllOptions(options, defaultOptions);
    }

    const nextOptions = JSON.parse(JSON.stringify(defaultOptions));
    return {
        options: nextOptions,
        contextMenuAction: getContextMenuTransitionState(options, nextOptions)
    };
}

function buildExportFilenameState(date) {
    const optionsStateApi = getOptionsStateApi();
    if (optionsStateApi?.buildExportFilename) {
        return optionsStateApi.buildExportFilename(date);
    }

    const d = date instanceof Date ? date : new Date(date);
    const datestring = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    return `MarkSnip-export-${datestring}.json`;
}

function buildExportPayload() {
    return {
        ...options,
        librarySettings: normalizeLibrarySettingsState(librarySettings)
    };
}

function applyContextMenuTransition(action) {
    if (action === 'create') {
        createMenus();
    } else if (action === 'remove') {
        browser.contextMenus.removeAll();
    }
}

function normalizeUiLanguagePreference(value) {
    return value || 'auto';
}

function didUiLanguagePreferenceChange(previousLanguage, nextLanguage) {
    return normalizeUiLanguagePreference(previousLanguage) !== normalizeUiLanguagePreference(nextLanguage);
}

async function applyUiLanguagePreference(nextLanguage, feedback = {
    message: optionsMessage('optionsLanguageSavedToast', null, 'Language updated — reloading…'),
    type: 'success'
}, persistPreference = true) {
    const normalizedLanguage = normalizeUiLanguagePreference(nextLanguage);
    options.uiLanguage = normalizedLanguage;

    if (persistPreference) {
        await browser.storage.sync.set({ uiLanguage: normalizedLanguage });
    }

    if (feedback !== false) {
        showToast(feedback?.message || optionsMessage('optionsLanguageSavedToast', null, 'Language updated — reloading…'), feedback?.type || 'success');
    }

    try {
        await globalThis.markSnipI18n?.setUiLanguage?.(normalizedLanguage);
    } catch (_error) {}

    setTimeout(() => location.reload(), 400);
}

function buildPopupThemeCacheSnapshot(source = options || defaultOptions) {
    return {
        popupTheme: source?.popupTheme || 'system',
        specialTheme: source?.specialTheme || 'none',
        colorBlindTheme: normalizeColorBlindTheme(source?.colorBlindTheme),
        specialThemeIcon: source?.specialThemeIcon !== false,
        popupAccent: source?.popupAccent || 'sage',
        showThemeToggleInPopup: source?.showThemeToggleInPopup !== false,
        editorTheme: source?.editorTheme || 'default'
    };
}

function persistPopupThemeCache(source = options || defaultOptions) {
    try {
        localStorage.setItem(POPUP_THEME_CACHE_KEY, JSON.stringify(buildPopupThemeCacheSnapshot(source)));
    } catch (error) {
        console.debug('Unable to persist popup theme cache:', error);
    }
}

function normalizeColorBlindTheme(value) {
    return ['deuteranopia', 'protanopia', 'tritanopia'].includes(value) ? value : 'deuteranopia';
}

function getColorBlindThemeClassName(value = options?.colorBlindTheme) {
    return 'colorblind-theme-' + normalizeColorBlindTheme(value);
}

const CB_DROPDOWN_LABELS = { deuteranopia: 'Deuteranopia', protanopia: 'Protanopia', tritanopia: 'Tritanopia' };

function updateCbDropdownLabel(value) {
    const labelEl = document.getElementById('colorBlindThemeBtnLabel');
    if (labelEl) labelEl.textContent = CB_DROPDOWN_LABELS[value] || 'Deuteranopia';
    const panel = document.getElementById('colorBlindThemePanel');
    if (panel) {
        panel.querySelectorAll('.dd-item[data-value]').forEach(item => {
            item.setAttribute('aria-selected', String(item.dataset.value === value));
        });
    }
}

function toggleCbDropdown(e) {
    e.stopPropagation();
    const panel = document.getElementById('colorBlindThemePanel');
    const btn = document.getElementById('colorBlindThemeBtn');
    if (!panel || !btn) return;
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    btn.setAttribute('aria-expanded', String(willOpen));
}

function closeCbDropdown() {
    const panel = document.getElementById('colorBlindThemePanel');
    const btn = document.getElementById('colorBlindThemeBtn');
    if (panel) panel.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

// Apply theme mode and accent color to the Options page itself
function applyThemeSettings() {
    const root = document.documentElement;
    const specialTheme = options.specialTheme || 'none';

    // Apply theme mode
    root.classList.remove('theme-light', 'theme-dark', 'theme-system');
    root.classList.add('theme-' + (options.popupTheme || 'system'));

    root.classList.remove(...SPECIAL_THEME_CLASS_NAMES);
    root.classList.remove(...COLORBLIND_VARIANT_CLASS_NAMES);
    if (specialTheme !== 'none') {
        root.classList.add('special-theme-' + specialTheme);
        if (specialTheme === 'colorblind') {
            root.classList.add(getColorBlindThemeClassName(options.colorBlindTheme));
        }
    }

    root.classList.toggle('hide-theme-icon', options.specialThemeIcon === false);

    // Apply accent color
    root.classList.remove(...ACCENT_CLASS_NAMES);
    const accent = options.popupAccent || 'sage';
    if (specialTheme === 'none' && accent !== 'sage') {
        root.classList.add('accent-' + accent);
    }

    persistPopupThemeCache(options);
}

function updateSpecialThemeControlState() {
    const specialTheme = options.specialTheme || 'none';
    const specialThemeActive = specialTheme !== 'none';
    const colorBlindThemeActive = specialTheme === 'colorblind';
    const themeHasIcon = specialTheme === 'atla' || specialTheme === 'ben10' || specialTheme === 'claude' || specialTheme === 'perplexity' || specialTheme === 'openai';
    const accentGroup = document.getElementById('popupAccentGroup');
    const editorThemeGroup = document.getElementById('editorThemeGroup');
    const accentNote = document.getElementById('popupAccentThemeNote');
    const editorThemeNote = document.getElementById('editorThemeLockNote');
    const iconRow = document.getElementById('specialThemeIconRow');
    const iconInput = document.querySelector("[name='specialThemeIcon']");
    const colorBlindThemeRow = document.getElementById('colorBlindThemeRow');
    const colorBlindThemeInput = document.querySelector("[name='colorBlindTheme']");

    if (iconRow) iconRow.classList.toggle('is-disabled', !themeHasIcon);
    if (iconInput) iconInput.disabled = !themeHasIcon;
    if (colorBlindThemeRow) {
        colorBlindThemeRow.hidden = !colorBlindThemeActive;
        colorBlindThemeRow.classList.toggle('is-disabled', !colorBlindThemeActive);
        colorBlindThemeRow.setAttribute('aria-hidden', String(!colorBlindThemeActive));
    }
    if (colorBlindThemeInput) {
        colorBlindThemeInput.disabled = !colorBlindThemeActive;
        colorBlindThemeInput.value = normalizeColorBlindTheme(options.colorBlindTheme);
    }
    const colorBlindThemeBtn = document.getElementById('colorBlindThemeBtn');
    if (colorBlindThemeBtn) {
        colorBlindThemeBtn.disabled = !colorBlindThemeActive;
        updateCbDropdownLabel(normalizeColorBlindTheme(options.colorBlindTheme));
        if (!colorBlindThemeActive) closeCbDropdown();
    }

    [accentGroup, editorThemeGroup].forEach((group) => {
        group?.classList.toggle('is-disabled', specialThemeActive);
        group?.setAttribute('aria-disabled', String(specialThemeActive));
    });

    if (accentNote) {
        accentNote.hidden = !specialThemeActive;
    }

    if (editorThemeNote) {
        editorThemeNote.hidden = !specialThemeActive;
    }

    document.querySelectorAll("input[name='popupAccent']").forEach((input) => {
        input.disabled = specialThemeActive;
    });

    document.querySelectorAll("input[name='editorTheme']").forEach((input) => {
        input.disabled = specialThemeActive;
    });
}

function configureReviewLink() {
    const reviewLink = document.getElementById("leave-review-link");
    if (!reviewLink || !browser?.runtime?.getURL) return;

    const chromeUrl = reviewLink.dataset.chromeUrl;
    const firefoxUrl = reviewLink.dataset.firefoxUrl;
    const extensionUrl = browser.runtime.getURL("/");
    const isFirefox = extensionUrl.startsWith("moz-extension://");

    reviewLink.href = isFirefox ? firefoxUrl : chromeUrl;
}
const save = (feedback = { message: optionsMessage('optionsSavedToast', null, "Options Saved 💾"), type: "success" }) => {
	    const spinner = document.getElementById("spinner");
	    spinner.style.display = "block";
        options = normalizeImportedOptionsState(options);
	    options.siteRules = normalizeSiteRulesState(options.siteRules);

	    const safeUpdateMenu = (id, update) => {
        if (!browser.contextMenus || typeof browser.contextMenus.update !== "function") {
            return Promise.resolve();
        }
        return browser.contextMenus.update(id, update).catch((err) => {
            const message = String(err?.message || err || "");
            if (!message.includes("Cannot find menu item")) {
                console.warn(`Failed to update context menu '${id}':`, err);
            }
        });
    };

    return browser.storage.sync.set(options)
        .then(() => {
            if (!options.contextMenus) {
                return Promise.resolve();
            }
            return Promise.allSettled([
                safeUpdateMenu("toggle-includeTemplate", {
                    checked: options.includeTemplate
                }),
                safeUpdateMenu("tabtoggle-includeTemplate", {
                    checked: options.includeTemplate
                }),
                safeUpdateMenu("toggle-downloadImages", {
                    checked: options.downloadImages
                }),
                safeUpdateMenu("tabtoggle-downloadImages", {
                    checked: options.downloadImages
                })
            ]);
        })
        .then(() => {
                if (feedback !== false) {
                    showToast(feedback?.message || optionsMessage('optionsSavedToast', null, "Options Saved 💾"), feedback?.type || "success");
                }
            spinner.style.display = "none";
        })
        .catch(err => {
            showToast(String(err), "error");
            spinner.style.display = "none";
        });
}

// Toast notification system
function showToast(message, type) {
    const toast = document.getElementById("status");
    toast.textContent = message;
    toast.className = "toast " + type + " visible";
    clearTimeout(toast._hideTimeout);
    toast._hideTimeout = setTimeout(() => {
        toast.classList.remove("visible");
    }, 3000);
}

function hideToast() {
    this.classList.remove("visible");
}

function buildTemplatePreviewSampleArticle() {
    const sampleUrl = new URL('https://example.com/article');
    const samplePageUrl = new URL('https://example.com/article');

    return {
        title: 'Example Article',
        pageTitle: 'Example Article',
        length: '1842',
        excerpt: 'A compact sample summary for template preview output.',
        description: 'A compact sample summary for template preview output.',
        byline: 'Jane Doe',
        author: 'Jane Doe',
        dir: 'ltr',
        keywords: ['example', 'markdown', 'templates'],
        siteName: 'Example Site',
        baseURI: sampleUrl.href,
        pageURL: samplePageUrl.href,
        tabURL: samplePageUrl.href,
        origin: sampleUrl.origin,
        host: sampleUrl.host,
        hostname: sampleUrl.hostname,
        port: sampleUrl.port,
        protocol: sampleUrl.protocol,
        pathname: sampleUrl.pathname,
        search: sampleUrl.search,
        hash: sampleUrl.hash,
        pageOrigin: samplePageUrl.origin,
        pageHost: samplePageUrl.host,
        pageHostname: samplePageUrl.hostname,
        pagePort: samplePageUrl.port,
        pageProtocol: samplePageUrl.protocol,
        pagePathname: samplePageUrl.pathname,
        pageSearch: samplePageUrl.search,
        pageHash: samplePageUrl.hash
    };
}

function renderTemplatePreviewOutput(outputId, templateValue) {
    const output = document.getElementById(outputId);
    if (!output) {
        return;
    }

    const normalizedTemplate = String(templateValue || '');
    if (!normalizedTemplate.trim()) {
        output.textContent = optionsMessage('optionsTemplatePreviewEmpty', null, 'Nothing to preview yet.');
        output.classList.add('is-empty');
        return;
    }

    const templateUtils = getTemplateUtils();
    const renderedText = typeof templateUtils?.textReplace === 'function'
        ? templateUtils.textReplace(normalizedTemplate, buildTemplatePreviewSampleArticle())
        : normalizedTemplate;

    output.textContent = renderedText;
    output.classList.toggle('is-empty', !renderedText.trim());
}

function renderTemplatePreviews() {
    const frontmatterInput = document.getElementById('frontmatter');
    const backmatterInput = document.getElementById('backmatter');

    renderTemplatePreviewOutput('frontmatter-preview-output', frontmatterInput?.value || '');
    renderTemplatePreviewOutput('backmatter-preview-output', backmatterInput?.value || '');
}

function bindTemplatePreviewListeners() {
    if (templatePreviewListenersBound) {
        return;
    }

    ['frontmatter', 'backmatter'].forEach((id) => {
        const input = document.getElementById(id);
        if (!input) {
            return;
        }

        input.addEventListener('input', renderTemplatePreviews);
    });

    templatePreviewListenersBound = true;
}

const setCurrentChoice = result => {
    options = normalizeImportedOptionsState(result);

    // if browser doesn't support the download api (i.e. Safari)
    // we have to use contentLink download mode
    if (!browser.downloads) {
        options.downloadMode = 'contentLink';
        document.querySelectorAll("[name='downloadMode']").forEach(el => el.disabled = true)
        document.querySelector('#downloadMode .card-desc').innerText = "The Downloads API is unavailable in this browser."
    }

    const downloadImages = options.downloadImages && options.downloadMode == 'downloadsApi';

    if (!downloadImages && (options.imageStyle == 'markdown' || options.imageStyle.startsWith('obsidian'))) {
        options.imageStyle = 'originalSource';
    }

    options.preserveCodeFormatting = options.preserveCodeFormatting === true;
    options.autoDetectCodeLanguage = options.autoDetectCodeLanguage !== false;
    options.skipHiddenContent = options.skipHiddenContent === true;

    document.querySelector("[name='frontmatter']").value = options.frontmatter;
    document.querySelector("[name='backmatter']").value = options.backmatter;
    document.querySelector("[name='title']").value = options.title;
    document.querySelector("[name='disallowedChars']").value = options.disallowedChars;
    document.querySelector("[name='disallowedCharReplacement']").value = options.disallowedCharReplacement || '';
    document.querySelector("[name='includeTemplate']").checked = options.includeTemplate;
    document.querySelector("[name='saveAs']").checked = options.saveAs;
    document.querySelector("[name='downloadImages']").checked = options.downloadImages;
    setCheckedValue(document.querySelectorAll("[name='imagePlacement']"), options.imagePlacement || 'sidecar');
    document.querySelector("[name='imagePrefix']").value = options.imagePrefix;
    document.querySelector("[name='mdClipsFolder']").value = result.mdClipsFolder;
	    document.querySelector("[name='turndownEscape']").checked = options.turndownEscape;
	    document.querySelector("[name='skipHiddenContent']").checked = options.skipHiddenContent;
	    document.querySelector("[name='contextMenus']").checked = options.contextMenus;
	    setContextMenuItemControls(options.contextMenuItems);
	    document.querySelector("[name='batchProcessingEnabled']").checked = options.batchProcessingEnabled !== false;
    document.querySelector("[name='obsidianIntegration']").checked = options.obsidianIntegration;
    document.querySelector("[name='obsidianVault']").value = options.obsidianVault;
    document.querySelector("[name='obsidianFolder']").value = options.obsidianFolder;
    document.querySelector("[name='sendToMaxUrlLength']").value = options.sendToMaxUrlLength;

    const interpreterEnabledEl = document.querySelector("[name='interpreterEnabled']");
    if (interpreterEnabledEl) interpreterEnabledEl.checked = options.interpreterEnabled === true;
    const interpreterAutoRunEl = document.querySelector("[name='interpreterAutoRun']");
    if (interpreterAutoRunEl) interpreterAutoRunEl.checked = options.interpreterAutoRun === true;
    const defaultPromptContextEl = document.querySelector("[name='defaultPromptContext']");
    if (defaultPromptContextEl) defaultPromptContextEl.value = options.defaultPromptContext || '';
    const interpreterExportWarningEl = document.querySelector("[name='interpreterExportWarning']");
    if (interpreterExportWarningEl) interpreterExportWarningEl.checked = options.interpreterExportWarning !== false;

    // Set preserveCodeFormatting checkbox
    document.querySelector("[name='preserveCodeFormatting']").checked = options.preserveCodeFormatting;
    document.querySelector("[name='autoDetectCodeLanguage']").checked = options.autoDetectCodeLanguage;

    // Set table formatting checkboxes
    document.querySelector("[name='tableFormatting.stripLinks']").checked = Boolean(options.tableFormatting.stripLinks);
    document.querySelector("[name='tableFormatting.stripFormatting']").checked = Boolean(options.tableFormatting.stripFormatting);
    document.querySelector("[name='tableFormatting.prettyPrint']").checked = Boolean(options.tableFormatting.prettyPrint);
    document.querySelector("[name='tableFormatting.centerText']").checked = Boolean(options.tableFormatting.centerText);

    // Reader View settings
    const readerEnabledEl = document.querySelector("[name='readerViewEnabled']");
    if (readerEnabledEl) readerEnabledEl.checked = options.readerViewEnabled !== false;

    const readerSettings = { ...(defaultOptions.readerSettings || {}), ...(options.readerSettings || {}) };
    const setReaderInput = (selector, value) => {
        const el = document.querySelector(selector);
        if (el != null) el.value = value;
    };
    setReaderInput("[name='readerSettings.fontSize']", readerSettings.fontSize);
    setReaderInput("[name='readerSettings.lineHeight']", readerSettings.lineHeight);
    setReaderInput("[name='readerSettings.maxWidth']", readerSettings.maxWidth);
    setReaderInput("[name='readerSettings.customCss']", readerSettings.customCss || '');
    setCheckedValue(document.querySelectorAll("[name='readerSettings.appearance']"), readerSettings.appearance || 'auto');
    setCheckedValue(document.querySelectorAll("[name='readerSettings.fontFamily']"), readerSettings.fontFamily || '');

    setCheckedValue(document.querySelectorAll("[name='headingStyle']"), options.headingStyle);
    setCheckedValue(document.querySelectorAll("[name='hr']"), options.hr);
    setCheckedValue(document.querySelectorAll("[name='bulletListMarker']"), options.bulletListMarker);
    setCheckedValue(document.querySelectorAll("[name='codeBlockStyle']"), options.codeBlockStyle);
    setCheckedValue(document.querySelectorAll("[name='fence']"), options.fence);
    setCheckedValue(document.querySelectorAll("[name='emDelimiter']"), options.emDelimiter);
    setCheckedValue(document.querySelectorAll("[name='strongDelimiter']"), options.strongDelimiter);
    setCheckedValue(document.querySelectorAll("[name='linkStyle']"), options.linkStyle);
    setCheckedValue(document.querySelectorAll("[name='linkReferenceStyle']"), options.linkReferenceStyle);
    setCheckedValue(document.querySelectorAll("[name='imageStyle']"), options.imageStyle);
    setCheckedValue(document.querySelectorAll("[name='imageRefStyle']"), options.imageRefStyle);
	    setCheckedValue(document.querySelectorAll("[name='hashtagHandling']"), options.hashtagHandling || 'keep');
	    setCheckedValue(document.querySelectorAll("[name='downloadMode']"), options.downloadMode);
	    setCheckedValue(document.querySelectorAll("[name='defaultExportType']"), options.defaultExportType || 'markdown');
        renderDefaultSendToTargetOptions();
        renderAssistantTargetsList();
        renderWebhookTargetsList();
        renderDefaultExportTypeOptions();
        // Re-apply defaultExportType radio selection after webhook radio buttons are created
        setCheckedValue(document.querySelectorAll("input[name='defaultExportType']"), options.defaultExportType || 'markdown');

	    setCheckedValue(document.querySelectorAll("[name='popupTheme']"), options.popupTheme || 'system');
    setCheckedValue(document.querySelectorAll("[name='specialTheme']"), options.specialTheme || 'none');
    document.querySelector("[name='colorBlindTheme']").value = normalizeColorBlindTheme(options.colorBlindTheme);
    document.querySelector("[name='specialThemeIcon']").checked = options.specialThemeIcon !== false;
    setCheckedValue(document.querySelectorAll("[name='popupAccent']"), options.popupAccent || 'sage');
    document.querySelector("[name='compactMode']").checked = options.compactMode || false;
    document.querySelector("[name='elementPickerEnabled']").checked = options.elementPickerEnabled !== false;
    setCheckedValue(document.querySelectorAll("[name='elementPickerDoneAction']"), options.elementPickerDoneAction === 'copy' ? 'copy' : 'popup');
    document.querySelector("[name='highlighterEnabled']").checked = options.highlighterEnabled !== false;
    document.querySelector("[name='alwaysShowHighlights']").checked = options.alwaysShowHighlights !== false;
    setCheckedValue(document.querySelectorAll("[name='highlightClipBehavior']"), ['ignore', 'replace-content', 'inline'].includes(options.highlightClipBehavior) ? options.highlightClipBehavior : defaultOptions.highlightClipBehavior || 'inline');
    setCheckedValue(document.querySelectorAll("[name='highlightInlineSyntax']"), options.highlightInlineSyntax === 'obsidian' ? 'obsidian' : 'html-mark');
    setCheckedValue(document.querySelectorAll("[name='highlightDefaultColor']"), ['yellow', 'green', 'blue', 'pink', 'purple'].includes(options.highlightDefaultColor) ? options.highlightDefaultColor : 'yellow');
    document.querySelector("[name='showThemeToggleInPopup']").checked = options.showThemeToggleInPopup !== false;
    document.querySelector("[name='showUserGuideIcon']").checked = options.showUserGuideIcon !== false;
    setCheckedValue(document.querySelectorAll("[name='editorTheme']"), options.editorTheme || 'default');
    setCheckedValue(document.querySelectorAll("[name='uiLanguage']"), options.uiLanguage || 'auto');

	    updateSpecialThemeControlState();
	    refreshElements();
	    applyThemeSettings();
	    renderSiteRules();
        renderTemplatePreviews();
	}

const setCurrentLibraryChoice = (result) => {
    librarySettings = normalizeLibrarySettingsState(result);
    document.querySelector("[name='libraryEnabled']").checked = librarySettings.enabled;
    document.querySelector("[name='libraryAutoSaveOnPopupOpen']").checked = librarySettings.autoSaveOnPopupOpen;
    document.querySelector("[name='libraryItemsToKeep']").value = librarySettings.itemsToKeep;
    refreshElements();
}

const setCurrentAgentBridgeChoice = (settingsResult, statusResult = agentBridgeStatus) => {
    agentBridgeSettings = normalizeAgentBridgeSettingsState(settingsResult);
    agentBridgeStatus = normalizeAgentBridgeStatusState(statusResult);

    const toggle = document.querySelector("[name='agentBridgeEnabled']");
    if (toggle) {
        toggle.checked = agentBridgeSettings.enabled;
    }

    const container = document.getElementById('agent-bridge-container');
    const statusText = document.getElementById('agentBridgeStatusText');
    const statusHint = document.getElementById('agentBridgeStatusHint');
    const toggleHint = document.getElementById('agentBridgeToggleHint');
    const versionEl = document.getElementById('agentBridgeHostVersion');

    let text = 'Disabled';
    let hint = 'Enable the Agent Bridge to let MarkSnip connect to the local companion.';
    let state = 'disabled';

    if (usesOptionalNativeMessagingPermission() && agentBridgeSettings.enabled && !agentBridgeStatus.permissionGranted) {
        text = 'Permission needed';
        hint = 'Grant native messaging permission to let MarkSnip connect to the local companion.';
        state = 'permission-needed';
    } else if (agentBridgeSettings.enabled && agentBridgeStatus.connecting) {
        text = optionsMessage('optionsAgentBridgeCheckingConnection', null, 'Checking connection');
        hint = 'MarkSnip is waiting for the local companion to respond.';
        state = 'starting';
    } else if (agentBridgeSettings.enabled && agentBridgeStatus.connected) {
        text = `Connected${agentBridgeStatus.browser ? ` via ${agentBridgeStatus.browser}` : ''}`;
        hint = 'The local CLI can request the current page while this browser is open.';
        state = 'connected';
    } else if (agentBridgeSettings.enabled && agentBridgeStatus.lastError) {
        text = 'Waiting for companion';
        hint = 'The local companion could not be reached. Check the setup guide and try again.';
        state = 'waiting';
    } else if (agentBridgeSettings.enabled) {
        text = 'Starting';
        hint = 'MarkSnip is trying to connect to the local companion.';
        state = 'starting';
    } else if (!agentBridgeSettings.enabled && agentBridgeStatus.permissionGranted) {
        // Disabled after prior grant
        hint = 'MarkSnip will not use the local connection while disabled, even if the browser-level permission remains granted.';
    }

    if (container) {
        container.dataset.bridgeState = state;
    }
    updateAgentBridgeActionButton(state);

    if (statusText) {
        statusText.textContent = text;
    }
    if (statusHint) {
        statusHint.textContent = hint;
    }

    // Update toggle hint based on enabled state
    if (toggleHint) {
        if (agentBridgeSettings.enabled) {
            toggleHint.textContent = 'MarkSnip opens a native messaging connection while this toggle is on.';
        } else {
            toggleHint.textContent = 'When off, MarkSnip will not open a local companion connection.';
        }
    }

    if (versionEl) {
        if (agentBridgeStatus.hostVersion) {
            versionEl.textContent = `Host ${agentBridgeStatus.hostVersion}`;
            versionEl.hidden = false;
        } else {
            versionEl.textContent = '';
            versionEl.hidden = true;
        }
    }
}

const restoreOptions = () => {
    const onError = error => {
        console.error(error);
    }

    resolveAgentBridgeInstallCommand().catch(onError);

    Promise.all([
        browser.storage.sync.get(defaultOptions),
        loadLibrarySettingsState(),
        loadAgentBridgeSettingsState(),
        loadAgentBridgeStatusState(),
        (getInterpreterUtilsApi()?.loadInterpreterConfig?.() || Promise.resolve(null))
    ]).then(([syncOptions, localLibrarySettings, localAgentBridgeSettings, localAgentBridgeStatus, loadedInterpreterConfig]) => {
        setCurrentChoice(syncOptions);
        setCurrentLibraryChoice(localLibrarySettings);
        setCurrentAgentBridgeChoice(localAgentBridgeSettings, localAgentBridgeStatus);
        if (loadedInterpreterConfig) {
            interpreterConfig = loadedInterpreterConfig;
        }
        renderInterpreterManagers();
        refreshAgentBridgeStatusState().then((status) => {
            setCurrentAgentBridgeChoice(agentBridgeSettings, status);
        }).catch(onError);
    }, onError);
}

const show = (el, visible) => {
    if (!el) return;
    el.style.display = visible ? "" : "none";
    el.style.opacity = visible ? "1" : "0";
}

const refreshElements = () => {
    // Apply theme/accent to Options page live
    applyThemeSettings();
    updateSpecialThemeControlState();

    document.getElementById("downloadModeGroup").querySelectorAll('.setting-card').forEach(container => {
        show(container, options.downloadMode == 'downloadsApi')
    });

    show(document.getElementById("mdClipsFolder"), options.downloadMode == 'downloadsApi');

    show(document.getElementById("linkReferenceStyle"), (options.linkStyle == "referenced"));

    show(document.getElementById("imageRefOptions"), (!options.imageStyle.startsWith("obsidian") && options.imageStyle != "noImage"));

    show(document.getElementById("fence"), (options.codeBlockStyle == "fenced"));

    const downloadImages = options.downloadImages && options.downloadMode == 'downloadsApi';

    show(document.getElementById("imagePlacement"), downloadImages);
    show(document.getElementById("imagePrefix"), downloadImages && options.imagePlacement === 'customPrefix');

    document.getElementById('markdown').disabled = !downloadImages;
    document.getElementById('base64').disabled = !downloadImages;
    document.getElementById('obsidian').disabled = !downloadImages;
    document.getElementById('obsidian-nofolder').disabled = !downloadImages;

    show(document.getElementById("defaultSendToTargetCard"), options.defaultExportType === 'sendTo');

    show(document.getElementById("libraryAutoSave-container"), librarySettings.enabled);
    show(document.getElementById("libraryItemsToKeep-container"), librarySettings.enabled);
}

const inputChange = async (e) => {
    if (e) {
        let key = String(e.target.name || '').trim();
        let value = e.target.value;
        if (!key) {
            return;
        }
        if (key == "import-file") {
            fr = new FileReader();
            fr.onload = async (ev) => {
                let lines = ev.target.result;
                const importedPayload = JSON.parse(lines);
                const importedLibrarySettings = importedPayload?.librarySettings;
                const importedOptions = { ...importedPayload };
                delete importedOptions.librarySettings;
                delete importedOptions.libraryItems;
                const previousOptions = options;
                options = normalizeImportedOptionsState(importedOptions);
                setCurrentChoice(options);
                applyContextMenuTransition(getContextMenuTransitionState(previousOptions, options));
                if (importedLibrarySettings) {
                    await saveLibrarySettingsState(importedLibrarySettings);
                    setCurrentLibraryChoice(librarySettings);
                }
                save();
                refreshElements();
            };
            fr.readAsText(e.target.files[0])
        }
        else if (key === 'libraryEnabled' || key === 'libraryAutoSaveOnPopupOpen' || key === 'libraryItemsToKeep') {
            if (e.target.type == "checkbox") value = e.target.checked;

            if (key === 'libraryEnabled') {
                librarySettings.enabled = Boolean(value);
            } else if (key === 'libraryAutoSaveOnPopupOpen') {
                librarySettings.autoSaveOnPopupOpen = Boolean(value);
            } else if (key === 'libraryItemsToKeep') {
                librarySettings.itemsToKeep = normalizeLibrarySettingsState({
                    ...librarySettings,
                    itemsToKeep: value
                }).itemsToKeep;
                // Only trim on commit (change/blur), never on debounced keyup —
                // typing "50" otherwise trims through 5 before reaching 50.
                if (e.type === 'change') {
                    document.querySelector("[name='libraryItemsToKeep']").value = librarySettings.itemsToKeep;
                    await trimLibraryItemsState(librarySettings.itemsToKeep);
                }
            }

            await saveLibrarySettingsState(librarySettings);
            setCurrentLibraryChoice(librarySettings);
            showToast(optionsMessage('optionsLibrarySettingsSavedToast', null, "Library settings saved"), "success");
        }
        else if (key === 'agentBridgeEnabled') {
            const nextEnabled = Boolean(e.target.checked);
            let reloadRequired = false;

            if (nextEnabled && usesOptionalNativeMessagingPermission() && !agentBridgeStatus.permissionGranted) {
                // Don't immediately request permission — show the preflight panel
                e.target.checked = false;
                showPermissionPanel('preflight');
                return;
            }

            agentBridgeSettings.enabled = nextEnabled;
            hidePermissionPanel();
            await saveAgentBridgeSettingsState(agentBridgeSettings);
            if (reloadRequired) {
                await reloadExtensionForAgentBridgePermissionGrant();
                return;
            }
            const refreshedStatus = await refreshAgentBridgeStatusState();
            setCurrentAgentBridgeChoice(agentBridgeSettings, refreshedStatus);
            showToast(nextEnabled
                ? optionsMessage('optionsAgentBridgeEnabledToast', null, "Agent Bridge enabled")
                : optionsMessage('optionsAgentBridgeDisabledToast', null, "Agent Bridge disabled"), "success");
        }
        else if (key === 'uiLanguage') {
            const nextLanguage = value || 'auto';
            try {
                await applyUiLanguagePreference(nextLanguage);
            } catch (err) {
                showToast(String(err), 'error');
            }
        }
        else {
            if (e.target.type == "checkbox") value = e.target.checked;
            if (key === 'sendToMaxUrlLength') {
                value = normalizeSendToMaxUrlLengthState(value, defaultOptions?.sendToMaxUrlLength);
                e.target.value = value;
            }

	            // Handle nested option groups
	            if (key.startsWith('tableFormatting.')) {
	                const optionName = key.split('.')[1];
	                options.tableFormatting = options.tableFormatting || {};
	                options.tableFormatting[optionName] = value;
	            } else if (key.startsWith('contextMenuItems.')) {
	                const itemKey = key.split('.')[1];
	                options.contextMenuItems = normalizeContextMenuItemsState(options.contextMenuItems);
	                if (itemKey) {
	                    options.contextMenuItems[itemKey] = Boolean(value);
	                }
	            } else if (key.startsWith('readerSettings.')) {
	                const optionName = key.split('.')[1];
	                const defaults = defaultOptions.readerSettings || {};
	                options.readerSettings = { ...defaults, ...(options.readerSettings || {}) };
	                if (e.target.type === 'number') {
	                    const numeric = Number(value);
	                    options.readerSettings[optionName] = Number.isFinite(numeric) ? numeric : defaults[optionName];
	                } else {
	                    options.readerSettings[optionName] = value;
	                }
	            } else {
	                options[key] = value;
	            }
 
            if (key == "contextMenus") {
                if (value) { createMenus() }
                else { browser.contextMenus.removeAll() }
            }
    
            save();
            refreshElements();
        }
    }
 }

const inputKeyup = (e) => {
    if (keyupTimeout) clearTimeout(keyupTimeout);
    keyupTimeout = setTimeout(inputChange, 500, e);
}

const buttonClick = async (e) => {
    if (e.target.id == "import" || e.target.closest('#import')) {
        document.getElementById("import-file").click();
    }
    else if (e.target.id == "export" || e.target.closest('#export')) {
        console.log("export");
        const json = JSON.stringify(buildExportPayload(), null, 2);
        var blob = new Blob([json], { type: "text/json" });
        var url = URL.createObjectURL(blob);
	        browser.downloads.download({
	            url: url,
	            saveAs: true,
	            filename: buildExportFilenameState(new Date())
	        });
	    }
	    else if (e.target.id == "contextMenuItemsEnableAll" || e.target.closest('#contextMenuItemsEnableAll')) {
	        await setAllContextMenuItems(true);
	    }
	    else if (e.target.id == "contextMenuItemsDisableAll" || e.target.closest('#contextMenuItemsDisableAll')) {
	        await setAllContextMenuItems(false);
	    }
	    else if (e.target.id == "clear-library" || e.target.closest('#clear-library')) {
	        clearLibraryItems();
	    }
    else if (e.target.id == "open-highlights-manager" || e.target.closest('#open-highlights-manager')) {
        browser.tabs.create({ url: browser.runtime.getURL('highlights/highlights.html') });
    }
    else if (e.target.id == "refreshAgentBridgeStatus" || e.target.closest('#refreshAgentBridgeStatus')) {
        const refreshBtn = document.getElementById('refreshAgentBridgeStatus');
        const needsPermission = usesOptionalNativeMessagingPermission() && agentBridgeSettings.enabled && !agentBridgeStatus.permissionGranted;

        if (needsPermission) {
            if (refreshBtn) {
                refreshBtn.disabled = true;
                refreshBtn.textContent = optionsMessage('optionsAgentBridgeGrantingBtn', null, 'Granting...');
            }

            try {
                const permissionResult = await requestAgentBridgePermission();
                if (!permissionResult.granted) {
                    setCurrentAgentBridgeChoice(agentBridgeSettings, agentBridgeStatus);
                    return;
                }

                if (permissionResult.reloadRequired) {
                    await reloadExtensionForAgentBridgePermissionGrant();
                    return;
                }

                const status = await refreshAgentBridgeStatusState();
                setCurrentAgentBridgeChoice(agentBridgeSettings, status);
                showToast(optionsMessage('optionsAgentBridgePermissionGrantedToast', null, "Agent Bridge permission granted"), "success");
            } catch (error) {
                console.error('Failed to request Agent Bridge permission:', error);
                setCurrentAgentBridgeChoice(agentBridgeSettings, agentBridgeStatus);
                showToast(String(error), "error");
            } finally {
                if (refreshBtn) {
                    refreshBtn.disabled = false;
                }
                updateAgentBridgeActionButton(document.getElementById('agent-bridge-container')?.dataset.bridgeState || 'disabled');
            }
            return;
        }

        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.textContent = optionsMessage('optionsAgentBridgeCheckingBtn', null, 'Checking...');
        }
        setCurrentAgentBridgeChoice(agentBridgeSettings, {
            ...agentBridgeStatus,
            connecting: true,
            connected: false,
            lastError: ''
        });

        refreshAgentBridgeStatusState()
            .then((status) => {
                setCurrentAgentBridgeChoice(agentBridgeSettings, status);
                showToast(optionsMessage('optionsAgentBridgeStatusRefreshedToast', null, "Agent Bridge status refreshed"), "success");
            })
            .catch((error) => {
                console.error('Failed to refresh Agent Bridge status:', error);
                setCurrentAgentBridgeChoice(agentBridgeSettings, agentBridgeStatus);
                showToast(String(error), "error");
            })
            .finally(() => {
                if (refreshBtn) {
                    refreshBtn.disabled = false;
                }
                updateAgentBridgeActionButton(document.getElementById('agent-bridge-container')?.dataset.bridgeState || 'disabled');
            });
    }
    else if (e.target.id == "copyAgentBridgeCommand" || e.target.closest('#copyAgentBridgeCommand')) {
        const command = document.getElementById('agentBridgeInstallCommand')?.textContent?.trim() || agentBridgeInstallCommand;
        navigator.clipboard.writeText(command)
            .then(() => {
                showToast(optionsMessage('optionsAgentBridgeInstallCommandCopiedToast', null, "Install command copied"), "success");
            })
            .catch((error) => {
                console.error('Failed to copy Agent Bridge install command:', error);
                showToast(optionsMessage('optionsAgentBridgeInstallCommandCopyFailedToast', null, "Failed to copy install command"), "error");
            });
    }
}

// ── Sidebar Navigation ──
async function clearLibraryItems() {
    if (!confirm(optionsMessage('optionsLibraryClearConfirm', null, 'Delete all saved Library clips from this browser? This cannot be undone.'))) {
        return;
    }

    try {
        await clearLibraryItemsState();
        showToast(optionsMessage('optionsLibraryClearedToast', null, "Library cleared"), "success");
    } catch (error) {
        console.error('Failed to clear library:', error);
        showToast(String(error), "error");
    }
}

function initSidebar() {
    const sidebarItems = Array.from(document.querySelectorAll('.sidebar-item'));
    const sections = Array.from(document.querySelectorAll('.section'));

    // Honor a #section-<id> hash deep-link (e.g. from the reader Settings button)
    const hashMatch = (window.location.hash || '').match(/^#section-(.+)/);
    const hashSection = hashMatch?.[1];
    if (hashSection && document.getElementById(`section-${hashSection}`)) {
        sessionStorage.setItem('marksnip-options-tab', hashSection);
    }

    // Restore last active tab from sessionStorage
    const lastActive = sessionStorage.getItem('marksnip-options-tab') || 'templates';

    function switchSection(sectionId) {
        // Update sidebar
        sidebarItems.forEach(item => {
            const isActive = item.dataset.section === sectionId;
            item.classList.toggle('active', isActive);
            item.setAttribute('aria-selected', String(isActive));
            item.tabIndex = isActive ? 0 : -1;
        });
        const activeItem = document.querySelector(`.sidebar-item[data-section="${sectionId}"]`);

        // Update sections
        sections.forEach(section => {
            const isActive = section.id === `section-${sectionId}`;
            section.classList.toggle('active', isActive);
            section.setAttribute('aria-hidden', String(!isActive));
        });
        const activeSection = document.getElementById(`section-${sectionId}`);

        // Persist
        sessionStorage.setItem('marksnip-options-tab', sectionId);

        return { activeItem, activeSection };
    }

    function activateSidebarItem(item, shouldFocus = false) {
        if (!item) {
            return;
        }

        const searchInput = document.getElementById('settings-search');
        if (searchInput && searchInput.value) {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input'));
        }

        const { activeItem } = switchSection(item.dataset.section);
        if (shouldFocus && activeItem) {
            activeItem.focus();
        }
    }

    sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            activateSidebarItem(item);
        });

        item.addEventListener('keydown', (event) => {
            const currentIndex = sidebarItems.indexOf(item);
            let targetIndex = currentIndex;

            if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                targetIndex = (currentIndex + 1) % sidebarItems.length;
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                targetIndex = (currentIndex - 1 + sidebarItems.length) % sidebarItems.length;
            } else if (event.key === 'Home') {
                targetIndex = 0;
            } else if (event.key === 'End') {
                targetIndex = sidebarItems.length - 1;
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                activateSidebarItem(item);
                return;
            } else {
                return;
            }

            event.preventDefault();
            activateSidebarItem(sidebarItems[targetIndex], true);
        });
    });

    // Initialize to last active
    switchSection(lastActive);
}

// ── Per-card and global reset ──

function injectResetLinks() {
    document.querySelectorAll('.setting-card[data-setting-key], .setting-card[data-local-setting-key]').forEach(card => {
        // Skip if already injected
        if (card.querySelector('.reset-setting-link')) return;

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'reset-setting-link';
        resetBtn.textContent = optionsMessage('optionsResetSettingBtn', null, 'Reset');
        resetBtn.title = optionsMessage('optionsResetDefaultTitle', null, 'Reset to default');

        // If card has a card-title, wrap title + reset in a row
        const titleEl = card.querySelector(':scope > .card-title');
        if (titleEl) {
            const row = document.createElement('div');
            row.className = 'card-title-row';
            titleEl.before(row);
            row.appendChild(titleEl);
            row.appendChild(resetBtn);
        } else {
            // For toggle-only cards, insert as first child (positioned absolutely via CSS)
            card.insertBefore(resetBtn, card.firstChild);
        }

        resetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            resetSettingByCard(card);
        });
    });
}

async function resetSettingByCard(card) {
    const previousLanguage = normalizeUiLanguagePreference(options.uiLanguage);
    const localKey = card.dataset.localSettingKey;

    if (localKey) {
        const defaults = normalizeLibrarySettingsState();
        librarySettings = {
            ...librarySettings,
            [localKey]: defaults[localKey]
        };
        if (localKey === 'itemsToKeep') {
            await trimLibraryItemsState(librarySettings.itemsToKeep);
        }
        await saveLibrarySettingsState(librarySettings);
        setCurrentLibraryChoice(librarySettings);
        showToast(optionsMessage('optionsSettingResetToast', null, "Setting reset to default"), "success");
        return;
    }

    const keys = card.dataset.settingKey.split(',');
    const resetResult = resetOptionKeysState(keys);
    options = resetResult.options;
    setCurrentChoice(options);
    applyContextMenuTransition(resetResult.contextMenuAction);
    if (keys.some((key) => key.trim() === 'uiLanguage') && didUiLanguagePreferenceChange(previousLanguage, options.uiLanguage)) {
        await save(false);
        await applyUiLanguagePreference(options.uiLanguage, undefined, false);
        return;
    }

    save();
    showToast(optionsMessage('optionsSettingResetToast', null, "Setting reset to default"), "success");
}

async function resetAllSettings() {
    if (!confirm(optionsMessage('optionsResetAllConfirm', null, 'Reset all settings to defaults? This cannot be undone.'))) return;
    const previousLanguage = normalizeUiLanguagePreference(options.uiLanguage);
    const resetResult = resetAllOptionsState();
    options = resetResult.options;
    setCurrentChoice(options);
    applyContextMenuTransition(resetResult.contextMenuAction);
    await resetLibrarySettingsState();
    setCurrentLibraryChoice(librarySettings);
    if (didUiLanguagePreferenceChange(previousLanguage, options.uiLanguage)) {
        await save(false);
        await applyUiLanguagePreference(options.uiLanguage, {
            message: optionsMessage('optionsResetAllToast', null, "All settings reset to defaults"),
            type: 'success'
        }, false);
        return;
    }

    save();
    showToast(optionsMessage('optionsResetAllToast', null, "All settings reset to defaults"), "success");
}

const loaded = async () => {
    if (globalThis.markSnipI18n?.localizeDocument) {
        await globalThis.markSnipI18n.localizeDocument(document).catch(() => {});
    }
    // Initialize sidebar navigation
	    initSidebar();
	    initSearch();
	    configureReviewLink();
	    bindTemplatePreviewListeners();
	    renderTemplatePreviews();
        initSendToControls();
        initWebhookTargetControls();
        initInterpreterControls();

	    // Restore saved options
	    restoreOptions();
	    initSiteRuleControls();

    browser.storage.onChanged?.addListener?.((changes, areaName) => {
        if (areaName !== 'local') {
            return;
        }

        const bridgeApi = getAgentBridgeStateApi();
        const settingsKey = bridgeApi?.STORAGE_KEYS?.SETTINGS;
        const statusKey = bridgeApi?.STORAGE_KEYS?.STATUS;

        if (settingsKey && changes[settingsKey]) {
            agentBridgeSettings = normalizeAgentBridgeSettingsState(changes[settingsKey].newValue);
            setCurrentAgentBridgeChoice(agentBridgeSettings, agentBridgeStatus);
        }

        if (statusKey && changes[statusKey]) {
            agentBridgeStatus = normalizeAgentBridgeStatusState(changes[statusKey].newValue);
            setCurrentAgentBridgeChoice(agentBridgeSettings, agentBridgeStatus);
        }
    });

    // Inject per-card reset links
    injectResetLinks();

    // Reset All button
    const resetAllBtn = document.getElementById('reset-all');
    if (resetAllBtn) {
        resetAllBtn.addEventListener('click', resetAllSettings);
    }

	    // Attach event listeners (skip the search input)
		    document.querySelectorAll('input,textarea,button,select').forEach(input => {
		        if (input.id === 'settings-search') return;
		        if (input.closest('#siteRulesCard')) return;
                if (input.closest('#defaultSendToTargetCard') || input.closest('#assistantTargetsCard')) return;
                if (input.closest('#webhookTargetsCard')) return;
                if (input.closest('#interpreterProvidersCard') || input.closest('#interpreterModelsCard')) return;
                if (input.closest('#interpreterProviderDialog') || input.closest('#interpreterModelDialog')) return;
		        // Skip permission panel buttons (they have their own handlers)
		        if (['agentBridgePermContinue', 'agentBridgePermCancel', 'agentBridgePermRetry', 'agentBridgePermDismiss'].includes(input.id)) return;
	        // Skip colorblind theme dropdown (has its own handlers)
	        if (input.id === 'colorBlindThemeBtn' || input.closest('#colorBlindThemePanel')) return;
        if (input.tagName == "TEXTAREA" || input.type == "text") {
            input.addEventListener('keyup', inputKeyup);
        }
        else if (input.type == "number") {
            input.addEventListener('keyup', inputKeyup);
            input.addEventListener('change', inputChange);
        }
        else if (input.tagName == "BUTTON") {
            input.addEventListener('click', buttonClick);
        }
        else input.addEventListener('change', inputChange);
    })

    // Colorblind theme custom dropdown
    document.getElementById('colorBlindThemeBtn')?.addEventListener('click', toggleCbDropdown);
    document.getElementById('colorBlindThemePanel')?.addEventListener('click', (e) => {
        const item = e.target.closest('.dd-item[data-value]');
        if (!item) return;
        const value = item.dataset.value;
        const hiddenInput = document.querySelector("[name='colorBlindTheme']");
        if (hiddenInput) hiddenInput.value = value;
        options.colorBlindTheme = value;
        closeCbDropdown();
        save();
        refreshElements();
    });
    document.addEventListener('click', (e) => {
        if (!document.getElementById('colorBlindDropdownWrap')?.contains(e.target)) {
            closeCbDropdown();
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeCbDropdown();
    });

    // Wire up permission panel buttons
    const permContinue = document.getElementById('agentBridgePermContinue');
    const permCancel = document.getElementById('agentBridgePermCancel');
    const permRetry = document.getElementById('agentBridgePermRetry');
    const permDismiss = document.getElementById('agentBridgePermDismiss');
    const permGuideLink = document.getElementById('agentBridgePermGuideLink');

    if (permContinue) permContinue.addEventListener('click', handlePermissionContinue);
    if (permCancel) permCancel.addEventListener('click', handlePermissionCancel);
    if (permRetry) permRetry.addEventListener('click', handlePermissionRetry);
    if (permDismiss) permDismiss.addEventListener('click', handlePermissionDismiss);
    if (permGuideLink) {
        permGuideLink.addEventListener('click', (e) => {
            e.preventDefault();
            const setupGuide = document.getElementById('agentBridgeSetupGuide');
            if (setupGuide) {
                setupGuide.open = true;
                setupGuide.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }
}

// ── Settings Search ──
function initSearch() {
    const searchInput = document.getElementById('settings-search');
    const searchStatus = document.getElementById('settings-search-status');
    const contentPanel = document.querySelector('.content-panel');
    const noResults = document.getElementById('search-no-results');
    const noResultsQuery = document.getElementById('search-no-results-query');
    const searchApi = globalThis.markSnipOptionsSearch;

    if (!searchInput || !contentPanel || !noResults || !noResultsQuery || !searchApi) {
        return;
    }

    const sections = document.querySelectorAll('.section');
    const searchIndex = searchApi.buildSearchIndex(document);
    const totalSettings = searchIndex.length;
    let searchTimeout = null;

    function updateSearchStatus(message) {
        if (!searchStatus) {
            return;
        }
        const nextMessage = String(message || '');
        searchStatus.textContent = nextMessage;
        searchStatus.hidden = nextMessage === '';
    }

    function restoreDefaultView() {
        contentPanel.classList.remove('search-active');
        noResults.classList.remove('visible');
        updateSearchStatus('');

        searchIndex.forEach(({ card }) => {
            card.classList.remove('search-hidden', 'search-match');
            card.style.removeProperty('display');
            card.style.removeProperty('opacity');
            delete card.dataset.searchBreadcrumb;
            delete card.dataset.searchAlias;
        });

        document.querySelectorAll('[data-search-force-shown]').forEach(el => {
            el.style.removeProperty('display');
            el.style.removeProperty('opacity');
            el.removeAttribute('data-search-force-shown');
        });

        sections.forEach(section => section.classList.remove('search-section-empty'));

        // Honor a #section-<id> hash so the reader (and other surfaces) can deep-link
        const hashMatch = (window.location.hash || '').match(/^#section-(.+)/);
        const hashSection = hashMatch?.[1];
        if (hashSection && document.getElementById(`section-${hashSection}`)) {
            sessionStorage.setItem('marksnip-options-tab', hashSection);
        }
        const activeTab = hashSection || sessionStorage.getItem('marksnip-options-tab') || 'templates';
        const sidebarItems = document.querySelectorAll('.sidebar-item');
        const allSections = document.querySelectorAll('.section');

        sidebarItems.forEach(item => {
            const isActive = item.dataset.section === activeTab;
            item.classList.toggle('active', isActive);
            item.setAttribute('aria-selected', String(isActive));
            item.tabIndex = isActive ? 0 : -1;
        });

        allSections.forEach(section => {
            const isActive = section.id === `section-${activeTab}`;
            section.classList.toggle('active', isActive);
            section.setAttribute('aria-hidden', String(!isActive));
        });

        refreshElements();
    }

    function performSearch(query) {
        const normalizedQuery = searchApi.normalizeSearchText(query);

        if (!normalizedQuery) {
            restoreDefaultView();
            return;
        }

        contentPanel.classList.add('search-active');

        const searchResults = searchApi.searchSettings(searchIndex, normalizedQuery);
        let totalMatches = 0;

        searchResults.results.forEach(({ card, section, matches, tokenMatches }) => {
            card.classList.toggle('search-hidden', !matches);
            card.classList.toggle('search-match', matches);

            // Always clear previous annotations so stale data doesn't linger on non-matches
            delete card.dataset.searchBreadcrumb;
            delete card.dataset.searchAlias;

            if (matches) {
                totalMatches++;
                card.style.display = '';
                card.style.opacity = '1';

                // Force-show any conditionally hidden children so they are interactable in search results
                card.querySelectorAll('[data-search-reveal]').forEach(child => {
                    if (child.style.display === 'none') {
                        child.style.display = '';
                        child.style.opacity = '1';
                        child.setAttribute('data-search-force-shown', '');
                    }
                });

                const sectionLabel = section.querySelector('.section-title')?.textContent?.trim()
                    || section.dataset.sectionLabel || '';
                const cardTitle = card.querySelector('.card-title')?.textContent?.trim() || '';
                if (sectionLabel) {
                    card.dataset.searchBreadcrumb = sectionLabel + (cardTitle ? ' \u203a ' + cardTitle : '');
                }

                const aliasSources = tokenMatches.filter(m => m.fieldSource === 'alias');
                if (aliasSources.length > 0) {
                    const rawKeywords = card.dataset.searchKeywords || '';
                    const keywords = rawKeywords.split(',').map(k => k.trim()).filter(Boolean);
                    const matchedKeywords = keywords.filter(kw => {
                        const normKw = searchApi.normalizeSearchText(kw);
                        return aliasSources.some(m => normKw.includes(m.token) || normKw.startsWith(m.token));
                    });
                    if (matchedKeywords.length > 0) {
                        card.dataset.searchAlias = 'matched via: ' + matchedKeywords.slice(0, 2).join(', ');
                    }
                }

                let parent = card.parentElement;
                while (parent && parent !== contentPanel) {
                    if (parent.style.display === 'none') {
                        parent.style.display = '';
                        parent.style.opacity = '1';
                        parent.setAttribute('data-search-force-shown', '');
                    }
                    parent = parent.parentElement;
                }
            }
        });

        sections.forEach(section => {
            const hasVisible = section.querySelector('.setting-card.search-match');
            section.classList.toggle('search-section-empty', !hasVisible);
            section.setAttribute('aria-hidden', String(!hasVisible));
        });

        if (totalMatches === 0) {
            noResultsQuery.textContent = query.trim();
            noResults.classList.add('visible');
            updateSearchStatus(`No settings match "${query.trim()}"`);
        } else {
            noResults.classList.remove('visible');
            updateSearchStatus(`Showing ${totalMatches} of ${totalSettings} settings`);
        }
    }

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => performSearch(searchInput.value), 150);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            e.preventDefault();
            searchInput.focus();
        }

        if (e.key === 'Escape' && document.activeElement === searchInput) {
            searchInput.value = '';
            performSearch('');
            searchInput.blur();
        }
    });
}

document.addEventListener("DOMContentLoaded", loaded);
document.getElementById("status").addEventListener("click", hideToast);

// set the radio button with the given value as being checked
// do nothing if there are no radio buttons
// if the given value does not exist, all the radio buttons
// are reset to unchecked
function setCheckedValue(radioObj, newValue) {
    if (!radioObj)
        return;
    var radioLength = radioObj.length;
    if (radioLength == undefined) {
        radioObj.checked = (radioObj.value == newValue.toString());
        return;
    }
    for (var i = 0; i < radioLength; i++) {
        radioObj[i].checked = false;
        if (radioObj[i].value == newValue.toString()) {
            radioObj[i].checked = true;
        }
    }
}
