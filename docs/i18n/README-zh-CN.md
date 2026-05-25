# MarkSnip

适用于 Chrome 和 Firefox 的网页转 Markdown 剪藏工具。将页面保存为整洁的 Markdown，复制内容到剪贴板，或直接发送笔记到 Obsidian。

[Chrome 插件商店](https://chromewebstore.google.com/detail/marksnip-markdown-web-cli/kcbaglhfgbkjdnpeokaamjjkddempipm?hl=en) | [Firefox 附加组件](https://addons.mozilla.org/en-US/firefox/addon/marksnip-markdown-web-clipper/) | [用户指南](../guides/user-guide.md) | [Agent Bridge 教程](../guides/agent-bridge.md) | [更新日志](../../CHANGELOG.md) | [隐私政策](../../PRIVACY.md)

[![MarkSnip 宣传](../../media/marksnip_promo.gif)](https://www.youtube.com/watch?v=IO6PjI79drY)

## MarkSnip 会满足你什么需求

MarkSnip 是 [MarkDownload](https://github.com/deathau/markdownload/) 的 Manifest V3 分支版本，专注于可靠的 Markdown 转换、批量工作流和浏览器商店兼容性。

核心工作流程：

- 使用 Mozilla Readability 提取内容
- 使用 Turndown 将 HTML 转换为 Markdown
- 可选的模板注入、图像处理和格式控制

## 功能特点

- 剪藏完整页面或选中文本
- 保存前可编辑 Markdown
- 将弹窗中的剪藏导出为 Markdown、纯文本、HTML 或 PDF
- 支持从 URL 列表或 Markdown 链接批量转换
- 将批量结果保存为 ZIP 压缩包或多个单独文件
- 针对页面、选中文本、链接、图片和标签页的右键菜单操作
- Obsidian 集成（通过 Advanced URI + 剪贴板）
- Agent Bridge CLI，可供本地工具获取当前页面的 Markdown
- 常用操作支持键盘快捷键
- 丰富的 Markdown 格式控制（标题、代码块、链接、图片、表格、模板）
- 导入/导出扩展设置为 JSON

## 安装

### Chrome（稳定版）

从 [Chrome 插件商店](https://chromewebstore.google.com/detail/marksnip-markdown-web-cli/kcbaglhfgbkjdnpeokaamjjkddempipm?hl=en) 安装。

### Firefox（稳定版）

从 `v4.0.6` 起提供 Firefox 支持。
从 [Firefox 附加组件](https://addons.mozilla.org/en-US/firefox/addon/marksnip-markdown-web-clipper/) 安装。

### 加载已解压的版本（本地构建）

1. `cd src`
2. `npm ci`
3. `npm run build:manifests`
4. 打开 `chrome://extensions`
5. 启用开发者模式
6. 点击 **加载未打包的扩展程序** 并选择 `src/.build/chrome`

### Firefox（本地构建）

1. `cd src`
2. `npm ci`
3. `npm run build:manifests`
4. 在 Firefox 中将 `src/.build/firefox` 加载为临时附加组件，或使用发布工作流打包。

## 使用方法

1. 点击扩展图标打开弹窗。
2. 选择 **选区** 或 **文档**。
3. 查看/编辑 Markdown。
4. 使用弹窗导出按钮将剪藏保存为 Markdown、纯文本、HTML 或 PDF，或使用 **全部复制** / **发送到 Obsidian** 继续基于 Markdown 的工作流。

Agent Bridge：

1. 从 GitHub Releases 下载与当前系统匹配的辅助程序压缩包。
2. 根据你的操作系统选择运行安装命令：

   Windows：`.\marksnip.exe install-host`
   macOS/Linux：`./marksnip install-host`
3. 在 MarkSnip 设置中启用 **Agent Bridge**；如果出现本地消息传递权限提示，请允许。
4. 根据你的操作系统选择运行剪藏命令：

   Windows：`.\marksnip.exe clip`
   macOS/Linux：`./marksnip clip`

如果您要在 Windows 上测试本地已解压的 Chrome 扩展，可以先用以下命令查找扩展 ID：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\find-unpacked-chrome-extension-id.ps1 -ExtensionPath .\src
```

无论任何平台，您都可以从 `chrome://extensions` 复制已解压的扩展 ID。

然后用该已解压扩展 ID 安装宿主程序：

Windows：

```powershell
cd .\native
.\marksnip.exe install-host --chrome-extension-id <您的已解压扩展ID>
```

macOS/Linux：

```bash
cd ./native
./marksnip install-host --chrome-extension-id <您的已解压扩展ID>
```

如果之后已解压的 Chrome 扩展 ID 发生变化，请使用新 ID 重新运行该命令。

批量模式：

1. 打开弹窗并点击批量图标。
2. 粘贴 URL（或 Markdown 链接），每行一个。
3. 选择 **ZIP** 或 **单个文件** 输出。
4. 点击 **转换所有 URL**。

## 键盘快捷键

- `Alt+Shift+M`：打开弹窗
- `Alt+Shift+D`：将当前标签页下载为 Markdown
- `Alt+Shift+C`：将当前标签页复制为 Markdown
- `Alt+Shift+L`：将当前标签页 URL 复制为 Markdown 链接

浏览器快捷键设置中也提供其他命令（选区、选中标签页、Obsidian 操作）。
弹窗导出格式设置不会更改这些快捷键或右键菜单操作；这些操作仍始终基于 Markdown。

## 开发

所有开发命令从 `src/` 运行。

### 前置条件

- Node.js 20+
- npm

### 设置

```bash
cd src
npm ci
```

### 常用脚本

- `npm test` - 运行 Jest 测试套件
- `npm run test:unit` - 单元测试
- `npm run test:integration` - 集成测试
- `npm run test:e2e` - Playwright 端到端测试
- `npm run audit:i18n` - 审查本地化语言键的一致性和纯英文兜底字符串
- `npm run build:manifests` - 生成浏览器特定的清单
- `npm run build` - 通过 `web-ext` 构建 Firefox 包
- `npm run build:chrome` - Chrome ZIP 包
- `npm run build:all` - 构建 Firefox + Chrome 产物
- 在 `native/` 中运行 `go build ./cmd/marksnip` 和 `go build ./cmd/marksnip-native-host` - 用于构建 Agent Bridge 辅助程序

### i18n 审查

使用 i18n 审查来检查键的一致性和纯英文兜底字符串：

```bash
npm run audit:i18n
```

有用的选项：

```bash
npm run audit:i18n -- --json
npm run audit:i18n -- --locale de,fr,pt_BR
npm run audit:i18n -- --include-invariants
npm run audit:i18n -- --fail-on-untranslated
npm run audit:i18n -- --allow-key someIntentionalEnglishKey
```

## 关于构建的架构

`src/manifest.json` 是源清单。`src/scripts/generate-browser-manifests.js` 生成：

- 带有 `background.service_worker` 的 `src/.build/chrome/manifest.json`
- 带有 `background.scripts` 的 `src/.build/firefox/manifest.json`

`.build/` 目录是生成的构建产物，不要提交。

根目录的 `dist/` 是用于发布的打包产物，根目录的 `tmp/` 是忽略的本地临时文件。

## 发布流程

GitHub Actions 工作流 [`.github/workflows/build-release.yml`](../../.github/workflows/build-release.yml)：

1. 运行单元和集成测试。
2. 构建浏览器清单。
3. 打包：
   - `marksnip-chrome-<version>.zip`
   - `marksnip-firefox-<version>.xpi`
   - `marksnip-agent-bridge-windows-amd64.zip`
   - `marksnip-agent-bridge-macos-amd64.tar.gz`
   - `marksnip-agent-bridge-macos-arm64.tar.gz`
   - `marksnip-agent-bridge-linux-amd64.tar.gz`
4. 打 `v*` 标签（或手动 `workflow_dispatch`）在 GitHub 上发版。

如果你要发版：

1. 更新 `src/manifest.json` 中的版本
2. 更新 `CHANGELOG.md`
3. 打标签并推送，例如：

```bash
git tag v4.0.4
git push origin v4.0.4
```

## 项目结构

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

## 隐私

默认情况下，MarkSnip 不会将剪藏的页面内容发送到外部服务器。可选的智能解读功能（需手动启用）会将剪藏的 Markdown 发送到您配置的 LLM 提供商；可选的 Agent Bridge 则会将其发送到您本机上的本地 CLI。有关详细信息，请参阅 [PRIVACY.md](../../PRIVACY.md)。

## 致谢

- 由 deathau 原创的 [MarkDownload](https://github.com/deathau/markdownload/)
- [Readability.js](https://github.com/mozilla/readability)
- [Turndown](https://github.com/mixmark-io/turndown)
- [CodeMirror](https://codemirror.net/)
- [highlight.js](https://highlightjs.org/)

## 许可证

本项目使用 [PolyForm 非商业许可证](LICENSE) 许可。
