# XLSX R2a 实施与限定自查

2026-10-17，`xlsx_range_structure_r2a` implement owner。实现已冻结，交 root 正式独立检查；不据此标记整体工具补全完成。Server 测试进程锁已释放，没有本 agent 的在跑服务/测试。

## 范围与证据

依据 `xlsx-range-structure-migration-plan-20261017.md` 与 `xlsx-range-r2a-boundary-20261017.md`：只补普通、无筛选、单矩形 `copy_range` 与本地 `move_range` 的完全包含合并/超链接迁移。保留 R1 对 CF/DV、批注/VML、表格、筛选、透视及未知扩展的守卫，不进入 R2b。

固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` / 实际 Univer 0.25.1 复制与 CUT 证据沿原计划，缓存目录 `/tmp/mimir-univer-r2-review-20261017`。WeKnora 沿本日已固定官网/公开源缓存 v0.8.3、commit `3e22822c1d2397be730c458c7539d0eb8c113a24`；适用 KB/Agent 门控，Office 结构语义由 GenOffice/Office 决定。没有声称本片重新联网。

**特殊格式语义没有混淆：** 固定 Univer 特殊粘贴“格式”确实包含 merge；Mimir 现有 `copy_format` 是已证明仅基础样式的格式刷，不等于该特殊粘贴。本片不改变格式刷、不增加公开 DSL 参数。现有 `copy_range` 没有值/公式/格式特殊粘贴参数；不能将本片说成特殊粘贴全参数对齐。`fill_range`、筛选复制仍拒绝相交合并/链接；外部仅显示值导入路径没有获得结构迁移许可。

## 文件清单

- 新 `apps/server/src/services/xlsx-range-structures.ts`：有界原生 XML offset/namespace/属性读取、完整包含资格、冻结结构规划、源/目的补丁、外链关系分配与实际候选读回、私有源绑定 permit、单次实体解码。
- `apps/server/src/services/xlsx-range-features.ts`：只识别上述 helper 实际签发、绑定 entry/XML/范围的 permit；只豁免已规划 merge/hyperlink 相交，其他 R1 原生结构仍检查。命名空间 scope 改 null-prototype，支持合法 `__proto__` 前缀且不继承对象成员。该文件原本即为本任务其他片的未提交文件，本片没有覆盖其其余 R1 行为。
- `apps/server/src/services/xlsx-agent-range.ts`：普通无筛选 copy 接入结构规划，合并单元格与关系部件 overlay/added inventory，原生候选确实无变更时保留原字节/版本/空 mutation inventory；复制公式使用私有单次解码。
- `apps/server/src/services/xlsx-manual-ops.ts`：同/跨表 move 接入冻结结构；同表重叠一次 source-clear + target-write；新关系 part 的 addedEntries；受影响公式单次实体解码、未改变的命名/图表公式不再无故规范化。保留现有公式引用迁移算法与 CF/DV footprint 门控。
- 新 `apps/server/src/test/xlsx-range-structures.test.ts`：38 个实际 native/host/current-handle 回归，另生成 `/tmp` 可读浏览器夹具。
- `apps/server/src/test/xlsx-range-disjoint.test.ts`：原完整包含 merge/link 的拒绝预期调整为迁移；其余 feature、partial/非法 namespace/protection 守卫保持。
- `apps/server/src/test/xlsx-agent-range.test.ts`：旧完整合并拒绝样本改成真实部分相交样本，不删除拒绝断言。

未编辑 Office UI/Editor、shared 公开 DSL、S 排序内核、vendor、共享 spec；没有 stage/commit/archive/删除夹具。

## 原生行为

1. 真实 namespace 读取，单双引号及合法前缀可识别；ref 必须是有界标准矩形。合并/链接容器 count、未知 attrs/children/text/extensions、重复或重叠锚点、关系异常均拒绝。XML 按 4MiB/200000 节点/64 深度校验，结构数 20000，交叉检测最多 200000 次；沿宿主既有 2000 格与 ZIP/已存格预算。
2. 源/目的只允许完整包含。copy 保留源；move 源结构移除后迁往目标，重叠同表使用冻结源快照。目的完全包含的旧 merge/link 被覆盖；任一部分相交原子拒绝。普通无结构源也可完整覆盖目的 merge/link，不删除区外结构。
3. 外部链接仅标准 External http/https/mailto 关系，不发网络；同表复用原关系，跨表优先复用相同真实 Target 的合法现有关系，否则分配不冲突 rId。多个源 rId 指向同 Target 时一次规划内也稳定复用，避免下一次复制无谓改 ID。保持合法未引用旧关系，绝不删整 rels。
4. 内部 location 仅支持工作表限定固定 A1 位置（含引号/绝对标记/矩形），原目标不随复制/移动平移。无表限定位置、名称与其他歧义形式明确拒绝。本片不承诺相对内部链接或任意目标语义。
5. 在原始 XML offset 上只移除指定 feature 节点、更新真实 count、插入标准节点；未覆盖节点及无关 ZIP 部件逐字节保留。补丁后重读实际结构与实际关系身份；source/target sheet 及实际关系 part 精确加入 touchedEntries，gateway 原有 calcChain/calcPr 协议保留。
6. 保护源可用于 copy 只读；move 源与目的均复核原生保护，被修改引用表仍复核。raw cell、类型、缓存、rich run、公式与继承样式沿原范围实现；单次解码避免 XML 实体嵌套文本被二次解释。
7. 最终 host 的数据验证不绕过：带 merge/link 的 move 引发区外依赖公式变化时，仍按实际输出规则/缓存验证；无效结果零发布/dirty/history，合法结果保留规则原文。没有迁移 CF/DV 规则。
8. 当前活 handle 一次操作一次完整字节历史；currentBytes/markSaved/重开/undo/redo 精确恢复。相同实际 native 输出的重复同/跨表 copy 保持原字节、版本、空 mutation inventory、dirty 和历史。已经生成的真实 host 候选在 handle dispose 后不能发布。

## 先红后绿

- 首轮新 22 例：8 红，证明原 R1 不允许完整 merge/link；`/tmp/mimir-r2a-red-20261017.log`。
- 恢复后新必要边界测试捕获 4 个真实红项并保留回归：跨表重复分配 rId 导致多余历史；R1 普通对象 scope 误拒合法 `__proto__` 前缀；count 替换误匹配 `xmlns:count`；CDATA 可混入应为空的原生 leaf。`/tmp/mimir-r2a-resume-red-20261017.log`。
- 末次补查捕获不同源 rId 指向同 Target 的复制稳定性问题，已在一次规划内登记新分配关系解决；迟到候选实际零发布通过（先前仅错误文案断言遗漏“取消”，已按真实文案保留断言）。`/tmp/mimir-r2a-final-two-red-20261017.log`。
- 以上红例全部在最终 gate 中转绿。

## 精确检查

全部为本片当前树上的限定检查，不拼成全仓 gate，不重跑已知全仓 `pnpm check`。

- `pnpm --filter @mimir/server exec vitest run src/test/xlsx-range-structures.test.ts src/test/xlsx-range-disjoint.test.ts src/test/xlsx-agent-range.test.ts src/test/xlsx-manual-ops.test.ts src/test/xlsx-range-styles.test.ts src/test/xlsx-validation-host.test.ts src/test/xlsx-rule-footprint.test.ts src/test/xlsx-agent-host.test.ts src/test/xlsx-agent-route.test.ts`：**9 文件 282/282 PASS，exit0**，`/tmp/mimir-r2a-final-native-20261017.log`。Server 进程串行，未与其他 Server suite 并跑。
- `pnpm --filter @mimir/office exec vitest run src/xlsx-clipboard.test.ts src/agent/xlsx-agent.test.ts src/editors/XlsxEditor.clipboard.test.tsx`：**3 文件 38/38 PASS，exit0**，`/tmp/mimir-r2a-final-office-tests-20261017.log`。
- `pnpm --filter @mimir/server typecheck`：exit0，`/tmp/mimir-r2a-final-server-types-20261017.log`。
- `pnpm --filter @mimir/office typecheck`：exit0，`/tmp/mimir-r2a-final-office-types-20261017.log`。
- `pnpm exec oxlint --deny-warnings` 上述 7 个 TS 文件：**exit0，0 warnings**，`/tmp/mimir-r2a-final-lint-20261017.log`。
- `pnpm exec oxfmt --check` 同 7 文件：exit0，`/tmp/mimir-r2a-final-format-20261017.log`。
- tracked scope `git diff --check`：exit0。新增文件亦经 oxfmt/oxlint 检查。

## 浏览器夹具与交接

`/tmp/mimir-xlsx-range-structures-20261017.xlsx`，初次生成快照 SHA256 `b5c1f54457d6f7e1d839e68c07d018df760dd8c30c391be6b01ad22273eb01bb`。该 `/tmp` 文件会由测试重新生成，ZIP 时间戳可能改变 SHA；旧 SHA 不能作为当前上传件身份。初次交接时未由 owner 上传或删除。root 随后实际上传文档 `yrnzwOGIwuPxHSAK`，并固定 `/tmp/mimir-xlsx-range-browser-baseline-20261017.xlsx`，上传当时两者 SHA 均为 `ea5e043464994801199306d908c32ddf4bdd64f7b850db44ef7d86ce2b6c3cd5`；后续浏览器验收以该独立 baseline 为准，本 owner 不覆盖它。

- 两表“数据”“目标”；普通无筛选来源 `数据!A1:C3`。
- 来源 `A1:B1` 合并，A2 外部链接 `https://example.com/source?x=1&y=2`，B2 内部位置 `'目标'!$A$1`，C2 公式、C3 多 run 富文本。
- 目的 `目标!E5`：覆盖现有 `E5:F5` 合并与 E6 外链，保留 J10 的旧关系链接；源/目的原 rId1 的 Target 不同，用于实际验证 rId 冲突隔离。
- 期待结果：合并 `E5:F5`、外链 E6、新内部链接 F6、公式 G6、富文本 G7，J10 与其 `keep` Target 保留；copy 保源、cut 清源。
- 同表重叠 move 可选 `数据!A1:C3 → B2`，结果合并 B2:C2、链接 B3/C3，冻结原富文本到 D4。

