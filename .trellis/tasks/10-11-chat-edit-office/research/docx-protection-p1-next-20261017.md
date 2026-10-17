# Research: DOCX 保护 P1 的下一实施片

- Query: 在已完成 P0 的会话/controller、PM、Agent、session.save 防线上，如何最小开放仅批注与真实 checkbox，并保持原件、历史和拒写的一致性？
- Scope: mixed；生产只读研究，只写当前 task/research；未运行构建、测试、浏览器或上传。
- Date: 2026-10-17
- Status: 待根会话审核的分片方案；不是已经实现或已经通过验收的能力。

## Findings

### 1. 结论与建议首片

**建议先派 P1-C1：仅批注模式中，对已存在的批注修改正文、回复、解决和重新打开讨论；主正文和原生锚点完全不变。** C1 独立完成后再派 P1-C2 新增/删除根批注，最后独立派 P1-F 真实 checkbox。修改密码 SHA-512 核验另拆 P1-W；不把密码工作塞进 C1。

这样拆的依据是实际保存合同，而非工具栏复杂度：现有 `edit_comment/reply_comment/resolve_comment` 只改 SaveOptions；`add_comment/delete_comment` 同时改 PM marks；forms 又涉及原生字段状态、控件身份和正文 XML 的精确映射。三者用一个 `writable=true` 开关会放开错误入口。

**C1 的交付名称必须写“仅批注：已有讨论编辑”，不能称仅批注完整支持。** 如果根会话要求一次提供完整仅批注工具，则合并 C1+C2 的所有验收门槛后再发布，不能省掉原生锚点保真环节。没有已有批注时，C1 应显示空态及“新增受保护批注尚未支持”，不显示可用但执行失败的主按钮。

四种限制仍使用同一策略源；readOnly、forms、trackedChanges 在各自后续片完成前继续 P0。含修改密码、未知/旧凭据、未知关系/保护配置继续只读。文档限制自身的**已识别 SHA-512 hash 用于停止限制**，不是在 comments 模式执行允许批注动作前必须输入的密码；但 C1 不解除、不修改该 hash。当前 controller 把两类凭据汇总为 native.credentials，实施时不得因此混淆修改密码门和编辑限制密码门。

### 2. 当前代码与相关规格

