# 更新说明独立审查

2026-10-20。审查对象仅为 release-notes.ts、对应测试、updater.ts 接入、UpdatePage DOM 测试及 release-notes-cleanup 归档。未修改产品代码、原生关闭修复、验收驱动或其他代理证据；未提交、推送或操作远端。

## Findings (fixed)

无。实际数据路径、组件边界和归档中未发现本轮需要修复的问题。

## Findings (not fixed)

无未修复问题。以下为已核实的适用边界，不属于待修缺陷：该 helper 是常见 GitHub HTML/Markdown 的显示文本转换，不是完整 CommonMark 解析器或通用 HTML sanitizer。后续仍须保留 React 文本节点边界，不可将结果改交 HTML/Markdown 渲染器。

## 代码与效果核对

- manual 路径将固定官方 API 的 body 传入 UpdateController；automatic 路径将 electron-updater 的 updateInfo 传入同一控制器。新版可用分支统一调用 normalizeReleaseNotes；无新版分支清空旧说明。字符串和多版本数组均有控制器数据流断言。
- 注释、编码/未闭合注释、脚本等活跃标签内容、常见 Markdown 符号处理均有具体测试；空白和纯元数据不生成空说明区块。正文和裸 URL 保留，数组中的空 note 被略过。没有新增依赖或远端动作。
- UpdatePage 继续以 `{state.releaseNotes}` 渲染 React 文本节点，未引入 HTML 注入、Markdown 渲染、图片加载或说明链接点击动作。发布按钮沿用固定官方入口。新增 DOM 测试断言说明无 a/img/script/iframe，且不调用桥动作。
- fixture.json 与归档的 v0.1.4 官方正文一致；前后只改变 releaseNotes，版本、检查时间、主题、尺寸保持一致。现有真实组件归档共 8 组 HTML/PNG，明确标为组件夹具。
- 已实际查看 before-dark-600、after-dark-600、after-light-360、after-dark-360 PNG：内部构建标记和原始强调星号消失；正文与 Changelog URL 可读，浅深窄屏均折行，固定页脚操作完整可见。8 份 layout metrics 的横向滚动宽度均等于 360/600px 视口；窄屏页脚 101px，宽屏 65px，底部均为 648px。CSS 继续使用 pre-wrap/overflow-wrap:anywhere。没有发现此次文本转换造成的布局回归。
- releases-updates.md 已同步纯文本契约及禁止重新解释为 HTML/外链的边界；主会话负责合并该规范改动。

## Verification

- Lint: pass。Node 22.23.1，4 个本轮源码文件 `pnpm exec oxlint` exit 0。
- Format: pass。相同 4 文件 `pnpm exec oxfmt --check` exit 0；`git diff --check` exit 0。
- TypeCheck: pass。`pnpm --filter @mimir/desktop typecheck` exit 0。
- Tests: pass。独立执行 release-notes.test.ts、updater.test.ts、UpdatePage.test.tsx，3 文件 32 项通过。保留 Vite 已存在的未来 native configLoader 提示，未抑制警告。
- 本报告是说明显示与相关数据路径的独立验收，不代表新版本打包、公开发布、系统原生通知或跨版本安装已通过；全仓门及公开版本升级由主会话继续验证。
