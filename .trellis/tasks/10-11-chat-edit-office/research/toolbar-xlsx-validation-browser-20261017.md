# XLSX 数据验证：生产浏览器阶段证据

2026-10-17 root。下文保留早期缺陷记录；末节记录修复后最新生产构建的回焦与普通输入发布复验。

## 环境

最新生产构建exit0，localhost:5180，真实账号admin@example.com，文档LX8VE0652GEEXOJW（原fixture `/tmp/mimir-xlsx-validation-20261017.xlsx`）。1280×800与420×500；只通过CUA DOM/用户动作修改，原生只读下载由本地fetch脚本取得，不称browser download。无模型调用，Desktop用户自验。

## 本批实际完成

- A1单元格显示真实填写提示；Alt+ArrowDown打开listbox，准确含`001`、`=A1`、`中文`、`含"引号"`。选择`=A1`并保存，A1原生`t=inlineStr`，没有f节点。
- A2引用带空格/单引号/中文工作表列表=线上/线下；A3全局名称同值；A4局部名称优先=线下/线上；A5 showDropDown隐藏时无下拉入口。Escape关闭列表。
- B2=99第一次warning，取消还原原值、没有dirty/history；第二次明确“仍然使用此值”才接受并dirty。保存后B2原生数值99，dataValidations节点与原件相同。
- warning保存→Undo保存→Redo保存逐ZIP entry比较：Undo与提交warning之前全部entry精确一致；Redo与warning保存全部entry精确一致。原生数据验证所有阶段保持；第一次A1写入额外仅workbook calcPr fullCalcOnLoad=1。
- 420×500实际截图`xlsx-dv-warning-production-420.jpg`位于本会话visualizations目录，警告两操作可达、当前格输入和工具栏可见，document.scrollWidth=420。取消后activeElement aria-label=null，已交checker补实际焦点恢复，不能记此项通过。

## 保存证据

`/tmp/mimir-dv-browser-list-literal-20261017.xlsx`、`/tmp/mimir-dv-browser-warning-confirmed-20261017.xlsx`、`/tmp/mimir-dv-browser-warning-undo-20261017.xlsx`、`/tmp/mimir-dv-browser-warning-redo-20261017.xlsx`。只有目标sheet2.xml及首次calcPr变化，未目标entries原样。

## 未完

stop/information/error-disabled/custom守卫、Inspector参数/固定footer、外层scroll自动关闭、焦点修复后最终最新构建、整体suite/build回归仍待root接续。当前生产页面刚提交B1=99 stop测试，需读实际结果；未保存。整体目标保持in_progress。

## 同构建追加

B1=99 stop：显示`汇总!B1：输入检查：请输入符合规则的值；文档未修改`，无继续按钮，Escape还原草稿。B3=99 information真实出现同样显式取消/仍然使用确认，Escape取消且保持已保存。B4 showErrorMessage关闭=99直接接受、无warning并dirty；Undo还原原值和已保存状态。B5 UNSUPPORTED custom=99明确拒绝并“文档未修改”，Escape还原。

数据→数据规则→验证提示打开当前全规则Inspector，列表默认A1；现有prompt/error/dropdown参数准确读出，未改配置。420×500面板x100/y178/width320/height222.516，内部content client125.516/scroll630，固定footer bottom400.516，主按钮bottom388.516；该页cell输入/状态仍可见。截图xlsx-dv-settings-production-420.jpg实际查看，未把仅打开配置当原生改写验收。

独立checker已冻结生产修复，Office99/99、server24/24、renderer2/2；本报告以上仍是修复前生产构建，最终新构建回焦/普通操作跨分类必须重验。


## 修复后最新生产构建复验

同一文档、统一测试账号；真实420×500和1280×800。B2原值99，warning分别输入98和97，通过“取消此次输入”及Escape取消；两条路径实际activeElement均为aria-label=单元格 B2的输入框，值回99，保存与撤销始终禁用。页面scrollWidth=420。截图`xlsx-dv-cancel-final-420.png`，没有沿用早期aria-label=null作为通过证据。

1280下普通无DV的C3输入`ordinary-commit-20261017`，Enter后同调用立即切“数据”分类；真实发布一次，保存及撤销可用。保存后原生C3是inlineStr，且无formula；Undo并保存，与本次基线所有非目录ZIP entry精确一致。当前页面已回原值/已保存，Undo禁用。

原生证据：`/tmp/mimir-xlsx-dv-final-browser-baseline-20261017.xlsx`（6938B）、`/tmp/mimir-xlsx-dv-ordinary-final-20261017.xlsx`（6961B）、`/tmp/mimir-xlsx-dv-ordinary-undo-final-20261017.xlsx`（6938B）。这里为本地认证只读下载，不称browser download。

旧保存完成与新输入交错的两种顺序已有实际Editor deferred回归；没有做生产浏览器人工网络延迟实验，因此不宣称该竞态已在浏览器复现。完整新一轮suite/build仍由总任务统一执行；本节只闭合修复后的具体UI项。