root 后续：独立 check；按新构建实际浏览器 1280×800 与 420×500 做普通复制/剪切→保存→native下载读回→undo/save→redo/save→重开。这里的 current-handle/route 测试不冒充真实浏览器/真实知识库保存。用户自行负责 Desktop；本片未验桌面/模型供应商。

共享契约由 root 统一更新：将现行 `move_range`/范围复制中“合并/链接相交均拒绝”改成“普通完全包含标准 merge/hyperlink 可迁移，部分相交、筛选/填充、CF/DV/批注/表格/透视及未知结构仍拒绝”，并保留上述特殊格式刷与特殊粘贴差异，不宣称全部 Excel 范围结构已齐。

## 正式检查退回后的 CDATA 修复与重新冻结

原 checker 的 `xlsx-range-structure-r2a-check-20261017.md` 记录 **304 项中 299 PASS / 5 FAIL**，全部失败由合法 CDATA 公式被当作 inner XML 实体解码造成。该失败历史保留，独立检查文件及全部 5 个正确迁移断言均未修改或删除。

本次仅修复私有 `xlsx-range-structures.ts` 与 `xlsx-agent-range.ts` / `xlsx-manual-ops.ts` 的四处公式接线，并在 owner 原生测试补回归；没有改公开 DSL、vendor、排序、UI 或共享 spec。新增有界公式元素 token 改写与字符数据读取：普通文本单次实体解码、CDATA 原样字符拼接、XML 换行规范化；CDATA 内貌似实体的文字不参与解码。真正的嵌套子元素拒绝，CDATA 内字面 `</f>` 不当作真实结束标记。语义未改变时保留整个公式元素原字节，改变时仅把语义结果转义写回。

