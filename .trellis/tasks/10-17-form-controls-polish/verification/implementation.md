# 基础表单组件精修：实施记录

日期：2026-10-17。实施子代理；未提交、未归档，实际浏览器验收与最终全仓检查由主会话负责。

## 改动

- `packages/renderer/src/theme/tokens.ts`：私有共享字段角色经 Input / InputNumber / Select 组件覆盖生效。浅色默认 / hover / focus 为 #e7e9e8 / #bfc5c1 / #00a35f，深色为 #454b47 / #66736c / #50c28f。Input 和 InputNumber 普通 / 错误 / 警告 activeShadow 为 none；Select 局部 controlOutlineWidth=0，生成的零 spread shadow 等效无外扩。全局 colorBorder、主按钮色、lineWidthFocus 与独立 focusRing 均保留。
- Password / Search / TextArea 共享 Input 覆盖，Cascader 实际调用 Select style hooks，未发现需要页面或全局 CSS 补丁的继承缺口。保留 AntD 6.6.6 的语义、禁用及组合结构。
- `packages/renderer/src/theme/design.test.ts`：保留独立关键边界 ≥3:1 的原测试，并增加 3 项真实 provider 守卫（主题测试总计109项）：真实 DOM 作用域下的字段默认 / hover / active / 1px / shadow 变量、浅深切换、Cascader继承、无边框 focus-visible、全局关键边界和焦点宽度隔离、错误 / 警告 / 禁用规则与不可聚焦行为。
- `.trellis/spec/project/design.md`、`.trellis/spec/renderer/frontend/theme/conventions.md`、`apps/web/DESIGN.md`：同步轻默认字段边界、细焦点与保留独立键盘焦点的契约。明确浅色默认边界约1.22:1是用户批准的外观取舍，不宣称默认边界达到非文本AA。
- `apps/web/.impeccable/design.json`：仅局部同步字段 preview 与7个颜色角色；该文件实施前已存在但未跟踪，不能把原始整份未跟踪内容误作本轮新增。`design-sidecar.patch` 仅记录本轮局部差异，可供提交范围评审使用。

## 验证

- 修改前按本地 AntD 技能查询6.6.6 Input API、Input / InputNumber / Select token、Cascader API，并核查安装源码。CLI元数据输出在 `/tmp/mimir-form-antd-*.json`，任务 research 中也有同版本证据。
- 限定 `antd lint`：tokens.ts、design.test.ts 均0 issue、0 skipped，日志 `/tmp/mimir-form-antd-lint-tokens.json` 与 `...-test.json`。
- 限定 `pnpm exec oxlint`、`oxfmt --check` 及 `git diff --check`：通过。
- `pnpm --filter @mimir/renderer test src/theme/design.test.ts`：109/109通过，最终日志 `/tmp/mimir-form-theme-final-test.log`。
- `pnpm --filter @mimir/renderer test`：首轮46文件，396通过、1失败。失败为未修改的 NavSidebar“未保存导航取消后保留抽屉，并把焦点还给原导航项”的 waitFor 超时；日志 `/tmp/mimir-form-renderer-test.log`。单独复跑该文件9/9通过，日志 `/tmp/mimir-form-nav-test.log`。最终全仓运行仍需确认此调度敏感项。
- Renderer / Web typecheck：通过，最终日志分别 `/tmp/mimir-form-renderer-final-typecheck.log`、`/tmp/mimir-form-web-final-typecheck.log`。
- Desktop typecheck：被并行 `apps/server/src/services/upload.ts:221` 的 `TS2304 Cannot find name UploadMeta` 阻断，日志 `/tmp/mimir-form-desktop-typecheck.log`；未代修他人的上传改动。

## 验证边界

happy-dom 对复杂 :where / :focus 级联的 computed border 不可靠（未聚焦字段会错误读成全局主绿，而真实浏览器已确认样式正确）。自动守卫因此读取真实挂载DOM的组件作用域变量与真实注入CSS的消费 / 状态规则，不将 happy-dom 当作浏览器样式引擎；最终computed border、几何和鼠标/Tab路径由主会话真实浏览器批量验收覆盖。

主会话负责：真实页面及独立fixture验收、Trellis检查代理审查、最终pnpm check及并行错误协调。没有执行或尚未通过的检查未声明完成。产品变动只在上述主题文件；其他236+共享树变动保持原样，未暂存任何文件。

## 验收发现的警告边界修正

真实浏览器验收发现浅色 warning 聚焦沿用 antd #faad14，白底仅约1.90:1。限定在 Input / InputNumber / Select 三个组件，把浅色 colorWarning、colorWarningBorderHover、colorWarningHover 校准为 #c47a00（白底约3.425:1），使警告默认 / hover / focus 保持琥珀语义且可辨。InputNumber 复用 Input 的 variants.js；Input 与数字框的 hover 消费 colorWarningBorderHover，Select 的 outlined hover 消费 colorWarningHover，focus 均消费 colorWarning。核查位置为 antd 6.6.6 `input/style/variants.js`、`input-number/style/index.js` 与 `select/style/select-input.js`，没有添加页面或全局CSS。

深色保持原语义值；其既有 hover（Input系）约2.50:1，本轮不将其误写成新达成的3:1承诺。浅深警告focus及错误focus均由实际provider变量新增≥3:1守卫，hover同时验证两种真实消费规则和继承值。Provider根上的全局warning变量必须继续等于原始有效token，防止局部校准污染全局警告色对；无边框warning继续保留原focus-visible规则和宽度，disabled仍不可聚焦。

同步三份现行设计文档、Web sidecar字段warning角色/preview；sidecar error与warning选择器补 :not(:disabled) 以维持hover/disabled优先级，局部patch重新生成。没有改动Office/服务端代码、没有提交。

修正后限定检查：主题109/109（`/tmp/mimir-form-warning-theme-final-test.log`），Renderer typecheck（`/tmp/mimir-form-warning-final-typecheck.log`），oxlint / oxfmt --check / git diff --check 均通过；AntD lint两文件0 issue、0 skipped（`/tmp/mimir-form-warning-antd-lint-{tokens,test}.json`）。最终真实浏览器确认及全仓pnpm check由主会话执行。

主会话最终浏览器确认已回报：浅色六类warning字段均rgb(196,122,0)、1px、无外扩阴影；深色warning保持#d89614，error及disabled保留。证据见同目录 `warning-final-evidence.json`、`browser-review.md` 与 `controls-matrix-*-final.png`。临时fixture和5174自建服务已由主会话清理。
