# PPTX Ribbon 逐项实现审计（2026-10-16）

## 固定证据与判定规则

- GenOffice 固定 `480548fd55f1be3593ee0d8e316a734751d58309`；源码根目录 `apps/slides/src/renderer/`，下表 `App:n` 与 `Props:n` 为该提交的真实行号；actions 为同目录文件。公开可核对：[App.tsx](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/slides/src/renderer/App.tsx)、[Props](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/slides/src/renderer/components/ribbon-shared.tsx)、[Ribbon](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/slides/src/renderer/components/Ribbon.tsx)。本地只读checkout `/tmp/mimir-genoffice-html-git`。
- 抽取 `ribbon-shared.tsx:318–600` 的全部 **96** 个 `on*` 回调，再追 `App` 真实 wiring 和 actions；“已接”表示存在真实手动入口/执行路径，不代表所有原件、浏览器、桌面都通过。子参数差距单列；基础op可调用不能代替按钮、参数与状态验收。
- Mimir缩写均在 `packages/office/src/editors/`：E=`PptxEditor.tsx`，O=`PptxObjectControls.tsx`，D=`PptxDeckControls.tsx`，A=`PptxAdvancedControls.tsx` + `PptxChartAppearance.tsx`，M=`PptxAssetControls.tsx`，R=`PptxScreenRecordControls.tsx` + `../pptx-screen-recording.ts`，C=`PptxClipboardControls.tsx`，F=`PptxEditor.tsx` + `../pptx-format-brush.ts`，I=`PptxInsertControls.tsx`，V=`PptxViewControls.tsx`，X=`PptxOutputControls.tsx`，P=`PptxPresentation.tsx`，Master=`PptxMasterControls.tsx`，S=`PptxShapeGallery.tsx` + `pptx-shape-presets.ts`。
- WeKnora：沿主任务已核对的 `v0.8.3` / `3e22822c1d2397be730c458c7539d0eb8c113a24`、公开站点与源码证据；`internal/agent/tools/definitions.go` 用于知识库工具/权限参考，无PPTX原件/OOXML或Ribbon录屏语义。主要对标固定GenOffice；页面密度/属性编辑沿现有Office风格与主任务Obsidian外壳约束。

## 96 个回调

