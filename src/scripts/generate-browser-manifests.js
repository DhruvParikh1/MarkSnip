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

// Firefox background pages must load the same shared modules that the Chrome
// service worker pulls in with importScripts(...). Derive the list from
// service-worker.js itself so the two can never drift apart.
function extractImportScriptPaths(serviceWorkerSource) {
  const match = String(serviceWorkerSource).match(/importScripts\(([\s\S]*?)\);/);
  if (!match) {
    throw new Error("Could not find an importScripts(...) block in service-worker.js");
  }

  const files = [];
  const stringLiteral = /["']([^"']+)["']/g;
  let entry;
  while ((entry = stringLiteral.exec(match[1])) !== null) {
    files.push(entry[1]);
  }

  if (files.length === 0) {
    throw new Error("The importScripts block in service-worker.js lists no files");
  }

  return files;
}

function readFirefoxBackgroundScripts(srcDir = SRC_DIR) {
  const serviceWorkerSource = fs.readFileSync(path.join(srcDir, "service-worker.js"), "utf8");
  return extractImportScriptPaths(serviceWorkerSource);
}

function createFirefoxManifest(sourceManifest, options = {}) {
  const firefoxManifest = JSON.parse(JSON.stringify(sourceManifest));
  const backgroundScripts = options.backgroundScripts || readFirefoxBackgroundScripts(options.srcDir);
  firefoxManifest.background = {
    scripts: [...backgroundScripts, "service-worker.js"]
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
  const firefoxManifest = createFirefoxManifest(sourceManifest, { srcDir });

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
  extractImportScriptPaths,
  readFirefoxBackgroundScripts,
  buildBrowserManifests
};
