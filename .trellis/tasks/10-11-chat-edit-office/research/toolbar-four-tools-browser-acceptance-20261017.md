# 四项工具浏览器验收记录 · 2026-10-17

## 范围、来源与任务状态

记录 DOCX 引用、XLSX 原生填充、PPTX 系统图片/多页剪贴板、PDF 页面图像导出的本批代码与浏览器验收。浏览器操作、页面尺寸和截图由根会话提供；本记录整理者只读复核下载文件的原生 ZIP 部件、PNG 尺寸与现有检查报告。没有补跑全套测试、构建或桌面操作。

整体任务仍为 **in_progress**，不能由四个切片验收推导六格式工具完备。没有模型配置，真实模型 Agent 调用未验；Desktop 按用户要求自行验收。测试文档保留，不删除、不提交、不归档。

文件编辑主要参照 GenOffice 固定提交 `480548fd55f1be3593ee0d8e316a734751d58309`。具体原生引用/填充/剪贴板/PDF 导出证据沿用各实施和独立检查报告。WeKnora 官网与公开源码 v0.8.3、提交 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的 HTTP200 证据见 `docx-references-20261017.md`、`xlsx-fill-check-20261017.md`、`pptx-external-clipboard-20261017.md`、`pdf-image-export-check-20261017.md`。知识检索/沙箱权限门控适用于能力边界，不提供 Office Ribbon 或原生文件保存合同；本记录未新增竞品研究。

## 最终代码门禁

- Office full：`/tmp/mimir-office-final-tests-20261017.log`，**128 文件、1359/1359**。
- Web 最终视觉构建：`/tmp/mimir-toolbar-final-visual-build-20261017.log`，根会话记录 exit0，日志确认 `built in 14.05s`。构建仍有 direct eval 和 PDF 静态/动态混合导入提示，不作为无警告构建报告。
- 各独立检查的类型、专项回归、lint、Antd 和样式门禁沿用各报告，**不跨报告累计重复用例**。本次收尾定向 oxlint exit0、3 文件 oxfmt、`lint:styles`、目标 `diff --check` 通过；DOCX render 测试的既存 `openTableMenu` scoping warning 不属于这次改动。
- 全仓 `pnpm check` 不声称通过；此前 bundled Impeccable 脚本的 480 项 lint 阻断仍按原记录保留。

## 1. DOCX 引用

“引用”实际 Ribbon 分类提供目录与更新、题注、引文与来源、索引、原生域。测试文档 `jKSPHJDlHk8-1hlV`，源夹具 `/tmp/mimir-docx-references-native-fixture.docx`。

- 浏览器完成安全 TOC 更新、来源编辑和引文/题注插入，下载中为真实 TOC/CITATION/SEQ 字段，非仅画布文字。来源 Legacy2024 标题为“浏览器原生来源更新”，原有双作者、DOI `10.1000/mimir-preserve`、Volume 17 等保留。
- 宽屏与 420px 检查来源新建/编辑/收起；入口均有可辨图文、下拉占满可用宽度；420px 的 scrollWidth=420。面板内部滚动、主动作和关闭/Escape 行为按当前 Inspector 合同验收。
- ZIP 全条目精确恢复：`docx-references-toc-undo.docx` = `docx-references-browser-baseline.docx`；`toc-redo` = `toc-updated`；`source-undo` = `before-source`；`source-redo` = `source-citation`（以上文件均在 `/tmp/`，同名前缀 `docx-references-`）。

边界：仅更新可靠识别的完整 TOC 区域；Word 负责实际字段、页码与参考文献样式重算；没有原生 Zotero 桥。一般域使用真实可得或用户提供的缓存，不声称浏览器完成所有 Word 域计算。代码/专项细节见 `docx-references-check-20261017.md`。

## 2. XLSX 原生填充

手动 Inspector 与 Agent `format_range.fill` 共用原生写入，支持18种图案、theme/tint、linear/path 渐变和2–10色标；显式清除与省略保留分开处理，保留未修改 XF 元数据。真实保存样本：

- `/tmp/xlsx-fill-pattern-theme.xlsx`：`darkGrid`，前景 theme4/tint0.25，背景 theme0。
- `/tmp/xlsx-fill-three-stop-gradient.xlsx`：45° 线性渐变，0 为 RGB123ABC、0.5 为 theme5、1 为 theme0。237° 是宽窄切换保留的未应用草稿，不能与已保存45°混淆。
- 浏览器1280→420时同一面板和237°草稿保留，420px scrollWidth=420；内容可滚动、动作可达，Escape 在折叠状态回“格式”。对象与填充 Inspector 互斥。
- ZIP 全条目精确恢复：`xlsx-fill-pattern-undo.xlsx` = `xlsx-fill-browser-baseline.xlsx`；`pattern-redo` = `pattern-theme`；`gradient-undo` = `pattern-theme`；`gradient-redo` = `three-stop-gradient`（均在 `/tmp/`，同名前缀 `xlsx-fill-`）。

