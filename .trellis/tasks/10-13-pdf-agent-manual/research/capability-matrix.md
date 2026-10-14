# PDF 固定版 GenOffice 能力与验收矩阵

核对日期：2026-10-13。固定上游：`genspark-ai/genoffice@480548fd55f1be3593ee0d8e316a734751d58309`。来源链接逐行指向该 commit。WeKnora `v0.8.2` 的证据和适用性见父任务 `research/reference-check.md`；PDF 编辑的主要参考是 GenOffice。

状态说明：`现有` 仅指 Mimir 手动页面编辑器；`待接` 尚未注册 PDF Agent 工具。`pdf-pages.ts` 的保存为整体重建，遇未知 Catalog 键拒绝写回。下表逐项列能力与缺口，不能将工具目录当成功能验收。

截至 2026-10-13，本轮实际开放给 Agent 的有 `read_pages`、`search_text`、`goto_page`、`insert_text`、`list_inserted_text`、`edit_inserted_text`、`move_inserted_text`、`delete_inserted_text` 的有限参数子集，以及 `apply_ops` 的三种页面操作。手动入口的点击定位插入、待保存插字选择/内容/字号/颜色/位置修改和 Agent 共用画布句柄；每次修改从插字前字节经服务端 GenOffice PDFium 重放整批插字，由 pdf.js 独立读回。保存后临时 ID 失效；页结构操作会将当前插字固定在工作副本并使临时 ID 失效，字节仍待用户保存，此点尚未与上游的任意交替编辑完全对齐。`insert_text` 暂只支持页号、文字、页面坐标、字号和颜色；上游的锚点、最大宽度、字重、斜体、对齐等参数仍未接。宿主已有文字替换执行器，但画布缺少可信的原文字对象/矩形选区，尚未开放手动替换与 Agent 替换工具。批注、图像、表单及其余目录项仍未实现。浏览器与桌面共用鉴权 HTTP 与编辑器组件；真实模型及三种运行方式的插字 Agent 实测仍待进行，不能把代码路径相同写成端到端验收通过。

验证证据：此前 Office 定向 6 个测试文件 73 项、server PDF 宿主与路由 2 文件 7 项通过；本次额外 Office Agent/组件 2 文件 10 项和 server PDF 目录/宿主 2 文件 7 项通过，Office/server 类型检查通过。真实 PDFium 批量插入→改文/移动→删除的重放结果由 pdf.js 独立读回；组件回归覆盖手动改文→Agent 列出/移动→保存→pdf.js 读回，也覆盖保存 B→再插入 C→删除 C 回到干净的 B、旧插字保存进行中新增插字后删除，以及只保存页面改动 B 时并发插字再删除，后两者均回到实际写出的 B 字节。保存期间修改正被写入的旧插字会明确拒绝；页面保存的异步序列化期间画布版本变化则拒绝旧保存。此前 `pnpm deploy --prod` 到独立临时目录后两份 WASM 都存在，且部署产物执行 PDFium 插字输出可由 pdf-lib 重开。中文字体、扫描件 OCR、批注线程、图片、表单、签名以及复杂 Catalog 尚未达到本任务验收线。

## 顶层 Agent 工具（45）

