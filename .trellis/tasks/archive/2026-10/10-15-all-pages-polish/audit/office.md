# Office 编辑界面走查（2026-10-15）

## 本轮证据与范围

- 在独立的本地浏览器标签打开仓库内置的“mimir 产品说明”笔记；观察 1280px、600px、420px 的 Markdown 编辑器。420px 截图见 [`office/markdown-420.png`](office/markdown-420.png)。测试账号为仓库规定的 `admin@example.com`。
- 420px 下外壳宽 368px、文档总宽 420px，没有整体横向溢出；命令带的可见宽 360px、内容宽 537px，横向滚动条出现，保存/撤销/重做固定在分类标签前。切换到“插入”后命令带显示对应分类，并从起点展示命令。
- 逐一核对 `MarkdownEditor`、`HtmlEditor`、`DocxEditor`、`XlsxEditor`、`PptxEditor`、`PdfEditor` 的共用 `EditorShell`、`CompactToolbar`、保存禁用原因、状态与画布入口。PPTX/PDF 共用的 `ThumbnailSidebar` 保留真实缩略图、页码、收起/展开、右键及键盘菜单路径。现有 CSS 中的蓝色回退值是进入本任务前的未提交基线，未覆盖。
- 编辑器与外壳测试 19 个文件、383 项通过，其中包括六格式工具栏/编辑测试和 PDF、PPTX 缩略图路径。测试验证逻辑和文件读回，不等同六格式的真实浏览器视觉截图。
- 主任务在隔离的 Electron 用户目录中装载了仓库 DOCX/XLSX/PPTX 夹具和生成的 PDF/HTML 临时样本，核对 1440px 与约 588px。DOCX、XLSX、HTML 在窄窗可用；PPTX 与 PDF 的缩略图栏默认覆盖画布左侧文字。这些资料没有写入用户数据目录。

## 已确认并修复

| 位置 | 本轮问题 | 修复与复查 |
| --- | --- | --- |
| 六格式共用分类命令带 | 前一分类横向滚到末端后切换分类时，命令带沿用旧 `scrollLeft`；短分类可能看似空白，长分类会从中间开始。 | 仅在分类改变时复位到首个命令；新增行为测试。独立浏览器里在 420px 切换“开始”与“插入”，命令带从左侧开始。 |
| 六格式共用分类标签 | 选中标签文字使用填充主色；品牌蓝不应作为小字强调文字。 | 改用 Office 主题桥的 `--me-accent-text`，与同包选中菜单文字一致。 |
| 六格式共用横向滚动 | 命令带和标签的平滑滚动、渐隐提示未尊重减少动态效果设置。 | `prefers-reduced-motion: reduce` 时关闭平滑滚动与渐隐过渡。 |
| PPTX/PDF 缩略图侧栏 | 约 588px 的窄编辑区中，164px 侧栏默认作为绝对定位浮在画布之上，遮住标题与页面左侧。 | 共用 `ThumbnailSidebar` 改为随容器宽度的 `auto` 展示：≤650px 默认收起并显示展开按钮，宽列默认显示。用户显式展开后可选页，选页即恢复自动状态。PPTX 交互测试覆盖默认/展开/选页状态；PDF 复用同一组件。隔离 Electron 重启后在约 588px 逐一复查：两种格式初始画布标题完整可见，展开入口可达，展开后选页恢复画布。截图见 [`office/pptx-588-fixed.png`](office/pptx-588-fixed.png) 与 [`office/pdf-588-fixed.png`](office/pdf-588-fixed.png)。 |

## 未覆盖的实机状态

浏览器测试账号的知识库只有一篇 Markdown 说明笔记；六格式中的其余五格式在隔离 Electron 目录中由主任务补齐宽窄实机检查。浅深色实机检查和保存读回尚待完成。未把现有测试夹具上传到用户知识库，也未改动任何用户文档。工具栏改动都落在六格式共享组件，格式保存回调与文件引擎未变。

## 验证

- `vitest run packages/office/src/editors packages/office/src/shell`：19 文件、383 项通过。
- `tsc --noEmit -p packages/office/tsconfig.json`、定向 `oxlint`、`oxfmt --check`、`git diff --check` 通过。
- 缩略图修复后 `PptxEditor.test.tsx`、`pdf-toolbar-render.test.tsx`、`PdfEditor.content.test.tsx`：3 文件、68 项通过；Office typecheck 通过。
- `pnpm --filter @mimir/office test ...` 在该环境尝试时因 `fetch failed` 退出；上述本地已安装的 vitest 直接执行完成同一包的编辑器与外壳测试。