| # / 回调 / 声明 | App wiring / 上游实际语义 | 状态 | Mimir 真实入口 | 验证与剩余边界 |
| --- | --- | --- | --- | --- |
| 1. `onAutoSaveChange` · Props:318 | App:3129；App:453,956 setAutoSave，30秒静默保存 | 产品差异 | 底部手动保存 | R6明确不因AI自动保存；未增加自动保存开关 |
| 2. `onOpen` · Props:319 | App:3130；file openDialog→桌面文件选择 | 产品差异 | 知识库文件列表→打开 | 沿知识库文档与权限；没有编辑器内任意本机路径打开 |
| 3. `onSave` · Props:320 | App:3131；file-actions:89 flushActiveEdit→串行save | 已接 | E 底部保存到库→session.save/commit | Editor组件保存读回；失败保留dirty |
| 4. `onUndo` · Props:321 | App:3132；history undo→重渲染 | 已接 | E 快速访问撤销，Cmd/Ctrl+Z | 全画布checkpoint，输入框原生撤销；组件回归 |
| 5. `onRedo` · Props:322 | App:3133；history redo→重渲染 | 已接 | E 重做，Cmd/Ctrl+Shift+Z/Ctrl+Y | 新分支清redo；组件回归 |
| 6. `onSaveAs` · Props:323 | App:3134；file-actions:114 串行saveAs→文件对话框 | 已接，本地已验 | X 导出与打印→PPTX副本 | 真实未保存选区斜体下载mimir-range-final-copy.pptx，保留dirty/undo；undo/save下载(24)、redo/save(25)，后者与副本全部ZIP entry一致。自定文件名、取消/过期与失败回归通过 |
| 7. `onExportPdf` · Props:325 | App:3135；file-actions:200 renderSlidesToPdfPages→宿主导出 | 已接有边界 | X 导出与打印→PDF | 栅格PDF可选页与分辨率；媒体/动画不可交互，文字不可选 |
| 8. `onPrint` · Props:326 | App:3136；components/PrintDialog 打印选项与预览 | 浏览器预览已验 | X 导出与打印→打印 | full/notes/讲义2/3/6、A4纵横向/细边框、已应用备注与首页实际版面；实机6页/3张讲义为2纸，420px完整预览无iframe内滚动。字体/SVG图片解码及取消/过期回归通过；系统打印窗口由用户Desktop验收 |
| 9. `onExportImages` · Props:328 | App:3137；file-actions:146 可见页PNG | 已接 | X PNG/SVG/多页ZIP | 静态未保存画布；导出范围/分辨率；二进制测试 |
| 10. `onFormat` · Props:329 | App:3138；style-actions:28 光标execCommand、字号增减 | 已接有边界 | E 文字格式→真实字符范围/插入点/整框 | B/I/U/删除线/上下标/清除/增减字号作用于真实选区；折叠光标仅pending marks，输入才写。实机只加粗Q3并独立XML读回，选区斜体副本及history通过；统一多选/直接组成员已接Home字形控件，原子格式和真实双对象加粗history通过 |
| 11. `onZoom` · Props:331 | App:3140；previewZoom 预设缩放 | 已接 | V 适应宽度、50–200% | 纯视图不标脏；按文档区实际宽度 |
| 12. `onToggleThumbs` · Props:333 | App:3142；App setShowThumbs | 已接 | 画布侧“收起缩略图”/“显示缩略图” | root真实浏览器已反复收起/展开；视图操作不写原件 |
| 13. `onToggleAi` · Props:335 | App:3144；App toggleAi→右侧AI面板 | 已接宿主差异 | 宿主问AI | 沿当前文档ChatPanel与PPTX Agent |
| 14. `onAiPreset` · Props:338 | App:3145；pushAiPreset(...autoRun=true)，可附页截图 | 部分，草稿入口已接 | 开始→美化本页/事实核查/生成配图；幻灯片→拼写/八语言翻译 | 已接可编辑问AI草稿及稳定页定位提示，真实浏览器入口/八语言已验；无模型未验执行。截图附件管道与上游autoRun仍有差异，提示不等于宿主强制冻结目标 |
| 15. `onPickShape` · Props:340 | App:3146；insert-actions:36/73 进入点击/拖绘模式 | 已接，本地已验 | S 形状库→在画布绘制所选形状，保留默认位置直接插入 | 109项/7类、真实点击/拖绘、Shift约束与取消；实机反向箭头原生flipH/V、单次undo/save/redo/save逐entry一致；420无横溢出且Escape回形状库BUTTON |
| 16. `onInsertImage` · Props:342 | App:3147；insert-actions:93 文件选择→addImage | 已接有边界 | E 插入图片，PNG/JPEG→专用图片宿主 | 真实组件/原生媒体字节读回；上游其它图片格式未全部覆盖 |
| 17. `onFormatBackground` · Props:344 | App:3148；style-actions:270 editBackground；BgFormatPane | 已接 | 幻灯片→设置背景Inspector | 纯色/双色渐变/八纹理/原图片拉伸平铺、隐藏背景图形、重置、atomic全部应用；复杂原背景保真复制已实机下载/undo/redo验证，详见2026-10-16续记 |
| 18. `onApplyTheme` · Props:346 | App:3149；style-actions:288 applyTheme colors+fonts | 已接，本地已验 | D 主题Inspector八预设缩略图库+原件12色/字体自定义 | 点击仅选草稿，固定底部明确应用整份；实机午夜保存下载原生Midnight/12色/Calibri Light与Calibri；420无横溢出，Escape回主题BUTTON |
| 19. `onAddSlide` · Props:348 | App:3150；slide-actions addSlide→继承当前版式的空白页 | 已接 | E 幻灯片新增，当前会话结构补丁 | 组件保存重开 |
| 20. `onAddSlideWithLayout` · Props:350 | App:3152；slide-actions addSlideWithLayout(path) | 已接 | D 尺寸与版式→所选版式新建幻灯片 | 使用原件真实版式；原生保存读回 |
| 21. `onAddSection` · Props:352 | App:3151；slide-actions addSectionAt(current) | 已接 | D 分节与批注→从当前页添加具名分节 | 原生section GUID/范围/双保存 |
| 22. `onToggleFormat` · Props:358 | App:3156；App setShowFormat，关闭其它右面板 | 已接交互差异 | E 对象具名Inspector按任务打开/关闭 | 没有独立同名综合格式面板；编辑语义分布在对象属性入口 |
| 23. `onCopy` · Props:363 | App:3168；clipboard-actions copySelected | 已接有边界 | C 所选对象/当前幻灯片内部ref | 含原生媒体；15分钟会话内，不是系统Office剪贴板互通 |
| 24. `onCut` · Props:364 | App:3169；clipboard-actions cutSelected | 已接有边界 | C 原子复制再删除 | 禁止剪切末页；撤销恢复；系统剪贴板互通未齐 |
| 25. `onPaste` · Props:365 | App:3170；clipboard-actions pasteClipboard | 已接有边界 | C 保留源格式/目标主题 | 持久ref/目标校验；跨应用原生粘贴未齐 |
| 26. `onFormatBrushClick` · Props:371 | App:3173；clipboard-actions:229–315 单次复制/应用格式 | 已接有边界 | F 复制格式/应用到所选，单次 | 填充/描边/字体/对齐原生写入；固定上游format-brush.ts:49本身也不复制渐变/图片填充；复杂效果均在范围外 |
| 27. `onFormatBrushDoubleClick` · Props:373 | App:3174；clipboard-actions:229–315 连续格式刷 | 已接有边界 | F 显式连续模式，Escape退出 | 无需依赖隐式双击；复制范围同上 |
| 28. `onTextColor` · Props:375 | App:3175；style-actions 选区foreColor/overlay | 已接有边界 | E 字体颜色→真实选区/插入点/整框 | 共用formatPptxTextRange保未选run和原XML；组件原生范围/保真回归通过；多对象/组合直接成员颜色已接统一选择与Home/Inspector |
| 29. `onFontFamily` · Props:388 | App:3215；style-actions:35 选区或所有选中元素字体 | 已接有边界 | E 字体→真实选区/插入点/整框 | 选择范围内中英文字体，pending caret marks和混合当前值；保留未选run字形/链接/field/未知rPr。多对象/组合直接成员统一字体已沿Home聚合run接入，原生专项覆盖 |
| 30. `onFontSize` · Props:389 | App:3216；style-actions:52 选区字号或整对象setElementFont | 已接有边界 | E 字号/增减→真实选区/插入点/整框 | 范围字号、混合状态及caret pending marks经同一适配；组件含原生run双保存；多对象/组合直接成员字号与增减已沿Home保留各run适配接入 |
| 31. `onAlign` · Props:391 | App:3176；style-actions:88 光标或全选对象段落对齐 | 已接有边界 | O 段落与文本框→四向对齐，真实选区/光标段/整框 | 专属manual_paragraph明确paraIndices；实机仅第2段右对齐/左对齐、连续操作及保存后范围保持；统一多选Inspector补全段落对齐；真实整组两文字成员各段ctr保存读回 |
| 32. `onDirection` · Props:393 | App:3208；style-actions onDirection→rtl | 已接有边界 | O 段落与文本框→文字基础方向LTR/RTL | 多对象/组合直接成员同一原子事务支持RTL/LTR；实机整组4段rtl=0保存(65)读回 |
| 33. `onStrike` · Props:395 | App:3177；style-actions onTextToggle strike | 已接有边界 | E 删除线→真实选区/插入点/整框 | 真实字符范围和未选run保真，collapsed caret仅pending；Home聚合run支持多对象/组合直接成员，真实范围路径保持 |
| 34. `onTextToggle` · Props:397 | App:3178；style-actions:114 B/I/U，若全开则关 | 已接有边界 | E B/I/U→真实选区/插入点/整框及当前状态 | 实机Home+ShiftRight选择Q3后加粗，只有Q3原生b=1；caret末尾加粗不dirty；Q3斜体副本/undo/save/redo/save逐entry闭环通过，多对象统一选择后Home B/I/U及原生history通过 |
| 35. `onElementTextColor` · Props:399 | App:3179；style-actions:142 selected sourceIds setElementFont | 已接有边界 | E 字体颜色→真实选区/插入点/整框 | 单文本框选区字形格式已接，范围保真回归通过；统一持久ID多选/组合直接成员沿Home和Inspector提供批量颜色 |
| 36. `onFindReplace` · Props:401 | App:3180；App setFindOpen | 已接 | E 查找和替换，跨页定位 | 真实组件文字更新/高亮/替换回归 |
| 37. `onToggleAnimByParagraph` · Props:404 | App:3182；App state animByParagraph→添加时拆段 | 已接，本地已验 | 备注与放映→效果→按段落依次播放 | 实机Agenda三段淡入生成3项，下载(26)原生pgRg目标0/1/2；60段服务读回/双保存，单段沿上游整对象语义 |
| 38. `onSetLayout` · Props:406 | App:3183；slide-actions setSlideLayoutAt(current,path) | 已接 | D 尺寸与版式→应用当前页版式 | 真实原件layout；原生保存读回 |
| 39. `onResetLayout` · Props:407 | App:3186；slide-actions setSlideLayoutAt(current)→重置占位符 | 已接 | 尺寸与版式→重置本页占位符位置 | 无layout参数调用原生resetSlideLayout；标题54→84pt后reset移除explicit xfrm、文字及非占位符对象保留，原件下载已验 |
| 40. `onSlideSize` · Props:409 | App:3187；App slidesApi.setSlideSize cx/cy | 已接 | D 幻灯片宽/高与明确应用 | 原生presentation尺寸/双保存 |
| 41. `onParagraphFormat` · Props:412 | App:3207；style-actions:190 bullet/number/blip/spacing/indent | 已接有边界 | O 段落/列表/文本框三分类Inspector，局部paraIndices明确应用 | 统一多选/直接组成员补全非图片列表、方向/间距/级别；实机4段125%/段前4pt/段后6pt、编号7/90%/12pt/#4472C4保存(65)；批量图片符号替换仍未齐 |
| 42. `onInsertTable` · Props:427 | App:3217；insert-actions:106 rows/cols→addTable | 已接 | E 插入表格6×6网格→addTable | 原生table；组件/双保存 |
| 43. `onTransition` · Props:431 | App:3219；animation-actions applyTransition(kind,all) | 已接，本地已验 | 备注与放映→切换→将本页切换应用全部 | 实机下载(26)六页均native fade，原slide1 advTm13000和slide4 advTm5000保留；55页/changed:false不增版本回归通过 |
| 44. `onApplyAnimation` · Props:440 | App:3228；animation-actions applyAnimation 替换已有/none移除 | 已接，本地已验 | 效果图库点击替换/无动画清除 | 实机标题淡入→弹跳后当前1项且保存；与追加语义独立，清除/未知preset XML/默认时长及双保存回归通过 |
| 45. `onAnimHoverPreview` · Props:442 | App:3229；animation-actions hoverPreviewAnimation | 已接，本地已验 | 效果/五路径按钮350ms悬停或聚焦 | 实机键盘聚焦淡入按钮触发WAAPI；临时SVG、不dirty，段落/曲线及延迟生命周期组件回归通过，unknown效果近似 |
| 46. `onAnimHoverEnd` · Props:443 | App:3230；App setHoverAnim(null) | 已接，本地已验 | leave/blur/Escape/选择/版本/卸载停止 | 实机保Gallery焦点按Escape后动画数0、面板保留、仍焦点淡入按钮；第二Escape关闭并回Ribbon BUTTON。恢复style和清未来timer组件通过 |
| 47. `onAddAnimation` · Props:445 | App:3231；animation-actions addAnimation追加 | 已接 | A 为所选对象添加动画 | 效果/方向/段落参数及原生timing读回；复杂播放有边界 |
| 48. `onApplyMotionPath` · Props:447 | App:3232；animation-actions applyMotionPath | 已接，本地已验 | 效果→五种运动路径追加 | 实机三段淡入后追加圆形成为4项；下载(26)保完整native cubic C/Z/E路径。五预设原生保存及SVG采样回归通过；旧放映近似边界保留 |
| 49. `onAnimTiming` · Props:449 | App:3233；animation-actions patchAnimTiming | 已接 | A 开始方式/持续/延迟 | 时间修改保留原presetXML；组件原生timing读回 |
| 50. `onToggleAnimPane` · Props:452 | App:3235；App toggleAnimPane | 已接 | A 备注与放映Inspector时间线 | 有当前值、关闭/Escape/回焦；详见样式人工验收 |
| 51. `onAnimPreview` · Props:456 | App:3237；App setAnimPreview+1→画布动画 | 已接，本地已验 | Inspector预览本页/停止预览 | 实机timeline启动paragraph0/500ms动画，未来动画按timer延迟创建；Escape先停再关。unknown preset近似，编辑预览不自动启动媒体 |
| 52. `onSlideShow` · Props:458 | App:3238；show-actions:20 fromStart跳过隐藏页 | 已接 | 放映→从头/从当前页放映 | 真实播放、导航、退出回焦；隐藏页跳过，复杂动画仍近似 |
| 53. `onPresenterView` · Props:460 | App:3239；show-actions:92 当前/下一页/备注/计时 | 已接有边界 | 放映→当前/从头演讲者视图 | 两入口已接；仍为单窗口，非独立双屏 |
| 54. `onCustomShow` · Props:462 | App:3240；App CustomShowDialog→show-actions:36/48 | 已接 | 放映→自定义放映与排练 | 具名列表、选页排序、保存删除、按文稿与原生path持久化；重载与插入summary后仍正确找到Agenda并回焦；与上游一样localStorage，非PPTX customShow |
| 55. `onRehearse` · Props:464 | App:3241；show-actions:63/73/78 记录停留→确认写advTm | 已接 | 自定义放映与排练→排练计时/确认应用/丢弃 | 末页与重复访问累计；实际13/5秒原生advTm，save→undo/save→redo/save下载逐entry一致；版本/路径过期保护 |
| 56. `onToggleHidden` · Props:468 | App:3243；show-actions setSlidesHidden | 已接 | E 页面→放映隐藏/显示本页 | 原生show属性/组件读回 |
| 57. `onInkTool` · Props:471 | App:3245；App onInkTool，ink.ts/arrange clearInk | 已接 | E 绘图→选择/笔/荧光笔/整笔擦除 | 真实指针、PNG+aislides-ink metadata保存/reload/undo已验；不是InkML |
| 58. `onInkPen` · Props:473 | App:3247；App setInkPen→绘制状态 | 已接 | 绘图→笔迹设置 | 10色/4档笔宽/5个持久预设；宽420/回焦已验 |
| 59. `onInkHighlighter` · Props:475 | App:3249；App setInkHighlighter | 已接 | 绘图→荧光笔设置 | 10色/6、10、16宽；透明PNG/元数据独立读回 |
| 60. `onInkClearAll` · Props:479 | App:3251；arrange-actions clearInk | 已接 | 绘图→清除本页笔迹 | 清除/undo/redo/save/reload真实验证；不删普通对象 |
| 61. `onViewMode` · Props:482 | App:3253；normal/outline/sorter/reading | 已接 | 视图→工作区模式 | 普通/大纲/多选浏览排序/阅读已接；原生排序保序/一步history与真实宽420验证 |
| 62. `onSlideMaster` · Props:484 | App:3254；App enterMasterView→原生母版/版式part | 已接有边界 | Master 视图→母版编辑 | 真实part预览/文字/填充/位置/边框/删除，100part/16MiB预览上限 |
| 63. `onZoomFit` · Props:486 | App:3255；App zoomToFit | 已接 | V 适应宽度 | 真实文档区响应；纯视图不dirty |
| 64. `onToggleRuler` · Props:488 | App:3257；App setShowRuler | 已接 | V 标尺 | 英寸辅助overlay，不写入或导出 |
| 65. `onToggleGrid` · Props:490 | App:3259；App setShowGrid | 已接 | V 网格 | 0.5英寸overlay，不写入或导出 |
| 66. `onToggleGuides` · Props:492 | App:3261；App setShowGuides | 已接 | V 参考线 | 中心十字overlay，不写入或导出 |
| 67. `onToggleNotes` · Props:495 | App:3263；App setShowNotes，下方原生notes pane | 已接交互差异 | A 备注与放映→演讲者备注 | 当前页可读写原生notes；持续Inspector取代下方面板 |
| 68. `onToggleComments` · Props:498 | App:3265；App openComments(false) | 已接交互差异 | D 分节与批注→本页批注列表 | 原生读取/新增/删除；宿主Inspector取代专用侧栏 |
| 69. `onNewComment` · Props:500 | App:3266；App openComments(true)并focus | 已接，本地已验 | D 新批注→添加本页批注 | 独立新建批注入口与Ctrl/⌘+Alt+M自动聚焦；添加清草稿、保存保留下一条草稿、Escape回实际来源；实机(72)原生批注与宽/420通过 |
| 70. `onInsertIcon` · Props:505 | App:3268；insert-actions:129 SVG图标栅格PNG | 已接，本地已验 | 图标Inspector完整28项固定上游图形/分类/中英检索/键盘/颜色/尺寸 | 图形body与固定上游28/28相同；实机蓝色火箭96pt保存下载，透明PNG512×512、42782纯色不透明像素为#4472C4，原生picture宽高1219200EMU |
| 71. `onInsertChart` · Props:507 | App:3269；insert-actions:167 12类型+示例数据 | 已接，本地已验 | 插入图表Inspector十二类，用户输入类别/数值及双系列组合图 | 十二类组件原生保存读回；实机组合图下载(47)含barChart+lineChart，营收12/20/16与目标15/18/22；具名字段/固定底部操作/420通过，不生成虚构业务数据 |
| 72. `onInsertSmartArt` · Props:509 | App:3270；insert-actions:190 addSmartArt形状组合 | 已接有边界 | I 图示7布局→原生可编辑组合 | 和固定上游一样非原生SmartArt数据模型 |
| 73. `onInsertWordArt` · Props:511 | App:3271；insert-actions:211 预设文字/填充/描边 | 已接 | I 艺术字12预设与预览 | 原生文字；非完整WordArt变形编辑器 |
| 74. `onInsertField` · Props:513 | App:3272；insert-actions:249 datetime/slidenum | 已接 | I 动态字段→日期/页码 | 原生a:fld；PowerPoint刷新，双保存 |
| 75. `onOpenLink` · Props:515 | App:3273；insert-actions:283/298 link dialog→setLink | 已接 | O 对象链接URL/目标页/放映动作/移除 | 真实关系和动作保存读回；地址校验 |
| 76. `onOpenZoom` · Props:517 | App:3274；zoom-actions:102/108/213 快照picture+跳转关系 | 已接 | 插入→缩放导航Inspector | Slide/Section/Summary选页与640px真实画布快照，内部跳转、summary新页及p14分节已实际下载验证；Slide放映点击跳转已验，与固定上游一样非p14 Zoom扩展 |
| 77. `onOpenHeaderFooter` · Props:524 | App:3278；insert-actions:324/329 getHeaderFooter/setHeaderFooter | 已接有边界 | D 页脚文字/日期/动态日期/页码→所有幻灯片 | 四个固定上游字段footer/slideNum/date/dateAuto均有入口；原生字段双保存读回 |
| 78. `onOpenEquation` · Props:526 | App:3279；insert-actions:350 文本近似Cambria Math | 已接且扩展 | I 公式→OMML+MathML预览 | 原生OMML双保存；画布线性文字；复杂公式渲染仍有限 |
| 79. `onInsertMedia` · Props:528 | App:3280；insert-actions:380 系统选择音频/视频→原生关系 | 已接有边界 | M 音视频→本地预览/封面/明确插入/播放器 | 32MiB；真实WAV/WebM二进制与原生video/audio/media关系双保存 |
| 80. `onInsertModel3d` · Props:530 | App:3281；insert-actions:433 GLB+poster placeholder | 已接有边界 | M 3D模型→真实GLB预览、视角封面；对象3D预览 | 原件精确GLB附件+PNG；非PowerPoint原生am3d，与固定上游占位语义一致 |
| 81. `onToggleScreenRecord` · Props:533 | App:3283；insert-actions:444 getDisplayMedia→WebM→addMediaBytes | 已接待系统验收 | R 插入→屏幕录制→选择/停止/预览/明确插入 | 静音、32MiB/10分钟、关闭停止全部track、迟到授权丢弃；录屏6例生命周期/组件测试，实际系统chooser待人工 |
| 82. `onPictureCrop` · Props:551 | App:3425；picture-edit-actions startCrop→交互拖裁切 | 已接有边界 | 图片裁切Inspector→画布八手柄/键盘微调/恢复/应用/取消 | 实机旋转90°图片裁去左10.416%，原生srcRect+box保持源比例；save→undo/save→redo/save逐entry恢复。仅顶层普通图片，媒体/复杂3D/缺失源明确禁用；组内另列 |
| 83. `onPictureOpacity` · Props:555 | App:3430；App editPictureOpacity(opacity) | 已接，本地已验 | 图片外观→任意0–100%数值 | 实机37%保存下载原生alphaModFix amt37000，当前态37；保留裁切和旋转 |
| 84. `onPictureCutout` · Props:557 | App:3427；picture-edit-actions startCutout容差预览/应用 | 已接有边界 | M 图片去背景→原图/结果/容差/替换 | 固定版边缘泛洪算法；非语义前景分割，保留裁切 |
| 85. `onPictureReplace` · Props:559 | App:3428；picture-edit-actions replacePicture | 已接有边界 | E 替换选中图片PNG/JPEG | 对象身份/裁切保持；其它源格式与系统拖放未齐 |
| 86. `onPictureRotate` · Props:561 | App:3429；picture-edit-actions rotateSelected±90 | 已接，本地已验 | 图片外观→任意角度及左右90°快捷按钮 | 实机向右90°原生rot5400000；裁切键盘按屏幕方向变换，取消回实际Ribbon按钮 |
| 87. `onPictureStroke` · Props:565 | App:3292；App 遍历shape/picture/group child→editStroke | 已接，本地已验 | 对象轮廓Inspector→宽度/颜色alpha/11线型/端点/连接/复合线条 | 单对象完整参数及统一多选/直接组成员批量均接；实机3对象dashDot/rnd/round/dbl保存(66)，undo(67)=(65)、redo(68)=(66)全ZIP相同；未改箭头/渐变保留专项通过 |
| 88. `onChangeShape` · Props:567 | App:3315；App changeShape(prst,groupId) | 部分 | S 形状库→完整图库/更改选中形状/几何调节 | 104非线条预设可更改，5线条alias仅插入；统一位置与形状Inspector支持单个顶层/直接组成员，父组合局部坐标明确；组内42pt/15°/水平flip实机(69)及history通过，多对象几何预设仍未齐 |
| 89. `onShapeStyle` · Props:569 | App:3329；App顺序editFill+editStroke，保留宽度 | 已接有边界 | 单对象形状库与统一选择→外观→组合样式，32预设 | 顶层/直接组成员批量一次事务，保留宽度/端点/箭头；connector仅stroke；实机76/77/78完整history，深层写入未齐 |
| 90. `onShapeFill` · Props:571 | App:3369；solid/none/gradient，组透一层 | 已接有边界 | 单对象与统一选择→外观→填充 | 顶层/直接组成员纯色/无填充/2–16色标渐变/八纹理及current图模式已接；实机75三stop/alpha/角度，connector明确不参与fill；深层组未齐 |
| 91. `onShapeFillImage` · Props:574 | App:3390；stretch/tile+texture | 已接有边界 | 单对象、背景和统一选择→八纹理/各自当前图片模式 | 专用selection manual_fill严格目标/原图/hash/一次事务，实机79木纹与80/81/82原生history，媒体去重；任意上传/深层目标仍另列 |
| 92. `onEditTableStyle` · Props:578 | App:3436；style-actions:311 editTableStyle→重选对象 | 本地已验 | E 对象→编辑表格Inspector→内容/布局/样式；8preset、rtl、目标格/全表底纹、all/none宽色及6flags | 新12例组件→原生runTxn→双保存XML；完整Editor67例。root真实8预设/RTL/目标格格式/保存历史/下载XML及420回焦已通过；固定上游仅all/none，其余四边框非对标要求 |
| 93. `onEditChart` · Props:584 | App:3439；style-actions:334 editChart→重选对象 | 已接有边界 | A 对象→编辑图表Inspector：样式/配色/数据 | 12类型、10预设(非柱隐藏2)、4palette+theme、legend/labels/grid/axis/gap/hole/series/point；6实际UI→原生双保存测试；高级原件转换需确认 |
| 94. `onOpenChartDataDialog` · Props:586 | App:3440；style-actions:352 getChartData→ChartDataDialog | 已接交互差异 | A 编辑图表→数据分类 | ≤200类别/20系列、系列增删、单系列编辑、单独切换行列；失败跨分类保草稿，底部应用常驻 |
| 95. `onArrange` · Props:588 | App:3441；arrange-actions alignSelected：6对齐+2分布 | 已接有边界 | O 多对象排列→参照/对齐/分布/组合 | 画布修饰键/空白框选、键盘及对象树共用持久ID集合，排列共用选择；原生几何/双保存与实际框选3对象已验 |
| 96. `onFlip` · Props:600 | App:3442；arrange-actions flipSelected | 已接有边界 | 对象水平/垂直翻转与直接组成员几何 | 裸Agent group flip宿主同步flush已修，真实10/10与geometry5/5验证，flip后ungroup/duplicate可持久化；深层组未齐 |

