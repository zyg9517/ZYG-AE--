# ZYG AE 素材工作台

面向 Windows 和 Adobe After Effects 2020（AE 17.x、CEP 9）的 CEP 面板。
当前骨架仅显示静态面板；素材检索和宿主操作将在后续任务中实现。

## 开发

使用 Node.js 24 内置测试运行器，无需安装 npm 依赖。
Windows PowerShell 中请使用 `npm.cmd`，避免 `npm.ps1` 执行策略问题：

```powershell
npm.cmd test
npm.cmd test -- --test-name-pattern="asset record fixture"
```

`tests/fixtures/assets.js` 导出 `{ assets }`，即 `AssetRecord` 测试记录数组。
每条记录包含 `projectItemId`（数字）、`itemName`、`sourceName`、
`absolutePath`（字符串或 null）、`sourceType` 和 `pathStatus`。
路径状态为 `exists`、`missing`、`unreadable` 或 `not_applicable`。
测试路径仅为示例，不要求开发者机器上存在对应文件。

## CEP 扩展

完整部署内容位于 `cep/`。本地加载时，将该目录复制为
`%APPDATA%\Adobe\CEP\extensions\com.zyg.asset-workbench`。
加载未签名的开发扩展，需要将注册表
`HKEY_CURRENT_USER\Software\Adobe\CSXS.9` 下的字符串值 `PlayerDebugMode`
设为 `1`。重启 AE2020，打开 **窗口 > 扩展 > ZYG 素材工作台**。
当前阶段应显示“面板骨架已就绪。”。

- `cep/CSXS/manifest.xml`：AEFT 17.x 宿主、CSXS 9 运行时和面板入口。
- `cep/index.html` 与 `cep/styles.css`：面板骨架。
- `cep/core/`：预留给兼容浏览器的纯 JavaScript 模块。
- `cep/host/`：预留给 ExtendScript `.jsx` 宿主代码。

运行时代码须使用兼容 CEP 9 旧版 Chromium 的普通 JavaScript/UMD，
不得使用原生 ES 模块或依赖 `cep/` 以外的文件。
Node.js 仅供开发和测试使用，面板运行时不需要 Node.js。

`CSInterface.js` 是任务 4 将引入的明确厂商依赖。届时从 Adobe 官方
[CEP Resources SDK](https://github.com/Adobe-CEP/CEP-Resources) 获取，
放入 `cep/vendor/CSInterface.js`，再加载 CEP 桥接代码。
在这些文件就绪前，骨架没有活动的脚本引用。