| 工具和上游源码 | 改原件 | 上游模型 | Mimir 手动 | Mimir Agent | 共用执行器 | 两端可达 | 原件读回 | 失败状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [`read_pages`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L230) | 否 | 是 | 查找文字层 | 已接 | pdf.js 文字层 | 共享 PDF 画布，两端同路径 | Agent 句柄测试通过 | 无文字层返回空页文字；版本变化拒绝旧结果 |
| [`search_text`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L246) | 否 | 是 | 查找栏 | 已接 | pdf.js 文字层 | 共享 PDF 画布，两端同路径 | 文字索引与 Agent 测试通过 | 空查询、版本变化明确拒绝 |
| [`goto_page`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L258) | 否 | 是 | 页导航 | 已接 | pdf.js 文字层 | 共享 PDF 画布，两端同路径 | 页号上下文即时同步测试通过 | 越界页号拒绝 |
| [`markup_text`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L267) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 不暴露；执行器/读回未就绪 |
| [`read_annotations`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L294) | 否 | 是 | 无 | 待接 | pdf.js 文字层 | 待验证 | 未验证 | 不暴露；执行器/读回未就绪 |
| [`add_note`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L306) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 不暴露；执行器/读回未就绪 |
| [`reply_note`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L329) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 不暴露；执行器/读回未就绪 |
| [`edit_note`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L343) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 不暴露；执行器/读回未就绪 |
| [`delete_markup`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L360) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 不暴露；执行器/读回未就绪 |
| [`delete_note`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L382) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 不暴露；执行器/读回未就绪 |
| [`edit_text`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L395) | 是 | 是 | 无 | 未开放 | PDFium 宿主写入已验证；缺可信对象选区 | HTTP 宿主可供两端，实机未验收 | 宿主替换→pdf.js 读回通过 | 旧文字不匹配与复杂 Catalog 拒写 |
| [`edit_block`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L432) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | PDFium/字体/文字定位未验收 |
| [`move_text_block`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L476) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | PDFium/字体/文字定位未验收 |
| [`insert_text`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L498) | 是 | 是 | 点击画布定位并插入 | 已接有限参数子集 | 共用 `PdfAgentHandle` → 鉴权 PDFium 宿主 | 共享 HTTP 宿主，三端 Agent 实机未验收 | 组件回归覆盖手动旋转→Agent 插字→保存→pdf.js 读回；手动独立原件读回 | 版本/取消/文档身份校验；上游其他参数未接，复杂 Catalog 拒写 |
| [`add_form_mark`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L549) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 不暴露；执行器/读回未就绪 |
| [`list_inserted_text`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L581) | 否 | 是 | 待保存插字选择 | 已接 | 当前画布待保存列表 | 共享组件/HTTP，三端实机未验收 | Agent 句柄列表与手动更新后列表测试 | 保存或页结构操作后 ID 失效；不误列普通文字 |
| [`edit_inserted_text`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L595) | 是 | 是 | 编辑插字栏：内容/字号/颜色 | 已接有限参数子集 | 同一待保存列表→PDFium 宿主批量重放 | 共享 HTTP，三端实机未验收 | 手动改文→Agent 读取→保存→pdf.js 读回；PDFium 重放旧文消失 | 失效 ID/空文/越界字号拒绝；对齐未接 |
| [`move_inserted_text`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L615) | 是 | 是 | 编辑插字栏 X/Y | 已接绝对与相对位移 | 同一待保存列表→PDFium 宿主批量重放 | 共享 HTTP，三端实机未验收 | 手动改文→Agent 移动→保存→pdf.js 读回；PDFium 位置重放 | 越界/混合坐标拒绝；拖拽入口未接 |
| [`delete_inserted_text`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L631) | 是 | 是 | 编辑插字栏删除 | 已接 | 同一待保存列表→原始工作字节重放 | 共享 HTTP，三端实机未验收 | Agent 句柄删除→原字节、PDFium 重放无旧文 | 失效 ID 拒绝；页结构操作后 ID 失效 |
| [`image_search`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L643) | 否 | 是 | 无 | 待接 | 外部媒体服务待接 | 待验证 | 未验证 | 图像提取/烘焙/媒体回写未验收 |
| [`generate_image`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L656) | 是 | 是 | 无 | 待接 | 外部媒体服务待接 | 待验证 | 未验证 | 图像提取/烘焙/媒体回写未验收 |
| [`list_page_images`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L676) | 否 | 是 | 无 | 待接 | pdf.js 文字层 | 待验证 | 未验证 | 图像提取/烘焙/媒体回写未验收 |
| [`insert_image`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L690) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 图像提取/烘焙/媒体回写未验收 |
| [`transform_image`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L733) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 图像提取/烘焙/媒体回写未验收 |
| [`rotate_image`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L764) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 图像提取/烘焙/媒体回写未验收 |
| [`replace_image`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L785) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 图像提取/烘焙/媒体回写未验收 |
| [`flip_image`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L802) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 图像提取/烘焙/媒体回写未验收 |
| [`set_image_opacity`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L824) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 图像提取/烘焙/媒体回写未验收 |
| [`crop_image`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L845) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 图像提取/烘焙/媒体回写未验收 |
| [`remove_image_background`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L877) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 图像提取/烘焙/媒体回写未验收 |
| [`delete_image`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L897) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 图像提取/烘焙/媒体回写未验收 |
| [`list_form_fields`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L913) | 否 | 是 | 无 | 待接 | pdf.js 文字层 | 待验证 | 未验证 | 不暴露；执行器/读回未就绪 |
| [`apply_ops`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L919) | 是 | 是 | 页面菜单（子集） | 已接：3 种页面操作 | pdf-pages.ts（仅手动页面子集） | 共享 PDF 画布，两端同路径 | Agent 写入→pdf.js/pdf-lib 独立读回 | 整批原子校验；版本冲突/人工改动不回退 |
| [`insert_blank_page`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L943) | 是 | 是 | 插入空白页 | 待接 | pdf-pages.ts（仅手动页面子集） | 现有手动两端 | 页面测试；Agent 未验证 | 不暴露；执行器/读回未就绪 |
| [`set_page_size`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L959) | 是 | 是 | 纸型 | 待接 | pdf-pages.ts（仅手动页面子集） | 现有手动两端 | 页面测试；Agent 未验证 | 不暴露；执行器/读回未就绪 |
| [`crop_pages`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L976) | 是 | 是 | 裁剪 | 待接 | pdf-pages.ts（仅手动页面子集） | 现有手动两端 | 页面测试；Agent 未验证 | 不暴露；执行器/读回未就绪 |
| [`extract_pages`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L995) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 需把文件选择和新文件写入改为知识库路径 |
| [`split_pdf`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L1010) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 需把文件选择和新文件写入改为知识库路径 |
| [`split_pages`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L1025) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 需把文件选择和新文件写入改为知识库路径 |
| [`merge_pages`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L1037) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 需把文件选择和新文件写入改为知识库路径 |
| [`replace_pages`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L1059) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 需把文件选择和新文件写入改为知识库路径 |
| [`get_outline`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L1074) | 否 | 是 | 无 | 待接 | pdf.js 文字层 | 待验证 | 未验证 | 不暴露；执行器/读回未就绪 |
| [`set_watermark`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L1080) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 不暴露；执行器/读回未就绪 |
| [`set_header_footer`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L1108) | 是 | 是 | 无 | 待接 | 待接 GenOffice/PDFium 宿主 | 待验证 | 未验证 | 不暴露；执行器/读回未就绪 |
| [`create_document`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts#L1141) | 新文件 | 是 | 无 | 待接 | 库内新文件路径待接 | 待验证 | 未验证 | 不暴露；执行器/读回未就绪 |

## 内部编辑操作（26）

仅上游 `op-docs.ts` 中未标 `aiCallable: false` 的 8 项可经 `apply_ops` 给模型；其他项由专用工具或手动入口驱动。

| 操作和上游源码 | 改原件 | `apply_ops` 可调用 | Mimir 手动 | Mimir Agent | 共用执行器 | 两端可达 | 原件读回 | 失败状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [`addMarkup`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L21) | 是 | 否 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
| [`removeMarkup`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L26) | 是 | 是 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
| [`deleteSavedAnnot`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L32) | 是 | 否 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
| [`editSavedNote`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L37) | 是 | 否 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
| [`addDrawing`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L42) | 是 | 否 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
| [`removeDrawing`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L47) | 是 | 否 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
| [`setNoteContents`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L52) | 是 | 是 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
| [`moveDrawing`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L58) | 是 | 否 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
| [`setDrawingRect`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L63) | 是 | 否 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
| [`putTextEdit`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L70) | 是 | 否 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
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
| [`setFormValue`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L130) | 是 | 是 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
| [`rotatePages`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L138) | 是 | 是 | 旋转 | 已接（apply_ops） | pdf-pages.ts | 共享画布两端同路径 | Agent 写入→pdf.js/pdf-lib 独立读回 | 越界或版本冲突拒绝 |
| [`deletePage`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L144) | 是 | 是 | 删除页 | 已接（apply_ops） | pdf-pages.ts | 共享画布两端同路径 | Agent 写入→pdf.js/pdf-lib 独立读回 | 最后一页不删除；越界拒绝 |
| [`setPageOrder`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L149) | 是 | 是 | 移动/倒序 | 已接（apply_ops） | pdf-pages.ts | 共享画布两端同路径 | Agent 写入→pdf.js/pdf-lib 独立读回 | 非完整页序拒绝 |
| [`setStamps`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L157) | 是 | 否 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |
| [`setMetadata`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts#L162) | 是 | 是 | 无 | 待接 | 待接 GenOffice 执行器 | 待验证 | 未验证 | 不暴露直到真实执行与回读通过 |

## 上游手动命令入口

| 上游入口 | 命令与写路径 | Mimir 状态 | 读回 |
| --- | --- | --- | --- |
| `renderer/App.tsx:6000–6090, 6500–6560` | 编辑/插入文字和图片，`main/text-edit.ts`、`image-edit.ts` | 点击定位插入文字及待保存插字内容/字号/颜色/位置/删除已接；拖拽、对齐、替换原文与图片未接 | 插字手动改文→Agent 移动→保存由 pdf.js 读回；原文替换/图片未验证 |
| `renderer/App.tsx:6380–6490, 8200–8260` | 高亮、批注回复、绘图、涂黑、签名，`main/save-pdf.ts`、`redaction.ts` | 未接 | 未验证 |
| `renderer/App.tsx:6560–6685`, `FormLayer.tsx:60–190` | 静态表单标记和 AcroForm 字段，`main/save-pdf.ts` | 未接 | 未验证 |
| `renderer/App.tsx:6690–6855` | 旋转、删除、抽取、插入、替换、裁剪、纸型、倒序、拆分、合并 | 旋转/删除/插入/裁剪/纸型/倒序/移动已接；余项未接 | 页面几何部分测试 |
| `renderer/App.tsx:6290–6350, 8420–8470` | 查找、打印、导出图像、属性和图片浮动操作 | 查找已接；余项未接 | 未验证 |

## 宿主可行性探针

- 固定生产依赖 `@embedpdf/pdfium@2.15.1` 和 `harfbuzzjs@0.10.3` 同时写入 server 与 office 包；PDFium `dist/pdfium.wasm`、HarfBuzz `hb-subset.wasm` 在 `pnpm deploy --prod` 产物中均存在。
- Node 25.9.0 调用 PDFium `init({ wasmBinary, thisProgram: "mimir-pdf" })` 与 `_PDFiumExt_Init()` 成功。pdf-lib 生成 1 页 870 字节 PDF，PDFium `_FPDF_LoadMemDocument`/`_PDFiumExt_SaveAsCopy` 输出 1530 字节，pdf-lib 独立重开读到 1 页。只证明基础字节往返。
- 上游 `main/wasm-path.ts` 打包兜底使用 Electron `process.resourcesPath`；Mimir 的共享服务端以 `createRequire(import.meta.url)` 从生产依赖解析两份 WASM。server 生产构建及独立 `pnpm deploy --prod` 运行探针通过；桌面打包产物仍需实机验收。

## 验收夹具

| 类型 | 必须验证 | 当前 |
| --- | --- | --- |
| 普通文字/CJK/扫描件 | 文字位置、字体嵌入；无文字层须明确拒绝或 OCR 结果经确认 | 英文替换/插入经 pdf.js 读回；CJK、扫描件未验证 |
| 批注线程/图片/表单 | 修改后 pdf.js、pdf-lib、独立阅读器重新打开一致 | 未验证 |
| 签名/未知 Catalog | 保全或拒写，不破坏原件 | 页面重建拒写；PDFium 宿主对额外 Catalog（测试含 AcroForm）拒写；实际签名件未验证 |
| 切文档/停止/版本冲突 | 旧异步结果不误写，dirty 和回退准确 | Agent 版本冲突/整轮回退、手动异步人工改页拒绝旧结果通过；切文档/停止未验证 |
