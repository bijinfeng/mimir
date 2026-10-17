# DOCX 保护 P1-C1 独立检查

2026-10-17。检查对象为 `implement.md` 已批准 C1 和 `research/docx-protection-p1-next-20261017.md`，依据实现报告逐层追踪原生 XML、controller、session.save、Agent、options-only history 和实际 DocxEditor 控件。生产已交 root 冻结，可进入统一 Web build、全 Office 与浏览器验收。整体任务仍为 in_progress。

本次是实施复核，沿用批准方案中固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 和 WeKnora v0.8.3 / main `f5cfa0ff5fa87c45f59d4176f4ac8bb922bd5dd8` 的研究证据；WeKnora 仅用于能力门禁，不作为 Office 工具栏样式参考。未新开竞品调研。

## Findings (fixed)

### 1. 无法判定的修改保护错误获得 C1

- File: `packages/office/src/docx-protection.ts`
- Issue: enforced comments 同时带无推荐标志、无凭据的 `<w:writeProtection/>` 时，仅设置拒绝文案却未设 uncertain，后续 commentsOnly 分支仍开放。
- Fix: 该配置直接进入 unknown 策略，继续只读保留原件；合法已识别的编辑限制 hash 仍允许 C1，修改密码仍拒绝。

### 2. 批注部件被其他 document 关系共用

- File: `packages/office/src/docx-protected-comments.ts`
- Issue: document 的 styles 等非批注内部关系也可指向 comments/commentsExtended，局部改批注会同时改动另一语义的部件。
- Fix: 关系保留 internal/external 身份，拒绝非批注内部关系与目标部件共用；外部 hyperlink 不被误当成内部部件。

### 3. 非末段 paraId 重复未被发现

- File: `packages/office/src/docx-protected-comments.ts`
- Issue: 原先只检查每条批注最后一个段落的 paraId，前段重复可与另一讨论身份冲突。
- Fix: 检查全部 Word 段落的合法八位十六进制 paraId 与全局唯一性，仍用末段提供线程映射。

以上三项均用真实 ZIP 夹具先复现：`/tmp/mimir-docx-protected-comments-eligibility-before-20261017.log` 3 fail；修复后相关两个文件62/62：`/tmp/mimir-docx-protected-comments-eligibility-after-20261017.log`。

### 4. 补属性时重绑未知 namespace 前缀

- File: `packages/office/src/docx-protected-comments.ts`
- Issue: 既有 `w14` 绑定其他 URI 且未知属性引用该前缀时，给段落补原生 paraId 直接声明标准 w14，悄然改变原属性的 namespace 语义。
- Fix: 复用已绑定目标 URI 的非空前缀；否则分配未占用前缀，保留原有绑定和未知属性。真实 ZIP 先红日志：`/tmp/mimir-docx-protected-comments-prefix-before-20261017.log`。最终回归同时验证 resolve 保存重开。

### 5. 保存数量预算与重开资格不一致

- File: `packages/office/src/docx-protected-comments.ts`
- Issue: 原件最多1000条才开放 C1，但 validator 允许原条数再加100，可能生成保存后重开即失去 C1 资格的文件。1000条夹具复现回复能力未给出上限原因：`/tmp/mimir-docx-protected-comments-count-before-20261017.log`。
- Fix: 最终数量限制为 min(1000, 原条数+100)，达到原件上限时给回复具体原因；已有讨论编辑仍可保存重开。专项还验证拒绝第1001条，不丢弃已有讨论。

### 6. 切换讨论带入上一目标的回复草稿

- File: `packages/office/src/editors/DocxAdvancedControls.tsx`
- Issue: 切换到另一讨论后，回复字段保留上一目标草稿，易误回复到错误讨论。
- Fix: Select 切换讨论时清空回复，保持选择本身不修改 dirty/version。实际顶层 Editor 两个原生讨论先红后绿：`/tmp/mimir-docx-protected-comments-ui-before-20261017.log`、`/tmp/mimir-docx-protected-comments-ui-after-20261017.log`。

### 7. 批注面板缺少明确主动作

