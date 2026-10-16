# create_document 富内容生成验证（2026-10-16）

## 来源与改动边界

固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，`apps/docs/src/renderer/ai/tools.ts:619,980`、`protocol.ts:1026` 与 `main/docs-main.ts:4290`：DOCX/PDF 创建沿 restricted HTML 插入或打印语义。WeKnora 已核对 v0.8.3/`3e22822c1d2397be730c458c7539d0eb8c113a24`，仅作为知识库/Agent参考，不作为 Office 富内容版式模型；证据沿本任务既有 research。

转换限 `docx-create-document.ts`、`document-rich-content.ts`、`document-rich-pdf.ts` 及专项测试；保持 md 原 Markdown、html 完整页面、100k输入、源文档验证、统一 upload→parse→index 与失败清理。无新依赖、无 vendor 修改。根会话另授权公共 `appearanceFont` 的 fontkit CFF FD映射修正，由 `pdf-cff-font.ts` 承载，`pdf-forms.ts` 仅 import/call。

## 当前能力

| 项目 | DOCX | PDF | 证据 |
| --- | --- | --- | --- |
| 标题/段落、粗斜体/下划线/删除线、颜色/底色、字号 | 原生 runs/styles | 富文字绘制与换行 | engine 独立重开、PDF.js 提取、Poppler 实际首图 |
| 外部超链接 | document relationships，含表格内链接 | 原生 Link/URI 注释 | 独立读回两个目标 |
| 有序/无序嵌套列表 | 原生 numbering，9层上限及start；保留列表后的续段顺序和列表项标题 | 缩进、序号、矢量圆点，父项只编号一次 | 原生XML/首图；前置嵌套/后续p顺序回归；超深明确拒绝 |
| 引用、代码、硬换行 | 段落/字形与空白 | 缩进引用线、代码底色、保留空白 | 实际首图 |
| 表格 rich cells、colspan/rowspan | 原生 table/gridSpan/vMerge；tcPr/合并结构保留，单元格正文复用段落生成器写原生标题/列表/链接 | 真实网格及合并区域，继承单元格对齐并保留显式覆盖 | 原生重开3行表格、Heading2/对齐读回、实际首图 |
| 长表格/长单元格 | 交由Office分页 | 普通行组分页，超长普通行切成页带 | 55行及450段长格内容逐项提取，全部基线在页面内；65行实物4页 |
| 公式 | 原生 OMML | 明确拒绝并建议DOCX | native math读回与失败用例 |
| 无效/超范围内容 | 上传前拒绝 | 上传前拒绝 | 无效span/非矩形/脚本/图片/未知CSS/危险链接/缺字测试 |

PDF 无数学排版、嵌套表格、超一页跨行合并组或两端对齐（justify在上传前拒绝）；DOCX/PDF不支持初始图片/图表、任意CSS布局与HTML页面结构。颜色只接受已实现的常用名称/hex/rgb；不支持值明确报错。PDF代码采用统一嵌入字体保留空白/底色，不承诺等宽或语法高亮，粗斜体为绘制模拟，不保证与Office字体度量一致。PDF表头不自动在续页重复。

独立checker已修复：PDF justify明确拒绝；td/blockquote对齐与字形继承且子段/子run显式值优先；th显式normal不再被强制粗体覆盖；列表内嵌套列表与后续p保留原始顺序，前置嵌套保留空父marker；表格/列表项标题保留原生Heading样式。代码language-* class当前明确拒绝。

## 实测与门槛

- 无DB定向：rich内容12项 + 原PDF表单6项，2文件18测试通过。
- 新像素回归：PDF.js真实光栅化“收入稳定增长本期工作”，每个字符格必须有可见像素；字体FD切换缺字时提取文本仍正常，因此不能只断言textContent。
- 实际Poppler：`/tmp/mimir-rich-created.pdf` 为4页A4，首图`/tmp/mimir-rich-page1.png`、末图`/tmp/mimir-rich-page4.png`。首图标题、中文、代码、列表和合并表格完整可见；末图61–65行与最终标记完整、无截断。
- DOCX产物：`/tmp/mimir-rich-created.docx`，独立引擎重开含合并表格、rich cell链接与原生数学对象；专项测试另断言native XML与链接关系。
- 已跑既有服务集成：3文件9项通过（四格式创建、失败清理、跨格式文件创建）；新增富内容入库/索引测试交独立checker一起重跑。
- Server tsc最近通过；新增真实渲染用例的canvasFactory类型补齐后已重跑，日志`/tmp/mimir-rich-tsc.log`。定向lint已修完，日志`/tmp/mimir-rich-lint.log`空。`git diff --check`通过。
- 全仓check既有Impeccable脚本lint问题由主会话记录，本子任务不声称全仓门槛通过。真实模型及当前页面Agent创建轮由主会话后续验收。

### 独立检查收口

- 最新rich/创建/失败清理/create-file/表单5文件31/31通过，Server `tsc --noEmit`、10目标文件oxlint、改动格式检查与`git diff --check`通过。此前创建解析失败会软删记录并删除上传目录的原路径保持；源文档与md/html原样路径均由集成回归确认。
- 最后严格输入复核增加HTML实体解码后的控制字符，以及当前不消费样式的formula/br节点样式拒绝，避免生成无效XML或静默丢样式；对应3例加入后rich/表单2文件24/24通过（与上述计数重叠，不相加）。
- 公共字体适配增加可编辑表单的同串“收入稳定增长本期工作”实际光栅化回归，逐字格均有可见墨迹，字段逻辑值和只读状态同时读回；富内容PDF原有逐字像素回归继续通过。
- checker独立查看原4页PDF首尾Poppler图；另生成 `/tmp/mimir-rich-review.pdf` / `.docx`，Poppler图 `/tmp/mimir-rich-review.png` 核对跨FD中文、右对齐引用、嵌套列表与续段原序、右对齐合并格标题、显式左对齐覆盖和单元格链接，未见缺字、跨格或截断。
- 固定vendor的`TableParagraph.styleId`虽有类型但生成器不写样式。创建适配层逐格保留原`tcPr`、`gridSpan`、`vMerge`，只以公共段落生成器替换新建表格的正文，计数不符拒绝；未修改vendor或旧文档保存路径。

## 字体根因

`@pdf-lib/fontkit@1.1.1` CFFSubset.subsetFontdict 将used_fds记为布尔，重复切回早先FD时却使用最后一个FD索引，并把本地子程序依赖归入最后FD，造成部分中文字形空白。修正保持原FD→子集FD映射与各FD独立依赖集合，同时保留既有CFF offSize/异步编码错误适配。不修改字体资源、依赖或vendor。
