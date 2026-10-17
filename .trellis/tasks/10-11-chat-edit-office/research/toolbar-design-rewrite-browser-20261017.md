# 设计、原文重写、图表配色与丰富 HTML 规划验收

2026-10-17。统一测试账号；最终生产 Web 预览 localhost:5180。Desktop 用户自验；没有模型配置，无真实模型调用。HTML 使用实际组件示例数据 harness，详见 html-rich-brief-browser-20261017.md，不冒充端到端 Agent。

## DOCX 设计

- 新测试件 `1LqHFPLBFusS-K3d`，Ion 主题、全文底色 FFF9E6、第一节方框边框。
- 主题只改 word/theme/theme1.xml；显式 Courier New/123456 保留。页面设计未触及第二节 XML。独立检查自定义关系、节修订与历史守卫详见 docx-design-check-20261017.md。
- 浏览器真实 apply/save、undo/save、redo/save；两次 undo 全部 ZIP entry 等于上传基线，两次 redo 全部 entry 等于页面设计保存版。`/tmp/design-chart-browser-native-verification.json`。
- `/tmp/docx-design-browser-{theme,page,page-undo,all-undo,all-redo}.docx` 与原 `/tmp/mimir-docx-design-fixture.docx`。
- 1280/420 实查主题和页面面板：320px 内部滚动、固定 footer，420px 时 document.scrollWidth=420；当前 Ion 和底色明确。Escape 回到主题与字体入口。复杂节/主题边界不扩大为任意 Word 设计全兼容。

## PPTX 图表颜色

- 柱图测试件 `4PeSFaeniF-Yg1mp`：主题单色→自定义系列 13579B→类别乙点色2468AC；原类别甲1A2B3C及另系列/点色保留。
- 仅 ppt/charts/chart1.xml 改变。save→undo/save→redo/save 的全部 ZIP entry 精确恢复。`/tmp/pptx-chart-colors-browser-{modified,undo,redo}.pptx`，同上 verification JSON。
- 饼图 `5JjJqday0NtjBh52` 真实选择强调色4并保存：仅 chart1.xml 改变，显式 point0=1A2B3C保留，自动 point1写入4080C0。`/tmp/pptx-chart-colors-browser-pie{.pptx,-verification.json}`。保存后派生点色成为原生显式值，面板已说明下次方案会保留。
- 首轮420发现RGB层下方“使用颜色”越过视口。共享 opt-in picker 改按340px估高选择展开方向、按实际top/bottom限制可滚动高度；独立复核149/149。最终生产构建复验：popup y180.75–441.25、使用颜色 y408.25–432.25，完整可达；Escape后父图表Inspector保留，焦点回所选系列颜色。420无整页横溢出。旧非opt-in行为不变。

## PDF 真实原文重写

- 既有四页 Rotate/CropBox 样本 `vrHDBZU1lWQLtbf_`；操作前下载基线5133 bytes。
- 首段重写为 `Original paragraph revised. Repeat target; Repeat target.`，保存12828 bytes。
- 局部模式输入 Repeat target，真实显示2处匹配及第2处预览，仅第2处替换为 Verified target，保存26254 bytes。
- 下载 `/tmp/pdf-rewrite-browser-{baseline,whole,partial,partial-undo,all-undo,all-redo}.pdf`；局部undo等于whole，双undo等于baseline，双redo等于partial，逐字节相等。`/tmp/pdf-rewrite-browser-native-verification.json`。
- PDF.js独立读取：第一处Repeat target保留；另一个独立段落、两个重复marker、其余三页文字及transform均保持。字体内部加载ID因不同文档而变化，不拿ID当真实字体变化证据；原生资源/字形验证由writer及独立checker覆盖。`/tmp/pdf-rewrite-browser-{text-verification,text-summary}.json`。
- 320px面板三模式/真实段落/匹配上下文/格式折叠/固定操作。1280及420检查无整页溢出，当前新文字可编辑；Escape关闭面板并回原文段落入口。DOM有值但截图一次未绘制textarea文字，点击输入后实际可见，最终截图重新捕获；没有更改文字或伪造值。
- 独立checker修复仅改数字时首击Apply，Office31/31、Server22/22。真原生移除/重建，不用白色遮盖；保留复杂Form/clip/AcroForm等守卫和向下扩展可能重叠的说明。

## HTML

丰富brief、alternative整样式替换、自定义RGB、redo、user_edited、真实head meta pin及取消/版本已实现并独立复核；Office65/65、Server6/6。实际组件1280/420/自定义13579B/编辑确认/Escape实测见独立browser报告；restyle/extract仅pin元数据，仍须后续CSS，不能冒称已改页面样式。

## 截图

目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/`：

- docx-design-theme-wide.png / docx-design-theme-420.png / docx-design-page-420.png
- pdf-original-rewrite-wide.png / pdf-original-rewrite-420.png
- pptx-chart-colors-wide.png / pptx-chart-colors-rgb-420.png / pptx-chart-colors-pie-saved.png
- html-rich-brief-wide.png / html-rich-brief-420.png

## 门禁与实际边界

- 受控4workers Office全量147文件1517/1517：`/tmp/mimir-design-rewrite-office-controlled-20261017.log`。此前并发build时pending-forms一个5s等待失败，隔离2/2、受控全量通过；没有放宽超时/断言。该全量在最终RGB定位修复前；修复后的5文件149/149及类型/静态由独立checker完成，未重复全量凑数。
- 最终Web build exit0：`/tmp/mimir-design-rewrite-web-rgb-20261017.log`；既有chunk/dynamic-import警告保留。shared tsc exit0；Office/server类型及目标静态见各checker，renderer tsc已过。
- 全仓pnpm check仍有既有480项技能脚本lint阻断，不声称全仓绿色。下一XLSX切片已开始后，上述147/1517只证明本批冻结状态，不覆盖后续修改。
- 未提交/暂存/归档/删除测试件。整体继续in_progress，剩余工具见现行矩阵。