- File: `packages/office/src/editors/DocxAdvancedControls.tsx`
- Issue: 保存批注修改与其他动作同为次级样式，主操作不明确。
- Fix: 按 root 浏览器复核请求，将保存设为固定 footer 中唯一 primary；共享 ToolbarButton 自动显示 label，因此不再添加重复 children 文案。回复、解决和删除保持次操作。实际 Editor 回归断言 primary 数量恰为1、文案恰为“保存批注修改”。

### 8. 规范同步

- Files: `.trellis/spec/office/engine/conventions.md`、`.trellis/spec/office/frontend/editors/conventions.md`
- Fix: 补 C1 资格、私有原生 patch、PM 不变/仅 comments、options-only 撤销、预算/身份/命名空间保留以及具名面板/单一主动作/切目标清草稿契约。原 P0、其余模式与后续范围保持明确。

## 实际路径复核

- `session.save` 在正文保存链前检查私有保护 controller；C1 要求完整 PM 不变，附加参数仅合法 comments。公开 parsed/content/originalBytes 不能放宽策略。非 comments 参数即使为空或 null 也不旁路。
- native helper 仅补目标 w:t / done 或追加原生回复及必需 ext/rels/types；不调用 vendor 批注重建 fallback。原身份、作者、日期、initials、parent、paraId 不变。no-op/撤销归原返回整份私有原件字节，其他非目标 ZIP entry 精确。
- 仅 edit_comment / reply_comment / resolve_comment 走 comments-only；普通正文工具、NodeView、draft、附加结构写仍受原策略。发布 SaveOptions 前再验证，有效 options-only 写增加版本和 dirty，无效/无变化不建 round。
- Agent 结构撤销核对版本、保护 epoch 和正文，只恢复 options，实际 Editor 测试确认 setContent 调用为0。保存后的清 round 沿既有语义；普通 Cmd+Z 不被宣称可撤销 SaveOptions。
- 只开放管理批注面板，其他高级写菜单仍禁用；复杂域目标有具体拒绝原因，空态不暗示可新增受保护批注。实际 Editor 改文字→结构撤销→回复→解决→重开→保存路径保持只读正文和原 document/settings XML。

## Findings (not fixed)

- 未发现本片范围内仍需修复的确认缺陷。Agent 文件原有4条 no-map-spread 性能建议未更改：与本片保护语义无关，目标 lint 为 exit0，避免扩大生产改动。
- 新根批注、删除根/回复、forms、密码管理、强制修订是批准方案后续范围，C1 不宣称完成。新增回复本会话可读，但独立改该新回复文字需保存重开后成为原生已有目标；沿实现者明确边界，不在检查阶段改写此产品范围。
- root 继续统一构建、全 Office 与真实浏览器验收；本检查未运行模型、Desktop、上传/删除，不将 DOM 单测写成浏览器或真实模型通过。

## Verification

- Tests: **6 files, 134/134 pass, exit0**。`/tmp/mimir-docx-protected-comments-check-final-20261017.log`。
  `docx-protected-comments.test.ts`、`docx-protection.test.ts`、`agent/docx-agent.test.ts`、`editors/DocxAdvancedControls.test.tsx`、`editors/DocxEditor.protection.test.tsx`、`docx.test.ts`，`--maxWorkers=2`。
- TypeCheck: **Office tsc pass, exit0**。`/tmp/mimir-docx-protected-comments-check-types-20261017.log`。
- Lint: **target oxlint pass, exit0**，0 errors / 原有4条 no-map-spread warnings。`/tmp/mimir-docx-protected-comments-check-lint-20261017.log`。检查新增的局部 shadow warning 与缺失 toThrow message 已修复。
- Format: **pass, exit0**。`/tmp/mimir-docx-protected-comments-check-format-20261017.log`、最终局部更名后的 `/tmp/mimir-docx-protected-comments-check-format-final-20261017.log`。
- Styles: **pass, exit0**。`/tmp/mimir-docx-protected-comments-check-styles-20261017.log`。
- antd lint: **pass, 0 issues, partial=false**。`/tmp/mimir-docx-protected-comments-check-antd-20261017.json`。
- Diff check: **pass, exit0**。`/tmp/mimir-docx-protected-comments-check-diff-20261017.log`。

未运行 full Office/Web build；未暂存、提交、归档或删除测试件。生产冻结后仅写规范与本报告，后续生产问题先通知 root。
