# MarkSnip

Webpage to Markdown clipper for Chrome and Firefox. Save pages as clean Markdown, copy content to clipboard, or send notes directly to Obsidian.

[Chrome Web Store](https://chromewebstore.google.com/detail/marksnip-markdown-web-cli/kcbaglhfgbkjdnpeokaamjjkddempipm?hl=en) | [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/marksnip-markdown-web-clipper/) | [User Guide](docs/guides/user-guide.md) | [Agent Bridge Walkthrough](docs/guides/agent-bridge.md) | [Changelog](CHANGELOG.md) | [Privacy Policy](PRIVACY.md)

[![MarkSnip Promo](media/marksnip_promo.gif)](https://www.youtube.com/watch?v=IO6PjI79drY)

## Why MarkSnip

MarkSnip is a Manifest V3 fork of [MarkDownload](https://github.com/deathau/markdownload/) focused on reliable markdown conversion, batch workflows, and browser-store compatibility.

Core pipeline:

- Content extraction with Mozilla Readability
- HTML to Markdown conversion with Turndown
- Optional template injection, image handling, and formatting controls

## Features

- Clip full page or selected text
- Edit markdown before saving
- Export popup clips as Markdown, plain text, HTML, or PDF
- Batch conversion from URL lists or markdown links
- Save batch output as ZIP or individual files
- Context menu actions for page, selection, links, images, and tabs
- Obsidian integration (via Advanced URI + clipboard)
- Agent Bridge CLI for pulling the current page's markdown from local tools
- Keyboard shortcuts for common actions
- Rich markdown formatting controls (headings, fences, links, images, tables, templates)
- Import/export extension settings as JSON

## Install

### Chrome (stable)

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/marksnip-markdown-web-cli/kcbaglhfgbkjdnpeokaamjjkddempipm?hl=en).

### Firefox (stable)

Firefox support is available starting in `v4.0.6`.
Install from [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/marksnip-markdown-web-clipper/).

### Load unpacked (local build)

1. `cd src`
2. `npm ci`
3. `npm run build:manifests`
4. Open `chrome://extensions`
5. Enable Developer mode
6. Click **Load unpacked** and select `src/.build/chrome`

### Firefox (local build)

1. `cd src`
2. `npm ci`
3. `npm run build:manifests`
4. Load `src/.build/firefox` as a temporary add-on in Firefox, or package with release workflow.

## Usage

1. Click the extension icon to open the popup.
2. Choose **Selection** or **Document**.
3. Review/edit markdown.
4. Use the popup export button to save the clip as Markdown, plain text, HTML, or PDF, or use **Copy All** / **Send to Obsidian** for Markdown-based workflows.

Agent Bridge:

1. Install the matching companion archive from GitHub Releases.
2. Run the install command for your OS:

   Windows: `.\marksnip.exe install-host`
   macOS/Linux: `./marksnip install-host`
3. Enable **Agent Bridge** in MarkSnip Settings and approve the native messaging prompt if it appears.
4. Run the clip command for your OS:

   Windows: `.\marksnip.exe clip`
   macOS/Linux: `./marksnip clip`

For local unpacked Chrome testing on Windows, you can first look up the unpacked extension ID with:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\find-unpacked-chrome-extension-id.ps1 -ExtensionPath .\src
```

On any platform, you can also copy the unpacked extension ID from `chrome://extensions`.

Then install the host against that unpacked ID:

Windows:

```powershell
cd .\native
.\marksnip.exe install-host --chrome-extension-id <YOUR_UNPACKED_EXTENSION_ID>
```

macOS/Linux:

```bash
cd ./native
./marksnip install-host --chrome-extension-id <YOUR_UNPACKED_EXTENSION_ID>
```

If the unpacked Chrome extension ID changes later, rerun that command with the new ID.

Batch mode:

1. Open popup and click the batch icon.
2. Paste URLs (or markdown links), one per line.
3. Choose **ZIP** or **Individual** output.
4. Click **Convert All URLs**.

## Keyboard Shortcuts

- `Alt+Shift+M`: Open popup
- `Alt+Shift+D`: Download current tab as markdown
- `Alt+Shift+C`: Copy current tab as markdown
- `Alt+Shift+L`: Copy current tab URL as markdown link

Additional commands (selection, selected tabs, Obsidian actions) are available in browser shortcut settings.
Popup export format settings do not change these shortcut or context-menu actions; they remain Markdown-based.

## Development

All development commands run from `src/`.

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
cd src
npm ci
```

### Common scripts

- `npm test` - Run Jest test suite
- `npm run test:unit` - Unit tests
- `npm run test:integration` - Integration tests
- `npm run test:e2e` - Playwright end-to-end tests
- `npm run build:manifests` - Generate browser-specific manifests
- `npm run build` - Firefox package build via `web-ext`
- `npm run build:chrome` - Chrome ZIP package
- `npm run build:all` - Build Firefox + Chrome artifacts
- `go build ./cmd/marksnip` and `go build ./cmd/marksnip-native-host` from `native/` - Agent Bridge companion

## Build Architecture

`src/manifest.json` is the source manifest. `src/scripts/generate-browser-manifests.js` generates:

- `src/.build/chrome/manifest.json` with `background.service_worker`
- `src/.build/firefox/manifest.json` with `background.scripts`

The `.build/` directory is generated output and should not be committed.

Root-level `dist/` is for packaged release artifacts, and root-level `tmp/` is for ignored local scratch work.

## Release Flow

GitHub Actions workflow [`.github/workflows/build-release.yml`](.github/workflows/build-release.yml):

1. Runs unit and integration tests.
2. Builds browser manifests.
3. Packages:
   - `marksnip-chrome-<version>.zip`
   - `marksnip-firefox-<version>.xpi`
   - `marksnip-agent-bridge-windows-amd64.zip`
   - `marksnip-agent-bridge-macos-amd64.tar.gz`
   - `marksnip-agent-bridge-macos-arm64.tar.gz`
   - `marksnip-agent-bridge-linux-amd64.tar.gz`
4. Publishes a GitHub Release on `v*` tags (or manual `workflow_dispatch`).

To publish:

1. Update version in `src/manifest.json`
2. Update `CHANGELOG.md`
3. Tag and push, for example:

```bash
git tag v4.0.4
git push origin v4.0.4
```

## Project Structure

```text
.
|- docs/
|  |- compliance/
|  |  `- permissions.md
|  |- guides/
|  |  |- agent-bridge.md
|  |  `- user-guide.md
|  `- store-screenshots/
|- src/
|  |- background/
|  |- contentScript/
|  |- offscreen/
|  |- options/
|  |- popup/
|  |- scripts/
|  |- shared/
|  |- tests/
|  `- manifest.json
|- tools/
|  `- find-unpacked-chrome-extension-id.ps1
|- CHANGELOG.md
|- PRIVACY.md
`- LICENSE
```

## Privacy

MarkSnip does not send clipped page content to external servers. See [PRIVACY.md](PRIVACY.md) for details.

## Credits

- Original [MarkDownload](https://github.com/deathau/markdownload/) by deathau
- [Readability.js](https://github.com/mozilla/readability)
- [Turndown](https://github.com/mixmark-io/turndown)
- [CodeMirror](https://codemirror.net/)
- [highlight.js](https://highlightjs.org/)

## License

This project is licensed under the [PolyForm Noncommercial License](LICENSE).