| 文件 | 当前证据/用途 |
| --- | --- |
| `packages/office/src/docx-protection.ts:27–39,268–329` | Access 只有 writable/reason/epoch/recommendedChoice；assertWrite 为一刀切。assertSave 禁保护/关系/ContentTypes 覆盖；只读 PM 与私有原件 PM 作 canonical 比较，任何额外 options 均拒绝。 |
| `packages/office/src/docx.ts:173–207` | controller 由原件 settings 构建，原件 bytes 私有复制；assertSave 后若 !writable 立即返回原件。这一早返回也必须明确区分允许的受限保存。 |
| `packages/office/src/editors/docx-protection.ts:29–35,38–115` | P0 filterTransaction 拒一切 docChanged；PM editable=false，DOM 捕获阻止 NodeView 写和对象手势；插件 lifetime WeakMap 保存原来的 formula/textbox 控件状态。不能删除这些 guard。 |
| `packages/office/src/agent/docx-agent.ts:696–740,878–892` | 顶层写工具 assertWrite，beforeWrite/updateSaveOptions 再断言；保护订阅递增 version，round 保存完整正文和 options。 |
| `packages/office/src/agent/docx-agent.ts:1042–1170` | add/delete 同时修改正文 comment mark 与 comments；edit 是 host-only；reply/resolve 只改 comments。 |
| `packages/office/src/agent/docx-agent.ts:2374–2390` | undoRound 当前先 setContent 后恢复完整 options；不是受限模式可直接放行的恢复合同。 |
| `packages/office/src/editors/DocxEditor.tsx:296–340` | 新批注目标仅直属单段，重复选中文字拒绝；saveOptionsWithLiveComments 会剔除没有活锚的新根批注。 |
| `packages/office/src/editors/DocxEditor.tsx:1472–1525,1936–1969,1999–2035` | 统一 handle、结构操作 round、批注添加入口；需要把 comment capability 与 body writable 分离。 |
| `packages/office/src/editors/DocxEditor.tsx:2754–2810,2973–2995` | advancedMenu 和“添加批注”目前受全局 disabled 控制，必须做具名能力判断，不能通配放开所有 Inspector。 |
| `packages/office/src/editors/DocxAdvancedControls.tsx:834–972` | 管理批注的编辑、回复、解决、重新打开、删除入口；复用 useDocxAction 冻结 version。 |
| `packages/office/vendor/packages/docx-engine/src/patch.ts:914–969,1610–1681` | 全量 comments 保存会重建 comments 根和 commentsExtended；未改旧批注节点会复用原 XML，changed comment 的 text patch 失败会整条降为明文。不能把它视为未知扩展全保真。 |
| `packages/office/vendor/packages/docx-engine/src/text-patch.ts:23–77,123–195` | 可复用的原生 w:t 局部补丁；段落数改变/无锚返回 null；调用方可以拒绝，不能沿 vendor 的明文重建 fallback。 |
| `packages/office/vendor/apps/docs/src/renderer/editor/checkbox-toggle.ts:30–64,76–100` | 以 instrField/ctrlCheckbox marks 与 glyph 切换，带 TRACK_IGNORE；formsFill 可在 view.editable=false 时执行。无原件身份校验。 |
| `packages/office/vendor/packages/docx-engine/src/parse.ts:3790–3817,4028` | 原生 legacy ffData 读成 glyph+instrField+fldBeginXml；SDT checkbox 读成 glyph+sdtPrXml。 |
| `packages/office/vendor/apps/docs/src/renderer/editor/convert.ts:1430–1456` | marks 携带 beginXml/sdtPr，不携带原始 XML 字符偏移或原生独一 ID；相同 legacy marks 可合并相邻文本。 |
| `packages/office/vendor/packages/docx-engine/src/generate.ts:2546–2584` | legacy checkbox 再生成字段指令/结束 run，并同步 checked；普通字符会拆出字段。证明原生状态会写入，但不能证明整段其他未知 XML 保真。 |
| `packages/office/vendor/packages/docx-engine/src/checkbox-control.ts:36–82` | SDT 自定义 glyphs、宽松 checked 判定与字符串级同步。P1 权限判定不能照搬未知 glyph 的 fallback。 |

已读规格：`.trellis/workflow.md`；`.trellis/spec/project/rules.md`；`.trellis/spec/office/engine/{index,conventions}.md`；`.trellis/spec/office/frontend/{index,editors/index,editors/conventions}.md`；`.trellis/spec/guides/index.md`。关键约束为 vendor 不改、私有原件保护、先文件后索引、受限能力逐项证明、320px Inspector/内部滚动/固定动作/真实 420px 验收。前置研究为 `docx-protection-refinement-20261017.md`，其 P1 方向有效，但下面按当前生产代码收窄可交付片。

### 3. P1-C1：最小可实施合同

#### 3.1 原件 eligibility 与不可变基线

1. 只有 namespace-aware controller 确认 `enforced comments`、无修改密码门、无 uncertain/unsupported 配置时，才可能开放。未通过资格的原件只读读批注。
2. 从**私有原件 ZIP**解析 document relationships、comments 及 commentsExtended；不依赖可公开修改的 parsed.comments、options 或 session.originalBytes。借鉴 settings 的 strict/transitional 关系校验，唯一内部 target、规范化路径、重复展开名/重复 ID/坏 XML/DTD/超预算拒绝，不能默认只认 `word/comments.xml`。
3. 保存私有初始 PM canonical、批注字段/原始 XML 切片、关系和部件 byte 快照；建立受限保存能力。以实际可精确补丁的节点为单项 eligibility；含未知 modern-comments/people/外部或冲突扩展语义的讨论先禁止写，不擅自降为 legacy。
4. C1 可允许**透明保留的未知原始属性/兄弟节点**；若某未知节点会影响讨论身份/权限/线程结构则拒绝。两者区别应由明确白名单/结构校验决定，不用“测试恰好保留”推定任意扩展安全。

