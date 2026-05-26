# Changelog

## 5.1.0

### User Highlights

- New Click & Clip automation can step through interactive pages, capture repeated states such as tabs, accordions, load-more flows, pagination, and sidebars, then export the results without manually copying each view.
- Batch Processing has a redesigned flow with clearer capture choices, picked-link reuse, and output options for ZIP files, individual Markdown files, or one combined Markdown document.
- The new opt-in Interpreter workflow can run configured AI prompts against a clipped page and insert the responses back into the Markdown or title before export.
- Interpreter providers now include Azure OpenAI and Hugging Face, with a richer provider/model picker, remote provider presets, and export warnings when AI-generated content may be sent onward.
- Built-in highlighting lets you mark text or page elements, reopen a highlights manager, and include saved highlights in clipped Markdown.

### Technical Notes

- **Click & Clip Automation**: Added in-page interaction capture, persisted service-worker sessions, page/element conversion paths, automatic finalization when tabs close, and deterministic E2E fixtures for tabs, accordions, load-more, pagination, and SPA-sidebar flows.
- **Batch Processing Redesign**: Reworked the popup batch UI around capture method and output format cards, preserved batch choices in local storage, added combined-document template rendering, and improved background progress/cancel handling.
- **Interpreter Workflow**: Added shared interpreter utilities, provider/model configuration, prompt placeholder parsing and stripping safeguards, service-worker LLM request routing, popup run controls, export confirmations, and unit coverage for request building and response parsing.
- **Provider Presets**: Added bundled and remotely refreshable provider presets through `providers.json`, including Azure OpenAI and Hugging Face request families alongside existing OpenAI-compatible, Anthropic, and Ollama-style providers.
- **Highlights System**: Added the content highlighter, local highlight state/index storage, context-menu actions, popup controls, a highlights manager page, clip integration, and unit coverage for highlight normalization and persistence.
- **Localization, Branding, and Release UX**: Localized the new batch, Click & Clip, Interpreter, and highlight strings across supported locales, added an i18n parity audit script, renamed the extension display text to "Webpage to Markdown Clipper", added third-party theme affiliation disclaimers, and wired release highlights into the update-notification path.

## 5.0.0

### User Highlights

- Clips can now be sent to custom Webhook Targets, with configurable HTTP methods, headers, JSON body templates, popup actions, and clearer server error summaries.
- MarkSnip's interface now supports display-language selection, including Auto plus English, Spanish, French, German, Italian, Brazilian Portuguese, Simplified Chinese, Japanese, Korean, and Hindi.
- A new Element Picker lets you manually choose part of the current page from the popup or context menu, then review the Markdown in the popup or copy it directly.
- Context menus are more configurable: choose which right-click actions are visible, while settings are grouped into clearer sections with better search behavior and wrapped-row spacing.
- Template variables are more flexible with `:ascii`, `:slugify`, `:lowercase`, `:uppercase`, chainable filters, and `publishedTime` date formatting for cleaner filenames and metadata.

### Technical Notes

- **Webhook Targets**: Added `webhookTargets` and `defaultWebhookBodyTemplate` options, shared webhook rendering helpers, popup send/dropdown integration, service-worker fetch handling with timeout support, templated headers/body values, metadata propagation for excerpt/byline/keywords/published time, structured response summarization, and webhook unit/integration coverage.
- **Interface Localization**: Added locale catalogs for `en`, `es`, `fr`, `de`, `it`, `pt_BR`, `zh_CN`, `ja`, `ko`, and `hi`, changed manifest strings and command descriptions to `__MSG_*__` values, exposed locale messages to extension pages, and added a shared i18n runtime for the popup, options page, guide, content overlays, notifications, batch overlays, and context menus.
- **Element Picker and Context Menus**: Added default element-picker options, an in-page picker overlay with parent/child/reselect controls, offscreen selected-element conversion, popup quick-action state handling, copy-or-review completion modes, a context-menu activation path, and per-item context-menu visibility settings.
- **Template Pipeline**: Moved template replacement and filename cleanup into shared utilities used by the service worker, added chainable filter parsing, `publishedTime` formatting, longest-key matching safeguards, and expanded template-processing tests.
- **Options, Library, and UI Polish**: Grouped settings into semantic subgroups, added language and webhook controls, refined options search matching, improved toggle wrapping and transitions, capped Library retention at 1,000 items, and avoided numeric parsing that could unexpectedly trim saved clips.
- **Release Assets and Coverage**: Refreshed store screenshots and added or expanded i18n, webhook, element-picker, options-search, context-menu, Library, template, popup, and command-download regression coverage.

