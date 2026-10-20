# Mimir 官网技术与页面设计

## Boundaries

- `apps/web` 继续作为构建/平台壳。官网组件与内容归 `packages/renderer/src/components/marketing/`；根路由与索引路由负责接入，不把业务界面写入 Web 壳。
- 官网是公开的 `/` 页面。使用明确的路由配置 `publicHome` 由 Web 入口启用，桌面构建默认不启用；不探测 window 或 User-Agent。
- `RouterContext` 增加公开首页能力配置，`buildRouter` 将其注入；`createApp` 的 Provider 结构不变。
- 根路由只对配置启用时的精确 `/` 返回公开页面上下文，不请求会话，不加载个人知识。`/login` 与 `/docs`、`/chat`、`/settings` 继续使用既有会话守卫与错误恢复。
- 索引路由在公开首页启用时显示官网，否则延续 `/docs?scope=all` 重定向；Desktop 本机行为保持。

## Visitor flow and content

- 主行动“开始使用”指向 `/docs?scope=all`，未登录时由既有守卫带到登录并保存目标，已登录直接进入工作区。
- 次行动“看看怎么工作”跳到页内工作流说明；顶部链接为产品能力、数据与部署、GitHub、开始使用。
- 页面次序：价值主张与产品证明 → 收集/检索/引用闭环 → 原件与笔记可掌控 → 本机/自托管两种使用方式 → 简明 FAQ → 开始使用。
- GitHub 与部署说明使用仓库中已确认地址；不虚构正式发布下载、定价、客户数、用户评价或性能指标。
- 演示仅使用中性示例，不读取真实私人资料；示例状态明确标注。真实组件展示优先采用真实组件渲染并保留其主题与内容语义。

## Visual and interaction direction

- 继承 `apps/web/DESIGN.md`：白灰中性工作面、工作台绿、既有 BrandMark / BrandLockup、系统中文字体与细边界。
- 官网允许更大标题与更宽的内容节奏，新增规则局限官网，不能放大全局 UI 字号或覆盖工作区主题。
- 已选“问题带路”，optionId=question；对应 HTML 草图 `.impeccable/mocks/decision/question.html`。首屏上半部左侧标题/说明/双行动，右侧具体问题/示例回答/引用，下半部进入真实工作台演示。
- 代表性交互为“从答案回原文”：示例引用按钮展开原文段落并标识对应位置，可关闭并恢复焦点；明确标注示例，不实际调用模型。仅该交互使用短暂高亮过渡，reduced-motion 直接呈现结果，不添加全页滚动进场。
- 展示内容通过真实组件和受控静态样例渲染，避免把截图画成可输入的假功能。营销边界内只提供已实现的页内演示行为。
- 桌面主内容上限约 1200px；390px 按信息顺序折行，产品演示简化展示但保留引用与原文关系；导航在窄屏保留核心入口。
- 页面锚点、可见焦点、跳至正文、语义标题与 reduced-motion 支持均为交付要求。官网独立正常滚动容器，适应应用已有高度链。

## Compatibility and risk

- 公开路由为精确且显式例外，不能用 catch-all 或吞掉认证请求错误扩大公开范围。服务端 API 认证完全不变。
- 必须验证 basepath 部署（包括 fnOS）下根路径判断与相对链接；浏览器 Web 部署可见官网，桌面本机不显示。
- 当前 SPA 对搜索引擎首屏文本收录有局限；本轮提供合理 title/description/语义内容，不引入 SSR 框架或第三方分析。
- 关闭 `publicHome` 注入可回退原入口；没有数据迁移。

## Pending gate

首屏选择已由 decision answer 确认为 question。PRD 已完成去重收敛，实施与检查清单齐备；最终摘要提交用户审阅后，取得后续明确批准才执行 `task.py start`。
