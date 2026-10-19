# Research: v5 interaction parity against frozen v4 source

- Query: 自定义样式替换 assistant-ui 时，哪些精确操作、键盘、状态转换和能力门控必须逐项保真？
- Scope: internal; frozen v4 source and all 403 source routes; planning only
- Date: 2026-10-19

## Findings

The selected source is assistant-ui commit `a587b2838f2d644549d216098d54cfbeedfac522`, preserved under `prototype/v4/vendor/`. The v4 runtime version is0.15.29/core0.3.29. Current product versions are not rewritten. The user's new direction replaces the v4 visual/official-component requirement; these behavioral contracts stay. This is **30 exact source-parity items plus 30 host items**, within the126-entry catalog, not60 protocol components.

A demo must expose every listed action and observable transition, including keyboard, cancelled/error/retry and focus behavior when applicable. Unsupported host capabilities require an explicit disabled/unavailable presentation with a reason rather than fake success. Some source APIs exist but are not mounted by default; copying those into default UI would add interactions.

### UI-001 · 输入编辑、换行、输入法

- States: empty → focus → typing → multiline → composing
- Trigger/keyboard: 输入 / Enter / Shift+Enter / Escape [按钮 Enter/Space]
- Required result/boundary: Enter发送，Shift+Enter换行；IME组合确认不误发送；空闲Escape不丢草稿。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-002 · 发送、准备与参数冻结

- States: ready → preparing → running → complete → rejected
- Trigger/keyboard: 点击发送 / Enter [按钮 Enter/Space]
- Required result/boundary: 发送开始即冻结文字/附件/范围/deepReasoning；异步附件完成后不得读取新设置。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-003 · 停止生成与部分回答

- States: streaming → stopping → stopped → empty-stopped → error
- Trigger/keyboard: 点击停止 / Escape层级 [按钮 Enter/Space]
- Required result/boundary: 保留部分正文；错误不能显示已停止；pending附件取消保留原草稿。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-004 · 追问队列与取回

- States: running → queued-A → queued-B → dispatch-A → restore → failure
- Trigger/keyboard: 生成中Enter排队 / 取回 [按钮 Enter/Space]
- Required result/boundary: A/B保留入队冻结参数；后改C不影响A/B。停止/失败按v4取回首条，用户新草稿不能被覆盖。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-005 · 滚动、回底与焦点

- States: pinned → scrolled-away → new-content → scroll-bottom → keyboard-focus
- Trigger/keyboard: 滚离底部 / 回到底部 [按钮 Enter/Space]
- Required result/boundary: 用户离底时不抢滚动，回底按钮键盘可用；流更新不抢输入焦点。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-006 · 消息编辑与分支切换

- States: view → editing → cancelled → saved → branch-prev → branch-next
- Trigger/keyboard: 编辑 / 保存 / 取消 / 前后分支 [按钮 Enter/Space]
- Required result/boundary: 保留v4官方编辑和分支交互；需明确真实消息树与API能力，不能只改展示文字。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-007 · 复制回答/代码与失败反馈

- States: idle → copying → copied → failed
- Trigger/keyboard: 点击复制 [按钮 Enter/Space]
- Required result/boundary: 复制成功短暂反馈；失败明确重试，代码仅复制正文。失败/未完Agent不开放不适用动作。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-008 · 重新生成与历史重试

- States: complete → retry-ready → running → failed
- Trigger/keyboard: 重新生成 / 重试 [按钮 Enter/Space]
- Required result/boundary: 按v4上一问定位并使用明确冻结/当前参数合同；运行中不得并发覆盖。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-009 · 推理与工具折叠

- States: collapsed → expanded → running → complete → empty → long
- Trigger/keyboard: Enter/Space开合 [按钮 Enter/Space]
- Required result/boundary: 初始开合和结束行为与v4一致；手动选择不被流更新反复重置。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-010 · 临时附件上传、移除、取消

- States: preparing → ready → failed → removed → cancelled → expired
- Trigger/keyboard: 添加文件 / 移除 / 取消准备 [按钮 Enter/Space]
- Required result/boundary: 与知识库永久导入分离；pending不可假装已发送，失败保留可恢复内容。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-011 · 附件限制、能力与历史

