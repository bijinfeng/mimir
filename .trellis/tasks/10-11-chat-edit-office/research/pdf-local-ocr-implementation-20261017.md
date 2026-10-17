# PDF 本地临时 OCR 实施交付

2026-10-17，正式 trellis-implement 子代理。范围依据同目录 `pdf-local-ocr-next-plan-20261017.md` 与用户明确批准；这里只交付本片，不能据此宣称所有 Office 工具完成。

## 实施

- `pdf-ocr-worker.ts` 包装固定 tesseract.js 7 内部 worker 协议，直接拥有原生 Worker。初始化、加载语言、识别均有 promise 收尾；停止、错误、超时会真正 terminate 并拒绝所有未完成 job，避免 createWorker 尚未返回时无法终止以及 terminate 不结算 promise 的问题。
- `pdf-ocr.ts` 私有 canvas 从实际来源 PDF 页渲染，最长边 2048 / 4,194,304 像素；引擎读取 PNG 字节，保留实际 symbol/word bbox、置信度与 local-ocr 来源。按同一次真实 viewport 转成 PDF 用户坐标四角，再向当前页面旋转/缩放投影。识别采用原页 canonical rotation0，使用户旋转只重新投影；不是照片任意方向识别承诺。
- `use-pdf-ocr.ts` 管理当前页 / 当前页优先顺序扫描，单 worker 串行复用。每次最多50页、10分钟、临时总文字100,000字符，整页准备+渲染+识别有120秒预算。跳过原生文字页、已识别来源与无来源空白页。停止保留已完成结果，清除/换源/销毁取消；删除的来源页移出结果。文档ID与不可变工作字节是会话身份，导入/调序/旋转按实际来源匹配。
- `PdfOcrControls` 复用320px Inspector，body内滚，footer固定一个开始/重试/停止 primary；中英能力、临时性、错误可能性、限制有明确说明。当前页可复制，或显式进入 `PdfOcrOverlay` 的真实字框 SVG 选择层；与插字、原文编辑、绘图、签名、表单等模式互斥。
- `PdfEditor` 仅将结果加入手动 Find 的只读搜索，不混入 nativeTextIndex。原 `read_pages` / PDFium 写入目标继续只读原生文字；没有将 OCR 字框授权为 edit_text/markup/redaction/段落写入目标。OCR不触发模型、服务端上传、KB索引、localStorage/IDB 文档存储、dirty/history/version/保存。

## 离线资产与依赖

精确依赖：`tesseract.js@7.0.0`、`tesseract.js-core@7.0.0`、`@tesseract.js-data/eng@1.0.0`、`@tesseract.js-data/chi_sim@1.0.0`，均已过仓库一天等待期，未添加发布年龄例外。tesseract.js唯一postinstall为opencollective捐赠提示，明确 `allowBuilds: false`；离线 frozen install成功。

`copyPdfOcrAssets` 与既有 `copyPdfjsAssets` 同在 `renderer/vite-preset.ts`，浏览器与Desktop共用preset。最初独立TS helper的`.js` import在Vite native config真实构建失败，已内联修复；Node native import preset+调用资产hook已真实通过，root将统一重建。

最终约8.5 MiB资产：`pdf-ocr/{worker.min.js,tesseract-core-lstm.js,tesseract-core-lstm.wasm,lang/eng.traineddata.gz,lang/chi_sim.traineddata.gz}`与许可/notice。选择外置WASM的便携LSTM core，避免把已内嵌base64的`.wasm.js`与`.wasm`重复分发，也不额外携带SIMD/legacy版本。worker与core/wasm同目录是实际Emscripten `self.location`解析所需。路径服从BASE_URL，不使用默认CDN；语言cacheMethod:none，纯静态HTTP缓存仍可用。

保留原npm Apache2许可、两个语言包原package.json/README(MIT metadata/作者)及实际tessdata_best Apache2 LICENSE。后者取自 `https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_best@main/LICENSE`，SHA256 `a6cba85bc92e0cff7a450b1d873c0eaa2e9fc96bf472df0247a26bec77bf3ff9`；不虚构版权信息，不把npm metadata当成traineddata原许可替代。

## 已运行证据

1. Office 专项5文件 **27/27** exit0（OCR17项+既有native content10项），`/tmp/mimir-pdf-ocr-final-target.log`。覆盖真实控件、固定footer主动作、copy overlay/查找命中、native read_pages隔离、字节/版本/dirty/history/save不变、关闭迟到、四Rotate与offsetCrop/zoom、真实框无伪造字宽、序列/跳过/复用/删源/停止/清除/重试/预算/初始化取消与超时。
2. renderer真实资产复制 **1/1** exit0，`/tmp/mimir-pdf-ocr-assets-test-final.log`。核确切文件清单、真实WASM魔数、两语言gzip魔数/大小、版本/notice、许可，没有模拟资产或嵌入WASM重复包。
3. **真实本地WASM，非mock**：官方Node worker+固定本地中英语言识别混合PNG，358ms、confidence89、21words/39symbols；文字包括 `Mimir Office OCR 2026` 与中文测试。`/tmp/mimir-pdf-ocr-wasm-smoke-20261017.log`、`...wasm-result-20261017.json`。
4. **自己的worker协议包装器+真实Node Worker**识别512ms；初始化中取消与识别中取消均正常reject，两个底层worker真实exit。`/tmp/mimir-pdf-ocr-protocol-smoke-20261017.log`。Node transport仅把同源language路径映射至本地测试资产目录，不冒充浏览器网络验收。
5. fixture `/tmp/mimir-pdf-ocr-mixed-20261017.pdf`（29KB）：四张同源扫描图片页Rotate0/90/180/270、CropBox `[20,30,620,400]`，第五页空白。独立PDF.js确认五页nativeItems全0：`/tmp/mimir-pdf-ocr-fixture-native-20261017.log`。图片 `/tmp/mimir-pdf-ocr-mixed-20261017.png`。
6. scoped format check通过；scoped oxlint无产品错误，但worker独占onmessage/onerror与postMessage自定义transport有5项建议警告，测试另有consistent-function-scoping建议；不抑制规则。Office tsc最近只剩其他owner正在修改的DOCX forms测试类型错误；root统一门禁必须重跑，不冒称全仓green。

## 待root正式验收

- 生产构建/独立 trellis-check（真实native config入口已修复，但本代理不抢root重型构建）。
- 已告知root一个小交互风险：顺序识别中已有当前页文字时，“在页面上选字”目前可进入选择但不主动停止扫描，可能隐藏进度/停止控件；为保护root已经开始的生产构建冻结，交由独立checker在该入口stop或禁用进行中选字，并重验。
- 真实浏览器同源worker/core/wasm/lang正确MIME，无jsDelivr/tessdata外网请求；BASE_URL子路径运行。
- 上传上述fixture，当前/顺序识别、100/150%和四Rotate/crop下搜索与拖选复制真实对齐；420×500 Inspector主动作/内部滚动/Escape/焦点，关闭/停止/重开结果不复活。
- 识别后真实原件/导出精确、保存无dirty，重新打开无结果；Desktop由用户自行验收。没有声称实际模型调用或Desktop通过。

源码/配置已于本报告交付前冻结，不再修改父代理当前浏览器验收使用的入口；如发现具体问题，由root协调一次修复再重新冻结。
