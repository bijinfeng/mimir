# PDF 外部图片工具实施报告 — 2026-10-17

状态：实现完成并冻结本 slice 的生产文件，交根会话独立检查和真实浏览器验收。没有真实外部供应商调用或模型配置；没有生产知识库上传、删除、stage、commit、归档、vendor改动、OCR/文字参数/数字证书实现。

## 行为与边界

- 共享 `pdf-agent.ts` 严格定义 image_search/query/max_results（1–10、默认8）和 generate_image/prompt/aspect_ratio（固定8值、默认auto）；未知键拒绝。
- PDF专用client assetTool分支先于内容写入执行：不需要页号、不读PDFium、不物化待保存页面/插字、不captureState或建round checkpoint，不改dirty/version/history/bytes。Stop、dispose、任意手动/Agent版本推进取消进行中的素材请求；迟到响应再核验handle/version/signal。
- 鉴权 JSON `GET/POST /api/conversations/pdf-agent/assets` 对真实PDF检查；POST流式累计16KiB后才JSON解析。prepare只返回原请求version与data，无PDF字节。独立实际readiness反映Brave和图片配置；目录改async并更新直接调用的旧测试。
- 使用既有Brave及统一图片SDK/记账；可选signal/aspectRatio保持现有DOCX/PPTX默认不变。调用signal传入Brave fetch、SDK abortSignal、受限远程下载的Node request（保留DNS pin/SSRF/redirect/time/8MiB限制）。
- gpt-image横/竖映射1536×1024/1024×1536，DALL-E3为1792×1024/1024×1792，正方1024×1024，auto保持默认；DALL-E2非正方形明确报错。返回实际PNG/JPEG解码宽高/actualRatio与requestedRatio，不冒称精确任意比例。WebP不能给PDF插入，明确拒绝。
- 私有 `PdfAssetRegistry` 返回mimir-generated UUID引用，绑定真实principal+document+源session，TTL20分钟，全局8项/64MiB，单principal/session4项FIFO；严格ref匹配、双向克隆、过期/驱逐清理。失败原生插入不消费引用。
- 原native images路由只在可信multipart传输assetSessionId，精确解析私有引用并创建本地base64操作；普通URL仍受限HTTP(S)下载。未放宽原生Catalog/AcroForm/目标守卫。
- 为手动真实预览新增鉴权 **POST** `/pdf-agent/assets/preview`（严格doc/session/ref，no-store/nosniff PNG/JPEG响应），无公开GET或静态地址。Agent结果不携带base64；浏览器用Blob URL展示并释放。
- 原320px Image Inspector增加上传/搜索/生成来源切换。搜索真实缩略图、生成真实比例预览、等待/取消、失败、空结果、配置不可用/重查、选中态可见。外部来源只有一个固定底部插入/替换主按钮；现有滚动内容区承载长表单，无工具栏额外一行。设置跳转由renderer导航且通过既有未保存守卫。Inspector关闭/Escape沿既有回焦实现。

## 文件责任

新增：

- `apps/server/src/services/pdf-external-assets.ts`
- `apps/server/src/test/pdf-external-assets.test.ts`
- `apps/server/src/test/pdf-external-assets-route.test.ts`
- `packages/office/src/agent/pdf-asset-agent.ts`
- `packages/office/src/agent/pdf-asset-agent.test.ts`
- `packages/office/src/editors/PdfExternalImageSource.tsx`
- `packages/office/src/editors/pdf-external-images.css`
- `packages/office/src/editors/PdfEditor.external-images.test.tsx`

最小接缝修改：

- shared `pdf-agent.ts`；server `pdf-agent-catalog.ts`、`pdf-images.ts`、`routes/conversations.ts` PDF路径；Office `pdf-agent.ts`、`pdf-image-agent.ts`、`PdfEditor.tsx`、`PdfImagePanel.tsx`；renderer `api.ts` PDF方法及`OfficeSourceEditor.tsx`。
- 共用服务 `docx-image-generation.ts`（可选signal/aspect）、`docx-brave-search.ts`（可选signal）、`docx-image-fetch.ts`（可选signal）；现有DOCX/PPTX调用参数/默认输出保持。
- 相关旧测试 `pdf-agent-catalog.test.ts`、`pdf-agent-route.test.ts`、`pdf-text-block-route.test.ts` async适配；generation/Brave测试追加新合同。
- `.trellis/spec/shared/contract/pdf-agent.md`新增§16并更新Scope指针。

## 已执行验证

1. Server targeted **8文件34/34通过**，日志`/tmp/mimir-pdf-assets-server-final2.log`：
   `pnpm --filter @mimir/server exec vitest run src/test/pdf-external-assets-route.test.ts src/test/pdf-external-assets.test.ts src/test/pdf-agent-catalog.test.ts src/test/docx-image-generation.test.ts src/test/docx-brave-search.test.ts src/test/docx-image-fetch.test.ts src/test/pdf-agent-route.test.ts src/test/pdf-text-block-route.test.ts --maxWorkers=1`
   覆盖scope/TTL/FIFO/真实clone、严格参数/count/ratio、readiness两组合、鉴权/格式/16KiB/无库存写、私有预览及实际native insert/replace（保留footprint/layer）、PNG/JPEG解码边界、取消、原生未知Catalog拒绝、独立PDF.js图像和文字读回。
