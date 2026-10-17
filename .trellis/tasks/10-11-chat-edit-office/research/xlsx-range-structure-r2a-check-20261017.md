# XLSX R2a 独立检查（最新正式复查通过）

最新结论：文末“F2 返工后的最终正式独立复查”已确认 R2a-F1/F2 修复，Server 10 文件 325/325、Office 38/38、Server/Office types 与 scoped static 全部通过。仅放行本报告定义的 R2a 普通完整包含 merge/hyperlink 迁移，浏览器验收与后续 R2b/特殊粘贴仍不由本报告证明。以下保留各轮真实失败历史，不把旧失败删去。

2026-10-17，`xlsx_range_r2a_check`。只检查当前 R2a：普通、无筛选、单矩形 copy/move 的完全包含标准 merge/hyperlink 原件迁移；不将 R1 守卫或本片主路径等同于全部 Excel 结构粘贴能力。生产算法未由 checker 修改。检查已结束，所有本 agent 创建的测试/类型/static 进程均已退出；Server 测试锁释放给 root。

## Findings (fixed)

- 没有修改生产实现。新增独立 `apps/server/src/test/xlsx-range-structures.check.test.ts` 的 mock 明确采用 `vi.fn<() => void>()`，修复新测试自身 lint；未降低 lint、未改原有断言。
- 新增 22 个独立检查，原有实现者 38 个结构测试及 R1/host/route 回归全部保留。

## Findings (not fixed)

### R2a-F1：合法 CDATA 公式被发布成字面 XML，且普通 `&` 被误拒绝（阻止放行）

- 责任路径：`apps/server/src/services/xlsx-agent-range.ts:257`；`apps/server/src/services/xlsx-manual-ops.ts:438,471,500`；`apps/server/src/services/xlsx-range-structures.ts:25` 的 `decodeXlsxRangeXml`。
- 在带真实合并/外链的源范围 `A1:C3` 内增加 `C2` 的原生公式 `<f><![CDATA[A1]]></f>`，实际 `applyXlsxOpsOnHost` 跨表复制到 E5。实际候选 G6 发布 `<f>&lt;![CDATA[E5]]&gt;</f>`；移动发布 `<f>&lt;![CDATA['目标'!E5]]&gt;</f>`。XML 解析后的公式分别是字面 `<![CDATA[E5]]>` / `<![CDATA['目标'!E5]]>`，不是 E5 引用。候选返回 version5 和真实 touchedEntries；不是模型/宿主 mock 的伪成功。
- CDATA 内公式 `A1&"&amp;#49;"` 合法，CDATA 中的 `&` 与 `&amp;#49;` 均是字符数据。copy/move 当前将原始内部 XML 传给实体 decoder，抛“XML 实体无效”。同一问题使 move 对范围外 J10 的未改变 CDATA 公式也报错。
- 原因：对公式元素的 inner XML 直接实体解码，再平移并 escape；没有先区分普通 XML 字符数据、CDATA 与标记。普通 entity 文本只应解码一次，CDATA 内容不应 entity decode。
- 独立证据：`/tmp/mimir-r2a-independent-native-20261017.log` 提供原候选完整 XML；`/tmp/mimir-r2a-independent-final-red-20261017.log` 和最终 gate 提供精简语义差异及堆栈。
- 回归：独立文件 `:260` 的 copy/move 两例核真实解析后的正确公式；`:278` 两例核 CDATA 中原始 `&` 和貌似实体的字面文本；`:295` 一例核区外未改变公式逐字节保留。共 5 红。
- 首轮安全探针要求拒绝不可解释标记，捕获实际成功候选后，根据 root 指示加强为合法 CDATA 正确迁移断言；原始失败日志全部保留。最终要求成功生成正确公式，不能以通用拒绝、吞 CDATA 或放宽断言转绿。
- 算法缺陷按 reviewer 边界退原 owner；checker 不静默改 writer/公共解析边界。建议使用有界的公式字符数据读取，正确拼接普通文本与 CDATA；未改变公式保持原 XML，最后复核真实候选语义。root 应在 owner 修复后重新独立检查。

### 后续验收与文档（当前未覆盖）

- root 的真实浏览器复制/剪切、保存、native 下载、Undo/Redo、重开与 1280×800 / 420×500 验收尚未由本 checker 执行。现有 `/tmp/mimir-xlsx-range-structures-20261017.xlsx` 交 root，不由 checker 上传或删除。
- `.trellis/spec/shared/contract/xlsx-agent.md` 现有 `move_range` 仍将相交 merge/link 一律列为拒绝。root 约定在本片最终绿后统一更新为精确的完整包含迁移边界，并保留部分相交、CF/DV/批注/表格/透视/未知结构拒绝。
- 固定 Univer 特殊粘贴“格式”包含 merge；Mimir `copy_format` 是基础 scalar 格式刷。本片没有新增特殊粘贴值/公式/格式参数，不能据此宣称这一参数组全齐。R2b 的 CF/DV 规则迁移及批注原件关系链属于后续独立片。

