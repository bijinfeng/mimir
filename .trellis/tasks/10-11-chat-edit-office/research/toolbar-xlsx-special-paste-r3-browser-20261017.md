# XLSX R3 生产浏览器与原生保存验收

2026-10-17，root，账号admin@example.com。生产预览5180，构建 `/tmp/mimir-toolbar-r3-bullets-web-20261017.log` exit0，1751输入起止SHA零变化（同前缀build-before/after JSON）。本构建包含R3、批量图片符号、媒体参数，不包含之后的CDATA显示补修或逐页生成WIP。

## 已完成实测

正常上传至验收知识库KY635Y，文档 `S7JaVgn9K4g2AqfB`，固定基线 `/tmp/mimir-xlsx-special-paste-r3-browser-baseline-20261017.xlsx` SHA256 `70bc9cd759cfb02b0937ab7c6bc88b604cb88f3adf4667e0c1e7ab1111fffbea`。checker后续重生fixture不覆盖此副本。

1280×800，数据!A1:C3复制→目标!E5；六模式分别真实应用、保存、下载、一步Undo并保存恢复基线，再重复制。全部、仅值、公式与值、仅格式、仅列宽、除边框外全部的已保存文件均即时固定。全部模式另Redo保存下载，整件精确等于首次全部结果；Undo整件精确等于原始基线。

420×500，数据!A1:C3→目标!E5:J10四块整数平铺，保存下载；一步Undo保存整件等于基线，Redo保存整件等于第一次平铺。最后再次Undo保存恢复原件。非整数倍E5:I7真实拒绝“目标行列数须分别为源范围的整数倍”，无dirty/额外history。真实CUT源下，五种特殊模式禁用，并明确“剪切将在全部粘贴成功后移动原生范围；选择性粘贴请先复制”；未执行新的CUT移动，既有普通MOVE证据见R2b。

## 原生逐模式校验

下载共同前缀 `/tmp/mimir-xlsx-special-paste-r3-browser-`、后缀 `-20261017.xlsx`。逐项结果和SHA存于 `/tmp/mimir-xlsx-special-paste-r3-browser-native-20261017.json`。

- 所有模式来源sheet1、opaque及非目标原有ZIP部件精确；M20 untouched不变。只改变目标sheet2与workbook计算标记，除边框模式另append必要styles定义。
- 全部复制原生公式E6*2、合并E5:F5、链接和CF/DV；值类型boolean/error/shared/inline以及CDATA原tokens保持。
- 仅值F6=24.5且无formula，boolean/error类型保留；原formula目标E7按原语义变plain；F7原共享rich保留。公式与值F6=E6*2且无旧缓存，常量保留、rich constants按模式变plain。
- 仅值/公式/列宽保留目标merge/CF原生片段；仅值/公式/格式/列宽保留DV与hyperlink精确。仅格式保留目标正文99及原formula，只换样式并迁CF。
- 仅列宽sheetData精确；E宽20、G宽30，F隐藏属性保持。除边框模式目标有效borderId2保留，同时源fillId2生效，rich内容保持。
- 平铺四merge为E5:F5/H5:I5/E8:F8/H8:I8，CF保持同来源一个组合规则，I9公式H9*2。对应统计域另有独立3项aboveAverage测试，不用普通expression浏览器样本代替。

## 实际发现与待最终补证

旧构建源A3/B3显示CDATA标记而非字符内容；仅值落至原formula目标时变plain所以该格显示正常，不能据此掩盖源显示问题。最小读取修复与独立94/94已冻结，见 `xlsx-special-paste-r3-cdata-display-fix-20261017.md` / `…-independent-check-20261017.md`。最终新构建仍须补A3/B3显示/复制/重开及1280/420真实截图，不重复已冻结writer全部六模式写操作。

当前库已保存恢复基线、CUT草稿取消，最终reload与新build烟测待补。无真实模型或Desktop声明。参考固定GenOffice与WeKnora缓存证据沿R3实施/独立报告，不声称本轮新远程调研。总任务in_progress。


## 最新生产构建显示与最终交互复验

root最新Webbuild `/tmp/mimir-all-tools-final-web-20261017.log` exit0，含CDATA及PPTX图片预览修复（此时尚未含之后DOCX导出/逐页回焦修复）。真实数据表A3共享字符串与B3 inline都显示 ` rich & text&literal;`，没有CDATA标记；选择A3并实际“复制这个格的文字”所得浏览器clipboard原文准确，reload仍准确。只读/选择/复制不产生dirty/history。六种模式全部可选，按用户前已完成原生writer验收，本次未重复写入六遍。

1280×800与420×500截图已实际查看：`xlsx-special-paste-r3-final-1280-20261017.png` 与 `xlsx-special-paste-r3-final-420-20261017.png`。420侧栏宽320、top178/bottom430.08；primary粘贴top394.08/bottom418.08；内部内容client155/scroll639。下拉Escape只关下拉，随后Inspector Escape关闭并回焦当前紧凑“剪贴板”触发器。最终reload清除copy捕获，零dirty/history。图在既定visualizations目录。
