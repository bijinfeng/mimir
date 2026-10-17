# DOCX 对比与拆分：浏览器验收记录

2026-10-17，root。真实浏览器1280×720、420×500；420×360仅额外量测拆分96px最小高度，不作完整工具栏视觉合格声明。原生无操作导出及最终编号修正已核对，代码/独立检查/真实浏览器本切片收口；整体任务继续 in_progress。

## 环境与来源

- 测试账号admin@example.com，localhost5180真实生产构建预览。Desktop由用户自行验收，未配置模型，本片不调用模型。
- GenOffice固定480548fd55f1be3593ee0d8e316a734751d58309，具体比较/镜像来源见docx-compare-split-next-20261017.md；WeKnora官网HTTP200及v0.8.3固定3e22822c1d2397be730c458c7539d0eb8c113a24工具门控证据沿同计划。仅能力如实披露适用，不能作Office外观模板。
- 复用墨迹普通文档Qg_gCPF9XTxC4hXS，新增合成夹具CW8_iLE7yyU8Zyez（mimir-docx-compare-live-20261017.docx），均在「编辑器工具栏验收-20261016」保留。本地comparison仅chooser读取，未上传。

## 实际步骤与结果

1. 基于当前保存正文选择本地baseline，0新增/0删除/0修改；实际手动键入“ browser draft”，画布version14且旧结果即时失效。重新比较给出1修改，明确当前First section browser draft与对比First section。未保存到库。
2. 开启上下拆分，主正文未保存draft保留；点击一次撤销，主正文和只读副本同时恢复First section、画布version15，旧比较结果再次失效。不会因Undo回同JSON而复活。唯一contenteditable=true在主正文。
3. 合成夹具有Heading1、粗体、颜色、两级原生列表以及1×2表。比较文件仅第一格“单元格  原文”变为“单元格  对比”，结果1修改，两格和行号结构清楚，第二格右侧保持。标题/列表/单元格双空格在只读DOM保留，white-space为继承pre-wrap。
4. 420×500，page scrollWidth420；Inspector320px，body319×230.36且scrollHeight646，footer319×49位于y424.36–473.36；点击差异heading自动滚动body，底部比较按钮仍可见。Escape关闭面板并回焦aria-label=对比文档。关闭重开面板需重选本地文件，原结果不持久化。
5. 420×500拆分主scrollclient169、split133.28、readonlyscrollclient91.28；420×360拆分最小96、只读scroll54、主scrollclient94，页面宽420。360高共享工具栏有裁切，因此仅记结构量测，不冒称全界面无缺陷。
6. 只操作对比/拆分后点击真实「视图→导出→导出当前DOCX副本」，下载/Users/admin/Downloads/document-copy (9).docx。与上传live夹具全部7个非目录ZIP条目精确相同，保存与撤销均disabled，库原件未修改。核对结果/tmp/docx-compare-noop-20261017.json。

## 本次发现与修复状态

- checker已修复pre-wrap只作用p导致标题/列表连续空白折叠。上文浏览器基于修复后构建已证实。
- root真实发现列表标号错误：主正文5./b)/6.，副本1./1./2.。checker正在复用live numbering defs与原生marker计算，安全文字显示；修后必须统一build+浏览器再确认，不将当前截图当最终通过。

## 构建与测试

- /tmp/mimir-toolbar-compare-final-web-20261017.log，exit0，含pre-wrap修正、不含之后编号修正。
- 独立check初次5files44/44、Office类型和目标静态通过；后继编号检查待补。
- root全Office171files/1757tests：1756pass、1fail。唯一失败docx-toolbar-render.test.tsx分类预期漏掉已验收“绘图”，保留实际失败记录；前次TIFFunknowncodec本次无失败。日志/tmp/mimir-office-full-compare-20261017.log。之后预计更新分类预期及编号专项，不能以专项绿替代本次全套绿。

## 截图

- /Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/docx-compare-accepted-short.jpg：420×500对比面板内部滚动/固定footer，背景副本旧编号不作编号验收证据。
- 最终wide/420拆分编号截图待补。


2026-10-17 后继门禁记录：root修正document-agent-core.test.ts两个XLSX目录旧预期（5工具→当前精确13工具，含create_document/aggregate/guide/formats/features/select/trace），保留禁止客户端伪造工具等其余合同。目标4/4通过；lint exit0仅既有resolveCatalog scope warning，format通过。随后完整server test exit0：默认89files715/715、本地10/10、飞牛4/4、node备份2/2，日志/tmp/mimir-server-full-toolbar-20261017.log。该基线在PDF签名server集成之前，不冒称后继签名已验收。

## 最终编号修复确认

后继统一生产构建 `/tmp/mimir-toolbar-protection-outline-signature-web-20261017.log` exit0 后，在 localhost5180 真实1280×720与420×500重新开启拆分，主文档与副本均为 **5./b)/6.**。只读标题实际 textContent 为 `标题  双空格`、computed white-space=pre-wrap，列表/单元格连续空白保留；contenteditable=true仅1个。宽屏实际在副本滚轮，副本scrollTop0→117，主文档仍0，独立滚动成立。最终截图 `docx-split-numbering-final-wide.jpg`、`docx-split-numbering-final-420.jpg` 位于同一绝对visualizations目录。编号checker最终3files43/43、类型与静态通过，见docx-compare-split-check-20261017.md。

此统一构建包含正在独立检查的保护/大纲/签名，不据此宣称后两片全部验收；全Office后继完整回归另记。


## 本批最终统一门禁补记

2026-10-17 最终Webbuild exit0：`/tmp/mimir-toolbar-browser-ui-final-web-20261017.log`；全Office177文件1844/1844 exit0：`/tmp/mimir-office-full-toolbar-ui-final-20261017.log`。此为对比/拆分、保护P0、大纲与签名UI冻结后统一运行，取代此前未完成的全套状态，不删除历史失败记录。后续保护C1生产另片实施，不提前计入本批门禁。