## 子菜单参数专项（不由96总数替代）

| 子菜单 | 固定上游实际参数 | Mimir 当前覆盖 / 真实缺项 |
| --- | --- | --- |
| 图表设计 | Ribbon:435–484 10样式；653–660 配色；2820–3045 标题/轴/图例/标签/网格/切行列/数据/类型 | 本切片补普通柱形/柱线组合10样式(不含柱形的图表8)、4固定配色+真实文档theme、系列/点色、轴标题、柱距/方向、孔径、系列增删与切行列；解析variant从holePct/pseudo3D/grouping/plotKind恢复当前类型。主题派生多种变体色板、自定义任意色值入口未齐。保留原件特殊图表需确认转换。 |
| 图表交互 | upstream 设计小菜单+数据dialog | 样式/配色/数据三个具名分类；可见字段label，每次只编辑一个系列；底部独立flex主按钮不随内容滚走；左右/Home/End键切分类，跨分类保草稿。关闭/Escape沿Inspector回焦。 |
| 形状图库/样式 | ShapeGalleryContent + ribbon-shared:101–139；8accent×4行=32样式 | 完整109项/7分类与32组合预设已接右Inspector，具名搜索/预览/方向键roving与固定底部动作；当前几何/样式或自定义状态可见。点击/拖绘与Shift约束已接并实际保存、历史及420取消回焦通过；组内/多对象批量仍单列缺口。 |
| 填充/纹理 | Ribbon ShapeFillPopover支持solid/none/gradient；745–754八种texture+上传 | 已接多色标形状渐变、八渐变预设、八原纹理、原图片stretch/tile及背景双色渐变/隐藏图形/重置/atomic全部；复杂原背景完整复制到全部已实现并有真实原件/历史证据。 |
| 表格设计 | Ribbon:385–427八样式；2690–2815 firstRow/bandRow/rtl、整表或活动格底纹、边框**all/none**和宽度/颜色；vendor TableStyleEdit/table-ops也仅all/none | 已接8样式缩略gallery、RTL、6flags、显式逻辑行列活动格/全表底纹和all/none宽色；内容/布局/样式三分类Inspector，可见label、当前值、并排行列、固定底部提交、键盘分类/关闭回焦。12例组件原生双保存与Editor67回归通过；浏览器待父会话记录。此前outer/inner/horizontal/vertical对标缺口为误判，撤回；这些只是可选扩展。 |
| 段落 | Props:410–427 char/number/blip、numType/startAt、bulletFont/hang/size/color、行距/段前后/缩进 | 真实选区/光标段/整框、四向对齐/rtl/间距/层级；9种编号和起始值、符号字符/字体/大小/颜色/悬挂、PNG/JPEG图片符号已接。固定footer明确应用、混合值仅改所编字段；真实连续apply及save后范围保持、原生仅第2段与历史闭环通过。 |
| 动画与切换 | Ribbon:257–322 gallery、5路径预设、悬停/整页preview、应用全部、时间线 | 原生效果/时间线保留；图库替换/none、独立追加、自动逐段、五路径、hover/focus与编辑画布preview、切换全部代码已接，native与组件专项见20261017研究，实际浏览器由根会话补证。未知效果近似、完整媒体时间线及旧放映复杂路径仍单列边界。 |
| 绘图 | Ribbon:208–253，10色、笔宽1/2/3.5/5、荧光宽6/10/16、eraser/clear、预设持久化 | 编辑画布真实pointer采样、透明PNG+相对点列metadata、整笔擦除/清空/预设已接；真实实拖/保存/reload/undo已验，非InkML。 |
| 放映/视图 | show-actions:20/36/48/63/78/92；App:1980四视图 | 从头/当前/单窗演讲者、自定义列表、真实排练确认advTm、隐藏页和普通/大纲/排序/阅读四视图已接；浏览器与原生保存证据见续记。独立双屏与复杂动画播放保留边界。 |
| Zoom | zoom-actions:102/108/213 快照picture+跳转，summary新页+分节 | 三种Zoom已接并实机保存下载：slide PNG内部关系、section首页、summary新增页及分节。非画布缩放，非PowerPoint原生Zoom扩展。 |
| AI快捷命令 | RibbonHomeTab:234/247/260；Ribbon:2490/2527，translate8语言 | 现有PPTX Agent可受自然语言要求；美化附当前页截图、事实核查/配图/拼写/翻译预设和立即执行交互未接。 |
| 录屏 | insert-actions:444–520 getDisplayMedia({video:true,audio:false})，WebM录制后原生插入 | 本切片显式开始→停止→本地预览→明确插入；关闭/切页/文档或版本变化停止全部track和预览，迟到权限结果立即停止，32MiB/10分钟限制。与上游自动插入相比多一道真实确认。浏览器系统chooser与桌面权限仍需人工操作证据。 |

