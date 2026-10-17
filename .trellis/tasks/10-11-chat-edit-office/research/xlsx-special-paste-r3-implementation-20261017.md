# R3 选择性粘贴实施记录

2026-10-17，owner `/root/xlsx_special_paste_r3`。R2b独立检查与root浏览器通过后，root显式交接生产接线权限。本片现已接入六模式及整数倍平铺；最终独立checker和root真实浏览器仍待验收，本记录不是全工具完成证明。

## 来源与语义

主参照GenOffice固定commit `480548fd55f1be3593ee0d8e316a734751d58309` sheets ribbon-actions317–340；官方Univer0.25.1缓存 `/tmp/mimir-univer-r2-review-20261017`。具体合同见R3 plan和shared XLSX合同新增R3节：

- sheets-ui4136–4146：hook按priority递增；基础value0，formula-ui后续10。
- sheets-ui11030–11075与formula-ui1051–1101：仅值使用真实缓存/类型；非公式目标保留源rich runs，但替换公式目标时后续hook降plain。
- formula-ui1102–1164：公式模式仍复制常量和空值，rich常量降plain；每tile真实平移。
- sheets-ui11091–11191：format的clear/set只写`s`，不写rich body；原生实现保留目标富文本正文，只更换基础style。11690–11830：format复制merge，besides复制其他内容并保留目标有效border。
- CF UI3612白名单default/format/besides；3730–3825缓存cfIdMap并将repeatRange并到同一源规则身份。DV UI914排除width/value/format/formula；985–1085同样合并重复范围。因此每个源规则跨全部tile保留一个规则身份和多sqref，不能将统计域拆成四条独立规则。
- CUT：sheets-ui4425特殊mode排除default，真实清源move只在10960的default hook；4383仍消耗CUT cache，CF/DV还有各自跨表CUT规则删除。root确认特殊CUT准确禁用并提示先复制，all保留真正move；不猜测清源。
- 列宽sheets-ui11726–11785按源列周期复用，宽度0/fixed默认不赋值；目标hidden跳过。为核定默认值，本轮从registry获取并验证官方`@univerjs/core@0.25.1` SHA512 integrity，tar `/tmp/mimir-univer-core-r3-0.25.1.tgz` SHA256 `e7f9f9d6f1b5f96b42c0a8aec468a759584aff7c4312ff264661b34584b0771a`，展开 `/tmp/mimir-univer-core-r3-0.25.1.js`明确`DEFAULT_WORKSHEET_COLUMN_WIDTH=88`；native采用`(88-5)/7`字符单位。实际workbook自定义defaultColWidth可复制。

