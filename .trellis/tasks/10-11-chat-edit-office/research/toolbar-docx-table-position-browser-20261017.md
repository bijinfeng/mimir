# DOCX 浮动表格最终生产浏览器验收

2026-10-17 root，localhost5180 lifecycle生产构建exit0。文档__br7BqHopVpfAsa，原件/tmp/mimir-docx-table-position-20261017.docx（3479B），无模型/Desktop，测试件保留。

## 真实布局

- 第一窄节将嵌入表设为文字在右侧：table x268/w241/right509，与后续正文x268/w624/right892同节内容左边界一致；doc-col-block与--page-cx120保留，正文确实绕流。旧120px偏移消除。截图docx-table-left-final-1280.png。
- 第二宽节将嵌入表设为文字在左侧：Inspector打开时table x771/w241/right1012，与该节正文x148/w864/right1012同右边界；关闭Inspector后真实宽节纸面正文在左绕流，截图docx-table-second-right-final-1280.png。
- 原件keyword表界面回显水平page/垂直text、xcenter/ybottom及四边独立距离。切水平为数值、输入-0.50cm，仅该轴改为rawX -283、移除XSpec；rawY -271、YSpec bottom、anchors page/text、top31/bottom57/left113/right229及opaque keep保持。未操作高表保留原生float且页面按suppressed流式显示。
- 点击表格行内空白中心会将浏览器光标放到旁侧段落；实际点击可见首行文字位置565,435可正确选中表格并开放属性。这是浏览器文字命中差异，未用脚本改PM selection。

## 原生保存与history

首两表应用后save→/tmp/mimir-docx-table-browser-saved-20261017.docx（3865B），只word/document.xml变化，native tblpXSpec left/0、right/9360与各节实际宽度一致。数值第三次操作save→numeric文件3859B，非document所有条目精确。原件keyword表除目标X与XSpec外原生定位保留。

保存后三步Undo/save，整件cmp3479B原始fixture逐字节一致；三步Redo/save，所有非目录ZIP条目与numeric首次save精确。reload重开成功。没有声称压缩后整件ZIP在Redo相等。

420×500固定footer/320px/内滚沿本片生产预检已通过（见preflight报告），此次最新生产主要复验真实两节定位/负坐标/原生保存/history。独立50项覆盖当前余宽suppression、原生两次保存、守卫、未知定位仅禁定位与AutoFit保留、取消失效。此为表格定位切片，不代表全部工具完成。