## 已验证的通过边界

- 同/跨表 copy/move、同表重叠冻结快照、完整覆盖目的结构、关系部件新增/空前缀根扩展、rId 冲突与等 Target 复用。
- 新独立例核目的部分 hyperlink、重复链接、错误 leaf namespace、未知关系属性/CDATA leaf/混合内容、无效数值实体、相对/越界内部链接、未知扩展：copy/move 原子拒绝且输入字节不变。
- 私有 permit 必须是真实签发且绑定 entry、原 XML 和范围；伪造对象、原 XML 变动、范围变动均不能豁免 R1。实际 source/target 仍走 R1，而不是跳过整表结构检查。
- 外链 Target 与 tooltip 的嵌套实体文字保持单次解码；跨表遇原有 rId1 绘图关系分配 rId2，旧绘图关系/部件/所有未触及 entry 精确保留；touchedEntries 精确核对。
- 受保护源只读 copy、move 源/目的/依赖表保护、CF/DV/批注/表格/筛选/透视/未知结构守卫沿原测试未退化；实际迁移后依赖 DV 校验、关系读回、repeat byte/version/history no-op、真实 host 候选在 dispose 后禁止发布均保留通过。
- 另加显式 AbortSignal 于实际 host 已完成而尚未返回时取消：零发布、版本0、history0、dirtyfalse、changed callback 未调用；2000格预算仍拒绝 2004格结构源。

## Verification

全部为限定检查，不将这些输出拼成全仓 `pnpm check`。此前跨会话完整门仅覆盖其既定输入快照，不自动覆盖本独立新增测试或后续 owner 修复。

| 检查 | 精确结果 | 日志 |
| --- | --- | --- |
| Server：原 owner 9 文件加独立 check，共 10 文件 | **304 项：299 PASS / 5 FAIL；9 文件通过、1 文件失败；exit1** | `/tmp/mimir-r2a-independent-final-native-20261017.log` |
| 其中原 owner 9 文件 | **282/282 PASS**，无原断言删除 | 同上 |
| 独立 22 项 | **17 PASS / 5 FAIL**（均 CDATA 根因） | 同上及 `/tmp/mimir-r2a-independent-final-red-20261017.log` |
| Office：xlsx-clipboard / agent/xlsx-agent / XlsxEditor.clipboard | **3 文件 38/38 PASS，exit0** | `/tmp/mimir-r2a-independent-office-tests-20261017.log` |
| Server typecheck | **PASS，exit0** | `/tmp/mimir-r2a-independent-server-types-20261017.log` |
| Office typecheck | **PASS，exit0** | `/tmp/mimir-r2a-independent-office-types-20261017.log` |
| 8 TS 文件 scoped oxlint --deny-warnings | **PASS，exit0，零 warnings** | `/tmp/mimir-r2a-independent-lint-final-20261017.log` |
| 相同 8 文件 scoped oxfmt --check | **PASS，exit0** | `/tmp/mimir-r2a-independent-format-final-20261017.log` |
| tracked scope git diff --check | **PASS，exit0** | 工具输出；新增 test 同时经格式/lint 检查 |

Server 精确命令：

```sh
pnpm --filter @mimir/server exec vitest run src/test/xlsx-range-structures.check.test.ts src/test/xlsx-range-structures.test.ts src/test/xlsx-range-disjoint.test.ts src/test/xlsx-agent-range.test.ts src/test/xlsx-manual-ops.test.ts src/test/xlsx-range-styles.test.ts src/test/xlsx-validation-host.test.ts src/test/xlsx-rule-footprint.test.ts src/test/xlsx-agent-host.test.ts src/test/xlsx-agent-route.test.ts
```

static 8 文件：R2a 实现报告的 7 个 TS 文件，加新独立 check test。检查进程 8869（Server）、2845（Office）、95309（lint）、8283（format）、23555（Server types）、11375（Office types）均已观察到终态；无本 agent 的在跑测试或服务。

## 参考证据适用性

