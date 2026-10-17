# PDF 视觉签名 S1 独立检查

日期：2026-10-17。角色：正式 `/root/pdf_signature_check`，直接检查与局部自修，未派生子代理。范围依据 `pdf-signature-plan-20261017.md` 与 `implement.md` S1 批准段；未改 DOCX、vendor、模型工具目录或通用 PDF 页面几何。

## Findings (fixed)

### 1. 公开 local 工具参数可绕过签名 manual 门控

- 文件：`packages/office/src/agent/pdf-local-agent.ts`。
- 问题：`{op:tool,...args}` 允许 `args.op` 覆写入口名称。实际 Editor 调用 `set_metadata({op:'add_visual_signature',...})` 会成功写入并推进版本，虽然签名操作应只允许 manual。
- 修复：规范入口 op 最后写入，额外签名参数由对应 strict schema 拒绝；未重构 catalog。新增实际 Editor 回归验证拒绝、零 dirty/版本/保存。合法 local/default、manual 签名及原工具由目标套件继续覆盖。
- Before-red：`/tmp/mimir-signature-check-manual-before.log`。

### 2. 保存开始后未应用的定位草稿仍存在

- 文件：`packages/office/src/editors/PdfSignatureCanvas.tsx`。
- 问题：签名 identity 带 saving，但比较函数遗漏；实际 Editor 中先旋转页面、准备签名，再开始延迟保存，定位 overlay 仍保留。
- 修复：把 saving 纳入 identity；保存开始即清草稿并取消请求，完成后不复活。实际 Editor 回归验证只保存原页面改动、不产生签名；页面物化保存本身仍按既有合同推进一次版本。
- Before-red：`/tmp/mimir-signature-check-editor-before.log`。

### 3. 可重算公开 hash 的 native 伪造仍可被认作自有 Ink

- 文件：`apps/server/src/services/pdf-visual-signatures.ts`。
- 问题：AP 已严格验证，但 C、BS.S 与源不一致，或源 stream 字典增加非 writer 字段后，只要重新计算公开 hash，仍会被列作可编辑对象。其他阅读器重绘 InkList 时可能使用不同颜色/边框。
- 修复：Ink C 与源颜色逐值匹配；BS 仅允许 W/S 且为 solid；源 stream 字典仅允许 Length。新增五类重新计算 hash 的篡改回归：颜色、边框、源字典、真实 RGB plane、真实 alpha plane。后三者分别证明白名单收紧及已有像素校验，删除均保持拒绝且原批注仍存在。
- Before-red：`/tmp/mimir-signature-check-native-before.log`，三项失败；RGB/alpha 原本即正确拒绝。

### 4. 部分页面的 raw CropBox 坐标与实际 PDF.js 显示不一致

- 文件：shared `pdf-agent.ts`；server `pdf-visual-signatures.ts` / `pdf-local.ts`；Office `PdfEditor.tsx` / `PdfSignatureCanvas.tsx`。
- 实证：Media 400×600、Crop(-20,-30,440,660)，请求显示 rect(40,70,100,50)，实际 PDF.js 取交集后落到(20,40,100,50)。UserUnit=2 的 scale1 viewport 与 raw 页模型也不同。日志 `/tmp/mimir-signature-check-unusual-geometry.log`。
- 根批准的最小处理：签名 native 新增/变换检查当前页 Crop 完全在 Media 内且 UserUnit=1；`read` 以可选 `signatureIssues:[{page,reason}]` 披露原因，面板显示并禁准备/调整。已有核验签名仍可读取/删除。没有修改其他工具、通用页面模型或默默改原件。
- 新增两种几何的 readInfo/native/实际 Editor 回归，拒绝零 dirty/history/版本；native 删除仍通过。旧 host 未返回可选信息也受 native 兜底。

### 5. 原生书签验收补充

