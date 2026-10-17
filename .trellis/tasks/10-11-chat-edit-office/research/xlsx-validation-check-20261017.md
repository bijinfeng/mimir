# XLSX 数据验证独立 check

2026-10-17，`pdf_image_upload_ui_check`，正式 trellis-check 子代理。范围以 `xlsx-validation-interactions-next-plan-20261017.md` 与冻结 `xlsx-validation-implementation-20261017.md` 为准。未派嵌套代理；未改 vendor、暂存、提交、归档或删件。复用该方案已核对的固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`、WeKnora v0.8.3 缓存证据，本次是代码验收，不声称重新访问官网。

## Findings (fixed)

1. `packages/office/src/xlsx-validation-list.ts`：名称预算循环在第8次成功解引用后无条件抛错，实际只允许7层。现仅当仍需第9次解引用时拒绝。新增8层接受/9层拒绝边界回归，先红后绿。
2. `packages/office/src/xlsx-cell-effects.ts`：whole/decimal/date/time/textLength 的 formula1/2 没有像 custom 一样按 sqref 首个范围锚点平移。原生 C1:C2 规则 `>D1`、D1=1/D2=10 时，向 C2 写5错误成功。现复用既有有界解释器的行列偏移，保留 `$D$1` 绝对引用。真实宿主ZIP测试先红后绿，绝对引用仍成功。
3. 同文件：比较/custom 引用的其他格若是未缓存公式，原 callback 将其作为空值读取，比较时可变成0。现在实际引用处明确拒绝未知结果。真实ZIP将 D2 改成无缓存 SUM 公式，原宿主错误接受5；新增回归已先红后绿。
4. `packages/office/src/editors/XlsxValidationDropdown.tsx`：固定定位列表只监听 resize，网格滚动后仍停在旧单元格位置。现捕获外部 scroll 关闭，但允许列表自身滚动。实际 Editor 回归先红后绿，并断言零宿主调用/零history。

测试补充：`xlsx-validation-list.test.ts`、`XlsxEditor.validation.test.tsx`、server `xlsx-validation-host.test.ts`。实际 Editor 另覆盖原生 paste 到 warning 格整批拒绝、无确认按钮/零发布；同一真实句柄的模型 args 伪造 `validationConsent` 不传入私有宿主字段，仍拒绝。原有 AltDown/literal/原生stop-info-off/显式取消/双确认/A→B→A/迟到/Inspector固定主操作/完整保存历史回归均保持。

仅在现行唯一合同 `.trellis/spec/shared/contract/xlsx-agent.md` 的原生DV节补一条相对/绝对引用与未缓存来源严格拒绝，未新增架构取舍。

## Findings (not fixed)

本片未留已确认的代码问题。1280及420×500生产浏览器、完整Office/server套件和构建由root统一执行；本报告不能替代真实popup几何、Inspector内部滚动/固定footer、焦点或保存重开浏览器证据。复杂Excel公式仍按现有有界支持范围明确拒绝。未做真实模型调用，Desktop按用户要求自行验收。

## Verification

- Office：目标3文件 **24/24 pass**（resolver/native6、实际Editor9、既有Agent9）；`/tmp/xlsx-validation-check-office-20261017.log`。
- Server：目标4文件 **24/24 pass**（native validation host14、auth route1、既有agent effects/properties9）；`/tmp/xlsx-validation-check-server-20261017.log`。
- Renderer：目标API bridge **2/2 pass**；`/tmp/xlsx-validation-check-renderer-20261017.log`。
- TypeCheck：Office、Server、Renderer `tsc --noEmit`均exit0；`/tmp/xlsx-validation-check-{office,server,renderer}-types-20261017.log`。Renderer直接exec tsc，未生成路由。
- Lint：18个目标TS/TSX oxlint exit0；`/tmp/xlsx-validation-check-lint-20261017.log`。19个目标TS/TSX/CSS oxfmt check pass。Dropdown、OptionsControls、XlsxEditor分别运行antd lint，三次issues0。`pnpm lint:styles`、`git diff --check` exit0。
- 红测证据：`/tmp/xlsx-validation-check-red-office-20261017.log`（名称）、`...-red-server-20261017.log`（相对引用）、`...-red-dropdown-20261017.log`（外部滚动）、`...-red-cache-20261017.log`（无缓存来源）。初期新增Agent测试漏传execute的必需options，已立即补`{}`，最终三包types通过。
- 未重复已知有480条既有skill lint问题的全仓`pnpm check`；未跑全量suite/build/browser。浏览器夹具沿实施交接 `/tmp/mimir-xlsx-validation-20261017.xlsx`，原生测试引用另外构造验证规则，不改该浏览器夹具。

## 冻结交接

以上改动与目标门禁完成后冻结。Root可继续统一门禁/生产浏览器；本代理不再并行改动DV文件。
