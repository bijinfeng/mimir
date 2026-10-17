# PDF 涂黑副本宿主实现

2026-10-17。宿主片已实现，等待独立检查和 root 浏览器验收；不计为完整 PDF 工具已补齐。

## 参考与范围

按 `pdf-redaction-copy-next-20261017.md` 的固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` / 原生 `redaction.ts` 与真实 redaction tests 实施，vendor 未修改。WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 适用的是 capability 真实门控；不作为 PDF 原生写入或工具栏样式参考。未新增公开 Agent 工具、模型调用、路由、存储、依赖或环境键。

所有权与更改：

- `packages/shared/src/pdf-agent.ts`：向 strict `pdfLocalOperationSchema` 新增本地 `redact_copy`。
- `apps/server/src/services/pdf-redaction-copy.ts`：新窄服务，全批预检、原生真移除、全对象可达性清理与完整重序列化、独立 pdf.js 可读性校验。
- `pdf-local.ts`：在通用 `infoOf` 与保留结构 guard 之前派发专用服务；只返回 outputs。原通用 guard 未放宽。
- `routes/conversations.ts`：既有 `/pdf-agent/local` 仅穿透 request signal；保留原鉴权、上传限额与返回前取消检查。
- 新 `pdf-redaction-copy.test.ts` 与 `pdf-redaction-copy-route.test.ts`；既有 `pdf-local-route.test.ts` 作为 dispatch 回归。

## 精确接口与版本

```ts
{op:'redact_copy', regions:[{pageIndex:0, rect:[left,bottom,right,top]}]}
```

所有对象 strict；pageIndex 是 0–999 整数，rect 是有限且 left<right/bottom<top 的 PDF user space（Rotate 之前坐标），1–100 区域。源 1字节–50MiB，页数 1–1000；页数×区域数≤10000 限制原生每区域全页共享图片预检。预检全部页号及 MediaBox∩CropBox 边界、四个 Rotate，拒绝越界而非 clip，拒绝 F32 下退化为空的矩形和自定义 UserUnit。

返回恰为 `{outputs:[{name:'document-redacted.pdf',bytes}]}`，不带工作 bytes/info；既有 HTTP 序列化自然返回相同 expectedVersion，不产生 dirty/history、不调用存储保存。任一失败或取消均不返回 output。signal 在开始、原生前/后、独立检查期间与返回前验证；WASM 执行中不支持抢占，但迟到结果仍拒绝返回。

## 安全边界与发现

严格沿 `assertSafeToRewrite`，Catalog 仍只 Type/Pages；AcroForm、Outlines、标签、未知结构及加密仍拒绝。增加所有间接对象的 Type Sig / FT Sig / ByteRange 拒绝，覆盖未挂在 AcroForm 的签名。

真实 PDFium 失败复现并修复了两个不能只靠“黑块+提取文字为空”发现的残留：

1. 原生移除命中根批注后，区域外 reply 的 IRT / Popup 的 Parent 仍使根 Contents `SECRET-ROOT` 可达；普通不可达对象 pruning 无效。现专用预检扫描全部对象关联（包括未列于 Annots 的节点），命中图涉及关联批注即整批拒绝；简单无关联命中批注仍由原生真正移除。
2. 原生重写正文仍保留 Resources.Properties 的 `ActualText(SECRET-PROPERTY)`。现目标页与继承页树只接受明确页属性；资源图递归拒绝 Properties/ActualText/Alt/Metadata/PieceInfo/OPI/AF/Mimir* 旁路缓存。目标页 MimirDrawings/Watermark/HeaderFooter 和私有属性明确拒绝，不静默下载仍能由缓存重建的副本。

资源递归最多128层/100000对象。遮罩、图案/着色、透明页 Group 等尚无完整真移除证明，当前明确拒绝；共享图片、含图 Form、相交 Widget 沿原生预检拒绝。普通纯文字 Form 已有全流真移除证据。

这是选中区域内容移除，不是全部隐私元数据清洗。Trailer Info 仍保留，非目标页和区域外内容保持；不承诺清除用户在独立文档属性里填写的相同信息。复杂结构继续列为限制，不宣称所有 PDF 均可涂黑。

## 原件与独立验证

专项真实 PDFium / pdf.js / pdf-lib 全部间接对象、所有可解压流及原始输出 bytes 扫描：

- `PUBLIC SECRET PUBLIC` 中间内容消除，非目标文字和第2页保留；字体编码的 `534543524554`、原注释流 sentinel、未引用 orphan 流均不在输出。
- inline ActualText 与简单命中批注 Contents 消除；普通纯文字 Form 中目标文字原 stream 不保留。
- 唯一8×8 RGB图像左4列红像素被真改为白，右4列蓝像素逐字节精确保留；全部输出只剩唯一图像，无原红像素 stream。
- 两个独立区域同时消除；尾部非法区域/共享图片/图 Form/Widget/缓存/未知Catalog/签名/处理预算/取消均无输出。
- 0/90/180/270 Rotate 配 offset CropBox 的 user-space 区域实际消除目标，越界不剪裁。
- HTTP测试原账号鉴权、固定version19、outputs-only、非法strict字段/素材/尾部页号拒绝；下载库原件 bytes 与输入精确相同。

本地浏览器夹具（未上传/未删除）：

- `/tmp/mimir-pdf-redaction-20261017.pdf`，4页/3583bytes。
- `/tmp/mimir-pdf-redaction-20261017.json`：真实区域、保留内容、90°+offsetCropBox清单。
- `/tmp/mimir-pdf-redaction-native-20261017.pdf`：同宿主生成的三目标涂黑副本。
- `/tmp/mimir-redaction-native-verification-20261017.json`：源/输出字节数、4页真实文字、图像与7项检查。
- 夹具p1 SECRET-TEXT-7821 / p2唯一红蓝图左半 / p3 ROTATED-SECRET / p4原文保持；可供 root 实际 pointer、宽420、下载和光栅验收。

## 门禁

- Server专项 `pdf-redaction-copy.test.ts`、`pdf-redaction-copy-route.test.ts`、既有 `pdf-local-route.test.ts`：最终3文件16/16。
- Server + shared `tsc --noEmit` 通过。
- 6个目标文件 `oxlint`、`oxfmt --check`、目标 `git diff --check` 通过。
- 未跑全Office、Web build、完整仓库check；未提交/暂存/归档/删除测试文件。

上述门禁不替代独立 checker、真实浏览器UI或原件光栅验证，后者由 root 继续。
