# DOCX 图片/目录与 PPTX 选择剪贴板浏览器验收

2026-10-17；当前生产预览 localhost:5180。测试账号 admin@example.com。
GenOffice 固定 480548fd55f1be3593ee0d8e316a734751d58309；本片沿实现研究及当前六格式审计的具体对照。
WeKnora v0.8.3 / 3e22822c1d2397be730c458c7539d0eb8c113a24 仅作知识库/Agent权限边界参考，不作 Office Ribbon 模型。
用户已指定只验代码与浏览器；无模型配置，不声称真实模型执行；Desktop 用户自验。

## 原生验收方式

浏览器真实点击应用/保存；随后用测试账号认证读取文件 HTTP 响应至 `/tmp`，独立 Python ZIP/XML/PNG 检查。
不能用 Downloads 文件作稳定保真基线：观察到外部 CWM 程序异步添加 custom.xml，上传 fixture 原件及 raw HTTP 无此条目；未因外部加工修改生产保存逻辑。
自定义属性保真另以完整 Editor 固定 MimirHistorySentinel 测试验证，33/33 独立 DOCX 回归包含该项。
所有下述历史相等均比较解压后的每个 ZIP entry 名及字节，而非仅目标 XML。

## PPTX

文档 dAKf3a4GLfeyoVMt，显示第4页，实际原生 `ppt/slides/slide2.xml`。
对象树选择 Group5 内 Title1 与 Content Placeholder2，复制不 dirty。
粘贴作为保留父变换的独立组合，新增组合被统一选区回选，保存成功。

`/tmp/pptx-clipboard-{baseline,paste,undo,redo}.pptx`：
- paste 仅改变 slide2.xml，原组保留两个 shape 与 connector，新组两个 shape、不复制 connector。
- 父 off 从457200/274638错开为647700/465138，ext8603982/5851525及chOff/chExt不变。
- undo=baseline、redo=paste，所有 entry 相等。

重新选原组两个文本成员执行剪切：
`/tmp/pptx-clipboard-{cut,cut-undo,cut-redo,cut-paste}.pptx`：
- cut 后原组只剩原 connector；既有复制组不变。
- cut-undo=paste、cut-redo=cut，所有 entry 相等。
- 剪切 ref 跨保存、撤销/重做仍可粘贴；cut-paste 新增另一独立两子对象组并回选。
- Escape 关闭 Inspector 后焦点回真实“剪贴板”入口。
- 内部 ref 限15分钟/本窗口，系统剪贴板、外部图片、深层组合及附着连接引用不在本片。

## DOCX

专用验收库文档 xhVK5dfp4K70nFVY，本地上传 `/tmp/mimir-docx-picture-toolbar-fixture.docx`。
选中图片出现上下文“图片格式”，320px Inspector 提供尺寸/比例、旋转翻转、对齐环绕、替换/裁切/去背景与预览/显式应用。

原图30度/水平翻转保存→撤销保存→重做保存已有原生transform与raw HTTP证据；见图片实现/独立check研究。
另以真实chooser替换 `/tmp/mimir-docx-picture-pixels.png`（240×160，白底与中心蓝块），再执行四边各25%裁切：
- `/tmp/docx-picture-replaced.docx`：PNG240×160，角像素白色不透明。
- `/tmp/docx-picture-cropped.docx`：PNG120×80，角像素蓝色68/114/196不透明。
- crop-undo=replaced、crop-redo=cropped，所有entry相等。
- 撤销至replacement后用默认容差30预览去背景，再显式应用与保存：`/tmp/docx-picture-cutout.docx` PNG240×160，角像素(0,0,0,0)，保留蓝色主体。
- 同一draft修改rotation为0，原生xfrm移除rot；水平翻转在本次像素链路保持flipH1。单独点击水平翻转可使pressed false，随后重置草稿，未将未保存状态记作原生结果。
- 图片Inspector Escape回真实“图片格式”按钮。

目录“插入→目录”显示两个真实标题及位置选择，显式说明页码由Word更新。
`/tmp/docx-toc-inserted.docx`含原生instrText `TOC \\o "1-2" \\h \\z \\u`。
`docx-toc-undo.docx`=picture-cutout，`docx-toc-redo.docx`=toc-inserted，所有entry相等。
未声称现有目录更新、浏览器页码回填或拖裁切手柄完成。

## 视觉与交互

截图目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51`。
最终420截图通过CDP Page.captureScreenshot直接取得PNG420×880，DOM innerWidth/scrollWidth=420；普通tab.screenshot在本环境会重置metrics并缩放至420×383，旧缩图不能作为420验收。
图片最终420 panel x100/width320，内部scroll与固定footer可见，厘米suffix完整无挤字。
PPTX剪贴板420固定主操作底部，内容与说明换行可读；窄屏Ribbon各组仍使用既有菜单。
目录初验发现主操作随短内容停在y460，checker已将内容唯一scroll与固定footer分离、状态贴近footer，8/8及tsc/目标门禁通过；修后构建和最终420位置复验待根会话收口。
宽1280×880已通过CDP captureBeyondViewport=true稳定重绘截图（图片与剪贴板wide），避免原viewport之外旧compositor tile；320px面板、单位完整、固定footer目视通过。窄屏分组发现44–56px预算造成标签多行，root已恢复72px/单行省略/仅命令行局部overflow，独立11/11；最终构建及真实420复验待收口。

## 检查

PPTX独立Office30/30、server11/11，三包tsc及目标lint/format/styles/diff通过。
DOCX最终独立33/33，Office tsc及目标门禁通过；目录footer增量8/8为重叠证据，不累计。
最终已通过Web build `/tmp/mimir-docx-clipboard-final-web-build.log`尚未包含目录footer增量。
全仓pnpm check既存480项bundled Impeccable技能脚本lint失败，不重复跑或记全仓绿。
整体任务in_progress，不暂存、提交或归档。

## 后续浏览器准备

- 独立表格夹具 `/tmp/mimir-docx-table-design-fixture.docx` 从已有测试图片DOCX增补4×3原生表格，含LightShading-Accent1、六tblLook位和一个直接浅黄单元格，用于区分样式条件与直接格式；通过实际上传对话框加入同一专用验收库，不触及用户原件。
- XLSX `RPXy3ORlulEbxuou` 的F1:J7数据已用实际剪贴板工具输入并保存，HTTP `/tmp/xlsx-pivot-postdata-baseline.xlsx` 独立读回35格均完整，含2024/2025/2026、两部门/地区/数值列；保留原图表图片等部件。DOM简写未显示的F5/F6经native XML证实存在。
