# DOCX 表格设计与属性增量

## 最小行为差距与边界（实施前）

- 固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的 Ribbon.tsx:336–383 提供5种直接格式预设，:2400–2476 提供文档表格样式和六个tblLook开关；editor/table-properties.ts:150–220实现真实PM操作。Mimir原TableMenu仅三种单元格边框、左边距和基础属性，且末尾关于未vendored docStyleCss的提示已陈旧。
- 原生转换/生成支持tblStyle、tblLook、四边距、AutoFit和浮动属性。当前docStyleCss已接入，但表格条件规则不按实时tblLook；解析又把条件底纹/字色/粗体放入PM显示attrs，不能把旧显示值烘焙成新直接格式。
- 新增紧凑Ribbon入口与320px右Inspector；5预设、文档样式、六开关、选择区域边框和四边距/布局草稿只在单一应用动作提交，冻结真实表格和文档身份，一次history。
- 预计修改DocxEditor入口与实时条件视图、新DocxTableDesignControls、私有helper/CSS/tests；必要docx-table-save适配将仅表格属性/单元格底纹边框差量应用到原生保存计划，保留未改表格内容XML。浮动定位仅在保存和显示均可证明时开放。
- 不改vendor、图片/目录文件、其他格式、公有Agent工具白名单；不构建部署、不提交归档。root执行浏览器宽/420与原始HTTP文件验证。

## WeKnora适用性

沿现行研究固定证据：站点HTTP200 `/tmp/mimir-group-flip-weknora-site.html`；v0.8.3 commit `3e22822c1d2397be730c458c7539d0eb8c113a24` 工具定义 `/tmp/mimir-group-flip-weknora-definitions.go`，知识检索/沙箱能力门控与Office表格设计无对应，不作为Ribbon模板。

## 实施结果（2026-10-17，源码冻结）

- 表格分类新增「表格设计与属性」入口，必须有真实表格选中或表内光标才可用。Inspector 复用320px外壳，分为文档样式/5种带预览预设、六个tblLook开关、边框、布局与四边默认边距；内部滚动、固定单一「应用表格设计」动作。边框有整表/冻结选区范围及全部/无/外侧/内部/内横/内竖/四边10种选择，最新线宽/颜色/范围草稿按首击应用。
- 真实PM表格及文档身份冻结；外部文档或SaveOptions变化后拒绝旧草稿；显式应用为一个隔离history事务，取消/Escape不写正文。关闭commit后定位当前原生触发BUTTON；Ribbon折叠后可回该命令组菜单，避免保存旧antd ref。
- `DocxTableDesignPreview`只发视图CSS，不写模型。修正原生静态规则忽略实时tblLook的行为；水平/垂直条纹、首尾行列、连续重复表头和vMerge真实列定位、直接底纹优先。垂直条纹由有界原件styles.xml读取basedOn及colBandSize，使用原生themeFill/tint/shade解析；原生水平条纹优先于垂直条纹。
- `docxTableSavePlan`沿原生文本保存计划，在原件表格行/列/合并结构相同时外科修改对应tblPr子项、grid/tcW和有变化的单元格底纹/边框；不把原条件显示底纹烘为直接格式。未改段落、vMerge继续格、caption/noWrap、对角线、未改边线及space/shadow属性保留；变更AutoFit时同步原生宽度/grid/tcW。结构变更仍交既有原生生成器，未宣称该路径未知XML全保真。

## 验证

- `vitest run src/editors/docx-table-design.test.ts src/editors/DocxTableDesignControls.test.tsx src/editors/DocxImageControls.test.tsx src/docx.test.ts src/editors/DocxEditor.picture-history.test.tsx`：5文件21/21通过。其中表格helper7项、完整Editor3项，覆盖六look/四边距/样式预设/选区边框/合并/主题继承垂直条纹/重复表头/三AutoFit、两次保存、save→undo/save→redo/save ZIP所有entry恢复、最后输入首击提交、草稿不变更/过期拒绝和Escape回焦。末次显式false优先补丁后helper7项再通过；原生wholeTable类型未建模字体/字距/大小写，已撤回三处不成立的fallback后重跑tsc；与前述21项重叠。
- Office `tsc --noEmit`、目标Oxlint/Oxfmt、`pnpm lint:styles`通过；`antd lint`对DocxEditor及TableDesignControls均0 issue。旧图片组件测试有既有异步act提示，不将提示误报为断言失败。未运行全仓check，已知全仓bundled技能lint阻断由root维护。
- 真实合并测试文档：`/tmp/mimir-docx-table-vmerge-fixture.docx`，复用上述专项同一夹具构造，含MimirConditional首尾行列/条纹、vMerge、直接紫色底纹、对角线和未知属性。只提供root浏览器验收，未上传知识库。
- 本代理未构建、未部署、未跑浏览器或Desktop；宽/420px截图、菜单折叠回焦、实际画布样式、下载原件保存历史由root与独立checker收口。真实模型未配置，用户已指定本轮代码与浏览器验收、Desktop自行验收。

## 保留边界

- 浮动表格的精确定位/文字环绕未新增UI，不能声称表格属性全量完备。
- 新插入或行列/合并结构改变后的表格继续沿既有原生结构生成路径；本片的未知XML保真证明限于结构稳定的原件表格设计增量。
- 原生TableDisplay未建模的角单元格条件、复杂段落条件和更多边框类型仍属引擎已有显示边界；本片不以六个开关推论Word条件样式完整渲染。
