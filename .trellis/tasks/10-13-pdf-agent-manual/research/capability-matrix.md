# PDF 固定版 GenOffice 能力与验收矩阵

核对日期：2026-10-16。固定上游：`genspark-ai/genoffice@480548fd55f1be3593ee0d8e316a734751d58309`。来源链接逐行指向该 commit。WeKnora `v0.8.3` 的站点、源码及适用性证据见 `.trellis/tasks/10-16-genoffice-editor-capability-audit/research/toolbar-assessment.md`；PDF 编辑的主要参考是 GenOffice。

状态说明：`现有`/`已接` 表示已有实际入口与执行器，参数限制及验证范围按行记录；`待接` 尚未注册 PDF Agent 工具。`pdf-pages.ts`的离线回退仍整体重建；已连接local宿主时当前手动页面布局走保留原结构的工作副本。未知Catalog/签名/活动动作继续拒绝。下表逐项列能力与缺口，不能将工具目录当成功能验收。

截至 2026-10-16，Agent 除原有文字读取、插入生命周期及三种页面操作外，新增 `edit_text`、`markup_text`、`read_annotations`、`add_note`、`reply_note`、`edit_note`、`delete_note`、`delete_markup`。工具栏与 Agent 共用 `PdfAgentHandle` / `executePdfContentTool`，经鉴权 HTTP 调用现有 PDFium 原文宿主和新增 pdf-lib 批注宿主。替换支持 `new_text=""` 删除完整原文，以及新文字的字号、颜色、Arial/Times/Courier、粗斜体；仍只接受一个完整唯一的 pdf.js 文字项与 PDFium 对象，部分、重复、重叠原文及全量标注明确拒绝，标注自定义颜色尚未接。批注使用 `/NM` UUID，旧批注回退到对象引用 ID；回复以 `/IRT` 引用根便笺。便笺可按显示页面左上角 pt 坐标或唯一完整原文锚定，支持内容、作者和父 ID 读取、回复、修改和整线程删除；可按 ID/类型删除文字标注。每次写入核对 SHA-256、画布版本和取消状态，并以 pdf-lib 与 pdf.js 读回后才发布工作字节。页面结构/待保存插字改动需先保存，避免字节与显示页号错位；新批注仍走既有保存基线。未知 Catalog 安全拒绝保留。

手动入口为「编辑 → 定位原文」中的替换、删除、高亮/下划线/删除线，和「编辑 → 便笺与标注」面板中的添加、选择、读取、回复、修改、删除。便笺输入保留换行。`insert_text` 仍只支持页号、文字、页面坐标、字号和颜色；保存或页结构操作后临时插字 ID 失效。原文任意范围与重复匹配、自由笔手势、涂黑、签名及仍标待接的目录项尚未完成；图片和表单新增切片及剩余验收见末节。共享组件/HTTP 不等于浏览器、桌面本地、桌面远端及真实模型均已实机验收。

验证证据：此前 Office 定向 6 个测试文件 73 项、server PDF 宿主与路由 2 文件 7 项通过；本次额外 Office Agent/组件 2 文件 10 项和 server PDF 目录/宿主 2 文件 7 项通过，Office/server 类型检查通过。2026-10-16 的替换回归中，Office PDF 聚焦 3 文件 44 项、server PDF 宿主与路由 2 文件 11 项通过，Office/server/renderer 类型检查及目标 Oxlint、Ant Design lint 通过。真实 PDFium 批量插入→改文/移动→删除的重放结果由 pdf.js 独立读回；组件回归覆盖手动改文→Agent 列出/移动→保存→pdf.js 读回，也覆盖保存 B→再插入 C→删除 C 回到干净的 B、旧插字保存进行中新增插字后删除，以及只保存页面改动 B 时并发插字再删除，后两者均回到实际写出的 B 字节。替换组件回归覆盖点选→对象核验→PDFium 写入→即时画布字节→保存→pdf.js 重开，并覆盖宿主失败、过期字节、部分文字和重叠项拒绝。保存期间修改正被写入的旧插字会明确拒绝；页面保存的异步序列化期间画布版本变化则拒绝旧保存。此前 `pnpm deploy --prod` 到独立临时目录后两份 WASM 都存在，且部署产物执行 PDFium 插字输出可由 pdf-lib 重开。本轮标注宿主 7 项和 PDF 内容组件 8 项通过；高亮组件回归覆盖写入失败仍干净、即时叠层、保存后 pdf.js 注释读回，宿主还验证三种注释和过期字节拒绝。中文正文字体、扫描件 OCR、图片、表单、签名以及复杂 Catalog 尚未达到本任务验收线。


本次原文/批注切片验证：Office PDF 定向 6 文件 **89 项**、server PDF 定向 4 文件 **20 项**通过；Office/server 类型检查通过，目标 Oxlint、Oxfmt、Ant Design lint 与 `git diff --check` 通过。新增测试覆盖真实 Agent `edit_text` 替换/删除和三型 `markup_text`、原文锚定便笺、中文回复线程、ID/作者/IRT 保留、精确删除、两次保存、实际工具栏添加/回复/修改/删除便笺与删除标注、取消/版本冲突不发布旧字节。浏览器测试由主会话进行，后续实机证据单独记录；未将共享组件、单元测试或未配置模型写成三端/模型验收。


浏览器首轮便笺证据（主会话，2026-10-16）：文档 `9HNfJZ_aYLT4nddM`、知识库 `KY635Y`，测试文件 `/tmp/mimir-pdf-toolbar-fixture.pdf`。工具栏添加中文根便笺与回复后保存，下载 `/Users/admin/Downloads/mimir-pdf-toolbar-fixture.pdf`，独立 pdf.js 读出 `7R Text` 中文根、`8R Text` 中文回复且 `inReplyTo=7R`，三行原文保留。该轮同时发现手动作者被误标 `AI Assistant`、写后分类跳回“开始”，**这两项不计通过**。随后代码修复：手动请求只传 authorship:user，由鉴权宿主写当前 user.name，原有注释作者不迁移；预验证工作字节连同页面结构发布，避免加载空窗卸载工具栏/handle。组件现已断言 handle 身份、分类、单调版本、成功 round 撤销和保存后再次编辑。修复后的浏览器作者/分类/第二次保存证据由主会话补录。

## 顶层 Agent 工具（45）

