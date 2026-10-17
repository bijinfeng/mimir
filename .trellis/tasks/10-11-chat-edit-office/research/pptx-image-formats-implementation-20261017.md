# PPTX 图片来源格式实施交接（2026-10-17）

## 状态

实现者已冻结生产文件，交 `docx_lists` 独立检查及 root 真实浏览器验收。**本报告不表示完整验收通过**：checker 已发现 TIFF 压缩解码存在独立于 IFD 尺寸的分配风险，正在接手修正；root 负责最终统一构建、浏览器和原件读回。本实现者未运行 full Office suite/Web build、未调用模型、未做 Desktop 验收，未暂存/提交/归档/上传/删除测试件。

## 已接通行为

- 新共享纯字节元信息统一 PNG/JPEG/GIF/BMP/WebP/标准 TIFF 的内容类型、MIME、真实尺寸、容器边界和预算。维持8MiB、16384单边限制，显示/元信息限制6400万像素；拒绝文件截断、假MIME、异常长度、超预算、循环TIFF IFD。文件名不决定媒体ext；允许空MIME或通用二进制MIME，TIFF/BMP接受明确同义MIME。
- manual-picture 原生插入/替换、manual-asset 图片插入/替换/形状填充/背景/直接组替换使用相同校验与原字节路径。`replacePptxGroupPicture` 仅扩大原生ext类型，继续保留父组XML/几何/效果、整页资源活性与既有guard。Agent service仍只允许PNG/JPEG，系统剪贴板未扩大。
- 保留同步 `PptxArchive.readMediaDataUrls`；新 async `preparePptxDisplayMedia` 在 open/edit/replace 的三个异步入口准备显示媒体。`replaceFromHost` 在 nextSize/nextMedia 完整准备后复核 signal/revision，随后一次发布 archive/media/pages/model，旧结果不覆盖当前状态。
- TIFF保留全部原字节/页面，仅显示转换PNG。纯解析器先检查IFD尺寸、数据范围、样本/位深/瓦片预算，选面积最大安全页，面积相同保留前页。显示工作副本只把选中IFD交给UTIF、断开nextIFD并屏蔽Exif/SubIFD/MakerNote等递归私有字段，只decodeImage选页。原archive不变。
- JPEG遵循固定上游的PowerPoint原像素朝向：仅在显示副本将合法EXIF Orientation置1；原件和上传文件字节保持。真实tag6 JPEG证明仅一个方向字节变化、原件保留，生产浏览器方向验收仍由root完成。
- 顶层两选择器、图片填充、组图片替换允许六来源；共用受控文件准备、真实浏览器Image解码及实际尺寸核对、失败可重选、准备中不可应用、迟到文件读取/面板卸载取消。仍传原File；选择/预览不会制造修改。顶层旧图片路径增加同步互斥、文档/会话/页/版本及取消守卫。
- 沿既有Inspector/表单/按钮布局，无新增大表单或卡片。相关TIFF预览说明“显示尺寸最大的安全页面，保存保留全部页面”；顶层与组内去背景均明确结果为静态PNG，GIF/WebP动画仅使用当前画面。原GIF/WebP文件保存不转码。

## 重要边界与独立检查发现

- BMP仅未压缩/位域编码；标准TIFF（不含BigTIFF）只支持通过预算和解码的页面。SVG/EMF/WMF不新增上传，原生读取/保留合同未扩展。深层组、媒体封面、组内画布拖裁切/新效果不在本片。
- server验证内容容器与元信息；浏览器准备本地选择文件时做真实Image解码。本报告不将元信息验证描述成server已全解码所有压缩流。
- checker发现：UTIF compression8/32946 `pako.inflateRaw` 可独立分配超出外层IFD预算；compression6/7内部JPEG SOF尺寸也需核对。实现者已停止修改，由checker持有生产修正；还提示其检查photometric/bitdepth组合的静默黑图分支。最终支持编码边界、最终tests和类型以checker报告为准。
- 无DOM的服务端/测试环境不能生成TIFF显示PNG；媒体resolver不发布不可解码的TIFF URL，archive原件保持。不能把Node无canvas测试当浏览器显示验收。

## 文件（本片21个TS/TSX）