#### 3.2 能力接口和最终 guard

- 保留 `writable` 语义为主正文可编辑，C1 始终 false；增加明确的 comment 操作能力及拒绝原因，例如 read/editText/reply/resolve/reopen/add/delete。按原件资格和目标资格返回，不把 body reason=null 当允许批注。
- 新的 assertMutation(intent, before/after 或 typed patch) 读取当前 controller；`assertWrite()` 继续仅用于普通 body/structure/draft。目标 ID、操作和 typed comments 差量都复核；仅 tool 名白名单不足以授权。
- C1 PM `docChanged` 一律拒绝；普通选取/复制/查找/布局继续。formula、textbox、图片手势等 P0 DOM guard 不放松。
- C1 SaveOptions 除 `comments` 外全部拒绝（包括显式空数组、null、partXml/partBinary、样式/页节/墨迹）。`comments` 每项允许字段且形状合法，唯一 ID，parent 只指真实根，无环，无重复 paraId；保留现有作者/date/initials/paraId/parent 身份。不能通过全量列表偷偷改旧作者、日期、移除根批注或重挂父节点。
- controller 为 C1 保存产生受控内部计划；`session.save` 在 P0 原样早返回之前分支到受限保存适配。公开调用者仍只能传数据，拿不到可信任的 patch token；直接调用 `session.save` 也必须严格证明 PM 完全未变、options 差量仅属允许操作。
- 保存计划由原件+本次最终 comments 状态确定。多次动作→一次保存和相同 session 二次保存均从该会话私有原件重放全量合法最终状态，不遗漏先前修改。真正 no-op（含编辑后撤销）返回原件 bytes。

#### 3.3 原生保存：建议单独的局部适配，不走整条正文再生成

新增候选 `src/docx-protected-comments.ts`（名字实施时可调整）负责识别/验证/补丁；不改 vendor。C1 直接从私有原件 ZIP 只写需要变化的评论部件，保留其他非目录 entry 的内容 bytes。

- **改文字**：复用 `patchParagraphTexts` 处理受支持的 w 前缀评论节点，仅替换目标评论的 w:t；调用前校验段落/字段/嵌套结构可支持，调用后重新提取验证。返回 null 就明确拒绝；不回退整条明文重建。不支持新增/删除段落时在输入校验说明；未改的属性、rPr、超链接关系、未知节点和其他评论 XML 精确保留。
- **解决/重新打开**：仅修改对应 `commentEx` 的 done 属性，保留该节点其他属性、其他节点与根；没有 ext 时可创建受支持的 ext 节点/part，必要时为目标评论最后段落补唯一 paraId。重复/冲突/无法建立身份映射时拒绝。根和 target 的命名空间作用域必须正确。
- **回复**：保留已有 root 节点，新增有界的 plain-text reply 节点及唯一 paraId/ID；只增加对应 `commentEx`，不重建所有 ext。必要时局部增加关系/ContentType/namespace binding，不重排其他关系或清掉未知扩展；这类内部生成关系区别于公开 options 任意覆盖，仍需 controller 最终批准。
- 未操作 `word/document.xml`、settings（可能为非标准目标）、styles、numbering、notes、HF、media 等全部 byte 相同。关系/ContentTypes 若无需新增也须 byte 相同；新增时仅局部增加必要条目，其余 XML 保持。
- 允许单项 capability 的前提是 save 同样支持；例如无法可靠建立 reply/thread 身份的目标仍可读，不应先让 Agent 修改后才在导出失败。

如果首个 implementer 认为 replies/新 ext 使单片过大，可再收窄 C1a 为已有评论改文字；必须把 root 审核结果与未实现动作明确登记。不能以缩片为由悄悄使用全量重建抹掉原件扩展。

