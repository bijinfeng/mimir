# 新对话起始页独立检查

日期：2026-10-20。按本任务 PRD/check.jsonl、项目规则/设计/质量门及 Chat frontend conventions/pitfalls 检查 `EmptyStage.tsx`、`ChatPanel.style.ts`、`ChatPanel.tsx` 和空态设计契约。本任务为 PRD-only，未发现 design.md/implement.md，未借用其他任务规划。未派生代理、未提交，未修改 HTML 模块或业务层。

## Findings (fixed)

- `ChatPanel.style.ts` 的 `emptyTitle` 初版直接写 `font-size:24px`，违背字号经宿主变量注入的现行合同；独立运行 Renderer 字号守卫确实复现失败，唯一命中为此行。主会话确认采用现有 display 角色后，改为 `var(--mimir-chat-font-display, 28px)`，保留 ≤600px 的 `page-title` 19px、现有布局及图标尺寸。同步 PRD 和 design 8.5–8.8 的主标题值为 28px，说明与输入区间距仍 24px；未新增 FONT_SIZE 角色、ChatHostVars 字段或公共接口。

## Findings (not fixed)

无剩余代码或规范问题。真实主题、视口几何、菜单可达和前后配对截图由主会话独立验收；本报告没有将源码/DOM测试当作已完成浏览器验证。

## Verification

- **Chat tests：pass。** `pnpm --filter @mimir/chat test`：8 文件、88/88，通过真实 HTTP/SSE 的既有发送、队列、停止、草稿、历史与文档路径回归。
- **Renderer design：pass。** 修复后完整 `pnpm --filter @mimir/renderer exec vitest run src/theme/design.test.ts`：109/109；未删改或规避字号守卫。
- **Lint / Format：pass。** 三个产品文件的 oxlint、oxfmt 通过；相关 diff 无空白错误。
- **TypeCheck：pass。** 修改后 `pnpm --filter @mimir/chat typecheck` 通过。
- **发送行为审阅：** 新提示仅由 `centered = empty && !props.guide` 的空态 composer 分支显示；消息分支和 guide 的底部输入节点不带该提示。`Composer` 原有非 IME Enter 发送、Shift+Enter 换行保持，未修改 runtime、API、附件或排队逻辑。
- **布局审阅：** `innerEmpty` 仍为最大 768px（含 gutter）、`margin:auto` 的单个 flex 子项，新增 `flex-shrink:0` 让超高内容保持真实高度，并由外层 `overflow-y:auto` 滚动；没有引入会裁掉上沿的 `justify-content:center`。标题和说明左边距沿既有 gutter，输入节点/固定底部消息区几何未变。实际短窗口和长草稿滚动位置须由主端测量。
- **组件/主题审阅：** 图标仍 Lucide 且 `aria-hidden`；标题保留 H1，说明与键位提示是普通文本，kbd 继承字体；颜色走宿主 token，字号均走宿主变量，无新主题 provider、antd 覆写或额外可交互入口。
- **全仓质量门：** reviewer 未运行，交由主会话执行；未启动 server 集成测试或触碰共享测试库。

## 规范同步

用户可见空态布局已在既有 design 8.5–8.8 单点更新，PRD 与最终 28px 实现一致。不需要新增长期决策、静默坑或过程清单；未为本次外观变更添加 CSS 镜像测试。
