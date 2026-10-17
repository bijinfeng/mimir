# 高级透视与 HTML 规划独立复核

2026-10-17；checker `/root/pptx_global_selection_check`；不构建、不部署，整体任务继续进行。

## XLSX 高级透视

实读新控件/helper/CSS、XlsxObjectControls与Editor接缝、宿主精确AIO grouping extension guard及专项测试。配置仅生成原生add_pivot/refresh_pivot：有序行列、多values、稳定valueKey映射、日期/数值分组、标签/数值筛选与pageFields完整传递。源缓存/标题、边界与2000格、孤立规则、列多值冲突在提交前拒绝；数值/格式失败保留草稿。已有定义只读展示并刷新当前表全部透视，没有有损反编译成编辑草稿。

signal绑定source/context，关闭/切类型/换文档取消，已发布version送入handle；自身busy不取消自身提交。真实Editor验证一次history、新原生分组和多values、save→undo/save→redo/save全部ZIP entry恢复，迟到真实宿主字节不落画布。

AIO增长例外仅允许唯一完整固定writer XML，无额外XML属性/子元素/同级扩展，JSON键与native grouping逐项一致、fieldIndex唯一。七类未知扩展/失效JSON仍原子拒绝；没有修改vendor或全局保护。此片未发现需要修改的生产缺陷。边界：不编辑已有复杂定义；报告筛选仅保存字段/全项；季度月份跨年合并与Excel刷新退回原始维度已明示；自定义数字格式仍限制增长。

独立测试Office3文件14/14（`/tmp/mimir-advanced-pivot-check-office.log`），Server2文件12/12（`/tmp/mimir-advanced-pivot-check-server.log`）。固定竞品版本/WeKnora HTTP与源码证据沿实施报告，不新增研究结论。

## HTML 修复

- checker发现合法question.id为constructor/__proto__/toString时普通choices对象读取到继承属性，导致多选提交includes异常；root用Object.hasOwn统一取值并补3回归。
- checker发现ask_clarification仅入口检查signal、plan_page等待confirmBrief后未复查，Stop后旧确认可返回成功/启动writeDocument。root明确授权checker补可选signal参数兼容旧hook：Editor立即取消仅本请求，resolve一次，清理监听，旧请求不得关闭后继；旧session迟到规划不得重开确认；Handle每次await后复查signal/开始版本，再返回成功或启动写作。
- 新增6个handle deferred回归与3个真实Editor回归（含三种mode×停止/人工变更），验证停止、版本变化、后继请求、换文档的旧服务返回不调用writeDocument、不迟到成功；原source/preview实例连续挂载。
- 校验description须为字符串，防模型输入对象成为非法React子节点；8处新测试vi.fn补明确函数类型，消除目标lint失败。
- 布局仍右Inspector+内容滚动+固定footer；单选只显示一份label，checkbox选项顺序输出，未选为空数组/AI决定，单选旧response形状兼容。关闭/Escape/跳过及不抢外部焦点测试保留。真实组件harness420由root目视，未冒称模型执行。

修后独立HTML3文件47/47，日志 `/tmp/mimir-html-planning-cancel-check-tests.log`；最终重跑与目标门禁见后续追加。所有轮次重叠，不累计。root负责最终browser/build；模型未配置、Desktop用户自验，全仓既存技能lint阻断不记通过。

最终冻结门禁：HTML再次3文件47/47（`/tmp/mimir-html-planning-final-tests.log`），Office与Server typecheck exit0（`/tmp/mimir-pivot-html-final-{office,server}-typecheck.log`），16个TS/TSX目标Oxlint、18文件Oxfmt、styles、diff均exit0。DOCX表格并行3处类型错误已由该owner修复，最终Office tsc已包含该增量通过。本片独立复核完成，未构建。


## 追加：XLSX 自闭合 XML 与透视数据 P1 独立复核

### Findings (fixed)

- 实读 worker 对 `xlsx.ts` 的 row/c 修复：在同一开标签优先决定 `/>` 或 paired body，避免 paired-first 分支把下一行/格的关闭标签当成自己的结束。默认 SpreadsheetML namespace 与原有属性解析未改；styled blank、inline文本、数值、cached/uncached公式均保留原列。
- reviewer 补3个成对空元素等价回归：`/>`、空格` />`、换行`\n/>`，混用显式行/列引用与省略坐标，连续空行仍推进隐式行号，连续空格和显式跳列后省略引用仍落在真实列。
- 同文件 `readSharedStrings` 发现既有同类错序，根会话明确授权同片最小修复。真实最小 XLSX 的预期 `["", "技术部", "", "", "市场部", ""]` 原来读成 `["技术部", "市场部", "", "", "", ""]`；修前3种变体均失败，日志 `/tmp/mimir-xlsx-shared-index-before.log`。现按 si 出现次序一次解析 paired/self-closing 项，删除末尾统计补空，保持共享索引与富文本 run 拼接。
- native host 部门用例参数化 inlineStr/sharedStrings 两种存储，共享表在标签前后和中间放空 si；真实 add_pivot→refresh_pivot 均只含两个真实部门，技术收入470/平均250÷3、市场收入440/平均245÷3、总计910/平均495÷6，原 F5/F6 源 XML 保留，无虚构空成员。
- editor pitfalls 同步自闭合开标签判定、共享空项原序与隐式行列计数合同。

### Findings (not fixed)

- `x:row`/`x:c`/`x:si` 等显式前缀的整个 XLSX reader 支持仍为既有独立边界，根会话明确要求本片不扩大。默认命名空间在全部 fixture 中已覆盖；未把此次自闭合修复宣称为完整 namespace-aware XML parser。
- 未发现本次 row/c 变更产生的额外阻断。真实浏览器透视下载/history由根会话完成，不计作本 reviewer 执行；模型/Desktop仍沿前述边界。

### Verification（最新生产冻结后）

- Office4文件 **61/61**：xlsx、xlsx-edit、xlsx-format、XlsxEditor.pivot；`/tmp/mimir-xlsx-selfclosing-review-office.log`。
- Server2文件 **14/14**：xlsx-pivot-grouping-refresh、xlsx-agent-pivots；`/tmp/mimir-xlsx-selfclosing-review-server.log`。这些轮次与前述14/12及中间58/13重叠，不能累加。
- Office/Server typecheck 均exit0：`/tmp/mimir-xlsx-selfclosing-review-{office,server}-types.log`。
- 目标3文件Oxlint无warning/exit0，Oxfmt check exit0；`/tmp/mimir-xlsx-selfclosing-review-{lint,format}.log`；`git diff --check` exit0。
- 不构建、不部署、不提交/暂存/归档；全仓480项既存技能lint阻断未在此片重跑或冒报绿。
