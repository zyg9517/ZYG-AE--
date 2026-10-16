# ZYG AE 素材工作台

面向 Windows 和 Adobe After Effects 2020（AE 17.x、CEP 9）的 CEP 面板。
当前实现包含项目素材检索、项目项选择、路径复制和所在文件夹操作。

## 开发

使用 Node.js 24 内置测试运行器，无需安装 npm 依赖。
Windows PowerShell 中请使用 `npm.cmd`，避免 `npm.ps1` 执行策略问题：

```powershell
npm.cmd test
npm.cmd test -- --test-name-pattern="asset record fixture"
npm.cmd run validate
```

`tests/fixtures/assets.js` 导出 `{ assets }`，即 `AssetRecord` 测试记录数组。
每条记录包含 `projectItemId`（数字）、`itemName`、`sourceName`、
`absolutePath`（字符串或 null）、`sourceType` 和 `pathStatus`。
路径状态为 `exists`、`missing`、`unreadable` 或 `not_applicable`。
测试路径仅为示例，不要求开发者机器上存在对应文件。

## CEP 扩展

完整部署内容位于 `cep/`。本地加载时，将该目录复制为
`%APPDATA%\Adobe\CEP\extensions\com.zyg.asset-workbench`。
加载未签名开发扩展需要本机已有的 CEP 开发配置；本项目不自动写注册表、不安装扩展，
也不启用调试标志。重启 AE2020 后打开 **窗口 > 扩展 > ZYG 素材工作台**，
按 [AE2020 人工验收清单](docs/testing/ae2020-manual-checklist.md) 记录直接观察到的结果。

- `cep/CSXS/manifest.xml`：AEFT 17.x 宿主、CSXS 9 运行时和面板入口。
- `cep/index.html` 与 `cep/styles.css`：面板界面。
- `cep/core/`：兼容 CEP 9 的纯 JavaScript 模块。
- `cep/host/`：ExtendScript `.jsx` 宿主代码。

运行时代码须使用兼容 CEP 9 旧版 Chromium 的普通 JavaScript/UMD，
不得使用原生 ES 模块或依赖 `cep/` 以外的文件。
Node.js 仅供开发和测试使用，面板运行时不需要 Node.js。

`CSInterface.js` 位于 `cep/vendor/`，是唯一的 CEP 厂商运行时依赖。

## 可重复校验

校验器只读仓库文件，不启动 AE、不访问剪贴板或资源管理器，也不生成构建输出。
它会解析 manifest、MainPath/ScriptPath、所有活动 HTML/CSS/JSX 引用，确认资源留在
`cep/` 内，并拒绝不匹配 AEFT `[17.0,17.9]`、CSXS 9 或需要更高 CEP 的模块/构建目录。

```powershell
npm.cmd run validate
node scripts/validate-extension.js
```

`scripts/validate-extension.ps1` 只是可选薄封装；PowerShell 默认策略阻止脚本时，
直接使用上面的 Node 命令，不改变执行策略或安全设置。

自动化测试和 Chrome 静态 DOM/CSS 检查不能证明 CEP9、剪贴板、资源管理器或 AE 宿主行为。
这些边界必须按人工清单逐项记录；未直接观察到的项目保持“未验证”。
