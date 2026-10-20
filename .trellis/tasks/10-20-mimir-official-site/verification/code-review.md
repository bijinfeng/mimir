# 官网代码复核

日期：2026-10-20。执行者：Trellis check 子代理。范围为官网 marketing 组件、共享路由及 Web 入口；未修改并行 Pele/editor、依赖或锁文件工作。

## Findings (fixed)

- File: `packages/renderer/src/components/marketing/CitationDemo.style.ts`
- Issue: 原文面板的关闭按钮固定为 36×36px，没有触控设备尺寸覆盖，低于现有设计的 40–44px 触控目标。
- Fix: 将最小点击区域扩大到 44×44px，保留图标、按钮语义与焦点恢复逻辑。关闭及 Escape 回归测试通过；最终浏览器尺寸确认由主会话与归档截图一并执行。

## Findings (not fixed)

无其余待修复问题。未扩大范围修改架构或公共接口。

## Review evidence

- 根守卫仅在明确启用 `publicHome` 且 Router 内部 pathname 精确为 `/` 时跳过会话。`/docs`、`/chat`、`/settings`、未知路径仍请求会话；API 错误不会放行受保护页面。
- `/app/mimir` 和 `/app/mimir/` 的路由测试均通过；主行动由 Router Link 生成带 basepath 的地址，未登录重定向保留完整目标。
- Web 单独启用公开首页，默认/桌面构建继续走原工作区入口。所有“开始使用”链接明确关闭预取，避免悬停引发会话请求。
- 官网、引用示例和工作台使用固定中性样例；组件没有会话、模型、知识库查询。真实 `MarkdownBody` 只读渲染固定正文，应用 Provider 不新增数据请求。主会话另行实测官网请求列表。
- 引用按钮具备展开状态与面板关联；展开聚焦原文，关闭或 Escape 恢复触发点；关闭状态的面板不可聚焦。支持跳至正文、语义导航/标题、可见焦点。引用颜色过渡具有 reduced-motion 的直接显示分支。
- 新增字号、布局及颜色均局限官网作用域，消费现有主题 token。390px 分支折叠静态工作台辅助列，保留独立引用交互。
- 页面明确区分静态演示与产品能力、本机/服务器数据及模型服务；无同步、免费离线 AI、客户/价格/下载量等虚构承诺。链接复用已核实仓库及部署文档。
- 官网路由与真实工作台分别异步加载；工作台 Suspense 允许价值主张与引用交互先呈现，不等待 Markdown 编辑器依赖图。加载提示保留合理空间与状态语义。
- 产品、renderer/Web 路由规范已由主会话同步，声明的合同与实现相符。SPA 收录限制属于 PRD 明确排除的 SSR/SSG 范围。

## Verification

- Lint: **pass** — `pnpm exec oxlint` 任务涉及的 13 个代码文件；`antd lint ./packages/renderer/src/components/marketing --format json` 为 0 条问题。
- Format: **pass** — `pnpm exec oxfmt --check` 同一代码范围。
- TypeCheck: **pass** — `pnpm --filter @mimir/renderer typecheck`，包含路由生成；在工作台 lazy/Suspense 与关闭按钮修复后复跑。
- Tests: **pass** — `pnpm --filter @mimir/renderer exec vitest run src/routes/-public-home.test.tsx src/components/marketing/CitationDemo.test.tsx`，2 个文件、12 条测试全部通过。
- 全仓 `pnpm check`、Web/Desktop 验证及真实浏览器 1440/390px 浅深主题、最终截图归档由主会话执行；此记录不将其计作子代理独立执行结果。
