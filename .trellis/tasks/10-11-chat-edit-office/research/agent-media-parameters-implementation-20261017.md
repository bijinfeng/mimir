# Agent 媒体参数补齐实施（待独立检查与生产浏览器）

2026-10-17，owner agent_media_params_complete。生产已冻结并通知 root；本片不代表所有工具完成。

## 参考与边界

落实同日 `editor-all-tools-final-parameter-audit-20261017.md` §3.1、3.2、3.4、3.5；主参考固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`。沿该审计已核实的 WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 与官网/definitions 缓存证据（SHA `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe` / `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`）作为能力/权限参考；本片未重新请求官网，也不以其编辑器为Office工具栏依据。最小边界先写于 `agent-media-parameters-plan-20261017.md`。

`generate_deck`逐页进度/部分结果由独立 deck owner 实施，本片未改生成循环、modelJson或generatedPage。未改XLSX、DOCX加密/保护、PPTX选择/图片项目符号、vendor、依赖；保留并行脏改。没有新持久化附件store、上传数据源或付费服务。

## 已实现

### 比例、引用图与透明图

- 新shared `agent-media.ts`统一比例枚举、生成参数、已前处理分析HTTP schema及私有附件bytes类型；DOCX/MD/PPTX目录→handle/Chat IO→renderer API→HTTP→既有generateDocxImage贯通 `aspectRatio`。
- 默认/auto保留现行尺寸行为；1:1、横/纵比例沿现有供应商离散size映射。非法值在客户端/HTTP/schema与服务端拒绝。**不声称任意精确比例或供应商已返回该真实尺寸。**
- PPTX `referenceImageUrls`最多4张，通过同一个SSRF安全抓取或当前请求原附件解析，以SDK ImagePart原bytes进入真实OpenAI edit路径。当前支持GPT Image；DALL-E明确拒绝引用图/透明请求并提示切换，不虚构Genspark模型。
- `transparentBackground:true`传真实 `background:transparent, output_format:png`；结果8MiB以内、有界1600万像素PNG解码，至少一个实际alpha<255方可成功。纯prompt不算透明成功；不透明/格式错误不发布受控引用。
- 公共生成和下载接收取消；provider返回后、受控引用发布前再次核对。

### 原附件

- 复用Chat现有requestMediaSource，模型传 `attachment://原文件名` 后由用户选择同名原PNG/JPEG。字节仅进入私有execute options，不从模型JSON读取bytes。
- 复用当前PPTX的已鉴权apply-ops multipart；`attachment`与当前文档字节、documentId、expectedVersion、signal同一请求。4张/每张8MiB/合计16MiB，仍受原整请求预算。无全局同名缓存，源切换不继承；重名、路径、类型与内容不符、缺少原附件均明确拒绝。
- 插入/替换复用已有原子native/history路径；独立读取保存包证实原附件PNG bytes精确，replace保留持久ID和geometry。真实生产浏览器的附件选择/保存/history尚待root验收，不能用本片native测试冒称已验。

### 原音视频

- PPTX `analyze_media.kind=audio|video`直接请求用户选择原文件；无需用户先抽帧。复用既有prepareDocxMedia与ChatIo，不建立第二上传存储。
- 音频沿原WAV/MP3/M4A/Ogg有界输入→TanStack transcription→统一chat调用；新增并贯通取消。WAV须有RIFF/WAVE实际签名。
- PPTX视频限32MiB/120秒，复用本地video/canvas，在10%/35%/65%/90%时间点最多取4帧，缩放至1280×720包络。默认明确 `visual_frames_only`，不冒称声音分析。
- `includeAudio:true`额外使用浏览器可解码音轨，15秒解码超时、120秒/8声道/3200万解码样本上限，转16kHz单声道PCM WAV，经既有转录后与帧共同分析。不支持codec/无音轨/转录未配置均明确失败；不会静默降级成已分析音轨。
- 通用已鉴权 `/document-agent/analyze-media`只接受DOCX/PPTX；旧docx路径兼容。前处理文件URL/AudioContext释放；选择/读取/服务结束均验证取消及原版本。返回原文件名与实际scope，零画布修改。PPTX多图片URL逐素材分析，不再把多张静态图片冒称原视频。

