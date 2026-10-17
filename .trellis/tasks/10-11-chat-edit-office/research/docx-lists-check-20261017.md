# DOCX 列表独立检查（2026-10-17）

## 范围与结论

独立审查列表 Inspector、真实 ProseMirror 选区与 numbering 元数据、DOCX 保存链及原件保真。实现 freeze 后发现并直接修复三处局部问题，目标检查通过；浏览器、生产构建和 HTTP 原件验收由根会话负责，本报告不以组件测试代替视觉结果。

沿用本任务已核对的文件编辑参考 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，具体 Ribbon/编号实现证据见 `docx-lists-20261017.md`。WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的知识检索和 sandbox 工具门控适用于知识库/Agent 权限，未提供 Word numbering 或 Office 工具栏模型，不作为列表界面的主要参考；本次为代码独立检查，未重新声称运行竞品 GUI。

## 发现及自修

1. **数字草稿无法首击应用**：既有列表只改起始值/缩进时，数字框直到 blur 才回传草稿，父组件仍判定 dirty=false；禁用按钮无法执行共享 mousedown→blur。真实 DocxEditor 新回归先红。列表面板在 spinbutton 聚焦时保持动作可达，沿既有共享按钮提交草稿，首击后原生保存重开验证 start=11、indentLeft=1270。未修改 shared 控件。
2. **清除列表误降级标题**：混合选区的 Heading 和原普通段落也被转换为 docParagraph。新增回归先红，修复为清除时只转换实际 docListItem，Heading/普通段落保持同一 PM 节点。
3. **新增级别子节点顺序不合法**：克隆稀疏原定义时，新增 start/suff/lvlJc 被追加到 rPr 后。原生回归先红，保存适配按 lvl/lvlOverride/pPr 的 OOXML 子节点次序插入缺失字段；不重排原有未知内容。回归断言新原生级别 start→numFmt→suff→lvlText→lvlJc→pPr→rPr 及未知缩进属性保留。

## 审查及回归证据

- 额外覆盖 split 后重复 docxIndex：只归一化首个原锚点，保存重开得到级别 `[2,0,1]`，两个拆分片段和原第二段文字完整。
- 原有用例继续覆盖未知 abstractNum/num/lvl/pPr/ind/rPr、startOverride/完整 lvlOverride 克隆；未选定义和段落保留；纯列表操作保留原 w:p 开属性和 runs；列表+文本保存保留未知 pPr；继承编号清除写 numId=0；表格单元格列表只改对应 numPr，整份 document.xml 精确比较。
- root metadata 与列表变更同一次 PM transaction；undo/redo 定义与 marker 同步；两次保存及撤销/重做的 ZIP 非目录 entries 精确恢复。选区移动不重绑目标；正文改变锁定；Escape 回真实入口；切换文档关闭面板。
- Inspector 源码为320px现有外壳，3列库样式、滚动 body、独立固定 footer；主按钮无重复标签，次按钮可见文字。实际420px视觉由根会话检查。

## 执行检查

- 列表专项：helper **26/26**，真实 UI **4/4**，合计 **30/30**。
- 相关10文件 **89/89**：列表两文件、references两文件、image、picture-history、table-design两文件、image-save、editors/docx-save。日志 `/tmp/mimir-docx-lists-check-tests.log`。
- 初次首击回归失败日志 `/tmp/mimir-docx-lists-check-initial.log`；混合Heading失败 `/tmp/mimir-docx-lists-check-progress.log`；原生节点顺序失败 `/tmp/mimir-docx-lists-check-progress2.log`。
- Office `pnpm exec tsc --noEmit` exit0；目标6文件 oxlint、oxfmt、全仓 `pnpm lint:styles`、目标组件 Antd lint 均 exit0，Antd0issues。日志 `/tmp/mimir-docx-lists-check-{types,lint,format,styles,antd}.log`。
- 目标 `git diff --check` 通过。本次未执行新的全仓 check，既有480项技能脚本 lint 阻断仍不能声明消失。

## 修改文件与边界

- 生产：`DocxListControls.tsx`、`docx-lists.ts`、`docx-list-save.ts`。
- 测试：`DocxListControls.test.tsx`、`docx-lists.test.ts`。
- 规范：在现有 shell/pitfalls 数字框条目补充 disabled 首击原因。
- 无 vendor/server/public schema 变更，无构建、上传、删除测试件、提交、暂存或归档。
- 复杂表格的额外内部段落无法可靠映射时仍拒绝；结构编辑仍沿 native 边界。纯列表保持原段 XML，列表加文字/格式的生成分支保留 rawPPr，但未声称通用原生 writer 对所有未建模 w:p 开属性逐字节保留。
- 尚需根会话真实宽屏/420和HTTP原件闭环。真实模型未配置未验；Desktop由用户验收。整体任务继续进行。

## 后续：旧 Toolbar Harness 配置遗漏

大小写切片跑相关回归时暴露 `docx-toolbar-render.test.tsx:424` 的 bullet 断言失败。本检查独立运行单例复现 ordered；旧 Harness 仅安装 vendored `editorExtensions`，而生产 `DOCX_EDITOR_EXTENSIONS` 已额外安装 `DocxListsExtension`，并由 `syncListStyleStorage` 同步解析的 numbering。缺失 root metadata schema 时新定义无法从 transaction.doc 的 attrs 读回，测试模型因装配遗漏落到 ordered；不是大小写逻辑或已装配生产列表行为的退化。

仅修该测试文件：使用稳定的 `[...editorExtensions, DocxListsExtension]`，boot 后同步 parsed numbering 并发无历史刷新；保留原 bullet 断言，增加其实际 numId 定义的 numFmt=bullet 断言。保留其他人已有“引用”页签变更，未修改生产代码。

Toolbar27项与列表30项合跑 **3文件57/57**，Office tsc、该文件oxlint/oxfmt/diff通过。日志 `/tmp/mimir-docx-toolbar-list-harness-{before,tests,types,lint,format}.log`。无需为本测试修正重新构建浏览器。
