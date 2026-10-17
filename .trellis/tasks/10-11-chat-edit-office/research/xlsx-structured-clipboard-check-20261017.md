# XLSX 结构化剪贴板独立复核（2026-10-17）

## 范围与结论

复核客户端 `xlsx-clipboard.ts`、`XlsxClipboardControls`、`XlsxManualControls`、`XlsxEditor` 及对应测试／局部 CSS。以同目录 clipboard plan／implementation 的固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 与 WeKnora v0.8.3 参考为上下文；本轮不重复研究，也不修改 server/shared/vendor、`xlsx.ts` 或其他格式。

产品文件已冻结，根会话可统一构建并进行真实浏览器和系统剪贴板验收。本报告通过组件／控制器门禁，不替代真实布局、OS 快捷键或外部 Excel 互操作证据。

## Findings (fixed)

1. `packages/office/src/xlsx-clipboard.ts`：相同文档、版本与范围重新加载源身份时，只清空状态而没有取消 pending read/apply；迟到读取可能恢复旧 payload。把 source identity 变化纳入取消条件，read/apply 两路均新增回归。
2. `packages/office/src/xlsx-clipboard.ts`：等待系统读取或粘贴期间，textarea 仍可输入；原 `stage()` 不取消 pending，迟到结果会覆盖或清除新草稿。新输入现在取消旧操作并清 busy，保留新 payload；apply 使用既有 signal 阻止迟到发布。控制器 read/apply 两路与真实 Editor pending reader 均覆盖。
3. `packages/office/src/editors/XlsxClipboardControls.tsx`：底部 primary ToolbarButton 同时传 label 与文字 children，造成可见文字重复。移除重复 children，测试精确核对主操作文本只出现一次。
4. `packages/office/src/editors/XlsxClipboardControls.tsx`：Inspector 开启后切 Ribbon 分类或折叠，原 opener/group 可能已卸载，Escape 留焦点在 BODY。清理时从仍连接的 Editor 查找当前 opener／当前组／选中 tab；保留用户已移到别处的焦点。测试覆盖 1280→420 折叠时同一面板、源标记与缓存保留，以及分类切换后回到当前 tab。
5. `packages/office/src/xlsx-clipboard.test.ts`：新增两处参数化测试的条件 expect 被 oxlint 拒绝。改为无条件检查 execute 调用的 abort 状态数组，同时核对 read 分支没有写调用。

## Findings (not fixed)

- 无当前客户端范围内已确认且遗留的实现问题。
- 行列继承样式保留／显示由另一实现者负责，未在本片修改；根会话合并其独立结果。
- 真实宽度下的视觉、OS copy/cut/paste、Clipboard API 权限及外部 Excel 互操作仍由根会话实机验收。组件测试使用合成 ClipboardEvent／mock navigator，不能据此宣称该门禁通过。
- 已读入外部 payload 在 sheet/range/scope 变更时清空，符合当前 plan 的异步上下文取消约束；未擅自改成跨目标持续草稿。内部 capture 在普通切表／范围变化时保留。
- 最终 spec／缺口矩阵由根会话统一同步。建议 editor pitfalls 记录：source identity 即使 version 不变也必须 abort；用户新输入必须取消旧读取／写入；Inspector 焦点恢复需要查找仍连接的入口。

## Verification

- **Tests: pass，6 文件 104/104**。最终命令：`pnpm --filter @mimir/office exec vitest run src/xlsx-clipboard.test.ts src/editors/XlsxManualControls.test.tsx src/editors/XlsxEditor.clipboard.test.tsx src/editors/XlsxEditor.test.tsx src/editors/XlsxEditor.fill.test.tsx src/editors/XlsxEditor.pivot.test.tsx --maxWorkers=2`。
- **TypeCheck: pass**，`pnpm --filter @mimir/office typecheck`，全部生产修复及测试断言修改后执行。
- **Lint: pass**，上述客户端范围 8 个 TS/TSX 文件 oxlint 零问题；`XlsxClipboardControls.tsx` antd lint 零问题。
- **Format: pass**，8 个 TS/TSX 与 `xlsx-clipboard-controls.css` 共 9 文件 oxfmt check。
- **Styles: pass**，`pnpm lint:styles`；目标 tracked `git diff --check` 通过。
- 真实宿主目标测试还覆盖原生复制公式与跨表剪切引用迁移、每次粘贴单 history、保存／undo／redo ZIP entry 读回、HTML 前导等号 literal 与基础格式、unsupported style 主动 values-only、输入框事件不被网格劫持、pending 切目标／Inspector 取消。
- 遵从根会话分工，未跑 full Office tests、Web build、上传、暂存、提交或归档。仓库已有与本片无关的 skill-script 全量 `pnpm check` lint 基线，不声称全仓绿。

## 420px 浏览器证据后的局部视觉修复

根会话实际截图 `xlsx-structured-clipboard-420.png` 显示 CSV/TSV 入口空白、内部／外部内容无可视标题、按钮被 flex stretch 到整行并居中，源和取消分离。复核前述组件合同门禁不足以发现这些实际视觉缺陷。

收到根会话明确指派后，额外仅改 `XlsxClipboardControls.tsx`、`xlsx-clipboard-controls.css` 与现有 Editor clipboard 回归：

- FileButton 显式提供 Upload 图标和“导入 CSV / TSV”可见文字，保留原 aria-name 与选择文件行为。
- 两个现有 group 内添加短 h3“内部范围 / 外部内容”，不新增卡片。
- 范围当前值与取消放在同一 flex 行，长源名称可换行、取消不压缩。
- 组内 12px／组间 16px；note margin 归零，按真实 ToolbarButton 类 `.me-tb` 左对齐，图标与文字留 6px。
- 保留 320px、原内部滚动与固定单一 primary footer，controller 不变。

最终额外门禁：`XlsxEditor.clipboard.test.tsx` **7/7**，Office typecheck、目标两 TSX oxlint、antd lint、三文件 oxfmt、lint:styles、tracked diff check 全通过。现有折叠／焦点测试新增可视两标题、导入文字与图标、源／取消同行结构断言。代码已冻结交给根会话统一 build，实际 420px 视觉确认仍归根会话执行。