## 文件归属

生产：
- `packages/shared/src/{agent-media,docx-agent,index}.ts`
- `packages/chat/src/types.ts`、`runtime/{io.ts,DocxInterruptBridge.tsx}`
- `packages/office/src/agent/{markdown-agent,pptx-agent}.ts`
- `packages/renderer/src/components/NoteEditor.tsx`、`lib/{api,chat-io,docx-media}.ts`
- `apps/server/src/routes/conversations.ts`（仅媒体分支；保留R3等既有改动）
- `apps/server/src/services/{docx-image-generation,docx-media-analysis,pptx-agent-services,pptx-agent-catalog,markdown-agent-catalog,document-agent-capabilities}.ts`
- `apps/server/src/services/pptx-agent-host.ts`仅PptxHostRequest附件字段；图片符号helper/preflight由另一owner独立负责。

测试：Server既有三媒体文件及新增`agent-image-sdk-transport.test.ts`/`agent-media-routes.test.ts`；Chat `DocxInterruptBridge.test.ts`；Renderer新增`lib/agent-media.test.ts`及`editor/markdown-agent.test.ts`。
现行合同同步 `.trellis/spec/shared/contract/document-agent.md`。仅新增本片plan/implementation报告，不并改root ledger。

## Verification

所有命令使用包内direct node_modules/.bin，未调用安装器；Server DB runner与R3/checker串行约定。

| 检查 | 结果与精确范围 |
| --- | --- |
| Server最终同一次专项 | **7文件33/33**，`/tmp/mimir-agent-media-server-final-tests.log`。docx-image-generation、docx-media-analysis、pptx-agent-services、agent-image-sdk-transport、agent-media-routes、docx-agent-stream、markdown-agent。 |
| Chat专项 | **1文件12/12**，`/tmp/mimir-agent-media-chat-tests.log`。真实bridge参数传递、原文件选择/bytes options、版本冲突、AV scope、DOCX既有行为。 |
| Renderer专项 | **3文件27/27**，`/tmp/mimir-agent-media-renderer-tests.log`。API aspect/multipart/credentials/signal，真实Markdown Editor图片上传插入与非法比例，音轨WAV字节，受控视频timeline/4帧/尺寸/URL释放，既有写作流。 |
| Office专项 | **3文件60/60**，`/tmp/mimir-agent-media-office-tests.log`。pptx-script/pptx-agent/docx-agent；包括既有async版本/取消和native/history回归。 |
| types | shared/chat/office/server/renderer五包均exit0，`/tmp/mimir-media-{shared,chat,office,server,renderer}-types.log`。 |
| Scoped lint | 修改TS/TSX全部oxlint exit0，无抑制。 |
| format/diff | 28文件oxfmt --check通过，`/tmp/mimir-agent-media-format.log`；全当前diff check exit0，`/tmp/mimir-agent-media-diffcheck.log`。 |

真实SDK fake HTTP证据：使用实际provider工厂和TanStack generateImage，断言OpenAI `/images/edits` multipart实际model/size/background/output_format及文件原bytes；解码返回PNG验证2×1及透明alpha。OpenAI SDK会先用本地data:,做multipart支持探测，测试明确处理该本地探测；没有外部网络调用。初次单请求计数断言误把该SDK探测计为API请求而红，纠正为区分本地probe后最终套件全绿，没有改生产规避。

**精确限制**：上述前处理runtime使用可控HTMLVideo/AudioContext事件，不是浏览器真实codec验收；native PPTX包证据不替代生产UI。当前没有模型provider配置；没有真实生成、搜索、转录或Agent续轮成功声称。root仍需生产Webbuild/1280与420浏览器、真实媒体前处理与最终独立check；真实provider按用户选择后验，Desktop由用户自行验收。整任务保持in_progress。
