# DOCX 图片与目录独立复核

2026-10-17；checker `/root/pptx_global_selection_check`，整体任务继续 in_progress。

## 修复发现

`ToolbarButton primary` 自带label可见文本，而新图片应用、裁切预览、目录插入又传入文字children，造成重复文案。移除三处重复children，控件测试新增精确可见文案断言：应用图片格式、预览图片裁切、插入目录到文档。尺寸单位窄屏溢出由root浏览器发现，实现者在专用CSS给数字输入`flex:1 1 0%;width:0`并保留suffix宽度；checker未修改共享shell。

## 实际复核路径

- 真实docProtected图片NodeSelection冻结doc/pos/node，草稿与像素操作不改正文；异步操作重新核对冻结目标，关闭/取消abort；保存结构预检深拷贝editor JSON，避免ProseMirror属性被预检污染。冻结期间仅移动文字选区仍可对原图应用，属于已有明确测试的锚定面板语义。
- 原件沿imageReplace、新图沿genImage，替换清除旧裁切属性；一次明确应用进PM history。
- `docx-image-save`只在已有图片变换delta且缺可写xfrm时补baseline block副本，原parsed块不变；正常xfrm复用原patch；无/歧义pic和无效尺寸拒绝。实际变换、size/effectExtent仍沿原生pmDocToSavePlan/saveDocx。
- 真实kitchen-sink图片覆盖缺spPr/空spPr/缺xfrm/自闭合xfrm/正常xfrm；无操作原字节、两次保存、保存后undo/redo、共享rId/media替换保留兄弟drawing与资源均由实际保存重开验证。
- 目录只调用现有insertToc并展示标题/位置，明确Word更新页码；不宣称更新已有目录或浏览器页码已补。

## 独立验证

- 5文件32/32：DocxImageControls、docx-image、docx-image-save、DocxAdvancedControls、docx；日志 `/tmp/mimir-docx-picture-check.log`。在primary文案修复后运行。
- 9个TS/TSX目标Oxlint、10文件Oxfmt check通过，日志 `/tmp/mimir-docx-picture-check-{lint,format}.log`。
- 本轮Office typecheck exit0，见 `/tmp/mimir-pptx-clipboard-final-office-typecheck.log`；styles与diff通过。尺寸单位CSS最后冻结后另重跑控件与format，结果单独追加，不累计。
- 尺寸单位CSS最后冻结后，独立控件7/7与4文件format通过，日志 `/tmp/mimir-docx-picture-final-{controls,format}.log`。这些与前轮重叠，不累计。
- root真实浏览器最初在Downloads观察到redo/save(3)缺custom.xml，后证实是Downloads文件被外部程序异步加入CWM属性：raw HTTP响应 `/tmp/mimir-docx-picture-response-redo.docx` 为11 entries、无custom，与上传/tmp fixture的keys完全相同，仅document.xml按预期改变，且主XML等于第一次变换保存(1)。原始源本来无custom，因此该次观察不是产品丢失custom；不做无证据生产修复。
- 最终独立6文件33/33通过（日志 `/tmp/mimir-docx-picture-final-history.log`），包含新增真实Editor图片history回归：构造明确`MimirHistorySentinel` custom.xml与根rel/ContentTypes，真实NodeSelection→Inspector输入30°/Hflip→应用→保存，第一次只改document.xml；undo/save全部entries精确等于baseline；redo/save全部entries精确等于第一次保存。原始custom XML字节精确保留，没有放宽到semantic比较。该轮覆盖前轮32项，不累计。
- 末轮Office typecheck、4文件目标Oxlint、5文件Oxfmt check、diff均exit0，日志 `/tmp/mimir-docx-picture-final-{typecheck,lint,format}.log`。生产无额外修复，本次独立复核未发现未解决的局部代码缺陷。
- 图片裁切为数值四边裁切与真实预览，没有8手柄拖裁切；去背景为固定上游边缘颜色算法，无模型抠图。VML/同块多pic歧义仍拒绝。它们是本片已声明边界，未自行扩展接口。
- 浏览器实际像素与1280/420布局、下载、保存历史、焦点由root验收；Desktop用户自验，模型未配置不冒报。全仓旧技能lint阻断仍存在。

## 目录固定底部操作增量（2026-10-17）

root真实CDP截图 `docx-toc-420.png`（420×880，visualizations目录）显示短内容时插入按钮停在约y460，未贴近Inspector底部；checker已目视此图。原先依赖随内容的`.mimir-docx-style-actions` sticky，不能把短内容动作推到底部。

局部修复仅Toc控件与图片/目录专用CSS：语义独立`.mimir-docx-toc-tools`填满Inspector，内容区单独flex滚动，插入按钮和状态置于不收缩的底部操作区，主动作右对齐；标题预览取消240px内部二次滚动。沿用现有图片面板间距/表面/边界，未加新视觉容器；文案、useDocxAction、冻结版本和插入位置语义均保留。控件测试验证标题在scroll内、主按钮与成功/过期失败状态在scroll外footer内，按钮label唯一，原生目录保存/history回归仍通过。

增量独立gate：2文件8/8（控件与真实Editor图片history，和前轮重叠不累计）、Office tsc、目标Oxlint/Oxfmt、lint:styles、diff均exit0；日志 `/tmp/mimir-docx-toc-footer-{tests,typecheck,lint,format,styles}.log`。没有构建或部署；修后真实420固定footer由root最终浏览器核对，不能以DOM结构测试代替布局测量。

root另已报告DOCX replacement/crop/cutout真实raw HTTP像素：PNG240×160裁为120×80蓝色，去背景原图角像素alpha0；PPTX mixed copy/paste、cut及undo/redo全部ZIP entry精确通过，剪切后原组保留connector、粘贴的两个子对象成为独立组。这些是root实机证据，本checker未重新执行像素或浏览器操作。
