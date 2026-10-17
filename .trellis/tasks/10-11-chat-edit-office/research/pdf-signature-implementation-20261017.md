# PDF S1 普通页面视觉签名实施记录

日期：2026-10-17。实施子任务：`/root/pdf_signature_s1`；本记录不替代根任务的浏览器/独立检查结论。生产代码已向根会话明确冻结，未改vendor、未提交或暂存、未删除上传夹具。

## 已实现

- 绘图页签具名“签名”入口。手写、姓名、PNG/JPEG三种输入沿既有紧凑320px Inspector，复用主题tokens；活动模式才显示对应控件，内部滚动和既有固定动作区。
- 准备→纸面点击/键盘居中→重复拖动/等比角缩放→一次明确应用；精确位置默认折叠。准备后关闭Inspector，不让窄屏遮罩挡住纸面。Escape/取消不发布，应用只推进一个画布版本和历史项。
- 手写为真正Ink/独立InkList；姓名和图片为Stamp/原生图像AP及alpha。姓名等待真实字体加载，测量实际包围盒裁切。图片先读编码尺寸限制，再解码、缩放；保留原色默认，去浅底必须明确选择。
- 保存重开后只列出完整核验的本编辑器签名，可调整/删除。严格核验AP模板、图像RGB/alpha与私有源匹配；伪造前缀、篡改外观和未知结构保持只读。HTTP只返回小预览，不回传原PNG。
- 保留普通表单、外来Ink及原生书签。四种Rotate/offsetCrop均按显示坐标定位；纸型缩放同步源矩阵/Ink宽/AP；复制页身份稳定派生。签名只允许manual，不新增模型目录能力。
- 原生测试发现既有 `apply_page_layout` 在无删页时也重建书签，丢失XYZ/C/F。经根确认后修为先固定numeric目的地到原页引用，无删页保留原对象图；删页仍沿既有幸存映射。

## 文件

新增：

- `packages/shared/src/pdf-visual-signature.ts`
- `apps/server/src/services/pdf-visual-signatures.ts`
- `apps/server/src/test/pdf-visual-signatures.test.ts`
- `packages/office/src/editors/pdf-signature.ts`
- `packages/office/src/editors/PdfSignaturePanel.tsx`
- `packages/office/src/editors/PdfSignatureCanvas.tsx`
- `packages/office/src/editors/pdf-signature.css`
- `packages/office/src/editors/PdfEditor.signature.test.tsx`

小范围集成：shared `index.ts/pdf-agent.ts`；server `pdf-local.ts/pdf-page-layout.ts/pdf-local-route.test.ts`；Office `agent/pdf-local-agent.ts/agent/pdf-agent.ts/PdfEditor.tsx/PdfLocalPanel.tsx/CompactToolbar.tsx`。这些文件包含其他并行任务改动，不能将整个git diff归于本片。`CompactToolbarSection.collapsedContent(close)`是根已批准的向后兼容接缝，签名用它先关闭折叠菜单再开Inspector。

## 已完成验证

| 验证 | 结果与证据 |
| --- | --- |
| 最终server四文件：visual-signatures/local/drawing-geometry/local-route | **42/42**，`/tmp/pdf-signature-server-tests.log` |
| 原生签名单文件 | **14/14**，`/tmp/pdf-signature-native-appearance-tests.log`；含独立PDF.js真实annotations及像素、A5非整数缩放后旋转 |
| Office签名/绘图/local/CompactToolbar四文件 | **43/43**，`/tmp/pdf-signature-editor-tests.log` |
| 最近关闭/回焦调整后真实Editor签名单文件重跑 | **3/3**，`/tmp/pdf-signature-editor-final-tests.log` |
| shared / Office / server tsc | 均exit0；后两者最终日志 `/tmp/pdf-signature-office-tsc.log`、`/tmp/pdf-signature-server-tsc.log` |
| 17个涉及TS/TSX目标oxlint | exit0，无warning；最终oxfmt含CSS共18文件通过 |
| lint:styles / git diff --check | exit0 |
| 独立Poppler光栅 | `pdftoppm` exit0，已目视确认外来蓝Ink保留、自有黑色两独立笔画、红色透明Stamp、原表单与正文同时可见；见下方文件 |

Poppler提示本机默认Fontconfig缺失，仍成功输出，无像素丢失。其验证对象是原生宿主输出，不冒充真实浏览器下载结果。原生proof：`/tmp/mimir-pdf-signature-native-proof-20261017.pdf`及同名`.png`。临时生成器移出仓库为 `/tmp/mimir-pdf-signature-native-proof-generator.ts`，相对服务import需在server位置运行；未遗留临时测试文件。

## 根会话浏览器交接

根已上传三页夹具到测试知识库：文档ID `08HpgPE_117f_BSs`；原文件 `/tmp/mimir-pdf-signature-fixture-20261017.pdf`。含普通text/checkbox表单、三页不同Rotate/CropBox/纸型、原生书签C/F、外来Ink；**不含外来Stamp**，没有默默替换已上传文件。另有 `/tmp/mimir-signature-transparent-20261017.png`、`/tmp/mimir-signature-white-20261017.jpg`。不得未授权删除。

浏览器仍需验证：真实多笔手写、中文/拉丁字体实际像素、透明PNG和白底JPEG导入、普通表单填写后保存重开、自己的签名再移动/删除；1280×720、420×720与420×500，Inspector滚动/固定动作、折叠菜单关闭、纸面操作、focus/Escape与无横溢出；下载真实输出需独立光栅。根负责统一build、全Office和正式独立checker。

## 边界与剩余风险

- 只实现普通页面视觉签名。数字证书签名、空Sig字段、持续账号签名库不在S1；Sig/ByteRange/Perms/DocMDP/FieldMDP、tagged及未知安全结构继续拒绝。
- 角缩放手柄当前视觉/命中尺寸10pt，触摸可用性需浏览器检查；手写pointercancel有处理，未单独增加lostpointercapture/window blur监听。若有实际问题由checker/浏览器反馈后修。
- 本片未运行全仓 `pnpm check`（既有480条捆绑skill基线）、未运行统一build/全Office，不能据局部测试宣称全部通过。
- 无测试模型配置，未验真实模型；用户已确认Desktop自行验收。本片不宣称模型或桌面通过。
- WeKnora固定v0.8.3/source hash、Office/GenOffice依据与适用边界见 `pdf-signature-plan-20261017.md` §10；此次为既定方案实施，无新增竞品结论。
