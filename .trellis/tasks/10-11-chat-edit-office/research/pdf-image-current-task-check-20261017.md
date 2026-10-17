# PDF 图片当前任务修正：独立检查

2026-10-17，正式 trellis-check。检查范围仅 `PdfImagePanel`、`PdfEditor` 图片生命周期及相应测试。已读任务 followup/implementation、原生产浏览器 flip/Undo 记录和现行 Office 规范；沿固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 与同日 WeKnora v0.8.3 缓存证据，无新增竞品调研结论。没有浏览器、构建、server suites、模型或 Desktop 验收。

## Findings (fixed)

- File: `packages/office/src/editors/PdfEditor.tsx`，原生图片 snapshot 成功发布处。
- Issue: 自动读取失败后，Agent 的 `list_page_images` 能成功发布当前真实 1 图 snapshot，但 `imageReadError` 仍显示旧失败及“请刷新重试”，状态矛盾。
- Fix: 在通过现有当前版本断言、接受图片 snapshot 的同一分支清除旧 `imageReadError`。不改原生算法或版本/history。
- 独立回归：`PdfEditor.images.test.tsx` 的 `check: a successful current Agent image read supersedes an earlier automatic read failure`；失败→真实 native list 成功，断言 1 图、旧错误消失、版本不变、clean、无 Undo。

## Findings (not fixed)

### P1：外部素材应用关闭后仍接收迟到写入

- File: `packages/office/src/editors/PdfImagePanel.tsx` 外部来源 footer primary；`PdfEditor.tsx` 的 `closeInspector`。
- 实际路径：生成图片准备→显式“插入所选图片”→native 图片宿主暂不返回→关闭图片 Inspector→返回真实 `applyPdfImageOperation` 生成的字节。
- 独立真实 Editor/native 测试 `PdfEditor.external-images.test.tsx` 的 `check: closing during external image insertion cancels its late native result` 证明：signal 未取消，版本 1→2、dirty false→true，并新增 Undo。不是仅有迟到提示，文档真的接受了改动。
- 原因证据：外部 primary 直接调用 `perform(..., getVersion())`，没有传入该操作生命周期的 AbortSignal；Panel 没有对应 in-flight controller 在卸载时取消。上传 `ImageControls` 有独立 controller，外部准备组件也有 controller，它们不能覆盖外部 footer 的最后一步应用。`closeInspector` 也没有对本图片操作统一取消。
- 未修理由：这是异步应用生命周期及所有权设计，按主会话边界退回 implementer；checker 保留完整失败回归，不悄改。建议外部应用具有来源/目标/操作/页/版本绑定、可取消的请求身份，并在切换或卸载时取消，最终字节发布仍走原有 `assertCurrent`。不可通过关闭按钮禁用或放宽测试消除失败。

### 原浏览器首次 flip soft 状态重置尚无归因

原 `toolbar-pdf-image-browser-20261017.md` 记录不变。本片组件/native 检查不证明该偶发重置已定位或修复；继续留给 root 的新 build 实机观察。

## 实际检查与新增覆盖

- 九种操作全部仍可选择；DOM 顺序为目标→操作→仅插入/替换来源→当前参数，非素材操作不挂来源组件，每种任务仅一个 primary。沿用现有 320px body/footer CSS；本轮没有浏览器几何证据。
- 现有回归覆盖素材任务往返、目标/源/页/版本切换、准备请求取消、未配置搜索/生成、上传真实参数、删除确认/Escape、只读目标和原生保存/history。
- 新增独立 `check: discards an Undo read when Redo restores cached exact bytes before its reply`：真实 flip/save 后 Undo 触发延迟 read，返回前 Redo 恢复已验证 exact bytes；旧 read signal 取消。毒响应（空图+unsupportedPages）不污染当前 snapshot、版本或 history，不重复读取；再 Undo/save 与原件整件字节精确。
- 未知/loading/error 不显示假 0；成功读取真正空页才显示 0；只读自动 read 不调用保存，不新增 history/dirty。当前响应核对 controller/handle/version/bytes，source session+source bytes 保证换源隔离。

## Verification

最终限定测试与类型结果见末尾冻结结果。静态检查：5 文件 scoped oxlint exit 0；5 文件 oxfmt check exit 0；Antd 两生产文件逐个 lint 无 issue；style guard exit 0；限定 diff whitespace exit 0。

日志：

- `/tmp/mimir-pdf-image-current-check-independent-red.log`：机械修复前，两个真实行为红（外部关闭迟到和旧 read error）。
- `/tmp/mimir-pdf-image-current-check-frozen-tests.log`：冻结时五文件限定回归。
- `/tmp/mimir-pdf-image-current-check-office-types-frozen.log`、`/tmp/mimir-pdf-image-current-check-shared-types.log`。
- `/tmp/mimir-pdf-image-current-check-{lint-final,format,styles,antd-panel,antd-editor-final}.log`。

首次误用 `pnpm --filter @mimir/office test -- <files>` 导致 Vitest 将 `--` 后输入忽略为过滤条件，扩大了测试范围。确认后仅递归停止自己的父 PID 27047 子树，未触及其他任务的进程；原始未完成日志 `/tmp/mimir-pdf-image-current-check-baseline.log` 保留，不计作任何全量或限定门禁。之后全部使用 Office cwd 下 `pnpm exec vitest run <明确文件> --maxWorkers=1`。未运行全仓 `pnpm check`；未动 server/vendor/shared spec，无暂存、提交、归档或删件。

## 交接

当前不能通过本片独立检查，须退 implementer 修复外部素材应用取消，再同一失败测试独立复查；通过后才由 root 新 build 与 1280×800 / 420×500 浏览器确认视觉、真实焦点及保存 Undo/Redo。

### 冻结结果

