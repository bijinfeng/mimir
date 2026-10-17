# PDF 原文段落整体移动实施 — 2026-10-17

## 固定参考与实际适用

- 本次重新核对GenOffice checkout `/tmp/mimir-genoffice-html-git` HEAD为`480548fd55f1be3593ee0d8e316a734751d58309`。`apps/pdf/src/renderer/text-block.ts:170–331`先按基线/列间距分行、再按leading/字高/重叠聚类并拆短行结尾。Mimir私有纯helper保留这些保守判断，并返回原PDF.js完整items供宿主独立核验；页面显示旋转只用于投影/选中，不改变原空间段落归属。
- `renderer/ai/tools.ts:2110–2140,2291–2328`用唯一片段定位整段、将显示空间dx/dy经`viewToPdf`两点之差换算。`main/text-edit.ts:2271–2284`的pure move要求whole match，逐对象Transform平移、保留所有字形，不重建字体。本片沿此语义，私有writer以GetMatrix/SetMatrix仅改变e/f，并增加字节hash/完整成员和双引擎读回守卫；不修改vendor。
- WeKnora站点HTTP200既有本轮快照`/tmp/mimir-pdf-export-weknora-site.html`（04:53），源码v0.8.3 commit`3e22822c1d2397be730c458c7539d0eb8c113a24`证据`/tmp/mimir-group-flip-weknora-definitions.go`本次重新读取：14–22为知识检索，35–49与61–75为基于真实capability注册sandbox/wiki工具。它适用于保持工具目录与实际宿主能力一致；没有PDF文字对象/Office工具栏模型，因此不以其Markdown编辑器作为主参考。

## 接缝与所有权

实现者负责shared block schemas、`pdf-text-blocks`纯映射、`pdf-block-writer`与server `pdf-text-blocks`服务、pdf-content-agent执行器、host/catalog/route及renderer API/OfficeSourceEditor接缝和专项测试。root负责PdfEditor与手动Inspector；独立checker负责两份新Editor/Panel UI测试。未触碰vendor、其他格式或root UI文件。

`PdfHostBlocks({bytes,expectedVersion,operation,signal?})`，operation为read/inspect/move，read与inspect保持版本、move仅+1；target冻结sha/page/block及全部native objectIndex/text/bounds/matrix。Agent新增list_text_blocks和唯一paragraph_text的move_text_block；手动使用已inspect的精确target，重复原文可安全选择其中一段。UI与Agent共用同一executor/history。

## 保真与拒绝边界

只移动完整顶层文字对象矩阵，保留a/b/c/d，统一加显示dx/dy逆变换所得偏移到e/f；不生成字形、替代字体、覆盖矩形或新文字对象。写前重新聚类和核验完整成员，写后逐页原生对象/资源与独立PDF.js位置读回。原AcroForm/加密/未知Catalog拒绝不放宽；Form内、跨段native对象、重叠文本及页面显式clip内容流不能证明整段归属，明确拒绝。段落重写/自动换行、部分/重复原文替换仍是下一边界。

## 验证与交接

- 宿主7项：四Rotate0/90/180/270、非零CropBox，每段至少6native文字对象同偏移，普通/粗体和嵌入LiberationSans子集+café字体program hash保持、原图片hash/路径/另一段重复文字/第二页保持，重开两次移动；probe完整性、伪造对象/矩阵、部分/重复成员、旧hash/取消、clip/AcroForm/未知Catalog拒绝。
- Office纯映射/Agent4项：真实分栏、段末短行、四旋转指针选择、Agent唯一片段与手动精确target，错误版本及迟到成功取消。与既有Agent内容/句柄专项合跑4文件12/12通过。
- 鉴权HTTP/catalog3项，与既有文字宿主合跑4文件17/17通过：401/404/非法版本/伪造成员/旧hash、一次版本、服务不自动保存原件，真实普通文件PUT保存两次/undo原始bytes保存/redo移动bytes保存逐byte取回。
- 独立checker报告`pdf-text-blocks-ui-check-20261017.md`：Editor7+Panel7共14项真实UI/宿主/history及关闭/换页/换源取消通过，未改生产代码。
- Office/Server/Shared/Renderer tsc首次综合exit0；最后全文30000对象预算与HTTP版本上限改动后Server tsc再次exit0。15个本片代码/测试/接缝文件的目标oxlint无告警、oxfmt --check、git diff --check最终exit0；仅修正route及专项test格式。Server17/17日志`/tmp/mimir-pdf-block-server-final.log`，Office12/12日志`/tmp/mimir-pdf-block-office-final.log`；按root要求不重跑已验范围。本代理不构建、不提交、不归档，统一build/test由root执行。
- 浏览器原生fixture `/tmp/mimir-pdf-block-native-fixture.pdf`（2713bytes）：3页Rotate0/90/270，CropBox20,40,450,620。First paragraph三行normal+bluebold共6对象，另有独立标题/第二段/图片/矩形。已交root上传、宽/420视觉与HTTP原件验收。
- root随后使用独立4页fixture在文档`vrHDBZU1lWQLtbf_`完成宽/420移动(24,18)、保存/撤销/重做精确字节闭环，并在Rotate90画布点击一处重复文字后按显示(-12,9)移动且另一处不动。独立字体字典语义/PNG流hash保持，非目标几何浮点差<0.00003pt；完整证据在`toolbar-lists-native-blocks-browser-20261017.md`。未配置模型，未把手动宿主/组件验收冒充真实模型调用。

## 冻结交接

本片实现和专项检查冻结。root继续统一门禁；原文段落重写/重排、Form内部或跨段对象、重叠文字、显式clip、AcroForm和未知Catalog均仍有上述边界。本片新增HTTP路由与工具目录，运行旧服务进程时需先重启服务加载。