## 4.6.0

### User Highlights

- Collapsed FAQ answers and other hidden article sections are now kept by default. Turn on Skip Hidden Content when you want a strict visible-only clip.
- MathML now exports as TeX, so equations from math-heavy pages stay readable instead of flattening into mashed-together text.
- Code examples keep their line breaks on pages that build code blocks out of spans and `<br>` tags.
- Filename cleanup can now replace blocked characters with your own text, like `_` or `-`, across downloads, image paths, Library exports, and Obsidian paths.
- Firefox clipping avoids the stray fallback tab, and shorter Obsidian sends can go straight through the Advanced URI data path without using the clipboard.

### Technical Notes

- **Hidden Content Recovery**: Added `skipHiddenContent` as an option, defaulting to hidden content included. Readability scoring stays anchored to visible content while hidden content from matched source anchors is restored into the extracted article, and the content script removes hidden nodes only when the option is enabled.
- **MathML and Code Conversion**: Added shared MathML-to-TeX conversion for native MathML, MathJax MathML scripts, `data-mathml` containers, and Turndown fallback handling. Shared code-block extraction now preserves `br` and span-based newlines in both cleanup and preserve-code-formatting paths.
- **Filename Replacement Pipeline**: Added `disallowedCharReplacement` to defaults, options UI, guide documentation, template substitution, image filename generation, generated downloads, Library exports, and Obsidian folder/title handling.
- **Obsidian Send Path**: Added shared Obsidian Advanced URI helpers that use inline `data` transport when the payload fits and fall back to clipboard transport for larger Markdown, with explicit clipboard-copy failure detection.
- **Firefox Clipping Bridge**: Added popup-managed Firefox offscreen bridge, service-worker readiness tracking, native offscreen support detection, and fallback retry behavior so Firefox clipping does not open an extra extension tab when the popup bridge is ready.
- **Notifications and Store Prompts**: Added a one-time review request after successful exports, browser-specific store review URLs, priority ordering that keeps support milestone cards ahead of review prompts, and a clearer **Quick Ask** notification eyebrow.
- **Regression Coverage**: Added a Firefox verification workflow, focused Firefox live smoke test, live Markdown snapshot capture tooling, MathML and WeChat code-block E2E fixtures, hidden-content recovery tests, filename replacement tests, Obsidian transport tests, and notification priority tests.

## 4.5.0

### User Highlights

- The popup can now use Copy to Clipboard or Send to Assistant as its main action, with built-in targets for ChatGPT, Claude, and Perplexity plus custom assistant URLs.
- A new OpenAI special theme joins the extension, and the popup can show a one-click light/dark theme toggle in the header.
- Settings are easier to navigate with a reorganized Exports & Integrations area, grouped popup behavior controls, and cleaner code-block settings.
- Clipping now fails more gracefully on restricted browser pages, with clearer popup messaging instead of CSP-related errors.
- Permissions and privacy guidance is more complete across the guide and settings, with clearer explanations of what MarkSnip can access and why.

### Technical Notes

- **Assistant Send Flow**: Added `copy` and `sendTo` popup primary actions, built-in ChatGPT/Claude/Perplexity targets, custom HTTPS assistant URL templates with `{prompt}` validation, and a configurable URL-length cap that falls back to clipboard plus assistant landing-page launch.
- **OpenAI Theme & Theme Toggle**: Added an OpenAI special theme across popup, options, and guide surfaces, plus a popup header theme toggle that can be enabled or hidden from settings. Added cached theme bootstrap loading so the popup can apply the last-used theme earlier during startup.
- **Options Information Architecture**: Reorganized the Downloads area into **Exports & Integrations**, grouped related popup and code-block controls, moved the clips-folder setting closer to download settings, and added settings search coverage for the new assistant and theme controls.
- **Restricted Page Handling**: The popup now detects restricted tabs earlier and shows a clearer message instead of attempting injection that can trigger CSP violations or failed clipping flows.
- **Permissions & Manifest Hardening**: Expanded permissions documentation and guide coverage for core browser permissions, and removed `guide/guide.html` from `web_accessible_resources` so only the page-context capture script remains exposed.
- **Regression Coverage**: Added unit, integration, and end-to-end coverage for assistant target settings, popup startup assets, guide discoverability, and restricted-tab popup behavior.

