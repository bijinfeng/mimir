# DOCX 浮动表格定位独立检查（2026-10-17）

状态：本片代码冻结，交 root 做统一构建、全套门禁与真实浏览器验收。不是所有编辑器工具完成记录。

## 范围与依据

- Active task：`.trellis/tasks/10-11-chat-edit-office`。
- 批准方案：`research/office-crop-remaining-plan-20261017.md` §4 B。
- 实施记录：`research/docx-table-position-implementation-20261017.md`。
- 独立逐路径核对六个所有权文件、fixed vendor 的 parse/convert/render/generate；固定 GenOffice 为 `480548fd55f1be3593ee0d8e316a734751d58309`。不改共享 Editor/session/protection/vendor，不派子代理。
- 竞品来源沿批准方案中已有 WeKnora v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 的同日缓存证据；本次为代码检查，没有重新 HTTP 调研，也不以 WeKnora 的 Markdown 定义 Office 定位行为。

## Findings (fixed)

### 1. 数值定位后，活画布仍保留旧环绕方向

- File：`packages/office/src/editors/docx-table-design.ts`。
- Issue：原件 right keyword 改为数值 X=317 后，PM 仍 `tblFloatSource=right`；保存重开按固定 parser 得到 left。相同原生位置在保存前后产生不同环绕类。
- Fix：应用时从最终 XSpec / 数值 X 使用原生 parser 同一推断（right/outside 或无 spec 且 X>4680），立即更新 source/live side；不增加虚构的持久 side 字段。
- 新回归先红，修复后立即值、真实 table float 类与 native reopen 一致。

### 2. suppression 未随当前余宽重算，且旧 suppressed 状态永久粘住

- File：`packages/office/src/editors/docx-table-design.ts`。
- Issue：增加右距正文后，活画布保持 float，重开才 suppressed；原先 suppressed 的表移动到有侧余宽处仍永久 suppressed。
- Fix：按当前原始 X、有效宽、右距正文、水平/垂直 anchor 与当前节内容宽重算 fixed renderer 的1440twips侧余宽条件；高表仍按真实行高下限12960twips规则 suppressed，不强制解禁高表。
- 新回归先红，修复后增加边距→suppressed、移动→恢复 float，均与 reopen 对照。

### 3. 定位守卫没有识别命名空间别名/重绑定

- File：`packages/office/src/docx-table-save.ts`。
- Issue：字面 w: 正则忽略 q:tblpX / q:tblpPr，即使 q 实际绑定 Word 命名空间；可能把原件值显示成零或补出第二个定位节点。w 前缀局部被重绑定也未拒绝。带连字符的未知 w 属性原正则同样漏过。
- Fix：读取 table/tblPr/position 局部命名空间绑定；固定 parser 无法解释的 Word 别名、无法解析前缀、w 重绑定明确禁用定位；已明确属于外部命名空间的 opaque 属性/注释仍保留。未知 w 属性名包括点与连字符，不能绕过守卫。
- 回归覆盖四种别名/重绑定/未知前缀，拒绝不改 PM，no-op 完整原件精确；既有已声明外命名空间扩展仍可增量定位。
- 有限边界：并未扩展 vendor 为任意 namespace alias 兼容。前缀只在 document 祖先声明而 source block 内无法解析时，定位保持禁用，保留原件；不猜为外部扩展。

### 4. 只改 AutoFit 也触发了定位写入守卫

- File：`packages/office/src/docx-table-save.ts`。
- Issue：AutoFit 改运行时 float width/suppression 导致 patchPosition 被调用；原件含未知定位属性时，虽然用户没有改定位，保存仍报错。
- Fix：比较真实可序列化的定位存在性、坐标、spec、anchor、distance；只有运行时宽/抑制/edited 标记变化时直接保留原 tblPr，跳过定位写入。真实坐标改变继续执行严格守卫与局部补丁。
- 新回归先红，修复后 AutoFit 可保存、opaque tblpPr 与 never-overlap 保持精确。

## Findings (not fixed)

- 无另行遗留的已确认代码问题。
- root 尚须运行真实1280与420×500验收：320px Inspector、内部滚动与固定唯一 primary、Select Escape层级/回焦、真实正文环绕、第二节 right preset、保存/Undo/Redo下载回读。组件测试不能证明实际布局。
- 公共规范同步由 root 负责，依派发约定没有并写；建议明确即时 side 与 reopen同源、suppression按当前余宽重算，以及未知定位只禁定位、其他样式保存保留原件。

## Verification

- Tests：PASS，`pnpm --filter @mimir/office test src/editors/docx-table-design.test.ts src/editors/DocxTableDesignControls.test.tsx`，**2 files /26 tests**，exit0。
  - `/tmp/mimir-table-position-independent-final2-20261017.log`。
  - 原有 coverage 包含 raw signed twips/asymmetric distance/另一轴关键字/opaque属性与注释/never-overlap/后续插行/原生两次保存/完整ZIP UndoRedo/真实PM filter拒绝/过期与换目标/Inspector草稿与一主动作。
- TypeCheck：PASS，`pnpm --filter @mimir/office typecheck`，exit0；`/tmp/mimir-table-position-independent-types-final-20261017.log`。实施者此前记录的并行 PDF 类型错误已不再出现于本轮。
- Lint：PASS，自有5个TS/TSX的 oxlint，exit0且无诊断；`/tmp/mimir-table-position-independent-lint-20261017.log`。
- Format：PASS，自有6文件 `oxfmt --check`，exit0。
- Antd：PASS，`antd lint packages/office/src/editors/DocxTableDesignControls.tsx --format json`，issues=[]，partial=false。
- 未跑 full Office/server suite、Web build、浏览器、Desktop、真实模型；由 root 统一安排。没有重跑全仓已知技能 lint 问题，没有上传/删除/提交/暂存。

本检查仅额外修改 `docx-table-design.ts`、`docx-table-save.ts` 与 `docx-table-design.test.ts`，其余三文件检查后保持原实现。
