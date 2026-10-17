# XLSX 透视来源工作表选择：实施记录

2026-10-17。依据 root 已批准 `xlsx-pivot-next-plan-20261017.md` 与 implement.md 的最小跨表手动纵切片；生产代码已冻结，交独立 checker 与 root 浏览器验收。当前为实现/专项验证结果，不冒称浏览器通过或已有布局可编辑。

## 改动与边界

- `XlsxPivotControls.tsx`：来源工作表 Select 使用持久ID，默认当前输出表；隐藏表可选且标识、保护表列出但禁用。输出工作表只读回显。来源切换不提交操作，保留透视名称、源范围、输出位置，重新推导行/汇总字段并清除列、报告字段、分组、筛选规则。同来源不重置；无有效字段时显示具体关联错误，不能沿用旧来源字段。
- `xlsx-pivot-controls.ts`：helper 独立接收来源与目标，跨表明确生成 `targetSheetId`；同坐标跨表允许，同表源/输出重叠继续拒绝。原字段、2000格、公式缓存及原生布局校验保留。透视控件回调收窄为现有 add/refresh 操作联合。
- `XlsxObjectControls.tsx`：只透传工作簿 sheets 与本请求已发布 signal。该组件既有 `onPivotOperation` 同时供形状图库使用，因此此层保留通用 record 签名，不因透视收窄破坏形状。
- `XlsxEditor.tsx`：父级不再覆盖 add/refresh 的来源ID；在活会话检查来源ID、输出ID、当前画布版本，再沿原句柄执行。输出仍固定当前表。通用形状入口仍补当前 sheetId。错误在 Inspector 显示真实宿主原因，失败保留草稿。
- 成功发布时在既有 edited 快照关联当前请求 signal；控制器把自身已接受新视图与外部变更分开。实际 Editor 测试先复现“创建成功却清空来源/配置并丢成功状态”，再修复。自身 busy 不取消，重复点击互斥。外部快照/文档/输出/关闭/切对象仍单调 abort，A→B→A 不复活。
- CSS 仅补来源当前名称换行与具体源错误；沿320px既有 Inspector、滚动 body 与固定单一 primary，没有新增 Ribbon 组。
- `xlsx-pivot-controls.test.ts` / `XlsxPivotControls.test.tsx` / `XlsxEditor.pivot.test.tsx` / `xlsx-pivot-test-fixture.ts`：helper、真实控件与真实 Editor 保存历史验证。
- `apps/server/src/test/xlsx-agent-pivots.test.ts`：仅增加全宿主原生跨表及拒绝测试，**没有 Server 生产、vendor 或 shared 生产改动**。
- `.trellis/spec/shared/contract/xlsx-agent.md`：在现有唯一透视合同中补来源/输出、切源草稿、保护与自身发布契约；任务矩阵与 root 浏览器报告由 root 管理。

现有定义继续直接读取原生模型并只读显示，刷新仍针对当前输出表全部透视；未实现 edit_pivot、新建工作表、选择报告筛选项、切片器/时间线或扩大原生守卫。

## 原生及交互证据

1. 从 source sheet-1 A1:F6 创建到 current sheet-2 A1，单项 operation、单版本和单 history，汇总150；native cache worksheetSource 使用真实含空格/引号中文名，pivot 归属目标表。
2. 真实 Editor→完整 applyXlsxOpsOnHost→原生保存：来源 XML、第三表 XML、sharedStrings/customXml 保持精确，目标 Z1 原说明仍在。保存→Undo→保存恢复所有非目录 ZIP entry；Redo→保存恢复已接受全部 entry。重开可读取原生透视。
3. 全宿主 source 金额10→110 后，对输出表 refresh 得到250，来源/输出分离仍正确。
4. 来源保护、目标保护、无效目标ID、输出内容/合并/数据验证/结构化表冲突全部整批拒绝；输入 bytes 不变。真实 Editor 的输出冲突保留名称/位置并显示具体错误，version/history/dirty 不变。
5. 切源重置真实字段和规则、保留用户名称/范围/位置、不产生写操作，pending 来源 Select 明确禁用，同 tick 重复提交仅一次；关闭/换文档/切对象及输出表 A→B→A 的迟到结果不发布。
6. 测试用跨表 fixture 在原生来源含 inline/shared 字符串、D2 样式+缓存公式及原件 Z1/Z2；隐藏表使用另一组真实字段以证明切源重新提取，保护表明确禁用。

## 本片运行验证

| 验证 | 结果与日志 |
| --- | --- |
| Office helper/控件/真实Editor/形状既有回归 | 4文件30/30，`/tmp/mimir-xlsx-pivot-source-final.log` |
| Server 完整宿主 pivot 原生/保护/冲突 | 11/11，`/tmp/mimir-xlsx-pivot-source-native.log` |
| Office TypeScript | exit0，`/tmp/mimir-xlsx-pivot-source-types.log` |
| Server TypeScript | exit0，`/tmp/mimir-xlsx-pivot-source-server-types.log` |
| 目标 oxlint / oxfmt --check | 0问题，通过；最终 oxlint 无 warning |
| antd lint PivotControls | 0问题 |
| style backticks / 目标 git diff --check | 通过 |

初轮新增测试发现真实 own-publication 清空问题，修后通过；另修测试 helper 函数名、原生引号合法转义预期与真实工作表 tabs 驱动。早期失败日志保留，不将初轮失败写成绿。没有重跑全 Office、Web build 或全仓既存技能 lint。

## 浏览器交接

- 初版浏览器 fixture：`/tmp/mimir-xlsx-crosssheet-pivot-20261017.xlsx`。root 已上传至「编辑器工具栏验收-20261016」，ID `6Tv8SvZF5NSJsj3Z`。**该已上传基线文件未被覆盖**；后续测试 helper 增加 shared B1 和 D2 缓存公式，但总数/名称/操作步骤相同，不拿两个字节版本混比。
- 初始 activeTab=汇总，source `源 数据'2026 中文季度销售明细与部门汇总`，sourceRange A1:F6，target A1，总计150；另外含「保留第三表」「隐藏来源」「受保护来源」。
- root 待最终统一 build 后实际1280×720/420×500验证来源当前值、长名换行、内部滚动/固定 primary、Select Escape 两层和可见入口回焦，以及保存/下载/Undo/Redo/源改后刷新。
- 本片未操作浏览器、未上传/删除、未调用真实模型、未验 Desktop；用户既定浏览器优先、Desktop自行验收边界保持。未暂存、提交或归档。
