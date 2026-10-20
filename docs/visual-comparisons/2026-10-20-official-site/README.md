# Mimir 官网验收归档

日期：2026-10-20。入口：[真实渲染对比](comparison.html)。

## 对比口径

本轮新增 Web 公开首页。此前 `/` 经会话检查进入工作区，未登录时显示登录页；因此基线如实保存登录入口，不伪造旧版官网。每组前后使用相同尺寸与主题。原基线 PNG 保留；基线 HTML 从未改动的真实登录组件补采，使用 localhost 独立访问，避免测试会话重定向。新官网截图与 HTML 均来自实际 React 组件，使用固定示例，未捕获私人工作区。

`captures/*.json` 保存完整 DOM、CSSOM、尺寸、主题、URL 和滚动位置；HTML 移除运行脚本并注入样式，供静态审阅。HTML 中的交互控件为快照，实际交互在运行中的首页验证。补采采用分段传输，已确认无截断标记。`capture-manifest.json` 保存 15 组截图、HTML、尺寸与 SHA-256。

## 覆盖清单

| 范围 | 覆盖与结果 |
| --- | --- |
| 首屏与品牌 | 1440×900 / 390×844，浅色 / 深色，共四组前后对比；最终截图等待真实工作台完成渲染；无横向溢出 |
| 引用原文 | 桌面 / 手机打开面板；关闭按钮 44×44；展开聚焦原文，关闭和 Escape 恢复引用焦点 |
| 内容与导航 | 产品、数据与部署锚点；真实组件工作台；FAQ 展开；部署链接指向现有仓库文档 |
| 动效 | 模拟 prefers-reduced-motion，原文面板 computed animationName 为 none；验证后恢复媒体与尺寸覆盖 |
| 公开入口 | 首页未发送 `/api/` 请求；会话失败下公开首页、受保护页面失败恢复及 basepath 另有路由测试 |
| 认证 | 使用统一测试账号验证未登录 CTA 保留 `/docs?scope=all` 目标；登录后进入工作区；已登录仍可访问官网并进入工作区 |
| 桌面 | 默认不开启 publicHome，保持直接进入工作区；共享路由测试、桌面类型与生产构建验证 |
| 设计复核 | Trellis 代码检查与 Impeccable 完工复核；44px 点击区域及外链图标问题已修复；最终 disposition: ship |
| 设计系统 | 复核现有 DESIGN.md 与 sidecar，继续使用现有品牌规则；官网局部字号与布局未提升为全局规则 |

## 验证证据

- `full-check.txt`：全仓 `VITEST_MAX_WORKERS=1 pnpm check` 输出，退出码 0（lint、样式、格式、各包类型与全部测试）。Office 2774 条、renderer 628 条、server 主集 1365 条全部通过。
- `web-build.txt`、`desktop-build.txt`：两端生产构建输出。
- `public-network-observations.json`、`authentication-observations.json`、`interaction-observations.json`、`reduced-motion-observations.json`：真实浏览器观察。
- Trellis 任务 `verification/`：代码复核、设计完工复核、设计系统核对与最终验收记录。

首次全仓格式检查发现 HTML 传输截断与方案草稿未格式化；已完整补采并修复归档格式，最终结果以验收记录为准。保留原有构建警告（编辑器共享大包、既有 React Compiler 诊断与 wavedrom eval）；本轮不处理这些已有问题。

测试重试记录保留为 `full-check-attempt-1.txt`、`full-check-attempt-2.txt` 与 `pdf-recheck.txt`。首次 PDF 轮询超时后，8 条相关用例独立重跑全部通过；两 worker 的运行覆盖了后端串行约束，最终采用单 worker 完整通过，未修改或跳过断言。

## 范围与限制

这是客户端 SPA 官网，未引入 SSR/SSG、第三方分析或外部发布。页面明确展示示例内容、模型服务费用与发送边界、本机/服务器数据独立等实际限制。所有旧对比归档保留；并行 Pele 工作不纳入官网提交。