## 4.4.0

### User Highlights

- Popup exports now support Markdown, plain text, HTML, PDF, and Print, with a configurable default format.
- New Site Rules add per-site clipping overrides for templates, images, downloads, and table formatting.
- First-run onboarding and Permissions & Privacy guidance are now clearer, including an Agent Bridge preflight explainer.
- New Color Blind themes add Deuteranopia, Protanopia, and Tritanopia variants across the extension.
- The popup and settings now include shortcut help, live template previews, better search feedback, and reading-time counts.

### Technical Notes

- **Popup Export Formats**: Added popup split-button actions for plain text, HTML, PDF, and Print, plus a configurable default popup export format in Settings and print-specific popup assets.
- **Site Rules**: Added ordered wildcard URL matching with first-match-wins overrides for templates, image behavior, downloads folders, and table formatting across the clipping pipeline.
- **Onboarding & Trust UX**: Open the guide with a welcome banner on first install, added Permissions & Privacy guidance in the guide and settings, and inserted an Agent Bridge preflight explainer before requesting optional native messaging access.
- **Accessibility Themes**: Added Color Blind special themes with Deuteranopia, Protanopia, and Tritanopia variants, a theme-icon visibility toggle, and follow-up fixes for Claude and Perplexity theme icons.
- **Popup & Settings Polish**: Added a popup keyboard shortcuts modal, collapsible live template previews, better settings search result context, a shared min-read counter mode, and smoother themed popup loading.
- **Quality Gates & Release Flow**: Added ESLint-backed CI quality gates, refreshed store screenshot assets, and updated release workflow plumbing for automated release builds.

## 4.3.0

### User Highlights

- The popup now has a Markdown Preview toggle, so you can switch from editing to a rendered preview without leaving MarkSnip.
- MarkSnip now includes special Claude, Perplexity, Avatar: The Last Airbender, and Ben 10 themes across the popup, settings, and guide.
- The Library feels more polished, with skeleton loading, smoother transitions, richer clip metadata, delete animations, and more export options.
- Clipping is more reliable on tricky pages, including wrapped FAQ layouts, repeated-section docs, and ARIA-based tables that previously lost structure.
- Agent Bridge setup is smoother in Chrome: native messaging is requested only when you enable the feature, with a one-time reload when Chrome needs it.

### Technical Notes

- **Popup Preview Mode**: Added a lazy-loaded Markdown preview renderer in the popup with safe link handling, GitHub-style preview assets, and theme-aware rendering.
- **Theme Expansion**: Added app-wide special theme support for Claude, Perplexity, ATLA, and Ben 10, including coordinated popup/options/guide styling and mascot header treatments.
- **Popup UX Polish**: Reworked popup loading and navigation with skeleton states, shared view transitions, metadata badges, delete animations, and a Library export dropdown for ZIP, individual files, or copied links.
- **Extraction Recovery**: Restored wrapped FAQ headings, rebuilt semantic tables from ARIA table markup, and expanded regression coverage for repeated-section recovery edge cases.
- **Agent Bridge Permission Flow**: Moved `nativeMessaging` to `optional_permissions`, added runtime permission requests with clearer settings states, and reload the extension once after grant when Chrome needs to rebind native messaging.
- **Release Tooling**: Automated changelog extraction for GitHub releases and updated release prep coverage around manifest permission handling and popup startup assets.

## 4.2.1

### User Highlights

- Agent Bridge companion downloads are now available for Windows, macOS, and Linux instead of Windows only.
- Agent Bridge setup is clearer in Settings, with a built-in setup guide, platform-specific install commands, and clearer connection states.
- Batch Processing can now be turned off in Settings if you do not want bulk URL clipping controls in the popup.
- The popup starts faster by deferring heavy editor theme assets, notification loading, and non-critical startup work.

### Technical Notes

