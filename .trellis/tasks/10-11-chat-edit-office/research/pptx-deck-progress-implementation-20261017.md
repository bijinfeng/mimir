# PPTX 逐页生成、暂存预览与显式部分保留：实施报告

2026-10-17，implement owner `/root/pptx_deck_progress_complete`。生产代码已冻结，等待正式独立检查及 root 生产构建/浏览器；不标整体工具完备。

## 依据与边界

依据 `pptx-deck-progress-next-plan-20261017.md`、最终参数审计 §3.6，以及固定 GenOffice commit `480548fd55f1be3593ee0d8e316a734751d58309` 页进度/完成页保留语义。竞品来源复用主任务已核实缓存；未声称本片重新请求网站。WeKnora 官网缓存 SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`，v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` definitions SHA256 `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`：只借鉴能力门控，不作为 Office 工具栏布局模型。

已与媒体 owner 按符号协调，保留附件原字节/引用图/透明 alpha/比例/媒体分析所有新增接缝；无 XLSX、保护、bullets、vendor 或依赖修改，无 stage/commit/archive/测试件删除。root 负责重型构建、浏览器及全门。

## 行为与数据流

- `generate_deck` 显式采用同一 multipart apply-ops 的 `?stream=1`；原校验/文档格式鉴别/附件/版本合同继续执行。其他工具保留原 JSON 路径。
- 规划、当前生成页、完成数来自真实循环。每页 native 事务、媒体、crop 成功后保存 ZIP，经 BoundedZip 全部预算验证并 native reopen/页数验证，再发完整 checkpoint。半页/JSON 片段不会计完成。
- NDJSON 严格 schema；generationId/total/mode/originalPages/连续页序/完整终局一致。renderer 增量 UTF-8 解码，半条事件、截断流、终局后事件及身份变化全部拒绝，且不允许保留已有候选。
- 单候选 50MiB，单行 base64 对应包上限+20000 字符，累计流 256MiB（服务端按实际 UTF-8 字节计数，预留8KiB错误终局），250事件，80页，10分钟。服务端逐事件背压，最多排队一条 wire 事件；只保留最新候选，正常 done 不重复发送 ZIP。预算失败是不可保留错误。
- Office 独立 hook 包装 host，仅 generate_deck 使用内部 transport AbortController。Inspector 的“停止生成”仅停止此请求；handle 原外层 signal 仍代表源/Agent 轮销毁，严格拒绝迟到写入，不放松 existing assertActive。
- 临时原生解析会话用于预览，与真实画布 session、dirty、版本、history、library 分离。追加预览只浏览新增页。原件保留至全部成功或用户明确选择“保留已完成 N 页”。
- 停止或明确 recoverable 的后页失败有完整 checkpoint 时显示保留/丢弃；零页、协议损坏、预算、源/版本变化不产生可保留发布。保留结果准确返回 completed/missing/failedPages/notGenerated/stopped/failure，不伪称完整成功。
- 保留和全部成功都返回既有 host result，经原 handle 的一次 `replaceFromHost`、round checkpoint、onChange/history 发布。未新增发布或 rollback 路径；之后人工修改使旧 round 回退失效。
- Inspector 复用320px及窄屏覆盖规则；内部滚动、底部固定单一主动作，生成时停止，部分态保留；丢弃/ESC明确清草稿并回焦。当前任务标题与预览页分开表达。

## 正式文件归属

生产（13）：

1. `packages/shared/src/pptx-deck-progress.ts`（新增协议/预算/错误分类）
2. `packages/shared/src/index.ts`（仅新增导出）
3. `apps/server/src/services/pptx-deck-stream.ts`（新增流与背压）
4. `apps/server/src/services/pptx-agent-services.ts`（规划/逐页验证 checkpoint 窄接缝）
5. `apps/server/src/services/pptx-agent-host.ts`（request generation/callback 类型）
6. `apps/server/src/services/pptx-agent-catalog.ts`（generate_deck准确描述）
7. `apps/server/src/routes/conversations.ts`（同一apply-ops显式流分支）
8. `packages/renderer/src/lib/pptx-deck-stream.ts`（新增严格增量解析）
9. `packages/renderer/src/lib/api.ts`（applyPptxOps可选进度）
10. `packages/office/src/agent/pptx-agent.ts`（host接口进度类型，原发布逻辑不改）
11. `packages/office/src/editors/PptxDeckWritingPreview.tsx`（新增hook/真实原生预览）
12. `packages/office/src/editors/pptx-deck-writing.css`（局部布局）
13. `packages/office/src/editors/PptxEditor.tsx`（包装host/临时Inspector窄集成）

