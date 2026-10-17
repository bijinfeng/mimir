# PDF 文字参数与紧凑 Inspector 实施报告 — 2026-10-17

状态：本 slice 生产代码冻结，交 root 独立检查、统一构建与真实浏览器验收。不是整体编辑器完备性结论；没有声称模型、外部供应商或 Desktop 验收通过。没有 stage、commit、归档、删除或修改 vendor。

## 行为与边界

- `markup_text` 接受当前页任意真实原文片段、三型标注、`all` 和 `#RRGGBB` 颜色，默认首处、全部为非重叠命中；返回真实 count。浏览器不再用整 run 的估计矩形伪装部分片段标注。
- 新 `pdf-text-glyphs.ts` 从同一次 PDFium 当前工作字节取得实际 Unicode、字形框、角度、原点和 baseline。线性匹配复用固定 upstream 的 NFKC/空白折叠，边界映射保留扩长字符与 UTF-16 配对；PDFium 将 ﬁ 展成同框 f/i 时进一步按相同文字对象与物理 glyph box 聚类，拒绝半个字形。
- 临时只读 PDFium 页的 Rotate 归零以稳定抽取次序，实际输出保持原 Rotate/CropBox。连续同 baseline 字形合成行 quad，跨行保留多 quad；拒绝斜排、缺可靠位置、空/无命中或超预算。单页 200000 源字符、每次 200 命中/10000 字形；所有匹配先校验，在同一个 pdf-lib 对象图一次序列化，原内容流/字体/图片流保留，独立 PDF.js 验证标注数量后返回。安全 Catalog 守卫保持。
- 旧 verified-target 路径继续验证 sha256/对象/外框，并将实际命中限制在已选对象内；不会因更早对象包含同样子串而标错位置。
- `apply-text kind=layout` 仅准备布局，返回原字节/原版本及 layouts。实际所选/回退字体经丢弃原生字体探针测量 advance，再生成换行、行距与行内对齐偏移。默认显示方向顶部 36pt 居中；`anchor_text` 必须唯一，支持 right/below/above，间距 6pt；成对 x/y 与锚点互斥，整块须在页内。
- Agent `insert_text` 补齐 font/bold/italic/align/max_width/anchor_text/placement 和可省略 x/y；pending edit 补 align 等格式属性。逻辑原文、wrappedText、font/style、maxWidth、lineLeading/lineXOffsets、实际 width/height 属于 pending T，会在 capture/restore、历史、编辑/删除、保存期间重放和 batch 幸存 T 中保留。省略全部属性或相同编辑/移动是 no-op。
- 原生插字 HTTP 颜色以 0–1 表示，宿主现在正确转成 PDFium 0–255；非黑色不再误写成近黑。字体的中文覆盖继续沿既有回退，不声称所选西文字体覆盖中文。
- 手动插字、待保存文字与原文标注进入既有 320px Inspector，内部滚动内容与固定单一 primary（插入到页面/更新插入文字/添加标注），错误/反馈高度有界。Ribbon 不堆叠长表单；点击纸面填定位/原文仍可用。
- 已知排版尺寸的待保存 T 有实际纸面轮廓拖动与 24px 命中宽度手柄；单 pointer capture，按纸面真实 DOM 比例换算，pointerup 才一次重排/历史；Escape、失焦、pointercancel 不提交。轮廓与手柄支持键盘按 pt 移动/调宽，Shift 为 10pt；宽度过小时原生重排拒绝并保留工作状态。其他 Inspector 显示时隐藏文字手势。
- 布局准备与最终写入共用内容锁、AbortController 与 expectedVersion；关闭、换源、停止或迟到不发布。保留既有“旧保存进行期间可以继续插字”的基线重放合同。

## 文件责任

新增：

- server `services/pdf-text-glyphs.ts`、`services/pdf-insert-layout.ts`、`test/pdf-text-parameters.test.ts`
- Office `editors/PdfTextInsertPanel.tsx`、`PdfTextMarkupPanel.tsx`、`PdfPendingTextOverlay.tsx`、`pdf-text-controls.css`、`PdfTextControls.test.tsx`

最小接缝修改（这些部分文件同时含其他已完成 slice 的改动，不能将全文件 diff 都归本 slice）：

- shared `src/pdf-agent.ts`：严格语义 markup/layout 合同及类型
- server `services/pdf-agent-host.ts`、`pdf-agent-catalog.ts`、`pdf-block-rewrite.ts`（导出既有真实测量换行函数）、`routes/conversations.ts`
- renderer `lib/api.ts`：layout/count 传递
- Office `agent/pdf-agent.ts`、`pdf-content-agent.ts`、`pdf-batch.ts`、`editors/PdfEditor.tsx`
- 现有 `pdf-agent-route.test.ts`、Office `pdf-content-agent.test.ts`、`PdfEditor.content.test.tsx`
- `.trellis/spec/shared/contract/pdf-agent.md`：更新旧限制和 §17 当前合同