#### 3.4 手动入口与 Agent 的逐项表

| 入口 | C1 | C2 完成后的目标 |
| --- | --- | --- |
| 审阅→管理批注→改正文 | 对支持目标开放；主正文仍只读 | 同左 |
| 回复/解决/重新打开讨论 | 对支持目标开放；不换父/作者/日期 | 同左 |
| 删除当前批注及回复 | 禁用并说明“受保护原件删除批注尚未支持” | 根锚/参考同步精确删除并保留其他原件 |
| 审阅→添加批注 | 禁用并说明“受保护原件新增批注尚未支持” | 合法单段准确锚定，冻结 version/选区/epoch |
| 右侧批注展示/原生点击 | 若存在纯读保持；任何写须走同一 handle | 同左，不允许旁路 DOM 写 |
| Agent read_comments | 继续读，无 hash/salt/私有XML | 同左 |
| Agent reply_comment/resolve_comment | 参数、目标资格、epoch/version 校验后允许 | 同左 |
| host-only edit_comment | 仅 text/done 的合法差量 | 同左 |
| Agent add_comment/delete_comment | 明确拒绝，changed/dirty/version 不变、不创建 round | 与手动同一支持范围 |
| 其他写工具、草稿、修订、格式、页眉、设计/墨迹 | 继续拒绝 | 继续拒绝 |
| 整轮恢复/结构撤销 | 仅同一模式、当前 epoch、相同正文、纯评论合法状态恢复 | 再验证允许的 comment-mark 差量；不可普通 setContent 任意恢复 |

当前 `advancedMenu` 不能通过把全局 disabled 变 false 解锁；只让“管理批注”用相应 capability。reviewControls 的“添加批注”单独控制。受保护原件状态行从笼统“原件只读”改成实际“仅批注 · 正文只读”，保护面板说明本片支持范围，未证明部分可读保留。

Agent 顶层 execute 分类、beforeWrite 和 updateSaveOptions 均带 typed intent；updateSaveOptions 限 patch keys，仅评论执行上下文可递交。落地前再校验 session/controller/epoch/version/目标仍在；失败不得留下半份 options。评论不需要先退出阅读模式来打开 body；如产品希望动作后退出阅读，仅改变呈现，PM body 仍不可编辑。

#### 3.5 history、版本与原子性

- C1 options-only 修改沿已有结构 round；无需创造 PM 假事务来骗 dirty。每次有效评论变化 version 单增并 dirty，一次 manual action 建一个 round，no-op 不建 round/不dirty。
- `undoRound` 先验证完整待恢复差量和 round 保存的 session/epoch/写入类型，确认正文相同后**仅恢复 comments 状态**；C1 不调用 setContent。禁止恢复 round 中其他 options；后续用户动作/Agent version 变化仍使旧 round 失效。
- 现有普通 PM Undo 不恢复 comments SaveOptions。C1 必须沿“撤销结构操作”具名入口且文案准确；不能宣称 Cmd+Z 已支持完整评论。若要统一 Cmd+Z，另做一个 PM 属性/自有 history 合同，不能只令 addMark Undo 而留下内容。
- C2 add/delete 需要正文 mark 和 comments 成为一次原子发布：先完整验证 PM transaction+metadata，再应用；若 PM guard 拒绝，不能还更新 options/dirty；失败不可留下空锚/孤儿评论。目前 add 的 dispatch 后立即 updateSaveOptions 应在此收敛。
- 保存/导出冻结当前 PM、options、version、session、policyEpoch；异步生成后宿主仍用现有版本检查，失败不 markSaved，保存期间新动作继续 dirty。权限/源变化使旧 Inspector/round 失效；A→B→A 不复活。

### 4. P1-C2：完整 comment-only 的原生锚点门槛

C2 才放开受保护原件 add/delete。PM 验证应去除 comment marks 后比较完整文档（所有 doc/block attrs、对象、非评论 marks、text 与顺序均相等）。删除 mark 后会出现相邻 text 节点分裂，需用真实 schema/Fragment 的正规化再比较，不能把 JSON 文本节点数组完全相同当唯一合法差量，也不能忽略所有 marks。

