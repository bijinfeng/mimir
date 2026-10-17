# XLSX S 多级手动排序独立检查

2026-10-17，正式 trellis-check。结论：**退回实现，3 个原生写入问题仍未修复**。本轮冻结后释放 S 文件所有权；root 重新派给原实现者，再独立复查。不计生产浏览器通过或全部工具完成。

## 范围与依据

读取 active task PRD/design/implement、check 上下文、S 计划和实施报告，以及项目、server、Office engine/editor、XLSX 合同。检查 shared 私有 schema → host 分流 → 原生 data writer → Editor 句柄 → Inspector 的实际路径。保持固定公开 Agent DSL、R1 helper、DV token、Manage 六文件和其他 dirty/vendor 不变；仅增加 S 现有两份测试及本报告。

主依据固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，`ribbon-actions.ts:1553–1579` 的有序 orderRules/hasTitle，以及固定 `domain/sort-range.ts` 的 typed/stable/null-last 比较器。WeKnora 适用性沿同日官网/公开源码缓存 v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`：站点 SHA `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`，definitions SHA `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`。只支持能力如实门控，不作为 Office 多级排序/工具栏主要依据，本次没有重新联网成功声明。

## Findings (fixed)

- `apps/server/src/test/xlsx-multilevel-sort.test.ts`：补独立 48 行 ×8 级比较 oracle，采用从主要级到次要级的 lexicographic comparator，与实现从末级到首级稳定排序的组织独立；包含数值、布尔、自然数字文本、大小写同值、错误文本、null，以及重复 key vector。两组相反混合方向均通过，非目标 ZIP 保留断言通过。修正新增测试的 no-shadow 命名警告。
- `packages/office/src/editors/XlsxDataControls.test.tsx`：补八级上限和 pending 时16个真实复合 Select disabled、单一 primary；补 Select 的 Escape 先关当前层再关 Inspector。初版测试同步断言早于 rc-select 的 MessageChannel close；按实际组件调度等待且明确断言完成，最终通过。这是测试驱动问题，没有修改产品键盘逻辑。

## Findings (not fixed)

以下均为原生解析/写入算法合同，按分工保留红测试退回原实现者，checker 没有静默改写：

1. **P1：合法单引号类型属性导致静默排错。** `apps/server/src/services/xlsx-agent-data.ts:101` 用只认双引号的 `attr(raw,'t')` 读取公式缓存类型。`<c r="A2" t='str'><f>"1"</f><v>1</v></c>` 与 `t='b'` 被当数值；预期 number→text→boolean，实际 boolean→text→number。新增 `independent oracle: keeps native formula string and boolean cache types with single-quoted attributes` 红。建议按真实 cell opening tag 的 XML 属性解析器取类型，保留原 native XML，不能把未识别合法类型当 n。
2. **P2：合法实体数值缓存误拒绝。** 同文件`:100–111` 在解码 XML 字符引用前直接 `Number(cache)`；`<v>&#49;</v>` 应为1，却报“排序键缓存无效；先重新计算”。新增 `independent oracle: decodes legal numeric character references in a formula cache before comparing` 红。建议先按 XML 值解码，再进行原生类型/有效数值校验。
3. **P2：其他行排序时改写未移动行公式。** 同文件`:149–160` 对 sourceRow===targetRow 的公式仍 decode→translate(delta0)→escape，令原 `<f>&#65;3+$A$1</f>` 变成 `<f>A3+$A$1</f>`。新增 `independent oracle: does not normalize an unchanged middle row formula during a real permutation` 红，值排列正确但原生精确保留不成立。建议未移动单元格保留原 XML；对实际移动的公式才进行必要平移。

另有 **本片以外活动 E0 的 typecheck 故障**：Office tsc 报 `src/docx-encryption-native.test-helper.ts:14` 的 `"transform"` 不可赋给 `"strip"`。未改他人活动文件，已告 root；不能把本轮 Office 类型结果记 green。

## Verification

