# PDF 本地临时 OCR：批准范围与可实施方案

2026-10-17，root。用户已明确选择“包含，按建议补本地 OCR”，本计划属于已授权工具补齐。product.md §1 已记录窄例外；目前仅研究，不宣称实现或真实识别通过。

## 1. 版本与具体证据

主要对标固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`：`apps/pdf/src/main/ocr.ts` 使用 macOS Vision/Windows.Media.Ocr；`renderer/ocr-layer.tsx` 提供字符/词框、置信度、透明可选中文字与会话搜索索引，按 PDF 用户坐标保存再投影；`App.tsx:1888–1939` 从当前页起顺序扫描。不存在扫描结果写回 PDF 或知识库索引的合同，Linux engine 也未建立。系统 helper 不能直接成为浏览器部署方案。

按项目 AGENTS 本次重新核对 WeKnora 官网与公开源码，固定 v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`。官网 HTTP200/113529bytes/SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`；`internal/agent/tools/definitions.go` HTTP200/13533bytes/SHA256 `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`。其 backend 实际能力门控可借鉴，不提供本地浏览器OCR选字几何或Office工具栏，不作为本片主参考。

已从官方 npm registry 读取实际 tar 源码/目录，未执行或安装：

- `tesseract.js@7.0.0`，Apache-2.0，已发布于2025-12；tar616435bytes/SHA256 `9a93bf51c3387f945d10a24bf8b3a4bf2e45c7c7161b8242aafbaf9d3c4b606a`。`src/index.d.ts` 有 `createWorker(langs,oem,options)`、`recognize(image,opts,{text:true,blocks:true})` 和 word/symbol bbox+confidence；7版默认只回text，必须显式blocks。
- `@tesseract.js-data/eng@1.0.0`，MIT，实际 `4.0.0_best_int/eng.traineddata.gz` 2952873bytes；该包还含较大非int模型，不能整目录复制。tar SHA256 `c9bddf2e2f0a214ac7918f3f4a3caf45e09ce8674fe26662ae7787ac8927f7bb`。
- `@tesseract.js-data/chi_sim@1.0.0`，MIT，实际 `4.0.0_best_int/chi_sim.traineddata.gz` 1718768bytes。tar SHA256 `850d4a217c87808ef765385cbe5825f4ae99047a49b17e024069ceb663f01c33`。
- `src/worker/browser/defaultOptions.js` 默认 workerPath 指向 jsDelivr；必须显式覆盖 worker/core/lang 路径为同源打包资产，不使用默认CDN、远程图片或用户文件传输。
- `src/createWorker.js` 在 load+language+initialize 后才返回 Worker；`terminate()` 只终止worker，不结算已挂起的promises。包装必须处理初始化期间取消、超时和promise收尾，不能仅在 recognize 后finally terminate。实现可选外层受控Worker并核实子worker销毁，或经源码证明的更小取消接缝；不得泄漏后台识别。

缓存 `/tmp/mimir-pdf-ocr-research-20261017/` 中有各文件目录/README/API/types/createWorker/defaultOptions、官网及definitions原文。`tesseract.js-core@7` 的准确 WASM 变体/许可/大小仍需实施前读取实际包证明，不猜通用文件名。

## 2. 最小真实能力与边界

浏览器本地 WASM，中英混合（eng+chi_sim），显式“识别扫描文字”动作。支持当前页与顺序识别本文件扫描页、进度/停止/重试/清除临时结果；文字层已有内容的页保留原生文字，不复制叠加。先当前页再其余扫描页，单worker串行，严格总页/像素/字数/时间预算并明示具体限制，不无界自动后台扫描。

输出仅当前编辑器会话复制与搜索。原PDF字节、文件版本、dirty/history、保存基线及KB索引全不变。识别结果不调用模型/服务端上传，不写 localStorage/IndexedDB 文本或原件；引擎静态语言资产可浏览器缓存。关闭/换源释放OCR worker与结果；重开应重新显式识别。

OCR结果来源必须可辨、提醒可能识别有误。不能把OCR合成文本当成已核验 PDFium 原文对象交给 edit_text、block writer、markup 或redaction。保留 nativeTextIndex 给原文选择/块管理，单独产生 search/read-only text overlay；若为Agent read_pages/search_text返回临时文字，必须携带OCR provenance，不能因此自动启动付费/模型路径或给原文编辑target授权。

## 3. 几何、生命周期与界面

复用现有 loadPdfDocument/pdf.js 渲染与实际页面来源（含导入页），位图最大长边约2048且严格像素预算，不依赖浏览器屏幕截图。recognize真实word/symbol boxes，不按字符串长度伪造“精确字框”。位图bbox经同次viewport.convertToPdfPoint的四角转PDF用户坐标，再由当前viewport投影；四Rotate/offsetCrop/未保存rotate/zoom/导入/调序都须验证，不能混raw显示页号和source index。

结果绑定不可变bytes身份、source页号、识别源几何；相同原件页旋转可重新投影不重新识别。换源/真正内容写入/删除对应页/会话销毁单调取消旧结果，旧回调不能覆盖新文档；纯搜索与复制不升编辑版本。pending结构与文字至少按实际当前画面渲染合同处理，不悄悄物化或丢pending。

沿现有PDF Ribbon（阅读/查找相关入口）与320px Inspector，正文内部滚动、固定一个primary、进行中变明确停止；不用整页/全宽表单。当前页/范围、语言、进度、识别结果/复制按钮易读，窄420×500当前动作始终可见；原文编辑模式与OCR选字模式互斥，透明overlay不能拦截图片/表单/画笔/签名常规操作。Escape逐层取消并回可见入口，失败保留可重试状态。

## 4. 实施文件与所有权

预计新 `packages/office/src/editors/pdf-ocr*.ts`、OCR overlay/controls组件与局部CSS、专项tests。`packages/renderer/vite-preset.ts` 新同源资产复制插件和 `package.json`/pnpm lock/ignore为离线资产接缝；复用pdfjs复制范式，保留engine与data许可，兼容BASE_URL与Desktop共同preset。不新建OCR服务端API或全局provider。

`PdfEditor.tsx`/`pdf-text.ts`/必要agent read-only索引接缝由该片单一owner，须在外部图片和文字params owner释放后顺序集成。可先独立实施worker/asset/helper/components，但不得并写共享Editor/catalog/conversations。若npm包需要新增精确依赖，沿仓库minimumReleaseAge，不加新版本例外；当前研究版本均已满等待期。

## 5. 验收门槛

真实本地引擎（非mock）识别至少中英混合扫描PDF，多行/空白/不同旋转和offsetCrop；独立核PDF.js确定原件无文字层。真实浏览器可拖选复制并搜索找到、翻页定位，截图核高亮/透明文本与位图对齐，100/150%与420×500；识别后原件/导出字节精确、无保存按钮dirty/版本/history增长、重新打开无session结果。

专项覆盖超预算/坏asset/worker初始化失败/超时/取消（包括初始化中）/换源与迟到/多页顺序/原生文字不重复、中文无误插空格、换行匹配、范围与导入页面身份。生产构建实际同源worker/core/lang全200正确MIME、BASE_URL子路径可用、无jsDelivr/tessdata网络请求；验收不以CI mock通过取代真实WASM。root统一重型构建、正式独立check及浏览器截图；不commit/stage/archive/delete测试件，Desktop用户自验。