新 ID/mark 必须与完整 comments 状态一致；root 有合法同段非空文本范围，reply 只依附 root；不允许伪造旧 root ID/new parent、重叠覆盖、跨段/复杂 inline 或透过 attrs 改内容。原始跨段锚点属于保留原件；首片不做可写转换。UI 可选中不代表可把任意区域写成支持锚。

**保存不能直接以 pmDocToSavePlan 的段落重建作为保真证明。** 需新增原件 raw anchor 映射：从原件 paragraph/run/w:t 的本地 source map 对齐 PM 位置，在允许边界精确插入/移除 commentRangeStart/End/Reference，拆分 run 时复制正确 rPr 并保留其余未知属性/节点。先支持无字段/修订/嵌套/对象的可证明单段；hyperlink/复杂 run 若边界无法精确映射直接拒绝。不允许把 comments stripping 后的“文字相同”当 native XML 保真，未知域/OLE 等可能已丢。

root deletion 同时删除该讨论及指定 replies，只删准确匹配 native 节点/mark，不能删除同名未知 namespace 元素。保留空评论部件/关系也可，避免无必要清理；不得造成悬空其他引用。删除 reply 与删除 root 语义分开。

### 5. P1-F：真实 checkbox 的独立后续片

#### 5.1 身份与 PM 验证

- 保持 body editable=false；仅当前 controller 资格为 forms 时允许特定 checkbox 事务。`formsFill=true` 只是 gesture 入口，不是授权证据，P0 transaction guard 需逐差量证明。
- 私有原件按 native occurrence 建稳定身份：part path、docxIndex/支持块树路径、原始字段/SDT 字节切片、该块内出现序号及 PM UTF-16 range。不单靠 sdt id（可缺失/重复）、mark attrs（可伪造）或 glyph（普通文本也有）。相邻完全同形控件即使 PM 合成一个 text node，也按每个 glyph 的原件 occurrence 区分。
- 验证 old/new 完整文档仅在这些原始 range 发生允许的 checked↔unchecked 替换；标记、段落/doc attrs、所有其他文字与非复选对象一字不变。多处变化必须每处合法。用规范化的占位状态比较可支持 undo/redo，不用 TRACK_IGNORE/addToHistory/meta 字符串授权。
- legacy 必须有真实原件 ffData/checkBox 和匹配 FORMCHECKBOX 指令；无 definition、普通 instr 字符、paste 新 marks 一律拒绝。SDT 必须真实原件 w14:checkbox 与可明确识别的 glyph pair；禁止宽松 fallback 将其他勾号当状态。
- 当前 vendor `toggleCheckboxAt` 的 `node.text[0]` 只取 UTF-16 单元，custom supplementary-plane glyph 不可直接复用；首片明确禁用此类，或在自有 toggle 中用 code point + UTF-16 长度正确处理并测试。相同 checked/unchecked glyph、无效码点、字段禁用/内容锁定、嵌套/歧义控件等不猜测。
- 未解析的 editable range (`permStart/permEnd`)、节级 formProt 例外、SDT lock/legacy enabled 等会影响填写权限的配置先拒绝资格，或先明确实现对应原生语义并加测试。当前 P0 未为它们建授权模型；不得把“enforced forms”直接当所有控件可点击。

#### 5.2 native save 与交互

