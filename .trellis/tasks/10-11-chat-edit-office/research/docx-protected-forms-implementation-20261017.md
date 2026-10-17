# DOCX P1-F 受保护原生复选框：实施交接

2026-10-17。已按 `docx-protection-p1-next-20261017.md` §5 与 implement.md 的批准边界完成此片代码及定向检查，生产冻结，交独立 checker 和 root 浏览器验收。未暂存、提交、归档、删除测试件或修改 vendor、其他格式与服务端。

## 权限与原件保真

- `writable` 始终表示正文写权限；enforced forms 原件仍为 `editable=false`。新增独立 `formsOnly` 和每个真实原件 occurrence 的控件资格；不打开 vendor `formsFill`，不扩模型工具目录。普通 body/Agent/NodeView/粘贴/拖放等原 P0 限制保留。
- 新 `docx-protected-forms.ts` 从私有原件读取 XML offset tree，映射原生 legacy `ffData/checkBox` + 匹配 `FORMCHECKBOX` begin/instruction/end，以及 inline SDT 的真实 `w14:checkbox`/checked/glyph pair。相邻同形字段和缺失/重复 SDT id 都按原件 occurrence 与准确 PM range 区分。相同字段名加顺序编号，面板可区分。
- 仅可证明的顶层普通段落支持填写；前置或当前顶层 SDT/altChunk 展开后不凭 docxIndex 或同文推断身份。表格/复杂容器、锁、禁用、嵌套、畸形字段/状态、区域权限和节级 formProt 等逐目标只读。列表仍展示可读取的原生状态；状态损坏显示“无法可靠读取”，不猜未勾选。
- 使用真实 schema nodeSize，原生 atom（例如 body page-break）后的位置不按固定 +2 猜测。自有切换用 Unicode code point 及真实 UTF-16 range，支持 checked/unchecked 长度不同的 supplementary glyph；非法码点、相同状态 glyph、畸形值和缺失真实定义拒绝。
- PM guard 和最终 `session.save` 均验证：只将原件授权 occurrence 的当前合法 glyph 规范化回原件 glyph，再比较完整规范化 PM，保留所有其他 marks/attrs/text/节点/顺序/unknown 属性。不凭 metadata、glyph、可伪造 mark 或 history meta 授权；多个合法切换可合并，任何非法混合差量全拒。
- SaveOptions 必须无额外结构差量。原生保存从私有原 bytes 重放最终状态，仅局部写 checked 值/必要标签及 SDT `w:t` glyph（正确 XML escape），保留原默认值、ffData、原 shell/未知 XML/其他 ZIP 部件。取消切换、Undo 或直接 no-op 返回整件原始 bytes；第二次保存和重开后继续填写有回归。公开 session.content/originalBytes 污染不扩大 native 权限。

## 交互和历史

- 复用“审阅 → 文档保护”320px Inspector，单一内部滚动正文、固定底部唯一 primary，不在 Ribbon 横铺表单。
- “选择复选框”列出现有原生控件、状态、类型及具体只读原因；固定动作“勾选此复选框”/“取消勾选此复选框”为真实按钮，可聚焦后按 Space。没有控件时说明普通方框文字只读。
- 自有捕获 click 仅在真实控件标记且鼠标确实命中原件 glyph range 时执行；相邻合并 text node 用实际坐标区分，普通方框文字和修饰键点击不切换。可填/只读 glyph 有对应 pointer/not-allowed 与真实提示。没有放开通用 mousedown/对象手势。
- 一次切换是一个独立 PM history step。受保护正文下工具栏只开放该 forms PM Undo/Redo；其他编辑命令继续禁用。保存不清 PM history；forms-only 保存指纹跟踪已保存快照，Undo/Redo/toggle-back 正确恢复 dirty，保存等待期间另填/Undo 也不会把旧基线误认成已保存。此改动没有扩展 DOCX 普通结构 rounds 的保存后历史合同。
- C1/C2 comments 行为保持；native/Agent/Editor 原有受限批注与保存回归仍通过。

## 文件

新增：

