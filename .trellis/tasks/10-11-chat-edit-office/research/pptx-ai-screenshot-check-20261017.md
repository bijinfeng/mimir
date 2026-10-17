# PPTX AI 截图草稿独立检查（2026-10-17）

## 范围与结论

按已批准方案及实施报告独立检查 Office → renderer → chat → server 纵切片。生产已冻结交 root 构建与浏览器验收。本轮仅修复一处实际草稿丢失；未改 vendor、其他格式或公共 wire schema，未上传/删除文件、暂存/提交/归档，也未运行 Web build、全 Office 或全仓检查。

## Findings (fixed)

- 文件：`packages/chat/src/runtime/use-mimir-runtime.ts`、`packages/chat/src/ChatPanel.test.tsx`。
- 问题：截图已经排队后，用户可在第一轮结束前继续输入新草稿。原截图因版本过期在实际派发边界被拒绝，`onSnapshotRejected` 无条件恢复旧图与旧文字，覆盖新草稿。
- 复现：真实 assistant-ui/AG-UI + 本地 HTTP 服务；首轮暂挂，截图入队，输入“用户正在写的新草稿”，画布版本推进，释放首轮。新增用例在修复前明确失败：Expected `用户正在写的新草稿` / Received `过期美化指令`。日志 `/tmp/mimir-pptx-snapshot-check-regression-before.log`。
- 修复：派发拒绝只向空文字且无附件的 composer 自动恢复；已占用时保留新输入及错误提示。失败截图仍保留在原 user 消息和有界 registry，显式重试/取回沿原目标校验。没有绕过失效门禁或自动重绑新页面。
- 回归：新用例断言新文字保留、composer 不混入旧图、原 user 消息仍有截图；原空 composer 的恢复路径继续通过。
- 规范：在 chat frontend 既有截图合同内补充自动恢复的空 composer 条件，没有新建重复契约。

## Findings (not fixed)

未发现其他需要修复的切片缺陷。以下是验收边界，保留而不扩大实现范围：

- 实际浏览器 PNG 光栅、1280/420/短高布局与焦点由 root 验收；Office helper/Editor 测试使用受控 rasterizer，不可当作真实 Canvas 像素证据。
- 测试账号尚无模型，未进行真实视觉模型美化或供应商调用。HTTP 与服务端契约覆盖实际图片消息、路由与门控，不代表模型效果。
- 截图只在当前侧栏的有界内存中保留，刷新后的历史不恢复图片；第 5 张历史图片沿既定预算要求新建对话。

## 核对的实际路径

- `preparePptxAiSnapshot` 复用当前未保存 renderer；尺寸、字节、超时、AbortSignal、当前页路径与捕获后身份校验齐全。
- `PptxEditor` 保存 session/source 寿命、页与版本，换页/改稿/切源/取消拒绝迟到发布；准备不调用 save 或历史写入。
- renderer 专属 draft 转接核对 documentId；`draftAgent` 只供核对，原 activeAgent 仍决定执行权限。
- complete image attachment 进入真实 AG-UI HTTP image data source；整页冻结清空对象选区；发送、Enter、排队实际 fetch 与重试复核原目标，普通 RAG 不吞图。
- queue/stop/reclaim 恢复 PNG、文字与原绑定；registry 有界并保护排队/在途项；此次补齐失效派发时的新草稿保留。
- 服务端在持久化/模型前验证 user 内嵌 PNG 容器、数量/尺寸/字节预算及视觉能力，无图片的既有问答路径保持回归。

## Verification

| 检查 | 结果 | 日志 |
| --- | --- | --- |
| Office helper/控件/presets/实际 Editor 4 文件 | 24/24 | `/tmp/mimir-pptx-snapshot-check-office-tests.log` |
| ChatPanel 真实 HTTP + registry 2 文件（修复后） | 40/40 | `/tmp/mimir-pptx-snapshot-check-chat-tests-final.log` |
| 最后补充原 user 图仍保留的断言 | 3/3，33 非目标跳过 | `/tmp/mimir-pptx-snapshot-check-regression-final.log` |
| server 截图输入 + DOCX stream 2 文件 | 14/14 | `/tmp/mimir-pptx-snapshot-check-server-tests.log` |
| server 原 chat-stream 1 文件 | 4/4 | `/tmp/mimir-pptx-snapshot-check-server-chat-tests.log` |
| Office/chat/renderer/server typecheck | 全部 exit0 | `/tmp/mimir-pptx-snapshot-check-{office,chat,renderer,server}-types-final.log` |
| 26 个切片文件 oxlint | exit0 | `/tmp/mimir-pptx-snapshot-check-lint.log` |
| 修改文件 format / diff / 样式守卫 | exit0 | `/tmp/mimir-pptx-snapshot-check-{format-final,diff,styles}.log` |

最初 server 命令含不存在的 `assistant-stream.test.ts`，Vitest 实际运行 2 文件14项；随后按真实文件名单独补跑 `chat-stream.test.ts` 4项。上表准确记录为 14+4，不把不存在的匹配计作测试。

全仓既有 bundled skills 480 项 lint 基线未重跑，也未将此切片通过写成全仓绿色。参考证据沿方案固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 与 WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`：前者为文件截图语义，后者仅能力/作用域如实门控，本轮不引入新研究判断。

## 浏览器反馈补修：移除后的截图提示

root 的真实 1280/420/420×500 浏览器已确认截图包含当前未保存画面，反馈无模型发送受阻后移除截图仍残留专属错误。现有无模型组件测试补充“移除后专属错误和关闭按钮消失”断言，修复前失败（`/tmp/mimir-pptx-snapshot-remove-before.log`）。

局部修复在 runtime 区分附件校验与 transport 错误，截图 Remove 仅清前者；提示手动关闭仍可清当前提示。普通对话错误、thread 消息及用户编辑的文字保持。新增真实 HTTP 用例先挂住普通请求、准备截图新草稿、让普通请求失败，再移除截图，明确断言文字和输入区普通连接错误仍在。

最终 production 再次冻结：ChatPanel + registry **2 文件41/41**（`/tmp/mimir-pptx-snapshot-remove-tests.log`），chat tsc、4文件 lint/format 均 exit0（同前缀 `types/lint/format.log`）。本次未动 Office/server 或界面布局，统一构建交 root；无真实模型调用。