- 建议独立 `src/docx-protected-forms.ts`（纯映射/校验/精确 state patch）。legacy 只修改/补入正确 checkBox 的 checked；保留 ffData/name/默认值/状态帮助/字段 begin/instruction/end 原 bytes。SDT 同步目标 checked 和对应 sdtContent glyph，保留 sdtPr、未知扩展、外层 shell 与其他 run。
- 从私有原件 ZIP 精确改目标片段；不把整个段落再生成，也不把序列化后的原 sdtPr 当原始字节保留证据。checked 原字面值与默认回落均需准确解析；取消切换/undo 回原状态应复原原 bytes，而不是残留等价新 checked 标签。
- 输入、粘贴、拖动、NodeView、普通工具仍拒绝。鼠标只在真实 checkbox glyph 命中放行，文字选择继续；不要为了捕获 click 放开所有 mousedown/对象 resize。readonly body 下增加明确键盘路径（聚焦/列出可填控件、Space 切换）及真实 checked 状态/无资格原因，不要求用户用鼠标精确点微小 glyph。
- forms 不增加模型工具目录作为首片必要条件。若后来要 Agent 切换，新增 typed host 执行使用同一 occurrence ID/版本/期望原状态和 guard；不允许通过 insert_content/apply_ops 偷改 glyph。
- 每次切换同一 PM history 一步，undo/redo 均经相同身份验证，保存重开后状态/未知字段/正文正确；评论写在 forms 模式继续禁。

### 6. 文件所有权与实施顺序建议

| 片 | 最小涉及文件 |
| --- | --- |
| C1 policy/native | `src/docx-protection.ts`、新增 `src/docx-protected-comments.ts` 及针对测试、`src/docx.ts` 受限保存 seam；保留原 guard/private bytes/no-op。 |
| C1 Agent/UI | `src/agent/docx-agent.ts` 与测试；`DocxEditor.tsx`/`DocxAdvancedControls.tsx` 的具名 capability、结构 undo、状态文字；`DocxProtectionControls.tsx` 支持范围。PM guard无需放开 docChanged。 |
| C2 | comments adapter raw anchor 映射；`src/editors/docx-protection.ts` 精确 mark diff；Agent add/delete 原子性；实际 Editor/native/history 测试。 |
| F | 新 forms adapter、同 controller/PM guard、一个自有 toggle/键盘接缝与实际 Editor 测试；不手改 vendor。 |
| W | 另行方案：修改密码 SHA512 worker、预算/取消/session+epoch 绑定；不得替 comments/forms 意图授权。 |

多个片不能并写 controller/docx.ts/DocxEditor/Agent。建议 C1 implement→独立 check→root 浏览器→freeze，再 C2，最后 F；根会话掌握重构建/全测。首片开始前与当前 outline/protection checker 明确交接。没有本次实施授权前本报告只供规划。

### 7. 有意义的验收矩阵（计划，尚未运行）

1. **C1 policy/save纯测试**：无保护/推荐/四种 restriction；comments合法目标允许，修改密码和unknown拒绝；公开 parsed/comments/bytes/options mutation不能扩大授权；直接 session.save 带额外 body/options/part override拒绝；私有基线不可污染。
2. **native C1**：rich多run评论与超链接、paraId/parent/done、原有ext未知attrs/siblings、其他部件含 opaque字段/OLE/媒体；改文本只目标 w:t，reply追加不丢旧节点，resolve仅目标done；无ext时正确局部关系/ContentType；每个未变 entry 精确比对；不支持段落数变更/坏/重复ID/未知线程形态明确拒绝。两次保存、重开再改、no-op、undo后精确原件。
3. **实际 Agent**：read和允许工具成功；所有其他写/草稿/整轮正文恢复拒绝；edit no-op不dirty/version；错误参数/旧epoch/version不建round；comment-only undo只恢复comments；原保护hash/settings不动；异步保存后迟到不清新dirty。
4. **实际 Editor**：原件body和textbox保持readonly，公式/图片/表格手势仍禁；管理批注可读/可写项准确，新增/删除在C1清晰禁用；有效动作脏/保存，结构undo恢复；CtrlZ不谎称改options；source切换/版本变化使面板失效。不要把四种restriction都改成同一“无写工具”测试，模式目标各自断言。
5. **C2**：去掉comment mark后真实PM等同；split/merged textnodes；真实单段native锚/add/delete/replies/交叠与跨段拒绝；PM拒绝时metadata不发布；现有跨段/未知锚byte不动。
6. **F**：legacy与SDT真实原件、相同相邻checkbox、checked默认、原件未知ffData、emoji/custom glyph、普通☐/伪造mark/改sdtPr/重排控件拒绝；不支持的locked/节级例外拒绝；native state与glyph重开一致；切两次/undo/no-op精确；主正文/评论/结构仍禁。
7. **root后续浏览器**：1280及真实420×500；320px Inspector内滚/固定可达动作；状态说明、当前评论值、切项无旧draft、Escape/最近层/返回live入口；真实输入→保存→下载独立native检查→重开；不使用隐藏handle代替UI，也不宣称真实模型调用已验收。Desktop由用户自验。

