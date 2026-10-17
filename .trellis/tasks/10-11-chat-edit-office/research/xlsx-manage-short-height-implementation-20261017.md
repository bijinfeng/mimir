# XLSX 对象管理：短窗口滚动修正

2026-10-17，实施者限定修正。根会话生产浏览器发现：420×500 下 Inspector 为 320×299.36px，任务导航与当前对象选择放在滚动区外，使属性 fieldset 的 clientHeight 仅 13.6px、scrollHeight 371px。早期组件测试仅证明 footer 在 body 外，未证明真实可用高度。

## 改动边界与实现

- `packages/office/src/editors/XlsxObjectManagement.tsx`：将管理任务导航、当前对象/结构化表选择和属性全部放入同一个中性 `div.mimir-xlsx-management__body`，固定 footer 仍为其同级。属性单独保留 `fieldset.mimir-xlsx-management__configuration disabled={locked}`。
- `packages/office/src/editors/xlsx-object-management.css`：滚动规则仍归 body；原属性内边距与分组间距迁到 configuration，导航在普通滚动流内。没有增大 Inspector、隐藏工具或缩小文字。
- `packages/office/src/editors/XlsxObjectManagement.test.tsx`：新增两项结构与交互回归。真实对象 Inspector 中导航、对象选择和属性属于同一 body，切结构化表后名称及字段仍在同一 body，两个任务各一个固定 primary；本片 pending 期间属性 fieldset 和 Antd Select 禁用，但任务导航不在本片 disabled fieldset 内，切换任务确实取消 signal，迟到结果无成功反馈。

没有改动 source/context/target 身份、apply、请求取消、onSelect、确认、原生操作或保存路径。现有源/目标/任务/关闭取消、填充类型、危险操作确认与全部原生保存/history 断言保留。外部 busy 的祖先 fieldset 仍由 XlsxObjectControls 持有，本次没有移动或改变它。

**规范同步交根会话：** editors/conventions.md 当前仍写“header/任务导航/footer固定”；本次经真实短高缺陷明确授权，将其中管理任务导航移入 body，header 和单一 footer 保持固定。根会话统一修正该现行条款，实施者遵循文件所有权没有修改 spec。

## 验证

- **限定测试 PASS：1 文件 25/25**，`XlsxObjectManagement.test.tsx`，包含原有真实 Editor、渐变保留、保存/undo/redo 全部非目录 ZIP entry 精确断言。日志 `/tmp/mimir-xlsx-manage-short-height-tests-20261017.log`。首次新增结构测试使用不存在的 `.me-btn--primary` 类失败，改为真实 Antd `.ant-btn-primary` 后整文件通过，没有删减原断言。
- **目标 oxlint / oxfmt / Antd lint PASS**；Antd 6.6.4 Popconfirm API/demo 已查询，lint 0 issues、partial=false。
- **Office typecheck 未通过**，日志 `/tmp/mimir-xlsx-manage-short-height-types-20261017.log`：并行 DOCX 文件 `DocxEditor.encryption.test.tsx:161` 调用不存在的 captureSnapshot；`docx-encryption-worker.test-helper.ts:6` 导出匿名 class 的 private native/queued/ready 触发 TS4094。未修改他人文件，已经通知根会话；不能据此声称全 Office types 通过。
- `git diff --check` PASS。未运行 Server 测试、全 Office 或全仓门、Web build，也未操作浏览器、上传或删除夹具。

## 验收移交

根会话统一构建并验证 1280×800 / 420×500：body 必须实际可用、导航和选择随同一 body 滚动、footer 固定且只有一个 primary；字段聚焦自动滚动后仍可继续浏览属性与回到导航。happy-dom 没有布局，当前 25/25 不证明 clientHeight 已达标。根会话当前 PK4FilufzKIRoO1G 文档仍有未应用草稿且实际来源为 solid #4472C4，本实施者未触碰它，也未把它称为 gradient 验收。

