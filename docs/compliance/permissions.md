# MarkSnip - Extension Permissions

This document explains every permission declared in `src/manifest.json`, why it is needed, and what the extension would lose without it.

---

## Core Permissions

### `activeTab`
**Why it's needed:** Grants temporary access to the currently active tab when the user clicks the MarkSnip icon or triggers a keyboard shortcut. This allows the extension to read the page's URL, title, and content for conversion.

**Without it:** The extension could not read the current page to convert it to Markdown.

**Privacy note:** Access is granted only for the moment the user explicitly invokes the extension. The extension cannot silently read tabs in the background.

---

### `downloads`
**Why it's needed:** Used by the "Save as Markdown" feature to write `.md` files (and `.zip` archives for batch exports) to the user's local filesystem via the browser's built-in download mechanism.

**Without it:** Saving Markdown files to disk would not be possible.

---

### `storage`
**Why it's needed:** Persists the user's settings (template strings, formatting preferences, Obsidian vault config, Agent Bridge settings, etc.) so they survive page reloads and browser restarts.

**Without it:** All settings would reset every time the extension reloads; no preferences could be saved.

---

### `contextMenus`
**Why it's needed:** Adds MarkSnip actions to the right-click context menu for pages, selected text, links, images, and browser tabs, letting users clip content without opening the popup.

**Without it:** Context menu entries (for example, "Copy selection as Markdown") would not appear.

---

### `clipboardWrite`
**Why it's needed:** Allows the extension to write Markdown text directly to the system clipboard when the user chooses a "Copy as Markdown" action instead of downloading a file.

**Without it:** All "Copy to clipboard" commands would silently fail.

---

## Optional Permissions

### `nativeMessaging`
**Why it's needed:** Enables communication with the optional **Agent Bridge CLI**, a locally installed helper program that lets AI agents and automation scripts request Markdown clipping programmatically. The CLI runs entirely on the user's own machine; no data leaves the device.

**How it's granted:** MarkSnip requests this permission only when the user turns on **Agent Bridge** in Settings.

**Without it:** The Agent Bridge feature (programmatic/API access for AI agents) would not function. All other clipping features remain unaffected.

**Privacy note:** This permission is only active after the user opts into Agent Bridge and has installed the local CLI. No external servers are contacted.

---

## Core Permissions

### `scripting`
**Why it's needed:** Injects the content script (`contentScript/pageContext.js`) into web pages at clip time to extract the page's DOM, selected text, and metadata (title, author, date, etc.) for Markdown conversion.

**Without it:** The extension could not access page content to convert it.

---

### `offscreen`
**Why it's needed:** Creates a hidden offscreen document used for clipboard operations in Manifest V3 service workers, which do not have direct DOM access. The offscreen document acts as a bridge to write text to the clipboard.

**Without it:** Clipboard write operations initiated from the background service worker would fail in Chromium-based browsers.

---

## Host Permissions

### `<all_urls>`
**Why it's needed:** Allows MarkSnip to clip pages across arbitrary sites instead of a fixed allowlist. This also covers user-triggered workflows that operate beyond a single popup click, such as keyboard shortcuts, context-menu actions, clipping multiple highlighted tabs, and batch processing URLs in newly opened tabs.

**Without it:** The extension could only clip content from sites explicitly listed in the manifest, and multi-tab or batch workflows would fail on pages that had not granted temporary access.

**Privacy note:** This does **not** mean the extension passively monitors all websites. Scripts are injected only when the user actively triggers a clip action on a page. No browsing data is collected or transmitted.

---

## Web Accessible Resources

### `contentScript/pageContext.js`
A script injected into pages at clip time to capture page context (for example, `document.URL`, metadata, selected text). It is declared as a web-accessible resource so it can be loaded into the page's own JavaScript context for accurate DOM access.

### `guide/guide.html`
The in-extension guide/help page. It is opened directly with the extension's own URL and does **not** need to be exposed as a web-accessible resource to arbitrary websites.

---

## Data & Privacy Summary

| Permission | Sends data externally? | User-triggered only? |
|---|---|---|
| `activeTab` | No | Yes |
| `downloads` | No (local filesystem) | Yes |
| `storage` | No (browser storage) | Yes |
| `contextMenus` | No | Yes |
| `clipboardWrite` | No (local clipboard) | Yes |
| `nativeMessaging` | No (local CLI only) | Yes (opt-in feature, requested on enable) |
| `scripting` | No | Yes |
| `offscreen` | No | Yes |
| `<all_urls>` | No | Yes |

All content processing happens locally on your device by default. MarkSnip does not transmit page content, clipboard data, or browsing history to any external server unless you opt in to a feature that does so: the Interpreter feature sends a clip's Markdown to an LLM provider you configure, and the Agent Bridge feature sends it to a local CLI on your own machine. Both are off by default.
