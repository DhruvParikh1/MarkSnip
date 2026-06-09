const fs = require("fs");
const path = require("path");

const SRC_DIR = path.resolve(__dirname, "..");
const BUILD_ROOT = path.join(SRC_DIR, ".build");

const EXCLUDED_NAMES = new Set([
  "node_modules",
  "tests",
  "web-ext-artifacts",
  ".build",
  "coverage",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "jest.config.js",
  "playwright.config.js",
  "scripts",
  "test-artifacts",
  "test-results"
]);

function copyDirectory(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (EXCLUDED_NAMES.has(entry.name)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
}

function writeManifest(targetDir, manifest) {
  const manifestPath = path.join(targetDir, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function createChromeManifest(sourceManifest) {
  const chromeManifest = JSON.parse(JSON.stringify(sourceManifest));
  chromeManifest.background = { service_worker: "service-worker.js" };
  delete chromeManifest.browser_specific_settings;
  return chromeManifest;
}

function createFirefoxManifest(sourceManifest) {
  const firefoxManifest = JSON.parse(JSON.stringify(sourceManifest));
  firefoxManifest.background = {
    scripts: [
      "browser-polyfill.min.js",
      "shared/i18n.js",
      "background/moment.min.js",
      "shared/notifications.js",
      "shared/default-options.js",
      "shared/template-utils.js",
      "shared/url-utils.js",
      "shared/zip-utils.js",
      "shared/highlight-state.js",
      "shared/interpreter-utils.js",
      "shared/agent-bridge-state.js",
      "shared/context-menus.js",
      "service-worker.js"
    ]
  };
  // Remove Chrome-only permissions
  firefoxManifest.permissions = firefoxManifest.permissions.filter(
    p => p !== 'offscreen'
  );

  return firefoxManifest;
}

function buildBrowserManifests(options = {}) {
  const srcDir = options.srcDir || SRC_DIR;
  const buildRoot = options.buildRoot || BUILD_ROOT;
  const logger = options.logger || console.log;
  const chromeDir = path.join(buildRoot, "chrome");
  const firefoxDir = path.join(buildRoot, "firefox");
  const sourceManifestPath = path.join(srcDir, "manifest.json");
  const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));

  fs.rmSync(buildRoot, { recursive: true, force: true });

  copyDirectory(srcDir, chromeDir);
  copyDirectory(srcDir, firefoxDir);

  const chromeManifest = createChromeManifest(sourceManifest);
  const firefoxManifest = createFirefoxManifest(sourceManifest);

  writeManifest(chromeDir, chromeManifest);
  writeManifest(firefoxDir, firefoxManifest);

  logger("Generated browser manifests:");
  logger(`- Chrome:  ${path.relative(srcDir, path.join(chromeDir, "manifest.json"))}`);
  logger(`- Firefox: ${path.relative(srcDir, path.join(firefoxDir, "manifest.json"))}`);

  return {
    chromeDir,
    firefoxDir,
    chromeManifest,
    firefoxManifest
  };
}

function main() {
  buildBrowserManifests();
}

if (require.main === module) {
  main();
}

module.exports = {
  createChromeManifest,
  createFirefoxManifest,
  buildBrowserManifests
};
