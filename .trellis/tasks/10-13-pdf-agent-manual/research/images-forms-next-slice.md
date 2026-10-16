# PDF 图片与表单下一片方案（未实施）

日期：2026-10-16。主参考仍为 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，本地 `/tmp/mimir-genoffice-html-git` 固定源码。当前原文/便笺切片的矩阵和 HTTP 合同不因此扩大；下面是待实施边界。

## 固定源码证据

- `apps/pdf/src/renderer/ai/tools.ts:549–580`：`add_form_mark` 是静态勾/叉，和交互字段填充不同；支持原文锚点或左上角 pt 坐标。
- `tools.ts:676–912`：`list_page_images`、`insert_image`、`transform_image`、`rotate_image`、`replace_image`、`flip_image`、`set_image_opacity`、`crop_image`、`remove_image_background`、`delete_image`。图像序号是页内1起、来自最近读取；旋转只支持1/4周；透明度是绝对值，不能累乘；裁切边距是0–1比例并缩小页内 footprint。
- `main/image-edit.ts:1,78–97,255–345,346–477`：内容流图片识别/改写/读回依赖 PDFium，同时以 Electron `nativeImage` 做 PNG/JPEG 解码、BGRA 转换和 PNG 编码。当前 Mimir vendored 列表没有此模块，不能直接导入临时 clone 或把 Electron 带入 server。
- `renderer/image-bake.ts`（固定源中的 image* 纯像素/几何模块）：翻转、透明度、裁切、边连通背景去除和 footprint 计算可复用；具体新增文件应由 sync-upstream 清单与 rewrite 管理，vendor 不手改。
- `tools.ts:913–942`、`shared/op-docs.ts:130–136`：`list_form_fields` 先读字段，模型只能通过 `apply_ops setFormValue` 写值（`name,value?,checked?`）；内部 kind 由已核验字段决定。
- `main/save-pdf.ts:447–469`：pdf-lib 分别处理 text、checkbox、radio、dropdown/option-list，不能把任意字符串写进所有字段。
- WeKnora 必查：本次 `git ls-remote --tags https://github.com/Tencent/WeKnora.git v0.8.3` 再确认 tag=`3e22822c1d2397be730c458c7539d0eb8c113a24`；站点本次 HEAD 15秒超时，不能写成本次站点成功。既有 `toolbar-assessment.md` 记录当天站点200、`definitions.go:14–19` search/read 与 `71–72` wiki写工具证据。其知识库权限和工具能力注册适用，未提供 PDF 内容流/AcroForm 字节编辑参考，故不作为主实现模型。

## 建议分两道执行门槛

### A. 图片宿主和手动对象操作

1. 用固定上游同步器增加图片模块/纯像素模块及必要类型的闭包；通过机械 rewrite 把 `nativeImage` 换成服务端可用的解码端口，保留上游 PDFium 对象逻辑。先做可部署探针，再注册工具。
2. 解码选型先验证现有桌面 `@napi-rs/canvas@1.0.9` 能否在 server/web部署生产依赖及桌面本地运行；其服务端当前未声明，不可依赖开发机“碰巧存在”。备选为独立 PNG/JPEG codec 端口。探针需验证直通 alpha/BGRA、不透明/半透明 PNG、JPEG，以及维度、解压像素和内存预算；若用 native 依赖，三目标安装包资产必须验证。
3. 共享 image target 至少绑定 `{sha256,pageIndex,objectIndex,bounds}`，客户端仍可展示上游 image_number。每次修改先重新枚举并确认唯一对象，不能仅靠最近坐标或数组索引；重叠、复用 XObject、Form XObject 嵌套、蒙版和未知图像结构先明确拒绝。
4. 新 `pdf-agent/images` 鉴权 multipart 仅接已鉴权 PDF、工作字节、版本和已注册操作。URL图片走已有媒体下载/SSRF与大小预算路径，手动上传走受限图片输入；不接受本地任意路径。新增图片、原图替换、移动尺寸/层次、旋转、翻转、透明度、裁切、去背景、删除都共用字节执行器和工作副本；支持参数和未支持项分别列入矩阵。
5. 手动「图片」面板提供当前页图片列表、可见选择边框和操作控件；文字/批注已建立的 preverified working structure、version、signal、round和dirty机制复用。只在宿主读回成功后更新画布。
6. 测试真实PNG/JPEG/透明图、复用资源不误伤别处、90°旋转页坐标、连续两次保存、取消/切文档/人工冲突、其他文本和便笺保全。独立pdf.js/Poppler渲染对比像素/位置，pdf-lib读取对象只是结构证据，不能证明像素正确。

### B. 交互表单与静态勾/叉

1. `list_form_fields` 先只读完整字段模型：全名、真实类型、当前值、只读/必填、导出选项、widgets页号和显示位置；读无字段PDF时不能自动保存新建的AcroForm。
2. 新表单写入器以 pdf-lib 对原对象改值，**不要为它全局放宽 assertSafeToRewrite**。目前原文/图片/页重建拒绝 `/AcroForm` 的边界继续保留；仅表单路径可在检查后允许已建模 AcroForm。签名、XFA、加密、未知字段/动作、未支持 Catalog 仍拒绝；字段名唯一性、类型、只读、checkbox导出值和radio/choice选项先整批校验。
3. `apply_ops` 的 setFormValue 与页面/其他写操作若混批，必须预验证整批并在单独字节副本完成，任一无效不发布部分字节；dry_run必须真实验证且不变更版本。表单编辑不能依靠现有“先保存页面改动”的拒绝去声称上游混批原子性完成。
4. 文本字段先探针标准与中文/嵌入字体的 appearance 更新，明确缺字和字体资产问题；仅字段值正确但外部阅读器看不见不能开放成功。保存后保留字段类型、选项和可编辑性，不flatten。
5. 手动「表单」面板按字段类型呈现输入、勾选、单选/选项，复用同一setFormValue executor；静态 `add_form_mark` 另按固定上游向页面写真实矢量勾/叉，提供坐标和原文锚点工具，避免把静态图形冒充交互勾选框。
6. 验证实际控件/Agent交替、空值清除、中文appearance、两次保存、重开仍可编辑、禁止签名/XFA/只读字段且失败原字节不变。另查文本/批注/页数保全。

## 下一片可能触及的文件

- `packages/shared/src/pdf-agent.ts`：图片目标/受限动作和字段 schema。
- 新增 `apps/server/src/services/pdf-images.ts`、`pdf-forms.ts` 与必要codec适配；PDF routes/catalog和测试。
- `packages/office/scripts/sync-upstream.mjs`、`vendor/UPSTREAM.json` 仅当引入固定模块闭包；不手改vendor。
- `packages/office/src/agent/pdf-content-agent.ts`、PDF单独图片/表单控件及PdfEditor wiring。
- renderer API/OfficeSourceEditor的PDF宿主片段、部署依赖/资产及PDF能力矩阵。

外部 image_search/generate_image 的真实服务配置和执行验收应单列；本方案不把图片URL输入当作搜索或生成已完成。涂黑、签名、水印、新建/拆并PDF仍留在后续工具片，不混入这片。
