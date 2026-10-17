# DOCX 视图与绘图接续研究

2026-10-17，仅只读研究，不表示实现。主参考固定GenOffice480548fd55f1be3593ee0d8e316a734751d58309，本地/tmp/mimir-genoffice-html-git。WeKnora官网HTTP200保存证据及v0.8.3固定3e22822c1d2397be730c458c7539d0eb8c113a24 definitions.go见xlsx-structured-clipboard-plan-20261017.md，sandbox能力门控适用工具可执行性，不提供DOCX视图/ink保存，不作为Ribbon设计主参考。

## 确定的上游执行行为

- ribbon-tabs.tsx:1135–1190：打印布局、Web布局、大纲、阅读、整页预览。并非纯占位。App.tsx:1594根据readMode/isProtected调用editor.setEditable；阅读模式隐藏Ribbon但提供read-exit。Mimir需保留明确可退出路径和问AI历史不丢，不复制应用全局布局。
- styles.css:9511–9572：Web清纸张chrome/页眉脚，outline仅显示标题并缩进；其CSS选择器指向上游doc-page直接子标题。Mimir的EditorContent中间包层使照抄选择器不能正确隐藏正文。
- ribbon-tabs.tsx:1200–1250缩放50–200、100%、页宽/整页；:1290–1320尺标/网格/导航；:1345切split。App.tsx:6307–6333的分割仅第二个只读HTML镜像，有独立scroll，不是第二个可编辑Editor。可以按此真实语义补Mimir，不能承诺两个编辑器同步光标。
- App.tsx:6290显示InkOverlay；editor/ink.ts:1–15说明每笔锚定正文段落100%坐标，保存透明PNG浮动图，wp:docPr descr保留stroke向量以便重开擦除。ribbon-tabs.tsx:1413–1515有选择/笔/荧光/橡皮与独立笔宽颜色；不是SVG随意覆盖且不保存。

## Mimir接缝和风险

- DocxEditor唯一EditorContent必须保持挂载；usePagination目前没有enabled/view参数，始终schedule/ResizeObserver、页缝/footnotes/header/column/image装饰。Web/outline不能只用CSS隐藏纸框，否则分页仍按固定纸几何计算、把高度和选择搞乱。应该给pagination明确只读显示模式开关，离开print时完整清装饰/section sheets/column layout，返回print重新测量，不改PM内容/history。
- 阅读模式editor.setEditable(false)只阻止键盘，并不自动挡当前Toolbar/Agent写入；需明确产品语义：阅读是呈现状态，允许用户显式编辑命令前退出，或统一禁用/取消所有写入口。不能在按钮写只读同时Agent照常修改而不提示。设置不能混同DOCX原件保护。
- 大纲可用独立outline列表跳转/层级呈现；若采用上游隐藏正文的可编辑视图，必须验证PM选择/箭头/表格/脚注不会落在隐藏节点，空标题文档要有可理解状态和退出。
- 缩放应复用纸张几何测量的实际zoom适配，并验证100%坐标下图片resize/表格宽/页缝；不能只transform视觉而让pointer/measure仍用旧值。页宽/整页根据编辑容器（扣Inspector）而非viewport计算，420需可读入口。
- 分割镜像需从受控editor.getHTML生成惰性只读区域并维护文档样式scope；不要拿DOM innerHTML复制contenteditable、事件、Editor ID或分页装饰。data URL本地图片允许，不能执行外部HTML。明确镜像近似/未分页，不冒称Word完整打印预览。
- Ink数据应进PM doc根attrs及同一次事务历史，锚点随原段移动/删除处理；原件parsed inks要排除重复正文图片。保存复用engine newInkImages/removeInkIds并保留非目标parts；仍需核对实际vendoredSaveOptions与Agent snapshot包含attrs，不使用独立React数组假历史。组笔擦除按stroke、未知原生图不当橡皮可涂。

## 推荐顺序和所有权

1. 当前未保存DOCX副本导出单片，已由root实施，尚待独立检查与真实下载验收。
2. 独立视图片：root唯一DocxEditor整合，worker新DocxViewControls/样式及pagination开关与专项；先完成print/web/阅读/缩放/页宽整页及导航，再大纲/只读split。真实宽420、源JSON/原件不变、历史/selection保持。
3. 绘图片单独worker：新overlay/ink纯模型/save适配与原件测试，root配线；双保存重开、undo/redo和非目标压缩流检查、缩放/滚动/节纸张/删除锚点手势。
4. 保护和对比另片研究：上游ProtectDialog还含密码加密/写保护/编辑限制/隐私选项，不能拿session内setEditable当原件保护；compare不是简单两份textContent相等。尚未核完其原生和浏览器支持，不作实现承诺。

本研究未改生产文件或运行上游GUI；不声称现有缺口完成。
