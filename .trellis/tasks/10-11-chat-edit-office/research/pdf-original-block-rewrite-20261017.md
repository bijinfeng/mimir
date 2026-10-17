# PDF 原文段落改写与部分/重复匹配替换（2026-10-17）

## 范围与参考版本

本片接续已验原生整段移动，独占原文block writer/service/shared/content-agent和手动段落面板；根会话统一构建、浏览器与整任务收口。无vendor编辑，不放宽Form/clip/AcroForm/Catalog安全边界，不自动保存，不提交/暂存/归档。

- GenOffice固定 `480548fd55f1be3593ee0d8e316a734751d58309`，本轮实际核验 `/tmp/mimir-genoffice-html-git` HEAD。`apps/pdf/src/renderer/ai/tools.ts:432–476` 的 `edit_block` 定义要求唯一paragraph_text、整段替换按原宽换行、增长向下、空新文真实删除、其他内容不移动，并明确部分替换用edit_text且不reflow。`:2110–2230` 的定位/执行实现核对唯一段、baseline、leading和align。实际writer复用固定vendor `apps/pdf/src/main/text-edit.ts` 的applyTextEdits，而非Electron IPC。
- WeKnora官网 https://weknora.weixin.qq.com/ 与公开源码 https://github.com/Tencent/WeKnora 本轮HTTP200复核；公开版本v0.8.3、commit `3e22822c1d2397be730c458c7539d0eb8c113a24`。下载留 `/tmp/mimir-pdf-rewrite-weknora-site.html`、`/tmp/mimir-pdf-rewrite-weknora-definitions.go`。`internal/agent/tools/definitions.go:14–22`是知识检索面，`:35–49`与`:61–75`按实际sandbox能力注册工具。适用于Mimir宿主授权和如实展示能力；没有原生PDF段落writer，不能作为Office文字编辑工具栏模型。
- 产品编辑行为取固定GenOffice；右320px Inspector、默认折叠格式、固定主操作沿既有Office/Google Docs任务分组与Mimir/Obsidian页面布局合同。不使用WeKnora Markdown编辑器作为Office工具栏依据。

## 实现与接缝

`PdfTextBlockOperation`新增strict rewrite，沿完整当前sha/page/block/all-members target；可选replace表示oldText+1起occurrence。Agent新增edit_block唯一paragraph_text定位；edit_text在page阅读顺序计数重复片段，再交当前段local次序。manual可传当前完整target；Agent不得绕过定位。原apply-text兼容入口和markup唯一完整项规则保持。

`pdf-block-rewrite.ts`是原生适配器：先完整目标核验；局部匹配才私有派生触及容器，保留未触及对象位置、不重排整段；整段由原文logical换行与实际baseline/字号/leading开始真实写入，读取实际保存字体的char advance/glyph width，再从原字节重做换行与对齐，最多4遍收敛。无浏览器CSS字体猜测。空文移除原生文字，不增加path/白框。可复用的未改完整前后run沿上游keep-plan保持；显式restyle或跨行重排可重建受影响run，不能声称所有目标字体流原样保持。

两次重要实测修正：

1. 不能把原生对象text直接无换行连接作为oldText；这使上游wsEditClamp把逻辑行缝误判为用户改空白，损失本可复用的粗体run。传原段落logical文本后，原生bold program保持。
2. PDFium文字页关联会在中/右对齐后的远处原对象提取结果末尾补gap；同一字体、字形、矩阵、bbox未变。对象签名仅对提取尾空白trimEnd，仍比较内部native glyphs、样式、resource hash、clip、矩阵/bbox与children；另由PDF.js独立验证非目标原文/transform。临时诊断已移除，失败不发布字节。

单页200000原生字符、全文30000对象/1000页预算；既有50MiB、段500项/10000字符、安全Catalog与活动结构守卫保持。缺字/不可核验字体/不收敛/非法次序/旧target均拒绝且原输入不变。

## 手动界面

`PdfTextBlockPanel`保留整体移动，新增整段改写/局部替换。快照`canRewrite/rewriteReason/format`使原生倾斜等不可重排段有明确原因；移动可用性独立保留。字号与行距为原生参考值，对齐为原行边缘推导；原字体族/混合颜色未完全建模时默认“保留”，不造假当前黑色或Arial。

