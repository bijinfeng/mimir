# PDF 涂黑副本宿主独立复核（2026-10-17）

## 范围与结论

独立读取 `pdf-redaction-copy-next-20261017.md`、`pdf-redaction-copy-host-implementation-20261017.md` 与对应 shared schema、专用服务、local dispatch、鉴权路由、原生 vendor writer、对象图清理及专项测试。固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 为本片已有原生参考；WeKnora v0.8.3 只适用于 capability 真实门控，不充当 PDF 写入或外观依据。

**未发现当前已承诺宿主范围内需修复的确定 production 问题；未改 production 或 tests，已冻结交给根会话真实浏览器验收。** 不涉及 PdfEditor／面板或 DOCX，也未放宽安全白名单。

## Findings (fixed)

无。下述专项、静态、类型与独立原生证据通过后，无需扩大修改。

## Findings (not fixed)

- `.trellis/spec/shared/contract/pdf-agent.md` 开头仍称“不代表涂黑”，缺少本次仅本地 `redact_copy` 合同。已通知根会话统一同步：只产出副本、同版本、不发布工作 bytes、不自动保存；当前不加入公开 Agent 目录。此为规范待同步，不是宿主行为缺陷。
- 客户端区域坐标、版本身份守卫、Escape／关闭／切文档、重复提交与实际下载生命周期仍由 PDF UI 所有者和根会话验证，本报告不代替该门禁。
- Trailer Info 与其他独立文档属性保留，选区外内容保留；这是当前产品范围。没有把副本导出扩展为全文件隐私元数据清洗，也不把同一信息在选区外另存的合法副本作为本次未实现项。
- 原生 WASM 不支持执行中抢占；服务在进入前、原生完成后、独立读回期间和返回前重新检查 signal，取消不会发布 output。该已说明限制保留。

## 实际路径核对

- schema 外层／区域对象 strict；1–100 区域、pageIndex 0–999 整数、finite 且正序非空矩形。服务再次 parse，输入 1 字节–50MiB，1–1000 页，页数×区域数≤10000。
- 全部区域先核验页号、四 Rotate、UserUnit=1、MediaBox∩CropBox 边界和 F32 非退化，再调用原生；不静默 clip。native writer 也先完成所有区域的共享图片／含图 Form／Widget 预检，再进行任何修改。
- Catalog Type/Pages 旧守卫未放宽；所有间接对象独立检查 Sig/FT Sig/ByteRange。目标页／继承页树接受明确键；资源图递归检查 Properties、ActualText、Alt、Metadata、PieceInfo、OPI、AF、Mimir*、遮罩与图案，含深度／对象预算。批注图扫描包含未列于 Annots 的间接对象，命中 IRT／Parent／Popup 关联即拒绝。
- vendor 使用真实 `_EPDFAnnot_ApplyRedaction` 移除后才加黑框，非盖框伪装；后续从 trailer 根清除不可达对象，并完整 save 禁用 object streams。独立 pdf.js 再读目标页 operator list／文字和总页数。
- dispatch 恰为 outputs，不带工作 bytes/info。路由保持 expectedVersion，输入 signal 穿透及返回前再检查；服务没有存储调用，普通下载原件与输入字节精确相同。未新增公开 Agent 工具。

## 独立原生／像素证据

此次独立运行的 tests 真实执行 PDFium；验证包含全部间接字典、所有可解压流及原始输出，不只检查提取字符串：

- 中段文字、原字体编码 hex、旧流 sentinel 与 orphan 流消除；邻文／非目标第2页保留。
- inline ActualText、简单命中批注、普通文字 Form 的原内容从全部对象／流移除；批注回复／Popup、资源 Properties 缓存与 Mimir 页面缓存拒绝。
- 唯一 8×8 RGB image 左4列原红像素实际改成白色，右4列原蓝像素逐字节保留；全输出只有1个 image stream，原红像素副本不残留。共享图片／含图 Form／相交 Widget 原子拒绝。
- 四 Rotate 配 offset CropBox 实际涂黑；非法尾区域、预算、签名、未知页面／Catalog 结构和 preparation abort 均无输出。

额外独立最小程序 `/tmp/mimir-redaction-independent-check.mts` 构造同一文字 Form 在同页两处／另一页再复用，只选其中一处；结果未选实例仍各保留完整原文，排除简单共享 Form 被连带更改的具体风险。未因此添加无必要产品分支。

对实现者生成的4页真实夹具输出 `/tmp/mimir-pdf-redaction-native-20261017.pdf` 使用独立 Poppler `pdftoppm` 重新渲染并逐页目视，结果 `/tmp/mimir-redaction-check-render-{1,2,3,4}.png`：p1黑区、PUBLIC/KEEP及相邻行；p2左半黑区和右半蓝像素；p3 90°+offsetCrop下黑区和 ROTATED-PUBLIC；p4 UNTOUCHED PAGE FOUR 全部正常。命令有 Fontconfig 配置提示，但退出0，四张图完整可读。原始像素移除证据来自前述全 image stream 解码断言，目视黑框并非唯一依据。

## Verification

- **Tests: pass，3文件16/16**：`pnpm --filter @mimir/server exec vitest run src/test/pdf-redaction-copy.test.ts src/test/pdf-redaction-copy-route.test.ts src/test/pdf-local-route.test.ts`。
- **TypeCheck: pass**：`pnpm --filter @mimir/server typecheck`、`pnpm --filter @mimir/shared typecheck`。
- **Lint: pass**：shared schema、专用服务、local dispatch、route与两新tests共6目标 oxlint。
- **Format: pass**：同6文件 oxfmt check；tracked目标 diff check通过。
- 未跑 full Office、Web build／全仓门禁；未暂存、提交、归档、上传或删除测试文件。全仓既有无关 skill-script lint 基线不记为本片已绿。