- **Cross-Platform Agent Bridge**: Added macOS and Linux native companion packaging, OS-specific install/uninstall paths, and updated release assets and setup docs so the bridge works beyond Windows.
- **Agent Bridge Settings UX**: Refined the Agent Bridge card with richer status states, host-version display, permission/connection feedback, and platform-aware install command copying.
- **Batch Processing Toggle**: Added a first-class `batchProcessingEnabled` option that hides batch entry points when disabled and blocks batch runs at the service-worker layer.
- **Popup Startup Performance**: Deferred CodeMirror theme CSS and notification-host loading, cached startup dependencies, and added a popup benchmark harness plus startup regression coverage.

## 4.2.0

### User Highlights

- MarkSnip now includes a local Library in the popup so you can keep saved clips in the browser and revisit them later.
- The new Library can save clips automatically when the popup opens or manually on demand, and it can export all saved clips as a ZIP.
- A new Agent Bridge lets local tools pull markdown from your current tab through the MarkSnip companion CLI instead of downloads.
- Settings are easier to navigate with a refreshed sidebar, clearer category grouping, and dedicated sections for Library and Agent Bridge controls.
- Popup actions are clearer, with better Library visibility, improved manual-save messaging, and cleaner header controls.

### Technical Notes

- **Popup Library**: Added local-only Library storage, save/export actions, retention controls, and shared state helpers for managing saved clip snapshots.
- **Agent Bridge Companion**: Added a native messaging bridge, desktop companion binaries, install docs, and service-worker support for CLI-driven captures of the current tab.
- **Options IA Refresh**: Reworked the options sidebar action layout and added first-class Library and Agent Bridge settings with connection status and local-only guidance.
- **Popup UX Polish**: Improved Library badge/header behavior, manual save states, and popup control presentation around the new Library workflow.
- **Coverage & Packaging**: Added unit and end-to-end coverage for Library and Agent Bridge behavior, plus release workflow updates and native companion docs.

## 4.1.4

### User Highlights

- MarkSnip now includes a built-in User Guide, so help is available directly inside the extension.
- Settings search is more consistent and easier to reuse across the extension's help and configuration experiences.
- Clipping and markdown export behavior are more consistent behind the scenes, especially around selections, templates, URLs, and code blocks.
- Download handling is more reliable when resolving tracked exports and filename conflicts.
- Real-world website regression coverage is stronger, making live-site breakages easier to detect and diagnose. This makes your user experience better!

### Technical Notes

- **In-Extension User Guide**: Added a bundled first-class User Guide and exposed it through the extension package for easier onboarding and discovery.
- **Shared Search Core**: Extracted reusable search scoring so guide search and options search use the same matching logic.
- **Shared Clipping Utilities**: Moved template, URL, selection, hashtag, markdown-option, and code-block processing into shared modules used by the offscreen pipeline and tests.
- **Download Tracking Refactor**: Extracted service-worker download bookkeeping and filename conflict handling into shared tracker logic to reduce drift between runtime behavior and tests.
- **Regression Coverage Expansion**: Expanded fixture-backed E2E coverage and added live public site artifact baselines so failures can be compared against the last successful run.

## 4.1.3

### User Highlights

- Update notifications are easier to read, with clearer actions and simpler release summaries.
- Clipping is more reliable on some documentation pages with repeated section headings.

### Technical Notes

- **Notification Card Refresh**: Redesigned in-product update and milestone notifications with a richer floating card layout, clearer actions, and improved highlight readability.
- **Milestone Celebration UI**: Added a dedicated support milestone hero with formatted export counts and celebratory visual treatment.
- **Clipping Reliability**: Improved repeated-section recovery on wrapped-heading layouts so extractions are less likely to start mid-article on structured docs pages.
- **Regression Coverage**: Expanded real-world extraction tests for repeated-section recovery edge cases to lock in the clipping fix.

## 4.1.2

### User Highlights

- MarkSnip can now show update and support notifications inside the extension.
- Settings are easier to search, reset, and understand.
- Batch exports are easier to manage with a better link picker, progress overlay, and cancel control.
- Clipping is more reliable on difficult pages.
- Keyboard navigation and page accessibility have been improved.

### Technical Notes

