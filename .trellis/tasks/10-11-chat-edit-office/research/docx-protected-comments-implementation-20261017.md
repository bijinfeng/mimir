# DOCX 保护 P1-C1：已有讨论编辑实施

2026-10-17。按 root 批准的 `implement.md` C1 与 `docx-protection-p1-next-20261017.md` 实施；生产已冻结，等待独立检查及 root 统一构建/浏览器验收。不是“仅批注完整支持”。参考范围沿既有固定 GenOffice 及 WeKnora 研究证据，未新增竞品调研。

## 交付边界

- 原件策略确认 enforced comments、凭据可识别、无修改密码门时，主正文 `writable=false`，独立 `commentsOnly` 能力允许支持目标改文字、追加回复、解决、重新打开。限制本身已识别 SHA512 hash 不要求在允许的批注操作前输入；writeProtection 的修改密码仍拒写。
- `getCommentAccess(id)` 给出各操作拒绝原因；复杂域等目标可读但拒绝写，现代 people/commentsIds/commentsExtensible 关系或部件、坏/冲突扩展、未知保护凭据整体只读。不放宽 PM、NodeView、普通 Agent 工具、草稿、正文/锚点操作。
- 新增根批注、删除根/回复、forms/password/强制修订未实施；界面显示准确原因。新增回复在未保存的当前会话中可读；其独立文字编辑须保存重开后成为原生已有目标。回复和解决原有讨论均通过同一目标验证。

## Native 保存与权限

新 helper `src/docx-protected-comments.ts` 从原件有界 ZIP 读取关系/ContentTypes/comments/commentsExtended。私有字节和原生模型不受公开 parsed/comments/originalBytes 影响。XML 使用验证与带 offset 的 namespace-aware 树，拒绝 DTD、实体声明、CDATA、重复展开属性/ID、未知线程语义、非法编码；支持 strict/transitional word 命名空间、替代前缀和替代 comments target。

- 文字只补目标 `w:t` 内文，必要时补 `xml:space`；保留 run、rPr、hyperlink、原属性/原引号/原注释 shell。段落数变化、字段/修订/复杂内容拒绝，不走 vendor 明文重建 fallback。
- 解决/重开仅补相应 commentEx 的 done 属性；追加回复保留已有节点，按需增加 plain-text reply、paraId、commentEx。缺少扩展时仅局部增加必要关系与 ContentType，不重排其余 XML。
- `session.save` 最终验证完整 PM 不变，附加参数仅 comments，原根/回复的身份、作者、日期、initials、parent、paraId 不变，无删除/新根；新回复只能依附私有原件根。无变化/撤销归原返回整份私有原件字节；其余变化只写必要部件。
- 多次保存均从本会话私有原件生成当前完整合法 comments 状态；不会漏掉先前动作。原件未知属性和非目标 ZIP 条目按字节保留。

## Agent / 历史 / UI

- Agent 只为 edit_comment/reply_comment/resolve_comment 提供具名 comments-only 分支；附加状态发布前再验证。非法参数/不支持目标/过期版本失败不改 dirty/version，不建 round；有效批注操作 options-only 增版本。
- 结构撤销核对 round 版本/保护 epoch/模式/正文相同，只恢复 comments SaveOptions，**不调用 setContent**。沿既有保存前结构 round；普通 Cmd+Z 不宣称能撤销 SaveOptions，保存后 markSaved 清 round 的旧语义不变。
- 只给“管理批注”开放读面板；其他高级写菜单保持 disabled。320px Inspector 复用现有壳，单列带可见标签表单、body 内滚、动作固定在同级 footer；窄屏折叠菜单先关闭，Escape/回焦沿壳。所有实际写按钮按目标能力禁用，空态说明不能新增受保护批注。
- `saveOptionsWithLiveComments` 在 comments-only 下由最终私有 validator 接管，避免 vendor parsed.comments 不认识替代路径时错误剔除已有讨论。

## 文件

- 新增 `packages/office/src/docx-protected-comments.ts`、`docx-protected-comments.test.ts`。
- 更新本片接缝：`docx-protection.ts`、`docx.ts`、`agent/docx-agent.ts`、`editors/DocxEditor.tsx`、`DocxAdvancedControls.tsx`、`DocxProtectionControls.tsx`。
- 新增 `editors/docx-comment-controls.css`；更新 `docx-protection.test.ts` 与真实 `editors/DocxEditor.protection.test.tsx`。这些文件此前已有未提交工作，未覆盖或撤销他人改动。

## 验证

- 5 文件 **126/126**：`/tmp/mimir-c1-final-target.log`。
  `src/docx-protected-comments.test.ts src/docx-protection.test.ts src/agent/docx-agent.test.ts src/editors/DocxAdvancedControls.test.tsx src/editors/DocxEditor.protection.test.tsx --maxWorkers=2`。
- 专项覆盖：富格式/透明未知属性、单独文字只改 comments、解决只改 ext 且单双引号/等号空白保留、已有/缺失 ext、缺失 paraId、替代路径/前缀、BOM/属性内大于号、追加中文多段回复、第二次保存、no-op/撤销整件精确、各身份/正文/参数/不支持结构拒绝。
- 真实顶层 DocxEditor 测试：管理批注→改字→结构撤销→回复→解决→重开→保存到库；唯一正文 DOM 保持，编辑器仍不可写，撤销 0 次 setContent，保存后的 document.xml/settings.xml 精确。
- Office `tsc --noEmit` 通过：`/tmp/mimir-c1-types.log`。
- 目标 oxlint **0 errors**；agent 文件保留 4 条 no-map-spread warnings：`/tmp/mimir-c1-lint.log`。
- 目标 oxfmt、style-backticks、antd lint、diff-check 通过：`/tmp/mimir-c1-{format,styles,diff}.log`、`/tmp/mimir-c1-antd-lint.json`。
- 首轮真实 Editor 测试只因错误的保存按钮标签及异步断言等待失败，均已修测试；最终整路径通过。旧 P0“comments 一概拒绝”的断言按新 C1 合同更新，其余模式仍验证拒写。
- 未运行重型全 Office/Web build、未使用模型/桌面/浏览器或执行上传；这些由 root 统一验收，不把单元测试称浏览器通过。无暂存/提交/归档/删除。

## Root 浏览器夹具

五份稳定 `/tmp/mimir-docx-protected-{comments,readonly,modern,modify-password,empty}-20261017.docx` 已交 root。root 已通过真实 UI 上传；主 comments ID `s2-xJkj0v9jwC19U`。

主件：根 0 富格式/双空格/Link，回复 1，复杂域目标 2 应逐目标拒写；正文真实锚点和多段内容。settings 是已识别 SHA512 **结构测试**参数（hash=h×64、salt=s×16、spin100000），未声称可解锁或核验密码。readonly、modern people、modify-password 应拒写；empty 应出现准确空态。

建议宽/420×500 验证主件改字/回复/解决/重开、结构撤销、无正文编辑、导出/库保存后原生读回；检查固定 footer、实际 overflow、Select 子 Escape 与面板 Escape/回焦。按动作比对非目标 ZIP，no-op/撤销整件精确。Root 仍需更新 engine/frontend 现行 C1 合同（P0 原只读说明不能继续笼统覆盖 comments）。