- States: unsupported → size-limit → count-limit → total-limit → text-limit → no-vision → search-only → history-expired
- Trigger/keyboard: 选择边界文件 / 查看原因 [按钮 Enter/Space]
- Required result/boundary: 24个v4 ATT状态全保留；拟定大小不能宣传为已接API政策；历史过期明确不能恢复本地字节。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-012 · 图片/文件预览与安全下载

- States: thumbnail → expanded → load-error → safe-link → unsafe-link
- Trigger/keyboard: 预览 / 关闭 / 下载 [按钮 Enter/Space]
- Required result/boundary: Esc关闭后回到原触发器；仅安全来源可开，坏图可恢复；禁止javascript/file任意协议。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-013 · 模型只读菜单和管理入口

- States: closed → open → missing → same-name → long-name → manage-model
- Trigger/keyboard: 打开菜单 / Tab / Arrow / Escape [按钮 Enter/Space]
- Required result/boundary: 展示全局chat/reasoning绑定，只读；管理跳转。不能变成临时任意模型切换。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-014 · 标准/深入思考强度

- States: standard → deep → side-standard-disabled → open → dismiss
- Trigger/keyboard: 选择标准/深入 [按钮 Enter/Space]
- Required result/boundary: deepReasoning是角色路由布尔值，不是provider reasoningEffort；侧栏固定标准。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-015 · 范围全库/单文档

- States: all → single → loading → empty → error → long-title → replace → remove
- Trigger/keyboard: 打开范围 / 选择单文档 / 取消 [按钮 Enter/Space]
- Required result/boundary: 最近20候选，全库或单篇；不是多知识库多选。焦点和原草稿稳定；重试读取诚实。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-016 · 容量用量浮层

- States: missing → partial-null → known → open → closed
- Trigger/keyboard: 打开用量 / Escape [按钮 Enter/Space]
- Required result/boundary: 未知用量不假报0；数据浮层关闭回焦，窄栏不溢出。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-017 · 回答保存笔记

- States: eligible → saving → saved → failed → open-note → ineligible
- Trigger/keyboard: 保存 / 打开笔记 / 重试 [按钮 Enter/Space]
- Required result/boundary: 只保存已落库成功回答；写入失败可重试；不得把错误正文保存成笔记。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-018 · 历史读取、列表、切换

- States: loading → empty → loaded → selected → error → cached-refresh-error
- Trigger/keyboard: 选择会话 / 重读 [按钮 Enter/Space]
- Required result/boundary: 切换真实历史与首次建会话区分；历史失败不伪装暂无会话，正在流保留。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-019 · 空态、快捷建议与草稿交接

- States: empty → suggestion-focus → prefill → sent → consumed → expired
- Trigger/keyboard: 点建议 / 新建 / 预填 [按钮 Enter/Space]
- Required result/boundary: 建议append也要冻结参数；宿主草稿一次消费，刷新寿命边界如实展示。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-020 · 侧栏开关、导航、抽屉与离开保护

- States: wide → narrow → drawer → hidden-running → reopened → unsaved → return-focus
- Trigger/keyboard: 开关助手 / Tab循环 / Escape [按钮 Enter/Space]
- Required result/boundary: 关闭保活且生成继续；覆盖态焦点循环、Esc层级与关闭回焦，未保存确认保留。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-021 · 引用导航与跨篇守卫

- States: source-list → hover → keyboard-focus → same-doc → cross-doc → unsaved
- Trigger/keyboard: 打开依据 / 返回 [按钮 Enter/Space]
- Required result/boundary: 来源pill是UI语义，不是AGUI Source事件；保留原文定位与取消离开。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-022 · Agent能力、句柄与轮次寿命

- States: detecting → failed → no-model → no-executor → canvas-not-ready → ready → stale
- Trigger/keyboard: 检测 / 重试 / 开始执行 [按钮 Enter/Space]
- Required result/boundary: 主对话只读上下文不等于执行句柄；文档/版本/格式/轮次全部匹配才执行。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-023 · Agent截图冻结/取回/失败隔离

- States: draft → removed → frozen → queued → stale → restore-empty → restore-busy → failed
- Trigger/keyboard: 截图发送 / 排队 / 取回 / 重试 [按钮 Enter/Space]
- Required result/boundary: 真实PNG受源页/版本/视觉/执行器/尺寸/四份保护约束；通用附件不冒充截图。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-024 · Agent媒体选择与原件分析