| 工具和上游源码 | 改原件 | 上游模型 | Mimir 手动 | Mimir Agent | 共用执行器 | 两端可达 | 原件读回 | 失败状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [`read_pages`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L230) | 否 | 是 | 查找文字层 | 已接 | pdf.js 文字层 | 共享 PDF 画布，两端同路径 | Agent 句柄测试通过 | 无文字层返回空页文字；版本变化拒绝旧结果 |
| [`search_text`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L246) | 否 | 是 | 查找栏 | 已接 | pdf.js 文字层 | 共享 PDF 画布，两端同路径 | 文字索引与 Agent 测试通过 | 空查询、版本变化明确拒绝 |
| [`goto_page`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L258) | 否 | 是 | 页导航 | 已接 | pdf.js 文字层 | 共享 PDF 画布，两端同路径 | 页号上下文即时同步测试通过 | 越界页号拒绝 |
| [`markup_text`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L267) | 是 | 是 | 定位完整唯一原文后高亮/下划线/删除线 | 已接有限子集 | 同一 handle→文字对象核验→GenOffice 标注宿主移植 | 共享组件/HTTP；实机待验收 | 三型宿主及 Agent 参数执行由 pdf.js 读回；组件高亮保存 | 过期 SHA/画布版本/取消/歧义/未知 Catalog 拒绝；all/颜色未接 |
| [`read_annotations`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L294) | 否 | 是 | 便笺与标注面板、刷新与选择 | 已接 | 当前工作字节→pdf-lib 批注读取 | 共享组件/HTTP；实机待验收 | 已保存和未保存便笺/回复/标注可读 | 过期画布拒绝，先保存页面/插字改动 |
| [`add_note`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L306) | 是 | 是 | 便笺面板内容及 X/Y | 已接 | 同一 handle→批注宿主 | 共享组件/HTTP；实机待验收 | 中文便笺及原文锚点经 pdf.js/pdf-lib 读回 | 越界/混合锚点/未知 Catalog/版本变化拒绝 |
| [`reply_note`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L329) | 是 | 是 | 选择根便笺→回复 | 已接 | 同一 handle→NM/IRT 批注宿主 | 共享组件/HTTP；实机待验收 | 实际按钮→IRT 回复→两次保存读回 | 根 ID 失效/取消/冲突拒绝 |
| [`edit_note`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L343) | 是 | 是 | 选择便笺或回复→修改 | 已接 | 同一 handle→SHA/NM 批注宿主 | 共享组件/HTTP；实机待验收 | 手动与 Agent 交替修改，保存保留作者/线程 | 失效 ID/空内容/取消/冲突拒绝 |
| [`delete_markup`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L360) | 是 | 是 | 选择文字标注→删除 | 已接 | 同一 handle→按 ID/类型删批注 | 共享组件/HTTP；实机待验收 | 实际组件删除标注、宿主独立读回，不删便笺 | 失效 ID/类型不匹配拒绝，失败原字节不变 |
| [`delete_note`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L382) | 是 | 是 | 选择根便笺→删除 | 已接 | 同一 handle→递归删除 IRT 线程 | 共享组件/HTTP；实机待验收 | 实际按钮删除根及回复，pdf.js/pdf-lib 确认 | 失效根/不支持回复类型/版本冲突拒绝 |
| [`edit_text`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L395) | 是 | 是 | 定位完整原文→核验→替换或删除 | 已接有限子集 | 同一 handle→pdf.js/PDFium 唯一对象核验 | 共享组件/HTTP；实机待验收 | Agent 原参数替换/删除→pdf.js；组件替换保存 | 过期 SHA/部分/重复/重叠/未知 Catalog 拒绝 |
| [`edit_block`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L432) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | PDFium/字体/文字定位未验收 |
| [`move_text_block`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L476) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | PDFium/字体/文字定位未验收 |
| [`insert_text`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L498) | 是 | 是 | 点击画布定位并插入 | 已接有限参数子集 | 共用 `PdfAgentHandle` → 鉴权 PDFium 宿主 | 共享 HTTP 宿主，三端 Agent 实机未验收 | 组件回归覆盖手动旋转→Agent 插字→保存→pdf.js 读回；手动独立原件读回 | 版本/取消/文档身份校验；上游其他参数未接，复杂 Catalog 拒写 |
| [`add_form_mark`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L549) | 是 | 是 | 绘图Inspector静态勾/叉 | 已接 | 同一handle→local宿主→矢量内容层 | 共享HTTP/组件；实机未逐项验收 | 真实矢量写入/删除、PDFium像素 | 坐标或唯一原文锚点；不创建交互字段 |
| [`list_inserted_text`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L581) | 否 | 是 | 待保存插字选择 | 已接 | 当前画布待保存列表 | 共享组件/HTTP，三端实机未验收 | Agent 句柄列表与手动更新后列表测试 | 保存或页结构操作后 ID 失效；不误列普通文字 |
| [`edit_inserted_text`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L595) | 是 | 是 | 编辑插字栏：内容/字号/颜色 | 已接有限参数子集 | 同一待保存列表→PDFium 宿主批量重放 | 共享 HTTP，三端实机未验收 | 手动改文→Agent 读取→保存→pdf.js 读回；PDFium 重放旧文消失 | 失效 ID/空文/越界字号拒绝；对齐未接 |
| [`move_inserted_text`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L615) | 是 | 是 | 编辑插字栏 X/Y | 已接绝对与相对位移 | 同一待保存列表→PDFium 宿主批量重放 | 共享 HTTP，三端实机未验收 | 手动改文→Agent 移动→保存→pdf.js 读回；PDFium 位置重放 | 越界/混合坐标拒绝；拖拽入口未接 |
| [`delete_inserted_text`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L631) | 是 | 是 | 编辑插字栏删除 | 已接 | 同一待保存列表→原始工作字节重放 | 共享 HTTP，三端实机未验收 | Agent 句柄删除→原字节、PDFium 重放无旧文 | 失效 ID 拒绝；页结构操作后 ID 失效 |
| [`image_search`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L643) | 否 | 是 | 无 | 待接 | 外部媒体服务待接 | 待验证 | 未验证 | 图像提取/烘焙/媒体回写未验收 |
| [`generate_image`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L656) | 是 | 是 | 无 | 待接 | 外部媒体服务待接 | 待验证 | 未验证 | 图像提取/烘焙/媒体回写未验收 |
| [`list_page_images`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L676) | 否 | 是 | 编辑→图片Inspector→读取/选择 | 已接（资源就绪时） | 同一image executor→PDFium/纯JS codec | HTTP/真实组件通过；实机待补 | 实际字节、像素/两次保存；详见末节 | 复用/嵌套/歧义/不安全结构拒绝 |
| [`insert_image`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L690) | 是 | 是 | 编辑→图片Inspector→上传PNG/JPEG | 已接（资源就绪时） | 同一image executor→PDFium/纯JS codec | HTTP/真实组件通过；实机待补 | 实际字节、像素/两次保存；详见末节 | 复用/嵌套/歧义/不安全结构拒绝 |
| [`transform_image`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L733) | 是 | 是 | 编辑→图片Inspector→位置/尺寸/层次 | 已接（资源就绪时） | 同一image executor→PDFium/纯JS codec | HTTP/真实组件通过；实机待补 | 实际字节、像素/两次保存；详见末节 | 复用/嵌套/歧义/不安全结构拒绝 |
| [`rotate_image`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L764) | 是 | 是 | 编辑→图片Inspector→左/右/180度 | 已接（资源就绪时） | 同一image executor→PDFium/纯JS codec | HTTP/真实组件通过；实机待补 | 实际字节、像素/两次保存；详见末节 | 复用/嵌套/歧义/不安全结构拒绝 |
| [`replace_image`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L785) | 是 | 是 | 编辑→图片Inspector→替换上传 | 已接（资源就绪时） | 同一image executor→PDFium/纯JS codec | HTTP/真实组件通过；实机待补 | 实际字节、像素/两次保存；详见末节 | 复用/嵌套/歧义/不安全结构拒绝 |
| [`flip_image`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L802) | 是 | 是 | 编辑→图片Inspector→水平/垂直翻转 | 已接（资源就绪时） | 同一image executor→PDFium/纯JS codec | HTTP/真实组件通过；实机待补 | 实际字节、像素/两次保存；详见末节 | 复用/嵌套/歧义/不安全结构拒绝 |
| [`set_image_opacity`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L824) | 是 | 是 | 编辑→图片Inspector→绝对不透明度 | 已接（资源就绪时） | 同一image executor→PDFium/纯JS codec | HTTP/真实组件通过；实机待补 | 实际字节、像素/两次保存；详见末节 | 复用/嵌套/歧义/不安全结构拒绝 |
| [`crop_image`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L845) | 是 | 是 | 编辑→图片Inspector→四侧裁切比例 | 已接（资源就绪时） | 同一image executor→PDFium/纯JS codec | HTTP/真实组件通过；实机待补 | 实际字节、像素/两次保存；详见末节 | 复用/嵌套/歧义/不安全结构拒绝 |
| [`remove_image_background`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L877) | 是 | 是 | 编辑→图片Inspector→去背景与容差 | 已接（资源就绪时） | 同一image executor→PDFium/纯JS codec | HTTP/真实组件通过；实机待补 | 实际字节、像素/两次保存；详见末节 | 复用/嵌套/歧义/不安全结构拒绝 |
| [`delete_image`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L897) | 是 | 是 | 编辑→图片Inspector→确认删除 | 已接（资源就绪时） | 同一image executor→PDFium/纯JS codec | HTTP/真实组件通过；实机待补 | 实际字节、像素/两次保存；详见末节 | 复用/嵌套/歧义/不安全结构拒绝 |
| [`list_form_fields`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L913) | 否 | 是 | 编辑→交互表单 | 已接 | 同一handle→专用AcroForm宿主 | 浏览器四字段通过；桌面/模型待补 | 字段/类型/值/选项/widgets读回 | XFA/重复字段拒绝；普通PDF不创建表单 |
| [`apply_ops`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L919) | 是 | 是 | 页面菜单（子集） | 已接：3种页面操作+setFormValue | pdf-pages.ts与专用AcroForm宿主 | 共享 PDF 画布，两端同路径 | Agent 写入→pdf.js/pdf-lib 独立读回 | 表单/页面混批原子、dry_run；其他内部项仍缺 |
| [`insert_blank_page`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L943) | 是 | 是 | 插入空白页；local邻页纸型 | 已接 | 同一handle→local宿主 | 共享HTTP；实机未逐项验收 | 原页保留、空白拆页回归 | 1–1000页；after_page=0为首页 |
| [`set_page_size`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L959) | 是 | 是 | 现有单页纸型 | 已接（全部页） | local保留原Catalog、缩放/居中 | 共享HTTP；实机待补 | 旋转裁剪后纸型/原文读回 | Agent为整份纸型；原手动单页纸型仍有复杂结构限制 |
| [`crop_pages`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L976) | 是 | 是 | 页面Inspector精确裁剪 | 已接 | 显示比例→旋转换算CropBox | 共享HTTP；实机待补 | 90度CropBox/纸型读回 | 仅修改可视区，不删除页内容 |
| [`extract_pages`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L995) | 是 | 是 | 页面Inspector抽页下载 | 已接 | local克隆当前对象图、保留表单并清理未选对象 | 共享HTTP/组件；下载实机待补 | 页序/AcroForm widgets/pdf.js字段/再次填写 | 含标签页树暂拒绝；输出不自动入库 |
| [`split_pdf`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L1010) | 是 | 是 | 页面Inspector按份拆文件 | 已接 | 复用保留AcroForm的抽页执行器 | 共享HTTP/宿主；实机待补 | 各份页数/字段值/保留可编辑性 | 最多100份，合计50MiB；输出不自动入库 |
| [`split_pages`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L1025) | 是 | 是 | 页面Inspector每页2/4/9格 | 已接 | local输出新PDF | 共享HTTP/宿主；实机待补 | 输出页数/尺寸/文字 | 表单/批注/标签页暂拒绝，避免静默丢失 |
| [`merge_pages`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L1037) | 是 | 是 | 页面Inspector拼版2–16页 | 已接 | local A4横版输出 | 共享HTTP/宿主；实机待补 | 拼版文字与页数 | 横/竖填充、分隔线；表单/批注/标签暂拒绝 |
| [`replace_pages`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L1059) | 是 | 是 | 选择来源/目标页码 | 已接（等待选文件） | Inspector明确选File并继续→local | 共享HTTP/组件；实机待补 | 非连续替换/来源选页/取消与停止不改画布 | 不读任意路径；来源表单/标签及替换含Widget页暂拒绝 |
| [`get_outline`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L1074) | 否 | 是 | 属性Inspector书签目录 | 已接 | 读取原生Outlines/直接及命名目标 | 共享HTTP/宿主；实机待补 | pdf.js嵌套目录及页面替换重映射 | 上限500项/8级；本机set_outline可重写目录 |
| [`set_watermark`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L1080) | 是 | 是 | 水印Inspector | 已接 | 可替换自有内容流图层 | 浏览器中文应用/保存/下载通过；桌面模型待补 | pdf.js两页文字及KEEP ORIGINAL、四字段保留 | 空文本仅清除本编辑器自有水印，字体覆盖不足拒绝 |
| [`set_header_footer`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L1108) | 是 | 是 | 水印与页眉Inspector六槽 | 已接 | 同一local图层/中文字体 | 共享HTTP/宿主；实机待补 | 中文页眉/页码占位/替换清除 | 不覆盖外部已烘焙原文字；模板保存为自有配置 |
| [`create_document`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L1141) | 新文件 | 是 | 无 | 待接 | 库内新文件路径待接 | 待验证 | 未验证 | 不暴露；执行器/读回未就绪 |