### 8. 外部参考：版本、证据与适用性

复用并本次读取了 `research/docx-protection-refinement-20261017.md` 的固定证据，不泛搜新版本：

- **GenOffice** `480548fd55f1be3593ee0d8e316a734751d58309`；本地 vendor/UPSTREAM.json 的 commit 与该版本一致；本次读取 `/tmp/mimir-genoffice-full/apps/docs/src/renderer/App.tsx:1569–1617`：区分 writeLocked/isProtected/commentsAllowed/trackChangesForced，body只读而 commentsAllowed 单独开启，formsFill 对 forms 且非阅读/加载开放。保护对话框在 `apps/docs/src/renderer/components/ProtectDialog.tsx`。其 checkbox-toggle/parse/generate 已列具体源证据。**可借用的语义**是正文写与批注/填写能力独立；**不能照搬** renderer setEditable/formsFill 为 Mimir最终授权或原件保真证明。主参考为 Office 文件编辑，不使用 WeKnora Markdown 工具栏。
- **WeKnora 官网** `https://weknora.weixin.qq.com/`，前研究 2026-10-17 HTTP200证据 `/tmp/mimir-docx-protection-weknora-20261017.html`，本次读到中文官网 HTML；官网不据此声明其部署版本。
- **WeKnora 公开源码**：该前研究固定 main `f5cfa0ff5fa87c45f59d4176f4ac8bb922bd5dd8`，latest release **v0.8.3**（release发布时间2026-10-14T07:53:24Z）；本次读取留存 release JSON 与 `/tmp/mimir-docx-protection-weknora-definitions.go:32–49,73–80`。源码明确sandbox写工具按真实backend capability注册、wiki写仅wiki范围，注释“checkbox would have been a lie”。适用于本片具名capability和执行重验；这些源码不证明其有DOCX受限批注/表单/Office工具栏，不推论全库没有，也不以它作为视觉范式。
- 可核对固定源码：`https://github.com/genspark-ai/genoffice/tree/480548fd55f1be3593ee0d8e316a734751d58309`；`https://github.com/Tencent/WeKnora/blob/f5cfa0ff5fa87c45f59d4176f4ac8bb922bd5dd8/internal/agent/tools/definitions.go`。

## Caveats / Not Found

- 本研究没有实现/跑测；上述新接口和文件名是计划。只读读取时其他agent仍可能收尾，最终交接时以冻结代码为准。
- 未证明当前 vendor 的全量 commentsExtended 再生、段落重建或 checkbox marks 已满足受限保存完整保真；因此明确要求适配和回归，不能跳过。
- 没有原件 raw→PM 字符 source map现成公共接口的证据；C2和F要建立窄范围自己的映射，不能假定 docxIndex 是字符身份。
- native控件locks/节级表单例外的完整OOXML权限语义尚未单独核对到规范条款；首片明确拒绝，不能按猜测开放。替代前缀/strict如现有vendor读写不能精确映射，也必须只读保留，namespace-aware策略识别不自动等于native mutation支持。
- 没有统一PM评论元数据history；当前是结构round。若产品要求CmdZ/Redo同时恢复批注，应另立明确实现合同，不把现有结构撤销称通用编辑历史。
- 不涉及新设/移除保护、旧密码核验、整文件加密、强制修订、模型真实调用或桌面验收；这些不是C1完成的证明。
