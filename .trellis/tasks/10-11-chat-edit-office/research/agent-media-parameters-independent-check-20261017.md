# Agent 媒体参数独立检查

2026-10-17，独立 `trellis-check`：media_parameters_independent_check。审查对象为本任务 `agent-media-parameters-plan-20261017.md` / `agent-media-parameters-implementation-20261017.md` 及最终参数审计 §3.1、3.2、3.4、3.5。本报告只关闭该媒体片的代码与受控接缝检查，不宣布整任务完成。

## 输入与协作边界

- 已读 check.jsonl、任务 PRD/design/当前 implement 及相关 shared/server/office/chat/renderer 规范。真实浏览器和最终原样 `pnpm check` 归 root；未启动 Web build、全套测试或其他 DB runner。
- 固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 为工具/参数依据；沿同任务已核实 WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的权限/能力参考，官网缓存 SHA `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`、definitions SHA `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`；本次未新请求官网，也未把其 Markdown 编辑器作为 Office 工具栏依据。
- deck owner 同时修改 shared PPTX service/host、conversations、renderer API、Office 接口及 Editor。先协调 runner 与符号归属，媒体检查未改其生产符号。20 个媒体涉及生产文件的审查输入 SHA 保存在 `/tmp/mimir-media-independent-production-inputs-20261017.json`，最终复核 **20/20 未变**。其中 deck 共用文件只能称组合输入快照，不能代称 deck 已完成或经其正式独立检查。
- 没有改依赖、vendor、生产逻辑或现行契约；没有 stage/commit/archive/删除测试件。

## 核对结果

### §3.1 比例

已沿三条实际路径核对：DOCX shared schema → `executeDocxTool` → ChatIo/renderer API → 已鉴权 HTTP → `generateDocxImage`；Markdown catalog → `markdown-agent` → NoteEditor service/API → 同图片服务；PPTX catalog/shared schema → handle host → apply-ops → service → 同图片服务。

非法值在输入层拒绝；未传/auto保留尺寸默认；1:1、横/纵比例映射到供应商离散尺寸，DALL-E 2 非方形在发送前拒绝。独立追加真实 provider factory + TanStack SDK fake HTTP 用例，观察实际 `/images/generations` JSON 的默认、auto、方形、横/纵、DALL-E 3 尺寸及 DALL-E 2 预拒绝；返回图像另行解码读到实际 1×1，明确请求尺寸并非返回像素保证。原有真实 `/images/edits` multipart 用例也独立重跑，读取原 File bytes、model/size/background/output_format 和解码 alpha。

### §3.2 引用图/透明

引用图沿同一受控抓取或 request-local attachment → 原 bytes SDK ImagePart；最多4张、单张8 MiB、合计16 MiB。DALL-E 明确拒绝引用/透明。透明必须是实际 PNG、最多1600万像素、解码 CRC 通过且存在 alpha<255；未满足不发布引用。取消在生成/下载后及引用发布前重验。当前没有绕过 provider 工厂、统一用量或另建模型调用引擎。

### §3.4 原附件

`attachment://` 只解析无路径的原文件名；Chat 真实 File 选择及精确名称校验后从私有 execute options 送 multipart，模型 JSON 不携带附件 bytes。HTTP cookie鉴权，当前文档格式由 host 重验，expectedVersion 与原件 bytes 同请求。请求内重名拒绝，服务无同名全局附件缓存；缺失、非法路径、MIME/真实格式不符拒绝。现有 native 测试独立读取插入/替换后的 ZIP，原 PNG bytes精确且持久对象ID/geometry保留。host candidate 与客户端重解析/版本/lifetime信号保持现有发布/history边界。

独立追加受控 File.arrayBuffer 未结算时停止的回归，随后交付真实 bytes，断言不派发 host execute。该测试验证停止边界，未把 native fixture 冒称生产浏览器验收。

### §3.5 原音视频

