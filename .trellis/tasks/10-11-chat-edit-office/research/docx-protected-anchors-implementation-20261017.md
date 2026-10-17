# DOCX P1-C2：受保护批注的新增与删除实施

- 日期：2026-10-17。
- 已批准边界：`implement.md` 的 C2 条目及 `docx-protection-p1-next-20261017.md` §4。
- 状态：生产冻结，专项代码/真实组件验证完成；待独立 checker 与根会话真实浏览器验收。没有宣称整个保护工具已完成。

## 行为与保存合同

1. `commentsOnly` 始终 `writable=false`。新增/删除只经过具名批注入口，正文输入、格式、对象与其他附加结构仍拒绝。
2. 原生映射来自私有 `word/document.xml` 的实际 paragraph/run/w:t，按 PM `docxIndex` 及完整文本精确对齐。允许普通直属单段、多富格式 run、run 内边界拆分和 emoji 的完整码点边界。段落壳、pPr、其他原始 run 与部件不再生成。
3. run 拆分复制准确的原始 run 壳/rPr/t 属性，必要时只补/改目标 xml:space。原件未知 pPr/rPr/透明属性保留。字段、超链接、修订、嵌套对象、多内容 run、带身份/rsid 的 run 及无法证明的映射不授予新锚权限。已有复杂锚保持原样，按目标拒绝删除。
4. 原生根删除只去掉准确 namespace + ID 的 start/end/reference 片段，以及对应 comment/commentEx；其回复同时删除。删除回复单独操作，不触正文。保留空 reference run、comments 部件/关系，避免无必要清理。新建首条评论时只局部添加必要 comments 关系/ContentType；回复/解决按 C1 创建必要 ext。
5. 最终保存校验所有保留旧锚位置不变，新 root 恰有一个合法、非空、单段范围，与完整 comments 状态一致，不覆盖其他锚。原生补丁后重新解析并核对新增/删除 ID 的锚节点数量。
6. 去掉且仅去掉 comment marks 后用真实 PM Schema/Fragment 正规化比较完整正文，并追加 raw canonical 比较，防止 schema 水合丢掉未知伪造 attrs/marks 后误授权。comment 导致的相邻 text 拆分/合并允许；其他正文属性、非 comment mark、文字、对象、顺序均不允许变。
7. 完整 PM+comments 状态先校验，再仅为准确目标事务开启同步 guard。另一 PM filter 拒绝时不发布 metadata、dirty、版本或新 round。结构 Undo 先校验待恢复整对状态，以相同受控事务恢复 comment marks；C1 options-only Undo 仍不调用 setContent。普通 Cmd+Z 未被冒称完整批注历史。
8. 同一 session 多次保存以私有原件重放最终合法状态；新增后删除、Undo/no-op 回原返回整份原始 ZIP bytes。C1 的改文字、回复、解决、重开及未知现代扩展拒写继续保留。

## UI

- 审阅 → 添加批注使用既有 **320px Inspector**；与管理批注共用单滚动正文和固定底部操作区，唯一 primary。
- 冻结真实选区和当前版本，精确 occurrence 与 Agent 定位合同一致；无选区使用当前段落。打开面板、填草稿不 dirty。跨段/复杂/已有批注目标显示实际原因。
- 新增成功后明确状态，管理面板允许新讨论编辑/回复/删除；空态提供正确新增路径。保护说明更新为实际能力。Escape 使用原 live 入口回焦。
- 实际 420×500/宽窗口与原生 UI 保存检查由根会话继续，尚未在本报告标为通过。

## 文件

- `src/docx-protected-comments.ts`：私有原生锚映射、窄补丁、首条评论部件/关系、按目标能力及最终一致性。
- `src/docx-protection.ts`、`src/docx.ts`：完整正文正规化不变量、同步准确事务授权、最终受限保存。
- `src/editors/docx-protection.ts`：仅放行 controller 已批准的准确批注事务；DOM/正文 guard 保留。
- `src/agent/docx-agent.ts`：add/delete 原子校验与 publication、失败清理、受限结构 Undo。
- `src/editors/DocxAdvancedControls.tsx`、`DocxEditor.tsx`、`DocxProtectionControls.tsx`、`docx-comment-controls.css`：新增 Inspector、具名入口、说明与空态。
- `src/docx-protected-anchors-fixture.test-helper.ts`、`src/docx-protected-anchors.test.ts`：真实原生样本及新增回归。
- `src/docx-protected-comments.test.ts`、`src/editors/DocxEditor.protection.test.tsx`：更新 C2 能力断言，保留 C1 与全保护防线测试，增加真实 Inspector 保存/删除/撤销/回焦。

## 验证

最终专项命令：

