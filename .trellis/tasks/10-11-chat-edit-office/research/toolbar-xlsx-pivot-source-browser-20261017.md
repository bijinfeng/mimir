# XLSX 透视来源表选择：浏览器验收

2026-10-17，root。实施及独立检查冻结，最终5180构建已完成下述浏览器验收。保留修前发现。

账号admin@example.com，仅代码与浏览器；Desktop用户自验，无模型。固定参考、版本与WeKnora证据沿xlsx-pivot-next-plan-20261017.md。跨表新建是Mimir已有原生能力的手动补全，不称GenOffice普通手动新建已证独有能力；已有透视布局编辑仍另片。

通过真实上传对话框上传 `/tmp/mimir-xlsx-crosssheet-pivot-20261017.xlsx` 至「编辑器工具栏验收-20261016」，文档ID `6Tv8SvZF5NSJsj3Z`。初始activeTab汇总，来源sheet-1“源 数据'2026 中文季度销售明细与部门汇总”，A1:F6，总金额150，输出汇总/sheet-2 A1，另有未操作第三表、隐藏来源及受保护来源。

待验：真实来源Select/当前输出回显/无dirty字段重置、A1:F6→跨表A1与同表重叠拒绝、保存/重开/全ZIP UndoRedo、源/第三表原生保留、修改源后刷新、1280/420×500内部滚动和固定footer、Select Escape两层与回焦。


## 开发预验（非最终构建）

localhost5173：当前汇总→插入对象→透视，来源真实选择“源 数据'2026 中文季度销售明细与部门汇总”，A1:F6→汇总A1，字段从所选来源推导、输出摘要A1:B5，无dirty；隐藏来源标隐藏、受保护来源disabled。1280→420×500草稿在此次实际切换保留，未创建/未保存。

短高发现：Inspector y174–473.36，footer y414.75–491.39、create y455.39–479.39，按钮底部约6px被裁掉。body强制24px及上部控件高度导致fieldset溢出。已交checker本轮UI批次修，不能标420已通过。before图 xlsx-pivot-source-before-footer-420.jpg（统一visualizations目录）。计算样式主按钮白字/green正确，截图初始过渡态不推断文字颜色缺陷。


## 最终构建验收

Web `/tmp/mimir-toolbar-c1-pivot-source-web-20261017.log` exit0，localhost5180。

- 真实来源Select提供长中文来源、当前汇总、第三表、标注隐藏来源与disabled受保护来源。选择源表、A1:F6、汇总A1、名称“跨表汇总验收”，行字段准确为区域，输出摘要汇总A1:B5/5行×2列，创建前保存仍禁用。
- 1280→420×500同次切换，名称/来源/范围/目标均保留。实际320px Inspector rect x100/y174/width320/bottom473.36；创建按钮x121/y429.36/bottom453.36完全在面板内，page scrollWidth420。body内部滚动，固定footer不裁切。没有再改共享Ribbon。
- 实际点击创建，网格华东30/华南70/华北50/总计150，成功状态与草稿保留；真实保存到库，再Undo保存、Redo保存。证据 `/tmp/mimir-xlsx-crosssheet-pivot-browser-{created,undo,redo}-20261017.xlsx`。
- ZIP独立比对：Undo所有非目录条目与上传原件完全一致；Redo所有条目与created完全一致。创建仅新增原生透视/缓存/关系并改目标sheet2、workbook与content types；source sheet1、第三表、隐藏与受保护表、customXml/其余原生条目全部精确。
- cache worksheetSource精确为长中文源名与A1:F6；pivot位于目标sheet2，location A1:B5；records金额10/20/30/40/50，总计150。
- reload后原生透视可选择，源范围/区域字段回显准确，已有布局明确只读；实际“刷新当前表全部透视表”成功并保存，结果仍150。源金额10→110再刷新250由真实完整宿主专项11/11证明；本浏览器没有执行该源单元格修改，不冒称实机250。
- 最终420下Select Escape第一次只关选项且Inspector保留，第二次关面板并回焦“图表、形状与结构化表”。临时viewport已恢复。
- 证据目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51`：xlsx-pivot-source-confirmed-wide.jpg、xlsx-pivot-source-confirmed-420.jpg、xlsx-pivot-source-saved-wide.jpg、xlsx-pivot-source-saved-420.jpg。前两为创建草稿，后两为已保存原生布局回显。

独立Office31/31、Server真实宿主11/11、两包类型与目标静态通过，见xlsx-pivot-source-check报告。当前已有布局编辑、切片器/时间线/复杂公式等仍未齐；跨表新建不等于全部透视完备。无模型/Desktop自验边界不变，不删测试件、不暂存提交归档，整体in_progress。


最终统一门禁补记（2026-10-17）：全Office **178文件1869/1869，exit0**，日志 `/tmp/mimir-office-full-c1-pivot-source-final-20261017.log`（143.52s）。先前1868/1869失败保留为历史；PPTX仅测试同步修复，生产未改。最终Web构建 `/tmp/mimir-toolbar-c1-pivot-source-web-20261017.log` exit0；此后只改PPTX测试/spec/报告，无需重建生产。Server沿前次最终default737/local10/fnos4/backup2全绿，本片生产未改，新增跨表宿主专项11/11。无模型/Desktop自验、全仓480技能lint基线与整体in_progress边界不变；本轮未暂存、提交、归档或删除测试文件。