专项测试（3）：`apps/server/src/test/pptx-deck-progress.test.ts`、`packages/renderer/src/lib/pptx-deck-stream.test.ts`、`packages/office/src/editors/PptxDeckWritingPreview.test.tsx`。

共享旧文件同时含媒体/bullets/原任务既有未提交改动，报告只认上述符号范围；不得按git whole-diff归属本片。

## 已运行验收

全部通过，使用直接 `node_modules/.bin`，无新依赖：

| 层 | 命令/证据 | 结果 |
| --- | --- | --- |
| Office | `vitest run src/editors/PptxDeckWritingPreview.test.tsx src/agent/pptx-script.test.ts src/editors/PptxEditor.workspace-views.test.tsx` | **3 files 22/22** |
| Server | `vitest run src/test/pptx-deck-progress.test.ts src/test/pptx-agent-services.test.ts` | **2 files 10/10** |
| Renderer | `vitest run src/lib/pptx-deck-stream.test.ts` | **1 file 10/10** |
| Types | Shared / Office / Renderer / Server `tsc --noEmit` | 全部 exit0 |
| Static | 15个TS/TSX scoped oxlint；16文件oxfmt --check；git diff --check | 全部 exit0、零诊断 |

日志：`/tmp/mimir-pptx-deck-office-tests-20261017.log`、`/tmp/mimir-pptx-deck-server-tests-20261017.log`、`/tmp/mimir-pptx-deck-renderer-tests-20261017.log`。

核心证明：

- 受控第三页延迟前两页已真实可见；replace/append checkpoint 每份可原生重开且页数正确；append 原 slide1/theme native 字节保留。
- 真实PptxEditor加载，完整两页暂存时 version0、dirtyfalse、保存/撤销禁用；停止后仍 version0，显式保留才 version1/单history。
- 保留后保存原生重开，Undo只有一步且所有非目录 ZIP 部件与原件逐字节一致，Redo与已保存候选所有 native 部件一致。**不声称 ZIP envelope 原字节相同**：既有 PPTX serializer 会重打包 ZIP。
- 部分失败准确状态与计数；保留后旧round能正常回退；后续人工文字修改后旧round不能回退覆盖。
- 丢弃/截断/零完成/源signal取消/局部Stop后迟到success零发布；人工版本变化自动废弃，真实A→B→A不复活；ESC回焦。
- renderer分片UTF-8/NDJSON、连续页序、身份/计划变化、完整终局、错误终局尾部垃圾、250事件预算、终局后事件全部有断言；真实API multipart传source/version/generation/signal。
- 真实Hono route流 header/checkpoint/done和非法action/generation输入有断言。身份鉴权仍沿现有app全局保护，不宣称该独立route harness自身登录测试。

## 本轮红灯与修正记录

- 首轮Office断言误要求原ZIP容器完全一致，修为合同真正保证的完整非目录 native parts；原功能并未损坏。round回退到原干净状态正确禁用保存，不通过伪造dirty制造保存。
- 背压加入后原测试停止读第三页generating事件，服务正确等待消费；测试改为读取实际下一阶段后再让第三页失败。
- 真实A→B→A测试发现旧临时draft仅按session/id过滤会在返回同一解析session时复活。现discard按generation销毁state，旧异步finally也不会清掉新草稿；回归已绿。
- 实施中临时releaseWait/documentId类型拼接错误已修复；冻结类型均绿，不把早期失败抹作未发生。

## 尚待/限制

- 正式独立checker、root最新生产build及1280×800、420×500浏览器由root继续。
- 无已配置provider，以上是受控模型/真实native/真实runtime证据，不声称真实供应商长文稿质量或生成成功。
- DOCX新密码用户自验、Desktop用户自验仍为主任务既定边界，与本片无关。
- 受控浏览器harness仅准备在`/tmp/mimir-pptx-deck-progress-harness-20261017/`，不作为产品入口、不构建/启动；待根会话使用。

冻结时所有本人目标tests/types/static命令均已退出，Server runner已释放；没有本人在途服务或安装进程。