- Server 本片：**20 PASS /3 FAIL（23）**，exit1，`/tmp/mimir-s-check-native-oracle.log`。19 个原实施例及新增48行独立 oracle 通过，3 个上述 native 红；更早首次复现19 pass/3 fail记录 `/tmp/mimir-s-check-native-initial.log`。没有 skip 隐藏缺陷。
- Office 最终当前组件+真实 Editor：**2文件14/14 PASS，exit0**，`/tmp/mimir-s-check-office-keyboard-final.log`。含原生宿主排序单次 publish/history、save→undo/save→redo/save 完整非目录 ZIP、identity no-op，range/source/close/其他 Inspector 接管的迟到结果拒绝，以及本轮两项组件检查。
- Office 相邻首次五文件：4文件通过、1文件失败；**112 PASS /1 FAIL（113）**，`/tmp/mimir-s-check-office-final.log`。唯一失败是本轮 Escape 测试未等待宏任务；修正后重跑上述14项通过。其余 Editor/DV/Agent99项未在测试修正后重复，不伪称五文件113一次全绿。
- shared/server types：**PASS，exit0**，`/tmp/mimir-s-check-{shared,server}-types.log`。Office types：**FAIL**，上列活动 E0 故障，`/tmp/mimir-s-check-office-types.log`。
- S9个 TS/TSX oxlint：**PASS，0 warning/0 error**，`/tmp/mimir-s-check-lint-final.log`。
- S10源/测试/CSS oxfmt check：**PASS**，`/tmp/mimir-s-check-format-final.log`；style guard PASS，`/tmp/mimir-s-check-style.log`；限定 `git diff --check` PASS。
- Antd DataControls 扫描：**issues=[] / skipped=[] / partial=false**，`/tmp/mimir-s-check-antd.json`。
- 未运行整仓 pnpm check（已知 bundled skill lint）；未构建、浏览器/Desktop、模型调用、Excel 互操作、上传/删除、stage/commit/archive。

## Root 后续

保留本轮红测试，派原实现者修复上述原生问题，冻结后复查；当前生产代码未由 checker 修改。root 统一解决活动 E0 类型故障、完整 gates、320px Inspector 的1280及420×500真实浏览器验收和唯一 spec 同步。建议唯一 XLSX 合同记录私有1–8有序规则、原生typed cache、必要公式平移、未移动 XML 原样、identity无历史语义，避免重复进程流水进入规范。R2复杂相交结构迁移仍未实施，不以 S 代替。

## 第一次返工独立复查（2026-10-17）

**最新结论：原3项已修复；仍有1项新增的单次解码反例，继续退回实现。** 没有更改产品代码，仅在既有非法类型 loop 加入 `&#x26;#115;tr`，保留失败测试。S文件再次冻结并释放，后续由root派原实现者。

### 已确认修复

- `sortCellType` 在R1完整原生验证后读取真实c opening tag quoted属性，合法单引号、等号空白、quoted `>` 和decoy属性内容不再丢失类型。
- 原合法数值缓存字符引用可参与比较；未移动行不再进入replacements，其原row/cell/formula词法、空c与空洞精确保留。
- 原3红和原独立48行八级oracle本次均通过，无skip或断言弱化。

### 唯一未修复问题

**P2：混合字符引用仍会双解码，未知类型被放行。** `apps/server/src/services/xlsx-agent-data.ts::sortCellType` 和cache分支复用的 `decodeXlsxXml` 按hex→decimal→named多次replace。属性 `t='&#x26;#115;tr'` 按XML只能解码为字面 `&#115;tr`，属于未知type，应原子拒绝；当前先hex把`&#x26;`变成`&`，再decimal把新形成的`&#115;`变成`s`，错误得到`str`并返回真实排序字节/version8。既有invalid-type loop新增该值后稳定失败，`/tmp/mimir-s-recheck-native.log`。原`&amp;#115;tr`拒绝通过不足以证明单次解码。

