# PDF 本地临时 OCR 独立检查

2026-10-17，正式 trellis-check，批准范围见 `pdf-local-ocr-next-plan-20261017.md`。已读完整保存hook、任务PRD/实施OCR追加与相关spec；本地没有 trellis-agent-check skill，使用 trellis-check 一次。没有再次派生代理，不改 vendor、PDF图片面板、server/parser、stage/commit/archive/delete。共享Editor仅修改OCR接缝。

## Findings (fixed)

1. **PdfEditor.tsx / PdfEditor.ocr.test.tsx：隐藏运行中的唯一停止控件。** 已有当前页结果时进入纸面选字、或点当前Ribbon OCR入口关闭，都只隐藏Inspector未停止顺序扫描。两个入口先stop，保留已完成结果；真实Editor新增两项回归。首次红灯记录 `/tmp/mimir-pdf-ocr-check-red-20261017.log`。
2. **PdfOcrControls.tsx / pdf-ocr.css：短窗口主动作越界。** root真实420×500量测aside bottom473.36、主按钮bottom576.14；根未复用height100%的mimir-pdf-panel。补完整高度链，body继续独立滚动、footer同级固定；长error最多4.5em并可滚动。原外层label包整个Radio组，导致首radio名称包括两项并使第二项点击回首项；改div与明确组aria-label。实际DOM回归可选择顺序范围，AntD lint0issues。最终像素由root重建后验收。
3. **PdfOcrOverlay.tsx / PdfEditor.tsx：键盘选字入口/退出焦点缺失。** 原进入后焦点留在Ribbon，SVG上的Escape收不到键盘。挂载聚焦SVG并preventScroll，Escape/退出回实际live入口或具名组；真实Editor回归验证焦点与Escape。
4. **PdfOcrOverlay.tsx / 新PdfOcrOverlay.test.tsx：SVG逐字复制插入虚假换行。** root真实浏览器证据为M\ni\nm...。给每个text绑定真实source offset，copy按Selection anchor/focus的DOM UTF-16文字边界计算原逻辑片段，不读取selection.toString、不猜换行、不复制整页。三项实际copy/Selection回归覆盖部分多字符symbol、跨行、反选、独立空白Text node、element/root边界与跨出overlay不劫持。保留原字框几何。
5. **pdf-ocr.ts / pdf-ocr.test.ts：空白页误算成功。** 真实engine映射后text.trim为空且无tokens时返回null；实际raster调用路径回归验证计skip基础、worker结束与canvas清空。root生产旧build曾显示5页结果含空白；新build应只4页可用结果。
6. **use-pdf-ocr.ts / use-pdf-ocr.test.ts：完整page deadline先到时初始化worker未立刻释放。** shared worker factory绑定scan signal，准备耗时后page120秒已到而factory未返回引用，finally无法通过局部worker变量销毁它。结束scan统一abort controller，初始化的原生transport即时terminate并结算job。新回归故意先准备1秒，再挂实际createPdfOcrWorker transport，120001ms时必须terminate且无剩余timer；不依赖更晚的worker自身120秒timeout。
7. **PdfEditor.tsx / pdf-ocr-worker.test.ts：独立lint两项错误。** 冲突工具的presentation状态按条件在render中同步清除，effect只停止外部session，避免set-state-in-effect；timeout异步expect与推进时钟在await Promise.all里收尾，避免valid-expect。新排序改toSorted；无规则抑制。

额外补强验证：从canonical rotation0的真实PDF用户角点跨0/90/180/270投影，非零CropBox与150% zoom；独立原件/导入件相同index不合并身份。原native read_pages/编辑/markup/redaction仍不消费OCR；OCR会话复制/搜索不改bytes/version/dirty/history/save的真实Editor断言保留。

## Findings (not fixed)

- 本片检查未留下已知阻断代码缺陷。scoped lint仍有8条建议warning：独占自定义worker transport的onmessage/onerror4项、postMessage误按Window建议targetOrigin1项、测试function-scoping2项、fixture map-spread1项。未为建议变更接口或关闭规则，lint exit0。
- 真实生产浏览器420×500最终布局、SVG原生拖选复制、空白skip、四Rotate/offsetCrop/zoom、静态资源MIME/BASE_URL/no-CDN和字节精确性由root在统一新build复验。本报告不以组件或Node证据冒充浏览器结果。
- provider/真实Agent模型未配置，本片不需要模型；Desktop由用户自行验收。全套Office/server与web重型build由root统一，不重复已知全仓技能lint基线。

## Verification

- **Office定向6文件39/39，exit0**（OCR29+既有native content10）：`/tmp/mimir-pdf-ocr-independent-final2-tests-20261017.log`。
- **Office TypeCheck exit0**：`/tmp/mimir-pdf-ocr-independent-final2-office-types-20261017.log`。
- **renderer TypeCheck exit0**：`/tmp/mimir-pdf-ocr-independent-renderer-types-20261017.log`（不改renderer源后的有效结果）。
- **scoped oxlint exit0，0errors/8warnings**：`/tmp/mimir-pdf-ocr-independent-final2-lint-20261017.log`。
- **scoped格式14文件pass**：`/tmp/mimir-pdf-ocr-independent-final-format-20261017.log`；最后两文件另经oxfmt写入并复查。样式守卫pass：`/tmp/mimir-pdf-ocr-independent-styles-20261017.log`。git diff --check scoped pass。
- **AntD OCR控件lint0issues**：`/tmp/mimir-pdf-ocr-independent-antd-20261017.log`。
- **renderer真实资产1/1 exit0**：`/tmp/mimir-pdf-ocr-check-assets-20261017.log`，核实际WASM魔数/语言gzip/完整许可与无重复内嵌WASM。
- **独立Node原生TS配置入口+真实copy hook exit0**：`/tmp/mimir-pdf-ocr-independent-native-entry-20261017.log`，动态import当前vite-preset.ts成功、实际资产复制目录完整。不是只在Vitest转译下import。root此前webbuild2通过记录仍归root；checker不重跑重型build。

## Spec sync与冻结

唯一OCR运行/界面合同新增于 `.trellis/spec/office/frontend/editors/conventions.md` 的“PDF 本地临时 OCR”：只读隔离、源身份与真实几何、同源资产、预算与init取消、空白skip、固定footer、逻辑选区copy/焦点。product.md §1已由root记录批准例外，本checker未把“正在实现”擅自改为验收通过。

本报告交付时OCR源码与接缝冻结并交回root；可统一构建及真实浏览器回归，不再自行编辑。