## 本切片验证证据

### 2026-10-16 表格独立复核

- 确认表格 Inspector 的持久对象 key 保留分类/第2行第2列；真实完整 Editor 预设→撤销→重做回归覆盖此路径。
- 修复确定问题：持久挂载下，撤销或 Agent 更新后仍留旧文字/样式草稿，可通过新版本 apply 闭包再次写入。新增单调 version 清文字/stylePatch，数值输入按版本/行列重置；保留导航状态。修复前回归方向仍为旧草稿“从右到左”，修复后恢复真实“从左到右”，redo 不复活草稿。
- 修复迟到成功无条件清 stylePatch：只清本次提交的同一草稿对象，新增真实 runTxn 提交后延迟返回、新源输入仍保留的回归。
- `PptxTableControls.test.tsx` 13/13 + `PptxEditor.test.tsx` 68/68（共81/81）；Office tsc、四个目标TS文件Oxlint、五文件Oxfmt、样式守卫、`git diff --check`通过。产品UI已冻结，由根会话继续实际浏览器与下载读回，不将组件结果当实机结论。
- 复核范围内无额外未修复代码问题；引擎边框能力仍为 all/none，不新增上游没有的预设。整仓 `pnpm check` 仍受已知无关 Impeccable 技能脚本lint失败阻挡，本轮未声称全仓门槛通过。
- 后续420px实机发现关闭Inspector后掉焦到BODY：折叠“属性与位置”菜单关闭会卸载“对象与幻灯片操作”内层入口，原回焦仅查该入口而失败。PptxEditor现记录Inspector来源`data-section-key`，原入口失效且焦点仍属面板时回到真实组trigger；表格/图表及advanced入口沿同一局部恢复，不改共享壳。新增420px测量→折叠组→打开表格→关闭外层菜单→内层Select首Escape→面板第二Escape的真实组件回归，修复前BODY失败，修后回到组按钮。
- 根会话随后真实420px复验通过：第一Escape只关闭Select列表；第二Escape关闭Inspector，`document.activeElement`为`aria-label="属性与位置"`的BUTTON，AX也聚焦该折叠组。最终表格13+Editor69共82/82、Office tsc与本片目标lint通过；Editor格式化纯空白完成。并行形状改动由对应checker另跑最终门槛。
- 根会话随后真实下载发现连续x/y/cx/cy提交会让旧完整框覆盖先前改动，Apply后立即Save也会触发版本冲突。局部修复选busy方案：手动宿主写与保存共用同步ref门控，覆盖完整execute/回传解析及save/commit；等待期间两处位置尺寸入口、保存、历史按钮与对象撤销禁用，显示“正在应用修改…”；同tick第二提交明确提示“正在处理文档，请稍后重试”。不将旧target/box自动排队重放。
- 新增迟延宿主四字段逐项完成→原生保存读回650/300/110/110pt、pending禁止Save、同tick重复提交拒绝、失败解锁重试回归。额外修复图库源分类已切走时无法回焦：来源组不在当前Ribbon时回到当前活动分类，新增真实组件回归。产品UI冻结，实际逐项输入/原生下载复验交根会话；没有将禁用期间未接受的输入记为执行成功。
- 最终`PptxEditor`72+表格13+图库9共94/94；Editor目标Oxlint零warning、Oxfmt、styles与diff通过。本片先前Office tsc通过，最后复跑被并行新增`pptx-svg.test.ts:138`渐变fixture缺`angleDeg`阻断，已交shape checker修复后重跑，不把该次写成通过。
- 后续完整Extended发现音频保存后完成状态丢失：精确媒体用例稳定复现`materialStatuses()`保存前1、保存后0；根因是busy helper将完成文案替换为“正在保存…”再无条件清空临时状态。仅在状态仍为该临时文案时恢复进入前的业务状态，期间新产生的状态则保留。原媒体完成计数1断言未放宽，另验证临时保存状态已退出。修后精确音频1/1与Editor/Extended/Table/Gallery四文件126/126、Office tsc、目标lint零warning/format/diff通过，产品再次冻结。

- `PptxChartControls.test.tsx` 14例：真实控件、跨分类键盘/草稿、固定样式/网格/轴标题/柱向/间距、配色/点色/重置、独立行列互换、增删系列与精确数字、圆环孔径，实际 `runTxn` 后两次保存、独立ZIP chartXML及未改theme读回。
- `PptxScreenRecordControls.test.tsx` 6例：未点击不采集、系统停止共享、迟到权限/卸载、32MiB/10分钟/空数据/拒绝授权、预览不自动上传、明确插入/失败保留/放弃回收URL。采集API为mock，输出使用真实MDN CC0 WebM字节；不能代替系统屏幕共享验收。
- `apps/server/src/test/pptx-manual-upload.test.ts` 6例：真实WebM/WAV/PNG/GLB，原生a:videoFile/p14:media与关系/MIME、媒体精确字节、两次保存、theme未改；documents依赖mock，无DB global setup。
- `PptxEditor.test.tsx` 67例回归通过，图表从“对象与幻灯片操作→编辑图表”进Inspector后按数据分类修改；确认/失败不dirty/草稿保留覆盖。
- Office/server `tsc --noEmit`通过。真实浏览器截图/保存原件读回与桌面系统录屏由父会话独立记录；这里没有把自动化mock写为两端验收通过。


## 独立复核（2026-10-16）

- 修复配色方案控件固定空值造成的当前值误导：选择暖色/主题/自定义后显示对应草稿，跨分类保持；选择“保留当前配色”可撤回尚未应用的方案，不触发原件写入。
- 修复组合柱线图被普通柱形条件漏掉的柱距与宽柱/细柱预设；组合图保持上游固定竖柱，不展示无效横向方向。真实组合图修改柱距到75并经原生XML、两次保存读回，保留lineChart和组合类型。
- 新增堆积柱、百分比堆积柱、3D柱、3D饼、圆环、柱线组合六种title-only回归；未发送kind/categories/series/dataSource，原生类型、类别和精确系列数值经两次保存保持。另覆盖方案当前值、跨分类草稿和恢复原件配色。
- 修复目标lint：图表类型选项无用spread、测试mock类型/多余expect参数、路径函数与Promise参数shadow；只读配色列表采用组件生命周期内稳定key。没有手改vendor、共享壳或跨格式代码。
- 最终独立门禁：Office图表14+录屏6+Editor67+扩展22，共4文件109/109通过；素材上传noDB专项1文件6/6通过，包含真实WebM精确媒体字节/原生video关系/MIME/两次保存。Office类型检查、7个目标TS/TSX lint零诊断、8文件格式、样式守卫、git diff检查均通过。全仓pnpm check仍有主会话已记录的无关技能脚本lint基线，未宣称全仓通过。
- 已核对的边界仍保留：固定上游index.ts:2827–2844重建时3D堆积柱会退化为2D堆积，2880–2882将右上tr图例归为r；此片不改vendor，也不宣称特殊导入图表完全保真。当前仅首次导入编辑有转换确认；若要承诺这些特例保真，需独立的chart-part补丁适配或后续固定上游升级。96回调表中缺口与子参数差距不因本片门禁通过自动消失。
- 录屏调用与生命周期通过mock验证，测试输出使用真实已有WebM样本；没有运行系统getDisplayMedia chooser或原生桌面采集，不等于真实屏幕录制E2E。真实浏览器布局、图表交互与下载读回由父会话记录。
- 实施者补核WeKnora证据：固定commit definitions.go实际读取成功13533字节；公开站点本轮HEAD20秒零响应超时，较慢ls-remote已终止。沿既有v0.8.3源码用于知识检索/权限参考，不将旧HTTP200或本轮超时改记为新站点验证成功。

### 图表真实浏览器补验

root在slide3插入原生图表“工具栏图表验收”，三类别值12/20/16；在样式/配色/数据三分类中应用宽柱gap50、网格、月份/营收（万元）轴标题、暖色方案，跨分类保草稿与当前方案可见。保存→切行列→保存；下载`01_standard_business (3).pptx`独立ZIP/XML确认3系列[12]/[20]/[16]、gap50、网格和双轴标题。原一系列颜色转置后复制到三系列均ED7D31，不声称多色。

关闭Inspector后undo转置→保存→redo→保存→reload→第3页，标题/双轴/转置类别与三系列可见，保存禁用。实际宽图`pptx-chart-inspector-final-wide.png`与420×880窄图`pptx-chart-inspector-final-420.png`，窄屏面板336px、固定底部主操作、具名标签与当前系列可达。未启动真实系统录屏，mock与真实WebM上传不能代替采集E2E。


## 2026-10-16 表格切片实施验证

- `PptxTableControls.test.tsx` 12例：八样式分别从按钮进入原生runTxn、保存两次并独立zip读回styleId/样式色；主题字节保持；RTL与目标格底纹/2.5pt红边框、未目标格XML保持、全表底纹/无底纹/无边框、失败草稿、跨分类键盘与合并保护。
- `PptxEditor.test.tsx` 67例回归：原多段多run保真/失败草稿/撤销及目标格选择不变；布局即时操作后维持分类，样式显式提交后读回。`PptxEditor`只迁入口和注册Inspector，以durable表格id保持当前分类与单元格。
- `styleName`在固定执行器中短路返回，因此预设待应用时暂收起其他样式参数，可取消或明确应用后继续细调；避免表面改多项却静默丢参数。填充/边框当前颜色含原件自定义色，混合范围明确提示；合并占位格不能直接编辑，但全表样式可用。
- Office tsc、4文件oxlint、格式、diff通过。真实截图/窄屏/黑白主题和保存下载由父会话继续；本子任务仍未完成。


