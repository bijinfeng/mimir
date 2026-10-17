# DOCX C2 受保护批注锚点：独立检查

2026-10-17。检查范围是已批准 C2，不包含后续 forms、修改密码与强制修订。读取了任务 check 上下文、PRD/design/implement 的现行要求、保护方案 §4、实施报告与 Office 原件保护/编辑器规范。没有修改 vendor、XLSX、PDF、server，也没有提交、暂存、删除或归档。

## Findings (fixed)

### 1. 删除原件最高编号后，新根/回复复用了原件身份

- 文件：`packages/office/src/agent/docx-agent.ts`、`src/docx-protected-anchors.test.ts`。
- 原因：add/reply 都只从当前评论列表计算 next ID。删去原件最高编号后，下一次新增复用该 ID；私有原件校验将其识别为旧评论，因作者/日期/parent 变化拒绝合法动作。
- 复现：将样本复杂 root2 改为普通可删单段，删除2，再新增；先红日志 `/tmp/mimir-c2-identity-regression-before.log`，失败位于 native immutable identity 检查。
- 修复：同一 session 的分配同时考虑当前列表及 controller 私有原件评论 ID，删除的原件 ID 继续保留。只改两处 comments 调用，notes 的编号规则不变。
- 回归：删原件最高 root→新根3；删除原回复及新根→追加到原root0的回复3；保存并独立重开确认完整父子身份。

### 2. 前置 SDT 展开使相同文字匹配到另一原生段落

- 文件：`packages/office/src/docx-protected-comments.ts`、`src/docx-protected-anchors.test.ts`。
- 原因：engine 会把顶层 SDT/altChunk 展开为多个 docxIndex；`body.children[docxIndex]` 之后不再可靠对应 PM 段落。只验证完整文字相同，仍会在重复段落中授予错误锚点资格。
- 复现：先放包含两段的 SDT，再放两个文字完全相同的普通段。PM 第2块的 docxIndex2 指到 raw 的另一相同段；旧实现返回可新增资格。先红日志 `/tmp/mimir-c2-sdt-mapping-regression-before.log`。
- 修复：遇到当前或前置原生 SDT/altChunk 后不再从该序号推断原生身份，对受影响段落拒绝可变锚；原件与已有讨论仍可读保留。前面的可证明普通段不受影响。没有扩大 C2 的原生映射接口。
- 回归：真实 SDT 展开且同文段落样本必须给出原生锚点原因，add 拒绝，version/metadata/整件原始字节不变。

## 已核对的实际路径

- 私有原件映射保存实际 paragraph/run/w:t 位置；普通单段、跨富 run、同一 raw run 两处不相交批注与 UTF-16 完整码点边界。
- 受限保存先比较去且仅去 comment marks 后的真实 PM Fragment 正规化正文，并保留 raw canonical 不变量；伪造标记、丢非批注字形、搬旧锚、正文/段落属性变更均拒绝。
- 原根删除仅去对应 namespace/ID 的原生三类锚节点；回复单独删除不触正文；根讨论删除需明确包含回复。复杂锚点目标继续拒写。
- PM guard 只对 controller 验证的准确批注目标事务临时放行，普通输入、格式、附加结构与对象入口继续只读。另一 PM filter 拒绝时 metadata、dirty、version 和新 round 均不发布。
- 保存前冻结的 PM+metadata 由最终 session 再验；多次保存、首条评论关系/类型创建、未知 XML/非目标 ZIP entries 保留、结构撤销归原均有 native/handle 回归。
- 真实 DocxEditor 测试包含 Inspector 固定正文/动作结构、唯一 primary、选区冻结、添加/管理/删除、Escape 回 live 入口，以及保存后再次修改。
- 将已有“新增→保存→管理→删除→二次保存整件归原”的真实组件测试强化为 io.save 触发宿主重新 render，并断言保存前后 published handle 同一对象、version1 保持；该路径通过。

## Findings (not fixed)

