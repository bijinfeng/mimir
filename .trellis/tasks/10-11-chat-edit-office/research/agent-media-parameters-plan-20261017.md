# Agent 媒体参数补齐边界

2026-10-17，implement owner agent_media_params_complete。依据同任务 editor-all-tools-final-parameter-audit-20261017.md §3.1/3.2/3.4/3.5；固定 GenOffice 480548fd55f1be3593ee0d8e316a734751d58309。WeKnora v0.8.3 / 3e22822c1d2397be730c458c7539d0eb8c113a24 的官网与 definitions 缓存 SHA 已由审计实证，复用其能力门控/知识权限参考，不作 Office 图片 writer 依据。

## 最小行为差距与归属

- DOCX/Markdown/PPTX 比例在 catalog→浏览器→HTTP→已有 generateDocxImage 丢失；贯通已存在比例 schema/离散供应商尺寸映射，拒绝非法值，不声称任意精确比例。
- PPTX 引用图/透明参数只有上游执行。本地图片 SDK 已支持带 ImagePart 的 prompt 和 background；复用现有 provider factory、受控图片下载、预算与用量记录，明确模型不支持错误；透明 PNG 必须具有真实 alpha。
- attachment://name 在工具 dispatch 尚无显式原文件入口。复用 Chat 的 requestMediaSource 上传选择及 PPTX 已鉴权 apply-ops multipart，附件只随当前文档字节/expectedVersion 的单个请求传输；不建立另一持久化/全局临时 store。仅用户选择的实际 File 才可通过私有 options seam，精确匹配文件名，重名拒绝、无附件拒绝；不允许模型 JSON 构造附件 bytes 或本机路径。
- PPTX 原音视频分析复用现有 prepareDocxMedia 本地有界前处理与通用转录/视觉服务；从上传文件入口而非要求用户自行抽帧。音频转录须配置；视频明确为四个时间点的画面分析，音轨若未提取不得声称已分析。取消、切源和版本变化不发布迟到分析结果。

## 必要文件

shared 的媒体 schema 与工具 catalog；Office markdown/PPTX handle 的宿主接口；Chat IO/interrupt bridge（已有媒体选择）；renderer api/chat-io/NoteEditor（已有前处理与 multipart）；server conversations（校验与鉴权）、pptx-agent-services（请求内附件解析）、docx-image-generation/media-analysis（SDK 参数/取消/真实输出检查）；针对这些接缝的合同、native 保存、adapter 及错误测试。

PPTX host 只加具名请求字段，其他 owner 拥有 bullet preflight；不改其他生产逻辑。现有读/写/保存原子边界保持。generate_deck 的逐页进度/部分保留由 root 后续独立 owner 负责，本片不改其循环/Chat 协议/UI。XLSX、DOCX 加密/保护、PPTX 段落选择/项目符号、vendor、依赖不在本片。

## 验证

无真实 provider 配置：用真实 SDK adapter 的受控 transport 及 fake model 验证参数、原图 bytes、透明 alpha、native insert/replace/save、预算/错误/取消；浏览器原始视频前处理与 UI 由 root 在生产构建验收。使用 direct node_modules/.bin 工具；专项 Server runner 待 R3 释放后串行运行，不抢 DB。root 负责 Web build、浏览器与最终全门禁。