### 109项形状图库与32组合样式（2026-10-16）

- 固定checkout HEAD已再核为`480548fd55f1be3593ee0d8e316a734751d58309`。`packages/ui/src/shape-gallery.tsx`实际计数为109（源码“104”注释已过时）：线条5、矩形9、基本形状37、箭头14、星形16、流程图24、标注4。几何预览沿现有vendor `pptx-render/src/preset-geometry.ts`的polygon/path/pill渠道；不修改vendor、不用占位矩形替代未知几何。5条线为原生connector插入别名，不发送别名到setShapeGeometry。
- `ribbon-shared.tsx:101–139`的8accent×4行精确匹配描边/浅填充/实心/虚线32预设。`App.tsx:3329`沿真实fill+stroke语义，Mimir用一次atomic事务同时提交，保留当前线宽（无边框时默认1pt），不改变文字/几何/主题。当前值匹配预设时显示名称，其他值如实显示自定义；没有对象时应用禁用。
- 入口`插入→形状库`改为既有右Inspector；图库/组合样式两分类，7类筛选、跨类名称/几何检索、带可读标签的4列预览。每个预览组一个Tab停靠点，方向键/Home/End选择不写画布；明确点击底部插入/更改/应用才执行。检索Escape先清检索，下一次沿宿主关闭并回焦；主动作固定、内容内部滚动，响应宽度沿现有Inspector覆盖规则。
- 草稿绑定当前session单调version/slide/target及源几何/填充/边框；外部撤销/重做/Agent修改清除旧形状和样式草稿，保持分类/检索。applyPanelOps复用宿主原版本/迟到守卫，pending期间阻止重复提交；失败不dirty、保留普通草稿。
- `PptxShapeGallery.test.tsx`9/9：109项预览/原生插入XML及两次保存、全部32样式逐项原生XML/当前值/线宽/文字/主题双保存读回、atomic第二op失败回滚、分类检索/roving、线条alias、草稿跨类、失败/抛错/重复提交/源版本切换/晚到失败。
- `PptxEditor.extended-tools.test.tsx`24/24：既有形状/几何调节回归，新增真实Editor单事务样式→保存→撤销→保存→重做→保存及当前回显、旧草稿失效、Escape回焦；失败保持当前SVG与clean save状态。以上为组件和真实文件验证；真实浏览器宽区/420px及下载读回交root单独记录，不将happy-dom当成视觉通过。
- WeKnora沿本任务已核`v0.8.3` / `3e22822c1d2397be730c458c7539d0eb8c113a24`的definitions.go/站点证据，知识检索/权限工具没有PPTX几何或OOXML组合样式入口，不作为Office图库主要模型。此片未执行新的外部站点请求，不把旧HTTP200写成本轮成功。
- 保留边界：当前默认位置插入，未提供点击/拖绘模式；当前仅单个顶层形状/文本框，未补组成员及多选统一样式；渐变/纹理不在本片范围。整体96回调对标未完成。

### 形状图库独立检查与实机反馈修复

- 根会话1280×720实际反馈：搜索“星”的图标/中文标签挤在同一行、主按钮重复文字、插入后仍显示无形状或旧矩形。检查者给每个radio增加明确纵向内容容器与两行居中标签；primary ToolbarButton仅传label避免重复；成功单项addElement后按新增持久ID选中，带文档句柄/页码/单调版本/原选区迟到守卫。
- 形状Inspector挂载key固定为当前页形状库；源版本/对象变化仍由Gallery sourceKey清草稿，从而插入后保留搜索和分类。新增“初始无选中/已有选中”两条完整Editor回归，插入五角星后立即应用紫色虚线并独立读回原生几何/颜色。原排列测试改为根据aria-pressed选择确切集合，避免新自动选中行为改变测试前提。
- 原生vendor `setStroke`内部整体替换Stroke会暂缺headEnd/tailEnd，但实际Mimir流程先宿主保存XML、再replaceFromHost解析字节、最后发布版本/历史；不能由裸runTxn诊断推断成当前画布丢端点。临时诊断已移除，追加完整Editor双箭头→紫色虚线→保存→重开→蓝色描边→再次保存回归，核对端点原生XML及解析模型。
- 独立确定的现有渲染缺口：`packages/office/src/pptx-svg.ts`连接线分支仅画path/stroke，未消费render-tree已提供的line.headEnd/tailEnd；箭头从插入开始就在SVG画布缺失，不能称作组合样式丢失。此处跨越当前图库review的renderer边界，已交根会话安排最小独立修复；未手改vendor，也未在实机期间扩改UI。
- 最终定向门禁：Gallery9+Editor扩展27共36/36通过；Office类型检查、5个TS/TSX Oxlint零诊断、6文件Oxfmt、Antd lint、样式守卫和git diff检查通过。宽区/420px截图、实际历史操作和下载读回由根会话续记；全仓pnpm check仍有已登记的无关技能脚本lint基线，不宣称全仓或完整PPTX对标完成。

### 表格实际浏览器与下载证据

root逐项应用8预设，每项当前样式/选中态与样式分类保留正确。完整边框保存下载(4)独立读回9格各四边黑1pt。最终橙色标题行→明确选择2行2列→RTL+浅绿底纹+蓝2.5pt四边→保存下载(5)，原生XML仅该格有直接格式、其余8格tcPr空，rtl=1、custom style000004、原文字保持。保存后undo并保存→redo并保存，面板同步LTR/0.75→RTL/2.5且所选行列/分类保留。宽/420成品见`pptx-table-inspector-final-{wide,420}.png`，body420无横溢出、底部主操作可达。嵌套Escape第二次关闭后焦点BODY的问题另交checker修复；此时尚未记键盘回焦通过。详细证据见横向审查validation-20261016-continuation.md。

表格420回焦修复已主会话实测通过：从折叠“属性与位置”入口打开，第一Escape收行Select、第二Escape关闭Inspector，AX及document.activeElement均回到真实可见属性与位置BUTTON。以data-section-key记录来源组，旧菜单入口卸载也可恢复；最终独立Table13+Editor69=82/82与Office tsc/目标lint通过，未再将BODY误记回焦成功。

### SVG连接线端点渲染补齐（2026-10-16）

- 最小边界为Mimir的`src/pptx-svg.ts`连接线分支：原生端点解析/保存均正常，原SVG只画线身，未消费`line.headEnd/tailEnd`。不改vendor、Editor、图库或保存适配器；保留文件中既有的媒体/效果/namespace改动。
- 新增原生SVG marker，支持triangle、stealth、diamond、oval、开放V形arrow；使用render-tree已解析的独立宽度/长度与userSpaceOnUse，首尾各自引用唯一namespace ID。`auto-start-reverse`依真实path切线定向，起点向外；marker无裁切、实心或开放端点保持线色/alpha，线身保留虚线，端点不被切成虚线。填充端点复用已解析渐变定义。
- 连接线path补用框中心rotation；flip继续沿build-slide已烘焙points，避免二次镜像。并修正原曲线对非零起点重复相加：实际`connectorBezier()`产出绝对local控制点（非相对起点），原SVG在flip后多加一次points[0/1]导致终点移位；现直读控制点和曲线终点。无端点/无描边/零宽线/不足两点不生成箭头。
- 新`pptx-svg.test.ts`9例包括五类端点精确几何/颜色/透明度/虚线、首尾及曲线/旋转、gradient、不可见线和原生PPTX模型经buildRenderSlide的straight/bent/curved×四种flip×480/960宽度共24组合。原生sm/lg端点尺寸、旋转30°、曲线真实终点、XML有效性及canvas/thumbnail ID隔离均覆盖。
- 门禁：`vitest run src/pptx-svg.test.ts src/pptx.test.ts src/pptx-output.test.ts`三文件27/27；Office `tsc --noEmit`、两文件Oxlint零诊断、Oxfmt check与目标diff check通过。未新开外部调研；沿本任务固定上游与已登记WeKnora适用边界。真实浏览器箭头与下载展示由主会话接续，未将SVG字符串测试记作实机视觉验收；全仓pnpm check基线及整体工具差距保持原记录。

### 四工作区视图补齐与接缝（2026-10-16）

- 主参考固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，本轮`git rev-parse HEAD`复核一致。具体源证据：`apps/slides/src/renderer/App.tsx:181` outlineOf选择最大字号、同字号顶部文字作标题；1980 onViewMode清选择；2111共享缩略图/排序拖动，选择块保序；3526–3645实现应用内reading、sorter双击回编辑与outline旁编辑画布；`components/Ribbon.tsx:2574–2609`四视图入口。Mimir据此补齐四模式，未用独立全屏放映替代阅读或排序。
- WeKnora沿已核`v0.8.3` / `3e22822c1d2397be730c458c7539d0eb8c113a24`及本矩阵原definitions.go/站点证据；其工具用于知识检索/Agent与权限，不提供PPTX排序/阅读工作区模型，因此Office视图主参考为上述GenOffice。本片未重复站点请求，不将旧HTTP200当作新探测。
- `视图→演示文稿视图`四短标签及当前态；大纲真实标题/全文行导航并保留原可编辑stage，窄容器置顶；浏览持久路径多选、范围/全选、前后移动/Alt+左右、拖放与双击/Enter回普通。排序走既有受控handle.apply_ops的本地moveSlide原子批次，不额外要求HTTP宿主，保存、撤销/重做沿原history。
- 应用内阅读按容器可用宽高保原件比例，原页图保持完整；方向键/Home/End/PageUp/PageDown局部翻页，Escape回普通及折叠模式来源组焦点。纯视图/导航不dirty。预检发现未选白纸与背景融为一体，改用实际`--me-stage-bg`及每页轻纸边，不使用不存在的`--me-canvas`。
- Editor同时整合独立fill/ink代理组件，右Inspector长填充/背景表单与原图填充并存，绘图独立tab/overlay；持久key与单调version、当前页/选中对象校验保护面板异步结果。笔迹提交捕获版本/signal，切阅读卸载后abort，迟到结果不能更改当前版本/dirty/history。
- 定向组件/原生字节与最终门禁见主会话validation-20261016-continuation.md及下方续记；实机由主会话统一记录，未把测试当真实浏览器，完整PPTX对标未完成。

### 2026-10-16 填充与背景 Inspector 实现交接

专门的形状填充/设置背景面板已接入：纯色/无填充、多色标形状渐变、八种固定版渐变预设、八张原始纹理（Apache-2.0 固定资源），背景双色渐变、原图片拉伸/平铺、隐藏背景图形、重置和 atomic 全部应用。源版本/目标/页/卸载均阻止迟到纹理读取提交，底部动作固定，沿现有320px Inspector。8/8 UI+原生字节回归通过；当前复杂原背景保真复制未实现，未编辑时禁用 applyAll 并明确原因，用户需先明确选择双色草稿。详细证据与验证限制见主任务 `research/pptx-fill-background-20261016.md`；等待根会话实际宽/420px/保存刷新验收，不把本片标为全部工具完备。

