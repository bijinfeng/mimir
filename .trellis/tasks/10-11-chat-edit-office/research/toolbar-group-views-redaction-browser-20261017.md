# 组合图片、DOCX 视图与 PDF 涂黑副本浏览器验收

2026-10-17，三项切片代码、独立检查、真实浏览器和下载验收已完成；全套回归门禁在下文另行记录。更多图片来源格式为独立在途切片，整体任务仍 in_progress。

## 范围与参考

沿用本片研究固定的 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`。WeKnora 官网既有 HTTP200 证据及公开源码 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 适用 KB/Agent 能力门控，不作为 Office Ribbon 外观模板。没有重新抓取或运行上游 GUI。

使用标准测试账号、生产 Web 构建预览 5180、浏览器实际 Editor；Desktop 用户自行验收，未配置模型不做真实模型调用。测试件保留，无暂存、提交或归档。

## PPTX 直接组成员图片：功能与原生结果

夹具 `W0vlPd7C9H2_qRg3`，原件 `/tmp/mimir-pptx-group-picture-20261017.pptx`。两页共享 PNG；父组旋转45°/flipH、非零 chOff、非均匀缩放，目标保留虚线边框/阴影。直接成员 `产品图片` 位于 `组合图片验收`。

实际操作：37%→62%；裁切20/10/15/5%；应用保存、撤销保存、重做保存；替换240×160 PNG并保存；重新裁切10/15/5/20%；20%去背景并保存、撤销保存、重做保存。最终库状态为去背景重做且保存完成。

原生输出 `/tmp/pptx-group-picture-browser-{baseline,appearance,appearance-undo,appearance-redo,replace,recrop,cutout,cutout-undo,cutout-redo}.pptx`；验证脚本 `/tmp/mimir-pptx-group-browser-verify.py`，完整结果 `/tmp/pptx-group-picture-browser-native-verification.json`。

- 属性只改 slide1.xml；替换/去背景只改目标 slide、rels 和新增媒体。
- 全部阶段父组变换、目标几何/边框/阴影、目标 blipFill 之外 slide XML 一致。旧共享 image1 跨页逐字节保留；去背景后无引用的中间 image2 正确清除。
- 替换240×160、62%且默认清裁切；去背景仍240×160、alphaMin=0，保留重新设置的裁切。
- 首次撤销与 baseline **全部非目录 ZIP 条目精确**，有13个新增空目录，不能称全部 ZIP entries 相同。其余 appearance↔redo、recrop↔cutout-undo、cutout↔redo 全部条目精确。

首轮1280/420：340/336px侧栏；420整页 scrollWidth=420；内容内部滚动、最后字段和固定footer可达；Escape关闭并回到可见组合图片入口。实际发现预览298×178而非1.5比例，checker修真实比例/maxWidth与180px高约束（专项23/23）。最终生产构建实测270×180，1280/420均保持1.5比例；窄屏最后裁切字段可达，固定footer底693.36。最终截图 `pptx-group-picture-{wide,420}.png`（统一截图目录见下文）。

范围仍为唯一直接普通图片、数值裁切；深层组、媒体封面、兼容分支、画布仿射拖裁切不在本切片。更多来源格式为独立在途实现，不借本片宣称通过。

## DOCX 视图：首轮与发现

夹具 `iS3v3GY5x7XqhkKO`，原件 `/tmp/mimir-docx-views-20261017.docx`。A4竖向/横向两节、两个标题、固定2×2表格，两列140px。

实际 Web 切换清除分页间隔；唯一 ProseMirror 保持1；无编辑时保存/撤销禁用。320px导航后正文区893px，页宽缩放0.800189按剩余正文区计算；第二标题跳转真实定位；fit动作回打印布局符合实现。

150%真实拖动边界60屏幕px，cell.colwidth正确变180逻辑px，但表格仍旧width281px/50%+50%，视觉两列仍各210.25px，发现实际阻断。checker在自有表格extension修复同事务宽度同步及原生增量保存，不改vendor或无关float/autofit语义，4文件33/33。

最终生产实测：拖前两列210.25/210.25屏幕px、总421.5；真实边界手势x394→454后270.28125/210.21875、总481.5，colwidth180/140，比例56.25/43.75。下载仅document.xml变更，tblGrid2100/2100→2700/2100 twips，tblW4200→4800。单次撤销恢复两列210.25、总421.5，导出与拖前全部ZIP条目精确。结果 `/tmp/docx-views-browser-drag-verification.json`；三个下载 before/drag/drag-undo均保留。

库基线 `/tmp/docx-views-browser-baseline.docx`；实际视图前导出 `/tmp/docx-views-browser-before.docx`。最终重载后先做print→Web→print→阅读，真实键入x未写入、contenteditable=false、save禁用；CtrlF退出阅读并聚焦查找。导航第二标题真实定位，Escape回可见文档导航。1280导航320px；420导航320px覆盖、整页scrollWidth420、具名组折叠、Escape回入口。适合页宽随真实剩余正文宽重算，缩放状态只影响呈现。

视图切换后实际下载 `/tmp/docx-views-browser-after.docx` 与before全部ZIP条目精确（`/tmp/docx-views-browser-noop-verification.json`），保存/撤销仍禁用。随后才执行拖宽与撤销；全程未保存库，重新拉取 `/tmp/docx-views-browser-library-after.docx` 与库baseline逐字节一致。撤销后dirty布尔仍可能true，不据此宣称干净。未实现split或可编辑大纲，不把标题导航称作可编辑大纲。

## PDF 涂黑副本：真实画布与下载通过

新夹具 `7wByk5tu1_660tNu`，`/tmp/mimir-pdf-redaction-20261017.pdf`。四页：中间文字、独立红蓝图像、Rotate90+offset CropBox文字、非目标页。精确区域 `/tmp/mimir-pdf-redaction-20261017.json`。

宿主独立检查16/16，UI独立7文件103/103。checker修跨分类Escape回焦BODY：仅来源section卸载后回可见开启tab，不破坏同组busy完成后延迟回焦。最终Web构建已包含该修复。

实际浏览器50%画布以原生pointer拖出三页目标，标记跨页保留。第三页Rotate90+CropBox[30,20,370,280]屏幕框确实覆盖ROTATED-SECRET；导出仅一次下载，保存/撤销/重做保持禁用，成功状态显示3区域。输出 `/tmp/mimir-pdf-redaction-browser-20261017.pdf` 3388bytes。

独立验证 `/tmp/mimir-redaction-browser-verification.mts` 与 `/tmp/mimir-redaction-browser-verification-20261017.json`：4页、目标文字SECRET消失、全部间接对象/解压流无SECRET及十六进制形式、相邻文字/第四页保留、唯一192byte图像左半全部白像素而右半蓝像素保留、仅一个完整startxref，7/7。Poppler渲染四页 `/tmp/mimir-redaction-browser-render-{1..4}.png` 已逐页目视，实际黑填充、蓝半图、旋转public文字及第四页正确。库文件重新拉取3583bytes与原件逐字节相同。

最终1280/420：320px面板、420整页scrollWidth420，内部content底639.36、固定54pxfooter到底693.36；三条列表/删除、清空和单一导出可见。切“开始”翻页后Escape回可见“编辑”tab；再次开启标记0，不复活已关闭草稿。迟到/双击/保存取消/四Rotate坐标与100预算由actual Editor专项独立检查覆盖，没有把未发生的浏览器竞态宣称为浏览器操作。

## 构建、截图和边界

Web最终 `/tmp/mimir-group-views-redaction-web-final-20261017.log` exit0；初次 `/tmp/mimir-group-views-redaction-web-build-20261017.log` 亦exit0。既有WaveDrom eval/dynamic import警告仍在，不称零警告。

受控全Office `/tmp/mimir-group-views-redaction-office-full-20261017.log`：161文件1658项，160文件1657通过，**1项失败**为并行在途图片格式的unknown TIFF codec拒绝回归（`pptx-image-info.test.ts:99`，预期throw而未throw），已交该片独立checker修复；本次不能记为全套绿。本报告三切片没有失败。后续目标修复验证需另记，不以其覆盖本次失败事实。最终server4文件43/43通过，`/tmp/mimir-group-views-redaction-server-final-20261017.log`；styles和所改契约/记录diff检查通过。全仓既有480技能lint仍阻断，不重新重复跑或声称全仓green。

截图统一目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51`：`docx-views-{wide,420}.png`、`pptx-group-picture-{wide,420}.png`、`pdf-redaction-copy-{wide,420}.png`。宽屏1280×720/窄屏420×720均为真实浏览器；临时viewport已清理。

原生涂黑合同仍拒签名/表单/未知Catalog、共享命中图片/含图Form、隐藏元数据旁路等不支持结构；不是全局隐私清洗器。真实模型未配置未验、Desktop用户自验；整体未完成，不暂存/提交/归档/删除测试件。