- Tests：**5 文件，82 通过 / 1 失败（83 总计）**。唯一失败为上述外部应用关闭迟到写入；旧 read error 已绿，Undo→Redo 旧 read 毒响应拒绝已绿。所有既有测试保留。
- Office TypeCheck：最后一次 **exit 0**，`/tmp/mimir-pdf-image-current-check-office-types-frozen.log`。前一次被并行 R2 中间态 `xlsx-agent-range.ts` 的 3 项类型错误阻塞，后来该所有者修复后重新运行通过；没有修改该文件。
- Shared TypeCheck：**exit 0**。
- Lint/Format/Antd/Style/Diff：**通过**。
- 当前审查结论：**不通过，等待实现者修复唯一生命周期红**。checker 的生产机械改动仅清除成功原生 snapshot 对应的旧读取错误。

## 返工后的正式独立复查（2026-10-17）

结论：**PDF 本片通过独立代码/native 检查，可以进入 root 的新构建与浏览器验收。** 上文原始失败与日志保留；原 P1 外部插入关闭迟到写入现已修复。此次复查未修改生产文件，新增两项真实 Editor/native 竞争回归及相应测试宿主的文档切换能力；没有删除或减弱原失败断言。

### Findings (fixed / verified)

- `PdfImagePanel.tsx` 的局部 `ExternalImageApply` 冻结开始版本、用 controller ref 同步互斥，并将 signal 传到原 `perform` → 真实 Editor → native 发布守卫。key 包含 sourceKey、页、目标、操作、素材来源、contextVersion。busy 只禁动作，不重挂自身；正常成功后的新版本清理不回滚已接受事实。
- 原独立 `check: closing during external image insertion cancels its late native result` 原样通过：关闭即取消，宿主故意忽略取消返回真实图片字节后，版本、dirty、Undo 与保存均无增量。成功原生读清除旧 `imageReadError` 及 Undo→Redo 毒响应拒绝两个原 checker 回归也保留并通过。
- 实现者的 source（素材来源）/page 两个真实 Editor 延迟 native 用例均通过；operation/context/target/sourceKey 面板身份取消用例均通过，信号确实取消且旧预览/反馈不复活。非素材操作仍无来源选择器，九个操作与唯一 footer primary 完整保留。
- 独立新增 `check: rejects an ignored-abort native insert after a real document roundtrip`：真实 A→B→A 生成不同 handle，即使回到相同 documentId、相同原件字节及相同初始版本，旧请求也不能发布。宿主忽略 abort，确实生成经独立 native reader 证明含 1 图的 PDF；新会话仍 clean、无 Undo、保存禁用且无旧预览。
- 独立新增对应 `intervening page edit`：外部插入等待期间通过真实 Agent 执行 `rotatePages`，接受一次页面修改并推进版本。旧插入 signal 取消，宿主仍返回含 1 图的有效字节；当前版本与旋转保持，仅一次 Undo 即回原 clean/0°，没有多出的插图历史或保存调用。
- 正常 deferred 成功与双击用例原样通过：等待期间不自取消，native insert 只调用一次、版本恰 +1；保存后一个 Undo/save 整件 bytes 等于原件，Redo/save 整件 bytes 等于首次成功结果。

### Findings (not fixed)

- 原浏览器首次 flip soft 状态重置仍无归因。此次不操作浏览器，不将组件/native 结果称为该偶发问题已修复；root 应在新 build 继续观察。
- 真实 provider 配置、1280×800 / 420×500 几何、焦点、生产浏览器交互仍由 root 验收，本片不替代这些证据。

### Verification

- 限定六文件 **117/117 PASS**：PDF 五文件 **92/92**，另有独立 XLSX 管理短高既有文件 **25/25**。PDF 文件为 `PdfImagePanel.test.tsx`、`PdfEditor.images.test.tsx`、`PdfEditor.external-images.test.tsx`、`PdfEditor.local.test.tsx`、`PdfEditor.content.test.tsx`。日志 `/tmp/mimir-pdf-image-cancel-independent-final-tests.log`。
- 新增测试断言改成无条件断言以通过 lint 后，外部图片文件最终 **11/11 PASS**：`/tmp/mimir-pdf-image-cancel-independent-external-final.log`。此前六文件通过结果不被拼称为全 Office 回归。
- Office `pnpm exec tsc --noEmit` **exit 0**：`/tmp/mimir-pdf-image-cancel-independent-freeze-types.log`。
- 七 TS/TSX 文件 scoped oxlint `--deny-warnings` **exit 0**，八文件 oxfmt **exit 0**；PDF 两生产文件分别 Antd lint `issues=[] / partial=false`；style guard 与限定 diff whitespace **exit 0**。日志为 `/tmp/mimir-pdf-image-cancel-independent-{freeze-lint,freeze-format,antd-panel,antd-editor,styles}.log`。
- 初次回归误写不存在的 `PdfEditor.content-lifecycle.test.tsx`，Vitest 只匹配四文件75项，未称五文件通过；随后显式改为存在的 `PdfEditor.content.test.tsx`，上列六文件完整执行。新增文档切换测试首次错误等待了已因换源重置分类而不存在的“PDF图片工具”，修正为实际保存解锁/禁用状态屏障，保留所有 native/版本/history 断言。初次 lint 命中新增测试的条件 expect，已改为无条件断言且最终零诊断；原日志保留。

本次没有 Server suite、provider、全 Office suite、全仓门、build、browser 或 Desktop 操作，没有改 vendor、上传/删除文件、暂存/提交/归档。旧全仓稳定窗口的通过结果不自动覆盖本次新增测试。XLSX 短高审查另见 `xlsx-manage-short-height-check-20261017.md`，其独立集成缺口不影响 PDF 本片上述结论。
