# AI 操作区对齐与 hover 抖动修复

## 根因与改动

用户反馈“只预填问题，不自动发送 / 带到新对话”图文不居中且 hover 抖动。主会话实际浏览器修复前测量：按钮默认 `89.265625 × 24.390625`、AI 行高 `47.390625`；hover 后按钮 `91.265625 × 26.390625`、行高 `49.390625`，文字左移 1px、下移 1px。

源码根因为 AntD 6.6.6 `es/button/style/variant.js` 的 `:not(:disabled):not(.ant-btn-disabled):hover` / `:active` 会重新设置整个 `border` 简写，其选择器覆盖了本模块默认态 `&& { border: 0 }`。并非业务状态更新或图标位移。

本轮仅修改 `packages/renderer/src/components/command-palette/styles.ts`：

- `askButton` 局部默认、hover、active、focus-visible、disabled 均固定 `border: 0`；hover/active 选择器特异性高于 AntD 原规则，不影响全局按钮。
- 显式设置按钮内容居中与文字容器 flex 对齐、说明文字的行高和子元素布局。保留批准稿的字号、桌面 1.7 行高及窄屏说明文字 17px 行高。
- transition 仅作用于 color/background-color，避免边框或其他几何属性参与过渡。
- 保留并显式提供键盘 2px focus-visible outline；窄屏/粗指针 44px 触点规则不变。

未修改 JSX、业务动作、guard、主题 token、冻结原型及其他模块。没有添加镜像 CSS 的测试；尺寸和状态几何由真实浏览器检查，行为由已有组件回归验证。

## 实施检查

均通过：

- `pnpm exec oxlint packages/renderer/src/components/command-palette/styles.ts`
- `pnpm exec oxfmt --check packages/renderer/src/components/command-palette/styles.ts`
- `node scripts/check-style-backticks.mjs`
- `antd lint packages/renderer/src/components/CommandPalette.tsx --format json`：0 issues。
- `pnpm --filter @mimir/renderer typecheck`
- `pnpm --filter @mimir/renderer test src/components/CommandPalette.test.tsx --maxWorkers=2`：1 文件 / 15 项通过，含显式 AI 交接、IME/等待禁用、guard 取消保留上下文等既有回归。

实施代理未自行操作浏览器、未宣称完成视觉验收、未提交。浅深色 / 390px 的 default-hover-active-focus-disabled 几何验证与截图由主会话记录，独立检查、规范与限定提交由主会话完成。