- States: picker-open → cancelled → selected → analyzing → failed → source-changed
- Trigger/keyboard: 选择媒体 / 取消 / 分析 [按钮 Enter/Space]
- Required result/boundary: 本地媒体原件与聊天附件分离；选择期间画布变化拒绝执行。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-025 · Agent部分草稿、回退与新文档交接

- States: partial → keep → discard → rollback → created → saved-unparsed → open → stale
- Trigger/keyboard: 保留 / 丢弃 / 回退 / 打开新文档 [按钮 Enter/Space]
- Required result/boundary: 真实画布是否已改如实说明，后续人工修改阻止旧回退；解析失败不丢已保存文件。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-026 · Agent历史与取消待处理

- States: pending → completed → failed → cancelled → cancel-failed
- Trigger/keyboard: 打开原文档 / 取消待处理 [按钮 Enter/Space]
- Required result/boundary: 历史仅工具名和状态摘要；不可在普通历史消息中自动执行工具。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-027 · 主题、窄屏、减少动态与可访问性

- States: light → dark → narrow → long-label → zoom → reduced-motion
- Trigger/keyboard: 切换主题 / 窄容器 / 键盘全遍历 [按钮 Enter/Space]
- Required result/boundary: 只换视觉，组件状态/可操作性/语义/焦点/布局稳定都保持；无hover抖动。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-028 · 失败分类、只检索与放回输入框

- States: rate-limit → timeout → truncated → network → retry → restore → search-only → blocked
- Trigger/keyboard: 重试 / 放回输入框 / 只检索 [按钮 Enter/Space]
- Required result/boundary: 截图/Agent模式禁止的操作要明确原因；恢复图文与目标，已有新草稿不覆盖。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-029 · 标准聊天附件与Agent入口隔离

- States: normal-chat → agent-disabled → snapshot-only → switch-mode
- Trigger/keyboard: 切换宿主场景 [按钮 Enter/Space]
- Required result/boundary: 标准附件纳入规划；Agent当前只认可截图或受控媒体，不把KB导入当附件或越过执行边界。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### UI-030 · 检索旧过程永久退役

- States: legacy-history → legacy-live → no-trace-ui
- Trigger/keyboard: 载入旧trace样本 [按钮 Enter/Space]
- Required result/boundary: 不渲染、不重建mimir.trace；真实reasoning/tool保留。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts`; `.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-001 · 消息动作条显隐

- States: running-hidden → last-visible → older-hover-focus
- Trigger/keyboard: 移入旧消息 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; Tab聚焦旧消息动作 [Tab聚焦旧消息动作]; 开始生成 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: hideWhenRunning；autohide=not-last。最后回答可见，旧回答hover/focus可达；不能只靠鼠标hover。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx:733`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-002 · 复制消息与已复制反馈

- States: idle → copied → copy-failed
- Trigger/keyboard: 复制回答 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 再次复制 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: 官方Copy图标切换Check；Clipboard失败不能假报成功。语音消息也有Copy，运行时隐藏。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx:740`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-003 · More菜单→Markdown导出

