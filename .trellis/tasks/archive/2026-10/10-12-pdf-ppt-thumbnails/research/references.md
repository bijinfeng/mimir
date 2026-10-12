# 参考核对（2026-10-12）

- 用户截图是本次缩略图栏的直接视觉参考：左列逐页列表、页码和右侧画布。
- 代码证据：`packages/office/src/editors/PdfEditor.tsx` 的 `goTo` 与 `PdfSheet` 已提供当前页导航和单页渲染；`PptxEditor.tsx` 的 `goTo` 与 `renderSlide` 已提供跨页导航和 SVG。应沿用现有渲染器，让缩略图跟真实内容一致。
- WeKnora 公开源码 [v0.8.2](https://github.com/Tencent/WeKnora/tree/v0.8.2)（tag `3e8b0bfc80b845b2d4b2ed683994748741450a97`）的 [README.md 第 153 行](https://github.com/Tencent/WeKnora/blob/v0.8.2/README.md#L153)列出 PDF、PPT 等文档格式，第 62 行说明其定位为知识库、解析与 Agent。它可作为文件覆盖范围的参考，但本次是 Office 文件编辑器的页面导航，不以 WeKnora 的编辑器工具栏或知识库预览作为交互依据。文件编辑交互以用户截图与 Office 网页版一类编辑器为主。
