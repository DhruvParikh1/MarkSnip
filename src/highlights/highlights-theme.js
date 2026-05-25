(function () {
  'use strict';

  const CACHE_KEY = 'marksnip-popup-theme-cache-v1';
  const THEME_KEYS = ['popupTheme', 'specialTheme', 'colorBlindTheme', 'specialThemeIcon', 'popupAccent'];
  const SPECIAL_THEME_CLASS_NAMES = ['special-theme-claude', 'special-theme-perplexity', 'special-theme-openai', 'special-theme-atla', 'special-theme-ben10', 'special-theme-colorblind'];
  const COLOR_BLIND_THEME_CLASS_NAMES = ['colorblind-theme-deuteranopia', 'colorblind-theme-protanopia', 'colorblind-theme-tritanopia'];
  const ACCENT_CLASS_NAMES = ['accent-sage', 'accent-ocean', 'accent-slate', 'accent-rose', 'accent-amber'];

  const DEFAULT_THEME_SETTINGS = {
    popupTheme: 'system',
    specialTheme: 'none',
    colorBlindTheme: 'deuteranopia',
    specialThemeIcon: true,
    popupAccent: 'sage'
  };

  let currentSettings = normalizeThemeSettings(readCachedSettings());

  function normalizePopupTheme(value) {
    return ['light', 'dark', 'system'].includes(value) ? value : 'system';
  }

  function normalizeSpecialTheme(value) {
    return ['none', 'claude', 'perplexity', 'openai', 'atla', 'ben10', 'colorblind'].includes(value) ? value : 'none';
  }

  function normalizeColorBlindTheme(value) {
    return ['deuteranopia', 'protanopia', 'tritanopia'].includes(value) ? value : 'deuteranopia';
  }

  function normalizeAccent(value) {
    return ['sage', 'ocean', 'slate', 'rose', 'amber'].includes(value) ? value : 'sage';
  }

  function normalizeThemeSettings(settings = {}) {
    return {
      popupTheme: normalizePopupTheme(settings.popupTheme),
      specialTheme: normalizeSpecialTheme(settings.specialTheme),
      colorBlindTheme: normalizeColorBlindTheme(settings.colorBlindTheme),
      specialThemeIcon: settings.specialThemeIcon !== false,
      popupAccent: normalizeAccent(settings.popupAccent)
    };
  }

  function readCachedSettings() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : DEFAULT_THEME_SETTINGS;
    } catch {
      return DEFAULT_THEME_SETTINGS;
    }
  }

  function writeCachedSettings(settings) {
    try {
      const existingRaw = localStorage.getItem(CACHE_KEY);
      const existing = existingRaw ? JSON.parse(existingRaw) : {};
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        ...existing,
        ...settings
      }));
    } catch {
      // Storage may be unavailable in static render/test contexts.
    }
  }

  function applyThemeSettings(settings) {
    const root = document.documentElement;
    const normalized = normalizeThemeSettings(settings);
    const specialTheme = normalized.specialTheme;

    root.classList.remove('theme-light', 'theme-dark', 'theme-system');
    root.classList.add('theme-' + normalized.popupTheme);

    root.classList.remove(...SPECIAL_THEME_CLASS_NAMES);
    root.classList.remove(...COLOR_BLIND_THEME_CLASS_NAMES);
    if (specialTheme !== 'none') {
      root.classList.add('special-theme-' + specialTheme);
      if (specialTheme === 'colorblind') {
        root.classList.add('colorblind-theme-' + normalized.colorBlindTheme);
      }
    }

    root.classList.toggle('hide-theme-icon', normalized.specialThemeIcon === false);

    root.classList.remove(...ACCENT_CLASS_NAMES);
    if (specialTheme === 'none' && normalized.popupAccent !== 'sage') {
      root.classList.add('accent-' + normalized.popupAccent);
    }

    currentSettings = normalized;
  }

  function mergeAndApply(settings) {
    const nextSettings = normalizeThemeSettings({
      ...currentSettings,
      ...settings
    });
    applyThemeSettings(nextSettings);
    writeCachedSettings(nextSettings);
  }

  applyThemeSettings(currentSettings);

  if (typeof browser === 'undefined' || !browser?.storage?.sync) {
    return;
  }

  browser.storage.sync.get(DEFAULT_THEME_SETTINGS)
    .then((settings) => mergeAndApply(settings))
    .catch(() => {});

  if (browser.storage?.onChanged?.addListener) {
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') {
        return;
      }

      const nextSettings = {};
      THEME_KEYS.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(changes, key)) {
          nextSettings[key] = changes[key].newValue;
        }
      });

      if (Object.keys(nextSettings).length > 0) {
        mergeAndApply(nextSettings);
      }
    });
  }
})();
