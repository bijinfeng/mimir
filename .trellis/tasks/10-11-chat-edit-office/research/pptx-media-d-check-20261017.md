# PPTX 媒体 D 独立检查（2026-10-17）

Active task：`.trellis/tasks/10-11-chat-edit-office`。对照批准的 `office-crop-remaining-plan-20261017.md` §D 与 `pptx-media-d-implementation-20261017.md`。本片独立检查完成，源码冻结交 root 统一 full/build 和真实浏览器验收；不是全部工具完成记录。

沿固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`；WeKnora 复用批准研究同日 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 的公开源码缓存证据，适用于能力门控，不用其 Markdown 编辑器作 Office 媒体工具栏范本。本次没有重新联网，也没有重跑 fixture 的 FFmpeg 解码；独立测试验证实际文件 SHA256、尺寸、编码，以及 manifest 记录的 decode exit0。

## Findings (fixed)

### 1. 上传期间媒体类型 Select 可操作，并可能使面板永久忙碌

- File：`packages/office/src/editors/PptxMediaControls.tsx`、对应 test。
- Issue：`fieldset disabled` 不能禁用 Antd 的 div Select。pending 上传时切换 kind 会使 epoch 失效，旧 submit 的 finally 不再清 busy，面板可能无法重试。
- Fix：媒体类型 Select 显式 `disabled={busy}`。保留文件准备期间切换 kind 的取消行为。回归覆盖真实下拉 mousedown 不展开、pending 防重入、失败后原选择保留并可重试。
- 红测：`/tmp/mimir-pptx-d-independent-red-20261017.log`，原代码 disabled 断言失败；同次真实 MP4 越界红测也失败。

### 2. 普通 MP4 仅检查采样块起点，未检查整块范围或 stsc 映射

- File：`packages/office/src/pptx-media-containers.ts`、`pptx-media-info.test.ts`。
- Issue：把真实 MP4 的 stco 起点改为 mdat 最后一个字节，仍被接受；实际六个采样均越过媒体区。stsc 的首块、采样数量、描述编号也未核对。
- Fix：有界读取 stsc，要求首块为1且递增、描述指向实际 stsd 条目；逐块按 stsz 实际长度计算，并验证完整范围在同一 mdat 内，最终消费数量恰好等于采样表。分片 MP4 空初始化表沿真实 trun 验证继续接受。
- 回归：真实文件越界及三种坏映射先红后绿；既有 MP4/MOV/M4V/M4A/ALAC 与 fragmented MP4 正例全过。未扩大为解码器或任意 codec 可播放承诺。

### 3. WebM 只要求非空 Cluster，可把没有视频采样的文件当视频

- File：同上容器 helper 与 test。
- Issue：把真实 fixture 的全部 SimpleBlock 元素改为同长度 Void，视频轨道元数据和 Cluster 仍在，原检查照样接受；未知 block TrackNumber 也未验证。
- Fix：检查实际 SimpleBlock/BlockGroup 中的 Block，验证已声明且唯一的正轨道编号、完整 block 头、实际视频采样，以及 Xiph/固定/EBML lace 的有界帧范围。整数型 TrackNumber 与 EBML 长度的 unknown sentinel 分开处理。
- 回归：缺视频采样与未知轨道先红后绿，日志 `/tmp/mimir-pptx-d-independent-webm-red-20261017.log`。另用真实 VP8 帧重封装四种合法 lace/BlockGroup，及三种坏 lace 范围，全部通过；不以伪头作为成功媒体。

### 4. 相邻图片填充 Select 的相同 busy 缺陷（root 明确扩入本片）

- File：`packages/office/src/editors/PptxAssetControls.tsx`、`PptxImageFormats.test.tsx`。
- Issue：填充位置、填充方式也仅依赖 fieldset。真实 pending 上传时 mousedown 使填充位置出现 `aria-expanded=true`。
- Fix：两个 Select 显式 `disabled={busy}`。测试实际点击两者均不展开，结束后可选背景/平铺，第二次上传使用新选择；原图片 File 上传语义保持。
- 红测：`/tmp/mimir-pptx-d-imagefill-red-20261017.log`，1 failed /7 passed；最终统一目标运行包含修复后的8项。

本检查只追加修改上述3个生产文件与3个测试文件。没有修改 vendor、shared schema、server 生产或其他格式；没有子代理、暂存、提交、归档、上传或删除测试文件。

## 路径核验

- 全部十种扩展名及实际容器/类型检查在浏览器与 host 共用 helper；32 MiB、盒/元素/采样预算及截断/溢出前置。MOV/M4V 预览 MIME 为 video/mp4，宿主保存原文件扩展名、原媒体 bytes 与引擎 ContentType。
- 真实12份 fixture 含新增 MOV/M4V/AVI/M4A/AAC、原五种格式、ALAC MOV 与分片 MP4；既有 screen-recording WebM 也保留。无效文件与合法但浏览器不支持编码分开，AVI/ALAC 与 error 后仍允许嵌入原件。
- 视频1px=1pt=12700EMU，自然比例只缩小至页尺寸；未知尺寸16:9 fallback；音频固定64pt方形。显式 normalized center 严格 finite/[0,1]。按已批准上游语义定位中心，靠边 center 可使框跨页、极小页面仍保留64pt音频；未擅自改成强制边缘夹紧，也不声称任何中心都保证完整框在页内。
- Controls 的 epoch、AbortSignal、文档/页/version key，Editor 的 caller signal 合并、save/host/replace 前后重验与卸载取消保持。可选 poster1280px/3秒预算，迟到捕获取消。失败保留 draft。播放器按文档/页/对象/version 重挂载，清理 pause/remove src/load；播放/seek/volume 不推进 dirty/version/history，外链不自动 fetch。
- 顶层音视频封面沿原生 srcRect+box 一次发布，不转换为普通图片。实际宿主测试保持 AV 双关系、媒体 hash、timing、37°/flip、兄弟和所有非目标 ZIP，二次保存与 Save→Undo/save→Redo/save 全 entry 精确；组内媒体仍拒绝。
- C1 三项既有修复均由最终目标回归覆盖：nested source picture 使用实际父 childScale；连接线 ID XML 空白/前导零识别；off/ext 属性完整唯一和安全整数。没有改这些已冻结生产文件，也没重跑无新风险的 raster。
- 界面代码保留320px Inspector 现有壳、body 内滚、固定 footer 唯一 primary、长错误换行和真实预览比例。Antd 静态与 happy-dom 行为不能代替420×500浏览器。

## Findings (not fixed)

- 无已确认而未修复的本片代码缺陷。
- 按批准边界保留：组内媒体 canvas crop、媒体 replace/cutout 不支持；codec 不可预览可嵌入；未新增持久化 trim/volume/loop/autoplay。C1 attached connector/deep/MC 等既有守卫不放宽。
- root 仍负责统一 full suite/build 与真实1280、420×500：媒体 Inspector 内滚/固定主动作、竖视频自然比例、警告后插入、Escape 逐层关闭回焦与停止播放、封面拖动裁切保存重开和下载原字节复核。没有把本报告的目标绿拼接成全套或浏览器通过。
- 公共 spec 同步由 root 协调：现有 shared document-agent 媒体合同已覆盖本片；建议补充本次 stsc 完整采样块、实际 WebM Block/lace 校验的具体教训，以及 fieldset 不能禁用 Antd Select 的现有规则引用。

## Verification

- Office：PASS，最终 **13 files /211 tests**，12:59:43开始，22.45秒，exit0；`/tmp/mimir-pptx-d-independent-office-freeze-20261017.log`。包含 D 全部目标、C1 九文件回归的并集与新增图片填充 pending UI 用例。
- Server：PASS，**3 files /40 tests**，exit0；`/tmp/mimir-pptx-d-independent-server-final-20261017.log`。包含媒体上传、manual upload、C1 group host；之后仅改浏览器 ImageFill busy，未改 host/helper。
- TypeCheck：PASS，Office 最终 `/tmp/mimir-pptx-d-independent-office-types-freeze-20261017.log`；Server/Shared 分别 `/tmp/mimir-pptx-d-independent-{server,shared}-types-20261017.log`，均exit0。
- Lint：PASS，21个相关TS/TSX，0诊断exit0；`/tmp/mimir-pptx-d-independent-lint-20261017.log`。最初新测试出现 helper scope warning 与 conditional expect error，已修复后复检，不涉及生产绕过。
- Format：PASS，22个相关TS/TSX/CSS；`/tmp/mimir-pptx-d-independent-format-20261017.log`。
- Antd：MediaControls、AssetControls、PictureCropCanvas 逐文件 `antd lint --format json` 均 issues=[] /partial=false；AssetControls busy修复后复检通过，`/tmp/mimir-pptx-d-independent-antd-{media,assets,crop}-20261017.json`。
- Styles：PASS，`pnpm lint:styles` exit0，`/tmp/mimir-pptx-d-independent-styles-20261017.log`。目标 `git diff --check` exit0。
- 未跑全仓已知480技能 lint、全套/build/browser/Desktop或实际模型。没有配置模型；Desktop沿用户决定自行验收。
