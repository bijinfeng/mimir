# XLSX 多级排序生产浏览器验收

文档 `uzZm-Fpo5x95ypR0`，夹具 `/tmp/mimir-xlsx-multilevel-sort-20261017.xlsx`。

## 实际操作

- 1280×800对A1:H8建立A/B/C三层升序，实际原行序为 **5→6→4→2→8→3→7**；相同键5先于6、空值最后。
- 420×500添加至八级后添加禁用；优先级上下移动、删除、重复列选项禁用、嵌套Escape均实查。面板内部body client134 / scroll1525，唯一primary可见，页面scrollWidth420。
- 保存后Undo+保存，整文件等于baseline；Redo+保存，整文件等于applied。再次建立相同三层规则应用于已排序数据无dirty、保存仍禁用；下一次Undo恢复原始顺序，证明无额外历史。最后保存已恢复原件。

## 原生证据

`/tmp/mimir-xlsx-sort-browser-{baseline,applied,undo,redo,restored}-20261017.xlsx`。8个ZIP非目录部件，应用仅改sheet1及workbook calcPr；不相交J1:K2条件格式保留。baseline/undo/restored整件SHA256 `d2bb10318699b3010d59362cdb8979a71c9c5c2fc1e4dec04ad2da0593e56e97`（3203B）；applied/redo整件SHA256 `4f3a50a1d4ec49cdcfc7a7ac3d512226286518fbd4d30930bf504fd6751c0582`（3430B）。

## 待新构建烟测

旧构建primary出现“应用排序应用排序”；root已移除重复children，14/14及types/static通过。root在 `/tmp/mimir-toolbar-inspector-encryption-web-20261017.log` 对应5180新构建重新打开原件、选A1:H8→数据→范围数据操作，1280与420均确认唯一primary文本恰为“应用排序”。截图 `xlsx-sort-label-final-{1280,420}-20261017.png` 位于本会话绝对visualizations目录。420 Escape关闭并回焦折叠“排序与筛选”，保存/Undo始终禁用；未重新改动已恢复原件。去重烟测已通过，不再待新构建。

## 环境与证明范围

2026-10-17 root，统一账号 admin@example.com。浏览器为生产预览5180，1280×800及420×500；本轮沿用包含T/P/S的已服务构建，尚未包含后续E1U、管理短高、PDF取消修复及排序按钮去重的新构建，不将其混称最新源验收。无真实模型执行、无Desktop验收、未删除夹具。依据固定GenOffice 480548fd55f1be3593ee0d8e316a734751d58309；WeKnora沿已有v0.8.3 / 3e22822c1d2397be730c458c7539d0eb8c113a24缓存证据，适用于知识库/Agent门控，非Office工具栏语义依据；本次不是新增竞品调研。


### 最终截图文件真实性复核

420截图补证：旧同名图实查是内容缩小的缩略图，现用captureBeyondViewport=false重取并实际查看正常420×500图。只选择A1:H8并打开排序，固定唯一“应用排序”可见；未点击应用、未保存，Escape回焦排序与筛选，保存与history仍禁用。
