# R3 选择性粘贴实施边界

2026-10-17，承接用户“所有工具补全”、既有R3差距清单及R2b规则迁移；本计划由root采纳，进入实施。R2b生产文件仍归其owner，R3首先仅准备新模块/专项测试，接线须等明确交接。

## 固定来源与语义

主参照 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的 sheets ribbon-actions 317–340。Univer官方0.25.1缓存 `/tmp/mimir-univer-r2-review-20261017`，不是以WeKnora Markdown编辑器推断Office。

新增核对官方 `@univerjs/sheets-formula-ui@0.25.1` metadata+tar，registry SHA512 integrity已验证；tar SHA256 `3f24397901f4bf6acd01499ddfe554fa904542416ed6e2ae51b3f174f74e8b34`。其 es/index.js 949/1037/1102：公式模式平移公式，非公式格仍粘贴常量，并把富文本降为文字；不是只写有公式的格。仅值模式移除公式、用真实缓存/类型，不能把公式字符串或格式化显示文案冒充数值。

| 模式 | 正文/公式 | 基础格式/合并 | CF | DV |
| --- | --- | --- | --- | --- |
| 全部 | 原生普通copy/move | 是 | 是 | 是 |
| 仅值 | 常量/公式缓存，去公式 | 保留目标格式/合并 | 保留目标 | 保留目标 |
| 公式与值 | 平移公式、保留常量 | 保留目标格式/合并 | 保留目标 | 保留目标 |
| 仅格式 | 保留目标值/公式 | 源基础格式与合并 | 源迁移 | 保留目标 |
| 列宽 | 不改格内容 | 仅列宽 | 保留目标 | 保留目标 |
| 除边框外全部 | 源值/公式 | 源格式但目标边框保留，合并 | 源迁移 | 源迁移 |

具体依据：sheets-ui es/index.js 11690–11830 特殊hook；formula-ui上述；CF UI3613白名单format/default/besides-border；DV UI914排除col-width/value/format/formula。值、富文本、空格等准确细节继续沿真实官方函数核对，不能仅看命令名。列宽官方hook11726–11785和sheets mutation2537：源宽等于默认时不赋值、目标隐藏列跳过；实施必须说明实际采用固定上游规则并测试，不能暗中把宽度复制等同重置隐藏/样式。

仅值需来源缓存真实性（数字/boolean/error/string/inline/sharedString/空格）；缺公式缓存精准拒绝，不隐式执行公式。格式依有效继承样式物化，不丢行/列继承。除边框外应逐格合并目标有效border，不能把source bd=null误写为清空目标边框。合并/DV/CF与native关系沿R2a/R2b同一reader/writer和permit，不复制第二套XML算法。

## 实施接缝

- 使用私有严格manual操作与模式枚举，公开Agent固定DSL不扩展；未知字段/mode拒绝。一次host调用、一次候选发表、一次history，所有计划先验证后写，失败零发表。
- 内部原生buffer绑定document/source/handle/version与marker，失效不得自动改用显示值。仅值入口可显式使用可读外部内容；其余无法从外部数据可靠还原的模式给准确禁用说明，不能伪装原生格式已还原。
- 模式为纯准备状态，在现320px剪贴板Inspector内提供可发现的模式选择和简短当前范围说明；单一底部粘贴动作。窄屏具名组入口、body滚动、footer固定、Escape最近层/回焦、primary不重复文案。
- 全部模式保留正常剪切；特殊模式的CUT须根据真实上游hook确认清源合同再实现。若固定上游不支持可用特殊CUT，UI准确禁用并提示先复制，禁止猜测而清空源。不能把这个边界写成全部CUT语义已对齐。
- 固定上游有重复矩阵映射（formula-ui `% source rows/cols`，sheets-ui colProperties `%length`）。目标单格展开；同源整数倍矩形在2000格预算内应真正支持平铺，非整倍矩形精准拒绝。合并或规则跨tile须统一验证、不每tile单独发表。预算、保护、全簿重写公式、stale、abort、宿主DV校验全保留。
- R2b未完成前仅新文件准备；明确交接后整合range/host/manual、controller/UI，必要共享有效样式reader最小接缝，不能触碰DOCX/E1S。

## 必须验收

逐模式真实ZIP：公式/缓存/错误/富文本/继承样式、merge、target-border、CF/DV模式矩阵、宽度区间拆分/隐藏列/默认宽、无关native部件、同表overlap/跨表/平铺/预算/保护/过期/取消、单次版本与history/noop。真实Editor/controller与host联合验证；1280×800/420×500浏览器模式准备零dirty，粘贴→保存→原件→Undo/Redo→reload。独立checker保留原R2a/R2b回归。不能仅新helper绿声称全工具完成。

WeKnora沿已核v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`，官网SHA `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`，definitions SHA `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`。本轮复用缓存，没有伪称重新HTTP核对；它没有Office选择性粘贴writer可复用。
