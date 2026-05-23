const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '..');
const LOCALES_DIR = path.join(SRC_DIR, '_locales');
const DEFAULT_LOCALE = 'en';

const DEFAULT_ALLOWED_EXACT_KEYS = [
  'actionTitle',
  'popupExportHtml',
  'optionsHeaderTitle',
  'optionsThemeClaude',
  'optionsThemePerplexity',
  'optionsThemeOpenAI',
  'optionsThemeAtla',
  'optionsThemeBen10',
  'optionsEditorThemeDracula',
  'optionsEditorThemeMaterial',
  'optionsEditorThemeMonokai',
  'optionsEditorThemeNord',
  'optionsEditorThemeSolarized',
  'optionsEditorThemeTwilight',
  'optionsExportHtml',
  'optionsExportPdf',
  'optionsCustomTargetUrlPlaceholder',
  'batchOverlayStatusTitle',
  'optionsAppearanceLanguageEnglish',
  'optionsAppearanceLanguageSpanish',
  'optionsAppearanceLanguageChinese',
  'optionsAppearanceLanguageJapanese',
  'optionsAppearanceLanguageKorean',
  'optionsAppearanceLanguageHindi',
  'optionsAppearanceLanguageGerman',
  'optionsAppearanceLanguageFrench',
  'optionsAppearanceLanguagePortugueseBR',
  'optionsAppearanceLanguageItalian'
];

function printHelp() {
  console.log(`Usage: npm run audit:i18n -- [options]

Audits non-English locale catalogs against _locales/en/messages.json.

Options:
  --json                   Print the full audit as JSON.
  --include-invariants     Include allowed exact-English keys in text output.
  --fail-on-untranslated   Exit 1 when untranslated exact-English candidates exist.
  --locale <ids>           Audit only comma-separated locale ids, e.g. de,fr,pt_BR.
  --allow-key <key>        Treat an additional key as intentionally exact-English.
  --help                   Show this help text.

By default, the script exits 1 only for broken key parity or invalid catalogs.`);
}

