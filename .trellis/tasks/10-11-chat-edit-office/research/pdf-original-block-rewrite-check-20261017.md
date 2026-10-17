# PDF 原文段落改写独立复核

2026-10-17。接实现者正式冻结后复核 backend、共享合同、Agent executor 与手动 Inspector；root 负责生产构建及宽/420 浏览器。无嵌套代理、vendor 修改、上传删除、提交、暂存或归档。

## 证据与审查范围

- 复读实现报告 `pdf-original-block-rewrite-20261017.md` 及 `pdf-agent.md` §11/12。GenOffice 固定 `480548fd55f1be3593ee0d8e316a734751d58309` 的 `edit_block` 原宽重排/空文删除与 `edit_text` 部分匹配不重排语义为本片基准。
- WeKnora v0.8.3 固定 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的知识检索与 sandbox 能力门控适用于 Mimir 权限/可用性；不提供 PDF 原生文字重写合同，不作为 Office 编辑工具栏主参考。来源 HTTP200 与本地具体证据见实现报告，代码复核沿同一固定版本，未新增竞品判断。
- 追踪 strict shared schema → text-blocks HTTP → 原生完整成员核验 → 私有 partial 容器 → 固定 native writer → 全文原生资源/对象及独立 PDF.js 读回；检查 read 不写文件，rewrite 只返回工作字节/一次版本，由原保存入口持久化。
- 核对假粗体描边及实际 BoldOblique 字面取消、未指定另一项样式继承/混合拒绝、四 Rotate/非零 CropBox、重复匹配次序、原生删除、非目标页/字体/图像校验与取消守卫。没有放宽 Form/clip/AcroForm/Catalog 原拒绝。
- 手动 Inspector 三模式、真实参考字号/行距、保留字体与颜色、空删除文案、失败保留草稿、模式/源切换取消、own busy、stale 与原工作 history/save 路径均已读。

## 独立发现与修复

只改一个数值草稿且未失焦时，主操作按已提交旧值判定 unchanged，按钮仍 disabled。既有 move 测试先提交了 dx 再编辑 dy，未覆盖只有一个草稿的情况；rewrite 只改字号同样出现。

新增两条回归先复现失败（按钮仍 disabled），随后仅在两个表单的数字输入获得焦点时保持主操作可达；按钮沿共用 mousedown blur 提交草稿，再由 click 执行已有校验。没有改变数字原语、native writer 或 dirty/history。两条首击测试现在均核对真正发送最新 dx 或 font_size，且只调用一次。

本 checker 修改：

- `packages/office/src/editors/PdfTextBlockPanel.tsx`
- `packages/office/src/editors/PdfTextBlockRewriteForm.tsx`
- `packages/office/src/editors/PdfTextBlockPanel.test.tsx`

## 门禁与真实结果

- 独立 Server 5 文件 **22/22**：pdf-block-rewrite、pdf-block-rewrite-route、pdf-text-block-host、pdf-text-block-route、pdf-agent-catalog。
- 独立 Office 5 文件初次 **29/29**；加两条首击回归并修复后 **31/31**：PdfTextBlockPanel、PdfEditor.blocks、pdf-block-agent、pdf-content-agent、pdf-text-blocks。
- Office 与 Server tsc 通过；3 个 checker 目标 TS/TSX 的 oxlint、oxfmt，`pnpm lint:styles` 与目标 `git diff --check` 均通过。
- 独立目视实现者真实 Poppler 输出 `/tmp/mimir-pdf-rewrite-cjk-poppler.png`：“收入稳定增长本期工作”全部字形可见，末字按原宽换行，非目标 `NON TARGET KEPT` 保留。测试另有 PDF.js 禁用 system fonts 的逐字实际像素检查，并非只有提取字符串。
- 真实 Editor 两套局部/整段修改分别 save→undo/save→redo/save 按字节闭环；路由测试使用统一 admin 账号，宿主不自动改原件，普通 PUT/GET 两次及 undo/redo 保存精确相等。

## 边界与交接

增长不推动邻段，局部替换不自动换行，过长可重叠，面板已提示。复杂文字矩阵/未知普通字面/混合未指定样式明确拒绝；非目标原资源必须保留。颜色目前为“留空保留”的 HEX 输入，已报告 root 结合浏览器审查判断是否统一共享 RGB 取色交互。

生产构建、宽/420 浏览器继续交 root；没有模型配置，未声称真实模型调用通过；Desktop 由用户验收。全仓 `pnpm check` 已知技能脚本 lint 阻断不由本片解除，不重复冒认全仓绿。
