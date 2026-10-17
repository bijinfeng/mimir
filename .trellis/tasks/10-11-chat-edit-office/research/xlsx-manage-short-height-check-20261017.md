# XLSX 管理短高滚动：独立检查

2026-10-17，正式 trellis-check 只读复查。范围为 `XlsxObjectManagement.tsx`、局部 CSS、既有测试，以及核对真实 Editor 的 busy 传递路径。未修改生产或 XLSX 测试文件，未操作浏览器。沿用任务固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 与 WeKnora v0.8.3 缓存相关性证据；这是实测布局缺陷复查，没有新竞品结论。

## Findings (fixed)

无新增生产修复。已确认实施者将任务导航、对象/表选择和属性全部置于同一 `div.mimir-xlsx-management__body`。CSS 的 flex/min-height:0/overflow:auto 保持完整高度链；configuration fieldset 仅持有属性禁用，footer 为 body 同级且 flex-shrink:0。没有隐藏工具、缩字或增加 Inspector 宽度。

既有25项测试通过：对象及结构化表任务各有一个固定 primary，导航/选择/属性同一 body；原生渐变、主题/noFill、确认、来源/目标/任务取消及保存/Undo/Redo entry 保真断言保留。happy-dom 不计算真实尺寸，这些结果不能证明 root 发现的 13.6px body 已在浏览器消除。

## Findings (not fixed)

### P1：真实 Editor busy 的祖先 fieldset 阻止任务切换取消

- `src/agent/xlsx-agent.ts` 的 `execute` 在实际宿主执行前调用 `onBusyChange(true)`，finally 后才恢复 false。
- `XlsxEditor.tsx` 将该回调接 `setHostBusy`，并向 `XlsxObjectControls` 传 `busy={hostBusy || source.saving || protected}`。
- `XlsxObjectControls.tsx` 的 `fieldset disabled={busy}` 包含整个 `XlsxObjectManagement`，包括此次挪入 body 的管理任务导航。
- `ToolbarTabs` 的 task 入口是原生 `<button>`，因此真实 host busy 会被上述祖先 fieldset 禁用；局部 `pending` 虽然没有禁用自身导航，仍无法从实际 UI 切换任务取消当前请求。
- 新增 `locks pending object fields and Select while keeping task navigation available to cancel` 通过，但使用 standalone `XlsxObjectManagement`，外层不存在 Controls 的 disabled fieldset。该用例只证明局部 pending 行为，**不能证明真实 Editor 忙时任务切换可用**。结构测试 `controls=true` 没有启动 deferred host，也未覆盖此路径。
- 此禁用祖先在短高修正前已存在，本片未新增；它仍是主会话要求收口的真实集成缺口。按 checker 边界不修改 busy 所有权/模块接缝，已报告 root；root 已确认交原短高 owner 修必要 edit mode 祖先接缝，并添加真实 Editor deferred host→切管理任务→signal abort→忽略取消的迟到结果零发布回归。

### 规范与浏览器仍待收口

editor 规范现条款仍写“header/任务导航/footer固定”，与此次经 root 授权的导航滚入 body 不符。实施者已交 root 统一更新，本 checker 保持其文档所有权。新 build 的1280×800 /420×500 body 实际高度、导航与选择共同滚动、footer 可见、字段聚焦自动滚动及 Escape 回焦均需 root 真实浏览器验收，未在本片宣称完成。

## Verification

- Tests：此片既有单文件 **25/25 PASS**，本轮六精确文件运行中执行，`/tmp/mimir-pdf-image-cancel-independent-final-tests.log`；不能据此通过上列真实 Editor 集成要求。
- TypeCheck：Office `tsc --noEmit` **exit0**，`/tmp/mimir-pdf-image-cancel-independent-freeze-types.log`。
- Lint/format：目标 TS/TSX/CSS scoped oxlint/oxfmt **exit0**（同批日志 `/tmp/mimir-pdf-image-cancel-independent-{freeze-lint,freeze-format}.log`）；管理生产文件 Antd lint `issues=[] / partial=false`，`/tmp/mimir-xlsx-manage-short-height-independent-antd.log`；style guard、限定 diff whitespace **exit0**。
- 总结：**未通过，退回上述 P1 真实集成接缝与回归。** 短高 DOM/CSS 调整本身没有发现新增机械缺陷；25项组件测试不能替代真实 Editor 的取消证据或生产几何验收。