### 2026-10-16 PPTX 绘图补全（实现与定向验证，真实浏览器待根会话）

- 固定上游 `480548fd55f1be3593ee0d8e316a734751d58309` 已按本地 checkout HEAD 核对：`apps/slides/src/renderer/ink.ts` 7–14、193–239 与 `arrange-actions.ts` 223–243；`slides-main.ts` 3563–3596 将笔迹写成透明 PNG 的 `p:pic`，`cNvPr name` 使用 `aislides-ink` 前缀、`descr` 存 v1 矢量点列。此处是与上游相同的图片+可编辑笔迹元数据，不是 PowerPoint InkML。
- 现有 Mimir 不应借助一般图形删除模拟橡皮擦。本次增加专属 `manual_ink` 严格合同/宿主 action，沿既有已鉴权 current-bytes 请求、版本守卫、atomic `runTxn(addPicture/deleteElement)`、保存和历史路径；通用 Agent `addPicture` 仍不开放。擦除/清空只处理当前页具有正确前缀和可解码 payload 的图片，混入普通图片/失效 ID 时整批拒绝。
- 绘图分组提供选择、5 个独立笔预设、橡皮擦、240px 笔迹设置菜单、本页笔迹清除；10 色，笔宽 1/2/3.5/5px，荧光笔宽 6/10/16px、不透明度45%，预设分别持久化到浏览器本地偏好。颜色和粗细有真实当前值；预设更改后辅助名称使用实际值。
- 画布按实际缩放将 pointer/coalesced samples 映射至页面坐标；单笔单事务，透明2倍PNG和相对矢量点列共同保存。整笔擦除使用点列而非矩形，并兼容移动、缩放、旋转/翻转；快速指针跨过细线也能命中。普通图片不参与擦除。
- 第二指针、重复提交和 pending 重入被拒绝；pointercancel、失焦、Escape、换页/源版本/工具变化清除旧草稿，卸载取消挂起请求，提交携带起笔版本和 AbortSignal。Canvas 源身份使用 key 单调版本隔离，A→B→A 不复活旧采样。失败提示保留原有内容；采样/PNG/像素/JSON预算超限明确失败，不静默截短或成功。
- `apps/server/src/test/pptx-manual-ink.test.ts` **5/5**：独立 ZIP/XML 核对媒体引用、坐标和 v1 payload，Office 保存两次后重新解析；普通图片/主题保留、混合非法目标原子拒绝、当前页清除不影响另页、Agent 版本/整轮回退、取消/未授权文档/坏PNG、HTTP action 注册。
- Office 定向4文件 **15/15**：`pptx-ink.test.ts`、`PptxInkCanvas.test.tsx`、`PptxInkControls.test.tsx`、既有 `agent/pptx-agent.test.ts`。覆盖scaled samples、45% raster alpha、pointercancel/blur/Escape/换页/版本、第二指针、pending、迟到结果、失败、快速擦除和持久预设。
- server tsc 已通过。目标 Oxlint/Oxfmt、样式反引号、`git diff --check` 通过。Office tsc 在视图所有者同步新测试 raster mock import 后最终通过；不把此处组件与字节验证当成主会话实拖/窄屏/下载后的证据。
- WeKnora 必查项复用同日 `10-16-genoffice-editor-capability-audit/research/toolbar-assessment.md` 的具体证据：站点HTTP200、v0.8.3 commit `3e22822c1d2397be730c458c7539d0eb8c113a24`，`internal/agent/tools/definitions.go` 的知识检索/文档读取/wiki写入；适用于 Agent 注册/权限分界，没有 Office 手写画布或 PPTX 笔迹保存合同。本片主参考保持固定 GenOffice。

四视图实施最终冻结：`vitest run src/editors/PptxEditor.workspace-views.test.tsx`7/7通过；原Editor与extended两文件99例在同产品代码合跑通过（当时仅新workspace测试因ink raster函数迁移后的旧spy import失败；已修import并复跑workspace7/7，不将失败合跑称全绿）。Office `tsc --noEmit`最终exit0；四TS/TSX Oxlint零诊断、五文件Oxfmt、三组件Antd lint、样式守卫与目标diff-check均通过。主会话已反馈阅读宽/420预检与Escape折叠组回焦通过，最终排序、填充、绘图实机与独立check交主会话；此片已冻结，不扩大可选验证或勾选整体完成。


### PPTX 视图/填充/绘图独立检查（2026-10-16）

- 独立复核四视图排序/阅读及Editor接缝、填充/背景Inspector与八原图资源窄同步、绘图pointer→schema→宿主→原生PNG+v1 descr保存与取消/版本路径；没有手改vendor、全量同步或修改其他格式。
- 修复填充卡片样式选择器：ToolbarButton实际为`.me-tb`，原`.me-btn`未命中，使纹理/渐变预览卡片没有预期56/62px最小高度。仅修本片两处选择器，实际宽/420px视觉仍由root复验。
- 修复过期纹理读取失败仍发布到当前版本的错误：catch与成功分支统一校验原epoch仍存活。新增迟到reject在版本改变后不显示旧错误、当前失败仍显示并可重试回归，保留原有版本/卸载不提交回归。
- 同步唯一跨格式合同document-agent.md，明确manual_ink专属手动动作、PNG+aislides-ink/v1 descr、只擦当前页可识别笔迹、混合非法目标原子拒绝和单笔历史/取消；未注册为模型工具，不宣称InkML。
- 最终`pnpm --filter @mimir/office exec vitest run src/editors/PptxEditor.workspace-views.test.tsx src/editors/PptxFillControls.test.tsx src/editors/PptxInkCanvas.test.tsx src/editors/PptxInkControls.test.tsx src/pptx-ink.test.ts src/agent/pptx-agent.test.ts src/editors/PptxEditor.test.tsx src/editors/PptxEditor.extended-tools.test.tsx`：8文件130/130。日志`/tmp/pptx-three-slice-check-tests-final.log`。
- `pnpm --filter @mimir/server exec vitest run --config /tmp/pptx-three-slice-vitest.config.mjs src/test/pptx-manual-ink.test.ts`：1文件5/5。临时配置仅node/fileParallelism=false、无DB global setup，documents依赖mock；原生ZIP/XML/双保存和route合同为真实字节，不等同已登录真实浏览器。日志`/tmp/pptx-three-slice-server-tests.log`。
- Office/Server/Shared `typecheck`均exit0；Office修复后再跑exit0。21个TS/TSX/MJS目标Oxlint零诊断、25文件Oxfmt、五组件分别Antd lint零项、styles守卫与目标diff check通过。Antd CLI首次多文件参数报错后改逐文件执行，未把报错写成功。
- 八PNG `sync-upstream --asset <已声明资源> ... --check` exit0，核验固定commit480548fd55f1be3593ee0d8e316a734751d58309；未重写清单或触碰既有脏vendor。
- 未发现本片其他需修代码问题。原复杂多色标/路径背景直接保真复制仍为明确禁用的能力边界，需后续专片；本片不扩此设计。root继续实际宽/420px、绘图实拖、下载与历史闭环。全仓pnpm check既有无关技能lint阻断、全部编辑工具目标均未由本片关闭。


### PPTX 实机反馈后的检查修复与纹理阻塞（2026-10-16）

- root宽1280×880实测形状填充body为block/overflow auto，fieldset979px导致主操作y1171超出视口。修复为形状填充/设置背景两个data-panel明确flex:1、column、min-height:0、overflow:hidden、padding:0；只有content滚动，actions独立且flex-shrink:0。新增真实Editor挂载并载入实际CSS的整合回归核对两个面板布局链和footer兄弟关系；浏览器几何由root复验。
- root截图确认八渐变卡片“浅色·向下”孤字折行。改为可见“浅色”/“向下”两行，每行两字且nowrap，卡片72px，预览纵排，完整aria-label仍为渐变：浅色·向下。整合测试核对全部八卡片的两行标签。
- root三色标原生下载正确，但apply后的排序使当前stopIndex从50%紫色跳到100%白色。成功提交后按所选stop在排序数组的位置重映射index；真实原生保存测试断言apply后仍选中色标2·50%及原绿色，保留双保存/undo/redo。
- 最终本片Office8文件131/131、Office tsc、四TS Oxlint零诊断、五文件Oxfmt、Fill Antd lint零项、目标diff通过。产品已freeze，未改Editor实现。
- **新发现的未修阻塞**：root实际木纹应用被拒绝“PPTX 操作 setImageFill 不对 Agent 开放”；Fill原测试直接runTxn，未覆盖真实handle白名单。背景image bytes/mediaPath同属此接缝风险，不能因上述门禁称纹理端到端通过。root将交原fill实现者沿受控manual upload/专用manual动作修复批量背景及原图片模式，不放宽模型apply_ops白名单；checker后续独立复验真实Editor→handle→宿主链。


### manual_fill 执行接缝独立复核（2026-10-16）

- 独立检查新增严格shared schema、host action enum/export、Editor applyPanelFill→runManualTool→真实活句柄、manual_fill宿主分派与专属adapter。current没有可注入路径字段，宿主只读取当前目标原生image fill及本ZIP媒体；texture只接受八固定ID与精确PNG SHA-256；背景all由实际页集合构造一个atomic事务。
- 真正模型apply_ops白名单保持；集成测试明确验证setImageFill仍拒绝。专属action与其他手动服务动作共享版本、lifetime signal、响应后取消/当前版本重验、重解析与历史路径。原有fetch后的epoch守卫以及version/unmount不调applyFill回归保留；没有改动此前footer/卡片/色标修复。
- `pnpm --filter @mimir/office exec vitest run src/editors/PptxEditor.fill-host.test.tsx src/editors/PptxFillControls.test.tsx`：2文件11/11。覆盖真实Editor→createPptxAgentHandle→实际applyPptxOpsOnHost，八种形状纹理、当前图片拉伸/平铺、背景all及current all、一次undo、双保存ZIP逐条一致、精确PNG与未改theme/master/layout。文档记录查询为mock，无关model service禁止调用；不等同浏览器/网络模型验收。
- Office/Server/Shared typecheck均exit0；10个目标文件Oxlint零诊断、Oxfmt、目标diff检查和Fill Antd lint零项通过。日志`/tmp/pptx-manual-fill-independent-tests.log`及`/tmp/pptx-manual-fill-check-{office-tsc,server-tsc,shared-tsc,lint}.log`。
- 本次未发现需修产品问题，checker没有修改产品文件，继续freeze供root实机木纹/背景all/保存下载验收。未重跑全131项或全仓check；原复杂背景复制、全部工具缺口及全仓既存技能lint限制保持。


### PPTX 背景原生读回与最终浏览器验收收口

