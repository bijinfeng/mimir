# v5协议与交互上下文索引

完整机器清单 `research/agui-v5-interaction-catalog.json`（约1.8MB，含403个历史v4 snapshot）与逐源码要求 `research/v5-interaction-parity.md` 是按需读取材料，不直接注入。本文为上下文摘要，不能代替逐项验收。

## 方向与边界

用户要求TanStack AI React+自有Mimir组件；v4仅保留交互基准。126目录项不是126协议组件；core0.0.59为36事件（含5个legacy Thinking），core1.0.0为31。403是场景覆盖条目，不是GUI测试数。产品和旧稿未改。

固定React0.30.3/client0.39.2/ai0.68.0；完整请求/queue/Agent风险见 `research/tanstack-v5-runtime.md`。SDK浅队列/清空不等价Mimir；同步深冻结所有发送记录。document-Agent移除wire parentRunId，resume false保持结果缓存。state/raw/reasoning生命周期用显式sidecar，legacy仅兼容检查，mimir.trace仍移除。

## 逐项入口

独立HTML `prototype/v5/interactions.html#<ID>`；同一组件与本地useChat连接，协议能力演示不等于产品已接。

- **AGUI-RUN-001 运行开始**：RUN_STARTED；状态 idle → running。
- **AGUI-RUN-002 运行完成 / 暂停 / 取消**：RUN_FINISHED；状态 running → success → interrupt → cancelled。
- **AGUI-RUN-003 运行失败**：RUN_ERROR；状态 running → error → retry-ready。
- **AGUI-STEP-001 步骤开始（数据）**：STEP_STARTED；状态 idle → step-running。
- **AGUI-STEP-002 步骤完成（数据）**：STEP_FINISHED；状态 step-running → step-complete。
- **AGUI-TEXT-001 文本开始**：TEXT_MESSAGE_START；状态 idle → empty-message。
- **AGUI-TEXT-002 文本流式增量**：TEXT_MESSAGE_CONTENT；状态 empty-message → streaming。
- **AGUI-TEXT-003 文本结束**：TEXT_MESSAGE_END；状态 streaming → complete。
- **AGUI-TEXT-004 文本便捷分片**：TEXT_MESSAGE_CHUNK；状态 idle → streaming → complete。
- **AGUI-TOOL-001 工具调用开始**：TOOL_CALL_START；状态 idle → arguments-streaming。
- **AGUI-TOOL-002 工具参数增量**：TOOL_CALL_ARGS；状态 arguments-streaming → arguments-ready。
- **AGUI-TOOL-003 参数接收结束**：TOOL_CALL_END；状态 arguments-streaming → executing。
- **AGUI-TOOL-004 工具便捷分片**：TOOL_CALL_CHUNK；状态 idle → arguments-streaming → executing。
- **AGUI-TOOL-005 工具结果**：TOOL_CALL_RESULT；状态 executing → complete → error。
- **AGUI-REASON-001 推理区间开始**：REASONING_START；状态 idle → reasoning-running。
- **AGUI-REASON-002 推理消息开始**：REASONING_MESSAGE_START；状态 reasoning-running → reasoning-empty。
- **AGUI-REASON-003 推理正文增量**：REASONING_MESSAGE_CONTENT；状态 reasoning-empty → reasoning-streaming。
- **AGUI-REASON-004 推理文本结束**：REASONING_MESSAGE_END；状态 reasoning-streaming → reasoning-message-complete。
- **AGUI-REASON-005 推理便捷分片**：REASONING_MESSAGE_CHUNK；状态 idle → reasoning-streaming → reasoning-complete。
- **AGUI-REASON-006 推理区间结束**：REASONING_END；状态 reasoning-running → reasoning-complete。
- **AGUI-REASON-007 加密推理（不展示原文）**：REASONING_ENCRYPTED_VALUE；状态 idle → opaque-stored。
- **AGUI-LEGACY-001 旧版思考 THINKING_START**：THINKING_START；状态 legacy-received → normalized-or-unsupported。
- **AGUI-LEGACY-002 旧版思考 THINKING_END**：THINKING_END；状态 legacy-received → normalized-or-unsupported。
- **AGUI-LEGACY-003 旧版思考 THINKING_TEXT_MESSAGE_START**：THINKING_TEXT_MESSAGE_START；状态 legacy-received → normalized-or-unsupported。
- **AGUI-LEGACY-004 旧版思考 THINKING_TEXT_MESSAGE_CONTENT**：THINKING_TEXT_MESSAGE_CONTENT；状态 legacy-received → normalized-or-unsupported。
- **AGUI-LEGACY-005 旧版思考 THINKING_TEXT_MESSAGE_END**：THINKING_TEXT_MESSAGE_END；状态 legacy-received → normalized-or-unsupported。
- **AGUI-STATE-001 共享状态快照**：STATE_SNAPSHOT；状态 empty-state → snapshot-applied。
- **AGUI-STATE-002 共享状态 JSON Patch**：STATE_DELTA；状态 snapshot-applied → patched → invalid-patch。
- **AGUI-STATE-003 会话消息快照**：MESSAGES_SNAPSHOT；状态 empty-messages → history-loaded → updated-snapshot。
- **AGUI-ACTIVITY-001 活动数据快照**：ACTIVITY_SNAPSHOT；状态 no-activity → activity-stored → unknown-activity。
- **AGUI-ACTIVITY-002 活动数据 JSON Patch**：ACTIVITY_DELTA；状态 activity-stored → activity-patched → invalid-patch。
- **AGUI-EXT-001 供应商原始事件**：RAW；状态 received → ignored-by-visible-ui。
- **AGUI-EXT-002 命名业务事件**：CUSTOM；状态 received → known-dispatched → unknown-ignored。
- **AGUI-SUB-001 子Agent启动**：SUBAGENT_STARTED；状态 idle → subagent-running。
- **AGUI-SUB-002 子Agent完成/挂起**：SUBAGENT_FINISHED；状态 subagent-running → success → suspended。
- **AGUI-SUB-003 子Agent失败**：SUBAGENT_ERROR；状态 subagent-running → error。
- **AGUI-MSG-001 消息角色与历史边界**：UI/业务动作；状态 developer → system → user → assistant → tool → activity → reasoning。
- **AGUI-MSG-002 正文与富文本**：UI/业务动作；状态 plain → markdown → partial-markdown → code → table → link → long-content。
- **AGUI-MSG-003 图片内容**：UI/业务动作；状态 loading → loaded → broken → open-original → unsafe-url。
- **AGUI-MSG-004 音频内容**：UI/业务动作；状态 loading → ready → playing → paused → error → unsupported-mime。
- **AGUI-MSG-005 视频内容（能力边界）**：UI/业务动作；状态 metadata-loading → ready → playing → paused → unsafe-source。
- **AGUI-MSG-006 文档内容 / UI文件附件**：UI/业务动作；状态 pending → ready → expired → download → unsafe-url。
- **AGUI-MSG-007 来源引用 / data映射**：UI/业务动作；状态 known-citations → unknown-data → source-url → source-document。
- **AGUI-MSG-008 多媒体来源信封**：UI/业务动作；状态 data-source → url-source → file-source → unsafe-source。
- **AGUI-ENV-001 请求信封 / 身份关联**：UI/业务动作；状态 new-run → parent-run → resume-run → invalid-id。
- **AGUI-ENV-002 metadata / usage / 能力声明**：UI/业务动作；状态 metadata-present → usage-present → unknown-keys → capability-missing。
- **AGUI-HITL-001 中断与待确认工具**：RUN_FINISHED / RUN_STARTED / TOOL_CALL_RESULT；状态 running → interrupt-pending → expanded。
- **AGUI-HITL-002 确认/拒绝/取消中断**：RUN_FINISHED / RUN_STARTED / TOOL_CALL_RESULT；状态 pending → resolved → cancelled → expired。
- **AGUI-HITL-003 客户端工具 / 画布版本守卫**：RUN_FINISHED / RUN_STARTED / TOOL_CALL_RESULT；状态 pending → validating → executing → stale → failed。
- **AGUI-HITL-004 工具结果续传失败恢复**：RUN_FINISHED / RUN_STARTED / TOOL_CALL_RESULT；状态 tool-complete → resume-sending → resume-failed → retrying → resumed。
- **AGUI-HITL-005 多个/过期/未知中断**：RUN_FINISHED / RUN_STARTED / TOOL_CALL_RESULT；状态 multiple-pending → expired → unknown → partially-addressed。
- **AGUI-HITL-006 停止与画布已修改**：RUN_FINISHED / RUN_STARTED / TOOL_CALL_RESULT；状态 executing → cancel-requested → cancelled → partial-draft → cancel-failed。
- **MIMIR-001 会话真实ID交接**：CUSTOM；状态 temporary → created → url-retained。
- **MIMIR-002 依据列表与原文导航**：CUSTOM；状态 empty → list → hover → focus → navigate。
- **MIMIR-003 分类失败与恢复出路**：CUSTOM；状态 rate-limit → timeout → truncated → network → retry → restore → search-only。
- **MIMIR-004 跨格式Agent状态**：CUSTOM；状态 running → completed → failed → stopped → stale。
- **MIMIR-005 DOCX历史兼容状态**：CUSTOM；状态 historical → mapped → unsupported-stale。
- **MIMIR-006 检索自定义过程完全删除**：CUSTOM；状态 event-received → not-rendered → not-reconstructed。
- **UI-001 输入编辑、换行、输入法**：UI/业务动作；状态 empty → focus → typing → multiline → composing。
- **UI-002 发送、准备与参数冻结**：UI/业务动作；状态 ready → preparing → running → complete → rejected。
- **UI-003 停止生成与部分回答**：UI/业务动作；状态 streaming → stopping → stopped → empty-stopped → error。
- **UI-004 追问队列与取回**：UI/业务动作；状态 running → queued-A → queued-B → dispatch-A → restore → failure。
- **UI-005 滚动、回底与焦点**：UI/业务动作；状态 pinned → scrolled-away → new-content → scroll-bottom → keyboard-focus。
- **UI-006 消息编辑与分支切换**：UI/业务动作；状态 view → editing → cancelled → saved → branch-prev → branch-next。
- **UI-007 复制回答/代码与失败反馈**：UI/业务动作；状态 idle → copying → copied → failed。
- **UI-008 重新生成与历史重试**：UI/业务动作；状态 complete → retry-ready → running → failed。
- **UI-009 推理与工具折叠**：UI/业务动作；状态 collapsed → expanded → running → complete → empty → long。
- **UI-010 临时附件上传、移除、取消**：UI/业务动作；状态 preparing → ready → failed → removed → cancelled → expired。
- **UI-011 附件限制、能力与历史**：UI/业务动作；状态 unsupported → size-limit → count-limit → total-limit → text-limit → no-vision → search-only → history-expired。
- **UI-012 图片/文件预览与安全下载**：UI/业务动作；状态 thumbnail → expanded → load-error → safe-link → unsafe-link。
- **UI-013 模型只读菜单和管理入口**：UI/业务动作；状态 closed → open → missing → same-name → long-name → manage-model。
- **UI-014 标准/深入思考强度**：UI/业务动作；状态 standard → deep → side-standard-disabled → open → dismiss。
- **UI-015 范围全库/单文档**：UI/业务动作；状态 all → single → loading → empty → error → long-title → replace → remove。
- **UI-016 容量用量浮层**：UI/业务动作；状态 missing → partial-null → known → open → closed。
- **UI-017 回答保存笔记**：UI/业务动作；状态 eligible → saving → saved → failed → open-note → ineligible。
- **UI-018 历史读取、列表、切换**：UI/业务动作；状态 loading → empty → loaded → selected → error → cached-refresh-error。
- **UI-019 空态、快捷建议与草稿交接**：UI/业务动作；状态 empty → suggestion-focus → prefill → sent → consumed → expired。
- **UI-020 侧栏开关、导航、抽屉与离开保护**：UI/业务动作；状态 wide → narrow → drawer → hidden-running → reopened → unsaved → return-focus。
- **UI-021 引用导航与跨篇守卫**：UI/业务动作；状态 source-list → hover → keyboard-focus → same-doc → cross-doc → unsaved。
- **UI-022 Agent能力、句柄与轮次寿命**：UI/业务动作；状态 detecting → failed → no-model → no-executor → canvas-not-ready → ready → stale。
- **UI-023 Agent截图冻结/取回/失败隔离**：UI/业务动作；状态 draft → removed → frozen → queued → stale → restore-empty → restore-busy → failed。
- **UI-024 Agent媒体选择与原件分析**：UI/业务动作；状态 picker-open → cancelled → selected → analyzing → failed → source-changed。
- **UI-025 Agent部分草稿、回退与新文档交接**：UI/业务动作；状态 partial → keep → discard → rollback → created → saved-unparsed → open → stale。
- **UI-026 Agent历史与取消待处理**：UI/业务动作；状态 pending → completed → failed → cancelled → cancel-failed。
- **UI-027 主题、窄屏、减少动态与可访问性**：UI/业务动作；状态 light → dark → narrow → long-label → zoom → reduced-motion。
- **UI-028 失败分类、只检索与放回输入框**：UI/业务动作；状态 rate-limit → timeout → truncated → network → retry → restore → search-only → blocked。
- **UI-029 标准聊天附件与Agent入口隔离**：UI/业务动作；状态 normal-chat → agent-disabled → snapshot-only → switch-mode。
- **UI-030 检索旧过程永久退役**：UI/业务动作；状态 legacy-history → legacy-live → no-trace-ui。
- **OFF-001 消息动作条显隐**：UI/业务动作；状态 running-hidden → last-visible → older-hover-focus。
- **OFF-002 复制消息与已复制反馈**：UI/业务动作；状态 idle → copied → copy-failed。
- **OFF-003 More菜单→Markdown导出**：UI/业务动作；状态 closed → open → download → dismissed。
- **OFF-004 Helpful / Not helpful能力门控**：UI/业务动作；状态 capability-off → capability-on → positive → negative → submitted。
- **OFF-005 Refresh重新生成能力门控**：UI/业务动作；状态 eligible → ineligible → running → regenerated → failed。
- **OFF-006 用户消息编辑 / Cancel / Update**：UI/业务动作；状态 view → editing → edited → cancelled → updated → failed。
- **OFF-007 分支前后切换与数量**：UI/业务动作；状态 single-hidden → first → middle → last。
- **OFF-008 加载更早历史与终页回焦**：UI/业务动作；状态 unavailable → available → loading → loaded → last-page。
- **OFF-009 历史骨架 / 欢迎 / 空态居中**：UI/业务动作；状态 startup → history-loading → history-error → empty → messages。
- **OFF-010 主消息滚动 / 回底 / footer**：UI/业务动作；状态 turn-top → pinned → off-bottom → return-bottom。
- **OFF-011 空态建议 / 回答后建议横向滚动**：UI/业务动作；状态 empty-suggestions → draft-hides → followup → overflow → rtl → running-hides。
- **OFF-012 输入键盘与发送/停止互斥**：UI/业务动作；状态 empty → editable → composing → queued → preparing → running。
- **OFF-013 附件选择 / 拖入 / 粘贴**：UI/业务动作；状态 capability-off → picker → dragging → drop → paste → rejected。
- **OFF-014 附件tile状态、移除与错误Tooltip**：UI/业务动作；状态 thumbnail → fallback → uploading → failed → removed → sent。
- **OFF-015 附件图片预览Dialog**：UI/业务动作；状态 closed → loading → open → closed-refocus。
- **OFF-016 消息图片缩放与键盘闭环**：UI/业务动作；状态 generating → loaded → broken → filtered → zoomed → closed-refocus。
- **OFF-017 默认图片无动作条的边界**：UI/业务动作；状态 default-no-actions → optional-exported-actions。
- **OFF-018 文件安全下载与MIME分派**：UI/业务动作；状态 file → image → audio → video → unsafe-source → download。
- **OFF-019 音频播放、进度与错误**：UI/业务动作；状态 metadata-loading → paused → playing → seek → play-rejected → media-error → src-changed。
- **OFF-020 视频原生controls**：UI/业务动作；状态 metadata-loading → ready → playing → paused → seek → volume → fullscreen。
- **OFF-021 思考默认自动开合**：UI/业务动作；状态 stream-auto-open → manual-open → manual-closed → complete-auto-collapsed → complete-manual-kept。
- **OFF-022 思考内层跟随与外层滚动锁**：UI/业务动作；状态 preview-pinned → preview-scrolled-up → preview-return-bottom → collapsed。
- **OFF-023 工具分组与单工具开合**：UI/业务动作；状态 group-collapsed → group-expanded → tool-collapsed → tool-expanded → running → complete → cancelled → failed。
- **OFF-024 工具Args/Result显示边界**：UI/业务动作；状态 args-partial → args-ready → result-ready → empty-result → error。
- **OFF-025 工具审批Allow/Deny、选项与二次确认**：UI/业务动作；状态 requires-action → allow → deny → custom-option → confirm → back → submitted → error → receipt。
- **OFF-026 工具问题、自由文本与多问题表单**：UI/业务动作；状态 question → text-answer → single-choice → multi-choice → required-incomplete → complete → dismissed。
- **OFF-027 工具答复排队、审批回执与焦点**：UI/业务动作；状态 queued-not-sent → submitted → settled-receipt → send-failed → focus-return。
- **OFF-028 语音输入与spoken消息能力边界**：UI/业务动作；状态 dictation-off → dictation-ready → dictating → stop-dictation → voice-message → speaking。
- **OFF-029 Markdown链接/表格/代码交互**：UI/业务动作；状态 streaming-markdown → safe-link → table-overflow → code-copy → copied → failed。
- **OFF-030 错误占位、工作中指示及取消发送**：UI/业务动作；状态 indicator → error → cancel-sending → stop-generating。
- **AGUI-FLOW-001 运行事件顺序与终局约束**：UI/业务动作；状态 first-event-invalid → nested-run → after-terminal → valid-next-run。
- **AGUI-FLOW-002 流分片和显式三段归一**：UI/业务动作；状态 explicit-triad → chunk-only → mixed-conflict → missing-first-id。
- **AGUI-FLOW-003 归属ID、嵌套子Agent与关闭**：UI/业务动作；状态 correct-parent → unknown-parent → duplicate-id → subagent-pending → root-finished-too-early。
- **AGUI-FLOW-004 补丁六类操作、activity替换与错误恢复**：UI/业务动作；状态 add → remove → replace → move → copy → test → replace-false → invalid-op。
- **AGUI-FLOW-005 0.0.59与1.0取消终态兼容**：UI/业务动作；状态 old-rejects-cancelled → new-accepts-cancelled → host-abort。
- **AGUI-FLOW-006 多媒体工具结果和file source版本差异**：UI/业务动作；状态 string-result → parts-result → data-source → url-source → file-handle。
- **AGUI-FLOW-007 恢复请求而非虚构INTERRUPT事件**：UI/业务动作；状态 interrupted → resume-prepared → resolved → cancelled → expired → unknown → missing-entry。
- **AGUI-FLOW-008 未知扩展和不可执行生成UI**：UI/业务动作；状态 unknown-custom → unknown-activity → unknown-part → unsafe-link → opaque-reasoning。

## 实际挂载行为提醒

More仅Markdown导出；ToolFallback Args/Result为纵向pre，无tab/copy；默认图片仅thumbnail/fullscreen/zoom/Esc/焦点返回，无额外动作栏；file有audio/video。思考生命周期/默认开合/手动选择、编辑取消更新/分支、更早历史/滚动跟随、附件拖放粘贴、菜单键盘、复制反馈须逐源码核对，不能用unsupported跳过原有动作。目录OFF条目列明完整预期。


### v5 续传与准备期补充合同

RUN_ERROR 可能清空 SDK lastResume；必须同时冻结原始 {threadId, runId} 与工具答复，失败后调用 resumeInterruptsUnsafe(responses, originalTarget)，检查布尔返回值，成功/明确取消/新轮次才清理；用第三次实际连接证明恢复，不以按钮反馈代替。附件准备完成只能清理本次捕获的附件 ID；若准备期间出现新草稿或新附件，必须保留，宿主状态同步也不能覆盖。REASONING_END 结束可见思考状态，不等待正文 RUN_FINISHED。