1. **保存后结构撤销是既有产品边界。** HEAD 与当前 `markSaved()` 都清 rounds；DocxEditor 保存成功也清 manualStructureRound。本片只承诺有效的未保存结构 round 回退；普通 Cmd+Z 不恢复评论 options，也没有宣称保存后 Undo/Redo。根会话已决定保持本次边界；若要保存后历史，需要另行统一 DOCX 所有结构工具的历史与 dirty 合同，checker 未擅自改。
2. **浏览器 version1→0 反馈未在稳定组件复现。** 根会话浏览器在本 checker 修改生产模块期间曾见保存后新开面板执行提示版本1变0。新增 io.save 宿主重渲染回归通过；Vite HMR 会重新创建 handle 并归零，时间与反馈重合。生产现已冻结，交根会话刷新页面后稳定重验；本报告没有把该真实浏览器反馈标为通过或断言已证明 HMR 为唯一原因。
3. **spec sync 交根会话。** `.trellis/spec/office/engine/conventions.md` 的 P1-C1 仍明确排除新增/删除，并描述完整 PM 不变/Undo 只恢复 options。现行 C2 应在同一归属文档补充：仅 comment marks 差量、准确同步授权、原件锚点窄补丁、原件 ID 保留、SDT/altChunk 展开后序号不能证明段落身份。主会话拥有 spec sync，本 checker 未并写该文档。

## Verification

- Lint：scoped oxlint 通过，0 errors，4 个既有 `docx-agent.ts` no-map-spread warnings；没有全仓重跑已知480条 skill lint 基线。
- Format：13 个本片文件 oxfmt --check 通过。
- Styles：`node scripts/check-style-backticks.mjs` 通过。
- TypeCheck：`pnpm --filter @mimir/office typecheck` 通过。
- Tests：6 files / **142 tests** 通过，包含独立新增两项先红回归；真实宿主保存重渲染补强之后又运行相同专项集。
- 日志：`/tmp/mimir-c2-independent-check-final-{tests,types,lint,format}.log`、`/tmp/mimir-c2-independent-check-styles.log`；额外 native+host rerender 2 files20/20 见 `/tmp/mimir-c2-native-and-host-rerender-tests.log`。
- 未运行全 Office suite、Web build、真实模型、原生 Desktop。真实浏览器1280与420×500及保存下载 native 对照由根会话持有，不能由此组件检查替代。

DOCX C2 生产再次冻结；本 checker 释放 DOCX 所有权，后续 protected-checkbox 须由根会话按其独立计划调度。

## 真实浏览器复验及两处交互修复

根会话稳定刷新后实查：第四段选“格式”新增root4→保存→新开管理root0→确认删除成功，提示删除2条且dirty/结构撤销可用，没有再次出现version错误。此前异常与生产模块HMR时间交叉；稳定连续会话已由根会话验收，原生保存/撤销对照仍由根会话完成。

该实查又发现并授权 checker 局部修复两项：

- `DocxEditor.tsx`：结构撤销成功时更新 notice 为“已撤销上次结构操作”，避免 status 已恢复而仍声称删除未保存。
- `DocxAdvancedControls.tsx`：选择回复时确认标题为“删除这条回复？”，确认按钮“删除回复”；根讨论保持原确认语义和一次确认流程。
- `DocxEditor.protection.test.tsx`：分别挂真实 Editor，选择原root0/reply1，检查正确确认标题与动作→删除→Escape关面板→结构撤销，确认过期notice消失、dirty恢复false、原0/1/2身份全部恢复。

验证：目标2 files / **21 tests** 通过（`/tmp/mimir-c2-interaction-fixes-tests.log`）；3文件oxlint、oxfmt、style-backticks、diff-check通过；antd lint AdvancedControls为0issues。追加后的Office tsc当前被并行 `PdfEditor.tsx:1230` 的 `ImportMeta.env` 类型错误拦住，DOCX无类型错误；证据 `/tmp/mimir-c2-interaction-fixes-types.log`，已通知根会话交对应owner。此前142/142与tsc绿是上一冻结快照，不冒用作本次跨包全绿。没有重跑全suite/build。

追加修复后的DOCX生产再次冻结并释放，保存后通用历史合同未改。
