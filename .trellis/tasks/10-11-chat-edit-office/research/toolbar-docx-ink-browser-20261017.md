# DOCX 墨迹真实浏览器验收（2026-10-17）

本切片已收口，不能作为整体任务完成声明。浏览器 localhost:5180、后端3000，统一测试账号；Desktop用户自验，无模型调用。

## 实际文件与原生结果

知识库「编辑器工具栏验收-20261016」保留三个测试件：普通两节文档 `Qg_gCPF9XTxC4hXS`、已有墨迹 `lSXLxbEnwTkbd0dH`、表格墨迹 `VLEQvuJkJB7V6oxq`。不删除。

- 普通文档100%真实Canvas钢笔，C00000、4px，第一节block0，原生PNG172×22、1394非透明像素、alpha0–255。点[62.4,114]→[102.4,114]→[142.4,119]，column/paragraph锚定。
- 切150%并滚动至第二节，真实荧光笔FFE066、14px。保存block1点[21.9,10.1]→[55.2,10.1]→[88.5,10.1]→[121.9,10.1]，PNG232×32、6234非透明像素、alpha0–115。缩放并未写大原生笔宽。
- 保存→撤销→保存→重做→保存，撤销文件与仅钢笔文件所有非目录ZIP条目精确相等；重做与两笔文件同样精确。两段原文均保持。
- 重开恢复两条可编辑vector，点选第一笔后删除选中并保存，只剩荧光笔；撤销恢复后逐笔擦除第一笔并保存，结果与删除选中所有非目录ZIP条目精确相等。再次撤销并保存恢复两笔。
- 表格墨迹显示「表格内复杂墨迹暂未显示；原件完整保留，绘图已禁用」，钢笔/荧光/选择/橡皮及清除禁用。视图导出当前副本 `/Users/admin/Downloads/document-copy (8).docx` 与原fixture所有非目录ZIP条目精确相等。
- 原有/表格fixture使用1×1透明PNG加向量payload，仅证明原生结构与保留，不能当Word原件像素显示证据。真实绘制样本已使用浏览器Canvas生成有效PNG。

实证文件：`/tmp/docx-ink-browser-pen-20261017.docx`、`highlight`、`undo`、`redo`、`delete`、`erase`同前缀文件；核对脚本 `/tmp/mimir-docx-ink-browser-verify.py`；结果 `/tmp/docx-ink-browser-exact-verification-20261017.json`、`/tmp/docx-ink-browser-delete-erase-verification-20261017.json`。精确比较不把ZIP容器时间戳当内容变化。

## 最终构建及界面

`pnpm --filter @mimir/web build` exit0，日志 `/tmp/mimir-docx-ink-final-web-20261017.log`。包含首笔 `focus({preventScroll:true})` 与宽度单位flex修复。

- 新构建重开后首次落笔一次成功，path数量2→3，外层scrollTop保持0；撤销还原。原来的focus引发24px滚动/取消首笔已在真实浏览器复验消失。
- 1280×720设置面板宽320px，两组两列、无水平滚动、底部操作固定。截图 `docx-ink-final-wide.png`。
- 实际DOM420×720，document.scrollWidth420，面板clientWidth/scrollWidth319，两宽度字段clientWidth/scrollWidth142；无字段下溢。截图 `docx-ink-final-420.jpg`。
- Escape从宽度输入关闭Inspector并回到可见「墨迹」折叠入口。
- 折叠菜单打开设置后未自动关闭、表格原件计数仍称「可编辑」两处已由checker窄修。最终统一构建 `/tmp/mimir-toolbar-ink-snapshot-batch-web-20261017.log` exit0；420重新加载后真实「绘图→墨迹→笔迹设置」确认菜单关闭、焦点在Inspector、整页scrollWidth420，表格计数为「1笔原有墨迹」，Escape回「墨迹」入口。
- 最终有效420截图 `docx-ink-accepted-420.jpg`、`docx-ink-table-final-420.jpg`；两次都通过真实折叠菜单打开，没有先点击输入框掩盖遮挡。

截图目录：`/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/`。临时viewport调整后首次截图出现背板尺寸失配，420下reload后恢复正确420×720；失配/空白图片不作为验收证据。

## 门禁与边界

独立checker主切片6文件93/93；首次focus补修后真实Editor13/13，最后菜单/计数补修后真实Editor15/15、Office tsc exit0、目标lint/format/diff绿，详细见 `docx-ink-check-20261017.md`。本报告不把专项通过替代全Office：前次全套160文件1657通过/1失败的TIFF未知编码已另片目标修复，尚未重跑全套。

未知/opaque/共享或复杂墨迹不开放写入，表格复杂墨迹尚不显示；普通未知墨迹仅原PNG只读预览。没有声明任意Word墨迹兼容。DOCX拆分/可编辑大纲/保护对比以及其他格式缺口仍按现行矩阵推进，任务in_progress。全仓480既有技能lint阻断事实不变，无暂存/提交/归档。