本片无 browser/build/provider/server/full suite、提交/暂存/归档/删件动作。
## 2026-10-17 正式独立复查：真实 hostBusy 取消返工

本轮按根会话新增派工复查五个冻结文件：`XlsxObjectManagement.tsx`、`xlsx-object-management.css`、`XlsxObjectControls.tsx`、`XlsxObjectManagement.test.tsx`、`XlsxEditor.management-cancel.test.tsx`。未修改生产或测试代码；未运行 Server、全仓测试、Web build 或浏览器。继续复用上文固定 GenOffice / WeKnora 缓存证据，没有新的竞品调研或外网抓取。

### Findings (fixed)

- **原 P1 已由 owner 修复并经本轮独立确认。** `XlsxObjectControls.tsx` 仅在 `mode === 'edit'` 时取消外层 busy fieldset 的禁用；管理器仍用 `locked = busy || pending` 明确禁用对象/表 Select、属性 fieldset、写操作和 footer primary。管理任务导航在其外，切任务使 layout-effect cleanup abort 该请求；关闭 Inspector 则通过真实卸载 cleanup abort。其他五个 mode 的外层 `disabled={busy}` 合同保持。
- 本轮沿 `XlsxAgentHandle.execute → onBusyChange(true) → Editor.hostBusy → Controls.busy` 逐段核对，并独立执行真实 Editor 的两个 deferred host 用例。单元格 fieldset 先从 enabled 变 disabled，证明实际 hostBusy 已发布；管理任务仍无 disabled 祖先，同时 selector/config/应用锁定。切“结构化表”与关闭分别使原 signal abort。host 故意忽略 abort，返回已由真实原生 writer 生成且独立 reader 读到新文字的 version=1 XLSX，最终当前 handle 仍 version=0、undo/redo=0、dirty=false、currentBytes 与 fixture 完整精确相同、零保存、零 dirty(true)、零成功反馈。等待条件覆盖真实 execute/finally 解锁，不靠固定延时猜测完成。
- 实际 hostBusy 尚未结束时切到图表模式，插入按钮仍有 disabled fieldset 祖先。owner 原 25 项组件、原生 ZIP entry、正常保存/Undo/Redo 断言全部保留；既有透视 Editor 10 项一起通过。此轮没有为过门删减断言或加入 suppression。
- 布局代码核对仍符合预期结构：任务导航、当前选择、属性均处于同一个中性滚动 body；body 完整 flex/min-height:0/overflow:auto 高度链，footer 为同级并禁止压缩，配置锁不包住任务导航。本轮无新增机械修复。

### Findings (not fixed)

- **浏览器几何仍待根会话验收。** happy-dom 不计算布局；本轮 37/37 证明组件结构与真实 Editor 取消链路，不证明 420×500 已从旧 13.6px body 改为可用高度。新构建需量测 1280×800 /420×500，确认导航与选择随 body 滚动、footer 单 primary 常驻，以及字段聚焦后可继续浏览、Escape 和回焦。
- **现行规范待根会话同步。** `office/frontend/editors/conventions.md` 仍写“header/任务导航/footer固定”；本次经授权行为为 header/footer 固定、管理任务导航随 body 滚动。沿 root 已声明的文档所有权交其统一更新，本 checker 未修改该文件。

### Verification

