# PPTX 图片项目符号预览最小修复计划

2026-10-17。root 实际浏览器证明 PNG 顶层/JPEG 直接组员原生写入与保存/history 正确，但画布缺图。本片仅修只读预览，作为已授权图片符号功能的缺陷修复。

## 最小行为差距与真实位置

固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的 `pptx-render/src/text-layout.ts` 已将 `<a:buBlip>` 经 slide media relationship 解析为 `GlyphRun {text:'', image:dataUrl, widthPx, ascentPx}`；段落符号大小/悬挂缩进和图片纵横比已在纯布局层计算。Mimir `pptx-svg.ts:textLayout` 有图片 `<image>` 分支，却在之前用 `if (run.text === '') continue` 跳过了它。顶层/组成员和表格文字均共用此函数，故是相同适配器缺陷。

## 文件边界

- `packages/office/src/pptx-svg.ts`：图片先按现有坐标/尺寸绘制，再跳过空的普通文字 run；保留现有样式段 flush 和 paragraph 身份。
- 新 `packages/office/src/pptx-picture-bullets-preview.test.ts`：真实 OOXML buBlip/rels/PNG/JPEG → 正式 reader → renderSlide/SVG；顶层/直接组员、百分比与固定大小、悬挂缩进、换行首行一次、未解析图片原 dot fallback、源切换与重复渲染无额外资源分配、只读无原生变更。
- 本计划与实施结果报告。普通修复不改变现行产品契约，不新增长期 spec 流水。

不改 vendor/native writer、PptxEditor、deck 预览组件、宿主/Agent/工具栏及并行 checker 文件，不安装依赖，不操作浏览器，不提交/暂存/归档/删测试件。当前脏树包含其他人工作，完整保留。

## 资源与来源

直接输出 session 已准备的 data URL；没有创建 Image、ImageBitmap、Canvas、Object URL、异步请求或自有缓存，不增加逐帧解码工作或晚到回调。媒体准备/取消/version/source 守卫沿现有 `preparePptxDisplayMedia` 与 session.replaceFromHost 原子发布；对应既有 image-display 回归继续覆盖。重复渲染与 A→B→A 显式测试相同 ref 换 URL 时实际输出变化，不从旧源取图。浏览器负责内联 SVG image 的正常解码与 DOM 生命周期，不宣称其内部缓存可由此片控制。

## 验证与交接

先让新增关键真实 reader/SVG 用例在旧代码失败，再执行最小修复；运行 targeted pptx-svg/group-svg/picture-bullets-preview、image-display、原批量图片符号测试及 Office types/scoped lint/format/diff。读取 root 提供真实保存件 `/tmp/mimir-pptx-bullets-browser-group-jpeg-20261017.pptx`，输出正式 renderSlide SVG 与 layout→image 实际数/大小以供 root 独立浏览器验收；原文件字节不改。root 负责新统一 Web build、生产 SqKd4s64itsUDl1_ reload、1280/420px PNG/JPEG 实际可见与原件/history复核。

## 参考适用性

此处事实来自固定 GenOffice 本地 vendored reader/layout 与 Mimir 实际 SVG 适配器。已核对当前任务 `research/pptx-batch-picture-bullets-implementation-20261017.md` 所记录 WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`：其 Agent definitions/能力门控适用于 KB/Agent，不提供 DrawingML buBlip 布局或 SVG renderer，故不作为 Office 预览实现依据。本修复未作新的产品功能调研或远端营销推断。
