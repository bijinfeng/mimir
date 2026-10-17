# DOCX 个人信息设置 UI 与保存基线实现

2026-10-17 `/root/docx_privacy`。按 `docx-privacy-ui-followup-20261017.md` 及 root 批准的最小保存基线设计实施；本报告不宣称独立 check 或浏览器验收完成。

## 文件与行为

- `src/editors/DocxPrivacyControls.tsx`、`docx-privacy.css`：审阅 → 保护组内“个人信息”入口；沿现有 320px Inspector 单列布局、内部滚动、固定单一“应用设置”。Antd controlled Switch、当前/已保存值、只读/强制修订门控、失败反馈、正文或附加结构版本变化后重新读取。原生状态异步读取与 session 绑定，卸载和换源取消晚结果。文案明确仅清理作者、修订/批注署名、公司等已知元数据；正文、自定义 XML/属性和二进制不在清理承诺内。
- `src/editors/docx-privacy.ts`、`src/docx-privacy-state.ts`：仅自有根属性 `mimirPrivacy: boolean | null`，null 指向本次打开的私有原件。切换草稿不写 PM；显式应用一个 `closeHistory` 隔离事务，相同值 no-op；Undo/Redo 复用 PM history。session save/export 统一将有效属性映射为 native `removePersonalInfo`，不增加 Agent DSL。
- `src/docx-protection.ts`：canonical body 比较只排除自有根属性的合法 boolean；未知属性与畸形值不获得豁免。dirty fingerprint 仍包含 privacy 意图。`src/editors/docx-protection.ts` 在只读/表单/批注/强制修订状态拒绝 privacy attribute transaction；native finalizer 的实际包变更权限检查保留。
- `src/docx.ts`：私有原件布尔读取、仅 bool 的只读状态、WeakMap 绑定本 session 生成的候选字节。成功库 IO 才 ACK；导出/失败不 ACK。首次已保存清理后，单调 scrub floor 保留已清理元数据；后续关闭开关仍保留原生 off 拼写并不复原旧姓名。ACK 前生成的未清理候选在 finalizer 和发布前被拒绝。
- `src/docx-privacy.ts`：按 root 明确批准，仅新增 `forceMetadata` 参数并扩展元数据遍历开关；不改 scanner 算法或目标判定，不将其加入公共 SaveOptions。
- `src/editors/DocxEditor.tsx`：注册 root extension、保护组入口；整段库保存（原生字节生成 → IO → ACK）单一在途锁，允许期间继续编辑。ACK 核对 session/source/handle binding，旧保存完成不会清除新版本 dirty。当前副本导出不推进基线并在下载前验证候选。

## 测试与检查

- 相关 9 文件 **226 tests PASS**，14:11:34，33.45s，`--maxWorkers=1`：privacy native、privacy actual Editor、protection、native protection-settings、forced-tracking、docx、actual Editor protection-settings、protected-comments、protected-forms。
- 最后补充 actual Editor 的生成期保存串行化、false export 跨 true 库保存成功后的拒绝、仅 SaveOptions 变化使草稿过期、原生状态读取失败场景。最终精确 actual Editor **15 tests** 结果见下方收尾记录。
- 覆盖 false→true 应用/保存/撤销保存/重做保存逐次解 ZIP，true→false 首次保存保留原署名、相同值无 history、失败/导出不推进 floor、保存 IO 或生成期间新 false 意图与 dirty、换源/晚读、四种保护模式、非目标 ZIP entry 精确保持、异源/复制候选拒绝及并发 finalizer 拒绝。
- Office typecheck、11 源文件 scoped oxfmt、10 TS/TSX scoped oxlint、Antd lint、style-backticks 和本片 scoped diff check。全仓 diff check 曾发现并行修改的 shared editor conventions 末尾空行；本 agent 未修改 shared specs。
- 初次 `pnpm --filter ... test -- ...` 被 pnpm 的参数分隔扩大启动，已中止；正式结果均用 office cwd 下 `pnpm exec vitest run <明确文件>`，未使用该次扩大运行结果。一次并行密码测试触发 20s timeout；单 worker 相关 9 文件已全部通过。

## 待主流程验收

1. 正式独立 check；重点检查 private scrub floor、旧候选拒绝、root canonical 投影和 source/IO 生命周期。
2. root 使用最新构建做 1280 与 420×500 浏览器截图，确认保护组折叠菜单关闭、Switch、内部滚动、固定主动作和 Escape/关闭焦点返回。
3. 不将撤销设置描述为撤销磁盘清理；没有浏览器/桌面效果验证声明。本片未改 vendor/server/E0 crypto/T recorder，也未 stage、commit、archive 或上传/删除文件。

## 参考

竞品与 WeKnora 版本/证据沿同日 UI 计划：固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的 native metadata 语义；WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的真实能力门控，仅复用已固定证据，不宣称本片重新联网。视觉沿本项目现有 Inspector，不以 WeKnora Markdown 工具栏为样板。

## 最终收尾记录

- 14:15:40 精确 `DocxEditor.privacy.test.tsx`：**15/15 PASS**，13.35s。
- 同一最终源码 Office `tsc --noEmit` PASS；10 TS/TSX scoped oxlint 无诊断，11 文件 oxfmt PASS；Antd lint 0 issues；style-backticks 和 scoped diff check PASS。
- 代码冻结，交 root 派正式独立 check 和浏览器验收。
