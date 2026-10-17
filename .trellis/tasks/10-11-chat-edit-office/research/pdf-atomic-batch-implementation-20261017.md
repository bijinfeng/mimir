# PDF 原子 apply_ops 实施交接

日期：2026-10-17。按 root 批准的 [实施计划](./pdf-atomic-annotation-batch-plan-20261017.md)（含接续细化）完成本片，生产文件已冻结，等待主会话独立检查。本报告不代表整个 Office 任务完成。

## 已落地行为

- 严格1–30项 apply_ops：已有 page/form/metadata 加 removeMarkup、setNoteContents、removeTextInsert；未知键、错误类型、空文字、缺失/重复消费身份拒绝。接受实际 NM/legacy R 批注与当前 T；没有伪造 P 层。
- 先从冻结 pending 数组删除本批所有指定 T。无页面操作：在 raw pending.base 执行 native 子批次，再按真实 PDF.js viewport 一次重放幸存 T；原 ID、坐标与修改后 raw base 保留。后续 move/edit/delete 幸存 T 不丢批注或 metadata。
- 有页面操作：用原实际 Rotate/CropBox viewport 先重建幸存 T，再按声明顺序执行 native 子批次；最终 T 物化失效，既有提示区与工具数据如实说明。dry_run 提示使用将来时。
- native 批次只加载一个 detached pdf-lib 图，按当前页序依次处理表单、metadata、批注和页面；保留现有页面绘图变换、目录映射及不可达对象清理。表单预检/字体准备和批注 mutation/readback局部提取复用，不循环调用自行序列化的公开入口。
- 批注页归属改用 currentPdfPages：实测 pdf-lib getPages 在删除/重排后缓存陈旧；删除页后再改其批注须失败，先改再删成功。连续修改同一便笺按最终值读回；删除页不要求已消失便笺仍存在。
- preserving 仅显式用于 native batch mutation。默认批注与 PDFium 原文/插字 guard 不放宽；签名、未知 Catalog、活动动作、XFA、Widget页删除等既有拒绝保留。无身份账本的 legacy R+pending 明确拒绝并提示保存重读；无 pending legacy 继续支持。
- 纯候选 helper 不写 React/存储/history；冻结 handle/document/source/snapshot/version/pending/layout/保存基线与token，异步后核对；最终独立页结构/几何/批注/表单读回完成后一次同步发布。一次版本/round/dirty；dryrun和失败无部分发布。删尽T且无native变化直接回原 raw base引用，可恢复 clean。
- 复用现有保存、整轮回退与手动history；保存/撤销/重做逐字节验证。批次后手动改稿阻止旧 round 回退；保存中、取消、外部改稿、切文档均不落迟到结果。
- 保留无pending的原纯页面fallback及专用forms路径，避免改变既有轻量页面与表单迟到取消语义。不增加手动面板、宿主wire字段、DB或环境配置。

## 本片文件

| 范围 | 文件 |
| --- | --- |
| shared | packages/shared/src/pdf-agent.ts（批次schema/types，已有index星导出） |
| server | services/pdf-agent-catalog.ts、pdf-annotations.ts、pdf-forms.ts、pdf-local.ts |
| Office | agent/pdf-agent.ts、agent/pdf-batch.ts（新）；editors/PdfEditor.tsx 的批次分发/候选发布与复用重放接缝 |
| native/HTTP/catalog测试 | apps/server/src/test/pdf-atomic-batch-fixture.ts、pdf-atomic-batch.test.ts（新）、pdf-local-route.test.ts、pdf-agent-catalog.test.ts |
| candidate/Editor测试 | packages/office/src/agent/pdf-batch.test.ts、src/editors/PdfEditor.batch.test.tsx（新） |
| 规范 | .trellis/spec/shared/contract/pdf-agent.md §14及§8交叉引用；task implement.md的批准边界已在实施前记录 |

文件内可能还包含前轮 PDF 能力变更；本片所有权是上述原子批次接缝。没有改 DOCX/PPTX、renderer/chat、vendor 或严格原文writer。