这是本片新增“原始属性/cache只解码一次”的算法合同，checker按职责交回实现者。建议只在sort私有范围使用按原始输入单pass匹配的XML字符引用解码，统一用于原始t属性和cache；不要顺手改变共享decode函数其他消费者。保留该反例，且合法原有decimal/hex/string/boolean仍须通过。

### 本次验证

- Server本片：**25 PASS /1 FAIL（26），exit1**，`/tmp/mimir-s-recheck-native.log`。唯一失败为上述新反例；之前3红全绿。
- Office组件+真实Editor：**2文件14/14 PASS，exit0**，`/tmp/mimir-s-recheck-office.log`；本次没有UI产品改动。
- Server/Office typecheck：**均PASS，exit0**，`/tmp/mimir-s-recheck-{server,office}-types.log`。前轮活动E0类型故障已由原owner修复，本checker没改DOCX。
- S9TS/TSX oxlint **PASS零warning/error**，`/tmp/mimir-s-recheck-lint.log`；10源/测试/CSS format check **PASS**，`/tmp/mimir-s-recheck-format.log`；限定diff check PASS。UI/CSS未改，前轮style/Antd证据沿用。
- 没有重复整套、build、浏览器、Excel互操作、上传/删除或git写操作。正式native最终PASS尚未成立，root本片生产浏览器继续等待实现者修复后复查。

## 最终限定复查与机械调用点修复（2026-10-17）

**最新结论：S 本片原生代码检查 PASS，27/27 native 回归通过；文件再次冻结并释放。** 前述失败历史保留，不代表当前仍有未修复项。root仍负责完整门禁、真实浏览器与唯一spec同步；此结论不等于R2或全部工具完成。

### Findings (fixed)

- 实现者私有 `decodeSortXml` 使用原始输入的单次匹配回调；原混合实体未知type反例已准确拒绝，合法type/cache实体继续通过。review确认不重扫回调返回值，没有改共享decoder。
- 复查发现同文件实际移动公式的调用点仍用共享多阶段decoder，属于已实现单次解码原语的遗漏接线。新增一个有具体语义损失的回归：原 `A2&"&#x26;#49;"` 表示连接字面`&#49;`，移动后应为 `A3&"&#49;"`；遗漏调用点使结果变成 `A3&"1"`。native XML红证据保留 `/tmp/mimir-s-final-recheck-moved-formula.log`（26 pass/1 fail）。
- root明确授权checker直接修这一机械调用点后，`apps/server/src/services/xlsx-agent-data.ts` 仅将移动公式分支的 `decodeXlsxXml(formula)` 改为 `decodeSortXml(formula)`；未改公式相对引用平移算法、共享decoder、R1、UI或其他owner。新增回归留在 `apps/server/src/test/xlsx-multilevel-sort.test.ts`，验证A2→A3同时字面引用不被再次解码。

### Findings (not fixed)

本片本次限定检查没有剩余确认缺陷。真实1280/420×500界面验收、root全套门禁及R2仍按既有任务分工，不用本次代码测试代替。

### Verification

- 最终 native：**1文件27/27 PASS，exit0**，`/tmp/mimir-s-final-recheck-fixed-native.log`。包括此前全部3红、单次混合实体拒绝、48行八级独立oracle、stationary完整XML和最新实际移动公式字面量回归。
- Server typecheck：**PASS，exit0**，`/tmp/mimir-s-final-recheck-fixed-server-types.log`，直接运行本包tsc。Office没有改动，沿上一轮本checker的Office types PASS与2文件14/14行为通过，不重复声明本轮重跑。
- writer+native test限定oxlint：**PASS，0 warning/error**，`/tmp/mimir-s-final-recheck-fixed-lint.log`；oxfmt check **PASS**，`/tmp/mimir-s-final-recheck-fixed-format.log`；限定git diff check PASS。
- 未运行新的整套、build、浏览器、模型、Desktop、Excel互操作、上传/删除、stage/commit/archive。没有新增可选扩大矩阵，唯一新增native测试针对实际发现的公式文本变更。