## 内部编辑操作（26）

仅上游 `op-docs.ts` 中未标 `aiCallable: false` 的 8 项可经 `apply_ops` 给模型；其他项由专用工具或手动入口驱动。

| 操作和上游源码 | 改原件 | `apply_ops` 可调用 | Mimir 手动 | Mimir Agent | 共用执行器 | 两端可达 | 原件读回 | 失败状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [`addMarkup`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L21) | 是 | 否 | 完整唯一原文三型标注 | 专用 markup_text；不经 apply_ops | 同一 handle→固定版 GenOffice 标注宿主移植 | 共享HTTP/组件；实机待验收 | 三型 Agent 参数/宿主 pdf.js 读回；组件高亮保存 | 部分/重复/未知 Catalog 拒绝 |
| [`removeMarkup`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L26) | 是 | 是 | 选择标注删除 | 专用 delete_markup 已接；apply_ops 未接 | 同一 handle→SHA/ID 删除 | 共享HTTP/组件；实机待验收 | 组件按钮/宿主读回 | apply_ops 尚未开放该内部项 |
| [`deleteSavedAnnot`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L32) | 是 | 否 | 删除便笺线程/标注 | 专用 delete_note/delete_markup | 同一 handle→NM/IRT 删除 | 共享HTTP/组件；实机待验收 | 实际按钮与pdf.js/pdf-lib读回 | 根ID/类型/安全结构检查 |
| [`editSavedNote`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L37) | 是 | 否 | 修改便笺/回复 | 专用 edit_note | 同一 handle→SHA/NM 修改 | 共享HTTP/组件；实机待验收 | 两次保存保留作者/线程 | 失效ID/版本/取消拒绝 |
| [`addDrawing`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L42) | 是 | 否 | 绘图Inspector形状 | 手动专用add_drawing；非Agent目录 | local矢量内容层 | 共享HTTP/宿主；手动浏览器待补 | 矩形0/90/180/270真实PDFium像素 | 未接画布自由笔手势；不计作Agent apply_ops覆盖 |
| [`removeDrawing`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L47) | 是 | 否 | 选择自有绘图删除 | 手动专用delete_drawing | local移除自有流 | 共享HTTP/宿主；实机待补 | 真实CRUD与原文保留 | 只改本编辑器自有图形；apply_ops未接 |
| [`setNoteContents`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L52) | 是 | 是 | 便笺面板修改 | 专用 edit_note 已接；apply_ops 未接 | 同一 handle→批注宿主 | 共享HTTP/组件；实机待验收 | 实际按钮及Agent交替读回 | apply_ops 尚未开放该内部项 |
| [`moveDrawing`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L58) | 是 | 否 | 绘图位置字段 | 手动专用update_drawing | local替换自有图层 | 共享HTTP/宿主；实机待补 | 移动和删除读回 | 未接画布拖拽；apply_ops未接 |
| [`setDrawingRect`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L63) | 是 | 否 | 绘图尺寸字段 | 手动专用update_drawing | local替换自有图层 | 共享HTTP/宿主；实机待补 | 几何及页面越界拒绝 | apply_ops未接 |
| [`putTextEdit`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L70) | 是 | 否 | 唯一完整原文替换/删除 | 专用 edit_text | 同一 handle→PDFium 核验写入 | 共享HTTP/组件；实机待验收 | Agent替换/删除与组件保存读回 | 非完整/唯一对象拒绝；不经apply_ops暴露 |
| [`removeTextEdit`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L75) | 是 | 否 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
| [`addTextInsert`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L80) | 是 | 否 | 点击画布定位并插入 | 专用 `insert_text` 有限参数子集已接 | 共用 `PdfAgentHandle` → PDFium 宿主；待保存 ID 可继续编辑 | 共享 HTTP 宿主，三端 Agent 实机未验收 | 组件回归经 pdf.js 读回；手动两次保存读回 | 宿主跳过或版本变化时不应用；其他参数未接 |
| [`removeTextInsert`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L85) | 是 | 是 | 删除待保存插字 | 专用 `delete_inserted_text` 已接；`apply_ops` 未接 | 当前画布待保存列表→PDFium 重放 | 共享 HTTP，三端实机未验收 | 删除后原字节/文字层读回 | `apply_ops` 未开放该项；页结构操作后 ID 失效 |
| [`patchTextInsert`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L91) | 是 | 否 | 编辑待保存插字 | 专用 edit/move 已接有限子集 | 当前画布待保存列表→PDFium 重放 | 共享 HTTP，三端实机未验收 | PDFium 重放、pdf.js 读回 | 上游对齐、拖拽与其他字段未接 |
| [`addImageEdit`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L98) | 是 | 否 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
| [`setImageEditRect`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L103) | 是 | 否 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
| [`bakeImageEdit`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L108) | 是 | 否 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
| [`patchImageEdit`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L113) | 是 | 否 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
| [`setStaticFillImage`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L118) | 是 | 否 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
| [`removeImageEdit`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L123) | 是 | 否 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
| [`setFormValue`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L130) | 是 | 是 | 按字段类型输入/勾选/选项 | apply_ops已接 | 同一表单执行器 | 浏览器四字段通过；桌面/模型待补 | 中文外观/两次保存/保留可编辑性 | 整批原子；只读/动作/签名/XFA/非法选项拒绝 |
| [`rotatePages`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L138) | 是 | 是 | 旋转 | 已接（apply_ops） | pdf-pages.ts | 共享画布两端同路径 | Agent 写入→pdf.js/pdf-lib 独立读回 | 越界或版本冲突拒绝 |
| [`deletePage`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L144) | 是 | 是 | 删除页 | 已接（apply_ops） | pdf-pages.ts | 共享画布两端同路径 | Agent 写入→pdf.js/pdf-lib 独立读回 | 最后一页不删除；越界拒绝 |
| [`setPageOrder`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L149) | 是 | 是 | 移动/倒序 | 已接（apply_ops） | pdf-pages.ts | 共享画布两端同路径 | Agent 写入→pdf.js/pdf-lib 独立读回 | 非完整页序拒绝 |
| [`setStamps`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L157) | 是 | 否 | 水印与页眉Inspector | 专用set_watermark/set_header_footer；apply_ops未接 | 同一local图层 | 浏览器水印通过；其余待补 | 中文替换/清除、原文保留 | 仅自有可替换图层 |
| [`setMetadata`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L162) | 是 | 是 | 属性Inspector | apply_ops与专用set_metadata已接 | 保留Catalog并更新标准Info，清旧XMP | 共享HTTP/组件；实机待补 | metadata/页/表单混批、dry_run及失败原子 | 省略字段保留，空字符串清除；标准四字段 |

