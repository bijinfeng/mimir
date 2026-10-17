# DOCX 保护 P0 实施与冻结交接

2026-10-17。按 root 批准的 `docx-protection-refinement-20261017.md` P0 实施。此片是**尊重已有原件**：四种启用限制及未知/旧式/损坏保护配置保守只读；不宣称 comments/forms/trackedChanges 受限写入已实现。未提供密码核验、设置/移除保护、整文件加密。

## 来源和范围

- 文件编辑主要参考 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的保护分类及原生引擎，具体源码证据沿 `docx-protection-refinement-20261017.md`。修改密码、编辑限制和打开密码不是同一层。
- WeKnora 官网/公开源码已有 HTTP200 留证 `/tmp/mimir-group-flip-weknora-site.html`、`/tmp/mimir-group-flip-weknora-definitions.go`；v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`。能力门控适用；它没有 DOCX 原生保护/Office Ribbon 合同，未作为外观主参考。
- 未修改 vendor，没有新增依赖、上传/删除、暂存/提交或归档。root 负责真实浏览器、统一构建与全套测试。

## 代码

- `src/docx-protection.ts`：namespace-aware 读取原始 settings；支持 transitional/strict URI、任意正确前缀/paired tags；未知模式/开关/重复/嵌套保护配置、旧密码/不完整或坏 hash/salt/SID/spin 保守只读。私有策略不依赖公开 parsed；公开描述不带 hash/salt，冻结 controller/native/access。
- 原件 `readOnly/comments/forms/trackedChanges` 开启时均不允许写；后3种明确显示受限编辑尚未支持。修改密码单独判定。只有 recommendation-only、没有其他禁止原因时可通过 Inspector 明确“仍然编辑”开放本次会话；epoch 与 Agent version 推进，重开不继承。
- 原件 settings 沿 document relationship 读取；不把缺失/歧义/外部目标当无保护。可保留 alternate settings part，保存守卫同时拒绝 protection/writeProtection、settings canonical/alias、关系与内容类型直接覆盖。
- `src/docx.ts`：session 保护属性不可替换；原件内容快照和保护策略独立保管。`session.save` 最后检查真实 PM+附加 options；readonly 仅允许 no-op，按 schema 默认属性规范化处理 Tiptap 挂载产生的空/default 差异；返回私有原始字节拷贝，未改 ZIP 精确。公开 parsed/content/originalBytes 被改也不能放宽只读策略或改掉私有 no-op 原件。OLE 容器在 ZIP 解包前给出准确“可能加密、暂不支持解密”提示。
- `src/editors/docx-protection.ts`：高优先级 filterTransaction 拒绝所有 docChanged，不信任 TRACK_IGNORE/history$ 等 meta。根 DOM capture 在 NodeView 自有监听前阻断修改事件与对象双击启用子编辑器；主正文/对象选取复制保留，双击只阻止 NodeView 激活而不阻止浏览器默认选择。
- `src/agent/docx-agent.ts`：全部非读取 execute、beforeWrite、附加保存选项、begin/append/commitDraft、undoRound 由同一策略拒绝；拒绝不建 round、不 dirty、不增版本。只读读取保留；policy 变化使旧 expectedVersion 失效。
- `src/editors/DocxEditor.tsx`：读写和阅读视图合并策略；切视图不解锁；readonly find adapter 不暴露替换。保存失败有明确状态；墨迹禁用，正文 mutation 入口禁用；原件保护状态、对比、查找、拆分、导出保留。没有改 compare/split 自身实现，保留 numbering prop。
- `DocxProtectionControls.tsx` + `docx-protection.css`：审阅→文档保护具名入口，复用320px Inspector、内部滚动/固定底部、Escape/focus 既有路径。当前状态、编辑限制、修改密码、只读建议及原因；不堆密码表单。未知源信息显示无法可靠读取，不宣称未启用。

## 验证（本 implementer）

- **7 files / 131 tests passed**：native policy/save、新增 actual Editor保护、原有 Agent、视图、compare/split、ink、docx native；日志 `/tmp/mimir-docx-protection-targeted.log`。
- 新保护专项 **2 files /45 passed**：四模式真实 native DOCX，任意 prefix/strict、paired/重复/坏凭据/spin/SID、推荐选择、settings relationship别名/缺失/重复、保留 raw settings；readonly原字节和 schema默认 no-op；公开 parsed/content/bytes 突变不越权；partXml/partBinary/normalized paths/native选项拒绝。
- 实际 DocxEditor：全部既有 DOCX 工具名非读路径拒绝；草稿/round拒绝；伪meta/raw PM/setContent拒绝；Protected textbox双击不启用子编辑；readonly查找/对比/Web/拆分保留，Escape回保护入口；无 dirty/history/version；推荐明确选择后手动/Agent真实写入可保存；unprotected真实编辑保存重开。
- Office `tsc --noEmit` exit0；目标 oxfmt/style-backticks/diff检查通过。target oxlint无error；Agent 原有4处 `oxc/no-map-spread` warning 保留。
- 最后将 Agent readTools array 改为 Set，消除新增 prefer-set-has warning；其实际 Agent/Editor保护目标复验日志 `/tmp/mimir-docx-protection-last-targeted.log`。root/checker应以冻结后最终 gate 为准。
- 未运行真实模型、浏览器、Desktop或完整Office suite；不把本报告称为这些验收通过。

## 本地浏览器夹具（只生成，未由 implementer 上传）

manifest `/tmp/mimir-docx-protection-fixtures-20261017.json`。全都从厨房水槽原件生成，并带真实 settings relationship/ContentType、额外 `Protected textbox` VML对象：

- `/tmp/mimir-docx-protection-readOnly-20261017.docx`：初始只读，无继续编辑。
- `/tmp/mimir-docx-protection-comments-20261017.docx`：显示仅批注、受限写尚不支持、只读。
- `/tmp/mimir-docx-protection-forms-20261017.docx`：显示仅填写表单、受限写尚不支持、只读。
- `/tmp/mimir-docx-protection-trackedChanges-20261017.docx`：显示强制修订、受限写尚不支持、只读。
- `/tmp/mimir-docx-protection-recommended-20261017.docx`：初始建议只读，审阅面板显式“仍然编辑”；选择不修改 native推荐设置，重开再次只读。
- `/tmp/mimir-docx-protection-unknown-alt-prefix-20261017.docx`：x前缀、坏hash/spin，显示异常凭据/只读，无继续编辑；no-op导出应逐字节原件一致。

## 独立检查关注点和后继

P0 是 Mimir 支持路径中的 honor-system 约束，不能宣称文件加密或阻止拥有原始字节的人移除 XML。检查重点：关系命名空间/坏XML fallback、所有浮动图像/resize DOM手势、嵌套子editor入口、来源切换与recommendation-only lifetime；若 checker 修窄缺陷，更新其独立报告。P1/P2/P3 受限批注、真实表单、密码核验/管理/强制修订需要另外逐片证明，当前不能贴完整原生保护标签。
