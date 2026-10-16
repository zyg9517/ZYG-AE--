# 实现决策与验证证据

本文保留 SDD ledger 中对实现有影响的决定，避免清理临时工作区后丢失上下文。

1. `AssetRecord` 字段保持 fixture、host、搜索和 UI 的同一契约。若错误，会产生跨模块解析调整；没有扩大范围。
2. 所有可部署代码位于 `cep/`，计划中的 `src/core/` 和 `host/` 路径对应到 `cep/core/`、`cep/host/`。若错误，只需路径/部署文档修正。
3. 运行时代码使用 UMD/CommonJS 风格普通 JavaScript，兼容 CEP9/Chromium61；Node24 只用于开发测试。若错误，需要模块加载改写。
4. Windows PowerShell 使用 `npm.cmd`；校验使用 Node runner，PowerShell wrapper 不改变执行策略。若错误，只需命令封装调整。
5. Host parser 区分 collection 的 `assets` 成功载荷与 selection 的 `{ok:true}`，避免集合缺失被静默接受。若错误，需要 parser/bridge 签名调整。
6. Host 记录使用 AE 当前保存的 source reference；“原始路径”不承诺找回 relink 前的历史路径。错误时会变成独立的历史追踪功能。
7. 图片序列使用 AE 暴露的首个源文件/文件夹，并仅按已知图片扩展名与 `isStill` 启发式标记；视频和音频不会只因 `isStill` 被标为序列。错误时只需修正类型标签。
8. Reveal 使用 CEP `createProcess` 调用 Explorer 和独立文件夹参数，不执行 shell 命令。错误时只需替换本地路径适配器。
9. 实机 smoke 只能在新实例、随机环境令牌已验证后操作合成测试目录；不得碰用户现有项目、安装未签名面板或开启调试标志。代价是隔离失败时只能保留未验证证据。
10. 扩展校验器只读 `cep/`，递归检查活动 JS/CSS/JSX 引用并拒绝越界路径、构建目录、模块脚本和错误 AE/CEP 版本；不会生成输出。
11. 现有授权覆盖 feature branch 推送和 draft PR；实现阶段不合并 main。若授权边界变化，只需关闭 PR 或保留分支，不改变 main 行为。
12. “禁止外链”只适用于可执行扩展资源：HTML 的 `script`/`link`、CSS `@import`/`url` 和 JSX `#include` 必须解析到 `cep/` 内；Markdown/README 中的厂商文档链接仍可保留，校验器不会把文档链接当作运行时依赖。

13. 打包策略保持保守：校验器拒绝 `cep/` 内的所有符号链接和联接点，即使目标仍在 `cep/` 内；因此部署树必须使用普通文件和目录。

## 本次可复现证据

- `npm.cmd test`：Task 5 历史基线为 54/54；Task 6 在 CEP native bridge 回归测试加入前为 73/73；当前最终 suite 为 74/74。
- `npm.cmd run validate`：当前成功解析 AEFT `[17.0,17.9]`、CSXS 9 和 12 个本地资源（包含 CEP native bridge）。
- `node --test tests/dev/validate-extension.test.js`：当前 20/20，覆盖版本、引用闭包、越界/符号链接与联接点、注释、CEP native bridge 顺序和 CLI 失败码。
- Chrome 静态证据是 Task 5 在 CEP native bridge/CEP-only 原生声明加入入口之前进行的历史检查：当时入口尚未加载 CEP native bridge 或其 CEP-only 原生声明；Chrome 打开的是该历史入口，结果页/Range 证据来自另一个临时 script-free HTML 副本。它不检查当前含 native declarations 的 `cep/index.html`，也不能证明 CEP runtime。
- AE 令牌探针：子进程超时且未写入令牌验证文件；未发生项目 mutation，实机 checklist 保持“未验证”。
