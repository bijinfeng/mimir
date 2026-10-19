# AI 操作区对齐与 hover 抖动独立检查

## Findings (fixed)

无新增问题，本检查未修改产品代码或规范。审查对象仅为本轮
`packages/renderer/src/components/command-palette/styles.ts` 的局部 diff 与
`.trellis/spec/renderer/frontend/search-parity.md` 末节。

## 核对结果

- 对照已安装的 AntD 6.6.6 `es/button/style/variant.js`：基础 hover/active 规则为
  `.ant-btn:not(:disabled):not(.ant-btn-disabled):hover/:active`，特异性为
  `0,4,0`。本轮 `&&&:hover:enabled` / `&&&:active:enabled` 为 `0,5,0`，
  能固定这两个状态的 border；默认、focus-visible、disabled 也明确固定为 0。
  Button 没有 href，使用原生 button/disabled，未遗漏当前组件实际使用的禁用分支。
- 更高特异性规则只固定边框和 focus-visible outline，没有覆盖 hover/active/disabled
  的文字或背景颜色。默认文字继续消费 colorLink，交互及禁用色继续由 AntD 状态规则处理；
  focus-visible 保留 2px token.focusRing，outline 不参与盒子尺寸。
- 左右两组保留 flex 对齐，文字容器/图标不再依赖行内 baseline；上层 svg 的 flex:none
  规则保持。窄屏与粗指针的 44px 最小触点规则未改，字号、间距和面板布局没有扩展修改。
- JSX、disabled 条件和 onAsk 完全未改：busy/IME 禁用、显式点击才交接问题、宿主 guard
  与预填不发送的合同保持。颜色/背景的局部 transition 未引入尺寸属性过渡；
  AntD 的 focus transition 可能仍独立覆盖 outline，属于绘制效果，不改变尺寸。
- 规范准确记录级联根因、局部处理边界、伪类实际测量要求及验证限制，没有把组件事件测试
  当作浏览器 hover 证明。冻结原型、全局 tokens 和其他模块未修改。

## Findings (not fixed)

本轮范围内无未修复问题。全仓门之前记录的其他任务阻断未在本轮解决，也未重跑全仓 495 项
测试；本次是局部 CSS 修复，没有修改业务路径。

## Verification

- Lint: pass — `pnpm exec oxlint packages/renderer/src/components/command-palette/styles.ts`。
- Format: pass — `pnpm exec oxfmt --check packages/renderer/src/components/command-palette/styles.ts .trellis/spec/renderer/frontend/search-parity.md`；格式器实际匹配 1 个 TS 文件。
- Style guard: pass — `node scripts/check-style-backticks.mjs`。
- AntD: pass — `antd info Button --version 6.6.6 --format json` 核对 API，
  `antd lint packages/renderer/src/components/CommandPalette.tsx --format json` 返回 0 issues。
- TypeCheck: pass — `pnpm --filter @mimir/renderer typecheck`。
- Tests: pass — `pnpm --filter @mimir/renderer test src/components/CommandPalette.test.tsx --maxWorkers=2`，1 文件 / 15 项通过。
- GUI: 由主会话实际 CUA 操作，本代理没有重复操作共享浏览器。
  已阅读 `desktop-light.json`、`desktop-active.json`、`narrow-light.json` 证据：
  desktop default/hover/leave/focus 的按钮与 AI 行矩形一致，focus 有 2px outline，
  图文内部中心差约 0.008px；390px default/hover/leave 矩形一致、内部中心差 0px、按钮高 44px。
  深色与 disabled 的补充实测由主会话一并记录，不能以本代理静态检查替代。

本代理未提交；提交范围、主会话剩余 GUI 证据及全仓阻断说明由主会话汇总。