- 用户明确浏览器验收优先、原生Desktop自行验收；真实模型调用待配置，本轮未进行，不再以锁屏/供应商配置阻断代码和界面验证。
- 下载`/Users/admin/Downloads/01_standard_business (14).pptx`，独立Python ZIP/XML确认五张slide均为原生bg/blipFill/tile，内部image11.png SHA-256均为纸张原图`c91102652bf97632c2dd4e3dfc84aac3e6022e59d521557750eaed6e1944e158`；两笔aislides-ink及chart1.xml保留。
- 隐藏背景图形→保存→下载(15)，仅slide1含showMasterSp="0"，五页自定义背景仍在。重置本页→保存→下载(16)，仅slide1的p:bg移除、showMasterSp="0"保留，其余四页背景不动；重置背景没有意外恢复独立的图形可见性。两次undo恢复纸张平铺及显示背景图形，保存reload后Inspector当前值准确且无未保存改动。
- 最终渐变草稿（未应用到原件）宽1280×880与窄420×880截图`pptx-background-inspector-final-wide.png`、`pptx-background-inspector-final-420.png`已目视：八卡片两行完整标签、预览与设置分组、面板content独立滚动、footer固定。宽屏操作y785/817、窄屏同y且bottom841<880；body宽分别1280/420，无页面横溢出。第一Escape仅收起渐变类型Select，第二关闭Inspector，焦点回到窄屏真实“背景”BUTTON。草稿随关闭丢弃，原件仍纸张平铺。临时viewport已清除。
- 冻结后的`pnpm --filter @mimir/web build`与`pnpm --filter @mimir/server build`均已消费exit0，日志`/tmp/mimir-pptx-final-{web,server}-build.log`；Web包含已有第三方eval和PDF混合import警告。此前专项131/131及manual_fill接缝11/11为定向证据，不累计为全仓通过；全仓pnpm check既存技能脚本lint阻塞仍保留。
- 原截图PDF交互表单修后实图`pdf-form-style-user-feedback-final.png`已再次目视：紧凑Ribbon、300px右Inspector、country=China和无变化禁用状态。关闭的是原全宽裸表单布局问题。全部工具目标仍in_progress，复杂多色标/路径背景保真复制、更多放映/Zoom和复杂动画等剩余矩阵项继续保留；不提交、不暂存、不归档。

### 2026-10-16 放映、缩放导航、复杂背景与重置实机收口

上述矩阵为当前状态，早期追加记录中的“复杂背景未实现/放映Zoom未接”是历史切片边界，已由本次真实代码与下载证据取代。实现参考、定向检查及完整浏览器记录见主任务research/pptx-show-20261016.md、pptx-zoom-20261016.md、pptx-complex-background-20261016.md与审计validation-20261016-continuation.md。

- 放映持久化列表在插入摘要页后仍按path找到Agenda；退出焦点回到播放按钮。排练真实13/5秒，下载(21)/(23)逐ZIP entry一致，(22)撤销计时。初次热更新期redo问题在冻结reload后未复现，不改history实现。
- 真实Slide/Section/Summary操作已保存；(19)6页、p14三分节、摘要页两内部slide关系；(20)节导航新增第三内部关系；先前(18)PNG640×361且放映点击到Agenda。
- 专用测试库新增mimir-complex-background-fixture（Ex5kzJMIzAh2jMom），4stops/alpha50000/rect path/tileRect五页完整保留；撤销下载(1)与上传原件逐entry一致，重做(2)与应用结果逐entry一致。保留测试文档，不永久删除。
- 实机标题54→84pt保存(4)，reset保存(5)移除explicit xfrm；只改slide1.xml，原文及非占位符对象完整保留。初次对未移动标题reset为无内容变化，不用它作位置恢复证据。
- Show/Zoom重复短文案已修为图标+单一完整label。最终1280/420×880截图目视通过，固定footer bottom≤843.36、body宽420；两面板Escape先收下拉、再关Inspector且回真实Ribbon按钮。
- 本片不关闭全部工具目标：动画gallery/悬停及编辑画布预览/逐段拆分/切换全部、rich cursor文字、拖绘/组内多选、输出与讲义等仍按矩阵继续。

### 2026-10-17 动画、字符范围与输出实机收口

当前矩阵已替换早期“无字符选区/动画gallery待实机/输出待下载”状态。完整来源、实现及独立checker见主任务research/pptx-animation-20261017.md、pptx-text-range-20261017.md、pptx-output-20261017.md、pptx-batch-check-20261017.md；实机原生下载、420px视觉和最终构建见审计validation-20261016-continuation.md的同日段落。原生副本不清dirty或history；打印已验浏览器完整首页预览，系统打印由用户自行验收；未配置模型不作为已验。

仍未关闭的具体项包括：AI预设快捷命令、形状拖绘、主题gallery、多对象/组内文字与形状格式、局部段落对齐/方向和bullet细节、图片拖裁切等。不能以96入口都有路径代替参数与行为完整性。


### 2026-10-17 主题 / 局部段落 / 拖绘最终收口

主题八预设与拖绘已更新第15/18行，局部段落和列表第31/32/41行及参数表同步。实机首次应用、保存commit后连续局部操作均保持第2段/15字符；真实原件首次补creationId和host重解析中间刷新回归已修。主题save32→undo/save33→redo/save34、形状29→undo/save30→redo/save31、局部编号37→undo/save38→redo/save39均经独立ZIP entry比较恢复一致。正常宽屏和420px固定footer/当前值、分层Escape/真实BUTTON回焦通过，详情见横向审计连续日志。最新检查5文件125/125、三包typecheck（Office最终再跑）及目标门禁、Web/Server build通过。组内/多对象、AI预设、画布拖裁切、图表插入类型等现存边界保持；不因本批完成而宣称全部96回调完全对齐。


### 2026-10-17 PPTX 图片裁切 / 轮廓 / 完整图标 / 十二图表 / AI草稿浏览器收口

- 用户已再次明确只完成代码与浏览器；Desktop由用户自行验收，无模型配置不验真实Agent。固定GenOffice仍为480548fd55f1be3593ee0d8e316a734751d58309；上游图标实际28项，不是全Lucide库。WeKnora固定v0.8.3/3e22822c1d2397be730c458c7539d0eb8c113a24沿既有源码/站点证据，仅知识库与Agent权限参考，无Office裁切/Ribbon模型；本批没有把旧站点探测写成新成功。
- 图标真实浏览器：搜索rocket→火箭、颜色#4472C4、96pt插入并保存下载01_standard_business (40).pptx。独立Python读取image14.png为512×512 RGBA，透明217515像素、不透明42782像素均(68,114,196,255)；native picture ext1219200×1219200EMU。固定上游图形body独立比较28/28一致。最早一次开发热更新丢失未保存插入，未作为成功证据；后来使用5180生产预览稳定验收。
- 图片外观：当前图标设37%不透明、右转90°，画布键盘沿屏幕方向裁左10.416%；(41)原生alphaModFix37000、rot5400000、srcRect l10416、框宽1092203/高1219200且偏移同步，保留像素比例。undo/save(42)恢复框与srcRect、保留37%/90°；redo/save(43)与(41)所有ZIP entry相同，仅目标slide1.xml在裁切前后不同。Escape取消回到真实Ribbon图片裁切BUTTON。
- 轮廓：当前无轮廓→显示轮廓→#4472C480、2.75pt、长双点划线→明确应用/save(44)。native ln w34925/alpha50196/lgDashDotDot；undo/save(45)与(43)逐entry相同，redo/save(46)与(44)逐entry相同。完整11线型/端点/连接/复合参数的当前值与草稿保真由专项测试覆盖，组内/多对象仍列缺口。
- 图表：真实菜单完整十二类；组合图输入营收12/20/16与目标15/18/22，类别一月/二月/三月，save(47)独立读取chart2.xml含barChart和lineChart两个系列，数值/名称完整。普通单系列及十二类由组件原生保存测试覆盖，不伪造业务示例数据。组合图要求两个用户系列避免原生退化成单柱图。
- 最终真实指针验收：第5页logo从左手柄(1122,218)拖到(1136,218)，保留79%，在420px点击应用并保存(48)。native slide3.xml srcRect l20994、off x10496343/y228600、ext790057×600000；undo/save(49)与(47)所有ZIP entry相同，redo/save(50)与(48)所有entry相同，前后仅slide3.xml不同。
- 视觉和交互实机发现三项并修复：轮廓controls类名与大纲工作区同名，窄屏继承max-height180px；三新Inspector body默认flex row导致状态文本横挤表单；轮廓/插入图表没启用PropertyForm导致可见标签缺失。现隔离outline-controls命名，纵向布局和固定footer，可见字段/分组；裁切浮条原在小幻灯片内遮挡手柄，现放画布下方并预留120px。最终420实测sheet bottom407、feedback top415/bottom508.28，body.scrollWidth420，拖动手柄完整可见。没有通过隐藏字段或缩字号规避。
- 最终截图目录/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51：pptx-icons28-final-{wide,420}.png、pptx-outline-final-{wide,420}.png、pptx-chart-insert-final-{wide,420}.png、pptx-picture-final-wide.png、pptx-crop-final-{wide,420}.png、pptx-ai-draft-final-wide.png。截图PNG后缀的浏览器JPEG字节在交付前统一转为真实PNG。界面保留既有视觉系统，固定主操作、内部滚动、具名标签；窄屏分层工具组沿宿主展开后进入Inspector。
- AI：开始有美化/事实核查/生成配图，幻灯片有拼写与八语言翻译。真实浏览器八语言菜单及美化草稿已验；最终第5页草稿为自然中文+页面标识s_3/当前未保存画布要求，已移除文档ID/原始path/版本/API JSON；不会自动发送。现onAiPreset是文字草稿通路，无截图附件管道，提示不等于宿主强制冻结目标；未配置模型不能声称真实执行通过。
- 门禁：独立checker首批8文件199/199；真实浏览器修复后3文件130/130含missing-media真实ZIP、可见标签与裁切取消/history；AI2文件18/18，均为重叠切片不累计成单次数字。Office tsc、目标lint/format/Antd/styles/diff通过，最终Web build exit0日志/tmp/mimir-pptx-final-layout-build.log。全仓pnpm check实际仍失败：480项bundled Impeccable脚本lint及并行ProviderForm未用Select；不记全仓绿。意外整包中断输出的旧打印断言/图表慢保存等待已限定复核：仅更新2测试，打印走真实文稿与当前输出模式，图表等待实际宿主Promise而非40ms；最终2文件19/19、无act warning，Office tsc及目标门禁通过。不把中断运行当全量通过。
- 文档保留专用知识库11项，最终主文稿保存含本批图标、轮廓、双系列图表及logo裁切。96回调表已同步14/70/71/82/83/86/87。整体目标继续in_progress，不提交、暂存、归档或宣称全部工具完成。下一批仍有多对象统一字形/段落/样式/填充/轮廓、画布框选和组内对象、广泛图片格式/拖放/系统剪贴板、独立新批注聚焦、AI截图附件及六格式最新清单去陈旧化。