PPTX audio/video 由 bridge 请求用户显式选原 File；音频沿既有转录/统一 chat，视频本地最多4帧并标明 `visual_frames_only`。只有 includeAudio:true 提取可解码音轨为16kHz单声道WAV后转录，返回 `visual_frames_and_audio`；缺模型/转录或解码失败有明确错误。源文件名/实际 scope 进入工具结果；分析不调用画布写入 executor。

核对32 MiB/120秒、1280×720包络、10%/35%/65%/90%时间点、URL释放、解码15秒、8声道/3200万样本、取消/版本重验。独立新增5个 renderer case：解码超时后 AudioContext 关闭并丢弃迟到解码、3种解码预算在读取采样前拒绝、空原视频在分配URL前拒绝；新增 Chat 迟到视频分析停止用例，零写入。WAV RIFF/WAVE签名、转录中止及多模态 chat 参数由现有服务专项实测。

## Findings (fixed)

- 没有发现需修复的媒体生产缺陷。
- 增加8个有意义的边界测试：`apps/server/src/test/agent-image-sdk-transport.test.ts` +1；`packages/renderer/src/lib/agent-media.check.test.ts` +5；`packages/chat/src/runtime/agent-media.check.test.ts` +2。
- 自己新增测试初次使用了 Chat tsconfig 不提供的 Promise.withResolvers，改为局部 deferred；初次 scoped lint 对异步断言写法与 mock 泛型报错，已按现有规则修正并重跑全绿，没有降低规则或改配置。

## Findings (not fixed)

- 没有遗留的媒体生产代码问题或需产品决定的问题。
- 真实 browser codec（含视频音轨可解码/无音轨/不支持编码）及生产1280×800、420×500/原附件选择/保存/history由 root 验收，**本报告没有执行**。这里使用可控 HTMLVideo/AudioContext 的测试不能替代 codec 实测。
- 无可用 provider 配置，真实供应商生成、转录、媒体分析和真实 Agent 续轮仍未验；fake HTTP 仅证明真实 SDK transport 合同。本片不扩展为付费服务或真实供应商成功声称。
- Renderer 类型首轮曾因并行 deck 的 `pptx-deck-stream.test.ts` mock空元组报 TS2493；通知 owner 在其归属修复后，本检查最终 Renderer typecheck **PASS**。该历史红项不是当前媒体阻塞。后续 deck 改动仍需其正式独立检查和最终组合门禁。

## Verification

全部使用包内 direct `node_modules/.bin`；Server DB runner 与 deck owner 串行约定，已释放。

| Gate | 实际结果 | 日志 |
| --- | --- | --- |
| Server targeted | 7文件 **34/34** | `/tmp/mimir-media-independent-server-final-20261017.log` |
| Office targeted | 3文件 **60/60**（pptx-script/pptx-agent/docx-agent） | `/tmp/mimir-media-independent-office-20261017.log` |
| Chat targeted | 2文件 **14/14** | `/tmp/mimir-media-independent-chat-final-20261017.log` |
| Renderer targeted | 4文件 **34/34**（含正确的 markdown-writing-stream 路径） | `/tmp/mimir-media-independent-renderer-final-20261017.log` |
| TypeCheck | shared/chat/office/server/renderer **全部 exit0** | `/tmp/mimir-media-independent-{shared,office,server}-types-20261017.log`，`/tmp/mimir-media-independent-{chat,renderer}-types-final-20261017.log` |
| Scoped lint/format | 30 TS/TSX 文件 **PASS**，无抑制 | `/tmp/mimir-media-independent-{oxlint,oxfmt}-20261017.log` |
| git diff --check | **PASS** | `/tmp/mimir-media-independent-diff-20261017.log` |

合计16文件 **142/142**。媒体代码/受控合同独立检查通过；整体任务仍 in_progress，等待 root 的生产浏览器、deck片以及最终原样质量门。