沿已固定并已读的 R2 计划及 R2a 实施边界：GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`、Univer0.25.1 的普通 clipboard merge 与外链/结构 journal 语义；WeKnora v0.8.3 commit `3e22822c1d2397be730c458c7539d0eb8c113a24` 的官方/公开源码缓存只适用 KB/Agent 能力门控。未重新联网、未以 WeKnora Markdown 编辑器解释 Office 范围语义。此次为代码/原生候选独立检查，不宣称竞品运行验证、Desktop 或真实供应商调用。

## CDATA 返工后的正式独立复查（仍未放行）

复查已读 owner 新增的字符数据读取/token 改写及四处接线，原独立 22 项（含此前 5 红）全部保留且转绿。没有通过拒绝合法 CDATA 降低要求。新增 8 项独立边界，当前独立共 30 项，**29 PASS / 1 FAIL**。

### 已确认修复的 R2a-F1

- 普通 XML 文本只实体解码一次；CDATA 中 `&` 与貌似实体的 `&amp;#49;` 为字面字符，不再二次解码。
- 真正的公式 token 扫描不会被 CDATA 中字面 `</f>`、注释内伪 `<f>`/`</f>` 提前结束。新增 copy/move 两项独立例将普通文本、注释、多段 CDATA 混合，核真实输出经 XML 解析后的公式文本，均通过。
- 原区外 CDATA 公式逐字节保持；owner 新增的未改变单元格/definedName/图表公式保真例通过，图表无多余 touchedEntry。
- 真子元素、未知 PI、普通文本中的 `]]>`、跨 CDATA 拼凑的不完整实体、注释内部 `--` 均被拒绝；独立用真实 current handle 核零字节/版本/history/dirty 发布。

### R2a-F2：非法注释尾部 `-` 仍被真实句柄发布（阻止放行）

- `readFormulaCharacterData` 目前检查 `comment.includes('--')`，但遗漏 XML 注释内容不能以 `-` 结束。`<f>A1<!-- invalid---></f>` 的注释正文是 ` invalid-`，属于非法 XML；既有 fast-xml-parser 的 XMLValidator 对此宽松接受。
- 新独立回归 `xlsx-range-structures.check.test.ts:328` 参数项，真实 `handle.execute('propose_operations', ...)` 返回 `{ok:true,changed:true,version:1}`、9 个 changedCells 和原生 sheet/rels/workbook touchedEntries，未拒绝。不是仅对私有函数做假调用。
- `/tmp/mimir-r2a-cdata-independent-boundaries-20261017.log`：30 项中 29 PASS / 1 FAIL。最终限定门仍重现相同失败。原有全部正确 CDATA 断言未删改，新增边界均保留。
- 此为 XML 词法校验缺口，按 root 要求退原 owner；checker 未改生产算法。owner 应在真实原生扫描接缝核完整 comment 合法性，避免只依赖宽松验证器；本次已证实的失败位置是公式内部，未将其他位置的推断写为已证实发现。

### 并行 E1S 尚未完成的接缝导致门额外未通过（未改他人文件）

- 本次相关检查期间 E1S owner 正在其他 server 模块实施。`apps/server/src/services/extract.ts:3` 新 import `@mimir/office/encryption-envelope` 尚无法解析：Server tsc TS2307，`xlsx-agent-route.test.ts` 在 collect 阶段报同一 module missing，导致该 3 项未执行。
- 这不是 R2a-F2 的成因；不擅自补导出、不回退 E1S 文件。已把真实日志通知 root 与 `/root/docx_encryption_server_e1s`。等该接缝完成后应重跑相应门，不能把未执行项算作 PASS。

### 本次 Verification

| 检查 | 精确结果 | 日志 |
| --- | --- | --- |
| 10 Server 文件同原正式命令 | **314 项：313 PASS / 1 FAIL；8 文件通过，check test 失败，route collect 失败；exit1** | `/tmp/mimir-r2a-cdata-independent-final-native-20261017.log` |
| 独立 30 项（单独及最终门一致） | **29 PASS / 1 FAIL；原22全绿** | `/tmp/mimir-r2a-cdata-independent-boundaries-20261017.log` |
| Office 原 3 文件 | **38/38 PASS，exit0** | `/tmp/mimir-r2a-cdata-independent-office-20261017.log` |
| Server typecheck | **FAIL，exit1：extract.ts TS2307，E1S 接缝未完成** | `/tmp/mimir-r2a-cdata-independent-server-types-20261017.log` |
| Office typecheck | **PASS，exit0** | `/tmp/mimir-r2a-cdata-independent-office-types-20261017.log` |
| 原8 TS scoped oxlint --deny-warnings | **PASS，exit0，零 warnings** | `/tmp/mimir-r2a-cdata-independent-lint-20261017.log` |
| 同8 TS scoped oxfmt --check | **PASS，exit0** | `/tmp/mimir-r2a-cdata-independent-format-20261017.log` |
| tracked scope git diff --check | **PASS，exit0** | 工具直接输出 |

本次 Server/Office/test/types/static 所有进程（96114、24865、84900、78355、46114、65082，以及单独检查61209）均已观察到 exit 终态。Server 测试锁已明确释放并分别通知 root 与 E1S，无本 checker 的在跑进程。

仍保持 R2a 普通完全包含 merge/link 与 R2b CF/DV/批注迁移的边界；Mimir 基础格式刷与 Univer 特殊格式粘贴（含 merge）没有混为一谈。浏览器/重开验收和正式契约同步仍交 root，本次不跑全仓门、build 或浏览器，也不宣称全部工具完成。