2. **真实本地Node HTTP断连**而非仅`app.request`：测试临时serve actual `app.fetch`、测试账号cookie、provider mock等待signal；HTTP fetch abort后provider signal实际触发。无外部调用。测试在上述34项内。
3. Office targeted **4文件15/15通过**，日志`/tmp/mimir-pdf-assets-office-final2.log`：`PdfEditor.external-images`、`pdf-asset-agent`、旧`pdf-agent`、旧`PdfEditor.images`。最后readiness生命周期调整后单独重跑external-images **4/4通过**，`/tmp/mimir-pdf-assets-ui-final.log`。
   - 纯准备含pending页面/插字时不调用content/index/capture且不变版本/dirty/history；manual edit→Undo版本、Stop/dispose迟到均拒绝。
   - 手动生成预览不dirty/不产生历史，只有一个固定主按钮；真实native插入→保存→Undo保存为**精确原始字节**→Redo保存为**精确插图字节**；未配置、空结果、关闭取消晚回包。
4. **Office、server、renderer tsc均最终exit0**：`/tmp/mimir-pdf-assets-office-ts-final2.log`、`/tmp/mimir-pdf-assets-server-ts-final2.log`、`/tmp/mimir-pdf-assets-renderer-ts-final.log`。之前XLSX owner并发中暂态错误已在最终重新验证消失。
5. 所有本slice TS/TSX目标`oxlint`无错误/警告：`/tmp/mimir-pdf-assets-static-final.log`；目标文件oxfmt完成；`git diff --check`干净；`node scripts/check-style-backticks.mjs`通过。
6. 按antd skill查Input/Button/Segmented API及demo；antd lint两个UI文件0 issues（`/tmp/mimir-pdf-assets-antd-lint.json`及终端检查）。impeccable context选择保留现有Operate Inspector，已读craft floor。

## 根会话浏览器接手

### 现有真实服务（未配置状态）

- 可直接使用已有可编辑PDF，`编辑 → PDF图片工具 → 搜索/生成`。应看到来源分段控件、具体不可用说明、“前往设置/重新检查配置”；准备和底部按钮禁用，Save/Undo仍保持原状态。
- 宽屏和实际420×500测Inspector320px/覆盖层、内容内部滚动、底部主按钮完整、长原因换行、无页面横溢出、Escape回到实际可见来源组。组件420px样式**不等于**真实420×500验收，尚未替根会话声称完成。
- 供应商缺配置不阻塞其余编辑；生成/搜索失败不能显示空结果或“已修改”。

### 稳定本地素材

- `/tmp/mimir-pdf-external-assets-fixture-20261017.pdf`：1108字节、400×500单页、`PDF EXTERNAL IMAGE QA`原文、120×60pt蓝色原生图；适合选图/替换/保存读回。
- `/tmp/mimir-pdf-external-assets-source-20261017.png`：76字节、4×2蓝图。
- 上述仅本地写出，**未上传**。若现有PDF已足够无需再上传。

### 安全明确的mock路径

仅测试文件`PdfEditor.external-images.test.tsx`局部注入hostAssets/hostAssetReadiness/hostAssetPreview（内存PNG/Blob，无密钥），native仍真实`applyPdfImageOperation`。Server route tests仅vitest模块级mock供应商，实际PDF routes/鉴权/native/本地HTTP仍执行。没有生产mock端点、secret注入或自动配置供应商。重跑上述目标测试即可复现正向选择→插入/替换→保存历史路径；真实浏览器本轮只能如实验未配置状态，若需要浏览器视觉mock应明确仅临时fixture挂载、不得改生产路由/配置。

## 风险及后续

- 仍需独立checker及根会话真实浏览器宽屏/420×500验收。没有真实provider、Agent模型续轮、Desktop成功证据，不能把mock称为真实生成。
- 私有registry进程本地；负载均衡切进程可能显示过期/不可用并需重新生成，未引入分布式保存。迟到断连已分配ref会在预算/TTL内清理。
- 搜索缩略图从公开结果URL由浏览器加载（no-referrer/lazy）；真正插入仍经服务端SSRF下载/PNG-JPEG完整校验，因此缩略图显示不保证下载或原件可安全写入。
- 图片准备不扩大原生PDF安全范围；某些AcroForm/未知Catalog仍不能native插入/替换，失败保持原件。
- OCR已由根会话新授权另行规划；本slice未改OCR、文字参数、markup/insert行为。数字证书不是当前固定GenOffice已证明能力。

来源沿已批准`pdf-external-images-next-plan-20261017.md`：GenOffice固定`480548fd55f1be3593ee0d8e316a734751d58309`为图片行为主参考；WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`仅适用于真实配置可用性门控，不拿Markdown工具栏代替Office。当前实施没有重新开展外部研究或改变该参考边界。