```sh
pnpm --filter @mimir/office test src/docx-protected-anchors.test.ts src/docx-protected-comments.test.ts src/docx-protection.test.ts src/editors/DocxEditor.protection.test.tsx src/agent/docx-agent.test.ts src/editors/DocxAdvancedControls.test.tsx --maxWorkers=2
```

- 最终日志 `/tmp/mimir-c2-tests-final.log`：**6 files / 140 tests 全通过，exit 0**。
- 前一冻结集成 139/139 通过；追加真实 Editor “新增→保存→管理→确认删除→二次保存整件归原” 11/11 通过。
- 覆盖富 run 内边界新增/未知 XML 保留、两次保存/重开、根+回复删除、独立删回复、首条评论及 ext 关系、同 run 两处新增、emoji 边界、直接 save 伪造/丢非评论格式/迁移旧锚拒绝、重叠/复杂/旧版本拒绝、别的 PM filter 拒绝 metadata 不动、结构 Undo exact ZIP。
- scoped oxlint：0 errors；4 个原有 `docx-agent.ts` no-map-spread warning，未扩展重构。格式检查、style-backticks 通过。antd 三个 UI 文件按单文件检查均为 0 issues（初次多参数调用仅 CLI 用法错误，随后按支持参数重跑）。
- Office tsc 已运行，多次输出当前并行 PDF/XLSX owner 暂态错误；最新 `/tmp/mimir-c2-types5.log` 无本片文件错误，**不宣称全包 tsc 已绿**。根会话待各片冻结后统一复验。
- 没有运行全 Office、Web 构建、真实模型、Desktop 或上传/删除。没有改 vendor/server/shared，没有暂存、提交、归档、清理他人改动。

## 真实浏览器样本与原生独立检查

稳定上传文件：

- `/tmp/mimir-docx-protected-anchors-rich-20261017.docx`
- `/tmp/mimir-docx-protected-anchors-empty-20261017.docx`

rich 样本：

| 段落 | 可操作目标 | 原生预期 |
| --- | --- | --- |
| 1「普通单段可以添加批注」 | 可选择「单段可以」测试同 run 中间拆分，或整段新增 | 仅 document/comments（已有 ext 时可局部追加对应 commentEx）变化；未知 pPr/rPr/attrs 保留 |
| 2「已有讨论 其他文字」 | root0「可删除的原生讨论」+ reply1「单独可删除的回复」 | 删回复只 comments/ext；删根含回复并且 document 只精确移除 id0 三个锚元素，原 run 壳仍在 |
| 3「复杂超链接目标」 | root2 文本编辑可用；新增及删除锚拒绝 | 不修改该超链接/锚，保留原件 |
| 4「富格式 中文🙂 尾部」 | 可测跨多个富 run 的同一段新增 | 原始两类 rPr/属性保留，emoji 不拆码点 |

empty 样本无 comments 关系/部件，用于真实首次新增（及回复/解决）的部件创建验收。保留原 C1 KB 样本，不覆盖它。

独立检查：

```sh
python3 /tmp/mimir-docx-protected-anchors-inspect-20261017.py BEFORE.docx AFTER.docx add
python3 /tmp/mimir-docx-protected-anchors-inspect-20261017.py BEFORE.docx AFTER.docx delete0
python3 /tmp/mimir-docx-protected-anchors-inspect-20261017.py BEFORE.docx AFTER.docx delete1
python3 /tmp/mimir-docx-protected-anchors-inspect-20261017.py BEFORE.docx AFTER.docx noop
```

检查所有非目录 ZIP entries：允许目标之外 byte 相同、settings exact、所有段落 w:t 文本相等、评论与锚 ID、删除0精确片段替换、删除1正文 exact、no-op整份ZIP exact；打印变更部件与 SHA256。add 模式还检查样本特有 opaque/富属性确实存在。该脚本用于根会话从真实 UI 保存/导出后取到的字节；不是把 HTTP fetch 或句柄调用冒充浏览器动作。

## 参考与后续边界

沿用并复核 C1/C2 已批准研究的固定证据：GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 区分 body 写权限与 commentsAllowed；Office 文件编辑交互为主。WeKnora 官网 `https://weknora.weixin.qq.com/` 与公开源码 v0.8.3（研究固定 main `f5cfa0ff5fa87c45f59d4176f4ac8bb922bd5dd8`）的具体能力注册只适用于能力如实显示/执行重验，不作为 Office 工具栏视觉或 DOCX 锚点保存实现。证据路径与行号见 `docx-protection-p1-next-20261017.md` §8；本报告是实现交接，不声称进行了新一轮外网竞品调研。

后续仍为 F checkbox、修改密码核验/管理、强制修订等。C2 不解除保护，不提高 body writable，不将复杂跨段/超链接/字段等未知锚转换成可编辑锚。
