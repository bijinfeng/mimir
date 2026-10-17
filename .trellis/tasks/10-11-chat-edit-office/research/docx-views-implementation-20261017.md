# DOCX 视图、缩放与导航实施记录

2026-10-17，当前切片代码已冻结，真实应用浏览器验收与独立 checker 由 root 继续。整体工具补齐任务仍 in_progress。

## 参考与语义

- 固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，本地 `/tmp/mimir-genoffice-html-git`。`ribbon-tabs.tsx:1135–1250` 的打印/Web/阅读与缩放、`App.tsx:1594` 的 editable 处理为本片主要对标。原始证据见 `docx-views-drawing-next-20261017.md`。
- WeKnora 官网 HTTP200 及 v0.8.3、commit `3e22822c1d2397be730c458c7539d0eb8c113a24` 的证据沿用同任务 `xlsx-structured-clipboard-plan-20261017.md`；其 sandbox 能力门控只适用于如实表达工具能力，不提供 DOCX 视图/缩放实现，不作为 Ribbon 设计主参考。
- 阅读是呈现状态，隐藏编辑 Ribbon 并阻止键入；不声称修改原件保护属性。显式 Agent 写入、草稿开始/提交、整轮回退会先退出阅读并提示。直接或已在途写入产生实际文档 update 时也退出。只读 Agent 工具保持阅读，句柄不重建。
- 标题大纲用于导航真实 heading，不是可编辑大纲。按 root 批准，本片暂不实现只读 split；绘图、保护、文档比较继续保持缺口。

## 变更

- `DocxEditor.tsx`：会话级打印/Web、阅读、缩放、fit 与导航状态；唯一 EditorContent 原位保留；阅读工具栏复用 CompactToolbar；Ctrl+F 退出阅读后展示现有查找替换；导航 Escape 返回当前可见入口或折叠导航组。Agent wrapper 在稳定句柄中处理显式写入退出。
- `pagination.ts`：enabled/scale 通道；Web 停止分页观察与重试，清当前实际分页路径的页间隙、续注/尾注、分栏、页眉页脚、浮动图片层、混合纸张层和打印最小高度；返回打印重新测量。缩放时同步测量暂置 100%，finally 还原后再同步页码。
- `docx-view.ts`：实时标题提取、真实 scroller 可用宽高 fit、临时无缩放测量和原生 PM 列拖宽坐标修正。
- `DocxViewControls.tsx` / `DocxViewPanel.tsx` / `docx-views.css`：紧凑视图/缩放/导航组与阅读工具栏，320px 导航 Inspector、标题层级/空态和页跳转，Web 连续布局与阅读拖柄隐藏。
- `DocxEditor.views.test.tsx` / `docx-view.test.ts`：真实 Editor、Agent、保存导出、PM 插件和 vendor 图片拖柄回归。

未改 vendor/server/shared/PPTX/XLSX/clipboard，未引入第二个编辑器。当前 Mimir 分页并未调用 vendor 的 row-fill/oversize-clip/float-shift/cut-overlay 通道，本片没有为未启用通道增加旁路清理。

## 验证

目标命令：

```sh
pnpm --filter @mimir/office exec vitest run src/editors/DocxEditor.views.test.tsx src/editors/docx-view.test.ts src/editors/DocxEditor.export.test.tsx src/editors/docx-toolbar-render.test.tsx src/pagination-geometry.test.ts src/docx-footnote-flow.test.ts src/docx-footnote-gaps.test.ts src/docx-endnotes.test.ts
```

**8 文件 67/67 通过**；Office `tsc --noEmit`、8 个目标文件 oxfmt、7 个 TS/TSX 目标 oxlint、`pnpm lint:styles` 与 `git diff --check` 通过。

关键断言：

1. 打印→Web→阅读→导航 Escape→阅读 Escape→打印→150%→100%，唯一 PM DOM、JSON、选区、Agent identity/version、undo/redo depth 与 clean 状态保持；导出全部非目录 ZIP entries 与源文件精确相等，不调用库 save。
2. 真实 column/page-gap decoration 及纸张/HF/image DOM 在 Web 清除，延迟后不会重新分页；返回打印再次执行真实 block 测量。happy-dom 无字体布局，该测试显式提供受控 block rect，不冒充浏览器分页几何。
3. 阅读 Agent read 不退出，write/draft/direct doc update 退出；修改、撤销/重做及 handle identity 正常；Ctrl+F 退出且现有查找输入实际可见，不产生文档变化。
4. ResizeObserver 观察实际 scroller；1000→680 可用宽度以及420高度重新 fit，100% 复位；不写文档/版本/dirty。
5. 活标题定位到真实 PM position，Escape 恢复入口；阅读下不会聚焦 hidden 编辑工具栏的同名按钮。
6. 50/100/150/200% 的原生 PM 列拖宽 mouse down/move/up 均按 client delta / zoom 修改所有行目标列，原 event.clientX 保留，单步 undo 恢复 JSON。
7. 同四倍率直接驱动 vendor 图片东侧拖柄，模型尺寸按 delta / zoom，非目标高度保留，单步 undo 恢复 JSON。

## 验收边界

- root 已提供 `/tmp/mimir-docx-views-20261017.docx`、实际文档 `iS3v3GY5x7XqhkKO`，含多节纸张、标题与真实2×2表；本 worker 未上传或删除文件。
- root 首轮统一 Web build exit0：`/tmp/mimir-group-picture-views-web-build-20261017.log`。其后阅读查找/导航回焦/CSS 小修需要 root 最终构建包含；本 worker 未启动全量 build 或全量 Office suite。
- 浏览器需检查宽/420、中栏 fit、混合页尺寸/双栏打印还原、缩放定位与拖宽及导航焦点；测试不能替代真实布局。
- 无模型调用，Desktop 用户自验；未暂存、提交、归档。
