# Desktop 精修独立检查

检查日期：2026-10-20。任务基线 `53285bbdeaa17475e04aae517f07c957776cb6b6`，检查时仓库 HEAD `d9b5e7708617714323cfcbf81a8091b9addd1e6c`。读取本任务 PRD、design、implement、check.jsonl 对应规范及研究后，限定检查 5 个 Desktop renderer 文件。未修改产品、测试、gallery 或父任务记录，未提交。

## Findings (fixed)

无。没有需要机械自修的问题。

## Findings (not fixed)

未发现本次改动的阻断项或需要产品决策的缺陷。

代码路径核验：

- `SetupPage.tsx` 不再在 read pending 时提前 return null；沿同一窗口栏、WindowControls、品牌与表单区域显示 `role=status` 的真实读取状态，未提前显示首启表单。读取失败重试仍沿原 readCurrent/alive 生命周期，旧结果卸载后不发布。
- `submit` 先检查桥、同步 ref 门闩及 cloud trimmed 空地址，再设置 pending 并调用原 `mode.choose(payload)`。ref 在首次 await 之前置位，故同帧 Enter/点击均不能重复调用；失败/reject 释放门闩及 pending、清进度而保留地址；成功只执行一次 `activate()`，并保持 pending/门闩等待宿主导航，没有提前解锁。
- 两阶段 choose/activate、本地/云端 payload、无协议地址、当前模式预填、返回不改及宿主探活/归一化合同保持。地址仍是受控 Input，未引入会阻止无协议值的原生 form validity 流程。Ant Design 6.x CLI 元数据确认当前使用的 Input value/disabled/onPressEnter、Button disabled/loading 为支持 API。
- 提交状态在独立 `role=status` 区域，动作区有 `aria-busy`；加载、失败重试、提交成功等待的相应分支均有真实组件回归。读取期间窗口最小化/关闭仍可调用桥，setup 继续 omit maximize。
- 样式只修改 Setup 的局部间距/短高断点/长文本边界、About 的局部密度与长值折行，TitleBar 只新增 token focus-visible。drag/no-drag、macOS 88px 原生控件留位、原 WindowControls 的 46×44 命中区均未改。
- `apps/desktop/src/main`、`src/preload` 及 `packages/shared/src/desktop.ts` 无 diff；权限、令牌、Session、云端 URL、持久化与 IPC 合同没有改动。About 只改样式，query、错误和重试分支保持。
- 本次落实既有表单提交守卫、主题和焦点合同，没有新增应另写现行规范的持久取舍，未为登记实现过程扩写 `.trellis/spec/`。

测试运行器输出了现有 Vite 对未来 native config loader 的兼容性提示，涉及未修改的 `vitest.config.ts` / `renderer-alias.ts` 模块格式；当前命令退出 0，未据此扩大本轮配置范围或抑制提示。

## Verification

- Lint：**pass**，`pnpm exec oxlint` 限定本轮 5 文件。
- TypeCheck：**pass**，`pnpm --filter @mimir/desktop typecheck`（含正常 routes:generate），退出 0；生成路由未产生 diff。
- Format：**pass**，`pnpm exec oxfmt --check` 限定同 5 文件。
- Diff whitespace：**pass**，`git diff --check --` 限定同 5 文件。
- Tests：**pass**，`pnpm --filter @mimir/desktop exec vitest run --reporter=json --outputFile=/private/tmp/mimir-desktop-check-results.json`，**7 文件、57 项**，退出 0，JSON `success=true` / `numFailedTests=0`。

| 测试文件（`apps/desktop/src/`） | 通过数 |
| --- | ---: |
| `renderer/setup/SetupPage.test.tsx` | 15 |
| `renderer/components/TitleBar.test.tsx` | 5 |
| `main/artifacts.test.ts` | 4 |
| `main/cloud.test.ts` | 14 |
| `main/config.test.ts` | 7 |
| `main/host.test.ts` | 7 |
| `main/security.test.ts` | 5 |

本轮新增 7 项必要用例：读取等待保留窗口/品牌、不提前显示表单；读取失败重试等待；读取卸载后迟到结果；空/空白 URL 的 Enter；同帧 Enter+点击一次提交与成功持续 pending；result/reject 两种失败保地址并原址重试。所有 deferred 请求在用例结束前明确结算；没有用固定延时冒充请求完成。

## 未验边界

本检查未操作浏览器或原生窗口，不把 happy-dom 的 DOM/桥调用断言当作布局像素、实际窗口拖动/最小化/关闭、macOS 红绿灯、原生菜单/消息框、系统权限或真实云端连通的通过证据。源码 19 个表面/流程记录也不是 19 次 GUI 验收。

主会话继续负责冻结真实 before/after、同内容/主题/尺寸 HTML 对比、键盘及短高/长内容 GUI、三段 build、适用原生启动自检与全仓 `pnpm check`。当前 macOS 锁屏限制沿 PRD 准确记录，不能用浏览器模拟桥补记为原生 UI 已验。
