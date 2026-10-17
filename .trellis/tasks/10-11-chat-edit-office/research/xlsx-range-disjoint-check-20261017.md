# XLSX R1 不相交结构独立检查

2026-10-17，正式 `trellis-check`。**当前结论：返工后的 R1 独立代码复审通过，交 root 统一构建与生产浏览器验收**。下方首轮失败与修复历史保留，最新结论与证据见末节“返工后的独立复审”。不开展 S 多级排序或 R2 结构迁移，不宣称全部工具完成。

依据：`xlsx-range-disjoint-implementation-20261017.md`、`xlsx-range-sort-followup-plan-20261017.md`、server/Office 规范与实际 native host → handle 路径。竞品研究沿用方案中的固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，以及同日缓存的 WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`；本次是源码检查及原生反例验证，没有重新联网研究声明。

## Findings (fixed)

- File: `apps/server/src/services/xlsx-range-features.ts`
  - Issue: 仅识别 `extLst` / `AlternateContent` 和若干保留局部名称，`<custom:rangeFeature xmlns:custom="urn:unknown" ref="A1"/>` 可绕过未知顶层扩展拒绝，被证明不相交后继续排序。未知 MAIN 元素和伪装为 `custom:sheetData` 的外来顶层也存在同类问题。
  - Fix: 对 worksheet 直接元素同时核 MAIN namespace 与标准 CT_Worksheet 子元素集合，未知顶层明确拒绝。保留现有合法 metadata / drawing / print 等节点；不改写任何原生 XML。三个反例通过。
- File: `apps/server/src/services/xlsx-range-features.ts`
  - Issue: 预解析预算的 tag 正则只跳过注释的第一个片段，注释里连续伪闭合标签可扣减 depth。`<!-- </decoy>… -->` 加 70 层实际嵌套可绕过64层门槛。
  - Fix: 将完整注释和 CDATA 先作为整体 token 跳过，再计真实元素。新增反例已由红转绿；原70层拒绝、20,000 inline-string存储格及标准命名空间 CF 用例保持通过。
- File: `apps/server/src/test/xlsx-agent-range.test.ts`
  - Issue: 旧扩展拒绝测试使用未声明的 x14/xm prefix，却只接受包含“扩展”的文案；新 namespace guard 正确先报“未声明的命名空间”。
  - Fix: 断言接受“扩展”或“命名空间”，保留原拒绝及原件不变断言，不降低安全要求。

## Findings (not fixed)

1. **高优先级：CF/DV 相对公式的 sqref 范围依赖仍漏检。**
   - File: `apps/server/src/services/xlsx-range-features.ts::assertXlsxFeatureFormulaMoveSafe`、`xlsx-manual-ops.ts`。
   - 实际仅将存储的 anchor 公式传给 `moveXlsxFormula`。原生 `sqref="J1:K2"`、公式 `A1` / `A1>0` 的规则，在 K2 实际依赖 B2；剪切 B2 → D2 时原 anchor A1 不变，因此错误放行。CF、DV 两个真实 `applyXlsxOpsOnHost` 反例均失败。
   - 已保留 `move rejects cf/dv dependencies reached through a relative sqref offset` 红测试。需要有界、namespace-aware 的相对引用 footprint 检查，包含多矩形、绝对/混合引用、跨表与范围引用，避免遍历全列规则的每个格。
   - 未修原因：需要新的依赖范围算法，属于设计/实施判断。root 明确要求交回正式实施者，checker 不替代 implementer。不能删红测试、直接取消规则守卫或把 R1 当 R2 迁移完成。
2. **高优先级：原生带前缀的 sheetProtection 在三条范围写路径漏认。**
   - Files: `xlsx-agent-data.ts`、`xlsx-agent-range.ts`、`xlsx-manual-ops.ts` / 现有 native protection 提取接缝。
   - 插入合法 `<s:sheetProtection xmlns:s="http://schemas.openxmlformats.org/spreadsheetml/2006/main" sheet="1"/>`，同表 copy/move/sort 均能写入。现有保护提取及部分写守卫依赖未带前缀的正则；本问题并非只由 R1 引入，但 R1 新 native safety proof 不能放过。
   - 已保留三项 native host 红测试 `… respects native sheet protection expressed with a namespace prefix`。
   - 未修原因：需要统一确认各路径 source 读取权限与 target 写入保护的语义及接入点；root 要求返回正式实施者。不能在 copy 的只读 source 上随意新增与旧合同不一致的权限限制。
3. 规范中的排序整表拒绝语句仍需由 root 在 R1 真正通过后同步。实施报告已明确 root 所有权，本次保留其他 agent/root 的共享 dirty spec，不抢改。必须如实保留“相交/不可靠拒绝”与本次新增的规则/保护边界。

## Verification

- Lint：owned 九文件 `oxlint` exit0，无警告或错误；`oxfmt --check` 与限定 `git diff --check` exit0。
- TypeCheck：server、Office 均 exit0。日志 `/tmp/mimir-r1-check-server-types-20261017.log`、`/tmp/mimir-r1-check-office-types-20261017.log`。实施报告中的并行 DOCX TS 错误已由其 owner 消除；本 checker 未改 DOCX。
- Office agent：1文件 **15/15**，exit0，`/tmp/mimir-r1-check-office-tests-20261017.log`。严格 canonical identity、伪造同版本响应、session/dirty/round/undo/redo 接缝保持。
- R1 原生套件：**99项，94通过、5项上述真实缺陷失败**。筛除这5项后的定向证明为 **94通过/5跳过**，exit0，`/tmp/mimir-r1-check-fixed-tests-20261017.log`；这不是全绿验收。
- 邻接 server：agent-range、manual-ops、range-styles、agent-host、validation-host **5文件85/85**，exit0，`/tmp/mimir-r1-check-adjacent-tests-20261017.log`。包含原生关系/相交/范围预算、公式引用、DV 最终宿主门槛；未改确认 token 或授予忽略验证权限。
- 合并六文件首次最终运行是 **178通过/6失败**，`/tmp/mimir-r1-check-final-tests-20261017.log`；第6项是上述已修旧文案断言，随后其五文件套件85/85。仍不能报告完整六文件全绿。
- 初始独立红证据 `/tmp/mimir-r1-check-red-20261017.log`（3失败/90通过）；补充审计红证据 `/tmp/mimir-r1-check-audit-red-20261017.log`（7失败/90通过）。一次同时启动两份 server 测试发生共享 SQLite setup 竞争，已停止并以顺序单进程重跑固定及邻接套件，未将竞争输出计作产品缺陷。
- 未重跑已知 bundled-skill lint 基线的整仓 `pnpm check`；本次没有构建或浏览器声明。root 的全套、生产构建及420×500验收须在两类缺陷关闭后执行。

没有修改 vendor、UI、DOCX、shared schema/HTTP 鉴权，没有暂存、提交、归档、上传或删除测试文档。

## 返工后的独立复审（当前结论）

按 root 第二次正式派工复审实施报告的“独立检查返工”补记。原实施者完成 static grammar / affine footprint 与 namespace-aware writable guard；checker 没有替代其设计或重写算法。原5个真实红测试现均通过；没有删除、改弱或跳过它们。

### Findings (fixed)

- File: `apps/server/src/services/xlsx-range-features.ts`
  - Issue: 标准 CF 数据条/色阶/图标的阈值公式存于 `cfvo type="formula"` 的 `val` 属性，原候选提取只找 formula/formula1/formula2 文本。原生不相交 J1:K2 的数据条阈值 `$A$1` 在剪切 A1:B2 时被错误放行。
  - Fix: 将标准 MAIN 的 formula 型 cfvo 属性接入现有 footprint，无新增语法或迁移语义。真实宿主反例先红后绿；将引用改为 `$Z$1` 后仍允许，并保持原件未触及结构/ZIP条目精确，防止整类误禁。
- File: `apps/server/src/services/xlsx-range-features.ts`
  - Issue: 全簿依赖扫描只读 MAIN 普通规则，来源/目标之外工作表的 extLst/x14 规则未走扩展守卫，因此未知依赖可能漏过。
  - Fix: 抽出已存在的 worksheet 顶层/扩展检查供范围 guard 与全簿规则扫描复用；每个 owning sheet 都先验证相同的 MAIN 根/顶层集合与非 sheetData 扩展拒绝，再进行普通规则依赖分析。保持 sheetData opaque 内容的既有保留边界。第三表 x14 规则及未知顶层范围节点均明确拒绝。没有扩大为 R2 扩展规则迁移。
- File: `apps/server/src/test/xlsx-rule-footprint.test.ts`
  - Fix: 新增独立逐格依赖 union oracle，使用显式每格坐标偏移及范围枚举，对两端点 row/column 的全部16种绝对/相对组合、两个实际不连续 sqref、168个来源单格逐一对照，共2688次判定，均与 affine 结果一致。另新增表达式深度、引用数、token数与长度边界；测试断言遵守 no-conditional-expect。

### Findings (not fixed)

本轮未发现剩余 R1 代码缺陷。首轮 CF/DV sqref 相对依赖与 prefixed protection 两类问题已由正式实施者关闭。规范同步继续由 root 负责；真实浏览器、统一全套与构建仍待 root 执行，不能将本报告当成这些门槛已通过。

只读 protected copy source 保持允许；copy target、move source/target、实际改写普通公式的其他表均在 native 写入器复核保护。原生扩展、动态/命名/外链/结构化/3D 等不能静态证明的规则仍准确拒绝；这属于显式边界，不宣称所有 Excel 范围关联迁移已齐。

### Verification

- 最终 Server：**7文件241/241，exit0**，`/tmp/mimir-r1-recheck-freeze-tests-20261017.log`。含全部原5红、2类新增反例及正例、关系/相交/原件精确保留、预算、直接执行器保护、DV宿主、真实host→handle的单次发布与canonical no-op历史。
- Office strict agent：**1文件15/15，exit0**，`/tmp/mimir-r1-recheck-office-tests-20261017.log`；未修改 Office 代码。
- Server、Office typecheck exit0，`/tmp/mimir-r1-recheck-server-types-20261017.log`、`/tmp/mimir-r1-recheck-office-types-20261017.log`。
- owned11个源/测试文件 oxlint 无错误/警告；oxfmt check、限定 git diff check通过。没有修改共享 specs、UI 或其他 agent 所有文件。
- 独立新增反例初次 **148通过/2失败**：`/tmp/mimir-r1-recheck-audit-20261017.log`；局部修复后同两文件150/150。增加oracle/边界/第三表未知节点后为最终241项。
- Server测试进程顺序执行；未执行整仓已知skill lint基线、full suite、build或浏览器。无真实模型、Desktop或Excel互操作实测声明。

owned文件已再次冻结，root可继续统一验收；S/R2和全部Office工具仍按原计划推进。
