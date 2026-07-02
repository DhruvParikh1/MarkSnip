const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { Blob: NodeBlob } = require('buffer');
const { buildBrowserManifests } = require('./generate-browser-manifests');
const { generateReleaseHighlights } = require('./generate-release-highlights');
const { createStoredZipBlob } = require('../shared/zip-utils');

const SRC_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(SRC_DIR, '..', 'dist');

function getPackageDependencies() {
  return [
    {
      name: 'Node.js',
      required: true,
      reason: 'runs the package build script and manifest generators'
    },
    {
      name: 'npm dependencies',
      required: true,
      reason: 'provides the local build tools from src/node_modules'
    },
    {
      name: 'web-ext',
      required: true,
      reason: 'builds the Firefox extension package'
    }
  ];
}

function getDefaultWebExtBin(srcDir = SRC_DIR) {
  const executableName = process.platform === 'win32' ? 'web-ext.cmd' : 'web-ext';
  return path.join(srcDir, 'node_modules', '.bin', executableName);
}

function verifyPackageDependencies(options = {}) {
  const srcDir = options.srcDir || SRC_DIR;
  const webExtBin = options.webExtBin || getDefaultWebExtBin(srcDir);
  const missing = [];

  if (!fs.existsSync(path.join(srcDir, 'package.json'))) {
    missing.push('src/package.json');
  }

  if (!fs.existsSync(path.join(srcDir, 'node_modules'))) {
    missing.push('src/node_modules; run npm install from src/');
  }

  if (!fs.existsSync(webExtBin)) {
    missing.push(`web-ext executable at ${webExtBin}`);
  }

  if (missing.length > 0) {
    throw new Error(`Cannot build extension packages. Missing: ${missing.join(', ')}`);
  }

  return {
    webExtBin
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function generateReleaseHighlightsForPackaging(options = {}) {
  const srcDir = options.srcDir || SRC_DIR;
  const manifestPath = options.manifestPath || path.join(srcDir, 'manifest.json');
  const outputPath = options.outputPath || path.join(srcDir, 'shared', 'release-highlights.json');
  const existingAsset = fs.existsSync(outputPath) ? readJson(outputPath) : null;
  const releaseOptions = {
    manifestPath,
    outputPath
  };
  const fixtureChangelogPath = path.join(srcDir, 'CHANGELOG.md');

  if (fs.existsSync(fixtureChangelogPath)) {
    releaseOptions.changelogPath = fixtureChangelogPath;
  }

  const nextAsset = generateReleaseHighlights(releaseOptions);

  if (existingAsset && JSON.stringify({
    ...existingAsset,
    generatedAt: nextAsset.generatedAt
  }) === JSON.stringify(nextAsset)) {
    fs.writeFileSync(outputPath, `${JSON.stringify(existingAsset, null, 2)}\n`, 'utf8');
    return existingAsset;
  }

  return nextAsset;
}

function walkFiles(rootDir, currentDir = rootDir, files = []) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(rootDir, fullPath, files);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    files.push({
      fullPath,
      relativePath: path.relative(rootDir, fullPath).replace(/\\/g, '/')
    });
  }

  return files;
}

async function writeZipPackage(sourceDir, outputPath) {
  const files = walkFiles(sourceDir).map(({ fullPath, relativePath }) => ({
    filename: relativePath,
    content: fs.readFileSync(fullPath)
  }));
  const zipBlob = createStoredZipBlob(files);
  const zipBytes = Buffer.from(await zipBlob.arrayBuffer());

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, zipBytes);
  return outputPath;
}

function listFirefoxPackages(distDir, chromePackage, edgePackage) {
  if (!fs.existsSync(distDir)) {
    return [];
  }

  const excluded = new Set([chromePackage, edgePackage].map(packagePath => path.resolve(packagePath)));
  return fs.readdirSync(distDir)
    .filter(filename => filename.endsWith('.zip'))
    .map(filename => path.join(distDir, filename))
    .filter(packagePath => !excluded.has(path.resolve(packagePath)))
    .sort();
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...(options.env || {})
    },
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

async function buildExtensionPackages(options = {}) {
  const srcDir = options.srcDir || SRC_DIR;
  const distDir = options.distDir || DIST_DIR;
  const logger = options.logger || console.log;
  const run = options.runCommand || runCommand;
  const previousBlob = global.Blob;

  if (typeof global.Blob === 'undefined') {
    global.Blob = NodeBlob;
  }

  try {
    const { webExtBin } = verifyPackageDependencies(options);
    const manifestPath = path.join(srcDir, 'manifest.json');
    const version = readJson(manifestPath).version;

    logger('Generating release highlights and browser manifests...');
    generateReleaseHighlightsForPackaging({ srcDir, manifestPath });
    const buildResult = buildBrowserManifests({
      srcDir,
      buildRoot: path.join(srcDir, '.build'),
      logger
    });

    fs.mkdirSync(distDir, { recursive: true });

    const chromePackage = path.join(distDir, `marksnip-chrome-${version}.zip`);
    const edgePackage = path.join(distDir, `marksnip-edge-${version}.zip`);

    logger(`Writing Chrome package: ${path.relative(srcDir, chromePackage)}`);
    await writeZipPackage(buildResult.chromeDir, chromePackage);
    logger(`Writing Edge package: ${path.relative(srcDir, edgePackage)}`);
    await writeZipPackage(buildResult.chromeDir, edgePackage);

    logger('Writing Firefox package with web-ext...');
    run(webExtBin, [
      'build',
      '--source-dir',
      buildResult.firefoxDir,
      '--artifacts-dir',
      distDir,
      '--overwrite-dest'
    ], {
      cwd: srcDir,
      env: {
        NO_UPDATE_NOTIFIER: '1'
      }
    });

    const firefoxPackages = listFirefoxPackages(distDir, chromePackage, edgePackage);

    return {
      version,
      distDir,
      chromePackage,
      edgePackage,
      firefoxPackages,
      firefoxSourceDir: buildResult.firefoxDir
    };
  } finally {
    if (typeof previousBlob === 'undefined') {
      delete global.Blob;
    } else {
      global.Blob = previousBlob;
    }
  }
}

async function main() {
  const result = await buildExtensionPackages();
  console.log('Extension packages ready:');
  console.log(`- Chrome/Edge source: ${path.relative(SRC_DIR, path.join(SRC_DIR, '.build', 'chrome'))}`);
  console.log(`- Firefox source: ${path.relative(SRC_DIR, result.firefoxSourceDir)}`);
  console.log(`- Chrome ZIP: ${path.relative(SRC_DIR, result.chromePackage)}`);
  console.log(`- Edge ZIP: ${path.relative(SRC_DIR, result.edgePackage)}`);
  if (result.firefoxPackages.length === 0) {
    console.log(`- Firefox package: ${path.relative(SRC_DIR, result.distDir)}`);
  } else {
    result.firefoxPackages.forEach(packagePath => {
      console.log(`- Firefox ZIP: ${path.relative(SRC_DIR, packagePath)}`);
    });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  buildExtensionPackages,
  generateReleaseHighlightsForPackaging,
  getDefaultWebExtBin,
  getPackageDependencies,
  listFirefoxPackages,
  verifyPackageDependencies,
  writeZipPackage
};