## 验证证据

1. Office目标回归：`/tmp/mimir-pdf-batch-office-final.log`，7文件59/59。范围为 pdf-agent、候选、PdfEditor batch/content/forms/pending-forms/local。命令中曾列不存在的 editors/pdf-history.test.ts，Vitest实际匹配7文件；手动历史证据来自实际Editor专项，不把不存在文件计入结果。
2. 最终受影响重跑：`/tmp/mimir-pdf-batch-affected-final.log`，2文件14/14（candidate7 + Editor7）。补充真实source identity切文档、保存中拒绝、手动改稿回退保护、物化提示。
3. server目标回归：`/tmp/mimir-pdf-batch-server-final.log`，7文件38/38：native batch、annotations、forms、preserving-forms、local、local-route、catalog。
4. native最终受影响重跑：`/tmp/mimir-pdf-batch-native-affected-final.log`，1文件4/4，含native原始内容流与无关内部Link矩形/目标保留。
5. 三包 tsc exit0：`/tmp/mimir-pdf-batch-office-types-final.log`、`/tmp/mimir-pdf-batch-server-types-final.log`、`/tmp/mimir-pdf-batch-shared-types-final.log`。Office在最终Editor测试调整后另重跑exit0。
6. 14个本片源/测试文件目标oxlint（0错误/警告）、oxfmt check、git diff --check通过，日志 `/tmp/mimir-pdf-batch-lint-final.log`、`/tmp/mimir-pdf-batch-format-final.log`。没有新增CSS。
7. root统一Webbuild exit0：`/tmp/mimir-toolbar-ink-snapshot-batch-web-20261017.log`（主会话通知）。本worker未运行fullOffice/fullserver/build。

### 原生与UI证据边界

candidate使用真实PDFium写入、真实PDF.js viewport/文字提取与实际native backend，不以伪造坐标替代；四Rotate及offsetCropBox幸存文字transform相等。Editor使用实际PdfEditor/handle/宿主服务，canvas renderer只记录最终发布字节，是组件契约测试。

HTTP使用仓库固定测试账号，通过既有helper鉴权；只在测试库上传fixture，不改运行实例，不持久化工具工作字节。断言接口写返回V+1、dryrun保持V无bytes、错误无bytes，库存原件逐字节不变。

早期针对删除后批注的失败揭示pdf-lib缓存陈旧，已修正。候选Rotate180夹具原字超CropBox导致提取裁切，已将幸存测试文字置于四方向可视区域。早期forms两条取消回归因新路由过宽失败，已收窄atomicBatch范围，最终目标回归通过。新增切文档测试最初复用同一source对象且假设新handle初始version=0；改为实际不同source身份并断言切换完成后的version不被迟到结果改变。以上中间失败不冒称最终通过前未发生。

## 参考与适用边界

沿已批准研究证据：GenOffice固定480548fd55f1be3593ee0d8e316a734751d58309的PDF op-docs及tools提供名称/会话层语义。Mimir批注立即成为native对象，故目录明确用真实NM/R而非上游P层。WeKnora官网及v0.8.3 commit3e22822c1d2397be730c458c7539d0eb8c113a24已在本轮研究核对，固定definitions SHA256为3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0（完整路径/HTTP200证据见计划）。只采用如实能力注册，不将其作为Office/PDF原子编辑实现依据。

## 剩余边界 / 交接

- 没有模型调用，没有浏览器隐藏evaluate/handle批次驱动；不得声称模型端到端或浏览器批次验收通过。root仅验既有真实手动UI，本片以真实Editor契约+native专项作为批次证据。
- legacy R+pending身份账本、通用preserving PDFium writer、签名/XFA/未知结构支持均不在批准范围。
- dryrun会执行真实临时native写入/读回，只不发布；严格原insert guard拒绝的构造状态仍整批失败，不假装物化成功。
- 等root独立checker；无提交、暂存、归档、删测试件或运行实例上传。