function parseArgs(argv) {
  const options = {
    allowedExactKeys: [],
    failOnUntranslated: false,
    includeInvariants: false,
    json: false,
    locales: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--include-invariants') {
      options.includeInvariants = true;
    } else if (arg === '--fail-on-untranslated') {
      options.failOnUntranslated = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--locale' || arg === '--locales') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a comma-separated locale list`);
      }
      options.locales = splitCsv(value);
      index += 1;
    } else if (arg.startsWith('--locale=')) {
      options.locales = splitCsv(arg.slice('--locale='.length));
    } else if (arg.startsWith('--locales=')) {
      options.locales = splitCsv(arg.slice('--locales='.length));
    } else if (arg === '--allow-key') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--allow-key requires a message key');
      }
      options.allowedExactKeys.push(value);
      index += 1;
    } else if (arg.startsWith('--allow-key=')) {
      options.allowedExactKeys.push(arg.slice('--allow-key='.length));
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function splitCsv(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${path.relative(SRC_DIR, filePath)}: ${error.message}`);
  }
}

function listLocaleIds(localesDir = LOCALES_DIR, defaultLocale = DEFAULT_LOCALE) {
  return fs
    .readdirSync(localesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((locale) => locale !== defaultLocale)
    .sort();
}

function getCatalogMessage(catalog, key) {
  const value = catalog[key]?.message;
  return typeof value === 'string' ? value : '';
}

function toEntry(key, englishCatalog) {
  return {
    key,
    message: getCatalogMessage(englishCatalog, key)
  };
}

function findMissingKeys(referenceKeys, catalog) {
  return referenceKeys.filter((key) => !Object.prototype.hasOwnProperty.call(catalog, key));
}

function findExtraKeys(referenceCatalog, catalog) {
  return Object.keys(catalog)
    .filter((key) => !Object.prototype.hasOwnProperty.call(referenceCatalog, key))
    .sort();
}

function createLocaleReport(locale, catalog, englishCatalog, englishKeys, allowedExactKeys) {
  const missingKeys = findMissingKeys(englishKeys, catalog);
  const extraKeys = findExtraKeys(englishCatalog, catalog);
  const untranslatedExact = [];
  const allowedExactEnglish = [];

  for (const key of englishKeys) {
    if (!Object.prototype.hasOwnProperty.call(catalog, key)) {
      continue;
    }

    if (getCatalogMessage(catalog, key) !== getCatalogMessage(englishCatalog, key)) {
      continue;
    }

    const entry = toEntry(key, englishCatalog);
    if (allowedExactKeys.has(key)) {
      allowedExactEnglish.push(entry);
    } else {
      untranslatedExact.push(entry);
    }
  }

  return {
    locale,
    keyCount: Object.keys(catalog).length,
    missingKeys,
    extraKeys,
    untranslatedExact,
    allowedExactEnglish
  };
}

function buildI18nAudit(options = {}) {
  const localesDir = options.localesDir || LOCALES_DIR;
  const defaultLocale = options.defaultLocale || DEFAULT_LOCALE;
  const allowedExactKeys = new Set([
    ...DEFAULT_ALLOWED_EXACT_KEYS,
    ...(options.allowedExactKeys || [])
  ]);
  const englishPath = path.join(localesDir, defaultLocale, 'messages.json');
  const englishCatalog = readJsonFile(englishPath);
  const englishKeys = Object.keys(englishCatalog);
  const localeIds = options.locales || listLocaleIds(localesDir, defaultLocale);
  const reports = {};

  for (const locale of localeIds) {
    const catalogPath = path.join(localesDir, locale, 'messages.json');
    if (!fs.existsSync(catalogPath)) {
      throw new Error(`Locale catalog not found: ${path.relative(SRC_DIR, catalogPath)}`);
    }

    reports[locale] = createLocaleReport(
      locale,
      readJsonFile(catalogPath),
      englishCatalog,
      englishKeys,
      allowedExactKeys
    );
  }

  const commonUntranslatedKeys = englishKeys.filter((key) =>
    localeIds.every((locale) =>
      reports[locale].untranslatedExact.some((entry) => entry.key === key)
    )
  );
  const commonUntranslated = commonUntranslatedKeys.map((key) => toEntry(key, englishCatalog));

  for (const locale of localeIds) {
    const commonKeys = new Set(commonUntranslatedKeys);
    reports[locale].additionalUntranslatedExact = reports[locale].untranslatedExact.filter(
      (entry) => !commonKeys.has(entry.key)
    );
  }

  const hasKeyParityIssues = localeIds.some(
    (locale) => reports[locale].missingKeys.length > 0 || reports[locale].extraKeys.length > 0
  );
  const hasUntranslated = localeIds.some(
    (locale) => reports[locale].untranslatedExact.length > 0
  );

  return {
    defaultLocale,
    defaultKeyCount: englishKeys.length,
    localeIds,
    allowedExactKeys: [...allowedExactKeys].sort(),
    commonUntranslated,
    hasKeyParityIssues,
    hasUntranslated,
    locales: reports
  };
}

function formatEntry(entry) {
  return `${entry.key}: ${entry.message}`;
}

function formatListSection(lines, title, entries) {
  lines.push('');
  lines.push(`${title} (${entries.length})`);

  if (entries.length === 0) {
    lines.push('  None');
    return;
  }

  for (const entry of entries) {
    lines.push(`  ${formatEntry(entry)}`);
  }
}

function formatKeyParitySection(lines, report) {
  const localesWithIssues = report.localeIds.filter((locale) => {
    const localeReport = report.locales[locale];
    return localeReport.missingKeys.length > 0 || localeReport.extraKeys.length > 0;
  });

  if (localesWithIssues.length === 0) {
    return;
  }

  lines.push('');
  lines.push('Key parity issues');
  for (const locale of localesWithIssues) {
    const localeReport = report.locales[locale];
    lines.push(`  ${locale}`);
    if (localeReport.missingKeys.length > 0) {
      lines.push(`    Missing: ${localeReport.missingKeys.join(', ')}`);
    }
    if (localeReport.extraKeys.length > 0) {
      lines.push(`    Extra: ${localeReport.extraKeys.join(', ')}`);
    }
  }
}

function formatAuditText(report, options = {}) {
  const lines = [];

  lines.push(`i18n audit against ${report.defaultLocale} (${report.defaultKeyCount} keys)`);
  lines.push('');
  lines.push('Summary');
  for (const locale of report.localeIds) {
    const localeReport = report.locales[locale];
    lines.push(
      [
        `  ${locale}:`,
        `${localeReport.keyCount} keys,`,
        `${localeReport.missingKeys.length} missing,`,
        `${localeReport.extraKeys.length} extra,`,
        `${localeReport.untranslatedExact.length} exact-English candidates,`,
        `${localeReport.allowedExactEnglish.length} allowed exact-English`
      ].join(' ')
    );
  }

  formatKeyParitySection(lines, report);
  formatListSection(
    lines,
    'Common exact-English candidates in every audited locale',
    report.commonUntranslated
  );

  lines.push('');
  lines.push('Additional exact-English candidates by locale');
  for (const locale of report.localeIds) {
    const entries = report.locales[locale].additionalUntranslatedExact;
    lines.push(`  ${locale} (${entries.length})`);
    for (const entry of entries) {
      lines.push(`    ${formatEntry(entry)}`);
    }
  }

  if (options.includeInvariants) {
    lines.push('');
    lines.push('Allowed exact-English keys by locale');
    for (const locale of report.localeIds) {
      const entries = report.locales[locale].allowedExactEnglish;
      lines.push(`  ${locale} (${entries.length})`);
      for (const entry of entries) {
        lines.push(`    ${formatEntry(entry)}`);
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    return 0;
  }

  const report = buildI18nAudit(options);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    process.stdout.write(formatAuditText(report, options));
  }

  if (report.hasKeyParityIssues) {
    return 1;
  }

  if (options.failOnUntranslated && report.hasUntranslated) {
    return 1;
  }

  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_ALLOWED_EXACT_KEYS,
  buildI18nAudit,
  formatAuditText,
  parseArgs,
  runCli
};