- **Tests PASS / exit0：3 精确文件 37/37**（管理器25、真实 Editor hostBusy 取消2、透视 Editor10）。`/tmp/mimir-xlsx-manage-short-height-recheck-tests-20261017.log`。
- **TypeCheck PASS / exit0：** Office `tsc --noEmit`。`/tmp/mimir-xlsx-manage-short-height-recheck-types-20261017.log`。
- **Lint PASS / exit0：** 4 目标 TSX oxlint 无诊断；5 目标文件 oxfmt 一致；两生产 TSX 分别 Antd lint 均 0 issues、partial=false。日志 `/tmp/mimir-xlsx-manage-short-height-recheck-{lint,format,antd-management,antd-controls}-20261017.log`。首次 Antd 命令误传两个路径被 CLI 拒绝，随后按单路径分别重跑通过，该命令错误未当作产品缺陷。
- **样式守卫 / diff PASS / exit0：** `pnpm lint:styles` 和 `git diff --check`；样式日志 `/tmp/mimir-xlsx-manage-short-height-recheck-style-20261017.log`。
- 本片所有测试、类型和静态进程均已退出，五文件检查所有权释放。原 P1 的组件与集成检查收口；实际短高界面、规范同步及整个工具补全任务仍未完成。

## 2026-10-17 正式独立复查：Inspector 冻结表头层叠补片

根会话新构建实际量测已将短高 body 从约14px 修至118px（scrollHeight476），聚焦属性后 scrollTop242，primary 固定可见；这是根会话提供的浏览器证据，本 checker 没有重复操作浏览器。新发现 sticky TH z5 盖住兄弟 Inspector z4 的标题，本轮仅复核 owner 的 `xlsx-tools.css` isolation 补片与真实 Editor 结构断言。

### Findings (fixed)

- 未发现新增问题，无 checker 代码修复。新增 `isolation: isolate` 只作用于 `.mimir-xlsx-inspector-host > .me-scroll`，Inspector 自身保持 z4；真实 Editor 的 `.me-scroll.mimir-xlsx-wrap` 包含 table 的列头、行/交角头、冻结单元格，以及同 stage 内的 `XlsxObjectLayer`。这些后代 z-index 归属于该局部 stacking context，无法越过同级 Inspector；原冻结元素之间的相对层级和 sticky 几何未变。
- Inspector 的 portal 目标仍是共同 `.mimir-editor__body`，位于 worksheet scroll 树外。新增测试在真实 Editor 断言两者父项相同、host class 正确、全部真实 header/gutter/visual 均在 worksheet 内；没有用 happy-dom 的 CSS 数值或样式文本镜像断言冒充实际渲染证明。
- 弹层路径未变：ToolbarSelect 未设置本地 `getPopupContainer`，仍沿 Antd 默认 portal 到 body；ManagementConfirm 的 Popconfirm 同样未改容器；自有颜色/菜单在 Inspector 子树以 `position:fixed;z-index:20` 呈现。它们都不在此次隔离的 worksheet scroll 后代中，新增 isolation 不引入新的 scroll clip 或 fixed containing block。旧 popup/Escape/回焦处理原样保留。
- 原 busy/短高/native/history 37 项回归全部保留并重跑通过。

### Findings (not fixed)

- 层叠修正的实际像素和命中结果仍交根会话在统一新构建验收：420px 标题点应命中 Inspector、选择与颜色层完整显示、嵌套 Escape 与回焦正确、网格冻结保持；随后继续真实 native 保存/history。组件结构证明不替代浏览器 `elementsFromPoint` 或截图。
- 其余上一节规范同步与全任务边界保持，本补片不扩大到 Server、全仓检查或浏览器。

### Verification

- Tests **PASS / exit0：3 精确文件 37/37**（管理器25、真实 Editor 管理取消/结构2、透视 Editor10）。日志 `/tmp/mimir-xlsx-inspector-layer-recheck-tests-20261017.log`。
- Office TypeCheck **PASS / exit0**：`/tmp/mimir-xlsx-inspector-layer-recheck-types-20261017.log`。
- 目标 TSX oxlint、2目标文件 oxfmt、`pnpm lint:styles`、`git diff --check` 均 **PASS / exit0**。日志 `/tmp/mimir-xlsx-inspector-layer-recheck-{lint,format,style}-20261017.log`。
- 没有生产/测试改动；本轮仅追加本检查记录。所有检查进程已退出，所有权释放。复用原固定 GenOffice / WeKnora 缓存证据，没有新增竞品研究。