- `packages/office/src/docx-protected-forms.ts`：私有原件映射、合法 PM 差量与 exact native patch。
- `packages/office/src/docx-protected-forms.test.ts`：原生/真实 PM/history/权限/私有基线回归，共16项。
- `packages/office/src/docx-protected-forms-fixture.test-helper.ts`：真实原件夹具。
- `packages/office/src/editors/docx-form-controls.ts`：自有 code-point-safe native occurrence toggle。

最小接缝：

- `src/docx-protection.ts`、`src/docx.ts`：独立能力、最终 guard、原生受限保存。
- `src/editors/docx-protection.ts`、`docx-protection.css`：准确事务放行、真正 glyph click 和状态提示。
- `src/editors/DocxProtectionControls.tsx`、`DocxEditor.tsx`：既有 Inspector、受限 PM history、forms-only 已保存指纹。
- `src/editors/DocxEditor.protection.test.tsx`：真实面板、两次保存/Undo/Redo、glyph click/paste、并发保存基线与C2回归。

## 检查证据

最终专项：

```sh
pnpm --filter @mimir/office test src/docx-protected-forms.test.ts src/editors/DocxEditor.protection.test.tsx src/docx-protection.test.ts src/docx-protected-anchors.test.ts src/docx-protected-comments.test.ts src/agent/docx-agent.test.ts src/editors/DocxAdvancedControls.test.tsx --maxWorkers=2
```

- **7 files / 163 tests PASS**，exit 0；`/tmp/mimir-protected-forms-final-tests2.log`。
- Office `tsc --noEmit` PASS，`/tmp/mimir-protected-forms-final-types2.log`。
- scoped oxlint 0 errors/0 warnings，`/tmp/mimir-protected-forms-final-lint.log`。
- 11 files oxfmt --check PASS，`/tmp/mimir-protected-forms-final-format-check.log`；scoped git diff --check PASS，`/tmp/mimir-protected-forms-final-diff-check.log`。
- style-backticks PASS，`/tmp/mimir-protected-forms-final-styles.log`。
- antd lint ProtectionControls/DocxEditor 均0issues，`/tmp/mimir-protected-forms-final-antd.json`、`/tmp/mimir-protected-forms-editor-antd.json`。
- 未跑全 Office suite/Web build，由 root 统一调度。未调用真实模型，未执行 Desktop 验收。

## 真实浏览器样本与独立原生脚本

- `/tmp/mimir-docx-protected-forms-20261017.docx`，7107 bytes；SHA256 `52a8dfa64c4bcba6afad94bcea3494e0f4d092df72ff479d94760d703b8c2ffd`。
- 前2个是相邻同形旧式复选框；3是 inline SDT；4禁用，5锁定。第3段有普通文字方框。原始均未勾选。
- `/tmp/mimir-docx-protected-forms-inspect-20261017.py BEFORE AFTER 1,3`：最后参数为保存后应勾选的原件顺序（1based），例如第一和第三个。脚本逐项比对所有非目标 ZIP bytes、settings exact、原件顺序/state、禁止4/5变化，并验证 document.xml 只包含准确 checked/glyph 字节补丁。
- `... BEFORE AFTER noop` 断言整件 bytes exact。脚本 noop 自检已通过；变化模式需 root 取得真实 UI 保存字节后运行。
- 真实键盘 Space、命中 glyph、1280/420×500、320px/内部滚动/固定唯一动作和保存下载由 root 实查；组件测试用真实 Editor，但 glyph 几何在 happy-dom 中有明确 mock，不能冒称浏览器布局已验。

## 参考与剩余范围

沿用已批准研究 §8 的固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 和 WeKnora 官网/公开源 v0.8.3（研究固定 `f5cfa0ff5fa87c45f59d4176f4ac8bb922bd5dd8`）证据；其 Office body/formsFill 区分和服务能力如实注册分别适用。WeKnora Markdown 工具栏不是本片视觉参考；本片是已批准实现交接，没有宣称新的外部竞品调研。

本片不实现密码核验/设置/移除、forced tracked changes、表格/复杂原件权限模型或新增 Agent checkbox tool；这些仍在 root 的全工具队列/兼容范围中。当前formsOnly仅表示受限填写可用，绝不使正文 writable。
