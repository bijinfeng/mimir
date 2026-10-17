# PPTX批量图片项目符号浏览器验收

2026-10-17 root。生产5180、文档SqKd4s64itsUDl1_，baseline SHA0b31f1142a701b14429fdf3d25e8f9fdbf75ecdeca4b9cde020b5eb4847e1216。

## 已实测

- 两顶层Shape2/3选择PNG；两直接组成员Shape4/5选择JPEG。准备后保存仍禁用，主动作可用；仅显式应用产生一次历史。
- 每类均应用、保存下载、Undo保存下载、Redo保存下载。所有历史版本每个非目录ZIP entry逐字节正确；PPTX重新打包的ZIP目录/元数据不同，不能声称整个压缩包SHA相同。
- Python独立逐目标段落核验2个buBlip，关系解析后媒体字节等于选择原图；非目标Shape6无blip，未操作ZIP entry/customXml原件精确。仅目标pPr不同，几何/文字/其余slide内容原文一致。
- 420×500实际面板宽320，固定主动作在可见footer；对象与详细格式共同内部滚动。Escape关闭并回焦打开对象选择与格式按钮。保存后reload完成。

工件`/tmp/mimir-pptx-bullets-browser-{top-png,top-undo,top-redo,group-jpeg,group-undo,group-redo}-20261017.pptx`。

## 实际发现：画布未显示图片符号

宽屏实际截图只有文字，无图片项目符号。不能以native保存成功代替预览可用。已交implementer修复共享pptx-svg textLayout空文字跳过图片run的问题；须独立检查与新build/browser。旧截图仅作失败证据，420面板结构已验证不等于预览完成。


## 最新生产预览修复通过

`/tmp/mimir-all-tools-final-web-20261017.log` exit0后实际reload，主画布及缩略图出现红绿图片符号；实际DOM主画布8个SVG image，两顶层PNG和两直接组成员JPEG各两段均显示。重新打开Inspector选择组内Shape4/5，当前列表类型图片符号、当前图片相同，apply/save/Undo/Redo均disabled，无新dirty/history。420×500截图`pptx-picture-bullets-final-420-20261017.png`已实际查看，320px面板固定primary可见，画布露出真实图片。宽屏实际查看确认四对象所有段落均有图。旧图片缺失结论保留为历史失败；已由共享SVG分支最小修复和独立41/41结清，见pptx-picture-bullets-preview-independent-check。
