# DOCX 详细列表工具实施（2026-10-17）

## 来源与范围

- 文件编辑主参考：GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`；本轮 `git -C /tmp/mimir-genoffice-html-git rev-parse HEAD` 确认。`apps/docs/src/renderer/components/Ribbon.tsx:516–582` 提供六种项目符号、六种编号和三种多级预设，`1463–1494` 为真实 `numId` 应用，`3939` 起 `ListDefineDialog` 的九级格式/文字/缩进/起始值表单。Mimir 使用同样的原生级别和编号语义，呈现沿现有紧凑 Ribbon / 320px Inspector。
- WeKnora：使用本任务已获取的站点 HTTP 200 产物 `/tmp/mimir-group-flip-weknora-site.html`，固定 v0.8.3 commit `3e22822c1d2397be730c458c7539d0eb8c113a24` 源码 `/tmp/mimir-group-flip-weknora-definitions.go`。本轮重新核对14–22行知识检索与35–50行 sandbox 文件工具门控：可参考 KB/Agent 能力权限，不提供 Word `numbering.xml` 或 Office 列表工具栏模型，因此不作为此界面主要参考。没有运行竞品 GUI。
- 本片只补详细列表；文字大小写、排序、设计类工具仍为后续切片。

## 已实施

- 开始 → 列表 → 列表设置；基础项目符号/编号按钮也改为真实原生定义，缺 numbering part 时由原生 writer 建立关系与 ContentType。
- 15种预设：6项目符号、6编号、3多级列表；每个新定义含9级。
- 文档现有定义选择与当前值，混合编号/级别/非列表选区，保留各段级别或显式选第1–9级；无列表可清除混合选区。
- 九级逐级编辑：格式、格式文字、起始值、文字/悬挂缩进、编号对齐和编号后制表符/空格/无。
- 面板打开冻结实际 PM 段落选区。纯选区移动保持原目标；文档/附加结构变化锁定草稿；一次 PM transaction 同时更新段落和私有 root numbering metadata，普通 history/dirty 同步。Escape 回原可见工具或折叠组入口，由既有 Inspector 外壳负责。
- 列表定义读取缓存保留 Map 身份，纯选区或文本变更不触发整篇编号定义重建；undo 同步撤掉追加定义的画布 marker。

## 原件保真

- 直接应用现有定义保留 numId；默认逐段保留 ilvl。自定义详细修改生成新 numId，隔离未选段落。
- 原生 `SaveOptions.numbering.newDefs` 分配新 abstractNum、关系和 ContentType。私有结果适配只精修追加定义；原有 abstractNum/num 的完整 XML 原样保留。
- 自定义克隆原 abstractNum 与 num（含 lvlOverride、startOverride、rPr 字形、未知属性/孩子），只改编辑字段。原编号字体/颜色/字号、制表位、未知属性保留；起始覆盖与有效级别同步。
- 补 `docx-list-plan.ts`：先冻结列表身份变化，让原 table/native planner 处理其它文本/格式增量，再精确 patch numPr。纯列表操作保留选中原段的 w:p 属性、完整 pPr、未知孩子和原始 runs；普通表格单元格列表也有逐 XML 验证。清除继承样式列表写 numId=0，避免重开重新出现编号。
- 引用、图片和表格保存链继续调用，未改 vendor。

## 验证

- `docx-lists.test.ts` 23/23：15库预设原生写回/重开、缺编号部件、实际选区/混合态、未知XML与覆盖克隆、非目标段、单 transaction、两次保存、保存后 undo/redo 所有 ZIP entry 精确恢复、失效拒绝、清列表、稳定缓存、表格精确 XML、列表+后续文本与继承编号清除。
- `DocxListControls.test.tsx` 3/3：真实 DocxEditor Ribbon/Inspector、最后输入、冻结真实选区、固定操作区结构、可见重置文字+图标、单事务/dirty、两次保存与 undo/redo 全 entry、过期锁定/Escape/切源、混合选区清除。
- 相关回归10文件85/85：上述两文件加 references、ReferencesControls、image、picture-history、table-design、TableDesignControls、image-save、docx-save。
- Office tsc、9文件 oxfmt、目标 oxlint、全仓 `pnpm lint:styles` 与目标 diff whitespace 通过。
- 未运行新的全仓 `pnpm check`：根会话已有480项 bundled Impeccable脚本lint阻断证据；不能声称全仓绿。
- 本实施者未做浏览器截图；真实宽屏/420、布局变化中 Inspector 保持与原件 HTTP 回读由根会话独立验收。组件测试不替代真实可视验收。

## 浏览器 fixture 与边界

- `/tmp/mimir-docx-lists-native-fixture.docx`：4段中文；前三段同 numId17（级别0、1、0），第四段普通段落。编号有 startOverride5、完整覆写级别、多处 unknown sentinel、颜色/字体/字号/制表位；每段含 keepNext/suppressOverlap/rsidR。选第一/第二段改列表时第三段应继续17，当前值应显示混合级别。未上传；由根会话按专用验收 KB 路线上传，不删除测试文件。
- 复杂表格若原生 XML 段落数无法与 PM 表格可靠映射（例如被保护的额外内部段落），保存明确拒绝，不猜测段落位置。结构变更与列表复合编辑仍沿 native 的结构保存能力，未宣称任意合并/嵌套内容均已逐件验收。
- 自定义修改克隆列表用于选区，不全局修改共享原定义；Word 后续计数与跨软件布局仍须实际原件验收。