WeKnora复用已核官网/公开源v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`，官网SHA `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`、definitions SHA `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`。本轮没有重新HTTP访问WeKnora；它仅作为KB/Agent门控参考，没有Office native特殊粘贴writer可直接复用。

## 已接入

### 原生宿主与规则

- shared新增严格私有`paste_range`与六mode，公开固定Agent DSL不变。host显式路由专用适配器；普通manual路径拒绝误调用，复用原assembler完成候选发布。
- 几何先验A1/Excel边界/2000格；单格展开或完整整数倍平铺，CUT同尺寸且仅all。源/目标XML与规则冻结，所有tile只规划一次，一次candidate/version/history，不串行改源。
- projector保留原生数值、布尔、错误、cache、rich/共享文字及主题；缺cache/共享数组或未知cell元数据拒绝。formula平移并去旧cache，format保留目标body；besides只追加必要xf并解析目标applyBorder=false的cellStyleXfs继承。无变化返回原字节。
- R2a结构planner新增all/merge/preserve与完整tile独立验证，复用merge/link reader与关系writer。R2b规则planner新增kinds/tiles，未选种类原文保留；CF/DV按源身份一次合并多sqref、统一priority。私有permit绑定原XML/entry/range，不能从HTTP伪造。
- 最终实际候选DV、未变化目标值/空格与依赖域沿原host检查；保留showErrorMessage=false的未知cache拒绝。protected来源跨表copy只读且原XML保护标记exact保留；实际target/同表写仍assert writable。没有native unlock。
- 列宽复用同一periodic planner，源/目标区间查找各2m预算；target span只改width/min/max/customWidth，hidden/style/outline等保留，零/固定默认不赋值。same-source all/format/besides及重复实际无变化不增版本/history。

### 控制器与Inspector

- mode是准备状态，selectInternal只清外部稿；无宿主调用、dirty或history。pending不能改变mode；内部只提交一个严格paste_range，带完整目标矩形。
- stale/陌生marker保持拒绝，不以value选择自动降级；外部仅all/value，其他需原生来源。特殊CUT禁用并准确解释先复制。
- 现有320px Inspector与稳定Editor body保持。mode紧接内部范围，外部内容随后；唯一固定footer“粘贴”，去掉立即提交的第二内部/values按钮。Escape先尊重已处理子弹层，再关闭与回焦。未改CSS或引入新视觉体系。

## 文件清单

生产9文件（完整生产SHA另存freeze文件）：

1. `packages/shared/src/xlsx-agent.ts`
2. `apps/server/src/services/xlsx-special-paste.ts`（新增）
3. `apps/server/src/services/xlsx-special-paste-host.ts`（新增）
4. `apps/server/src/services/xlsx-range-rules.ts`
5. `apps/server/src/services/xlsx-range-structures.ts`
6. `apps/server/src/services/xlsx-manual-ops.ts`
7. `apps/server/src/services/xlsx-agent-host.ts`
8. `packages/office/src/xlsx-clipboard.ts`
9. `packages/office/src/editors/XlsxClipboardControls.tsx`

测试4文件：新增Server `xlsx-special-paste.test.ts`、`xlsx-special-paste-host.test.ts`；修改Office `xlsx-clipboard.test.ts`、`editors/XlsxEditor.clipboard.test.tsx`。更新shared XLSX合同、Office editors conventions及本报告。保留所有其他owner dirty改动。

## 验证证据

最终完整快照重新验证如下；早期514仅为历史，不计入最终证据。

| Gate | Result / evidence |
| --- | --- |
| 原R2a/R2b/validation/sort/pivot + R3 Server18文件 | **18文件516/516，0failed/0skipped，exit0**；`/tmp/mimir-r3-server-final-frozen-20261017.log` |
| 最后R3专项2文件 | 62/62，exit0；`/tmp/mimir-r3-native-final-20261017.log`（追加protected-source exact断言后并入上述完整重跑） |
| Office8文件 | 88/88，exit0；`/tmp/mimir-r3-office-final-20261017.log` |
| 最后Office控制器/真实Editor2文件 | 26/26，exit0；`/tmp/mimir-r3-office-native-final-20261017.log` |
| Server typecheck | 等待media owner修复其新`pptx-agent-services.test.ts:265` ArrayBuffer类型，R3无诊断；`/tmp/mimir-r3-server-types-final-20261017.log` |
| Office typecheck | PASS exit0；`/tmp/mimir-r3-office-types-final-20261017.log` |
| 本片13TS文件oxlint --deny-warnings | PASS exit0；`/tmp/mimir-r3-lint-final-20261017.log` |
| 同13文件oxfmt --check | PASS exit0；`/tmp/mimir-r3-format-final-20261017.log` |
| scoped diff check | PASS exit0；`/tmp/mimir-r3-diff-final-20261017.log` |

原生62项涵盖六mode矩阵、整件无关entry、overlap/跨表/2×2tile、同源与重复no-op、rich/cache/继承border、周期default/zero/hidden宽度、DV缓存拒绝、strict schema/CUT/预算/保护、完整tile校验、真实handle单历史/UndoRedo/markSaved。Office联合真实host验证mode准备零dirty、同一次values tile、完整bytes Undo/Redo/save；其余保留stale/abort/新draft/read取消和Ribbon折叠持久性。

历史诊断保留：初次native formula模式因fixture目标DV含公式目标而正确拒绝未知cache，收窄fixture目标DV后补独立拒绝测试，不弱化生产DV。初次Server tsc因Server测试导入browser clipboard而缺DOM；改为Server只测真实handle，browser controller在Office happy-dom真实Editor测，不扩Server lib或造shim。首次lint发现测试条件断言、shadow和名为useInternal的方法被判React hook，分别改为按mode具名validator、去shadow、selectInternal，未降低规则。原准备阶段一次pnpm exec触发wrapper隐式install已精确结束调用进程树；此后全部直接已安装node/bin，无本片manifest/lock/vendor改动。

## 待root完成 / 风险边界

- root独立checker须按最终生产freeze核对，不以本owner自验充当独立通过。
- root实际1280×800/420×500浏览器：六mode发现/准备、窄高body滚动/footer、Select/Escape回焦、原生CF/DV可读、保存下载/UndoRedo/重载与ZIP核对；本片未操作浏览器。fixture `/tmp/mimir-xlsx-special-paste-r3-20261017.xlsx`由测试生成，最终SHA及baseline须在本轮停止生成后固定。
- 仍沿原生writer的复杂/未知规则、部分merge、共享数组/复杂公式与预算拒绝。特殊CUT明确不支持；外部格式精确还原仅支持原有基础HTML，不声称Excel全部粘贴模式或外部OS互操作完整。
- Desktop由用户自行验收；无真实模型/provider调用或Excel客户端实测。
- 全仓构建/最终总任务ledger由root统一；本片不提交/暂存/归档/删除测试件，不改依赖/vendor。


## 最终冻结交接

- 生产9文件SHA256：`/tmp/mimir-r3-production-freeze-20261017.sha256`；生产/测试13文件完整路径：`/tmp/mimir-r3-paths-20261017.txt`。
- 最终浏览器fixture SHA256：`70bc9cd759cfb02b0937ab7c6bc88b604cb88f3adf4667e0c1e7ab1111fffbea`，独立文件`/tmp/mimir-r3-fixture-freeze-20261017.sha256`。正式测试会重新生成该fixture，root应复制固定baseline后取SHA，不能以旧生成SHA断言未来文件。
- 最终Server18文件516/516通过后已释放正式runner并通知root/media owner；所有本片测试进程已结束。父任务可分派独立checker，不能由本owner的角色自认独立通过。