- 文件：`apps/server/src/test/pdf-visual-signatures.test.ts`。
- 原测试只检查 C/F，补真实 XYZ 坐标/zoom，以及无操作 apply_page_layout 前后整个 bookmark item 字典精确保留；重复页、旋转、签名变换/删除后目标仍为同一个 native 引用。未扩大删页时既有目录迁移合同。

## Findings (not fixed)

- **完整异常页面几何支持**：依根批准保守禁止本片签名定位，未跨所有 PDF 页模型改为有效 viewport/UserUnit。未来支持需统一页面模型、预览、纸型/裁剪与坐标合同；当前有明确 UI/native 拒绝，已知错误路径不可写入。
- **真实浏览器与触摸命中区验收**：根负责统一 build 后 1280/420×500、手写/中文/PNG/JPEG、纸面拖放和下载。角缩放命中区当前 10pt；组件/native 测试不替代触摸实际体验。未擅自扩样式或称已通过。
- **手写失焦/lostpointercapture**：实现已有 pointercancel；未单独监听 blur/lostpointercapture。当前未复现坏状态，保留根真实交互检查，未做无证据的事件系统改写。
- **数字证书、Sig 字段、持久签名库、真实模型/Desktop**：不在 S1 验收声明中；既有 guard 保留，用户已选浏览器与代码验收。整任务仍 in_progress。

## Verification

| 项目 | 结果 | 日志 |
| --- | --- | --- |
| Server native/local/drawing-geometry/local-route 四文件 | **49/49 pass** | `/tmp/mimir-signature-check-native-final.log` |
| 追加 XYZ/no-op 精确保留后 native 单文件 | **21/21 pass** | `/tmp/mimir-signature-check-native-bookmarks-final.log` |
| Office 实际 Editor/CompactToolbar/local/drawing-canvas/agent 五文件 | **52/52 pass** | `/tmp/mimir-signature-check-office-final.log` |
| shared / Office / server TypeCheck | **pass，均 exit0** | `/tmp/mimir-signature-check-{shared,office,server}-tsc.log` |
| 15 个 TS/TSX 目标 oxlint，最终自修 8 文件再跑 | **pass，exit0** | `/tmp/mimir-signature-check-lint.log`、`/tmp/mimir-signature-check-lint-final.log` |
| 16 文件 oxfmt，最后 native 测试重查 | **pass** | `/tmp/mimir-signature-check-format.log`、`/tmp/mimir-signature-check-format-last.log` |
| lint:styles / scoped git diff --check | **pass** | `/tmp/mimir-signature-check-styles.log` |

Native 覆盖四 Rotate/offset CropBox、透明 Stamp/独立 InkList 实际 PDF.js 光栅、重开变换/删除、非整数纸型缩放与 BS/AP 一致、稳定 duplicate ID、普通表单/原生书签保留、Sig/ByteRange/tagged/活动动作/未知结构拒绝。HTTP 经真实测试 app/统一账号验证鉴权、strict 输入/版本、临时字节与库存原件不变。

检查者另目视已有独立 Poppler 产物 `/tmp/mimir-pdf-signature-native-proof-20261017.png`：正文、表单、外来蓝 Ink、自有两笔深色 Ink、透明红 Stamp 均可见；未将该原生 proof 冒充浏览器下载物。组件测试 mock 画布只验证发布/history/交互合同，字体像素与真实 UI 由根另验。

未运行统一 build/full Office/full server/full pnpm check；根独占重型验收，既有 bundled skill 全仓 lint 基线仍单独记录。未上传/删除文件，未 staging/commit/archive。

## 规范同步与冻结

已同步唯一合同 `.trellis/spec/shared/contract/pdf-agent.md` §15：公开 hash 非认证、op 覆盖防护、native C/BS/source 白名单、可选几何原因及保存取消。检查生产于 2026-10-17 本轮正式冻结；后续只接具体浏览器反馈。GenOffice / WeKnora 依据沿批准 plan，未产生新的竞品研究结论。
