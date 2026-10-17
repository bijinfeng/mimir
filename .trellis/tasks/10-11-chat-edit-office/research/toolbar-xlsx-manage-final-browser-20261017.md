# XLSX 管理侧栏最终浏览器补证

2026-10-17，root；production preview 最新构建 `/tmp/mimir-toolbar-inspector-encryption-web-20261017.log`，已 reload。此前 native 位置保存/Undo/Redo 证据与此轮新构建视觉复核分开记录。

## 最终层叠与短高

文档 `pYBARnmuihGwODj_`，渐变原件。1280×800 和 420×500 均从插入 → 对象与表格 → 管理 → 当前对象选择“渐变旋转圆角”。真实当前提示“原生渐变”，没有把未支持填充伪装成白色。

420×500 panel x100/y174/w320/h299.36；`elementsFromPoint(125,198)` 首项 H2 对象与表格、header、aside，冻结 A 列标题在其后。证明最终 isolation 补片实际修复标题遮挡。页面 scrollWidth420。

点击位置字段后，真实 `.mimir-xlsx-management__body` clientHeight118/scrollHeight476/scrollTop242，字段 y344.75/h24，固定 footer y416.36/h49；导航与对象选择随正文滚动，主操作可见。外层 content clientHeight251/scrollHeight251 **不是实际管理滚动容器**，不能混报。

颜色弹层打开后的真实焦点是 `.me-color__panel`。在该焦点按 Escape，仅颜色层关闭，Inspector 保留，焦点回到“形状填充”。先前一次自动化对触发按钮 `.press(Escape)` 会先强制把焦点移到触发器，再关闭 Inspector；这是不同焦点情境，不算真实弹层 Escape 失败。重新打开面板仍保留管理模式与当前对象。

另切换“透明轮廓”准确显示“无填充”；切换“主题样式”准确显示解析后的纯色 `#E4A24A`。这些只读切换后保存和应用仍 disabled，没有修改原件。

最终截图（替代旧的标题遮挡截图）：

- `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/xlsx-manage-gradient-final-1280-20261017.png`
- `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/xlsx-manage-gradient-final-420-20261017.png`

## 此前已固定的原生保存证据

同文档实际将位置 B1 改 C4，保存/download；`xl/drawings/drawing-preview.xml` 除首 anchor from/to 外原文一致，整个 shape XML（渐变、旋转、富文本）一致，其他 anchors 原文一致；workbook 除 calcPr 外一致。Undo 保存整文件 baseline exact；Redo 保存全部 ZIP payload applied exact；最后 Undo 保存恢复 baseline。

固定工件 `/tmp/mimir-xlsx-manage-gradient-browser-{baseline,applied,undo,redo,restored}-20261017.xlsx`。baseline SHA256 `3402426b1c8b908ed2c0b622ff73fab5b6a376b0fb5b17770a766ca7c1648836`，applied SHA256 `f506dad504573460ad26eb876b3d25a3d30916ba91fc27118be85918249bc92d`。此证据早于 isolation 补片，但该补片只有 CSS 层叠，没有修改保存算法。

实际 hostBusy 取消迟到零发布由正式独立测试37/37证明，不把静态/组件结果写成浏览器挂起请求测试。没有 provider/Agent/Desktop 声明。参考沿固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 和已核 WeKnora v0.8.3（KB边界），本轮未重新联网。
