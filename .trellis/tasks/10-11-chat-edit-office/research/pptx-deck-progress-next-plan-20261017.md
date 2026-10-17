# PPTX 逐页生成与保留完成页：下一实施边界

2026-10-17，root，沿用户已授权“所有工具和参数”补片。依据 `editor-all-tools-final-parameter-audit-20261017.md` §3.6，固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`。WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 缓存的能力门控可借鉴，原件生成与工具栏以固定 GenOffice 为主；此片不新增供应商或凭据。

## 最小行为缺口与归属

现有 `pptx-agent-services.ts` 已逐页构造原生内容，但只在全部完成后返回一个 ZIP。浏览器没有中途进度/完成页预览，停止或后页失败时丢失完成页。应让已完成且通过原生验证的页形成受控临时候选，浏览器可看到进度；用户可明确保留完成页或丢弃。写入现有文档仍只有一次显式候选发布与一次 history。

涉及服务生成循环、PPTX 专用流式 HTTP、renderer transport、Office agent/Editor 的草稿进度和确认 UI。媒体 owner 同时修改 `pptx-agent-services.ts`、`conversations.ts`、`api.ts`、agent host接缝；正式执行前必须逐符号协调，禁止覆盖其他 owner 改动。优先提取生成协议/状态到独立 helper 和组件，现有服务只保留窄接缝。

## 合同

- 规划阶段、逐页生成阶段、已完成页数、总页数及具体失败/停止原因均准确；不能用固定延迟或虚假进度。页只有原生构造、媒体、裁切和保存均成功后才计完成。
- 原件 source、documentId、session/handle、version 和 generationId 冻结；切源、卸载、人工修改后过期候选无法保留。临时预览不写 library/dirty/history/version，不锁死正文或把候选混入真实页树。
- HTTP 传输可以终止，但已验证完整的最后一份候选可留在当前浏览器草稿；截断半条事件或半页不成为可保留页。停止生成与源会话销毁应有明确区分，不能放松源的 abort 守卫来挽救草稿。
- 正常全完成可沿既有 Agent 一次发布；停止/失败后有完成页时显示明确“保留已完成 N 页”和“丢弃”选择，保留才一次发布。替换/追加模式应准确提示结果；零完成页没有虚假的保留按钮。旧原件在确认前保持完整。
- 唯一发布归属保证 Agent round 回退与手动 Undo/Redo 不打架；完成页保留后，明确可撤销、可保存并能重开，取消/失败不能自动覆盖已有人工作品。
- 有界流：事件数/行长/ZIP/checkpoint总字节、页数和CPU预算；不可每页无限累积完整50MiB候选。尽量使用一个最新候选并释放旧预览资源；页面仅在必要时处理完整候选。
- UI沿紧凑Ribbon与320px Inspector；内部滚动、固定单一主动作、实际完成页预览、完整停止状态、420×500可达和逐层Escape回焦。不要把基础界面改成超长表单。

## 验收

可控生成器证明：首两页完成可见，第三页延迟、失败与主动停止；保留只含完整前两页，一次history；丢弃/零完成/截断流/超限零发布；切源/人工改稿/迟到均拒绝。真实原生ZIP重开、未改部件保真、保存后Undo/Redo、原件返回与旧Agent round回退均覆盖。类型/严格schema/renderer流解析各层一致，独立checker完成后root统一构建与1280×800、420×500生产浏览器。无provider时仅用受控transport/组件证据，不能声称真实模型生成已通过。

实施者只运行目标tests/types/scoped静态；root拥有全仓门禁和浏览器。不得改vendor、暂存/提交/归档或删除测试件。

## 实施接缝精化（2026-10-17 implement）

已只读核对实际代码并与媒体 owner 协调。保留其 attachmentImage/imageSource/imagePayload、generate_image 与 analyze_media 分支及 attachments 参数。使用现有 apply-ops 的显式 stream=1 分支，鉴权、原件/参数/附件校验继续共用；新增 shared 严格事件协议与 renderer 独立增量解析器。服务每页原生事务/裁切/ZIP保存并重新打开成功后才发送checkpoint，正常终局只引用最后候选，避免重复发送ZIP。单候选50MiB、累计256MiB、事件/行/页数和十分钟预算先验证后发送，预算或协议破坏不允许保留。

Office新增独立usePptxDeckWriting+Preview。仅包装generate_deck的hostApply，内部独立AbortController用于停止；handle原外层signal仍代表源/Agent轮取消，严格拒绝发布。停止或服务明确可恢复失败仅让用户选择最后完整候选；不完整流、序号/身份错误、超限则清草稿拒绝。保留后返回既有host结果，由handle原replaceFromHost、round checkpoint与afterEdit/history唯一发布，不再引入第二发布函数。

预览使用原生候选的独立PptxEditSession.view，追加时仅显示新页；不会混入真实session。320px Inspector继承现有壳层，正文内部滚动、状态/实际完成计数、固定唯一主动作，停止后保留或丢弃、关闭/Escape拒绝草稿并恢复原焦点。源session/version/handle变化后候选不可保留，未完成页不计入完成数。root负责最终生产构建和1280/420视觉浏览器。