## 上游手动命令入口

| 上游入口 | 命令与写路径 | Mimir 状态 | 读回 |
| --- | --- | --- | --- |
| `renderer/App.tsx:6000–6090, 6500–6560` | 编辑/插入文字和图片，`main/text-edit.ts`、`image-edit.ts` | 点击定位插入文字及待保存插字内容/字号/颜色/位置/删除已接；完整唯一对象替换已接，拖拽/对齐未接；图片Inspector已接 | 插字手动改文→Agent 移动→保存由 pdf.js 读回；替换经组件保存→pdf.js 重开，图片宿主/真实组件/生产探针见末节 |
| `renderer/App.tsx:6380–6490, 8200–8260` | 高亮、批注回复、绘图、涂黑、签名，`main/save-pdf.ts`、`redaction.ts` | 完整唯一原文的高亮/下划线/删除线已接；便笺/回复/修改/线程删除与标注删除已接；参数式矢量绘图已接；自由笔手势/涂黑/签名未接 | 标注三型宿主 pdf.js 读回，高亮组件保存重开；便笺实际按钮/Agent 交替，两次保存读回 |
| `renderer/App.tsx:6560–6685`, `FormLayer.tsx:60–190` | 静态表单标记和 AcroForm 字段，`main/save-pdf.ts` | 交互字段Inspector已接；静态勾叉已接（绘图Inspector/local宿主） | 浏览器四字段/独立阅读器通过，见末节 |
| `renderer/App.tsx:6690–6855` | 旋转、删除、抽取、插入、替换、裁剪、纸型、倒序、拆分、合并 | 旋转/删除/插入/裁剪/纸型/倒序/移动及抽取/选页替换/拆分/拼版已接；限制见逐项行 | 页面几何部分测试 |
| `renderer/App.tsx:6290–6350, 8420–8470` | 查找、打印、导出图像、属性和图片浮动操作 | 查找/属性、当前工作副本PDF下载及打印入口已接；图像导出未接，打印对话框未实机验收 | 未验证 |

