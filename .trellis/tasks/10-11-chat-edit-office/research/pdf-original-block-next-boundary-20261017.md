# PDF 原文区块：后续实现边界

本研究为当前全工具补齐任务的下一边界，不表示已经实现。当前页面图像导出仍在本轮独立检查/浏览器验收中。

## 参考与证据

- 文件编辑主参考 GenOffice 固定 `480548fd55f1be3593ee0d8e316a734751d58309`，checkout `/tmp/mimir-genoffice-html-git`。
- `apps/pdf/src/renderer/ai/tools.ts:432/476` 定义 `edit_block`、`move_text_block`；`2110–2328` 先用 `groupPageBlocks` 聚合真正段落、唯一片段定位，再以原段宽重排或换算显示坐标偏移。段落重写不会推动页上其他内容；删除须移除原文字对象。
- `apps/pdf/src/renderer/text-block.ts:170` 是段落聚类算法；该 renderer 文件尚未 vendored，不能直接假设 Mimir 已有原件段落模型。
- WeKnora 站点本轮 HTTP200 证据 `/tmp/mimir-pdf-export-weknora-site.html`；公开源码 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 的工具定义证据 `/tmp/mimir-group-flip-weknora-definitions.go:14–75`。其知识检索与 sandbox 权限分工适用于宿主授权；没有 PDF 原文对象写回/Ribbon 参考，不作为这部分实现模型。

## Mimir 最小真实缺口

- `packages/office/src/agent/pdf-content-agent.ts` 仅允许唯一完整 PDF.js 文字项；`PDF_CONTENT_TOOLS` 没有两个 block 工具。
- `apps/server/src/services/pdf-agent-host.ts` 的核验再次要求 PDF.js 唯一完整文字项，并匹配 PDFium 单个文字对象。最终用全页包含/不包含字符串确认替换，因此不能靠取消前端守卫支持重复/部分原文。
- vendored `main/text-edit.ts` 已有 `_FPDFPageObj_GetMatrix/SetMatrix`、`withDocument`、`chainPdfium`、`saveDoc` 导出；`TextEditInput` 有原点、行距、逐行偏移。可以在私有适配层接多对象目标，不能手改 vendor 或以白矩形覆盖代替真实删除。

## 推荐的可审查切片

1. 建立当前字节身份绑定的段落聚类与对象集合核验。保留完整对象文本、索引和边界；重叠/无法证明归属的原件整批拒绝。
2. 第一条先补原件段落移动：对集合内每个真实 PDFium 对象矩阵施加同一 PDF 坐标偏移，保留字体/字形/非目标对象；显示 dy 向下须经页面 viewport 逆变换。以独立 PDF.js 的前后对象位置和文字读回验证，再接手动选择/移动 Inspector 与 Agent。
3. 段落重写与自动换行另条接线；核验按对象集合而非全页旧字符串消失，允许页上非目标重复文本保留。空串删除真实对象。字体选择、宽度测量、颜色、对齐、原生保存与一次历史同时验证。
4. 部分/重复原文替换与批量标注不混入第一个移动补丁；各自有独立目标定位、保存和历史证据后更新总矩阵。

涉及 shared schema、renderer host 类型/API、server 路由与内容写入器、Agent 目录、PDF Inspector 多层，必须先在 implement.md 声明具体文件所有权。普通 AcroForm/未知 Catalog 的现有 writer 拒绝仍然有效；结构迁移是另一边界，不能顺手去掉。
