# DOCX 设计工具实现边界（2026-10-17）

固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，本地 `/tmp/mimir-genoffice-html-git/apps/docs/src/renderer/components/ribbon-design-tab.tsx`：32–199 行为四主题、六字体、六色板；238 行主题合并字体/色板；449–480 行页面边框仅 box/none，作用当前节。App.tsx:5740–5760 为节/背景/主题状态，5991 为实时主题 CSS。Mimir 复用其原生主题写入与 pageColor 保存，不借 Markdown UI 设计 Office 工具。

WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`，已保存站点 HTTP200 及 definitions.go 的知识库工具（14–22）、sandbox 能力门控（35–50）证据。适用知识库 Agent 权限和能力描述；没有 Office 主题和节边框模型，不作为本片 UI 主参照。

实际缺口：Mimir 缺设计分类、原件主题/背景当前值、主题继承的真实预览、按节背景边框工具及 native history。主题/页面底色为文档级，边框显式区分当前节和全文。

实现位置：新 docx-design-save.ts 管私有PM元数据到原生保存选项/手术式 pgBorders；新 editors/docx-design.ts 管一次PM事务/目标冻结/原生history；DocxDesignControls + CSS 使用现有320px Inspector、内部滚动/固定动作；DocxDesignPreview 管视图层主题run和每页背景边框；DocxEditor 接紧凑 Design Ribbon、实时状态/分页。docx-styles.ts 只扩展既有样式重解析输入为实际保存后的主题，不重建另一套样式器；docx.ts 只接保存适配。

原生风险：section.ts:405–415 applySectionSettings 会重写整个 pgBorders 为简单框，故边框单独替换该子节点，保留其它节属性与未知 XML。固定主题实现只支持 theme1.xml；字体切换只改Latin和同一EastAsia槽，保留CS/script，实际预览从 apply/read 后的结果生成。原件未知主题路径明确拒绝主题写入。显式字体/色不随主题强制改，只有rawRPr原主题引用且模型仍等于原解析结果时才视图覆盖。预览不把继承显示值写成直接格式。

本片不改vendor/server/shared，不扩绘图/保护/比较或正文排序。保存两次、撤销重做、非目标ZIP保真、原件自定义边框、继承/显式样式、失效草稿为专项门槛；root负责真实浏览器1280/420。