- shared：`pptx-image.ts`（新）、`index.ts` 导出。
- server：`services/pptx-image-info.ts`（新）、`pptx-agent-host.ts`、`pptx-manual-upload.ts`、`test/pptx-image-formats.test.ts`（新）、`test/pptx-agent-host.test.ts`（错误文案断言）。
- Office：`pptx-image-display.ts`（新）、`pptx-image-display.test.ts`（新）、`pptx-image-info.test.ts`（新）、`pptx.ts`、`pptx-picture-edit.ts`。
- Office editors：`use-pptx-picture-preview.ts`（新）、`PptxImageFormats.test.tsx`（新）、`PptxEditor.tsx`、`PptxAssetControls.tsx`、`PptxGroupPictureControls.tsx`、`PptxPictureTools.tsx`、`PptxGroupPictureControls.test.tsx`、`PptxEditor.group-picture.test.tsx`、`PptxEditor.test.tsx`（仅目标Image解码边界桩）。
- 另有 `packages/office/tests/fixtures/pptx-images/`：自生成8个小图和可复现 `generate.py`。多个既有文件包含前片共享修改，不能把全git diff计为本片所有。

## 已完成检查（实现者快照）

1. Office5文件42/42：metadata/display、新真实图片填充组件、原组图片组件及实际Editor。日志 `/tmp/mimir-pptx-image-ui-tests.log`。
2. 最后新增unknown TIFF codec guard后，metadata/display两文件24/24（含新增1例），日志 `/tmp/mimir-pptx-image-final-guard-tests.log`。不把重叠测试相加为不同用例。
3. 顶层旧图片3/3目标回归，78非目标跳过：`PptxEditor.test.tsx -t '本地 PNG 从插入工具栏|替换选中图片后画布|图片宿主不可用与失败'`，日志 `/tmp/mimir-pptx-image-top-level-tests.log`。
4. Server3文件54/54：新格式19、旧host17、组图片18。六格式actual insert/replace/fill/background/directgroup共通链路、原字节及非目标ZIP保真、取消/错误拒绝；TIFF转同尺寸PNG保crop及一次history、undo/redo全部非目录entries精确。日志 `/tmp/mimir-pptx-image-host-tests.log`。
5. shared/Office/server三包tsc通过，日志 `/tmp/mimir-pptx-format-{shared,office,server}-types.log`（checker后续修正须再核）。
6. 本片21文件oxlint零错误/警告、oxfmt check全过、styles/diff check通过；Antd逐文件检查新组件测试、AssetControls、GroupPictureControls均issues=[]、partial=false。日志 `/tmp/mimir-pptx-image-{lint,format-check,styles,diff-check}.log` 和 `antd-{newtest,asset,group}.log`。未修改CSS。

## 生产浏览器夹具

- `/tmp/mimir-pptx-image-formats-20261017.pptx`（8页）
- `/tmp/mimir-pptx-image-formats-20261017.json`（逐页elementRef/mediaRef/原图bytes/sha256）
- 原图：`packages/office/tests/fixtures/pptx-images/`。六格式12×8红左绿右；GIF与animatedWebP会切换蓝色画面；TIFF先4×3白页、后12×8红绿页，应显示后页；EXIF6 JPEG应横向红左绿右，不能旋转成竖图。
- 建议核对实际宽/420/短高的选择与预览、TIFF说明/固定动作/Escape；分别选TIFF做顶层插入、填充/背景和直接组替换，下载原件确认媒体sha256与源图相等；GIF/WebP保存动画原件、去背景输出静态PNG；history、失败、异步取消。旧组图原生夹具仍为 `/tmp/mimir-pptx-group-picture-20261017.pptx`。
- 临时export Vitest只生成浏览器夹具，未计入产品测试总数：`/tmp/mimir-pptx-image-format-harness/export.test.ts`、`export.config.mjs`，日志 `/tmp/mimir-pptx-image-fixture-export.log`。本实现者未上传夹具。

## 参考

主要沿固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的原生IMAGE_MIME、TIFF仅显示转PNG和JPEG方向实现；具体行证据与本次WeKnora网站/固定源码重新获取结果见本片 `pptx-image-formats-implementation-plan-20261017.md`，沿前片 `pptx-group-picture-next-20261017.md` 格式闭环。WeKnora v0.8.3能力注册原则仅用于权限真实性，没有Office图片格式/工具栏合同。
