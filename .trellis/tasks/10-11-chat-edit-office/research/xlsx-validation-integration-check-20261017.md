# XLSX 数据验证接入整合回归 — 独立复查

2026-10-17；active task `10-11-chat-edit-office`。正式trellis-check直接复查/自修，无派生代理。接root统一全Office中 `XlsxEditor.test.tsx` 两项失败；table已冻结未改。本片仅改XlsxEditor、use-xlsx-cell-input及两Editor测试，不修改server/其他格式/vendor或既有DV宿主权限语义。

## Findings (fixed)

### 1. 普通已提交编辑被工具切换或旧保存结束静默取消

- File: `packages/office/src/editors/use-xlsx-cell-input.ts`、`XlsxEditor.tsx`
- 原因：原hook把document/选中格/草稿和source.saving/Inspector/toolbarTab合成一个context，layout effect cleanup一律abort。实际清空C3后立刻切“公式”，普通clear也被取消；保存过程中Enter提交B2后，旧保存结束的saving切换同样取消该新编辑。
- 修复：拆分执行目标context与确认context。文档、源、当前view、选中格、草稿及卸载仍取消目标请求，handle自身继续校验disposed/version/signal。工具分类/Inspector/saving变化只永久使该请求的DV确认资格失效；普通已提交动作继续。已展示warning及确认提交中请求仍abort；初次请求迟到返回warning时，发现confirmationInvalidated就丢弃，不重开。invalidated单调记录，A→B→A不能复活权限。
- Root明确要求普通编辑继续、确认严格失效后才实施该细分；不是仅增加测试等待规避失败。

### 2. 旧保存回调清除保存期间的新草稿

- File: `packages/office/src/editors/XlsxEditor.tsx`
- 原因：旧snapshot保存完成且文档尚未发布新版本时，原无条件setDraft(null)会清掉新输入，并触发目标context变化取消正在提交的新操作。仅拆saving context不足以修复，真实deferred host先红于signal.aborted=true。
- 修复：保存成功不清未提交或正在提交的新草稿；仍保持原版本比较、markSaved和dirty规则。新编辑若先发布，旧保存不markSaved；若旧保存先完成，新编辑随后接受时正确进入下一版本/dirty。

### 3. 快速保存可漏掉确认失效

- File: 同上及hook。
- 原因：同步完成的io.save可使saving=true/false在同次React更新中合并，单靠观察saving状态会保留warning；新增真实Editor回归先红于保存后仍有“仍然使用此值”。
- 修复：点击保存时显式invalidateConfirmation，再flush；该动作只使确认永久失效，不取消普通已提交写入。保存中/保存后均不能复用旧token，保持当前草稿和原件写入语义。

### 4. 验证警告取消或完成后失焦

- File: `packages/office/src/editors/XlsxEditor.tsx`
- Root实际生产浏览器发现取消按钮移除后BODY失焦。
- 修复：取消按钮/Escape回当前格输入；确认成功待busy解锁后回live输入，仅在焦点仍在本编辑区或BODY时恢复，不抢用户已移到外部的焦点。rAF绑定本次仍连接的footer区域，旧区域卸载后不向新文档回焦。

### 5. 原回归的草稿预览不能证明发布

- File: `XlsxEditor.test.tsx`、`XlsxEditor.validation.test.tsx`。
- 原save测试只等待td文字；选中格实时显示draft，所以该条件在version仍1时就成立。独立加版本断言曾稳定失败expected2/actual1。最终没有用等待绕过原交互：保留清空后立即切分类，给宿主真实gate；在candidate生成后、接受前切分类，assert signal不abort，放行后验证真实C3无formula/空值、一次history、保存重开一致。
- 保存竞态现覆盖两种真实gate顺序（新编辑先发布/旧保存先完成），保留两份保存原生值断言，另核对version、dirty、当前原生bytes。不是弱化final断言或skip。
- DV新增5项：迟到warning工具A→B→A不重开；已发warning和确认中写入切工具取消；Cancel/Escape/accepted回输入；保存显式失效并保留草稿；成功不抢外部焦点。原有换格迟到零发布、双确认、stop/info/off、Agent伪造拒绝、paste原子拒绝、native/options和history测试保持。

## Findings (not fixed)

- **Office TypeCheck尚未绿**：冻结复跑仅剩其他并行owner的 `src/editors/PptxEditor.extended-tools.test.tsx:447`，TS2322 `Uint8Array<ArrayBufferLike>`不可作BlobPart。日志 `/tmp/mimir-xlsx-validation-integration-freeze-types-20261017.log`。未越权改PPTX；root已收到具体阻点。较早轮另有PptxAssetControls/ref与docx-protection/null错误，最终复跑已不再出现，不把过去阻点当当前状态。
- 最终完整Office/server suites、Webbuild与1280/420实际浏览器由root统一。本checker不计已有root截图为本片最终生产验收；焦点与普通clear切分类、旧保存完成后继续编辑需最终构建复验。无模型/用户自验Desktop的整体边界保持。
- 推荐root在现行DV合同唯一归属处澄清：工具/保存上下文使确认许可失效，不能取消已提交普通编辑；保存旧snapshot不清新draft。此为现有“冻结确认”合同的精确边界，不新增宿主绕过权限。checker未并写root的spec文件。

## Verification

- 初始单独复现：`XlsxEditor.test.tsx` **67/69**，两项与root一致。`/tmp/mimir-xlsx-validation-integration-repro-20261017.log`；保存失败822、公式失败1617。保留历史失败，不声称原full已绿。
- 最终Office：**4files99/99，exit0**。XlsxEditor70、实际DV14、resolver6、Agent9。`/tmp/mimir-xlsx-validation-integration-office-freeze-20261017.log`，12:40:29，7.51s。
- Server DV完整相关：**4files24/24，exit0**（validation-host/route、既有效果/属性）。`/tmp/mimir-xlsx-validation-integration-server-20261017.log`。仅运行，未修改server。
- Renderer桥：**1file2/2，exit0**。`/tmp/mimir-xlsx-validation-integration-renderer-20261017.log`。
- TypeCheck: **fail（上述外部PPTX测试阻点）**；本片四文件无类型诊断。
- Lint: 四目标TS/TSX oxlint **pass**。Format: 四目标oxfmt check **pass**。目标git diff --check **pass**。
- Antd: XlsxEditor独立lint issues0，`/tmp/mimir-xlsx-validation-integration-freeze-antd-20261017.log`。
- 未跑全仓check/fullsuite/build，不重复480既有技能lint，不上传/删文件/暂存/提交/归档。

## 参照

此为已批准DV计划的代码整合检查，复用固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 和WeKnora v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`同日缓存证据及适用性结论；未新HTTP调研。WeKnora的知识/Agent门控不提供Excel编辑/确认交互范式，不作为工具栏视觉依据。

四文件已冻结交root。整体任务仍in_progress；本片99/24/2不能替代统一门禁或所有工具完成声明。
