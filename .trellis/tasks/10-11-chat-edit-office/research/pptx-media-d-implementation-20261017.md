# PPTX 媒体 D 实施交接（2026-10-17）

## 范围与状态

落实已批准 `office-crop-remaining-plan-20261017.md` §D：新增 MOV/M4V/AVI/M4A/AAC，保留 MP4/WebM/MP3/WAV/Ogg；真实容器/轨道检查、自然尺寸与固定上游 EMU 语义、可取消预览/上传，以及顶层音视频封面画布裁切。此报告是实现者的目标验证记录，独立 checker、统一 full/build 和生产浏览器由 root 安排；不据此声明全部编辑器工具已齐。

基准仍为 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`。尺寸依据固定 `apps/slides/src/main/video-size.ts` 的 videoFrame/audioFrame；codec 警告参照该固定版 mp4-audio-sniff。WeKnora 沿已批准研究的 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 缓存证据，只适用于真实能力门控，不以其 Markdown 编辑器作 Office Toolbar/媒体 OOXML 范本；本实现未做新 HTTP 调研。

## 生产改动与合同

- 新 `packages/office/src/pptx-media-{info,frame,binary,containers,audio}.ts` 为浏览器/宿主共用纯 helper。32 MiB前置预算；ISO box/track/sample/offset与fragmented MP4 tfhd/trun/trex、RIFF AVI与WAV、WebM EBML、MP3帧、ADTS AAC、Ogg音频逐类有界读取。真实视频轨道不可用音频改后缀混过，AVI不可用RIFF WAV混过。
- ISO显式盒长/扩展长、次数、采样数和位置均有预算；fragmented MP4空初始化采样表经实际分片校验接受，避免把常见合法分片 MP4 当空壳。容器校验不声称完整解码或所有 codec 在当前浏览器可播。
- `apps/server/src/services/pptx-manual-upload.ts` 从媒体真实字节派生自然尺寸，1px=1pt=12700EMU，只缩小至整页可容纳。音频64pt方形。未知视频尺寸16:9明确回退。`packages/shared/src/pptx-agent.ts` 仅私有manual schema加可选严格 normalized center，不接受浏览器声明 naturalSize，不改模型公开工具。
- 新 `editors/PptxMediaControls.tsx` 把准备与提交分开：扩展名/MIME/原结构检查之后才允许插入；AVI和ALAC等合法但可能无法预览的媒体给警告，浏览器解码失败不禁止保存原字节。MOV/M4V Blob 预览 MIME video/mp4，但上传的仍为原File及原MIME/后缀。竖视频按真实比例、220px高预算设maxWidth，不能以HTML默认宽高拉伸。
- 可选poster最长边1280px，3秒预算、abort时立即结束；arrayBuffer、类型切换、换页、关闭/卸载及版本变化均使旧epoch/信号失效，迟到结果不能进入宿主发布。失败保留选择可重试，pending同步锁防重入。
- `PptxAssetControls.tsx` reexport新Controls，PptxUpload可传signal；播放器MOV/M4V使用video/mp4，新增AVI类型，源变/卸载pause、移除src并load释放。`PptxEditor.tsx` 只加局部signal桥与文档/页/版本key，不改变C1矩阵/连接线/native xfrm守卫。
- `pptx-picture-crop.ts` 仅解除顶层媒体封面canvas禁用，组内媒体仍拒绝。`PptxPictureCropCanvas.tsx` 对媒体等待真实SVG image load才允许Apply；坏poster明确拒绝。沿已有setPictureSrcRect原子crop+frame，不改变媒体身份。
- `pptx-tools.css`仅音视频Inspector：320px壳内body滚动、footer固定且唯一primary；长错误/警告可换行。主按钮沿ToolbarButton自动label，无重复子文案。
- `.trellis/spec/shared/contract/document-agent.md` 在现有manual-asset条目后记录窄合同。

## 真实媒体证据

`packages/office/tests/fixtures/pptx-media/generate.py` 以 FFmpeg 7.1 `testsrc2` 与440Hz sine本地生成，未采用第三方内容；逐文件完整解码所有流到null并确认exit0。临时FFmpeg由uv安装到用户cache，项目依赖未改；产品和测试运行时无需FFmpeg。`manifest.json`含完整参数、时长、流编码、原字节SHA256和decode exit。既有`screen-recording-flower.webm`也纳入解析/上传回归。

| 文件 | bytes | 时长秒 | SHA256 |
|---|---:|---:|---|
| landscape.mp4 | 12905 | 0.6 | `03ffa8ee5278aca5bcaa52197d93a635249b3bf595c61c4c5a296f65bd931117` |
| landscape.mov | 12852 | 0.6 | `41e43d312b1361a8266f8e1d56348186a58f6b7fd350e97466e08bf81699aa0a` |
| portrait.m4v | 13484 | 0.6 | `6de939664aee2f29a0cb1fc327fae10e64c0a2e2bbd98aee35074bf7cb533ca6` |
| landscape.avi | 41116 | 0.6 | `f9cc6c9e2022ded41ee050895cc892fa043edbdb9ba082574411d61d78c174d9` |
| landscape.webm | 10681 | 0.6 | `2e9cfb683bdc77dfbc1fb7768abec216982dba86211d32e6bf21f70f1de345ef` |
| tone.m4a | 6432 | 0.6 | `ace72d6e0a56b3783e69174ca557140cb7ab45a764d9be30f686c39fd79cb0ff` |
| tone.aac | 5707 | 0.63 | `570729b23fa3a640a08e0f2e7956f8a06e38c4013252f91451e77b9cf9d7e4f5` |
| tone.mp3 | 5241 | 0.63 | `c5142835c3cfb538b18a70c98dc3e7c1ebe7bed3f3dd32e7c8af3e37109b4663` |
| tone.wav | 52998 | 0.6 | `552d3eccca32105cf09bcd521140cf01d342e2e1937d8d3bd214893c85fa847c` |
| tone.ogg | 4644 | 0.6 | `4c2c8899795fb2183ddcf400fdc88891755536457d5672fccce46b5eb9579206` |
| alac.mov | 24099 | 0.6 | `25252f854cb6d6c9e6ce1db5f7627c795a2e84a9fcd0f396c0f956074b131f45` |
| fragmented.mp4 | 12972 | 0.6 | `19cf71f63fdb2c34621d27eca8169fa34e58889b025836d813618c700c0f0832` |

## 必须保留的边界

- 运行时只证明有界合法容器/轨道，不转码、不承诺浏览器支持所有编码；AVI/ALAC警告与无效文件错误分开。
- 源媒体、原后缀与引擎对应ContentType保持，顶层poster crop不得变普通图片。组内media、媒体replace/cutout仍拒绝，不新增trim/volume/loop/autoplay持久化字段。
- 播放/seek/volume只是HTML临时状态，不推进画布version/dirty/history。外链仍不自动fetch。
- 没有真实模型配置，本片未验证模型调用；用户已选择Desktop自行验收。未改vendor、未暂存/提交/归档、未上传或删除测试文件。

## root 后续生产浏览器清单

1. 真实1280和420×500：320px音视频Inspector、长中文文件名/警告、内部body scroll、固定唯一“插入音视频”始终可达；Select Escape先关下拉，再关Inspector并回实际入口。
2. 真实320×180 MOV、180×320 M4V按原比例预览/插入；AVI警告+video error仍可插原文件，M4A/AAC试听或明确codec提示，播放器关闭/Escape/切页停止。
3. 视频/音频封面裁切：等待可读poster；八把手/向外恢复/Enter/Escape；一次Apply一次history，保存/重开后媒体仍可播或保留正确codec警告，原媒体hash、关系、timing精确。
4. 下载用root原始HTTP字节读回，不把CWM加工Downloads作源基线；浏览器像素/420布局不能由happy-dom或native ZIP测试替代。

## 目标验证结果

最终结果在本报告末尾追加。此前统一套件在D生产改动前启动，不能把它计作D全量验收。

### 最终目标结果（生产冻结）

- Office：`pnpm --filter @mimir/office exec vitest run src/editors/PptxMediaControls.test.tsx src/editors/PptxPictureCropCanvas.test.tsx src/editors/PptxEditor.extended-tools.test.tsx src/pptx-media-info.test.ts src/pptx-media-frame.test.ts src/editors/pptx-picture-crop.test.ts` — **6文件139/139，exit0**，12:49:44开始，47.67秒。
- Server：`pnpm --filter @mimir/server exec vitest run src/test/pptx-media-upload.test.ts src/test/pptx-manual-upload.test.ts` — **2文件21/21，exit0**，12:49:45开始，8.88秒。
- 上述Server含12真实编码fixture、5新增格式+旧5格式+ALAC+fragmented MP4；media自身hash/原类型/双AV关系/非目标ZIP两次save；真实audio/video poster crop保留37°/flip、timing、所有关系、全部非目标entry，实际session历史Save→Undo/Save→Redo/Save全entry相等。
- 上述Office含actualEditor audio/video canvas crop取消零写、加载后一次Apply一次host op和history、保存及Undo/Redo全entry；坏poster不开放Apply；Controls切kind迟到arrayBuffer、切slide/close abort、双击防重、失败保留draft、MOV/M4V Blob MIME、竖图比例、3秒poster和迟到回调；播放器关闭释放且play/seek/volume保持version0/isDirty=false。
- Office/Server最终生产类型检查均exit0；Shared类型检查exit0。
- 目标21个TS/TSX/CSS文件oxfmt check通过；目标20个TS/TSX文件oxlint **0warning/0error exit0**（CLI成功时无输出）。Antd分别lint MediaControls/AssetControls/PictureCropCanvas均issues=[]，exit0；公共Shell与vendor未改。
- `git diff --check` exit0。独立checker与root统一build/fullsuite/1280及420×500生产浏览器仍待安排，此处没有拼接成全套或浏览器通过。

首次目标测试中发现primary自动label重复文案，已改为仅label；后续happy-dom CSS语法归一及测试helper重复act、测试类型/静态规则均已修并由上述最终统一目标运行覆盖。没有把旧失败记录改写为通过。
