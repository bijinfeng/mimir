# PDF 图片生产浏览器验收

2026-10-17 root，localhost5180 生命周期生产构建（后续 T/R1/Manage 修改未计入此构建），文档 I56PIa071_MpP1ts。浏览器正常 chooser 上传已授权合成240×160 PNG，未调用图片 provider。

- 420×500 实际上传预览长中文文件名；Inspector x100/y156/w320/h317.359，页面宽420。固定插入按钮 x116/y425.359/w288/h32/bottom457.359，内部滚到参数后仍可达。
- 插入 x150/y180/w120/h80 pt、文字下方，真实执行后图片数1→2，保存成功。native `/tmp/mimir-pdf-images-browser-insert-20261017.pdf`3836B：120 0 0 80 150 390矩阵，原文字与原图片290B保留，MediaBox500×650不变。
- 选择新增图片→向右90°→不透明度37%→裁切左10/上15/右5/下20，保存3048B。native `/tmp/mimir-pdf-images-browser-final-20261017.pdf`：实际0 -78 68 0 178 472矩阵，ExtGState CA/ca .37，新增图片579B、原图片290B，原文字保留。面板显示x178/y178/w68/h78，与旋转后80×120框按边裁切一致。
- 4步Undo→save：`/tmp/mimir-pdf-images-browser-undo-20261017.pdf`2207B与原baseline wholefile cmp完全相同。4步Redo→save：`/tmp/mimir-pdf-images-browser-redo-20261017.pdf`与首次最终3048B wholefile cmp完全相同。重开后画布正常、无dirty。
- 服务端原件读取用于native复核，非浏览器下载声明。搜索/生成无配置门控、9项已有操作列表与Escape回焦沿同日预验收报告；本轮未虚称真实provider或另执行替换/翻转/去背景/删除。
- 截图目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51`：`pdf-image-final-upload-420.png`、`pdf-image-final-reopen-1280.png`。

此项不等于全工具完成；E/P/S/R2与其他验收仍开放。

## 追加：水平翻转与当前版本面板缺陷

同文档/生产构建，真实420×500。图片1（裁切/90°后的68×78pt）选择水平翻转并保存3056B；native文字及另一图保留。Pypdf+PIL比较：目标156×136 raster恰为原raster垂直反射（其native矩阵0,-78,68,0意味着屏幕水平方向），另一120×80图片像素完全一致。Undo/save3048B与本次baseline整件cmp精确；Redo/save3056B与首次flip保存整件cmp精确。最终再次Undo/save，刷新当前图片列表回2张，关闭Inspector回原live入口，已保存/Undo禁用。

证据 `/tmp/mimir-pdf-images-extra-{baseline,flip,flip-undo,flip-redo}-20261017.pdf`。截图 `pdf-image-flip-extra-420.png` 与最终 `pdf-image-extra-restored-1280.png` 在本会话visualizations目录。

第一次flip请求后出现页面状态回开始且无history的异常，尚无可归因证据。重试加CDP观察，成功路径无frameNavigated，read/images/assets返回200及主动取消read；不声称此已证明异常根因/修复。

本轮发现并加入正式修复片：翻转仍显示无关素材来源挤占参数空间；Undo使snapshot按bytes失效，但面板把未读冒充0张，直到手动刷新才恢复2图。native未丢失不等于工具面板交互正确。详 `pdf-image-current-task-followup-20261017.md`，修复/独立check/新构建确认前此两项未通过。

## 当前构建复验：上述两项已结清

基于 `/tmp/mimir-toolbar-inspector-encryption-web-20261017.log` exit0 的5180生产构建，root重新操作同一文档翻转→保存→下载→Undo→保存→下载。无需刷新，Undo后面板自动显示2张图片；翻转模式不再显示上传/搜索/生成来源。

- 即时固定 `/tmp/mimir-pdf-images-current-smoke-baseline-20261017.pdf`、`…-flipped-20261017.pdf`、`…-undo-20261017.pdf`；baseline和undo均3048B，SHA256同为 `e8bfc72623c4a859d0d88ff8edee2db86a9a8b9d4e1ac142c52c174a818c256a`。flip3056B SHA256 `7f671803c5c8dd9c9068f784812707b9c5356925346e322c4834235f29d40db9`。Pypdf/PIL再次确认目标图像精确反射、另一图片像素不变；库原件已恢复baseline，保存禁用/已保存。
- 实际420×500：document.scrollWidth420，Inspector x100/y145/w320/h328.36；固定footer y412.36/h61，主操作在视口内。Escape关闭Inspector并回焦“PDF图片工具”。新截图 `pdf-image-flip-final-420-20261017.png` 位于上述绝对截图目录。
- 新构建未复现第一次flip软重置；没有足够证据声称该偶发异常根因已修复。本次未制造实际浏览器hostBusy延迟，取消/迟到零发布仍按独立组件检查的证据边界记录。


### 最终截图文件真实性复核

420截图补证：旧同名图实查是内容缩小的缩略图，现用captureBeyondViewport=false重取并实际查看正常420×500图。图片1/翻转/水平翻转和固定唯一主动作可见，无上传来源。仅选择目标与模式，未应用/未保存；关闭按钮回焦PDF图片工具，保存与history禁用，原件仍为baseline。
