# PPTX 统一选择与组合成员格式

## 证据与适用边界

- GenOffice 固定 commit `480548fd55f1be3593ee0d8e316a734751d58309`；本次 `git -C /tmp/mimir-genoffice-html-git rev-parse HEAD` 核对一致。`apps/slides/src/renderer/App.tsx:3292–3410` 的 `onPictureStroke` / `onShapeStyle` / `onShapeFill` 对全部选择对象遍历；选中组合仅展开直接 shape/picture 成员，写入携带 `groupId`。`style-actions.ts:35–150` 的字体、字号和字形使用全局 `selectedIds`；`190–232` 为段落批量入口。这是本片的工具语义依据。
- WeKnora 网站 `https://weknora.weixin.qq.com/` 本次 HEAD 在 10 秒后零字节超时；未将不可达记作成功。公开源码 v0.8.3、commit `3e22822c1d2397be730c458c7539d0eb8c113a24` 的 `internal/agent/tools/definitions.go` 本次从 raw GitHub 成功读取 13533 字节，缓存 `/tmp/mimir-pptx-selection-weknora.go`。其中 `ToolSearchKnowledge` / `ToolReadDocument` / `ToolListDocuments` 及 `AvailableToolDefinitions` 对应知识库/Agent 能力，没有 Office 组合选择或 Ribbon 参数，因此不用于本片工具栏布局。知识库身份与当前文档授权仍沿 Mimir 原有句柄。
- Mimir 固定 `pptx-ops/src/ops/text-ops.ts` 明确支持 `setText` / `setFont` / `setParagraphFormat` 的 `op.group` 路径；`pptx-engine/src/identity.ts` 提供 `groupChildDurableId`、`matchesElementRef` 与 cNvPr 升级别名。复用这些原语，不修改 vendor。

## 本片实现边界

- `pptx-selection.ts`：全对象上下文/运行时及持久别名解析；原始 cNvPr 引用继续保持，首次运行时 ID 立即规范到持久引用；祖先/子孙重复消解；仅展开顶层组合的一层直接成员；每个操作单独补 `group`。
- `PptxSelectionControls`：紧凑对象列表，共享 root 的受控选择；Ctrl/Cmd 加选、Shift 连选、方向/Home/End 导航及全选；源/页范围与版本/选择草稿隔离，选择变化保持对象行键盘焦点。字形、字号、颜色、对齐、填充、轮廓显示当前值/混合及实际支持对象数；只有明确调整的字段产生操作，一次 `applyOps` 原子提交。轮廓逐对象保留原参数。字号限 1–400pt 与当前本地适配一致。
- `PptxGroupTextControls`：单选一层组合成员时使用 `ToolbarTextArea` 自由编辑本地文字草稿；输入不发送宿主请求，明确标记“未应用 / 保存不包含草稿”。点击“应用成员文字”才对原始 paragraphs 运行一次 `editPptxTextValue`，提交单个 `setText` 原子批次；取消恢复原文。源/目标/版本变化清除旧草稿，失败保留以便重试，卸载/重复提交/迟到结果受守卫约束。只在自己的已接受文字结果上恢复原 caret，用户已转移到外部输入时不抢焦点。
- 面板内部滚动，固定底部应用/重置；主题色使用 `--me-*`，字段一列、具名标签且无宽表单。实际宽/420 浏览器验收由 root 集成后完成，不能以本记录替代。
- 深层组合只列出并禁用；图片仅参与轮廓，表格/透传对象不冒充文字/填充目标。成员文字当前不提供字符范围格式按钮；批量文字格式明确应用整个文本对象。

## 验证

- `pptx-selection.test.ts`：真实两形状原生组合，八操作原子格式，持久/运行时别名与祖先去重，两次保存、未改 ZIP 条目保留、保存后 undo/save/redo/save 逐条目恢复，非法格式预拒绝。
- `PptxSelectionControls.test.tsx`：当前混合/可见标签、仅显式字段、一次提交、受控 Ctrl/Shift 与键盘焦点、版本/来源草稿丢弃、失败保留、重复提交禁用、空选择可达。
- `PptxGroupTextControls.test.tsx`：真实快速输入不锁框/不调用宿主；两次显式应用与两次保存读回；多 run、多段落原字体/字号/颜色、未选兄弟保持；取消、外部版本清草稿、失败保留、卸载迟到与外部焦点不被抢走。
- 首轮三个文件共 9/9 通过；Office tsc 与定向 lint/format 在最终报告记录。root 自有 Editor 整合/浏览器证据及独立 checker 结果另记。

后续修复：真实旧文稿首次 creationId 升级使 group/member 当前 durable ID 改变，组合文字入口继续使用最初选中的成员别名，父组合用持久 cNvPr 别名。

真实浏览器发现逐字宿主请求会在快速输入 ` 2027` 时锁框，原先端尾输入单测不足以证明实际输入可用。最终改为上述显式文字草稿，消除逐字请求与输入期间的忙碌禁用；一次应用按原来源映射，成功后只迁移自己的提交 caret。root 的新版挂载 Editor 7 项与 GroupText 4 项共 11/11 通过，Office tsc、定向 lint/format/diff 通过。空选择缩为具名引导、三个布尔值一行、字号/颜色两列；实际浏览器由 root 最后构建验收。
