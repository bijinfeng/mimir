# 当前副本导出与结构化剪贴板验收

2026-10-17。**本批代码、独立检查与浏览器验收通过，整体工具补齐仍进行中。** 用户要求先完成代码与浏览器验收；Desktop 用户自验，真实模型尚未配置，本片不调用模型。整体任务继续 `in_progress`，保留测试件，不提交/暂存/归档。

## 本批范围

- DOCX：视图分类导出当前未保存副本，复用原生保存输入，不改变库中文件、dirty 或撤销历史。
- XLSX：编辑器持有同文档原生范围复制/剪切缓存，跨表粘贴、网格剪贴板事件、系统 HTML/plain 与受限外部表格导入；每次成功后消耗范围缓存并明确要求重新复制。
- XLSX 基础样式：读取与写入对齐显式单元格 → 启用 customFormat 的行 → 列 → 默认；重叠列采用最后带样式的声明，宽度声明不清前面的样式。
- 组合内图片是下一独立切片；即使编译含其私有宿主，也不据本报告宣称该片完成。

方案与固定参考证据沿 `docx-current-export-plan-20261017.md`、`xlsx-structured-clipboard-plan-20261017.md`：GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` / Univer 0.25.1；WeKnora 官网保存的 HTTP 200 证据与 v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的真实能力注册原则，仅用于能力诚实，不作为 Office 工具栏视觉参考。

## 已有代码证据

- DOCX 独立复核修复同 session 切文档时旧导出 job 锁住新文档；2 文件 **29/29**，Office 类型及目标静态通过，详见 `docx-current-export-check-20261017.md`。
- XLSX 客户端独立检查 6 文件 **104/104**，修复同版本源身份重载、新输入与迟到操作、重复主按钮和失联入口焦点；Office 类型及目标静态通过。真实截图后追加可见导入按钮/分区/间距修正，最终相应真实组件 **7/7** 及类型、静态、样式门禁通过，见 `xlsx-structured-clipboard-check-20261017.md`。
- XLSX 基础继承读取与原生写入独立检查：Office 3 文件 **61/61**、Server 5 文件 **96/96**，双包类型及目标静态通过。修复重叠列、合法省略行号的重复行/格，以及单双引号/paired dimension 重复节点，详见 `xlsx-inherited-display-native-check-20261017.md`。

## 浏览器与下载原件

生产预览 `http://localhost:5180`，标准测试账号，知识库「编辑器工具栏验收-20261016」。

### DOCX 当前副本

`1LqHFPLBFusS-K3d` 实际输入 `Export draft A.`，页面底色 FFF9E6 改 E8F1FB，点击「视图 → 导出副本」下载；再输入 `Export draft B.` 下载，撤销/下载、重做/下载。浏览器实际下载到 Downloads 后复制留证：

- `/tmp/docx-export-browser-{baseline,draft-a,draft-b,undo,redo,library-after}.docx`。
- `/tmp/docx-export-browser-native-verification.json`：A 与撤销、B 与重做**全部 ZIP 条目精确相等**；草稿只有 document.xml 改动，Ion 主题/显式字体与其它部件保持。
- 实际请求库中下载与基线**完整字节相等**，导出未调用库保存。导出前后保存按钮仍启用、撤销/重做可用。末尾已撤销浏览器输入与底色；DOCX 既有 dirty 为修改标记，普通历史回到原文不自动清除此标记，没有把它声称为已保存。
- 1280/420 入口均可见；420 的按钮 x135.2、width85.1，整页 scrollWidth420。

### XLSX 原生复制/剪切和历史

`P51sn7n1D3bIq_fX` 实际从数据!A1:C3 复制至目标!D8、保存，再剪切源至目标!G2、保存；复制/剪切预备时 save disabled，源仍可见。每次粘贴一次历史；撤销剪切/保存、再撤销复制/保存、重做两次/保存。