本片复用已批准文件编辑依据 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 与已有 WeKnora 官方站/公开源 v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 缓存相关性结论；这是实测缺陷修复，没有新竞品研究或网络抓取。WeKnora 的 Markdown 编辑器不决定 Office 工具栏。

以上三个代码/测试文件及本报告冻结；本片测试和类型检查进程均已退出。整个工具补全任务仍在进行中。

## 正式独立检查 P1 返工

独立报告 `xlsx-manage-short-height-check-20261017.md` 正确指出：先前 standalone 管理器用例没有覆盖 `XlsxAgentHandle.execute → onBusyChange(true) → XlsxEditor.hostBusy → XlsxObjectControls` 的真实祖先 fieldset。此前“任务导航仍可取消”只在局部 pending 成立，不能作为完整集成证据。根会话据此扩展本实施者所有权，修必要 Controls 接缝及独立 Editor 测试。

### 修复

- `XlsxObjectControls.tsx` 的祖先 fieldset 改为 `disabled={busy && mode !== 'edit'}`。仅管理模式把字段锁定交给 XlsxObjectManagement 的 `locked`；它的对象/表选择、属性 fieldset、主/次写操作仍禁用，管理任务 tab 可切换并取消自有请求。其他五种 mode 原祖先 disabled 合同保留，没有移除它们的禁用状态。
- 新 `XlsxEditor.management-cancel.test.tsx` 真实挂载 Editor、真实原生形状夹具、真实 hostApply 与 handle，不 mock 控件或 busy。通过实际单元格编辑 fieldset 从 enabled→disabled，证明 execute 已使 Editor hostBusy=true；同时确认对象 selector/属性/应用禁用、管理 tab 没有 disabled 祖先。
- 两种真实 UI 路径：切“结构化表”和关闭 Inspector，均使原请求 signal abort。host 故意不读 signal，先生成确实改了文字且 version=1 的原生有效 XLSX，再等待可控 gate；取消后释放它。请求完整 finally 解锁后，原 handle 的 version=0、undo/redo=0、dirty=false、完整 currentBytes 与原 fixture 精确相同、宿主保存零次、dirty(true) 零次，且没有“已应用”反馈。
- 在 host 仍未返回时切图表模式，额外确认“插入范围图表”仍处于 disabled 祖先 fieldset 内。close 场景先通过真实入口重新打开 Inspector，再验证相同非管理合同。
- finally 无论通过/失败都释放 gate 并等待 Editor 解锁，防止测试挂起异步链。原 25 项管理器/native/ZIP/history 断言未删减。

### 验证结果

- **真实红例已保留**：生产修复前新 2 用例均在管理 task 的 `closest('fieldset[disabled]')` 断言失败，日志 `/tmp/mimir-xlsx-manage-cancel-red-20261017.log`。最初 native reader 返回结尾段换行，测试改为精确期望 `迟到结果不得落地\n` 后才记录该真实祖先禁用红例。
- **最终专项 3 文件 37/37 PASS**：管理器25 + 新真实Editor取消2 + 既有透视Editor10。日志 `/tmp/mimir-xlsx-manage-cancel-final-tests-20261017.log`，exit0。
- **Office typecheck PASS / exit0**：`/tmp/mimir-xlsx-manage-cancel-final-types-20261017.log`；上一节记录的并行 DOCX 错误在此快照已不存在，没有由本实施者修改它们。
- **目标 oxlint / oxfmt / Antd lint PASS**：`/tmp/mimir-xlsx-manage-cancel-final-{lint,format,antd}-20261017.log`；5 个目标代码/测试/CSS文件格式一致，TSX scoped oxlint 无诊断，Controls Antd lint 0 issues、partial=false。新增测试曾触发 no-conditional-expect，已将所有断言移至条件分支外，保留每条行为断言，没有加 suppression。
- `git diff --check` PASS。未运行 Server 或全仓测试、Web build、浏览器。未改 XlsxEditor、shared、vendor、其他 owner 文件或旧原生/history 断言。

