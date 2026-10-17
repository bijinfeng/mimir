# PDF 画布绘图手势切片 · 2026-10-17

## 来源与行为边界

固定 GenOffice `/tmp/mimir-genoffice-html-git` HEAD 为 `480548fd55f1be3593ee0d8e316a734751d58309`。
`apps/pdf/src/renderer/DrawLayer.tsx:158–345` 使用 pointer capture、自由笔点列采样、矩形/椭圆/直线/箭头拖绘、已有对象拖移与选中图片角点尺寸手柄。上游 pointerup 即提交，Mimir沿当前显式草稿应用约定，松手只准备草稿。

WeKnora 站点 `https://weknora.weixin.qq.com/` 与固定 v0.8.3 commit `3e22822c1d2397be730c458c7539d0eb8c113a24` 的 `internal/agent/tools/definitions.go` 本次均 HTTP 200；证据分别 `/tmp/mimir-pdf-canvas-weknora-site.html`、`/tmp/mimir-pdf-canvas-weknora-definitions.go`。14–21行知识检索、35–49行沙箱能力、69–75行wiki范围门控属于KB/Agent职责，没有PDF指针或Ribbon语义，不能作文件绘图主模型。

当前Mimir已有local自有矢量CRUD和精确页面几何缓存，缺新自由笔采样、形状拖绘与已有绘图手势。PdfSheet当前pending裁剪/纸型以旧source canvas和CropOverlay预览，直接按最终displaySize叠绘会错位。绘图模式复用buildPdfWorkingCopy临时物化整个当前layout，用真实readPdfPages得到的CropBox显示尺寸绘制，且提交仍由原agentContentRef再次物化并原子写入。

## 文件责任与接口

- PdfEditor.tsx：唯一整合者，现有local read缓存附临时预览身份；绘图模式用临时字节渲染实际纸面；原runManualContentTool支持取消signal/expectedVersion。
- PdfLocalPanel.tsx：绘图tab变为可通知父层的模式；接独立绘图控件并保留数值精确表单，同步选择id。
- 新PdfDrawingCanvas.tsx、pdf-drawing-canvas.ts、CSS和测试：显示空间pt坐标、采样/逆向线条、移动/八手柄缩放、显式应用草稿、取消与迟到守卫。
- editors.css：按root追加授权，PDF所有Inspector由300px统一320px，窄覆盖max-width保留32px文档上下文；不重排现有表单。
- 不改vendor、其它编辑器、服务内容writer白名单、原件绘图（非MimirDrawings）或保存实现。

每次手势只更新内存草稿；点击应用执行一次add/update_drawing与一次history。切页/源/版本/模式使草稿失效；Escape/pointercancel/外部pointerup/失焦终止未完成手势。accepted请求不会因为busy自身变化被取消，只有切页/源/模式/显式取消使signal失效。墨迹最多2000点。

浏览器实际样式/拖动和下载由root接续，不将本片组件测试当作浏览器或Desktop验收。整体任务保持in_progress。

## 实施冻结与验证

已接：新增「绘制」Ribbon →「画布绘图」，右侧绘图工具下拉为选择与调整/自由笔/矩形/椭圆/直线/箭头/勾选/叉号；纸面松手只更新草稿，固定底部「应用画布绘图」单次add/update。自有绘图透明命中层支持拖移、八个尺寸手柄；ink点随bbox平移/非等比缩放，逆向line/arrow保留朝向，水平/垂直线不因最小0.25pt偏移端点，箭头头长独立于窄bbox。原精确数值/样式Inspector和删除仍可用；其中精确数值按钮为次操作。切页/换源/历史版本/切模式重建手势作用域，signal与expectedVersion双重检查。busy自身不会取消已接受请求，取消结果不发布旧错误。

页面预览沿buildPdfWorkingCopy使用当前layout与用户选择的导入源，readPdfPages提供真实尺寸；同一PdfSheet的render完成身份（bytes/index/rotation/width）满足后才挂可交互SVG，避免新几何配旧纸面像素。只在绘图模式挂层；选择模式仅命中MimirDrawings，退出后恢复原字/图/表单路径。

最终PDF回归7文件62/62（其中新Editor手势10项、纯几何8项，其余与既有PDF专项重叠），覆盖非零CropBox、四旋转、pending裁剪+A5、所有形状、真实表单保留、两次保存后再编辑、undo/redo、pointercancel/外部up/blur/Escape/切页、迟到结果原子拒绝、延迟busy请求成功、实际render未完成不接指针。测试入口：`PdfEditor.drawing-canvas.test.tsx`、`pdf-drawing-canvas.test.ts`；同时重跑local/content/forms/images/pending-forms。目标Oxlint、Oxfmt、Antd lint（Canvas/LocalPanel）、styles与git diff --check通过。最后单图标与数值次按钮样式微调后再次目标lint通过，无行为变化。

Office tsc本片无PDF错误；检查时并行DOCX表格实现先后有test union attrs及Preview run attrs类型错误，已告知root/owner修复，最终状态以root统一门禁为准。

尚未浏览器/模型/Desktop验收，无build/提交/暂存/归档。root接真实宽屏/420px与下载。范围限制：仅Mimir自有绘图；不提供原件任意矢量选择、橡皮擦、任意旋转手柄、文本插入拖拽与完整字形/对齐，本片不补它们；自由笔沿合同最多2000采样点。全目标仍in_progress。

冻结前最后一次Office `pnpm --filter @mimir/office typecheck` 已exit0（并行DOCX类型错误已由其owner修复）。