- `/tmp/xlsx-clipboard-browser-{baseline,copy,cut,cut-undo,all-undo,all-redo}.xlsx`。
- `/tmp/xlsx-clipboard-browser-native-verification.json`：三组历史比较**全部 ZIP 条目精确相等**；源移动后 A1:C3 清除；两组目标 s 矩阵均 `[[2,0,2],[1,4,0],[1,0,0]]`，包括原空洞与显式默认0。
- 原生 `D9 = D8+$C$1`；移动后 `G3 = '目标'!G2+'目标'!$I$2`，相对/绝对引用随移动正确更新；00123 inlineStr、rich run 的原 b 保留。网格实际显示继承 numFmt 的 `00012`。
- copy 只改目标 sheet 和 workbook 的 `calcPr fullCalcOnLoad=1`；去除此新增标记后 workbook 原文精确一致。cut 只改两张 sheet；styles、主题、customXml 等其余 entry 精确保持。

### 真实浏览器事件和外部 HTML

- 实际网格 `Control+C` 产生 text/plain + text/html（真实内部 marker、正确 TSV/继承基础颜色）；`Control+V` 将目标!D8:F10 原生粘贴至 A12，下载 `/tmp/xlsx-clipboard-browser-keyboard.xlsx`，A13 原生公式 `A12+$C$1` 和9格 s 矩阵验证通过。实际 `Control+X` 也仅记录来源、不 dirty，不删除原格；取消后未持久化额外移动。
- 浏览器**会话剪贴板 API** 写入外部简单 HTML，UI「读取系统剪贴板」→明确粘贴至 D15；`=1+2` 原生为 inlineStr、无 f，00123 保留，实际网格/原件均为 bold/14pt/#2468AC/#E8F1FB。文件 `/tmp/xlsx-clipboard-browser-external-html.xlsx`；验证 `/tmp/xlsx-clipboard-browser-external-verification.json`。此原生格式写路径会新增空 ZIP 目录，未当作内容损坏；撤销后完整 entry 回到 cut 快照。
- 带 border 的 HTML 普通粘贴明确报不支持，save 仍 disabled；用户显式「仅粘贴显示值」后才写 D15 原生文本00123，文件 `/tmp/xlsx-clipboard-browser-values-only.xlsx`。最后撤销/保存已恢复 cut；`external-undo.xlsx` 与 cut 全部条目相等。
- 这证明实际浏览器事件与浏览器会话剪贴板，不是外部 Excel/OS 互操作验收；Desktop 仍由用户自验。HTML 仅为已声明基础格式子集，不承诺任意 rich/合并/多表/源数字格式往返。

### 唯一视觉修正与确认

首轮真实截图发现 CSV/TSV 是空白按钮、分区无可视标题、按钮散乱居中。已补可见图标/「导入 CSV / TSV」、内部范围/外部内容标题、源/取消同行及局部左对齐/间距，再统一构建确认一次。未再进行可选打磨。

- 最终 `xlsx-structured-clipboard-{wide,420}.png`：1280/420 均320px面板；420 x100，scrollWidth420；content client407/scroll569 独立滚动，固定主按钮 bottom681.36、footer bottom693.36，完整可达；当前源目标清楚，面板跨宽度保留。Escape 回当下可见「剪贴板」分组。
- `docx-current-export-{wide,420}.png` 同在 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/`。

## 构建与受控回归

- 受控完整 Office：**151 文件，1558/1558**，`/tmp/mimir-clipboard-export-office-controlled-20261017.log`。在最后局部视觉修正之前；修正后真实组件7/7/Office types/static通过，未无故重跑全套。最后 dimension 是 server-only 修正，由最终96/96覆盖。
- 最终视觉构建 exit0：`/tmp/mimir-clipboard-export-web-ui-final-20261017.log`；浏览器 reload 的即此构建。之前两次构建也exit0，不替代最终证据。
- 全仓 `pnpm check` 已知 480 项 bundled skill lint 阻断继续单独记录，不冒称全仓通过。未提交、暂存、归档或删除测试件，整体仍有矩阵所列后续工具。
