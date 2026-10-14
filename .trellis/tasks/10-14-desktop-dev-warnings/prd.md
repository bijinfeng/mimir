# 清理 desktop:dev 开发警告

## Goal

消除 `pnpm desktop:dev` 启动与持续构建中由项目源码和配置产生的警告，让真实故障清楚可见，同时保持桌面端现有功能。

## Confirmed facts

- `desktop:dev` 先构建 server 与 desktop，再启动 Electron，窗口就绪后启动三段 watch 构建；桌面渲染进程使用进程内宿主同源地址，不能改成 `electron-vite dev`（`scripts/desktop-dev.mjs`、`.trellis/spec/desktop/runtime/conventions.md`）。
- 2026-10-14 的构建清单包含 26 条 React Compiler 诊断（25 条项目源码、1 条不可手改的 GenOffice vendor）、4 条未解析的 Carlito 字体 URL、2 条无效动态导入提示；Electron 阶段因二进制缺失和下载失败而退出。具体路径、行号与固定上游版本见 `research/warning-inventory.md`。
- 当前工作区起始时干净；构建产生的 `dist` 等产物受忽略规则管理。

## Requirements

- R1：修复清单中的项目源码和配置警告，并在新的构建输出中逐项确认消失；保持桌面端本地模式同源、三段构建与 watch 行为。
- R2：保持 React Compiler 对项目 React 源码启用；不可手改的 GenOffice vendor 按第三方边界处理，不通过全局关闭诊断制造“无警告”输出。
- R3：Carlito 字体必须保留与 Calibri 接近的度量与可分发许可，不能用不相容字体替代；只读 Markdown 的渲染与 StrictMode 清理语义不变。
- R4：区分缺失 Electron 二进制的本机环境故障与构建问题；尝试正常安装与启动，无法取得二进制时记录确切限制。
- R5：用户在 2026-10-14 扩展范围，要求修复阻断全仓质量门槛的两项既有问题：vendor CSS 的机械格式差异，以及 ChatPanel 续轮失败后未变化画布被误判为过期。

## Acceptance criteria

- A1：Web 与 desktop 渲染构建中，上述 32 条目标警告不再出现；其他警告若出现，继续归因和处理，不靠隐藏日志通过。
- A2：受影响包的 lint、format、typecheck 和行为相关测试通过，桌面渲染构建及 watch 首次构建成功。
- A3：若 Electron 可用，验证客户端真实启动；若当前环境无法取得二进制，明确记录停在何处，不把构建成功表述为启动成功。
- A4：`pnpm check` 全部通过；未变化画布可重试续轮，画布变化后仍拒绝旧结果；vendor 样式的修改仅为格式化。

## Out of scope

- 改变桌面端加载地址、登录方式或文档保存语义。
- 手工修改 `packages/office/vendor/` 的行为，或以全局关闭 React Compiler 替代源码修复。针对既有格式门槛，允许依照上游同步规范机械运行 oxfmt。