边界：原件 RGB+非零 tint 等不能用现行 StyleColor 无损表达的组合只读提示 unsupported；不修改 fill 时继续保留原 XML。画布是原生图案/渐变预览，不等同全部 Excel 细节逐像素证明。详见 `xlsx-fill-check-20261017.md`。

## 3. PPTX 系统图片与多页剪贴板

系统图片入口仅在用户明确操作时读取真实 PNG/JPEG；原生 paste/drop 接受文件字节，文本输入让位。内部引用与真实 OS 数据有明确区分，权限失败使用可见内部回退。新图片真实回选、一次历史、保存后图片操作 undo/redo 已验。

- 全条目精确恢复：`/tmp/pptx-system-image-undo.pptx` = `/tmp/pptx-system-clipboard-browser-baseline.pptx`；`image-redo` = `image-inserted`。
- 支持图文和选页操作的侧面板当前为 **340px**，不是早期实施稿的320px；420px整页无横向溢出，内部滚动和底部动作可达，Escape回“剪贴板”。
- 新浏览器夹具 `/tmp/mimir-pptx-multislide-notes-fixture.pptx`，库中文档 ID `1LRNwPP0z9NVNv2u`。基础3页，1↔2页互跳，共享图片；备注分别为“第一张备注 · 保留原件”“第二张备注”，第3页无备注。
- 真实 UI 复制两页并粘贴，3→5页。`/tmp/pptx-multislide-notes-pasted.pptx` 的原页与复制页互跳正确，四份备注文本/回链保留，图片 SHA256一致（共享源字节前缀 `fa07089aaa46`）。多页剪切后再粘贴仍为5页，`cut-paste.pptx` 原生备注、互链、图字节保留。
- `/tmp/pptx-multislide-notes-undo.pptx` 的所有非目录 ZIP 部件与 `browser-baseline.pptx` 精确一致；唯一差异是17个空目录条目，不写成全 entry 相同。`redo.pptx` 与 `pasted.pptx` **全部 entry 相等**（本段同名前缀 `pptx-multislide-notes-`）。

结构边界：旧复杂测试文档 `dAK...` 因 sections、`6_EJ...` 因3D占位明确拒绝，保留文件；这不是缺少复制按钮。custom shows/sections、comments、Zoom、选区外链接、被剪页的保留页入链、外链媒体、不兼容notesMaster、页面尺寸不匹配等按检查报告在改动前拒绝。深层组成员限制保留。外部文字转形状、任意 OS OOXML 编辑载荷、选页转图片不在本片范围。详见 `pptx-system-clipboard-check-20261017.md`。

## 4. PDF 页面图像

浏览器显式选择当前/全部/指定页码、72/150/300dpi并生成预览，单页 PNG、多页 ZIP。工作副本包括已应用修改和待保存页面几何；导出不保存原件、不制造历史。

- `/tmp/pdf-images-export-current-150dpi.png`：1156×790。
- `/tmp/pdf-images-export-all-72dpi.zip`：依当前页序 `page-001.png` 555×379、`page-002.png` 419×595、`page-003.png` 595×419。
- `/tmp/pdf-images-export-after-download.pdf` 与 `pdf-images-export-browser-baseline.pdf` 字节一致。
- 宽屏/420px 已生成 PNG 状态入口只有单份可见动作文字，无 primary label 重复。重新生成的 secondary 图文间距局部设6px，符合 ToolbarButton primary 自动显示label、secondary由children提供可见文字的合同；最终构建重新载入后，根会话已生成实际150dpi预览并刷新宽屏/420px截图，重新生成图文间距、单一下载文字、固定底部操作均目视通过。

边界：总像素/单边/PNG总大小有限制；完整批次成功才提供ZIP。源/配置变化、取消、关闭后旧结果不得下载。签名、真涂黑、OCR、原文块编辑不由页面图像导出证明。详见 `pdf-image-export-check-20261017.md`。

## 截图索引

目录：`/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/`。

| 工具 | 宽屏 | 420px |
| --- | --- | --- |
| DOCX 引用 | `docx-references-wide.png` | `docx-references-420.png` |
| XLSX 填充 | `xlsx-fill-wide.png` | `xlsx-fill-420.png` |
| PPTX 剪贴板 | `pptx-system-clipboard-wide.png` | `pptx-system-clipboard-420.png` |
| PDF 页面图像 | `pdf-page-images-wide.png` | `pdf-page-images-420.png` |

截图已由根会话在最终构建下实际复查并刷新。临时viewport已清除，原系统剪贴板已恢复（原为空）。
