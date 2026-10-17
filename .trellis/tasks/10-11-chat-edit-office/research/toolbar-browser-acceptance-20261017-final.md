# 工具栏增补：代码与浏览器最终验收（2026-10-17）

## 范围与参考

- 当前任务仍 `in_progress`；本报告只收口 DOCX 图片/目录/表格设计、PPTX 内部选择剪贴板、PDF 自有画布绘图、XLSX 高级透视、HTML 规划多选及共用 Ribbon 这一批。没有暂存、提交或归档。
- 按用户要求仅验代码与浏览器；Desktop 由用户自行验收，测试账号无模型供应商，未执行真实模型、图片/音频服务。不反复请求配置。
- 固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 为文件编辑主参考，证据 checkout `/tmp/mimir-genoffice-html-git`；继续采用现有 Obsidian 风格的克制布局。WeKnora v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 的工具权限/KB 分工证据复用 `editor-remaining-tools-current-20261017.md`，不把其 Markdown 编辑器作为 Office Ribbon 依据。
- 所有 UI 坚持紧凑 Ribbon、320px 右 Inspector、内容内部滚动、固定底部动作；新增复杂配置不会在 Ribbon 下铺满整页裸表单。

## DOCX 表格设计

- 文档 `fsqsIw8n_SMKnwCr`，`mimir-docx-table-design-fixture`。上传的 4×3 表包含部门/收入/成本及技术部、市场部、合计；另保留原始 2×2 表、文本、图片/公式。
- 基线 `/tmp/docx-table-browser-baseline.docx`。注意 `/tmp/mimir-docx-table-design-fixture.docx` 后被并行工作者覆盖，不能作为上传文档的比较基线。
- 选部门单元格 → 表格 → 表格设计与属性，选择蓝色条纹并应用/保存。`/tmp/docx-table-preset.docx` 只改变 `word/document.xml`，12 个单元格文字全部保留；原生填色 BDD7EE/DDEBF7/FFFFFF 与实时显示相符。预设明确替换整个表格的底纹/边框。
- `/tmp/docx-table-preset-undo.docx` 的所有 ZIP entry/名称等于 baseline；`/tmp/docx-table-preset-redo.docx` 全部等于 preset。
- 最后一轮确认六个样式选项为 3 列×2 行，面板宽 320，420×880 下整页 scrollWidth=420，固定动作在面板底部；Escape 关闭后焦点回真实“表格设计与属性”按钮。最终截图覆盖 `docx-table-design-{wide,420}.png`。
- 当前浏览器表样式未定义完整条件样式，不能据预设截图声称所有 tblLook 条件视觉均已实测；独立单测覆盖条件/直接格式和原生保存。浮动表格定位仍未接。

## PDF 画布绘图

- 文档 `5JImP9mvURcvsemJ`，普通 AcroForm 前两页各 5 个 annotations、第三页已有自有 arrow。当前页 Crop 约 380×555pt，Media 419.53×595.28。
- 基线 `/tmp/pdf-canvas-browser-baseline.pdf` 162024B。实际 pointer 绘制 6 点蓝色自由笔，一次显式应用/保存得到 `/tmp/pdf-canvas-ink.pdf` 165535B；id `dc564990-d53f-4c0c-bdbf-26e4bee1fea6`，x31.2058/y80.1696/w71.689/h14.7681。
- ink undo/save 原始字节等于 baseline，redo/save 原始字节等于 ink。移动与 SE 手柄缩放后 `/tmp/pdf-canvas-resized.pdf` w88.557/h27.42644；6 点一致平移/缩放，前两页 annotations、第三页原 arrow 保留。
- 最终构建确认旧“精确数值绘图”默认折叠，避免其默认坐标被误读为当前手势草稿值。
- 连续两次拖移真实 ink 线段：600,400→620,420，然后命中新位置 620,420→640,440；DOM path 与选择框两次同步更新。一次应用/保存 `/tmp/pdf-canvas-repeat-moved.pdf` 172076B，x77.5928/y129.115258/w88.557/h27.42644。单步 undo/save `/tmp/pdf-canvas-repeat-undo.pdf` 字节等于两次草稿拖移之前的 `/tmp/pdf-canvas-final-moved.pdf` 170497B；redo/save `/tmp/pdf-canvas-repeat-redo.pdf` 字节等于 repeat-moved。自有 id 和非目标页内容/5+5 annotations 均保留。
- 早期第二次拖移曾点在 ink 包围盒空白内，没有命中线段，未计成功；最终上述真实线段已证明连续草稿可继续拖移。
- 420 面板 x100/w320，scrollWidth420，底部应用/取消固定；Escape 从画布工具 combobox 关闭整个面板，焦点回“绘制”分类。截图 `pdf-drawing-{wide,420}.png`。
- 仅支持本编辑器自有绘图的选取/拖移/手柄，任意原件矢量、橡皮和一般原文字块手势仍未齐。

