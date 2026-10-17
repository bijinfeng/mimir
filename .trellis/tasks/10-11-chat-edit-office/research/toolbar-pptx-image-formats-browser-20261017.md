# PPTX 图片来源扩展：浏览器与原生验收

2026-10-17。此切片完成代码、独立检查、真实浏览器与原件下载验收；不是整个编辑器工具补全结论。

## 参考、范围与门禁

主参考沿 `pptx-image-formats-implementation-plan-20261017.md` 的固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`。WeKnora官网及公开源码v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 证据和适用性见该报告：仅借鉴能力真实门控，不以其Markdown工具栏作为Office外观。

- 图片插入、替换、填充/背景、直接组成员替换接PNG/JPEG/GIF/BMP/WebP/TIFF；保存源字节，TIFF和EXIF JPEG仅调整显示副本。GIF/WebP去背景明确输出静态PNG。
- TIFF最终仅常规未压缩/PackBits及严格颜色×位深×通道/条块预算组合，选面积最大的安全页显示，原生保存保留全部页面。LZW/Deflate/JPEG-in-TIFF/CCITT等当前解码不能可靠限分配或可能静默黑图，明确拒绝；不声称全部TIFF兼容。
- 独立Office6文件68/68、顶层实际Editor多格式与旧replace/error7/7、server54/54；shared/server类型和目标lint/format/Antd/styles通过。checker当时Office类型被DOCX在途ink控件阻断，随后对应owner修正，root最终Web构建包含Office tsc并exit0：`/tmp/mimir-pptx-image-formats-web-final-20261017.log`。
- 前次全Office161文件1658项为1657通过+unknownTIFFcodec1失败，不能称全套绿。具体不是文案问题：运行时尚未按Compression筛安全页，未知65000可放行；最终68项包含原拒绝回归及额外编码/预算/真实PackBits像素验证。详独立 `pptx-image-formats-check-20261017.md`。没有为相同范围重复跑全套，也不将重叠测试相加。

## 六格式原件与实际插入

8页原生夹具库ID `MsyG7Y26t0yAs1IP`，原件 `/tmp/mimir-pptx-image-formats-20261017.pptx`，manifest同名json逐页记录媒体hash。六格式另含animatedWebP与EXIF6 JPEG；TIFF为4×3白页+12×8红绿页。

实际浏览器第6页显示TIFF第二张12×8红绿页；第8页EXIF6 JPEG仍横向红左绿右，不按浏览器EXIF旋成竖向。第7页动画WebP缩略图观察到蓝色帧，原动画媒体通过下述原件hash保留，不把静态截图当所有帧播放完整证明。

从真实文件chooser插入TIFF到第8页、保存、单步撤销保存、重做保存：

- `/tmp/pptx-image-formats-browser-tiff-{insert,undo,redo}.pptx`；验证 `/tmp/pptx-image-formats-browser-native-verification.json`。
- 8份原媒体，包括GIF/animatedWebP/EXIF JPEG/TIFF，全部与manifest hash相同。新插图复用已有image6.tiff，不重编码或重复媒体。
- 仅当前第8页原生part `ppt/slides/slide2.xml` 及对应rels改变；presentation实际顺序核验第8页确实对应slide2，不凭文件名猜页号。
- 首次undo全部非目录entries精确，只有空ZIP目录差；redo全部entries精确。

## TIFF 背景填充与操作布局

真实选择TIFF为第8页背景、应用保存、撤销保存、重做保存；三个文件 `/tmp/pptx-image-formats-browser-{tiff-background,background-undo,background-redo}.pptx`。验证 `/tmp/pptx-image-formats-browser-background-verification.json`：背景blip真实存在、8份原媒体hash保持；只改当前slide2和rels；undo回插图态、redo回背景态全部ZIP entries精确。最终该库夹具保存于背景redo状态。

首轮1280/420实际发现预览把Apply挤出可视区：420面板底693.36，Apply却位于796.91–820.91。checker把PptxAssetControls改为独立body内滚/固定footer，不仅缩小预览。

最终构建1280×720/420×720确认：宽340/窄336px面板；420整页scrollWidth420；body client378/scroll517；单一全宽绿色Apply位于657.36–681.36、footer固定到底693.36。预览保持1.5比例（宽屏288×192），底部填充方式可实际展开。Escape先关下拉再关面板，回可见图片填充入口，未应用选择不造dirty。

最终浏览器另以真实LZW TIFF `/tmp/mimir-pptx-unsupported-compression.tiff` 验证拒绝：提示导出为未压缩/PackBits；Apply禁用、保存仍禁用，可重新选有效TIFF恢复预览和应用。错误没有上传发布或覆盖库原件。

截图统一目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51`：`pptx-image-formats-{wide,420}.png`为最终确认；`pptx-image-formats-420-before-fix.png`为首轮缺陷证据。临时viewport已清除。

## 直接组成员 TIFF 与静态 PNG 去背景

独立夹具 `wmGwhRQmUDFYnkv0`，源 `/tmp/mimir-pptx-group-formats-20261017.pptx`，避免改动前片组图片已验样本。

实际选择「组合图片验收 › 产品图片」，替换TIFF并保存。`/tmp/pptx-group-formats-browser-tiff-replace.pptx` 与 `/tmp/pptx-group-formats-browser-native-verification.json` 证明：新image2.tiff逐字节等于原文件，父组45°/flip/非零chOff/scale保持，图片几何边框阴影保持，37%保留且crop按替换合同清零，旧跨页shared PNG及第二页XML不变。

随后设10/15/5/20%裁切并保存，真实去背景保存、撤销保存、重做保存：`/tmp/pptx-group-formats-browser-{tiff-crop,tiff-cutout,cutout-undo,cutout-redo}.pptx`。输出新image3.png为12×8、alphaMin=0；四边crop和37%精确保留。源TIFF最大安全页12×8（不是PIL默认首帧4×3），原TIFF确含4×3和12×8两页。undo回原TIFF裁切态、redo回PNG均全部ZIP条目精确。脚本 `/tmp/mimir-pptx-group-formats-cutout-verify.py`，结果 `/tmp/pptx-group-formats-browser-cutout-verification.json`。最终该夹具保存于cutout redo。

## 边界

模型未配置未做真实模型调用；Desktop用户自验。SVG/EMF/WMF、深层组/媒体封面、组内仿射画布裁切和任意图片编码仍不是此片完成能力。已有不支持TIFF来源保留原archive字节，不发布虚假黑图预览。无新增依赖、提交、暂存、归档或测试件删除；整体任务继续in_progress。
