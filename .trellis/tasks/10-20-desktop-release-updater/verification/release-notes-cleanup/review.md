# 更新说明显示修复验收

2026-10-20，Node 22.23.1。本轮仅修改 main/updater.ts、新增 main/release-notes.ts 与对应测试、补充 UpdatePage.test.tsx；没有修改 UpdatePage 产品布局、外链策略、安装/保存流程、发布脚本、版本和工作流，未提交或操作远端。

## 发现与修复

实际官方 mac 手动更新截图 `../mac-official-manual/manual-new-version.png` 显示了 `mimir-desktop-build` 所有权注释与 `**Full Changelog**` 原始 Markdown。保留该原始证据及公开 v0.1.3/0.1.4 资产。新 helper 在主进程发布更新状态前归一化，GitHub API 字符串与 electron-updater 多版本数组使用同一契约。

内部 HTML 注释（含编码及未闭合注释）被移除；常见 Markdown 标题、强调、链接和列表转为可读纯文本，保留原正文、原始裸 URL 与版本信息。GitHub provider 的 HTML 正文转为文本，script/style/iframe/object 内容及其他 HTML 标签被剔除。没有新增依赖或 HTML 渲染；输出只允许作为 React 文本节点使用，绝不是通用 HTML sanitizer。链接标签不成为可点击入口，仍通过既有固定官方发布按钮打开发布记录。

## 同内容、主题、尺寸真实组件前后归档

`fixture.json` 保存从已归档匿名官方元数据读取的 v0.1.4 正文与归一化结果。`before/after-{light,dark}-{600,360}.html` 共 8 份由实际 UpdatePage、MimirProvider 与原有模拟桥渲染，再用现有 Chrome CDP 捕获路径得到同名 PNG。尺寸统一 648px 高，宽 600/360px；before/after 只改变主进程将发送的 releaseNotes 值，版本、检查时间、主题及尺寸完全相同。该组明确为组件夹具，不声称新 patch 已发布或正式更新已成功。

人工查看深色宽屏前后、浅深窄屏修复后：内部标记完全消失，Full Changelog 不再显示星号，正文与版本保持，固定页脚按钮完整可见。layout-metrics.json 的全部 8 份横向尺寸等于视口，无横向溢出；窄屏 URL 按原 CSS 折行。原截图与旧比较稿均保留。

可复现路径记录于 `capture-components.test.tsx.txt`（临时放回 renderer/update 下执行 vitest 后移除）和 `capture-chrome.mjs.txt`（项目根目录 node 执行）。临时源已清理。

## 验证

- Desktop 全包：13 个文件、117 项测试全部通过（tests.log），新增 5 项 main notes 逻辑/控制器数据流测试与 2 项真实 DOM 行为测试。
- 真实官方发布正文；HTML/Markdown 两种输入；多版本空 note；空白/纯注释隐藏区块；恶意脚本、事件属性、远程图片、javascript 链接；未闭合/编码注释均覆盖。
- DOM 断言 notes 不产生 a/img/script/iframe、无额外桥动作，空正文不显示空说明区域。
- `pnpm --filter @mimir/desktop typecheck` 通过。
- 四个本轮源码文件 oxlint、oxfmt --check 通过；git diff --check 通过。
- `pnpm --filter @mimir/desktop build` 三段构建通过（build.log）；保留既有第三方 eval/dynamic import 警告。
- 组件归档单独 1 项通过，Chrome 实际捕获全部 8 个 PNG。

## 边界

这是常见 GitHub 说明的纯文本可读性转换，不提供完整 CommonMark 排版或任意 HTML 清理安全保证；安全边界仍是 React 文本节点与既有官方 URL 按钮。未在本分支重新打包、发布或进行跨版本安装；由主会话将新 patch 与独立关闭问题修复统一构建验收。此处不声称系统原生通知投递、签名、Gatekeeper 或 fnOS 实机通过。全仓门由主会话统一执行。