## XLSX 高级透视及数据解析修复

- 文档 `RPXy3ORlulEbxuou`，源 F1:J7：部门/地区/年份/收入/成本及 6 行。初次浏览器验收发现原生 F5/F6 正确、模型却漏值，不能按初次 UI “创建成功”验收。
- 根因是 paired-first 单元格 regex 把自闭合空 D5/E5 等吞进后继 F5 的闭标签。最小修复 row/c 先读取开标签再判 `/>`；保持隐式坐标/outline/hidden。独立检查另复现 sharedStrings 自闭合 `si` 空项后补导致索引错序，改按出现顺序遍历。未手改 vendor；显式 namespace 前缀的全解析支持仍是独立边界。
- 最终配置：输出 A15，行 部门→年份，收入求和 + 成本平均，报告字段地区，年份数值分组间隔2/起点2024，部门按收入汇总大于180。新建并保存 `/tmp/xlsx-pivot-correct-created.xlsx` 40487B。
- UI/原生缓存仅两个部门：技术部收入470/成本平均83.3333333，市场部440/81.6666667；总计910/82.5。原生 cache sharedItems 不含伪造空部门；6 条 cache records 正确。
- `/tmp/xlsx-pivot-correct-undo.xlsx` 全 ZIP entry/名称等于 `/tmp/xlsx-pivot-postdata-baseline.xlsx`；`/tmp/xlsx-pivot-correct-redo.xlsx` 全 entry 等于 correct-created。
- 通过真实范围工具把 F7:J7 改为 `研发部 / 华东 / 2028 / 260 / 90` 并保存，基线 `/tmp/xlsx-pivot-before-refresh-growth.xlsx`。已有定义以只读方式真实显示源范围、多值/报告字段、原生分组/筛选；点击刷新当前表全部透视表。
- `/tmp/xlsx-pivot-growth-refreshed.xlsx` 得到 A15:D23：技术部470，市场部280，研发部260，新分组2028-2030，总计1010/82.5；native 部门 sharedItems 增为三项且无空项。刷新主动使 cache recordCount=0/refreshOnLoad=1 是现有刷新合同，不能据输出正确声称 Excel 刷新语义完全一致。
- `/tmp/xlsx-pivot-growth-refresh-undo.xlsx` 全 entry 等于 before-refresh-growth；`/tmp/xlsx-pivot-growth-refresh-redo.xlsx` 全 entry 等于 growth-refreshed。
- 420 Inspector w320、整页scrollWidth420，固定刷新动作；宽/窄截图覆盖 `xlsx-pivot-{wide,420}.png`。最终包含 shared-si 修复的生产构建 reload 后再次看到研发部260/总计1010。
- 同表高级新建+已有定义读取/刷新已接；无 `edit_pivot`、跨表新建/复杂未知扩展不冒称支持，报告字段当前画布汇总全部项，Excel刷新分组可能改回明细。

## HTML 与共用 Ribbon

- HTML 多选使用真实 Checkbox.Group，结果保留数组顺序/旧单选协议；停止、切源、过期 prompt/brief 结果不继续写入。47/47 回归，详见 `xlsx-pivot-html-planning-check-20261017.md`。
- 无模型，浏览器采用实际 HtmlAgentPrompt/EditorShell/CSS 的明示示例数据 harness；1280/420验证提交数组、提纲编辑、固定footer。不能称真实 Agent 运行验收。截图 `html-planning-{wide,420}.png`、`html-brief-{wide,420}.png`。
- DOCX 目录最终420面板 w320，插入按钮 bottom841.359px，固定在footer；截图 `docx-toc-fixed-footer-420.png`。已保存native TOC字段、图片替换/裁切/去背景和PPTX内部复制剪切历史证据见 `docx-pptx-toolbar-browser-20261017.md`，本轮未重复原生闭环。
- PPTX420最终 Ribbon 折叠组固定72px单行，可局部横滚到最后“AI编辑”组，实际点击展开看到美化本页/事实核查/生成配图，menu x92–412处于视口内，整页scrollWidth420。截图 `compact-ribbon-last-group-420.png`。第一组因滚到最右可位于局部滚动区左侧，不是整页溢出。