未改 OCR、PdfImagePanel/图片 CSS、DOCX、XLSX、PPTX 或 vendor；未新增模型/provider 配置。

## 已执行检查

1. server target **4 文件 / 34 测试通过**，日志 `/tmp/pdf-text-server-final4.log`：
   `pnpm --filter @mimir/server exec vitest run src/test/pdf-text-parameters.test.ts src/test/pdf-agent-host.test.ts src/test/pdf-agent-route.test.ts src/test/pdf-agent-catalog.test.ts`
   - 四 Rotate + offset CropBox，部分/首处/重复 all、跨行、三型颜色、实际 QuadPoints、所有既有 PDFRawStream 内容精确保留。
   - 四 Rotate 的真实所选字体换行插字，通过独立 PDF.js transform 投影验证实际 baseline x/y 和显示方向，不仅断言文本存在。
   - NFKC 完整扩长字形、PDFium 物理连字边界、非 BMP ToUnicode、中文、精确 [18,52,86,255] 插字颜色、唯一/歧义锚点、默认位置、溢出拒绝。
   - legacy target 与更早子串隔离；HTTP 鉴权、严格输入、读布局不改库存字节/版本、当前工作字节路径。
2. Office target **7 文件 / 57 测试通过**，日志 `/tmp/pdf-text-office-final2.log`：
   `pnpm --filter @mimir/office exec vitest run src/agent/pdf-agent.test.ts src/agent/pdf-content-agent.test.ts src/agent/pdf-batch.test.ts src/editors/PdfEditor.content.test.tsx src/editors/PdfTextControls.test.tsx src/editors/pdf-toolbar-render.test.tsx src/editors/PdfEditor.batch.test.tsx`
   - 原生中文字体/换行/对齐，pending edit 与 no-op 版本、batch 幸存 T、Undo/Redo、两次实际 native save 与独立 PDF.js 读回。
   - 单主按钮/固定 footer、标注 busy/真实 count/卸载取消，真实 PointerEvent 单指针、Escape 取消、拖宽一次提交和键盘调宽。
   - 编辑器内容、批次和现有工具栏行为回归。
3. shared、Office、server、renderer 全部 typecheck **exit 0**，日志 `/tmp/pdf-text-types-final2.log`；最后新增非 BMP fixture 后 server 再跑 **exit 0**，日志 `/tmp/pdf-text-server-types-last.log`。
4. 本 slice 20 个 TS/TSX 目标 oxlint **无错误/警告**，日志 `/tmp/pdf-text-lint-final4.log`；最终新测试再 lint 干净 `/tmp/pdf-text-test-lint-final.log`。21 文件 oxfmt check 全通过 `/tmp/pdf-text-format-final.log`。
5. antd lint 对 InsertPanel、MarkupPanel、PendingOverlay、PdfEditor 分别扫描均 **0 issues**，`/tmp/pdf-text-antd-{insert,markup,overlay,editor}.log`。`git diff --check`、`node scripts/check-style-backticks.mjs` 通过。

这些是目标与原生/组件验证，不替代浏览器像素、真实 Agent 模型续轮或完整 pnpm check。

## Root 浏览器接手

- 宽屏与实际 **420×500** 都需验 320px Inspector、内部滚动、底部按钮完整可见、错误不挤出主按钮、Escape 回实际可见来源组、下拉 portal 点击和窄栏弹层。
- `编辑 → 定位原文` 打开文字标注 Inspector，点击正文填入原文，再缩为部分片段；切三类型、颜色、全部匹配 → **添加标注**。检查真实页渲染/实际 count、一次 Undo/Redo 与保存重开。
- `编辑 → 插入文字`，无坐标默认顶部居中，或点纸面/填坐标；设置字体、字号、粗斜体、align、max_width、中文与颜色 → **插入到页面**。
- `编辑 → 编辑待保存文字`：修改逻辑文字与格式 → **更新插入文字**；纸面轮廓拖移、右下手柄拖宽、键盘移动与调宽，Escape 中断手势；确认一次提交/历史和失败仍有草稿。
- 至少实际保存两次并重开，原生中文和颜色/对齐/换行仍在；保存/关闭取消迟到不污染新页/新文档。root 统一构建/全套重型门禁，本 agent 未运行。

## 来源与后续边界

沿已批准 `pdf-text-params-next-plan-20261017.md`：GenOffice 固定 `480548fd55f1be3593ee0d8e316a734751d58309` 为文字/Office 工具主参考；WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 只支持真实能力门控/拒绝原因思路，不提供 PDF 文字几何或工具栏视觉模型。未重新开展外部研究或扩大范围。

扫描 OCR 结果是临时复制/搜索来源，仍不能冒充原文字形标注目标。斜排文字/不可靠字形与原安全 Catalog 范围仍有明确限制；默认自动字体可能按真实覆盖回退。正式浏览器与 independent checker 尚待 root 完成，整体工具参数清单仍由 root 逐项收口。