## 宿主可行性探针

- 固定生产依赖 `@embedpdf/pdfium@2.15.1` 和 `harfbuzzjs@0.10.3` 同时写入 server 与 office 包；PDFium `dist/pdfium.wasm`、HarfBuzz `hb-subset.wasm` 在 `pnpm deploy --prod` 产物中均存在。
- Node 25.9.0 调用 PDFium `init({ wasmBinary, thisProgram: "mimir-pdf" })` 与 `_PDFiumExt_Init()` 成功。pdf-lib 生成 1 页 870 字节 PDF，PDFium `_FPDF_LoadMemDocument`/`_PDFiumExt_SaveAsCopy` 输出 1530 字节，pdf-lib 独立重开读到 1 页。只证明基础字节往返。
- 上游 `main/wasm-path.ts` 打包兜底使用 Electron `process.resourcesPath`；Mimir 的共享服务端以 `createRequire(import.meta.url)` 从生产依赖解析两份 WASM。server 生产构建及独立 `pnpm deploy --prod` 运行探针通过；桌面打包产物仍需实机验收。

## 验收夹具

| 类型 | 必须验证 | 当前 |
| --- | --- | --- |
| 普通文字/CJK/扫描件 | 文字位置、字体嵌入；无文字层须明确拒绝或 OCR 结果经确认 | 英文替换/插入经 pdf.js 读回；CJK、扫描件未验证 |
| 批注线程/图片/表单 | 修改后 pdf.js、pdf-lib、独立阅读器重新打开一致 | 便笺/回复两次保存与 pdf.js/pdf-lib 读回通过；外部阅读器、图片、表单未验收 |
| 签名/未知 Catalog | 保全或拒写，不破坏原件 | 页面重建拒写；PDFium 宿主对额外 Catalog（测试含 AcroForm）拒写；实际签名件未验证 |
| 切文档/停止/版本冲突 | 旧异步结果不误写，dirty 和回退准确 | Agent 版本冲突/整轮回退、手动异步人工改页拒绝旧结果通过；切文档/停止未验证 |

## 2026-10-16 原文/批注真实浏览器补验

主会话在文档 `9HNfJZ_aYLT4nddM` 实际添加中文便笺/回复、修改原文标注、保存、下载和刷新后，以独立 pdf.js 脚本严格断言：3 Text + 1 Highlight、回复 `inReplyTo=7R`、新手动便笺作者 `admin`、原有三行文字全保留，脚本 exit 0。黄色高亮刷新重开仍可见。旧 `AI Assistant` 条目来自作者修复前，不作为新版本失败证据。截图 `/tmp/mimir-pdf-notes-highlight-reopened.jpg`。

首次窄栏实测暴露批注单行挤压，已改专用多行面板。主会话复验 957px 视口、691px 内容区：选择框全宽、中文 textarea 两行、坐标/操作换行、作者和回复列表可见，原高亮画布保留；截图 `/tmp/mimir-pdf-notes-responsive-reopened.jpg`。此宽度下问 AI 使用已有覆盖侧栏，不能作为打开 AI 后重新分配中栏宽度的证据。组件窄栏结构/实际控件与保存回归 10/10 通过；happy-dom 不提供真实几何，几何结论来自以上浏览器量测。真实模型及桌面实机尚未补验。

## 2026-10-16 交互表单实现切片

新增`list_form_fields`与`apply_ops setFormValue`：text/checkbox/radio/dropdown/option-list，手动“编辑→交互表单”共用宿主。字段保留可编辑性，支持清空；表单与既有rotatePages/deletePage/setPageOrder可原子混批（含控件的页禁止删除），dry_run不发新字节/不升版本。原文/页面重建仍拒绝AcroForm，不把新专用路径解释为全局安全白名单放宽。其他apply_ops子项仍缺。

宿主4项、HTTP新增表单测试、真实组件1项通过；组件实际完成中文输入→保存→Agent字段+旋转混批→整轮回退→手动勾选→第二次保存，pdf-lib/pdf.js独立读回。Office/server tsc通过。`@pdf-lib/fontkit@1.1.1`的CFFSubset头offSize错误导致最初Poppler拒绝字体；局部端口修正后`pdftoppm`无错误并已查看`/tmp/mimir-pdf-forms-cjk-fixed.png`，中文“中文姓名”清晰。探针PDF`/tmp/mimir-pdf-forms-cjk-probe.pdf`；真实浏览器多字段夹具`/tmp/mimir-pdf-forms-toolbar-fixture.pdf`（name/agree/color/country、两页及KEEP ORIGINAL）。本段不代表浏览器/桌面/模型已验收，待主会话补证据。


## 2026-10-16 表单崩溃修复与 Inspector 复验

最初真实浏览器逐次填写中文→勾选→radio时宿主退出，之前的合批测试未覆盖。根因是radio分配未消费的CFF子集，charset只含.notdef时nLeft=-1；且fontkit nextTick编码错误逃逸。现仅text/choice分配字体、预置空格保证空值合法，并把异步encode失败转error事件。宿主新增逐次8次填写/清空与模拟encoder异常后可恢复测试；不得把曾发生的宿主退出写成“仅前端失败”。