## 门禁与证据位置

- DOCX表格/PDF独立联合检查 11文件77/77，Office tsc/目标lint/format/styles/diff及组件Antd检查通过；见 `docx-table-pdf-canvas-check-20261017.md`。
- XLSX最终独立检查 Office4文件61/61、Server2文件14/14，覆盖inline/shared真实原生add/refresh；Office/Server tsc、目标3文件lint/format/diff exit0。均为本切片计数，不能与重叠worker计数累计。
- 最终 Web build exit0，`/tmp/mimir-toolbar-final-accepted-web-build-20261017.log`（built in3.91s）；存在既有chunk/direct-eval/PDF混合import等警告，不称warning-free。
- 全仓 `pnpm check` 既存480项bundled Impeccable脚本lint错误仍阻断；没有重跑或伪称全仓绿。
- 截图根目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51`。原生验收从实际HTTP保存文件读回，Downloads曾被外部CWM软件改写，未用于字节保真断言。
- 新增验收fixture留在专用知识库，未获不可逆删除授权，不删除。其他侧栏/主题/设置/技能/vendor fixture脏文件原样保留。


## 最新续验：C1、跨表透视与工具面板视觉（2026-10-17）

本节覆盖早先“进行中”的两片，不改变旧报告的历史门禁。

| 功能 | 最终浏览器与原生证据 | 仍保留的边界 |
| --- | --- | --- |
| PDF交互表单/视觉签名 | 紧凑Ribbon、右侧320px Inspector、内部滚动/固定操作，1280及420×500通过；表单与4签名共存，修改/删除/Undo原生保真。见toolbar-pdf-signature-browser-20261017.md | 视觉签名不是数字证书签署；OCR未定范围 |
| DOCX保护C1 | 既有讨论编辑、回复、解决/重开真实保存/reload；正文与保护设置保持，只有comments/ext变化；空态/复杂讨论/现代扩展/修改密码只读原因准确。1280/420×500与两层Escape回焦通过。见toolbar-docx-protected-comments-browser-20261017.md | 新增删除锚点/表单/密码核验/强制修订未齐 |
| XLSX来源表Select | 长中文名、隐藏/保护状态、目标当前表、真实创建总计150；保存/reload/刷新与UndoRedo全ZIP条目精确。420×500按钮裁切已修，面板x100/y174/width320/bottom473.36，按钮bottom453.36；两层Escape回焦通过。见toolbar-xlsx-pivot-source-browser-20261017.md | 既有透视布局编辑仍另片，不能将其计为已齐 |

代码门禁：C1独立134/134，XLSX Office31/31与host11/11、两包tsc/目标静态绿；Web最终构建exit0（/tmp/mimir-toolbar-c1-pivot-source-web-20261017.log）。全Office首轮1868pass/1fail，PPTX等待静默耗尽由真实host gate确定性复现；保留动画数/顺序/删除/保存重开断言改同步，专项91/91通过。最终全套重跑结果随后追加。

测试使用统一admin账号，未配置真实模型；按用户选择只验代码/浏览器，Desktop由用户自验。临时viewport恢复、测试文件保留，未暂存提交归档，主任务in_progress。


最终统一门禁补记（2026-10-17）：全Office **178文件1869/1869，exit0**，日志 `/tmp/mimir-office-full-c1-pivot-source-final-20261017.log`（143.52s）。先前1868/1869失败保留为历史；PPTX仅测试同步修复，生产未改。最终Web构建 `/tmp/mimir-toolbar-c1-pivot-source-web-20261017.log` exit0；此后只改PPTX测试/spec/报告，无需重建生产。Server沿前次最终default737/local10/fnos4/backup2全绿，本片生产未改，新增跨表宿主专项11/11。无模型/Desktop自验、全仓480技能lint基线与整体in_progress边界不变；本轮未暂存、提交、归档或删除测试文件。