新增 **5 项**实际 host 回归：copy/move 的混合普通文本与 CDATA（包含字面 `</f>`）；移动时未改变的单元格、definedName 与图表 CDATA 精确保留且无多余 chart touchedEntry；两种真正嵌套子元素在 copy/move 中原子拒绝、输入字节不变。原 owner 38 项现在为 43 项；原独立 22 项仍全部保留。

本次最终限定检查（不是全仓 gate）：

| 检查 | 结果 | 日志 |
| --- | --- | --- |
| 原 9 Server 文件 + 独立 check，共 10 文件 | **309/309 PASS，exit0** | `/tmp/mimir-r2a-cdata-final-native-20261017.log` |
| Office xlsx-clipboard / agent/xlsx-agent / XlsxEditor.clipboard | **3 文件 38/38 PASS，exit0** | `/tmp/mimir-r2a-cdata-final-office-20261017.log` |
| Server typecheck | **exit0** | `/tmp/mimir-r2a-cdata-final-server-types-20261017.log` |
| Office typecheck | **exit0** | `/tmp/mimir-r2a-cdata-final-office-types-20261017.log` |
| 原 7 TS 文件 + 独立 check 的 oxlint --deny-warnings | **exit0，零 warnings** | `/tmp/mimir-r2a-cdata-final-lint-20261017.log` |
| 同 8 TS 的 oxfmt --check | **exit0** | `/tmp/mimir-r2a-cdata-final-format-20261017.log` |