主会话已重跑name=中文表单验收→agree=true→color=blue→country=China→保存/下载；`/Users/admin/Downloads/mimir-pdf-forms-toolbar-fixture.pdf`经pdf-lib独立断言四值/2页通过，Poppler`/tmp/mimir-pdf-forms-browser-readback.png`肉眼确认中文、勾选、blue圆点、China及KEEP ORIGINAL。后续用户否决原全宽UI，已换文档区右侧Inspector。主会话复验1440/960、957/873与420/900宽/中/窄：宽侧列300px、窄覆盖300px，字段/保存/状态可见。截图`/tmp/mimir-pdf-form-inspector-wide.jpg`、`/tmp/mimir-pdf-form-inspector-narrow.jpg`。Escape已改实际触发器ref，并有表单/图片组件焦点断言；浏览器回焦复验由主会话补。

## 2026-10-16 图片实现切片

固定上游sync清单引入image-edit/image-bake/cutout闭包，Electron导入经机械rewrite换为Mimir codec端口，无vendor手改。10项图片工具与手动Inspector共用同一执行器，真实图片枚举/target哈希、URL或PNG/JPEG上传、位置/大小/层次、四分之一周旋转、替换、翻转、绝对不透明度、裁切、边连通去背景、删除均已写入真实字节。复用/相近重叠/嵌套Form XObject拒绝，像素编辑不支持倾斜/任意角度/反射矩阵，最大边2400px；AcroForm与未知Catalog不放宽。外部image_search/generate_image仍缺。

server的codec/图片测试覆盖PNG/JPEG真实插入与替换、透明彩色像素、90度页、目标过期、混合连续编辑、0→1绝对alpha、重复alpha不累乘、替换/裁切保留alpha、两次保存、原文保全。实际独立Poppler探针曾发现半透明彩色像素偏色：PDFium输出straight BGRA，不应走Electron位图反乘；修复后另以真实flip前后颜色断言回归。HTTP覆盖401/404/非法输入/工作字节/过期target，确认未持久化原件。Office新图片组件覆盖控件翻转→保存→Agent位置变更→round撤销→alpha→第二次保存，以及FileReader迟到遇Agent编辑不写入；表单/图片/批注Inspector共14项通过。server生产构建通过；部署探针结果另补。

图片浏览器夹具`/tmp/mimir-pdf-images-toolbar-fixture.pdf`（原文与上下不同alpha的红蓝图），主会话负责真实浏览器验收；Inspector表单视觉通过不代表图片控件均已实机验收。桌面本地/远端与真实模型仍未补，不宣称PDF全部完成。

### 独立生产部署与最终焦点回归

server生产构建及`pnpm deploy --prod`到`/private/tmp/mimir-pdf-image-production-deploy-verified`通过；生产`pngjs`/`jpeg-js`均从该部署目录解析。最初使用macOS `/tmp`符号路径时deploy的相对patch路径失败，改规范真实路径后成功，未修改项目配置。部署产物实际执行图片flip→绝对opacity 0.5，输出1979字节并读回opacity 0.5；表单产物独立执行中文→radio→清空文字，读回name空、agree=false、color=blue、country=[]。部署PDF经Poppler生成`/tmp/mimir-pdf-image-deployed-readback.png`并已查看：KEEP ORIGINAL原文保留、蓝红位置翻转正确、上下透明度分层清晰，无此前蓝转青偏色。该证据是部署运行探针，不替代浏览器图片操作验收。

主会话真实浏览器发现读取中立即Escape时原触发器disabled，直接focus落到BODY。现仅为Escape关闭记录待回焦触发器，busy结束且文档未变、面板未重开、焦点仍在BODY时恢复；若用户已移到其他控件则不抢焦点。新增pending立即Escape及不抢焦点两条回归，保留正常读完Escape断言；PDF表单/图片/批注组件合计16项通过，Office tsc和本次三文件oxlint通过。真实浏览器复验由主会话补记。


## 2026-10-16 剩余本地工具与样式切片

新增页面/绘图/水印与页眉/属性四类工具，入口仍为单行Ribbon的具名“页面与文档工具”，复杂输入留在既有300px右Inspector。原Segmented滑块与密集堆叠经主会话实机发现后改为2×2、32px具名tab和整格选中底板；操作32px、相关控件间距10px/分组20px。宽1280与窄420下侧栏保持300px，420页面body宽420、没有页面横溢出。中文水印“工具栏样式验收”真实应用→保存→下载，pdf.js两页均读回且KEEP ORIGINAL原文保留，pdf-lib四字段当前值不变；截图`pdf-local-watermark-inspector.png`由主会话保存。

真实浏览器发现旧manual旋转仍走严格页面重建，表单+水印保存后再旋转被拒绝。现由planPdfPageOperations将无导入/无重复/无裁剪纸型的既有页布局规划为local旋转/删除/调序批次，完成全部临时计算并核对画布版本后才写盘；没有放宽全局assertSafeToRewrite。主会话重做表单+水印→旋转90→保存→撤销→保存→重做→保存成功；下载`(2).pdf`独立pdf-lib/pdf.js确认90度、四字段值及两页中文水印全保留。共享history同时覆盖Agent与manual、保存rebase、后续手动编辑清redo；键盘撤销不拦截输入框原生撤销。本段当时尚未覆盖单页旧档位裁剪/纸型、复制页与旧导入组合；后续保留结构切片见末节，不将旋转修复本身写为全部复杂PDF页面编辑完成。

抽页/按份拆分保留原AcroForm对象树与选中页Widgets，剪除被删字段/控件，输出可再次填写保存；pdf.js独立字段页序、pdf-lib字段值与widgets数均验证。不能仅removePage后save：pdf-lib会序列化所有间接对象，且1.17的removePage不会失效getPages缓存。现从真实Pages树取当前页，清理失效命名目标/内部链接，再按trailer根可达GC，防止输出携带未选页面/内容流。抽页、local删除/替换及表单混批删除共用清理；测试同时断言可见页数、间接Page对象数和解码流不含被删页文本。表单+metadata+页面混批/dry_run在临时副本完整验证，local显式结构守卫允许保留原生书签；默认表单与PDFium严格路径仍分别保留其安全限制。

本切片server local/form/catalog/route四文件22项与Office local/content/form/image/agent五文件36项通过；Office/server类型检查及目标Oxlint、Oxfmt、diff检查通过；server最终由独立checker复核通过。实际静态绘图坐标以PDFium渲染断言0/90/180/270度红色矩形像素；不是仅检查图层JSON。窄栏焦点问题补了实际CompactToolbar折叠菜单卸载入口后，Escape/关闭回具名组按钮的回归；主会话实际420从折叠“表单”组进入：textarea按Escape、重新进入点关闭，两条均回到BUTTON aria-label=表单；样本已旋转恢复0度并保存，无dirty。

