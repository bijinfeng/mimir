# DOCX Design 实现与冻结（2026-10-17）

## 改动

- 新 `src/docx-design-save.ts`：私有PM根设计属性和节末节点边框属性转原生主题/pageColor保存参数；内节和末节只替换pgBorders。原件主题路径、复杂图形背景无法由固定引擎安全替换时明确拒绝。source缓存受BoundedZip预算约束。
- 新 `editors/docx-design.ts`：根/节点扩展、冻结目标、当前节/全文、四主题/六字体/六色板、一次原生history动作，后续手动输入另一次history；节末属性跟随节点，不按可漂移的节序号保存。
- 新 `DocxDesignControls.tsx` / `docx-design.css`：紧凑Design Tab的两个入口「主题与字体」「页面颜色与边框」。复用320px Inspector，正文内部滚动/固定footer、可见次要按钮、原件当前值、局部草稿预览、显式应用/恢复原件主题/无底色/无边框、当前节或全文。原件未知主题路径和图形背景原因明示。
- 新 `DocxDesignPreview.tsx`：主题引用run仅作装饰器，themeTint/shade使用原生解析；当前直接格式不覆盖。继承段落/字符样式从原styles.xml与实际保存后的主题重解析，不把继承显示值烘焙进PM。纸张底色沿原生--page-bg；逐页边框沿原生pageFramesFromGaps/pageBorderStyleOf含原件每边样式/art。
- `docx-styles.ts`：只给既有重解析器补实际theme输入。`docx.ts`：保存计划/options接私有适配；原会话基底不变。`DocxEditor.tsx`：Design Tab/扩展/活文档订阅/预览接线，保留原引用、列表、case、图片、表格工具。`docx-toolbar-render.test.tsx`只增新Tab期望。
- 新native/组件tests和 `docx-design-test-fixture.ts`；验收夹具 `/tmp/mimir-docx-design-fixture.docx`（有两节、自定义top double边框、themeTint run与显式Courier/123456 run）。

## 验证

- 8文件 **87/87**：new docx-design（8）+new DocxDesignControls（3）+现有toolbar/AdvancedControls/ListControls/case/references/docx。
- 新native：current/internal/all节保存重开；手术式未知XML/custom边框保留；两次保存和undo/redo全ZIP entry比较；字体/色/底色组合单一history，后续typing隔离；themeTint预览、显式font/color优先；缺theme原生创建/恢复原件主题；自定义主题路径和图形背景安全拒绝。
- 新组件：真实DocxEditor Ribbon/Inspector、当前主题高亮/字体/底色、草稿不dirty、实际画布theme-run预览、应用一次docChanged、保存/恢复原件/undo-redo原生全entry；冻结第2节后光标移到第1节仍改第2节、全文/清底色；stale拒绝/Escape回实际来源、固定footer结构。
- Office tsc通过；owned目标oxlint、oxfmt、styles、git diff --check通过。整体pnpm check仍有先前已记录的480项bundled Impeccable脚本lint阻断，本片未重跑/不声称全仓green。
- root负责真实浏览器1280/420和HTTP原件检查；本报告不冒称已做视觉验收。

## 真实边界

固定GenOffice也只提供页面边框box/none；本片可保留并显示原件完整边框，但新建为0.5pt/24pt四边框。主题字体切换沿原生Latin+EastAsia，不扩cs/script写入。自定义主题路径/不完整主题关系、非自闭合图形页面背景不安全替换，保留原件并提示Word编辑。连续节共用一页时UI明示画布按页首段所属节预览，保存精确改目标sectPr；最终分页以Word为准。未改vendor/server/shared，未提交/暂存/归档/删测试件。

冻结后检查共享RGB接缝补修：共享picker回调格式为#RRGGBB，DOCX原生pageColor须无#。DOCX onPick现在去除#并转大写；真实Editor组件追加123abc→保存w:color="123ABC"与画布--page-bg:#123ABC，3/3及目标lint复过。原有87项计数不重复累加本次重叠回归。

暗色纸view-only补修：theme run沿原生dkColor，取消会盖住暗色屏幕规则的inline!important；每边overlay沿setDkBorder，zOrder back沿原生screen/multiply类，art strip沿原生absolute类。DocxEditor设计options只依赖根设计attrs，不再使用hook依赖抑制。目标lint通过，新增checker专项与最终合并门禁由独立checker报告。
