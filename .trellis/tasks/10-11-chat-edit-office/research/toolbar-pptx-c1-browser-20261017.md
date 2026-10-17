# PPTX C1 组内图片真实浏览器验收（进行中）

2026-10-17，root；localhost5180，12:32生产构建。固定GenOffice/WeKnora引用沿C1独立check报告，不新增网络证据。无Desktop/provider调用。

## 已通过的实际保存链

文档 `Ij95zCDESupIbZgd`（anisotropic37，已有测试库KY635Y），初始111483 B。parent原生rot45°、flipH、非等比ext6000000×3000000/chExt4000000×1500000；child rot37°、flipV、opacity37%，srcRect 10/5/15/20%，且未知xfrm属性 `urn:mimir:crop-test keep=yes`。

UI对象列表选直接成员“产品图片”，打开组合图片Inspector，真实当前值正确。启动画布后出现8把手，底图和保留区为实际斜切平行四边形。真实鼠标将“裁切左边缘”中心(742,371)拖到(712,381)，保留比例56%→49%；草稿阶段保存/撤销仍禁用，没有产生dirty。点击唯一应用后，Inspector左侧19.549%，只产生一步撤销，返回“在画布裁切”按钮。

保存 `/tmp/mimir-pptx-c1-browser-saved-20261017.pptx`：只有ppt/slides/slide1.xml变化，全部非目录entry集合不变；srcRect l19549/t5000/r15000/b20000，child off2137403/645975、ext1047214/800000。parent transform、child rot/flip/opacity/未知属性、媒体/关系/兄弟保持。

保存后一步Undo再保存 `/tmp/mimir-pptx-c1-browser-undo-20261017.pptx`，全部非目录ZIP entry与原始before完全相同；Redo再保存 `/tmp/mimir-pptx-c1-browser-redo-20261017.pptx`，全部entry与第一次saved完全相同。没有把重压ZIP整件字节声称完全相同。原始基线 `/tmp/mimir-pptx-c1-browser-before-20261017.pptx`。

## 实际布局失败与修复交接

1. 1280×800时裁切画布主“应用拖动裁切”bbox x844.77/y909.64/w123.69/h24，已落在可见工作台底边774以外。源码feedback absolute + top100%把主动作放到整张大幻灯片下面。点击时浏览器自动滚入才可提交，不算固定可见动作验收通过。交原C1/D checker修复本地dock；尚待新构建实测。
2. 420×500时Inspector bbox x84/y189/w336/h284.36，来自pptx-tools.css width340/max calc(100%-32)。要求320，已交同checker统一修正。body client119/scroll627，固定footer y402.36→451.36可见，页面scrollWidth420未横溢。尺寸与实际截图 `pptx-c1-inspector-production-420.jpg` 已读；只证明此次布局，不算320门槛通过。

截图目录沿任务可视化目录；另保存 `pptx-c1-drag-draft-production-1280.jpg`。目前浏览器已保存Redo结果，420×500，组合图片Inspector打开；无未保存草稿。

待新build：物理320、裁切dock1280/420滚动与8键盘把手、Escape/回焦、quarter90原生保存和重开。C1核心真实手势/保存/history已过，整体视觉验收仍未通过，不能以测试绿替代。

## 后续同构建 quarter90 实际验证

文档 `qb9CcKQnQ7u9S1Ax`；先依次对全部8把手实际发送ArrowRight，主应用启用，Escape取消回到真实“在画布裁切组合图片”按钮，保持零dirty。重新启动后真实拖角(768,327)→(748,347)，保留比例56%→50%，应用并保存。

`/tmp/mimir-pptx-quarter-browser-{before,saved}-20261017.pptx` 独立回读仅slide1.xml变化，child rot5400000/flipV1/未知keep属性保留；srcRect l10000→18419，其余三边相同；off2000000/600000→2067352/667352，ext1200000/800000→1065296/800000。未把90°放置后的交换框错误写回原生ext。未重复执行该样本UndoRedo（已有anisotropic37完整实证）。旧构建的dock失败仍保留，整体视觉待新构建。

## 下一批夹具准备

通过当前库UI批量上传4份合成文件，上传对话框实际显示“4个文件已上传”并各自提取145/145/145/470字：`/tmp/mimir-docx-w2-20261017/{password-readonly,no-password-readonly,unprotected}.docx`、`/tmp/mimir-xlsx-imported-shapes-20261017.xlsx`。仍留在测试库，尚未记录新文档ID、尚未新构建验收，不冒称W2/V已通过浏览器。

## 最新生产构建：crop dock 与320px复验

`/tmp/mimir-toolbar-lifecycle-web-20261017.log` exit0构建中重开已保存anisotropic37，选择产品图片并开启画布裁切。1280×800应用按钮bbox x844.77/y706.72/w123.69/h24，现处于视口；420×500同按钮x261.31/y416.36/w123.69/h24，浮动条两行文字/动作均可达，无页面横溢出。截图pptx-crop-dock-final-{1280,420}.png。取消草稿后保存仍disabled，无额外dirty/history。

420×500组合图片Inspector bbox x100/y189/w320/h284.36，固定应用bbox y437.36–461.36；内部滚动，页面宽420。截图pptx-group-inspector-final-420.png。原先336px/屏外crop dock失败作为历史保留，当前实测已修正。已保存19.549/15/5/20裁切及37%opacity重开回显正确。此次仅布局复验，原生保存/UndoRedo证据沿前节。