未完成边界：手势自由笔/拖拽绘图、涂黑/签名/OCR、全部apply_ops内部项、原文任意区块、图像导出、外部图片搜索/生成仍有差距；export_pdf和自有drawing执行器属于手动本地工具，尚未计作模型目录覆盖。带标签页树迁移、来源交互表单导入、含Widget页替换、含表单/批注拆页拼版均明确拒绝。抽页/拆文件输出提供下载，不自动新增知识库文件；真实打印对话框、桌面本地/远端和真实模型逐项工具验收仍待补。不能据入口与当前测试数量宣称PDF完整对标。

### 单页几何/复制/导入保留结构补全依据（2026-10-16）

固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`：`apps/pdf/src/main/save-pdf.ts`469–491抽页/插页用copyPages；644–670纸型同时scaleContent和scaleAnnotations，以MediaBox原点居中；741–758裁剪换算显示方向后仅改CropBox。`renderer/App.tsx`4960–5040的runFileOp先flushThen保存：Mimir采用当前工作副本物化，仍由用户明确保存。上游copyPages不保留AcroForm.Fields，不能直接照搬到复杂文档。WeKnora v0.8.3在前述调查已核对，其KB/Agent流程适用，Markdown编辑器不作为Office工具栏模型。本片段新增真实混合回归后再记录覆盖，不提前勾选完成。

### 2026-10-16 单页几何、复制、导入和输出反馈

已接内部`apply_page_layout`：源页/空白页、绝对旋转、相对源CropBox四边内缩、未旋转目标纸型整体预检；保留Catalog/原生字段/书签，复制Widget独立坐标且Parent/P绑定同字段与新页。纸型同步缩放内容和annotations，以MediaBox原点居中，负坐标留白是预期结果。`buildPdfWorkingCopy`复用于保存及local工具，未保存页面档位也能直接抽页，不自动保存/清dirty/追加历史。旧导入入口直接沿相同local handle执行，来源不支持/失败保留此前pending布局与history。

来源先经保留对象的选页抽取清除未选目标，再用单个copier复制page.ref，避免copyPages(page.node)留下内部Dest/P幽灵页；独立测试确认Link指向实际插入页，未选第3页不进入间接Page集合。另主会话真实复制输出暴露3可见/8间接Page：水印临时页removePage后仍被writer输出。现全部local save先flush延迟嵌入再按trailer根GC，不可达临时页面/流不再输出；混合组件/服务回归断言3可见=3间接Page。

输出移到页面Inspector顶部并滚回可见位置；仅页面tab显示，批量结果220px内滚动，不挤走其他工具。属性缓存同时绑定当前bytes/layout，pending调序和undo自动读取临时工作副本，书签页码1→2→1的界面回归通过。删除页确认框改为真实可撤销/手动保存提示。

本片段服务pdf-local15/15，Office七文件62/62（包括pending几何/两次保存/复制字段再填写/导入失败不消费历史/抽页不保存/内部链接/晚到结果拒绝），Office tsc与目标Oxlint通过；定向Oxfmt和diff检查通过。主会话初次实机forms裁10pt+A5+复制第一页→保存→undo复制→保存成功；首次下载原文、水印、四字段值/双widgets与A5尺寸保留，随后发现临时Page残留，修复后的真实下载重验由主会话补证据。独立checker正在核对稳定绘图ID与等价旋转等边界，最终结果另补。

保留边界：标签页树迁移、来源AcroForm导入、含Widget页替换仍不支持；含自有可编辑绘图页的crop/paper/旋转组合原先明确拒绝，现已由下述精确几何切片补齐。全局Catalog守卫未放宽。三端实机/真实模型/真实打印对话框仍分别验收，不把这组页面工具当作PDF完整对标。

主会话GC修复后真实下载`(4).pdf`独立确认：3可视页/3间接Page，原字段值全保留，widgets为name2/agree2/color4/country2；第1页与复制页为A5（419.53×595.28），第3页仍原400×500。纸型/控件居中使用负CropBox原点，符合保留同比缩放内容/annotation的实现。保存后undo/redo最后一轮仍由主会话继续记录，不将HMR重置状态计入验收。

独立检查补充：重复物化待保存的复制页时，绘图ID此前随机变化，现按来源身份/复制次序稳定派生并避开已有ID；保存后再次复制保持唯一。原生-90°与270°等价比较，不再误拒绝未改几何的复制。该检查阶段local批次旋转、裁剪与纸型也执行同一绘图几何拒绝，不能绕过layout检查；后续精确几何切片已替换此限制，见末节。新增回归先复现两处失败后修复，另补“物化成功但持久化失败”保留dirty/版本/撤销重做并重试保存的组件验证。Office七文件92/92通过，最终新增统一入口guard后三文件18/18通过；server local/forms/preserving-forms/local-route/catalog五文件28/28、另forms HTTP所在pdf-agent-route九项通过。Office/server tsc、17文件定向Oxlint、9文件格式与diff检查通过；全仓check仍受既存技能脚本lint错误阻挡，不写作全量gate通过。新pending表单前端接缝由下一检查段补证据。

独立复核新表单接缝：临时物化后重新读取该字节的表单SHA再填写，发布前仍校验句柄/字节/版本/signal；read和dryRun不发布临时布局或消费历史，非法混批/取消晚到结果保留pending布局。新增local dryRun缓存回归先复现“假设metadata写入实际Inspector”后修复，预检结果不再覆盖当前属性缓存。最终Office pending-forms/forms/local/content-agent/layout/working-copy六文件36/36通过；server五文件28/28、route9/9通过，最后几何guard后pdf-local15/15复跑通过（重复项不累加）。最终18文件Oxlint无warning、11文件格式检查、Office/server tsc与diff通过。真实浏览器视觉/交互由主会话在冻结后的页面补验。

此前差距是普通字段写仍受旧专用表单Catalog守卫限制；后续显式保留适配见下节。


### 带原生书签的普通AcroForm继续填写

新增显式`applyPreservingPdfFormOperation`，与local共用原守卫；纯字段复用既有表单writer，含页面混批复用local书签目标映射/清理。旧默认表单writer仍拒绝Outlines，未放宽PDFium/旧页面重建全局守卫。服务回归自造原生GoTo与Dest两书签及四型字段，连续中文/choice填写清空→水印→裁剪/纸型/复制→调序/旋转/删除无Widget书签目标→再次填写，pdf.js独立确认幸存目录目标、双Widget字段值/外观和原文/水印；pdf-lib确认Parent/P、可见页=间接Page数及可编辑性。dryRun不返字节且保留原快照，过期SHA/非法字段/晚到页码错误整体拒绝；未知Catalog、SigFlags/签名字段、XFA、AA/URI动作仍拒绝。专项forms+preserving两文件10/10与server tsc通过；根会话维护HTTP接线及路由/实机验收，当前未将新组合写成浏览器通过。

主会话同时发现实际抽页结果区在长页面Inspector中被flex挤成0高度：输出块和内部按钮已设flex:none，保留220px结果滚动；根会话继续用当前未保存裁剪样本复验下载。组件DOM通过不能代表输出真实可见。


未保存页面表单接缝现已接同一临时工作副本：list_form_fields与字段apply_ops可直接作用于pending裁剪/纸型/复制/页序，仍受本地结构守卫约束。只读/dryRun不升版本/不发布字节/不清dirty；失败和取消保留pending，填写成功只记一次history。字段缓存按源bytes+layout失效，Inspector后台可取消read与Agent主动操作互不争用。新pending-forms组件两项覆盖裁20pt+复制后Inspector中文填写→保存→undo保存→redo保存、双Widget/值/裁剪读回，以及dryRun/非法选项整批拒绝/迟到取消不吃pending。PDF八文件65/65、Office tsc及目标lint通过；此组合的真实浏览器Outlines补验交主会话。保存按钮通用busy说明改为“PDF 正在处理”。

主会话补验抽页结果区修复后32px可见并下载成功：pending裁20pt仍保留原文档dirty，输出379.53×555.28，1可视=1间接Page、四字段完整；旧入口导入普通图片PDF→保存下载4=4页/四字段保留，undo保存恢复3页；复制保存/undo保存/redo保存亦通过。以上由主会话实际下载独立读回，不等同新表单组合实机已通过。

### 书签表单与未保存裁剪实际闭环

主会话在forms真实样本加入原生书签1/3页→保存→首界面pending裁20pt→读取字段→写中文name→保存成功。下载`mimir-pdf-forms-toolbar-fixture (7).pdf`独立pdf-lib/pdf.js确认3可视=3间接Page、CropBox379.53×555.28、两个原生书签标题及目标1/3页、四字段值及双份widgets、KEEP ORIGINAL文字保持。保存后undo恢复旧name但保留pending裁剪，再保存→redo恢复新name→保存；刷新重开4字段与新值仍可读可编辑。最终截图`pdf-form-preserving-final-wide.png`及详细验证见审查任务`validation-20261016-continuation.md`。真实模型/原生Desktop仍无新增验收。Web/Desktop/Server最新生产构建均exit0，既有全仓技能脚本lint阻塞未消除。


### 2026-10-16 自有绘图随几何保持可编辑

固定上游仍为480548fd55f1be3593ee0d8e316a734751d58309；save-pdf.ts333–418保存Ink点、形状和from/to实际路径，644–670纸型等比scaleContent/scaleAnnotations。Mimir以显示空间缓存保存绘图，新增pdf-drawing-geometry统一旧显示→PDF用户空间→比例缩放→新显示转换，覆盖local旋转、crop、paper与pending layout；缓存更新不会再叠加绘制。局部rotation保存箭头/勾叉朝向，arrowHeadLength保存缩放后的真实头长；裁剪负坐标、细于.25pt或宽于14400pt的派生路径精确保留，不夹限。新建仍保留原在页内/线宽/尺寸预算；对象数、点数、字节和页数预算保持。复制仍稳定避碰ID，可后续update/delete。Inspector允许派生坐标/线宽回显与编辑、提供紧凑方向选项，草稿随源几何更新，保持300px右面板和既有分组。

服务几何6/6、local15/15通过。专项用独立pdf.js真实光栅化逐形比较旧流自然变换与缓存重绘，七形状四目标旋转+非零MediaBox/CropBox+非对称裁剪+A5，要求每形状红色像素>10且交并比>97%；还覆盖负坐标、20pt极小纸型派生细线与窄CropBox后14400pt纸型派生超大缓存、不同几何复制/调序/稳定ID/修改/删除；原文、中文水印、原生书签与AcroForm/双widgets保留。Office local/layout/working-copy三文件20/20通过，新增真实按钮pending裁剪+A5+复制→只读获得稳定ID→save→edit→save→旋转调序→undo/redo→再edit/save/delete，独立PDF读回且同句柄不丢历史；Inspector回显方向与坐标。Office/server tsc与定向lint通过。实际浏览器和独立checker由主会话在UI冻结后补验，本段不代表三端/模型或手势自由绘图已完成。


### 独立几何检查补充（2026-10-16）

坐标公式、局部朝向、箭头头长与稳定复制ID复核通过。独立检查先以恶意文件复现两项失败：原MimirDrawings缓存可在read/几何入口绕过500对象及每项2000点预算。现统一readPdfDrawings严格校验文件缓存，遍历前拒绝超量；全文件再核对象总数/ID唯一性，layout克隆前预检复制后的数量。保持signed坐标、finite正尺寸/线宽及原几何公式，不改UI/vendor/routes/安全白名单。补全跨页数量、重复ID、复制超预算与初始局部90度后连续+90/+180/-90的独立pdf.js逐形像素回归。

最终server geometry/local两文件25/25，Office local/layout/working-copy/pending-forms四文件22/22（前后复跑数不累加）；Office/server tsc、9文件定向Oxlint零warning、Oxfmt与git diff --check通过。全仓pnpm check仍受既存技能脚本lint阻挡，未声明全量gate或真实浏览器/桌面/模型验收通过；实际界面与下载由主会话继续。


独立复核Inspector数字显示修复：无需修改产品代码，新增真实InputNumber回归，验证负坐标、超14400pt派生尺寸与1e-312非零线宽；聚焦/失焦及重输显示近似值不改变精确缓存，Enter提交新精度、Escape取消，源几何/sourceKey更新后旧颜色与宽度草稿失效。最终PdfEditor.local 17/17、Office tsc、两文件Oxlint/Oxfmt、Antd lint（0项）和git diff --check通过；真实颜色变更与下载读回由主会话继续，不以组件替代实机。

### 绘图实机与撤销回显闭环

root真实第3页箭头→右转90→裁10pt→A5→保存，改色前后下载(8)/(9)严格仅color变化，坐标/尺寸/线宽/朝向/头长/稳定ID均精确保留。撤销下载(10)蓝色正确，却发现旧红草稿复活；修复为源身份变化永久清空草稿，同源刷新保留正常输入。local最终18/18与独立检查通过。实机修后redo红→undo蓝→redo红→保存→reload并选择同一箭头，颜色和精简数值正确，下载(11)与(9)缓存deepEqual、3页4字段保留。最终图`pdf-drawing-inspector-saved-final.png`。真实浏览器证据只覆盖该变换组合和改色/历史，不扩写为手势绘图或全部PDF工具完备。