**再次冻结：** 原三文件、本次额外的 XlsxObjectControls.tsx 与 XlsxEditor.management-cancel.test.tsx、以及本报告。所有本片测试/类型/静态进程已退出。根会话仍需正式独立复查与统一构建后的 1280×800 /420×500 生产浏览器验收；37/37 不替代几何证据。

## 生产浏览器层叠缺陷返工

根会话新构建已实测短高滚动修正：420×500 body clientHeight=118px、scrollHeight=476px，字段聚焦后 scrollTop=242、字段 y344/h24、primary y429/h24、页面宽420。旧14px挤压已经消除；上述数字由根会话提供，本实施者未再次操作浏览器。

新问题为冻结列头盖住覆盖 Inspector 标题：根会话 `elementsFromPoint(125,198)` 首项是 sticky `TH.mimir-xlsx__colhead` z5，而 aside Inspector 为 z4。已查看截图 `xlsx-manage-gradient-420.png`，确认标题左端确实被网格覆盖。

### 原因与最窄修正

- 真实 Editor 的普通冻结格 z2、双轴冻结格 z4；冻结行/列头内联 z5、交角格内联 z6。绘图对象同属 `.mimir-xlsx-wrap` 滚动树，没有独立更高 z。外壳 `.mimir-editor__body` 已 isolation，但它同时包含工作表和 Inspector，因此不能阻止工作表后代 z5/6 覆盖兄弟 Inspector z4。
- 只在已有 `.mimir-xlsx-inspector-host > .me-scroll` 规则加入 `isolation: isolate` 和原因注释。该直接滚动子项即工作表容器，建立局部 stacking context，冻结表头/格/绘图全部收在它里面；Inspector 继续作为同级 z4 覆盖。没有提升 Inspector z-index、改变全局弹层，或修改之前滚动体与取消接缝。
- 规则只在 Inspector host class 生效期间使用；关闭仍沿原 cleanup 移除此 class。320px停靠 margin 与 ≤800px overlay margin 回零规则保留。
- Select 仍沿原 ToolbarSelect portal 到 document.body；颜色/菜单仍在 Inspector 中本地 fixed z20，不在工作表隔离树内；确认弹层原路径保持。没有更改 popup 容器、Escape/回焦处理、尺寸或 footer。

### 回归与检查

- `XlsxEditor.management-cancel.test.tsx` 在真实 Editor 打开 Inspector 后增加结构边界断言：工作表滚动容器与 Inspector 为同一 host 下的兄弟；实际列头、行/交角头和工作表对象全在滚动容器内。该约束证明新增 isolation 的目标实际覆盖问题元素且不包含 Inspector，没有复制 CSS 数值写镜像测试。它不声称 happy-dom 能验证渲染层叠。
- **2 精确文件 27/27 PASS**：上述真实 Editor 2项、原管理器25项（含原native/history/颜色和确认/Select Escape断言）。日志 `/tmp/mimir-xlsx-inspector-layer-tests-20261017.log`，exit0。
- **Office tsc exit0**：`/tmp/mimir-xlsx-inspector-layer-types-20261017.log`。
- **目标 lint / format exit0**：`/tmp/mimir-xlsx-inspector-layer-{lint,format}-20261017.log`。
- **限定 CSS diff 检查**：对实施前临时快照 `/tmp/mimir-xlsx-inspector-layer-before-20261017.css` 执行 diff，生产 CSS 仅新增注释与 isolation 两行；`git diff --check` exit0。

本次新增改动仅 `xlsx-tools.css`、已归本片所有的新 Editor 测试及此报告。未改其他 owner 文件、Server/shared/vendor，也未运行全仓/Server/build/browser。所有本片进程退出并冻结，交根会话正式独立复查、统一构建后重验标题命中/工作表冻结/颜色和Select/焦点。当前27/27只证明结构与行为回归，最终可视层叠仍待实际浏览器。
