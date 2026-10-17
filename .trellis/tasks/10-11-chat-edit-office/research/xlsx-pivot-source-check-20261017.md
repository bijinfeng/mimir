# XLSX 跨表透视来源选择：独立复核

2026-10-17，`pdf_signature_check` reviewer。依据已批准 `xlsx-pivot-next-plan-20261017.md`、本片 implementation 记录与唯一 XLSX Agent 合同检查。本轮没有重开竞品研究，沿该研究已核对的固定 GenOffice/WeKnora 版本与证据。

## Findings (fixed)

- 文件：`packages/office/src/editors/XlsxPivotControls.tsx`、`xlsx-pivot-controls.css`。
  - 问题：root 在真实 420×500 浏览器预验发现 320px Inspector 只有约299px高度；固定的原生透视选择器/分类、六类型导航与正文最小padding共同挤压，footer越出面板，创建按钮底部约6px被裁掉。具体 root 预验边界：panel y174–473.36，button y455.39–479.39，footer y414.75–491.39。
  - 修复：将透视选择器与字段/汇总/筛选导航纳入唯一 scroll body，配置的12px内边距移到内部 configuration。footer仍为fieldset直接子项、固定单一primary；保留320px布局、原字段和状态/请求生命周期。短高时全部上部配置可以内部滚动，不再用固定navigation和最小padding挤压主动作。
- 文件：`packages/office/src/editors/XlsxEditor.pivot.test.tsx`。
  - 补充真实Editor回归：缩窄时同一Inspector和跨表名称草稿仍在；navigation/configuration同属scroll body，footer与body为同级，footer仅含一个创建主动作。尺寸mock只验证组件结构/身份，不代表真实浏览器像素验收。

## Findings (not fixed)

- 无已证实而未修复的本片代码缺陷。
- 最终真实420×500修后布局、来源长名/Select Escape/焦点与保存下载历史由root统一build后完成；本报告不宣称该最终浏览器门禁已通过。
- 曾从Ribbon折叠分支推测对象Inspector可能重挂；本片420尺寸回归未触发对象组折叠，root真实1280→420也确认来源/目标/草稿保留。没有依据该静态推测改动组件边界或共享壳。初版探索测试在“应已折叠”前置断言失败，不能作为Inspector丢失证据；最终改为验证实际草稿身份与scroll/footer结构。
- 已有透视布局继续只读、刷新当前输出表全部透视；edit_pivot、报告筛选项选择、切片器/时间线等不在本片，不能因来源选择完成而标齐。

## 实际路径核对

- Source Select保存持久ID；隐藏来源可见标注，保护来源禁用。切源不执行写操作；保留名称/源范围/目标位置，默认行和值从新来源读取，清空旧列/page/group/filter；选择同一来源提前返回。
- helper分别接收source/target，跨表填targetSheetId；相同坐标仅在同一表时拒绝，2000格/边界/字段/公式缓存等仍验证。
- 父接缝不覆盖add_pivot来源ID；执行前核live工作簿来源/当前输出ID、publishedVersion、document/handle/signal。全宿主仍验证来源与输出保护及目标内容/merge/DV/table冲突。
- accepted request signal关联自身发布，成功不重置来源/配置/消息；外部源/上下文/关闭/类型切换单调abort。真实Editor跨表A→B→A迟到结果不增版本/history/dirty。
- 真实Editor经完整宿主创建总计150，原生cache来源/目标归属正确；source/第三表/sharedStrings/customXml不变，Undo/Redo后保存比较全部非目录ZIP条目。原生全宿主源金额10→110再刷新为250；保护与冲突整批拒绝。
- spec现有唯一合同已完整描述本片source/target/切源/取消/自身发布行为。短高修复落实既有“内部滚动、固定单一应用入口”，无新增产品或接口合同，未重复登记spec。

## Verification

| 门禁 | 独立运行结果 |
| --- | --- |
| Office helper/控件/真实Editor/ShapeGallery回归 | 最终4文件31/31，`/tmp/mimir-xlsx-source-independent-office-final-20261017.log`；修前4文件30/30 |
| Server完整宿主透视 | 1文件11/11，`/tmp/mimir-xlsx-source-independent-native-20261017.log` |
| Office TypeScript | 最终exit0，`/tmp/mimir-xlsx-source-independent-types-final-20261017.log` |
| Server TypeScript | exit0，`/tmp/mimir-xlsx-source-independent-server-types-20261017.log`；此后仅Office布局/测试更改 |
| 目标oxlint | 0问题，exit0 |
| 目标oxfmt --check | 10文件通过，exit0 |
| antd lint PivotControls | 0问题 |
| style backticks /目标git diff --check | 通过 |

没有重跑全仓已知480项技能lint失败、全Office/Web build或其他格式套件；root负责统一门禁及最终实机。未上传、删除、暂存、提交或归档；未调用真实模型、未验Desktop。生产/目标测试冻结交root。
