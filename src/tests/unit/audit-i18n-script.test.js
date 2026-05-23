const fs = require('fs');
const path = require('path');

const {
  buildI18nAudit,
  formatAuditText
} = require('../../scripts/audit-i18n');

const TMP_LOCALES_DIR = path.join(__dirname, '../tmp/audit-i18n-script/_locales');

function writeCatalog(locale, catalog) {
  const localeDir = path.join(TMP_LOCALES_DIR, locale);
  fs.mkdirSync(localeDir, { recursive: true });
  fs.writeFileSync(
    path.join(localeDir, 'messages.json'),
    `${JSON.stringify(catalog, null, 2)}\n`,
    'utf8'
  );
}

describe('audit-i18n script', () => {
  beforeEach(() => {
    fs.rmSync(path.dirname(TMP_LOCALES_DIR), { force: true, recursive: true });
  });

  afterAll(() => {
    fs.rmSync(path.dirname(TMP_LOCALES_DIR), { force: true, recursive: true });
  });

  test('groups common and locale-specific exact-English candidates', () => {
    writeCatalog('en', {
      brandName: { message: 'MarkSnip' },
      sharedFallback: { message: 'Needs translation' },
      spanishOnlyFallback: { message: 'Spanish fallback' },
      translatedEverywhere: { message: 'Copy' }
    });
    writeCatalog('es', {
      brandName: { message: 'MarkSnip' },
      sharedFallback: { message: 'Needs translation' },
      spanishOnlyFallback: { message: 'Spanish fallback' },
      translatedEverywhere: { message: 'Copiar' }
    });
    writeCatalog('fr', {
      brandName: { message: 'MarkSnip' },
      sharedFallback: { message: 'Needs translation' },
      spanishOnlyFallback: { message: 'Traduit en francais' },
      translatedEverywhere: { message: 'Copier' }
    });

    const report = buildI18nAudit({
      allowedExactKeys: ['brandName'],
      localesDir: TMP_LOCALES_DIR
    });

    expect(report.hasKeyParityIssues).toBe(false);
    expect(report.commonUntranslated.map((entry) => entry.key)).toEqual([
      'sharedFallback'
    ]);
    expect(
      report.locales.es.additionalUntranslatedExact.map((entry) => entry.key)
    ).toEqual(['spanishOnlyFallback']);
    expect(report.locales.fr.additionalUntranslatedExact).toEqual([]);
    expect(report.locales.es.allowedExactEnglish.map((entry) => entry.key)).toEqual([
      'brandName'
    ]);
  });

  test('reports missing and extra locale keys', () => {
    writeCatalog('en', {
      existingKey: { message: 'Existing' },
      missingFromLocale: { message: 'Missing' }
    });
    writeCatalog('de', {
      existingKey: { message: 'Vorhanden' },
      extraLocaleKey: { message: 'Extra' }
    });

    const report = buildI18nAudit({ localesDir: TMP_LOCALES_DIR });

    expect(report.hasKeyParityIssues).toBe(true);
    expect(report.locales.de.missingKeys).toEqual(['missingFromLocale']);
    expect(report.locales.de.extraKeys).toEqual(['extraLocaleKey']);
    expect(formatAuditText(report)).toContain('Key parity issues');
  });
});