- **In-Product Notifications**: Added queued update and support milestone notifications with release-note links inside the extension.
- **Options Management**: Added settings search with stricter fallback matching, per-setting reset links, a global **Reset All** action, and clearer URL metadata guidance.
- **Batch Processing UX**: Improved the link picker, kept the popup open after batch start, and added an in-page progress overlay with a cancel button for running batches.
- **Clipping Reliability**: Added two-pass readability recovery for repeated-section pages, preserved legacy `baseURI` behavior with SPA-safe page URL fields, and fixed `saveAs` handling in blob fallback paths without mutating markdown options.
- **Accessibility & Packaging**: Bundled popup/options fonts locally, improved keyboard accessibility, and opened the options page in a browser tab by default.
- **Licensing**: Replaced the Apache License with the PolyForm Noncommercial License.

## 4.1.1

### User Highlights

- Selected text exports stay intact more reliably.
- Math content exports more cleanly when clipping selections.
- Settings now include a shortcut to leave a store review.

### Technical Notes

- **Selection Capture Fix**: Preserved selected HTML context during conversion to prevent broken markdown output from partial selections.
- **Math Output Normalization**: Normalized math rendering paths for cleaner markdown output when clipping selected content.
- **Regression Coverage**: Added unit tests for selection capture behavior to lock in the fix.
- **Options Sidebar**: Added a new **Leave Review** button under **Buy Me a Coffee** that automatically links to Chrome Web Store or Firefox Add-ons reviews based on the current browser.

## 4.1.0

### User Highlights

- New hashtag handling options let you keep, remove, or escape hashtags in your output.
- Math extraction is more reliable on supported pages.
- The popup now supports color mode, accent colors, and a compact layout.
- The options page has a cleaner design with clearer controls and examples.

### Technical Notes

- **Markdown Controls**: Added configurable hashtag handling modes (`keep`, `remove`, `escape`) with safer conversion behavior and dedicated tests.
- **Math Extraction Reliability**: Improved LaTeX capture flow before DOM snapshotting and fixed KaTeX handling in offscreen processing when annotation fallback is missing.
- **Popup Appearance Settings**: Added popup customization controls for color mode, accent colors, and compact mode.
- **Options Page Refresh**: Redesigned the options page to align with the popup design system and improved sidebar behavior.
- **Options UX Improvements**: Added visual examples for table settings, a CodeMirror editor theme selector, helper hints for key toggles, and a donation button in the sidebar.
- **Test Coverage**: Added end-to-end URL snapshot batch coverage with fixtures for real-world pages.

## 4.0.7

### User Highlights

- Character, word, and token counts are more accurate.
- The popup editor now shows a rotating stats badge.
- Code block exports are cleaner, with an optional language-detection toggle.
- Clipping no longer risks mutating the live page during export.

### Technical Notes

- **Token Estimation**: Improved accuracy with per-content-type segmentation that better handles URLs, code blocks, markdown syntax, and non-ASCII characters.
- **Editor Stats**: Added a cycling character/word/token counter badge to the editor header in the popup.
- **Code Blocks**: Cleaned up `<pre>` code block conversion and added a controllable language-detection toggle in settings.
- **Clipping Reliability**: Fixed a bug where the content script could mutate the live DOM during clipping; now operates on a cloned document.
- **Docs**: Added Firefox installation instructions and linked them from the README.

## 4.0.6

### User Highlights

- Firefox now uses a more consistent clipping flow.
- Article extraction works better on difficult pages.

### Technical Notes

- **Firefox Support**: Unified offscreen processing across Chrome and Firefox by loading `offscreen/offscreen.html` in Firefox and routing clipping through the same messaging path.
- **Firefox Build Output**: Updated browser manifest generation so Firefox bundles required background scripts and excludes the Chrome-only `offscreen` permission.
- **Readability Improvements**: Cherry-picked Safari Reader heuristics into `Readability.js` for better article extraction on difficult pages.
- **Regression Coverage**: Added end-to-end tests for command routing and download behavior (`command-download-regression.spec.js`).

## 4.0.5

### User Highlights

- Downloads are less likely to conflict with other extensions.
- Empty or missing page titles no longer create blank Markdown filenames.
- The user guide and in-app copy were refreshed.

### Technical Notes

- **Download Reliability**: Fixed filename conflicts with other extensions by only handling downloads positively identified as MarkSnip-owned.
- **Filename Safety**: Added fallbacks for empty/missing titles to prevent invalid or blank `.md` filenames.
- **Quality**: Added targeted unit tests for filename conflict handling and empty-title edge cases.
- **Docs/UI**: Refreshed README and user guide content and made small popup header styling updates.

