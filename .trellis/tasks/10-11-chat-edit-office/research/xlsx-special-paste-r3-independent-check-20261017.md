# XLSX R3 选择性粘贴独立检查

2026-10-17。checker `/root/r3_bullets_independent_check`。**本片代码与定向独立检查 PASS；不替代 root 的生产浏览器、最终全仓质量门或全部编辑器完成证明。**

## 依据与冻结范围

已按原生 check 上下文读取 task artifacts、项目规则/质量门、Office engine/editors、Server tests、shared XLSX R3 合同及本片 plan/implementation。主参照固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 和计划核定的 Univer0.25.1。WeKnora缓存 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`，site SHA `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`，definitions SHA `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`：适用于KB/Agent能力门控，不能决定Office原生特殊粘贴语义。本轮未重新HTTP访问或声称最新版本。

9个生产文件逐一核对 owner `/tmp/mimir-r3-production-freeze-20261017.sha256`，检查前后均 exact；日志 `/tmp/mimir-r3-independent-freeze-check-20261017.log`。生产 SHA：

```text
f0681ab8265ad8d1565f5847d3cd6cc77d0a180aa0120a928997b09e6a35de37  packages/shared/src/xlsx-agent.ts
74ed070a99fe972f8350628aeb831d648807a0d77d7f159d88084d316e0ca835  apps/server/src/services/xlsx-special-paste.ts
0e1f1377514d72bccbe49d69547ab34e653cb7454fa4584c48443aaf0ec42638  apps/server/src/services/xlsx-special-paste-host.ts
f4f7f7f212e6cb073e133010f4a2a44266b29bbcaf694e8fe1b78874208f167b  apps/server/src/services/xlsx-range-rules.ts
c733f1740c81f7a96cd455bc4de3dc39adc4439d30d873e203f3fb032e312647  apps/server/src/services/xlsx-range-structures.ts
bfc7467fcc26cdc3393cdaa9aee42a5478998f32475c98b1ad815f2a79d04a9e  apps/server/src/services/xlsx-manual-ops.ts
ec9e6345f07cc6ae549bb5cf87856bcbe396f0b108c8cce1cbbc8fddc4616eff  apps/server/src/services/xlsx-agent-host.ts
5a3326e84bc4d268d5814fb5bfc16d3ab4751baa59d206443978faabea7570bd  packages/office/src/xlsx-clipboard.ts
408e553f130946b751919300d7c538c9f1c088b58fd01305e8974e3c9ef44bb1  packages/office/src/editors/XlsxClipboardControls.tsx
```

## Findings (fixed)

- File: `apps/server/src/test/xlsx-special-paste.check.test.ts`（独立 checker 新增）
- Issue: owner 的真实宿主平铺测试主要使用 expression CF；需直接证明统计型 CF 的共同统计域不会按 tile 拆成4条规则。
- Fix: 新增3个自包含真实原生XML测试，all/format/besides-border 使用 aboveAverage，直接读取候选确认1个规则/4段sqref；all/besides同时保持1个DV身份和4段sqref，format不迁移DV，源XML无替换。独立期望为字面地址，不由 planner 的位移函数构造。

未发现生产缺陷，未改生产代码或原有测试断言。新增测试 SHA `b24bd4369fae2e4efbe5d166bb763634f50f38f7d9458260a22b1813e1ca0817`。

## 核对结论

1. strict 私有 schema 与六 mode、完整A1矩形/边界/2000格、单格展开/整数倍平铺一致；特殊CUT先拒绝并准确“请先复制”，all CUT复用真实move。没有扩充固定公开Agent DSL。
2. host冻结source/target原生cells/styles/规则，再一次规划所有tile，一次 assembler候选；私有permit绑定原XML/entry/矩形，HTTP不能伪造。source protected可跨表只读复制，actual target与同表写继续拒绝保护，没有解锁原件。
3. value使用真实缓存和类型；缺公式cache拒绝。rich/共享文字在非公式目标的value保留，替换formula目标和formula模式按官方hook降plain；format保留目标正文。besides-border保留目标applyBorder=false时的cellStyleXfs有效边框，仅追加必要xf，原style/theme/runs保留。
4. CF/DV按源规则身份合并全部tile，多sqref保留同一统计域和验证身份；mode白名单准确。完整最终候选DV包含未变值/空目标和依赖域，不通过showErrorMessage=false豁免未知cache。R2a原生merge/link、R2b差集/引用/取消/原子性回归保留。
5. 列宽按源列周期复用；官方88px默认转换为83/7原生字符单位；零/固定默认不重置目标，实际自定义default可复制。目标hidden和其他列属性保持，不把col跨度扩展为逐格扫描，预算明确。
6. controller mode/selectInternal仅准备；pending冻结mode；陌生/过期marker继续拒绝，不因value而降级。Inspector只有固定footer粘贴主动作，沿现有320px内部滚动；Escape尊重子弹层处理，再关闭并回可见入口。真实Editor/host测试覆盖一次history、保存及整bytes Undo/Redo。
7. 共享XLSX与Office editors契约已同步，没有新增另一份规范的必要。没有改vendor、依赖、其他owner生产文件或任何提交/暂存/归档/删除。

## Verification

所有下列命令均直接使用对应包现有 `node_modules/.bin`，exit0：

| Gate | 实际结果 | 日志 |
| --- | --- | --- |
| Server R3/R2a/R2b/native/host/validation/sort/pivot | 18 files / 534 passed / 0 failed | `/tmp/mimir-r3-independent-server-20261017.log` |
| 新增独立aboveAverage统计域 | 1 file / 3 passed | `/tmp/mimir-r3-independent-stats-20261017.log` |
| 保留原R2b路由 | 2 files / 4 passed，exit0 | `/tmp/mimir-r3-independent-retained-routes-20261017.log` |
| Office clipboard/真实Editor/agent/manual/rules/DV/sort | 8 files / 79 passed | `/tmp/mimir-r3-independent-office-final-20261017.log` |
| 保留原透视/编辑器回归 | 4 files / 44 passed | `/tmp/mimir-r3-independent-office-retained-20261017.log` |
| Office TypeCheck | PASS | `/tmp/mimir-r3-independent-office-types-20261017.log` |
| Server TypeCheck（含新增checker测试） | PASS | `/tmp/mimir-r3-independent-server-types-final-20261017.log` |
| Shared TypeCheck | PASS | `/tmp/mimir-r3-independent-shared-types-20261017.log` |
| 13原片文件 oxlint/oxfmt | PASS | `/tmp/mimir-r3-independent-{lint,format}-20261017.log` |
| 新增checker测试 oxlint/oxfmt | PASS | `/tmp/mimir-r3-independent-new-{lint,format}-20261017.log` |
| scoped diff check | PASS | `/tmp/mimir-r3-independent-diff-20261017.log` |

18 Server文件：xlsx-special-paste、xlsx-special-paste-host、xlsx-range-structures、xlsx-range-structures.check、xlsx-range-rules、xlsx-range-rules-host、xlsx-range-rules.check、xlsx-range-disjoint、xlsx-manual-ops、xlsx-agent-host、xlsx-agent-range、xlsx-range-styles、xlsx-rule-footprint、xlsx-validation-host、xlsx-multilevel-sort、xlsx-agent-pivots、xlsx-pivot-layout-edit、xlsx-pivot-grouping-refresh（均src/test/*.test.ts）。保留路由为xlsx-validation-route/xlsx-agent-route。Office8文件：xlsx-clipboard、editors/XlsxEditor.clipboard、agent/xlsx-agent、xlsx-manual、xlsx-range-rule-reading、xlsx-validation-list、editors/XlsxEditor.validation、editors/XlsxEditor.sort；追加editors/XlsxEditor.pivot、editors/xlsx-pivot-controls、editors/XlsxPivotControls、xlsx-edit。

最初误用根目录不存在的vitest路径 exit127，随后使用正确包路径；第一次猜测Office路径仅匹配4files45tests，已以明确存在的8file/追加4file完成，不将首轮误匹配数当完整回归。18file534与owner18file516的选择不同，均以实际命令/文件数为准，不拼接成一轮全套结果。

## Findings (not fixed)

无未修复生产缺陷。root尚须新生产build、1280×800/420×500浏览器逐模式/平铺/原生下载/history/reload和最终原样pnpm check；本 checker未做这些。复杂或未知规则/公式、部分merge、外部OS完整兼容仍按现行明确拒绝边界，不能宣称Excel全语义覆盖。没有Desktop或真实模型/provider/Excel客户端实测。本轮仍in_progress。

测试会依owner既有测试重新生成 `/tmp/mimir-xlsx-special-paste-r3-20261017.xlsx`；root固定baseline `/tmp/mimir-xlsx-special-paste-r3-browser-baseline-20261017.xlsx` 未修改，验收SHA仍以root冻结文件为准。

最终补记：原R2b两路由已独立4/4绿；所有本checker测试/类型/静态进程已退出。生产9文件最终SHA仍全部exact，固定浏览器baseline SHA `70bc9cd759cfb02b0937ab7c6bc88b604cb88f3adf4667e0c1e7ab1111fffbea` 未变。Server runner已释放。
