# XLSX 公式重算探针与实施边界

核对：2026-10-16。固定 GenOffice 为 `480548fd55f1be3593ee0d8e316a734751d58309`；公式实现仍未达到所有 Excel/GenOffice 能力，下面是明确的增量。

## 证据与选择

- [固定版原生 Cargo.toml](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/sheets/native/xlsx-engine/Cargo.toml) 依赖 IronCalc 0.7.1。[recalc.rs](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/sheets/native/xlsx-engine/src/recalc.rs) 结果只有 formatted、可选 number、is_error/is_formula，不能据此推断所有缓存类型。其严格导入器失败和跳过公式保留旧缓存的行为不能视为完成重算。
- crates.io 精确 `ironcalc` / `ironcalc_base` 0.7.1 元数据为 `MIT OR Apache-2.0`；下载归档 SHA256 与固定 Cargo.lock 分别 `8e07dd44…` / `9f208abe…` 一致。144 个锁定 registry 包的元数据取回115个，29个网络失败，未完成原生传递许可检查。当前 Darwin arm64 没有 cargo/rustc，因此没有声称原生构建通过。
- 官方 [`@ironcalc/wasm-xlsx@0.9.0`](https://registry.npmjs.org/@ironcalc%2fwasm-xlsx/0.9.0) `license=MIT/Apache-2.0`，`gitHead=297553dc3a37ec6b0f4821055220e3d26c4ac6a1`，无 npm 依赖。该包 README 和 `wasm.d.ts` 提供 `Model.fromXlsx` / `evaluate` / `toXlsx` / `getCellType`。`@ironcalc/wasm` 仅提供引擎，不含 XLSX 导入导出；成熟版0.8.4无法直接替代，wasm-xlsx仅0.9.0。
- Node临时探针实测 `getCellType`: number=1、string=2、boolean=4、error=16；`getCellContent` 对公式返回公式文本，不能用作结果。临时 `toXlsx` 导出的 `t`/`v` 能区分数字、TRUE/FALSE、空串、文本 `#N/A` 和错误 `#DIV/0!`。23→50 后 `=A1*3+1` 缓存70→151，`=SUM(A1:B1)` 93→201。
- 日期反例：给临时原件加 `workbookPr date1904="1"` 后，`=DATE(1904,1,2)` 应为1，引擎仍导出1463。当前必须拒绝1904重算，不能在临时导出后直接减1462（日期函数和引用链已按错误基准计算）。网格日期预览独立正确支持1904，此拒绝仅限重算。还观察到 `YEAR(1)` 按该引擎的早期日期语义得到1899；早期1900日期兼容性仍须补全，不能声称Excel日期函数完全一致。

## 已批准的供应链例外

包发布于 `2026-10-15T16:09:02.263Z`，安装被仓库24小时成熟期拒绝。主会话向用户说明后，用户2026-10-16明确批准仅 `@ironcalc/wasm-xlsx@0.9.0` 的精确例外。`pnpm-workspace.yaml` 保留 `minimumReleaseAge: 1440`，只加入该 package@version，未豁免其他版本。pnpm 12.4.2 的供应链检查随后通过；实际安装和测试结果由能力矩阵继续记录。

## 实施合同与未完项

- 共享HTTP现有 `xlsx-agent/apply-ops` 接收 `action=recalculate_formulas`、空ops；手动“公式→重新计算”和Agent `propose_operations({operations:[],recalculate:true})` 经同一版本、dirty、轮次撤销路径。普通写入不自动重算；这是显式计算切片，不代表最终完整计算策略。
- 隔离worker只读当前字节，初始化官方WASM，求值后临时导出；类型与导出t/v交叉校验。仅将原件已有普通公式格的缓存传入固定网关 `SheetFormulaValues`，不以引擎整体导出替换原件，不回写formatted。固定网关的formulaValues-only路径不加载目标sheet，适配层以空结构journal加载且不改结构；固定网关将空串当缺失缓存，适配层补`t="str"`及空`v`，写回后逐格核对类型和值，均未修改vendor。源公式、样式与未触及ZIP部件保留。
- 预算：2MiB压缩、8MiB解压、单项4MiB、500部件、20000已存储格、2000公式、单worker、20秒后硬终止；取消同样终止实际worker。Node resourceLimits限制JS堆，不是WASM线性内存硬上限，部署层内存隔离仍是未完风险。
- 1904、shared/array/溢出、外链、不支持函数、导入/缓存缺失/类型不一致/超预算/超时等明确失败，保留当前原件与旧dirty状态；不伪报全部或部分计算成功。所有函数、复杂原件、自动重算/超大表/1904/早期1900日期完整兼容仍未完成。

## WeKnora 必查

本轮重试站点 `https://weknora.weixin.qq.com/` 得 HTTP200；重试 v0.8.3 `internal/agent/tools/definitions.go` 网络超时，具体已核对证据沿用 [工具栏审查](../../10-16-genoffice-editor-capability-audit/research/toolbar-assessment.md) 的 WeKnora v0.8.3 / commit `3e22822c1d2397be730c458c7539d0eb8c113a24`。其 search_knowledge/read_document 与wiki写工具可参考Agent权限及注册边界，没有电子表格原件计算引擎合同，故不作为本片公式重算主参考。

## 当前验证（2026-10-16）

真实WASM与旧host两文件24项通过，Office七文件105项通过。旧缓存999被实际计算并回写70；类型、依赖、未触及ZIP、两次保存、超时/取消均覆盖。Office typecheck与focused oxlint通过。server生产build通过；直接调用构建产物的隔离worker成功，Python独立XML/ZIP读回确认缓存、空串类型、全部源公式和未改条目保真。server typecheck最新仅被并行PDF测试`pdf-forms.test.ts:91`的TS2769阻断，已通知owner。浏览器夹具`/tmp/mimir-xlsx-recalc-browser.xlsx`已交主会话继续真实验收；桌面与全部公式兼容仍待验。