## 4.0.4

### User Highlights

- Popup buttons have a cleaner, more polished look.
- Picking links from a page feels smoother and easier to use.

### Technical Notes

- **UI Modernization**: Updated popup buttons with the Inter font and a new batch processing icon for a more polished look.
- **Batch Link Picker**: Improved the user experience of the link picker with smooth animations and a consistent sage-green color palette.

## 4.0.3

### User Highlights

- Firefox compatibility has been improved.
- Copy and save keyboard shortcuts are more reliable.
- The Strip Images option now works correctly for images inside tables.

### Technical Notes

- **Firefox Compatibility**: Added `data_collection_permissions` and updated the extension ID for better Firefox support.
- **Reliability**: Improved keyboard shortcut reliability for "Copy as Markdown" and "Save as Markdown" actions.
- **Bug Fix**: Fixed "Strip Images" option not being honored when images were inside tables.
- **Build System**: Added support for generating browser-specific manifest files for Chrome and Firefox.

## 4.0.2

### User Highlights

- The settings page and popup have a cleaner, more polished layout.
- The Send to Obsidian button now hides itself when the integration is turned off.
- Several popup options now use more compact inline toggles.
- Batch processing controls are easier to use.
- The popup preview shows more content at once.

### Technical Notes

- Redesigned settings panel and popup with improved layout and polished styling
- Hide "Send to Obsidian" button when Obsidian integration is disabled in settings
- Converted "Download Images" and "Include Template" options to iOS-style inline toggles to save space
- Updated batch processing UI: replaced radio buttons with iOS-style switches for "Zip file" and "Individual files" options, and resized the "Pick Links from Page" button
- Increased popup window height to show more of the markdown preview

## 4.0.1

### User Highlights

- Download filenames no longer get overridden by other extensions.
- Keyboard shortcuts work again after the Manifest V3 migration.
- A new visual link picker helps you choose links for batch processing.

### Technical Notes

- Fixed download filename being overridden by other extensions
- Fixed keyboard shortcuts not working after Manifest V3 migration
- Added visual link picker feature for selecting links on a page during batch processing
- Fixed link picker data passing when popup closes
- Fixed script re-injection errors in link picker
- Fixed CI build workflow: excluded unnecessary files from Chrome package and improved npm compatibility

## 4.0.0

### User Highlights

- The popup got a full redesign with a more modern layout.
- MarkSnip can now send clipped content directly to Obsidian.
- Batch URL processing was added, with progress feedback during export.
- Batch URLs now stay saved between popup sessions.
- Markdown conversion and Obsidian sending are more reliable.

### Technical Notes

- Complete popup UI overhaul with a modern, redesigned interface
- Added **Send to Obsidian** button with the official Obsidian logo
- Fixed Obsidian integration: resolved CSP violations, corrected URI scheme, added `.md` extension to filenames, and improved clipboard reliability
- Added batch URL processing with progress indicator and markdown link output support
- Persisted batch processing URLs across popup sessions so they don't disappear on close
- Updated Readability.js to the latest version
- Added a comprehensive automated test suite for core markdown conversion functionality
- Fixed critical markdown conversion bugs found via test suite
- Various popup layout, styling, and UX improvements

## 3.9.0

- Fixed referenced link styles not working properly
- Added suggested keyboard shortcuts for copy-tab and copy-selection actions in the manifest

## 3.8.0

- Fixed subfolder downloads that were broken after the Manifest V3 migration

## 3.7.0

- Fixed image downloads broken after Manifest V3 migration

## 3.6.0

- Fixed "Strip Links" option not removing links from clipped content
- Fixed table handling for complex cell content such as lists
- Fixed links in tables being dropped when the strip links option was disabled
- Added "Copy" buttons to batch processing UI and improved batch UI layout

## 3.5.0

- Rebranded extension from MarkDownload to **MarkSnip** with updated name, icons, and options
- Migrated extension to **Manifest V3** (service worker, offscreen document, updated permissions)
- Fixed multiple issues introduced by the MV2 → MV3 migration (context menus, scripting API, clipboard)
- Refactored script execution and content retrieval to use service worker messaging
- Added option to preserve or clean code block formatting (indentation/whitespace)
- Added `highlight.min.js` for automatic code language detection in code blocks
- Added table formatting options in the options page
- Updated extension description to mention core libraries (Turndown & Readability)