- States: closed → open → download → dismissed
- Trigger/keyboard: 打开More [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 上下键选择 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; Enter导出 [Enter导出]; Escape关闭回焦 [Escape关闭回焦]
- Required result/boundary: 仅Export as Markdown。默认Thread没有PDF/DOCX导出，不能为对齐交互新增两项。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx:773`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-004 · Helpful / Not helpful能力门控

- States: capability-off → capability-on → positive → negative → submitted
- Trigger/keyboard: 设置feedback能力 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 提交好评 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 提交差评 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: 仅thread.capabilities.feedback=true才挂载；提交态aria/data与反馈错误由运行时负责，无宿主能力显示不支持。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx:750`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-005 · Refresh重新生成能力门控

- States: eligible → ineligible → running → regenerated → failed
- Trigger/keyboard: Refresh [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 切换能力边界 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: Reload primitive控制资格/状态；没有reload执行通路不得保留可点假按钮。刷新生成分支的语义须由新消息树实现。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx:768`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-006 · 用户消息编辑 / Cancel / Update

- States: view → editing → edited → cancelled → updated → failed
- Trigger/keyboard: Edit [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 修改文字 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; Cancel [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; Update [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: 用户动作条hideWhenRunning/autohide=not-last；编辑器自动聚焦。原文Cancel不变；Update为真实运行，不是直接改DOM。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx:855`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-007 · 分支前后切换与数量

- States: single-hidden → first → middle → last
- Trigger/keyboard: Previous [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; Next [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: hideWhenSingleBranch；显示当前number/count，边界不可越界。用户与助手皆有picker；产品消息树能力尚需真实验证。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx:899`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-008 · 加载更早历史与终页回焦

- States: unavailable → available → loading → loaded → last-page
- Trigger/keyboard: Load earlier [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 在终页完成时保持键盘位置 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: hasEarlier/isLoadingEarlier门控；status读屏；最后按钮卸载后若用户焦点在该按钮，转移到下一个可聚焦控件，不回body。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx:388`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-009 · 历史骨架 / 欢迎 / 空态居中

- States: startup → history-loading → history-error → empty → messages
- Trigger/keyboard: 首次加载 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 切换历史 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 输入文字 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: 启动placeholder与切换历史分开；加载历史显示骨架而不是欢迎；welcome suggestions仅新会话且composer空时展示。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx:146`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-010 · 主消息滚动 / 回底 / footer

- States: turn-top → pinned → off-bottom → return-bottom
- Trigger/keyboard: 向上滚动 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 新token到达 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; Scroll to bottom [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: Viewport turnAnchor=top；footer有消息后sticky；回底按钮底部disabled invisible。content-visibility:auto用于长消息，不等于已使用虚拟列表。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx:212`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-011 · 空态建议 / 回答后建议横向滚动

- States: empty-suggestions → draft-hides → followup → overflow → rtl → running-hides
- Trigger/keyboard: 点建议发送 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 横向滚动 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; Tab到边界建议 [Tab到边界建议]
- Required result/boundary: 非空且非运行且有suggestions时展示followup；边缘渐隐跟随滚动、RTL物理方向，focus ring不被裁切；建议走同一发送冻结入口。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/follow-up-suggestions.aui.tsx:6`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-012 · 输入键盘与发送/停止互斥

- States: empty → editable → composing → queued → preparing → running
- Trigger/keyboard: Enter [Enter]; Shift+Enter [Shift+Enter]; Cmd/Ctrl+Shift+Enter [Cmd/Ctrl+Shift+Enter]; Escape [Escape]
- Required result/boundary: 普通Enter遵守queue能力；Shift+Enter换行；Cmd/Ctrl+Shift+Enter在队列能力下是steer hotkey，需明确与普通排队区别。Esc只在该输入有焦点且canCancel时取消；IME不触发。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx:521`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-013 · 附件选择 / 拖入 / 粘贴

- States: capability-off → picker → dragging → drop → paste → rejected
- Trigger/keyboard: Add Attachment [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 拖入文件 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 离开dropzone [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 粘贴图文 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: 仅attachments能力开启时接受文件；dragging状态清除可靠。paste含files时走附件流程，不混为普通文本。文件选择取消不删原草稿。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx:499`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-014 · 附件tile状态、移除与错误Tooltip

- States: thumbnail → fallback → uploading → failed → removed → sent
- Trigger/keyboard: hover/focus名称 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; Remove附件 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 重试准备 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: 上传spinner/错误overlay以及status可读；composer可Remove，message附件不可Remove；名称+错误tooltip；缩略缺失fallback图标。移除清理其错误，不清聊天连接错误。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/attachment.aui.tsx:133`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-015 · 附件图片预览Dialog

- States: closed → loading → open → closed-refocus
- Trigger/keyboard: Enter/Space预览 [Enter/Space预览]; Escape关闭 [Escape关闭]; 关闭按钮 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; Tab循环 [Tab循环]
- Required result/boundary: 与消息ImageZoom是两种具体预览；DialogTitle有Preview name；无src的普通文件tile不伪造图片预览。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/attachment.aui.tsx:69`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-016 · 消息图片缩放与键盘闭环

- States: generating → loaded → broken → filtered → zoomed → closed-refocus
- Trigger/keyboard: Enter或Space缩放 [Enter或Space缩放]; 点图片关闭 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 点遮罩关闭 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; Escape [Escape]; Tab循环 [Tab循环]
- Required result/boundary: 打开后focus关闭按钮、body滚动锁、Tab循环；关闭回缩略trigger。ImageImpl有running与content-filter两个特殊态。不是多档倍率缩放器。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/image.tsx:397`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-017 · 默认图片无动作条的边界

- States: default-no-actions → optional-exported-actions
- Trigger/keyboard: 查看默认图 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 查看可选API说明 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: Image.Actions源码导出下载/复制/可选Regenerate，但ImageImpl未挂载。v5不得以已存在API为由加到默认UI；需要新增时另审。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/image.tsx:619`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-018 · 文件安全下载与MIME分派

- States: file → image → audio → video → unsafe-source → download
- Trigger/keyboard: 点击安全下载 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 切换MIME样本 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: image/*由MessageFile转Image；audio/video由FilePlayer。非法href不渲染download；url下载target blank noopener；base64/data显示估算size。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/file.tsx:251`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-019 · 音频播放、进度与错误

- States: metadata-loading → paused → playing → seek → play-rejected → media-error → src-changed
- Trigger/keyboard: Play/Pause [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 键盘或指针Seek [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 替换src [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 模拟加载错误 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: unknown duration显示--:--；range step0.1；错误禁play/seek并alert；src变更重置。Play Promise拒绝但audio.error为空时保持暂停，不伪造媒体错误。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/media-player.tsx:77`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-020 · 视频原生controls

- States: metadata-loading → ready → playing → paused → seek → volume → fullscreen
- Trigger/keyboard: 原生播放/暂停 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 进度/音量 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 全屏 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 替换src [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: video controls/playsInline/preload metadata；实际控件和快捷键依浏览器，保持原生，不自造未有的播放面板。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/media-player.tsx:222`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-021 · 思考默认自动开合

- States: stream-auto-open → manual-open → manual-closed → complete-auto-collapsed → complete-manual-kept
- Trigger/keyboard: 开始stream [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 手动开合 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 结束stream [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: 无手动操作时stream保持开、完成回defaultOpen(false)；首次手动toggle永久接管open。不能在每个token或完成时强制覆盖手动选择。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/reasoning.tsx:42`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-022 · 思考内层跟随与外层滚动锁

- States: preview-pinned → preview-scrolled-up → preview-return-bottom → collapsed
- Trigger/keyboard: 内层上滚 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 追加推理token [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 回内层底部 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 开合 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: 内层max-h64预览；上滚暂停跟随、回底恢复；group开合锁外层scroll。时长由timing秒数，不伪造思考轮次数或工具计数摘要。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/reasoning.tsx:248`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-023 · 工具分组与单工具开合

- States: group-collapsed → group-expanded → tool-collapsed → tool-expanded → running → complete → cancelled → failed
- Trigger/keyboard: 展开工具组 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 展开单个工具 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 结束/失败工具 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: 工具组ghost默认折叠、count+active spinner；单工具默认折叠，requires-action出现自动打开；cancelled与failed不同图标文案。开合保持外层滚动位置。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/tool-group.aui.tsx:43`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-024 · 工具Args/Result显示边界

- States: args-partial → args-ready → result-ready → empty-result → error
- Trigger/keyboard: 展开工具数据 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 长JSON滚动 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: 固定源码Args与Result纵向pre文本，没有Args/Result tab，没有参数复制按钮。结果对象格式化JSON；不可序列化值有安全fallback。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/tool-fallback.aui.tsx:253`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-025 · 工具审批Allow/Deny、选项与二次确认

- States: requires-action → allow → deny → custom-option → confirm → back → submitted → error → receipt
- Trigger/keyboard: Allow/Deny [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 选指定option [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; Confirm [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; Back [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: SDK approval不是新的AGUI event。已声明options按allow/custom/reject排序；confirm=true先确认；提交锁避免重复，异步拒绝重开controls显示错误；仅有可用respondToApproval/resume才可执行。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/tool-fallback.aui.tsx:728`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-026 · 工具问题、自由文本与多问题表单

- States: question → text-answer → single-choice → multi-choice → required-incomplete → complete → dismissed
- Trigger/keyboard: 选择答案 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 输入文本 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; Send [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; Dismiss [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: question不臆造决策按钮；questions表单按required验证，单/多选依据声明；Dismiss只在dismissible；note有输入时随决策发送，dismiss不带草稿。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/tool-fallback.aui.tsx:532`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-027 · 工具答复排队、审批回执与焦点

- States: queued-not-sent → submitted → settled-receipt → send-failed → focus-return
- Trigger/keyboard: 提交批准 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 模拟排队 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 恢复发送 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 失败后重答 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: responseDeliveryStatus queued显示Reply queued, not sent yet；已答复不等于已到服务器。审批控件卸载时按焦点来源转到回执/trigger，不夺用户其他输入焦点。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/tool-fallback.aui.tsx:150`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-028 · 语音输入与spoken消息能力边界

- States: dictation-off → dictation-ready → dictating → stop-dictation → voice-message → speaking
- Trigger/keyboard: Start voice input [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; Stop voice input [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; Copy spoken message [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: 仅dictation能力显示麦克风。spoken通过metadata.modality=voice呈现、连续交换分组和speaking状态。Mimir未接通语音会话→沙盒显示不可用，不能把普通audio附件当通话能力。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx:286`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-029 · Markdown链接/表格/代码交互

- States: streaming-markdown → safe-link → table-overflow → code-copy → copied → failed
- Trigger/keyboard: 打开链接 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 横向滚动表格/代码 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 复制代码 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: 保留代码头语言名、只复制code正文、图标反馈；长表格横滚；部分Markdown流不阻塞渲染。没有v4未提供的语法语言切换功能。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/markdown-text.tsx:69`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### OFF-030 · 错误占位、工作中指示及取消发送

- States: indicator → error → cancel-sending → stop-generating
- Trigger/keyboard: 零part运行 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 零part失败 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 取消附件准备 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]; 停止生成 [Enter/Space；菜单ArrowUp/ArrowDown，弹层Escape]
- Required result/boundary: isSending区分submission pending与有可取消run。Cancel sending不是Stop generating；ErrorPrimitive消息与host分类失败应避免重复误报。
- Evidence: `.trellis/tasks/10-18-interaction-chat/prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx:610`
- Verification: pending independent HTML / browser acceptance; no production pass claimed.

### Source route completeness

`agui-v5-interaction-catalog.json.v4Parity.routesDetail` has every original route with its full source/current/proposed/boundary/path/ui data, catalogIds and `verified=false`. Totals72 groups403 routes (379 originals+24 standard-attachment planning). No original group has an empty mapping. The trace group remains deliberately removed; the old “official style/no custom renderer” requirement is superseded, so do not inherit that phrasing as the new design restriction.

### High risk parity checks

1. Freeze settings before asynchronous preparation for mouse send, Enter/queue and suggestion append; change A→B while preparing, verify sent A. Queue A/B then edit C; dispatch A/B unchanged.
2. Close reasoner manually while streaming and complete; verify manual state persists. In a separate untouched run verify auto-open then auto-collapse. Scroll reasoning preview up before new tokens; verify no forced pin.
3. Mouse/keyboard open message zoom; Tab cycle, Escape/overlay/image/close all restore original trigger. Attachment preview is a separate Dialog; don't merge focus semantics accidentally.
4. Click Stop during run versus Cancel sending during attachment preparation; preserve appropriate draft, partial body, target and attachment. Error cannot also read “stopped”.
5. Agent tool modifies once, continuation fails, retry cached result under version guard; verify no duplicate execution. External manual edit then retry/rollback must refuse stale state.
6. File/image/audio/video branch and safe URL/data sources: verify audio seek/metadata/error, native video controls, disabled unsafe download. Optional exported image action APIs are not part of default baseline.
7. More has Markdown only; vertical tool Args/Result has no tabs/copy; feedback/dictation only exist with adapter capability. New UI must not claim those adapters are already live.
8. Loading earlier history finishes final page while keyboard focus is on button; verify focus proceeds to next real control. History fetch errors stay errors, not empty welcome screens.

### External references and related specs

See `agui-v5-interaction-catalog.md` for pinned AG-UI docs/core versions, the required same-day WeKnorav0.8.3/commit2c0d838 reference and its business-only relevance, project specs and schema evidence. Main reference here is the actual frozen v4 source for behavior; new visual style comes from the project's approved theme.

## Caveats / Not Found

No PDF/DOCX export, default tool tabs/copy, default image action bar, or virtual-list engine was found in the frozen mounted Thread. They must not be advertised as preserved existing interactions. UI source capability branches are evidence of behavior when enabled, not proof that Mimir already implements their adapters. Raw403 route presence and126 catalog entries are coverage documentation, not126 component implementations or403 completed browser tests.
