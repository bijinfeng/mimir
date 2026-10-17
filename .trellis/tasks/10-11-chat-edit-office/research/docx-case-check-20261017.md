# DOCX 大小写独立检查

2026-10-17。检查已冻结的 `docx-case.ts`、`DocxCaseControls.tsx`、两份专项测试和 `DocxEditor.tsx` 的 import / 稳定 extension / additionalFontControls 接缝。本片没有修改生产代码或测试，没有提交、暂存或归档。

## 结论

没有发现需修复的大小写实现问题。可以交给主会话生产构建、真实浏览器宽区与 420px 验收；本报告不代替浏览器视觉证据。

- 目标捕获绑定真实 Editor、doc 和非空 TextSelection。菜单打开后仅移动选区不会改目标；doc 变化、换 Editor、销毁或只读在执行前拒绝。
- 全范围预检未知节点/marks、域、现有修订、SDT、隐藏文字与截断代理对；不会一半转换、一半跳过。普通链接/批注 marks 原样附回。
- 四模式按完整逻辑文字转换，再按 Unicode scalar 与原 run 归属回配，覆盖跨 marks 的词首/句首、Greek final sigma、ß 扩长、İ 组合点、emoji 与组合重音。末次验证拼接结果；无法证明时事务前拒绝。
- 一次文字事务保留 marks 和正反选方向，长度变化后完整范围仍选中。no-op 不 dispatch、不 dirty、不增加历史；metadata-only closeHistory 隔离紧接的人工输入。
- 人工修订沿现有 recorder，没有绕开修订的 TRACK_IGNORE。已有修订范围明确拒绝。
- Shift+F3 仅 editor-local，排除额外修饰键、IME、输入框/选择框/combobox 与嵌套独立 contenteditable。菜单为四项紧凑即时操作，复用既有弹层焦点/Escape 合同。

## 保存证据与边界

复核真实原生 fixture 测试：原 numId/ilvl、列表/普通表格结构、rawRPr（含未知 fitText）、链接关系、批注范围与 comments.xml、非目标文字和表格底纹保留；编辑仅 document.xml 变化，二次保存稳定，undo/redo 保存逐 ZIP entry 与对应基线一致。

实现报告正确限定为已建模属性、rawRPr、关系与上述实际结构。现有 native 文字重建路径不保证任意未知 w:p/w:r 开标签属性及全部未知 inline XML 原样保留；没有把列表专用 XML patch 的保真能力泛化到任意文字编辑。

固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 四模式/Shift+F3 与正文排序 disabled 证据、WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的权限参考边界均见 `docx-case-sort-next-20261017.md`。本次检查没有新作竞品研究，没有把 disabled 排序占位算成已实现能力。

## 独立门禁

- 8 个相关文件 134/134：docx-case、DocxCaseControls、docx-toolbar、docx-toolbar-render、docx-lists、DocxListControls、docx-references、docx-save。
- 大小写 4 文件 oxlint、oxfmt：通过。
- DocxCaseControls 的 Antd 检查：0 issues。
- 目标 `git diff --check`：通过。
- Office `tsc --noEmit`：最终通过。首次受并行新增 XLSX 布局测试的 readonly 属性赋值阻断（与本片无关）；XLSX 所有者改为对象展开构造后，独立重跑 exit 0。

日志：`/tmp/mimir-docx-case-check-{tests,types,lint,format,antd}.log`。

## 后续验收

主会话用 `/tmp/mimir-docx-case-fixture.docx` 实际选择普通文字，检查四模式、Shift+F3、扩长选区、受保护域禁用、保存重开与原件历史，以及宽区/420px 菜单可读、Escape 回实际入口和无横向溢出。无需模型配置；Desktop 用户自行验收。