本批收尾：临时viewport已清除，PPTX20（稳定生产预览5180）、DOCX9、HTML19重新markHandoff；当前7是设置，未虚报保留PDF/XLSX页。截图均已转真实PNG，主文稿clean保存。

### 2026-10-17 统一多选、组成员和交互验收

- 当前画布新增Shift/Ctrl/⌘追加选择、空白区域指针框选、Esc取消、焦点画布左右键与全选。对象树与排列共享同一源字节/页路径/持久ID集合，父组与成员不会同时重复作用；第一次原生GUID升级后原cNvPr别名、焦点和Shift锚点保持。真实Agenda空白拖选3对象，高亮3个且保存仍禁用。
- Home字形控件聚合所选文字run，批量B/I/U、字号、字体、颜色等保留未改run参数；Inspector显示混合值、各操作真正作用数量，统一明确应用字形/段落对齐/纯色填充/轮廓颜色宽度。原生一次事务/一次历史，不把多个本地选择表单各自当作全局多选。组合只扩一层，深层结构可读而写入明确禁用。
- 实机双对象加粗：下载51为基线，52仅slide1.xml改变，Title1两个run与Subtitle2均b=1；undo/save53逐entry等于51，redo/save54等于52。三对象原生组合55仅slide2.xml改变。组合直接成员填充E8F1FF、轮廓4472C4/1.75pt及两个文字各段居中57仅slide2.xml变化；undo58等于56，redo59等于57。测试完恢复60等于56。
- 首轮真实连续输入发现逐键宿主等待禁用导致丢字，已改为独立“成员文字草稿→应用/取消”。快速输入不发请求、不锁textarea，明确提示保存不包含未应用草稿；一次apply基于原始段落/run来源形成setText。实机Financial results后输入2027完整、画布仅在apply后更新，save61保持组合、编号和其他内容。源/目标/版本变化丢弃旧草稿，失败保留重试，迟到结果与外部焦点守卫由专项覆盖。
- 样式：320px右Inspector，内部滚动/固定底部操作，字形三列、字号颜色两列、空选区不展示整片禁用字段；真实420宽scrollWidth=420且操作区底部831px内可达。截图与最终代码/门禁见横向连续日志。本片不宣称深层组合、组内几何/图形预设、复杂填充批量或全部段落参数已齐。
### 2026-10-17 PPTX 统一多选与组合成员浏览器最终收口

- 当前用户只验代码和浏览器；Desktop自行验收，无模型配置不宣称真实Agent执行。固定GenOffice480548fd55f1be3593ee0d8e316a734751d58309；沿本片研究中的WeKnora v0.8.3/3e22822c1d2397be730c458c7539d0eb8c113a24权限参考，不拿其Markdown编辑器作为Office工具栏样式。
- 画布、对象树、排列共用持久ID集合；真实Agenda空白拖选3对象且保存仍禁用，⌘追加选择2项。组首击选整组，第二击/Alt进入直接成员；父组和子项不会重复作用。字体/字号/B/I/U/颜色显示共同值或混合值，批量操作走单次原子事务。
- 下载01_standard_business (51).pptx为基线；52仅slide1.xml变化，Title1两run与Subtitle2均b=1，Q3原i=1保留。undo/save53所有ZIP entry等于51；redo/save54等于52。
- 55原生组合仅slide2.xml变化。组合直接成员纯色E8F1FF、轮廓4472C4/1.75pt及两文本框各段居中57仅改slide2.xml；原cap=flat保留，原生ln w22225。undo58=56，redo59=57，恢复60=56，均独立Python比较全部ZIP entries。
- 实机快速输入发现逐键请求/等待禁用丢字，改为本地“成员文字草稿→应用/取消”，输入期间无宿主请求。明确提示保存不含未应用草稿，失败保留可重试。应用Financial results 2027并save61，其他Product updates/Roadmap、原第2段RTL0/alignl/buAutoNum arabicPeriod/startAt5完整保留；undo62=60，redo63=61。64保存Financial results 2027 Q4，保存前后caret25保持；重新聚焦追加!到26位置正确，随后取消草稿，原件64无!。
- 实机保存光标和最后Escape发现后均补回归。最后生产Web构建reload，打开subbar Inspector→选Title1→Escape，DOM确认panel=false、activeElement aria-label为“打开对象选择与格式”，回真实入口按钮。未以默认activeElement猜测入口。
- 320px右Inspector、内部独立滚动和固定操作；字形三列/字号颜色两列、空选区只给指导。实际1280×880与420×880目视通过，420的document clientWidth/scrollWidth均420，footer bottom831.359px。截图目录/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51：pptx-multiselect-group-final-{wide,420}.png、pptx-multiselect-format-final-{wide,420}.png，已转真实PNG。临时viewport清除，PPTX20/DOCX9/HTML19保留handoff。
- 独立9文件124/124，追加Editor9+Group5共2文件14/14，数字重叠不累计。Office tsc、目标lint/format/styles/diff通过；最新Web build exit0，日志/tmp/mimir-pptx-global-selection-web-build.log。独立复核见research/pptx-global-selection-check-20261017.md。全仓pnpm check确实失败480项bundled Impeccable脚本lint，日志/tmp/mimir-pptx-global-check-full-final.log；未擅改忽略配置或称全仓绿。
- 本片仍不覆盖深层组合写入、组内几何、完整多对象段落/复杂填充/高级轮廓批量、广泛图片格式/拖放/系统剪贴板、新批注自动聚焦和AI截图附件。六格式整体目标继续in_progress，不提交/暂存/归档。

### 2026-10-17 详细批量格式、组成员几何与新批注

- 详细段落/列表/轮廓放在统一选择的四个局部页签；跨页签同一草稿与一次原子应用，未编辑字段保留。直接组成员位置/尺寸/旋转/翻转/非线条预设在“位置与形状”，明确父组合局部坐标，未改EMU不取整。
- 实机下载(65)4段均125000行距/段前400/段后600/rtl0，buAutoNum arabicPeriod startAt7、buSzPct90000、indent-152400、色4472C4。轮廓(66)原生dashDot/rnd/round/dbl；undo(67)=(65)、redo(68)=(66)全部ZIP entry一致。
- 组内Content Placeholder 2设水平42pt/15°/水平翻转，原生(69)rot900000/flipH1/局部off252983,3730177；native保持旋转中心补偿后的坐标回显19.9199/293.7147，其他兄弟与父变换XML不变，仅slide2.xml变化。undo(70)=(68)、redo(71)=(69)全部ZIP entry相同。
- 独立新批注及快捷键自动聚焦已实机；添加后清空并回输入、下一条草稿保存仍保留。下载(72)原生comment1.xml与关系有效，只含已添加文字。Escape菜单入口回“分节与批注”，快捷键来源回“打开对象选择与格式”。时间改本地年月日时分，保留time.dateTime原值。
- 宽1280和420×880目视通过，420无横溢出，固定应用footer bottom841.359px。截图pptx-detail-{outline,geometry,comment}-{wide,420}.png，详见横向连续日志。独立9文件58/58、真实host2/2、旧专项5/5，最终批注14/14是重叠复查；两包tsc/目标lint/format/styles与最终Web构建通过。全仓check既存480技能脚本错误仍未通过。
- 边界：批量图片符号替换、复杂填充/组合样式批量和深层组合未齐；通用Agent裸group flip持久化问题已交下一宿主切片实际修复，本片仅几何UI原子batch可保存。真实模型未配，Desktop用户自验。整体in_progress。

### 2026-10-17 PPTX 复杂批量外观与裸组内翻转收口

- 统一选择新增外观→填充/组合样式：2–16色标渐变、透明度/角度/路径、32组合预设、八固定纹理及每对象原图平铺/拉伸。连接线没有可编辑fill，UI与宿主共用能力判断：Group5两文字参与填充、三对象仍参与stroke。草稿未提交不dirty，图片草稿与普通格式互斥，只有一个固定底部应用。
- 实机(75)两shape原生3色标0/50000/100000、AA44CC alpha50196、lin ang2100000；connector无gradFill。紫色虚线(76)两shape白填充、三stroke7030A0/dash，保留原宽12700/cap rnd/cmpd dbl与connector箭头；只改slide2.xml。undo/save(77)全部ZIP entry等于(75)，redo/save(78)等于(76)。
- 木纹(79)两shape均引用image10.png，SHA256=1f3735b67b527e90dbef8e9cc6632a1779a88019050fb87ebf77bc218c8410b8，原件已有该media，未复制新文件。当前图拉伸(80)仍保持同hash、改stretch；宿主合并重复同资源relationship，只变slide2.xml及其rels。undo/save(81)全部ZIP entry等于(79)，redo/save(82)等于(80)。首次“只应改变slide XML”的独立断言过严，已核是等价关系去重，未把该断言失败当生产故障或冒报通过。
- shared selection manual_fill明确1–200 targets/直接父group，字符串与实际对象双层去重，整个选择预验后一次txn；current逐对象读取各自media，结果只返回一条compact记录。裸group flipElements由同名同步registry包装在原txn内flush补偿child transform，finally恢复原定义，后接ungroup/duplicate亦可持久化；不改vendor或模型白名单。
- 浏览器发现四列样式按钮内图标/色名同行挤成单字竖排，修复真实内层tile为上下排、名称单行，纹理共用。最终生产构建后1280/420×880目视通过，内部滚动和固定footer可达。截图为pptx-appearance-{gradient,styles,texture}-{wide,420}.png，目录/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51，已转真实PNG；临时viewport已清除。
- 独立完整检查Office69/69、server15/15；connector补充Office35/35、server4/4，均重叠不累计。Office/Server/Shared tsc、目标lint/format/Antd/styles/diff通过；最终Web build exit0，/tmp/mimir-selection-appearance-web-build.log。真实模型未配、Desktop用户自验；全仓pnpm check既存480项bundled技能lint仍失败。整体in_progress，不提交/暂存/归档。

### 2026-10-17 统一选择内部剪贴板实机

- 对象树选择同一组合Title1/Content Placeholder2，copy不dirty；paste自动回选独立两成员组合，保留父chOff/chExt并稍微错开。cut原组两文本后connector仍在，剪切ref跨保存/undo/redo仍可paste。raw HTTP `/tmp/pptx-clipboard-{baseline,paste,undo,redo,cut,cut-undo,cut-redo,cut-paste}.pptx`，copy/paste与cut两条history均所有ZIP entry精确恢复。只改预期slide2.xml；未以Downloads名推断原生页序。
- 320pxInspector/固定粘贴footer，宽1280与420真实PNG目视，Escape回实际剪贴板按钮；窄屏Ribbon文字预算另修72px单行，待最终新build复验。独立Office30/30、server11/11及三包tsc，详见chat-edit-office/research/docx-pptx-toolbar-browser-20261017.md。系统剪贴板/外部图片/深层组和附着引用仍明确边界，全目标in_progress。