生产及测试重新冻结，Server 测试锁已释放给 root，所有本 owner 的测试/类型/static 进程均已观察到 exit0。请求原 checker 复核修复；真实浏览器复制/剪切、保存、原生下载与 Undo/Redo/重开仍交 root。此前报告中的 282 项绿只代表当时快照，不覆盖后来独立发现；当前 309 项绿亦不冒充独立重新放行或浏览器验收。无上传/删除/暂存/提交/归档动作。

## 第二次正式退回：XML 注释词法修复

原 checker 复查保留此前全部断言，新增 8 项后独立共 30 项，发现 `<f>A1<!-- invalid---></f>` 被实际 current handle 发布；其余 29 项通过。原生 XML 注释正文除了不能含 `--`，也不能以 `-` 结束；宽松 XMLValidator 未挡住后一条件。本 owner 保留全部独立 30 项及零发布拒绝断言，没有修改 checker 文件或其报告。

修复覆盖实际共用原生扫描接缝：在私有 `xlsx-range-structures.ts` 提取 `xlsxRangeXmlTokens`，真实 comment token 在被语义 parser、公式读取或 leaf/container 的空白检查忽略之前，统一验证完整且不重叠的开闭分隔符、正文不含 `--`、正文不以 `-` 结束。structures 原生树、公式改写及 `xlsx-range-features.ts` 原生树扫描共用它；CDATA 与完整标签属性内的貌似注释文字仍由各自 token 承载，不被错误解释成注释。本次新增修改仅这两份生产文件，不改 S、vendor、公开 DSL 或 UI。

owner 原生测试新增 8 项，现为 **51 项**：merge/hyperlink 的 leaf 与 container、relationship 的 leaf 与 container 各 1 项，每项都通过真实 handle 验 copy/move 拒绝且原字节、version0、history0、dirtyfalse 与回调零发布；另 2 项验 copy/move 正确处理各处合法注释，区外合法注释及 CDATA 中的非法注释样貌逐字节保持、源 rels 原文不变。原独立 30 项完整保留并转绿。

最终限定检查：

| 检查 | 结果 | 日志 |
| --- | --- | --- |
| 同 10 Server 文件（含独立 30 项与 owner 51 项） | **325/325 PASS，exit0** | `/tmp/mimir-r2a-comment-final-native-20261017.log` |
| 同 3 Office 文件 | **38/38 PASS，exit0** | `/tmp/mimir-r2a-comment-final-office-20261017.log` |
| Server typecheck | **exit0** | `/tmp/mimir-r2a-comment-final-server-types-20261017.log` |
| Office typecheck 最终重跑 | **exit0** | `/tmp/mimir-r2a-comment-final-office-types-retry-20261017.log` |
| 同 8 TS scoped oxlint --deny-warnings | **exit0，零 warnings** | `/tmp/mimir-r2a-comment-final-lint-20261017.log` |
| 同 8 TS scoped oxfmt --check | **exit0** | `/tmp/mimir-r2a-comment-final-format-20261017.log` |
| tracked scope git diff --check | **exit0** | 工具直接输出 |

Office typecheck 首轮确实失败：并行 E1U checker 新增测试的 `extraRoot` 和两个 `this` 类型诊断，见 `/tmp/mimir-r2a-comment-final-office-types-20261017.log`；已通知该 owner，由其自行修复后本 owner 实际重跑通过，未回滚或修改他人文件。此前 E1S 缺失导出已解决，本轮 Server route 全部实际执行，未把 collect 失败项算 PASS。

本 owner 先与 E1S 协商测试窗口，收到其进程退出并明确让锁后，才独占启动本次 10 文件 Server 测试；16.61 秒后观察到 exit0，已明确把锁释放回 E1S 并通知 root。全部本 owner 检查进程已终态，没有后台服务。生产/测试再次冻结，请原 checker 正式复核；root 浏览器仍待最终放行。本 owner 无上传、删除、暂存、提交或归档，不覆盖 root 固定浏览器 baseline。