## F2 返工后的最终正式独立复查（R2a 通过）

### Findings (fixed)

- **R2a-F1：已修并保留全部原失败断言。** 普通字符数据实体仅解码一次；CDATA 的字面 `&` / `&amp;#49;`、混合普通文本、多段 CDATA、字面 `</f>` 及注释伪结束均按真实 XML 字符数据处理；实际迁移成功且公式文本正确，未改变公式原 XML 逐字节保留。原独立 30 项均完整保留并通过。
- **R2a-F2：已修。** `xlsxRangeXmlTokens` 在 token 被忽略或 leaf/container 去注释之前，核闭合分隔符、内部 `--`、结尾 `-`；structures tree、formula rewrite 与 R1 `xlsx-range-features` tree 使用同一真实接缝。故不是仅在按钮或单个公式路径补拦截。非法注释原独立 live-handle 回归已转绿。
- owner 新增的 merge/link/relationship 的 leaf/container 六项回归均真实核 copy/move 零字节/版本/history/dirty/callback 发布；另两项核合法注释与 CDATA 内类似非法注释的字面文本保真，均通过。新 scanner 先识别完整 CDATA/标签 token，未将这些内部文字误识别为真正 XML 注释。
- 此次 checker 没有修改生产代码、测试或新增可选测试；只独立读实现并重跑既定精确门。
- 上轮 E1S 未完成 export 所致 TS2307/route collect 失败现已消除，route 实际执行通过；未回退或修改 E1S 文件。

### Findings (not fixed) / 放行边界

- **本轮无剩余已证实的 R2a 算法缺陷。** 正式放行普通、无筛选、单矩形、完全包含标准 merge/hyperlink 的 copy/move 代码片，连同原件/关系/保护/预算/取消/history/no-op 的既定合同。
- 真实浏览器保存、下载读回、Undo/Redo、重开和 1280×800 / 420×500 仍由 root 验收。本轮没有浏览器、Desktop 或模型供应商验证。
- 浏览器来源以 root 文档 `yrnzwOGIwuPxHSAK` 与固定 `/tmp/mimir-xlsx-range-browser-baseline-20261017.xlsx` 为准，上传时 SHA256 `ea5e043464994801199306d908c32ddf4bdd64f7b850db44ef7d86ce2b6c3cd5`。测试可能重生成另一 `/tmp` fixture，不能用其后来的 ZIP 时间戳 SHA 覆盖 root baseline；本 checker 未覆盖该 baseline。
- R2b 的 CF/DV/批注迁移未由 R2a 实现或证明；部分相交、筛选/填充及表格/透视/未知结构的保真拒绝继续保留。Mimir `copy_format` 基础 scalar 格式刷不等于固定 Univer 含 merge 的特殊格式粘贴；特殊粘贴参数组仍待补，不能宣称全部工具完成。
- root 按原交接统一同步现行共享契约中的 merge/link 精确允许范围；checker 不与其并发改规范。

### Verification（本次实际执行，全部 exit0）

| 检查 | 精确结果 | 日志 |
| --- | --- | --- |
| 同一精确 10 Server 文件 | **325/325 PASS，10 文件通过**；包括 owner51与独立30 | `/tmp/mimir-r2a-comment-independent-native-20261017.log` |
| 同 3 Office 文件 | **38/38 PASS** | `/tmp/mimir-r2a-comment-independent-office-20261017.log` |
| Server typecheck | **PASS** | `/tmp/mimir-r2a-comment-independent-server-types-20261017.log` |
| Office typecheck | **PASS** | `/tmp/mimir-r2a-comment-independent-office-types-20261017.log` |
| 同8 TS oxlint --deny-warnings | **PASS，零 warnings** | `/tmp/mimir-r2a-comment-independent-lint-20261017.log` |
| 同8 TS oxfmt --check | **PASS** | `/tmp/mimir-r2a-comment-independent-format-20261017.log` |
| tracked scope git diff --check | **PASS** | 工具直接输出 |

Server 原精确命令及 static 8 文件清单同前，没有放宽或跳过测试。此为 scoped 复查，不冒充全仓 `pnpm check` 或 root 的新 build/browser。

先收到 E1S 明确通知其六文件 SQLite 进程 76/76、全部退出并让锁后，才启动本次 Server10文件；21.75秒后已观察进程56646 exit0，并立即明确归锁给 `/root/docx_encryption_server_e1s` 供其真实 PG 六文件测试。Office68963、Server types9624、Office types13998、lint9893、format73556均已观察 exit0；无本 checker 在跑进程，Server测试锁已归还，已通知 root。生产继续冻结供 root 浏览器；未 build、未上传/删除/暂存/提交/归档。