## 3.4.0

- Fixed extra spaces in titles which could cause issues (thanks @rickdoesdev !)
- Fixed an issue with image paths in some circumstances (thanks @rickdoesdev !)
- Added parametersizations for "mixed-kebab" and "mixed_snake" which retain original casing but replace spaces (thanks @NSHenry !)
  - Also added a special "obsidian-cal" parameterization which is the same as "mixed-kebab" with duplicate `-` removed for additional compatibility with the Obsidian Consistent Attachment Location plugin (thanks @NSHenry !)
- Added lowecase and uppercase options to parameterizations (thanks @redxtech !)
- Updated Turndown to v7.1.3 (thanks @WeHat !)
- Updated Readability to v0.5.0 (thanks @WeHat !)
- Fixed some issues with code block parsing and formatting (thanks @WeHat !)
- Fixed an issue with some sites missing a proper title (thanks @WeHat !)
- Fixed an issue with bad base urls causing issues with links in certain circumstances (thanks @WeHat !)
- Fixed an issue with readability removing everything in certain circumstances (thanks @WeHat !)
- Send properly configured title to the Obsidian integration (thanks @nekton39 !)
- Updates to the README (thanks @2gn and @eugenesvk !)

## 3.3.0

- Remove hidden content before exporting (thanks @nhaouari !). This allows you to use a different extension (e.g. Adblock) to hide elements that would otherwise clutter up your export
- Fixes for Obsidian integration in Safari (thanks @aancw !)
- Keep a few more HTML tags that have no markdown equivalent (`u`, `ins`, `del`, `small`, `big`) (thanks @mnaoumov !)
- Add support for KaTeX formulas parsing (thanks @mnaoumov !)
- Fixed saving for options when imported from file (and show a little 'saved' indicator)
- Added a toggle for downloading images in the context menu and popup
- Added a link to the options in the popup
- Added some basic error handling to the popup
- Changes to how html inside code blocks is handled (thanks @mnaumov !)
- Treat codehilite without specified language as plaintext (thanks @mnaoumov !)
- Ensure sequential line breaks in <pre> are preserved in code blocks (thanks @mnaumov !)
- Update user guide link in README to point to GitHub
- Added keyboard shortcuts to copy selection / current tab to obsidian (user-definable in browsers that support that) (thanks @legolasdimir and @likeablob !)
- Select multiple tabs (hold crtl/cmd) then copy all tab urls as a markdown link list via keyboard shortcut or context menu (thanks @romanPrignon !)
- Allow users to include custom text such like `{date:YYYY-MM-DD}/`` in their Obsidian Folder Name setting (thanks @likeablob !)
- Fixed a small typo in the user guide (thanks @devon-research !)
- Fix for missing headings on sites like Substack (thanks @eactisgrosso !)
- Add support for websites using MathJax 3 (thanks @LeLocTai !)

## 3.2.1

- Bugfixes for the Obsidian integration (thanks @aancw !)

## 3.2.0

- Added a basic Obsidian integration using the [Obsidian Advanced URI](https://vinzent03.github.io/obsidian-advanced-uri/) plugin and clipboard (thanks @aancw !)
- Keep sub/sup tags so that superscript and subscript text is retained (thanks @mnaoumov !)
- Added a keyboard shortcut for copy selection as markdown (nothing by default, needs to be user-configured)
- Added a new context menu item to copy all tabs as a list of markdown links
- Updated dependencies

## 3.1.0

- Firefox for Android (nightly) support
- Updated Readability and Turndown
- Added GitHub-flavoured Markdown (GFM) plugin to Turndown (adds some mardown table support)
- Added support for MathJax -> LaTeX (thanks @LeLocTai)
- Disallow slashes in title text replacements
- Suport for Open Graph meta tags as variables (which use `property` instead of `key`)
- Fixed an issue with regex characters like `|` in date formats
- Resolved an extra slash in file name causing images to fail to download in chromium browsers
- Added some support to parse pre elements as code blocks (supports syntax highlighting on GitHub, but not much else yet)
- Added option to enable or disable the context menus
- Added some extra keyboard shortcuts. These can be customised, depending on your browser
  - <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> opens the popup (as it has in previous versions)
  - <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> downloads the current tab as markdown, bypassing the popup
  - <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> copies the current tab as markdown to the clipboard, bypassing the popup
  - <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> copies the current tabs URL as a markdown link to the clipboard
- Added support for template variables having different casing using `:` followed by the casing type. For example, for an article titled "Different Types of Casing":
  - `{pageTitle:pascal}` — "DifferentTypesOfCasing"
  - `{pageTitle:camel}` — "differentTypesOfCasing"
  - `{pageTitle:kebab}` — "different-types-of-casing"
  - `{pageTitle:snake` — "different_types_of_casing"
- Added support for rending italics in double underscores (`__`). This isn't valid MarkDown (will output as **bold**), but it's useful for people copying to Roam
- Support image download as base64 embedded urls, directly in the markdown file
- Added some extra variables related to the url beyond the existing `{baseURI}`:
  - `{origin}` - The origin of the URL, that is its scheme, its domain and its port
  - `{host}` - The domain (that is the _hostname_) followed by (if a port was specified) a `:` and the _port_ of the URL.
  - `{hostname}` - The domain of the URL.
  - `{port}` - The port number of the URL.
  - `{protocol}` - The protocol scheme of the URL, including the final `':'`.
  - `{pathname}` - An initial `'/'` followed by the path of the URL, not including the query string or fragment.
  - `{search}` - The URL's parameter string; if any parameters are provided, this string includes all of them, beginning with the leading `?` character.

## 3.0.0

- Theme revamp
- Utilizing CodeMirror for the Markdown Editor
- Strip Disallowed characters on title and image filenames during text replacement
- Add "Download Type" option, to attempt to resolve conflicts with other Download extensions (and to help support Safari!)
- Add options for stripping images and links
- Fixes around downloading images and getting correct urls in the markdown
- Added meta keywords support for the text replace
- Added text replace support for meta tags in general
- Add option to disable turndown escaping
- Strip out 'red dot' special characters
- Added an option to specify a download path (within the downloads folder). Thanks to Nikita Lukianets!

## 2.4.1

- Add option for Obsidian-style image links (when downloading images with the markdown file)
- Downloaded images should download relative to the markdown file in the case where you specify a subfolder in your title template
- Front- and back-matter template will no longer put in extra lines on Opera
- Adjusted the way text is copied to the clipboard

## 2.4.0

- Fixed typo on options page (thanks Dean Cook)
- Added option to download images alongside the markdown file
  - Also added the ability to add a prefix to the images you download, so you can, for example, save them in a subfolder
  - If your browser has the option to always show a save as dialog enabled, you might get a dialog for every image. Sorry about that 😬
- Updated turndown to 7.0.1 and allowed iframes to be kept in the markdown
- Added a new `{pageTitle}` option for template replacement (there are many websites where the `{title}` and `{pageTitle}` actually differ)
- Added a context menu option to copy a tab URL as a markdown link, using the title configured in settings as the link title (i.e. `[<custom title>](<URL>)`)
- Added custom disallowed characters to strip from titles (set to `[]#^` by default for maximum compatibility with Obsidian)
- Added some focus styling so you can tell what is focused
- Auto-focus the download button (you can now `ctrl`+`shift`+`M`, Enter to quickly download a file)
- Template title (and image prefixes) now allow forward slashes (`/`) so that files get saved to a subfolder

## 2.3.1

- Added template toggle to Firefox's tab context menu

## 2.3.0

- Added contexy menus for copying markdown
- Added options to clip selected text
- Include front-matter/back-matter templates in popup
- Add title templating
- Added keyboard shortcut to show the popup
- Added option to always show Save As
- Added context menus to download all tabs as markdown

## 2.2.0

- Added extension options
  - Turndown (markdown generation) options
  - Front-matter/back-matter templates with replacement variables from page metadata (and date)

## 2.1.6

- Replace non-breaking spaces in filenames

## 2.1.5

- Fixed an issue with sites with invalid `<base>` tags

## 2.1.4

- Fixed issue with relative links [#1](https://github.com/deathau/markdownload/issues/1)

## 2.1.3

- Fist change, forked from [enrico-kaack/markdown-clipper](https://github.com/enrico-kaack/markdown-clipper)
- Added URL to markdown output ([#5](https://github.com/deathau/markdownload/issues/5))
