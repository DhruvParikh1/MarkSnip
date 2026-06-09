# MarkSnip User Guide

## Basic Usage

Click the MarkSnip icon in the browser toolbar to open the popup. The current page is run through Mozilla Readability to extract the main content, then converted to Markdown with Turndown. You can edit the result in the built-in CodeMirror editor before saving.

### Quick Settings

At the top of the popup you'll find two toggle switches:

- **Images** — when on, images are downloaded alongside your Markdown file (requires Downloads API mode).
- **Template** — when on, the front-matter and back-matter templates are prepended/appended to the output. Customize the templates in [Extension Options → Front/Back Templates](#frontback-templates).

### Clipping Selection vs. Full Document

Below the toggles is a segmented control with two buttons:

- **Selection** — clips only the text you selected on the page before opening the popup.
- **Document** — clips the entire page content (default if nothing is selected).

### Editing the Title

The **Title** field determines the filename of the downloaded Markdown file. It is populated automatically from the title template (configurable in options) but you can edit it freely before saving.

### Markdown Preview

The main area of the popup is a syntax-highlighted Markdown editor (powered by CodeMirror). You can make quick edits here before downloading.

Above the editor are two buttons:

- **Copy All** — copies all the Markdown to your clipboard.
- **Copy Selection** — appears when you select text _inside the editor_, allowing you to copy just the highlighted portion.

### Action Buttons

At the bottom of the popup:

| Button                 | Action                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Download**           | Exports the popup clip using your configured default format: Markdown (`.md`), Plain text (`.txt`), HTML (`.html`), or PDF.                                            |
| **Download Selection** | Appears when text is selected inside the editor; exports only the selected text using the same popup default format.                                                     |
| **Send to Obsidian**   | Copies the Markdown to the clipboard and opens Obsidian via the Advanced URI plugin to create a new note (only visible when Obsidian integration is enabled in settings). Images remain remote links; attachment files are not copied into the vault. |

The popup export format setting only affects popup exports. Context menus, keyboard download shortcuts, batch exports, Library exports, Agent Bridge, and Obsidian actions remain Markdown-based.

---

## Batch Processing

Click the batch icon (📄) in the popup header to switch to batch mode.

### Adding URLs

Paste URLs into the text area, one per line. You can also use Markdown link syntax:

```
https://example.com/page1
https://example.com/page2
[Page Title](https://example.com/page3)
```

### Pick Links from Page

Click **Pick Links from Page** to enter the visual link picker. This injects an overlay onto the current page that lets you click on links to select them. A floating toolbar shows how many links you've selected, and a **Done** button sends them back to the batch URL list.

### Output Format

Use the toggle to choose between:

- **ZIP file** — all converted Markdown files are bundled into a single `.zip` download.
- **Individual** — each page is downloaded as a separate `.md` file.

### Converting

Click **Convert All URLs** to start processing. A progress bar shows the current status including a count and the URL being processed.

---

## Context Menu

Right-click on a page to access MarkSnip actions under the context menu. These options are available when **Enable Context Menus** is turned on in settings.

### Download Actions

| Menu Item                      | Context       | Description                                                             |
| ------------------------------ | ------------- | ----------------------------------------------------------------------- |
| Download Tab as Markdown       | Page / Tab    | Downloads the current tab as a Markdown file without opening the popup. |
| Download Selection as Markdown | Selected text | Downloads the highlighted text as Markdown.                             |
| Download All Tabs as Markdown  | Page / Tab    | Downloads every open tab in the current window as Markdown files.       |

### Copy Actions

| Menu Item                                    | Context       | Description                                                                                |
| -------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------ |
| Copy Tab as Markdown                         | Page          | Converts the entire page to Markdown and copies it to the clipboard.                       |
| Copy Selection as Markdown                   | Selected text | Converts the selection to Markdown and copies it.                                          |
| Copy Link as Markdown                        | Link          | Copies the right-clicked link as `[text](url)`.                                            |
| Copy Image as Markdown                       | Image         | Copies the right-clicked image as `![alt](src)`.                                           |
| Copy Tab URL as Markdown Link                | Page / Tab    | Copies the tab's URL as `[title](url)`.                                                    |
| Copy All Tab URLs as Markdown Link List      | Page / Tab    | Copies all open tab URLs as a Markdown link list.                                          |
| Copy Selected Tab URLs as Markdown Link List | Page / Tab    | Copies URLs from multi-selected tabs (hold <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>) as a link list. |

### Obsidian Actions

These items appear only when Obsidian integration is enabled:

| Menu Item                       | Context       | Description                                    |
| ------------------------------- | ------------- | ---------------------------------------------- |
| Send Text Selection to Obsidian | Selected text | Sends the selection to Obsidian as a new note. |
| Send Tab to Obsidian            | Page          | Sends the full page to Obsidian as a new note. |

### Toggle Options

At the bottom of the context menu you'll find checkboxes for **Include front/back template** and **Download Images**, allowing you to toggle these settings without opening the popup or the options page.

---

## Keyboard Shortcuts

Default shortcuts (customizable in your browser's extension shortcut settings):

| Shortcut                                     | Action                                |
| -------------------------------------------- | ------------------------------------- |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> | Open the MarkSnip popup               |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> | Download current tab as Markdown      |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> | Copy current tab as Markdown          |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | Copy current tab URL as Markdown link |

Additional commands are available but have no default shortcut. You can assign your own in the browser's shortcut settings:

- Copy current selection as Markdown
- Copy selected tabs as Markdown link list
- Copy current selection to Obsidian
- Copy current tab to Obsidian

---

## Extension Options

Open the options page by clicking the gear icon (⚙️) in the popup header, or by right-clicking the MarkSnip icon and selecting **Options**.

### Title Template

Controls the popup's title field and the resulting filename. Uses [Custom Text Substitutions](#custom-text-substitutions).

**Default:** `{pageTitle}`

### Downloads Subfolder

**Only available when [Download Mode](#download-mode) is "Downloads API".**

A subfolder within your browser's downloads folder where Markdown files are saved. Uses [Custom Text Substitutions](#custom-text-substitutions).

**Default:** _(empty)_

### Disallowed Characters

Characters that are automatically stripped from filenames, in addition to the system-reserved characters (`/ ? < > \ : * | "`).

**Default:** `[]#^` (for Obsidian compatibility)

### Disallowed Character Replacement

Optional text used in place of stripped filename characters. Leave this blank to keep the default strip behavior; use `_` or `-` to keep word boundaries when page titles contain slashes or other reserved characters.

**Default:** _(empty)_

### Front/Back Templates

Text prepended or appended to every clipped Markdown file. Useful for YAML front-matter or other metadata. Uses [Custom Text Substitutions](#custom-text-substitutions).

**Default front template:**

```yaml
---
created: {date:YYYY-MM-DDTHH:mm:ss} (UTC {date:Z})
tags: [{keywords}]
source: {pageURL}
author: {byline}
---

# {pageTitle}

> ## Excerpt
> {excerpt}

---
```

**Default back template:** _(empty)_

### Context Menus

Toggles the right-click context menu items on and off. Use **Visible Menu Items** to choose the individual MarkSnip actions that are allowed to appear. Browsers only show items that apply to where you right-click, such as page, selection, link, image, or tab menus.

**Default:** On, with all menu items visible

### Default Popup Export Format

Controls the popup's primary export buttons.

- **Markdown** â€” downloads the current popup clip as `.md`
- **Plain text** â€” downloads rendered plain text as `.txt`
- **HTML** â€” downloads a styled rendered HTML document as `.html`
- **PDF** â€” opens the existing print-to-PDF flow

This setting does **not** change context-menu downloads, keyboard download shortcuts, batch output, Library exports, Agent Bridge output, or Obsidian sends.

---

### Obsidian Integration

Enable this to show the **Send to Obsidian** button in the popup and the Obsidian actions in the context menu. Requires the [Advanced Obsidian URI](https://vinzent03.github.io/obsidian-advanced-uri/) community plugin to be installed in Obsidian.

- **Vault Name** — the name of your Obsidian vault (leave blank for the default vault).
- **Folder Name** — the folder inside the vault where notes are created (supports [Custom Text Substitutions](#custom-text-substitutions), e.g. `{date:YYYY-MM-DD}/`).

- Images sent with this action stay as remote links. The browser extension does not place attachment files inside the vault.

**Default:** Disabled

---

### Download Mode

| Mode                              | Description                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Downloads API** _(recommended)_ | Uses the browser's download API. Supports subfolders, image downloads, and Save As dialogs.                                                                          |
| **Content Link**                  | Falls back to a content link for downloading. More limited — disables image downloads and subfolders. Use this if the Downloads API conflicts with other extensions. |

### Show Save As Dialog

**Only available in Downloads API mode.**

Forces the browser's Save As dialog to appear for every download, regardless of your browser's default setting.

> **Note:** Not recommended when **Download Images** is on, as every individual image would trigger a dialog.

### Download Images

**Only available in Downloads API mode.**

When enabled, images are downloaded alongside the Markdown file. The Markdown output is adjusted to reference the local images rather than the remote URLs (depending on your [Image Style](#image-style) setting).

### Image ZIP Bundle

**Only available when Download Images is on in Downloads API mode.**

When enabled, MarkSnip downloads a single `.zip` archive containing the Markdown file and its image folders. If the Downloads API is unavailable, MarkSnip falls back to downloading image files individually.

### Image Folder Location

**Only available when Download Images is on.**

Controls where downloaded images are saved relative to the Markdown file:

- **Sidecar folder** _(default)_ — images go into a folder named after the Markdown file, such as `Page/photo.png` next to `Page.md`.
- **Same folder** — images are saved next to the Markdown file, such as `photo.png`.
- **Custom prefix** — uses the [Image Filename Prefix](#image-filename-prefix) template.

### Image Filename Prefix

**Only available when Download Images is on and Image Folder Location is Custom prefix.**

A prefix or subfolder for downloaded images. Uses [Custom Text Substitutions](#custom-text-substitutions). Including a `/` creates a subfolder.

Older settings that used a blank prefix now map to Same folder. Older settings that used `{pageTitle}/` keep the sidecar behavior.

---

## Markdown Conversion Options

### Heading Style

| Style           | Example                                       |
| --------------- | --------------------------------------------- |
| Setext          | `All About Dogs` followed by `==============` |
| Atx _(default)_ | `# All About Dogs`                            |

### Horizontal Rule Style

- `***`
- `---`
- `___` _(default)_

### Bullet List Marker

- `*`
- `-` _(default)_
- `+`

### Code Block Style

| Style              | Example                          |
| ------------------ | -------------------------------- |
| Indented           | Four-space indented code         |
| Fenced _(default)_ | Code wrapped in ` ``` ` or `~~~` |

### Preserve Code Block HTML Formatting

When enabled, preserves the original HTML formatting inside code blocks (useful for maintaining exact visual formatting). When disabled _(default)_, produces clean code blocks.

### Code Block Fence

**Only when Code Block Style is "Fenced".**

- ` ``` ` _(default)_
- `~~~`

### Emphasis (Italics) Delimiter

- `_italics_` _(default)_
- `*italics*`
- `__italics__` (non-standard — for Roam)

### Strong (Bold) Delimiter

- `**bold**` _(default)_
- `__bold__`

### Link Style

| Style               | Output                                                      |
| ------------------- | ----------------------------------------------------------- |
| Inlined _(default)_ | `[Google](http://google.com)`                               |
| Referenced          | `[Google]` with `[Google]: http://google.com` at the bottom |
| Strip Links         | `Google` (link removed)                                     |

### Link Reference Style

**Only when Link Style is "Referenced".**

- **Full:** `[Google][1]` → `[1]: http://google.com`
- **Collapsed:** `[Google][]` → `[Google]: http://google.com`
- **Shortcut:** `[Google]` → `[Google]: http://google.com`

### Image Style

| Style                      | Output                            | Requires Download Images |
| -------------------------- | --------------------------------- | ------------------------ |
| Original Source            | `![](http://example.com/img.jpg)` | No                       |
| Strip Images               | _(image removed)_                 | No                       |
| Pure Markdown _(default)_  | `![](folder/image.jpg)`           | Yes                      |
| Base64 Encoded             | `![](data:image/png;base64,...)`  | Yes                      |
| Obsidian Internal Embed    | `![[folder/image.jpg]]`           | Yes                      |
| Obsidian Embed (no folder) | `![[image.jpg]]`                  | Yes                      |

### Image Reference Style

**Only when Image Style is a Markdown style (not Obsidian-styled).**

- **Inlined** _(default)_: `![](address/of/image.jpg)`
- **Referenced**: `![][fig1]` with `[fig1]: address/of/image.jpg` at the bottom

### Escape Markdown Characters

Backslash-escapes special Markdown characters in the HTML source to prevent misinterpretation (e.g. `1. Hello world` inside an `<h1>` is escaped so it doesn't render as a list).

**Default:** On

### Hashtag Handling

Controls how hashtag-like words are written in clipped text. Useful for tools like Obsidian that treat `#tag` as a note tag.

- **Keep** _(default)_: keeps hashtags unchanged, e.g. `#research`
- **Remove #**: removes only the leading `#`, e.g. `#research` → `research`
- **Escape #**: writes hashtags as escaped markdown, e.g. `#research` → `\#research`

This only affects article text. Markdown syntax markers, code blocks, and inline code are preserved.

---

## Table Formatting Options

| Option                  | Description                                                  | Default |
| ----------------------- | ------------------------------------------------------------ | ------- |
| Strip Links from Tables | Removes hyperlinks from table cells, keeping only the text.  | On      |
| Strip Formatting        | Removes bold, italic, and other formatting from table cells. | Off     |
| Pretty Print Tables     | Adds proper spacing and column alignment.                    | On      |
| Center Text in Columns  | Centers text within table columns.                           | On      |

---

## Import / Export Settings

At the bottom of the options page you can:

- **Import** — restore settings from a previously exported JSON file.
- **Export** — save all current settings to a JSON file for backup or transfer to another browser.

---

## Custom Text Substitutions

The [Title Template](#title-template), [Downloads Subfolder](#downloads-subfolder), [Front/Back Templates](#frontback-templates), [Image Filename Prefix](#image-filename-prefix), and Obsidian Folder Name all support the following substitution variables:

### Article Metadata

| Variable               | Description                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| `{title}`              | Article title (as determined by Readability)                           |
| `{pageTitle}`          | Title of the actual page (`<title>` tag)                               |
| `{length}`             | Length of the article in characters                                    |
| `{excerpt}`            | Article description or short excerpt                                   |
| `{byline}`             | Author metadata                                                        |
| `{dir}`                | Content direction (e.g. `ltr`)                                         |
| `{baseURI}`            | Parsed document/base URI (legacy behavior)                             |
| `{pageURL}` / `{tabURL}` | Actual address-bar URL of the tab                                   |
| `{keywords}`           | Meta keywords, comma-separated                                         |
| `{keywords:SEPARATOR}` | Meta keywords with a custom separator (e.g. `{keywords: }` for spaces) |

### URL Components

| Variable     | Description                                         |
| ------------ | --------------------------------------------------- |
| `{origin}`   | Scheme + domain + port (e.g. `https://example.com`) |
| `{host}`     | Hostname + port                                     |
| `{hostname}` | Domain only                                         |
| `{port}`     | Port number                                         |
| `{protocol}` | Protocol with trailing `:` (e.g. `https:`)          |
| `{pathname}` | URL path (e.g. `/blog/post`)                        |
| `{search}`   | Query string including `?`                          |
| `{hash}`     | Fragment identifier including `#`                   |
| `{pageOrigin}` / `{pageHost}` / `{pageHostname}` / `{pagePort}` / `{pageProtocol}` / `{pagePathname}` / `{pageSearch}` / `{pageHash}` | URL components from `{pageURL}` |

### Date/Time

| Variable        | Description                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `{date:FORMAT}` | Current date/time. See the [Moment.js format reference](https://momentjs.com/docs/#/displaying/format/) for placeholders. |
| `{publishedTime:FORMAT}` | Article publication date metadata when provided by the page. Uses the same Moment.js format placeholders. |

### Meta Tags

Any `<meta>` tag value can be referenced. For example: `{og:image}`, `{og:description}`, or any other standard meta tag.

### Parameterizations

You can change the casing of any text variable (except `{date}` and `{keywords}`) by appending a colon and a casing style:

| Syntax                    | Style        | Example ("Different Types of Casing")       |
| ------------------------- | ------------ | ------------------------------------------- |
| `{variable:pascal}`       | PascalCase   | `DifferentTypesOfCasing`                    |
| `{variable:camel}`        | camelCase    | `differentTypesOfCasing`                    |
| `{variable:kebab}`        | kebab-case   | `different-types-of-casing`                 |
| `{variable:snake}`        | snake_case   | `different_types_of_casing`                 |
| `{variable:mixed-kebab}`  | Mixed-Kebab  | Original casing, spaces → hyphens           |
| `{variable:mixed_snake}`  | Mixed_Snake  | Original casing, spaces → underscores       |
| `{variable:obsidian-cal}` | Obsidian CAL | Like mixed-kebab with duplicate `-` removed |
| `{variable:lowercase}`    | lowercase    | All lowercase                               |
| `{variable:uppercase}`    | UPPERCASE    | All uppercase                               |

> **Note:** Not all websites provide all metadata values. Missing values are replaced with empty strings.
