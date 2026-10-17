# PPTX 媒体生产浏览器验收

2026-10-17 root，localhost5180 生命周期统一构建（之后T/P/R1/Manage/S不计入此build）。文档 Ij95zCDESupIbZgd，所有媒体为仓库FFmpeg合成fixture。浏览器正常chooser，未做模型/录屏/桌面调用。

## 比例、播放与窄屏

- 实际420×500媒体Inspector320px，固定唯一插入按钮x113/y437.359/w295/h24/bottom461.359，正文内滚。portrait.m4v真实预览videoWidth180/videoHeight320、ready4，画面123.75×220保持比例；插入显示180×320，native ext2286000×4064000EMU（180×320pt），center off3429000/1397000。
- 保存后媒体 m4v13484B SHA256 6de939664aee2f29a0cb1fc327fae10e64c0a2e2bbd98aee35074bf7cb533ca6，与fixture一致。双Office音视频关系和独立封面存在。
- 媒体播放通过真实video Space启动，paused=false/time.008443；保存按钮仍disabled。关闭播放器后进入裁切；未将播放记为文稿修改。
- landscape.avi被正确提示浏览器无法预览但仍可嵌入，底部动作可达。真实插入后播放器给出PowerPoint播放说明；native media4.avi41116B SHA256 f9cc6c9e2022ded41ee050895cc892fa043edbdb9ba082574411d61d78c174d9，与fixture一致。
- 首次AVI待处理过程中页面重置、没有插入，原因未证实，不算成功；服务稳定后从持久化crop态重试完整成功。未凭该一次重置推定产品根因。

## 封面裁切和保存历史

- portrait封面真实画布拖动左手柄620.5/527→650.5/527，12.5%裁切；应用save92825B，只有slide1.xml变化，srcRect l12500，off x3714750、ext cx2000250，保留原媒体/关系/其余所有ZIPentries。源与保存文件 `/tmp/mimir-pptx-media-browser-{portrait,crop}-20261017.pptx`。
- 重开确认12.5%。属性改15%→save134365B，Undo→save与AVI加入后的12.5%态全部非目录ZIPentries精确相同；Redo→save与首次15%态全部entries精确相同，重开显示15%。文件 `/tmp/mimir-pptx-media-browser-crop15{,-undo,-redo}-20261017.pptx`。
- AVI自身save→Undo/save恢复crop态92825B全部entries一致；Redo/save恢复首次AVI态134365B全部entries一致，文件 `/tmp/mimir-pptx-media-browser-avi{,-undo,-redo}-20261017.pptx`。
- native复核来自已认证原件读取，非浏览器下载声明。真实320/420与原生历史证据补充独立检查报告，不替代后续生产修改的统一gate。

截图目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51`：pptx-media-portrait-final-420.png、pptx-media-avi-final-420.png、pptx-media-avi-inserted-420.png、pptx-media-crop-final-1280.png、pptx-media-crop-reopen-1280.png。

独立检查D范围限制保持，组内媒体裁切/任意codec播放/持久化播放设置未据此补齐；整体all-tools仍在进行。