整段文字初值真实原文；空/纯空白显示明确“删除整段”动作与可撤销提示。局部替换显示匹配总数、当前第几处、原文上下文mark；空replacement只删除该匹配。格式默认折叠，改参数才发送；粗/斜体为保留/应用/取消三态，保留省略、取消发送false；局部替换不发送整段align。整体增长/局部长文都提示可能重叠。模式/源/选择/关闭取消、自己的busy不取消自身；冻结版本，失败保留草稿。PdfEditor仅改入口能力名为原文段落编辑，其余通过既有通用onApply接入同一工作字节/history/save。

## 具体验证

- Server首轮 `pdf-block-rewrite`+`pdf-text-block-host`：16/16（重叠原生移动回归）。后续 `pdf-block-rewrite`+rewrite-route+block-route+catalog：4文件14/14；真实四Rotate/非零CropBox、实际Courier14pt/#2468AC/Italic左右中对齐、重复局部第二处、粗体program/非目标path/第二页保留、真实整段删除、旧SHA/部分成员/非法次序/缺字/取消拒绝。
- CJK“收入稳定增长本期工作”逐字由独立PDF.js raster统计可见dark pixels，禁用system fonts，不以extract成功代替可见。
- 独立Poppler：真实原文改写文件 `/tmp/mimir-pdf-rewrite-cjk.pdf`，原件 `/tmp/mimir-pdf-rewrite-cjk-original.pdf`；`pdftoppm -png -r 120 -singlefile`生成 `/tmp/mimir-pdf-rewrite-cjk-poppler.png`，本worker实际目视中文完整可见、按原宽末字换行、非目标“NON TARGET KEPT”保留。不冒充浏览器/模型验收。
- HTTP使用统一admin测试账号：401、strict invalid参数、version10→11；宿主操作不写原件，随后普通PUT两次/undo保存/redo保存，GET字节精确相等。
- Office面板+真实Editor+Agent+聚类：5文件29/29；实际组件partial第二处和whole改写各自save/undo/save/redo/save精确，non-target第二页及bold run保留；原移动18回归集合覆盖实际own-busy、页面/关闭/源/回焦。面板新模式cover真实初值/折叠格式/空删除/匹配预览/失败重试/过期版本/模式源取消。
- Office/Server tsc通过；目标lint/format/styles/diff及最后新入口名称回归结果冻结后补报。根会话负责独立checker、统一生产build、宽/420浏览器和原件历史；无真实模型配置不冒报模型验收。Desktop仍由用户自验。

## 明确边界

原生倾斜/旋转文字矩阵不重排；页面Rotate本身四方向支持。Form/clip/AcroForm/未知Catalog保持拒绝。整段增长不推其他内容；部分替换不自动换行，长替换可重叠。复杂目标run在重排时不能保证原对象流不变，非目标资源和内容必须独立保持。unicode折叠极少差异可能使浏览器计数与服务器原生matcher不同，服务器拒绝优先。真实模型、Desktop和全工具完整性不由本片专项冒认完成。

## 取消粗斜体补齐与正式门禁

根会话要求同时补真实false语义。固定vendor确实只正向应用，故在私有适配中读取原生font name/family/weight/italicAngle，识别Helvetica/Arial、Times、Courier族普通字面；保留另一项真实状态，若混合且未明确指定则拒绝并提示。未知族须显式选字体，不默换默认Arial。合成粗体先在私有副本对已验证目标清fill+stroke，再交固定writer；全流程结束核验实际name/weight/angle/render mode，失败无字节。UI三态不再把false当保留。测试用真实HelveticaBoldOblique，取消bold后weight<600而italicAngle仍非0，再局部取消italic后angle0且name无bold/italic；实际合成bold mode2→取消mode0，非目标保持。系统prompt已同步新段落/partial/occurrence能力，不保留旧唯一完整项说法。

正式冻结门禁：Server5文件22/22（`/tmp/mimir-pdf-rewrite-server-final.log`）；Office5文件29/29（`/tmp/mimir-pdf-rewrite-panel-style-clear.log`，含新入口名称和false三态）；Office/Server tsc exit0（`/tmp/mimir-pdf-rewrite-{office,server}-types.log`）；目标oxlint零warning/error（`/tmp/mimir-pdf-rewrite-lint.log`）、17目标文件oxfmt --check、lint:styles、git diff --check通过。完整原生移动回归包含在Server22及Office29内，非简单相加后冒认新测试数。未执行build/上传/浏览器/提交/暂存/归档，交根会话与独立checker继续。
