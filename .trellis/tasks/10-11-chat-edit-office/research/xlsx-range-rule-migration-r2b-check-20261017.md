# XLSX R2b 正式独立检查

2026-10-17，checker `/root/xlsx_range_rules_r2b_check`。**本片独立检查 PASS，生产14文件冻结；只放行普通同尺寸单矩形 CF/DV copy/move 迁移进入 root 真实浏览器验收。整体任务仍 in_progress，R3 特殊粘贴未集成，不由本报告证明。**

## 依据与范围

已读当前 PRD、design、implement 的相关合同，R2b plan/implementation、R2a 正式检查与 shared/contract/xlsx-agent 的现行规则、Office engine/editors 和 Server tests/项目质量规则。固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 与官方 Univer0.25.1 依据沿原批准计划；WeKnora v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`、cached site SHA `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`、definitions SHA `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0` 已核对原记录。WeKnora 只支持 KB/Agent 能力门控参考，不作为 Office 剪贴板语义。本次是代码检查，无新 HTTP、最新版或 Excel 实测声称。

检查保留原 R2a merge/hyperlink/rich-text/CDATA/实体/字节清单和取消历史回归，新增 CF/DV source/target 差集、首 sqref anchor、相对/混合/绝对与跨表引用、CFVO/dxf/priority、第三表保护/未知扩展、新规则真实候选验证及原子发布。

## Findings (fixed)

- File: `apps/server/src/test/xlsx-range-rules.check.test.ts`（本 checker 新增）
- Issue: 需要独立于 planner 的逐格语义预期，及真实组合候选失败/取消后零发布证明；仅使用 owner 的规划断言不足以提供独立证据。
- Fix: 新增8个正式测试。4个参数组用独立 A1 读取和逐格数学预期覆盖80组配置：copy/move、同表 overlap/跨表、源域拆分、非排序首 sqref、相对/混合/绝对引用；逐格比较真实输出规则引用与作用域，不以实现的重锚函数生成期望。另4个实际 ZIP/Agent/host 场景证明 copy/move 的新 DV 失败或完成候选后取消均保持原 bytes、version0、history0、clean 且无 onChanged；完成候选含真实 CF/DV、merge/link。
- Issue: 首版新测试自身3处 no-shadow lint。
- Fix: 重命名局部 cellsXml 与 promise complete 变量，未降低规则、未修改原有断言或生产代码。

没有修改生产实现，没有发现应交 owner 修复的生产缺陷。

## Findings (not fixed)

无未修复的本片代码缺陷。下列仍是验收边界：

- root 的实际 1280×800 / 420×500 浏览器 CF/DV copy/move、画布、保存/下载/重开与完整字节 Undo/Redo 未由本 checker 执行；须独立进行，不能用组件测试替代。
- `pnpm check`、全仓构建和全部格式工具审计由 root 最后统一执行，本 checker 未执行；不以本片定向绿代替全仓完成。
- 特殊粘贴 R3 helper 仅预备存在，当前运行时未接线；本片没有授予 fill/filter/sort/notes 或任意复杂公式新的许可。动态/未知规则、部分引用和不能等价分片的统计域保持准确拒绝。
- 本次未做 Desktop、真实模型/provider 或 Excel 客户端实测。

## 关键代码核对

1. copy 使用冻结源结构与规则候选一次叠加；move 对全簿规则先规划，随后只重写单元格 f，避免规则迁移两遍。规则 permit 是绑定原 XML/entry/非空实际矩形的 WeakMap 私有能力，不能从 HTTP/schema 伪造。
2. source/target subtract/shift/normalize 不枚举整列；分片、规则、运算和4MiB预算在候选发布前检查。原始规则顺序、dxf身份与 stop/提示参数保留；新CF priority唯一稳定。
3. host 从实际候选读取新DV；WeakMap以实际 Uint8Array 身份关联目标/依赖域，覆盖未变值和缺省空目标，copy/move无 manual_cell warning 确认权限。旧区外无效值和新补空占位不误触重验。
4. 第三表未知顶层/ext及真实写保护守卫保留；原R2a原生relationship/merge/link guards和字节清单回归均绿。
5. `xlsx-native-xml.ts` 的唯一运行时 import 是 fast-xml-parser，无 xlsx/pivot 回边；旧 Server reader 与 pivotXmlTree 入口重导出。消除了新引入的 native→pivot→xlsx→native 链。actual pivot layout Server27项与Office透视资格/控件原有回归通过。
6. 浏览器与host共用 QName、CDATA和一次实体解码；list按当前格和首sqref平移，跨表predicate读取实际依赖表/cache。共享规范已同步7节合同，未发现需要新增另一份规范。

## Verification

| Gate | Result | Evidence |
| --- | --- | --- |
| 最终合并 Server 原R2a10文件 + 新R2b3文件 + validation-route/sort/pivot | **16 files / 454 passed，0 failed，0 skipped，exit0** | `/tmp/mimir-r2b-independent-server-final-20261017.log` |
| Office 原R2a3文件 + rule-reading/validation-list/Editor.validation/Editor.pivot/pivot-controls | **8 files / 79 passed，0 failed，0 skipped，exit0** | `/tmp/mimir-r2b-independent-office-fullscope-20261017.log` |
| Server TypeCheck（包含最终新增检查文件） | **PASS，exit0** | `/tmp/mimir-r2b-independent-server-types-final-20261017.log` |
| Office TypeCheck | **PASS，exit0** | `/tmp/mimir-r2b-independent-office-types-20261017.log` |
| 21 本片生产/测试文件 oxlint --deny-warnings | **PASS，exit0** | `/tmp/mimir-r2b-independent-lint-final-20261017.log` |
| 同21文件 oxfmt --check | **PASS，exit0** | `/tmp/mimir-r2b-independent-format-final-20261017.log` |
| tracked本片路径 git diff --check | **PASS，exit0** | `/tmp/mimir-r2b-independent-diff-20261017.log` |

实际命令使用 `apps/server/node_modules/.bin/vitest`、`packages/office/node_modules/.bin/vitest`、各包直接 tsc 和根直接 oxlint/oxfmt，没有 pnpm exec/install，也未改 manifest/lock、vendor、提交/暂存/归档或删除测试件。首次误选根不存在的 vitest 路径 exit127，未计入测试gate；随即改用正确包路径。

最终Server命令：

```sh
./node_modules/.bin/vitest run src/test/xlsx-range-rules.check.test.ts src/test/xlsx-range-rules.test.ts src/test/xlsx-range-rules-host.test.ts src/test/xlsx-range-structures.test.ts src/test/xlsx-range-structures.check.test.ts src/test/xlsx-range-disjoint.test.ts src/test/xlsx-rule-footprint.test.ts src/test/xlsx-agent-range.test.ts src/test/xlsx-agent-host.test.ts src/test/xlsx-validation-host.test.ts src/test/xlsx-validation-route.test.ts src/test/xlsx-multilevel-sort.test.ts src/test/xlsx-pivot-layout-edit.test.ts src/test/xlsx-manual-ops.test.ts src/test/xlsx-range-styles.test.ts src/test/xlsx-agent-route.test.ts
```

保留新检查用例首轮日志 `/tmp/mimir-r2b-independent-oracle-first-20261017.log`：3个参数组因测试自己把 A1 相对引用放在首锚点 C3、又应用到A1而产生越界原件，正确被生产拒绝。将该多sqref测试的输入限定为有效E5四类引用后通过80组有效语义检查；其余 A1 四类在首锚点A1/J10场景全部保留。没有修改生产或原有测试来通过。后续8项实际host场景均通过。

## 冻结与交接

- 生产14文件SHA256：`/tmp/mimir-r2b-independent-production-freeze-20261017.sha256`；完整本片21文件路径：`/tmp/mimir-r2b-independent-paths-20261017.txt`。
- 本次正式测试会重新生成 `/tmp/mimir-xlsx-range-rules-20261017.xlsx`（owner原测试内行为）；root必须先复制固定浏览器baseline并重新取SHA，不能用旧生成SHA断言当前文件。没有上传、删除或提交该fixture。
- Server runner释放；本 checker创建的全部测试/类型/静态进程已结束。通过后仍由root决定R3原生产文件所有权的显式交接，不从本报告自动推断已完成R3。
