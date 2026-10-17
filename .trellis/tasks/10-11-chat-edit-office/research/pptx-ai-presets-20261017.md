# PPTX AI 快捷指令（2026-10-17）

## 参考与实际接缝

- 固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`：`apps/slides/src/renderer/components/RibbonHomeTab.tsx:219–269` 的美化、事实核查、配图，`components/Ribbon.tsx:192–203,2488–2527` 的拼写检查及8语言翻译；提示词见 `i18n/ai/zh.ts:23–27` 与 `i18n/ribbon/zh.ts:381–394`。
- 上游美化传 `{slideShot:true}`，App的onAiPreset调用 `pushAiPreset(text,true,...,opts?.slideShot)`，即自动执行并携带当前页截图。Mimir现有HTML/Markdown通过 `onAiPreset(instruction:string)` 打开同一个问AI侧栏、预填可编辑草稿，由用户显式发送；沿此已存在的产品接缝，不新增自动调用模型或第二侧栏。
- WeKnora本次官网HTTP200；公开源标签接口 `https://api.github.com/repos/Tencent/WeKnora/git/ref/tags/v0.8.3` HTTP200，commit `3e22822c1d2397be730c458c7539d0eb8c113a24`。其固定README Overview将产品定位为文档理解/语义检索/推理的知识框架，适合知识库与Agent设置边界参照，不作为PPTX Ribbon工具集合与外观的模型。
- 本次检查 `packages/chat/src/runtime/use-mimir-runtime.ts`，`useAgUiRuntime` 仅注入history adapter，没有配置AttachmentAdapter；`ChatDraft`/宿主`AskDraft`只有text/documentId，`ChatPanel`草稿effect只填文本。现有截图不能只加一个File字段后宣称已提交。虽然文档Agent服务端 `docx-agent-stream.ts` 将parsed.messages交给统一model.ts，真正图片附件仍需前端适配、可见附件预览/移除、体积与MIME校验、请求/模型能力/历史语义验证。本批按主会话确定范围，不扩建附件系统。

## 本批实施

- 新 `PptxAiControls` 复用现有紧凑ToolbarButton/ToolbarMenu，不新加长表单或Inspector。支持 `section=create`（美化本页、事实核查、生成配图）与 `section=review`（拼写检查、翻译本页），8语言为英语/简体中文/繁体中文/日语/韩语/法语/德语/西班牙语。
- API `{documentId,slidePath,slideIndex,version,onAiPreset?,disabled?,section?}`；OfficeSourceEditor仅向PPTX编辑器透传现有onAiPreset，Editor具体Ribbon集成由主会话负责。HTML/Markdown合同不变。
- 指令清楚说明作用范围（核查与拼写为整篇，美化/配图/翻译为指定页）、准备时第几页、原生path、稳定s_N、当前未保存画布版本。要求先read_slide、核对path；页序/版本变化时按当前上下文s_N重新定位，目标不存在则停止写入。PPTX catalog的read_slide schema只接受整数，因此提示词调用使用整数，不使用executor私下兼容的字符串slide参数。
- 草稿仅交给侧栏，点击不会执行网络或写入画布，不会自动保存。禁用态说明宿主未接入、正忙或没有有效目标；翻译菜单保留8个具名禁用项。
- 图片生成与事实检索依赖现有模型/服务配置。指令要求能力缺失时如实说明，不声称已生成图片或捏造事实来源。本轮没有可用真实模型，未宣称模型端到端运行。

## 验证

- `vitest run src/editors/PptxAiControls.test.tsx src/editors/pptx-ai-presets.test.ts` **18/18通过**：4动作回调内容、8语言、当前props更新、拆分组单入口、无宿主/忙/非法目标、目标参数边界；真实PptxEditSession手动写入未保存文字后，按草稿规定的整数read_slide调用读取原生path与最新正文，读取不推进version。
- 定向oxlint通过；定向oxfmt通过；Office `typecheck`通过。中间renderer typecheck因主会话PptxEditor尚未添加onAiPreset prop及并行LibraryView的StatusTag quiet prop报错，已报告，不据此宣称全仓gate通过。
- 实际浏览器Ribbon外观、同侧栏草稿与当前页/语言切换验收由主会话统一完成；无真实模型/桌面验收。

## 仍需明确保留的上游差异

1. **美化没有附加当前页PNG截图**；仅基于活画布read_slide与现有Agent几何/样式数据。这是完整截图附件通路的缺口，不能在96项矩阵中把上游slideShot语义标为通过。
2. Mimir预填可编辑草稿后由用户发送，上游autoRun=true。遵循当前Mimir与HTML/Markdown一致的明确发送行为，并记录差异。
3. 指令里目标/版本是可检查的文本上下文，发送时仍由现有Agent捕获当前版本并执行工具级校验；它不是一个新增、不可修改的严格目标锁。先读并校验path是模型操作要求，未伪称为新增服务端强制条件。
