# 技术设计：官方 Headless UI 接入

## 目标结构

```text
ChatPanel（主视图与侧栏共用）
  useMimirRuntime → 唯一真实 useChat 实例
  Mimir 业务上下文（io、草稿、SendIntent、sidecar、Agent 守卫）
  官方 createChatUI.Provider/Chat（接同一 useChat host）
    layout → 现有加载/空态/滚动/输入布局
    Messages → 官方消息列表与 Message shell
      Message/Parts/Part → 官方内容选择和组件分发
        TextPart + 原 CodeBlock
        thinking/tool/media/structured 等注册 Mimir 展示组件
    Input → 原 Composer + 原发送快照入口
    DocxInterruptBridge → 原 client_tool 中断/目标守卫/缓存续传
```

官方封装负责通用UI组织；Mimir业务上下文只保留宿主业务与已批准交互，不维持第二份UIMessage数组或第二套SDK实例。详细证据见 [research/official-ui-boundary.md](research/official-ui-boundary.md)。

## 选择 createChatUI 而非新开 useAppChat

`createChatUI` 是官方公开套件，支持把现有真实 `UseChatReturn` 注入 Provider。现有运行入口为每个面板构造固定连接，`onChunk`关联canonical消息ID、Agent来源、终态与sidecar。高层 `createChatHook` 的实例override不含connection/onChunk/onError；为使用它而重新迁移闭包会扩大风险。采用官方UI套件已满足“使用官方封装”，既不复制它的实现，也不创建新的chat实例。

`useMimirRuntime`返回现有host供UI使用；不把业务 `RuntimeView` 断言成 SDK host，不伪造SDK字段。保留当前发送/取消/历史算法，官方UI只读取和订阅同一host。

## 注册与状态所有权

| 层 | 所有者 | 接入约束 |
| --- | --- | --- |
| 流连接/协议reducer/原生messages | 现有useChat | 一个实例，线程key与URL稳定性不变 |
| 消息选择/parts分发/工具-result关联 | 官方UI kit及公开selector | 删除自有通用NativePart分派；slot表/工厂在模块级保持稳定 |
| 外观/中文文案/几何/折叠/焦点 | Mimir注册组件 | 沿v7，使用现有主题tokens，不直接采用便捷ThinkingPart英文/Tailwind外观 |
| 草稿/独立FIFO/临时附件/保存/本地分支 | 现有Mimir业务层 | 同一SendIntent队列，官方Input接业务send；不从SDK自动queue绕过快照与租约 |
| Agent执行/原目标/缓存/权限 | DocxInterruptBridge和server原合同 | UI展示不能发明通用审批授权；client_tool仍通过原run/thread目标续传 |

工厂与widgets单向依赖：UI contexts模块先创建；运行层不import展示工厂；widgets通过官方chat context与现有业务context读状态，避免factory ↔ MessageItem循环导入。只把新增的重要边界同步chat/frontend/conventions，已有保稿/Agent/附件约束不再另抄一份规范。

## 消息与内容适配

- 官方Messages承担按消息ID遍历；message shell保留角色、附件、引用、失败、停止与动作条。索引通过当前原生消息ID求得，不能用SDK自动生成的新ID替代canonical映射。
- 消息内容使用官方Parts；需要连续工具合并/用户纯文本/专用截图去重时，使用官方Message render-prop提供的selected parts及UI.Part，而不是重新解析协议。分组仅是布局，原始message.parts不能被修改或重新写入SDK。
- 文本slot使用官方TextPart；用户消息仍显示纯文本。组件表传原CodeBlock，实现流式Markdown、复制与现有排版。官方多一层div要真实检查后代选择器/代码头/高度，不能凭类型通过断言视觉一致。
- 工具名稳定注册：优先使用现有共享工具目录作为展示映射来源；跨格式/旧历史/未知工具均不能因官方缺tools组件静默丢失。未知项通过官方公开手动Part渲染路径显示原有只读信息，不为展示向SDK注册新的可执行client tool，也不做Proxy/宽泛any绕过类型。
- 连续工具保持单折叠行、内部参数/结果可逐项展开；官方关联到的tool-result归属于同一工具。独立/孤立结果仍可见；不重复显示同一结果，流式更新不重挂已展开组件。
- thinking状态仍读取对应消息sidecar，保证REASONING_END后即停止运行态、redacted不泄露正文。structured/activity/media/subagent使用官方分类及Mimir现有只读展示，不新增MCP执行或Agent业务。

## 中断与队列

实施源码核查补充：ai-client0.39.3的 `src/types.ts:239` 和 `interrupt-manager.ts:1033` 明确将 client-tool-execution 排除在公开 ChatInterrupt 列表之外。因此文档执行仍由原 onChunk 捕获终局中断，仅原桥消费可信 `metadata.kind=client_tool`；不能把官方 Interrupts 列表作为替代输入。官方消息/内容选择可读取公开中断关联信息，当前产品没有generic/tool-approval审批业务，本轮不新增对应可见审批UI或执行器。缓存续传成功/失败必须继续检查SDK布尔结果和原run目标。该技术澄清保持原Agent交互及授权范围。

原Composer通过官方Input slot接入。发送入口继续调用Mimir业务send；官方SDK queue不承担Mimir尚未上传完成/租约/截图函数和复杂SendIntent的所有权。业务队列显示与取回/取消仍读原单一FIFO，不为了使用 `<Queue/>` 复制或伪造一份SDK队列。组件封装接入不是业务算法改写。

## 预计文件边界

- `packages/chat/src/runtime/use-mimir-runtime.ts`：向UI暴露现有host引用，业务算法保留。
- `packages/chat/src/ChatPanel.tsx`、`ChatThread.tsx`：接入官方Provider/Chat及layout/messages/input，保留宿主布局和滚动。
- 新的官方UI kit/contexts/widgets模块：模块级注册、官方类型、明确展示适配。
- `parts/MessageItem.tsx`、`MarkdownPart.tsx`：移除通用分发，接官方parts与TextPart；保留动作业务。
- `parts/ToolCallPart.tsx`及`runtime/DocxInterruptBridge.tsx`：仅必要的分组/展示/类型接线，严禁改变执行边界。
- Chat相关测试和规范，Renderer只限既有主/侧栏联调回归与必要类型接线；默认不改server/shared/provider/office/miniapp和manifest/lock。

## 视觉评审与风险

本任务复用已批准冻结v7作为外观目标，不修改v1–v7对比HTML。实现前已由本规划明确保留所有可见行为；若发现官方接入需要有意改变样式、布局或可见交互，必须先在独立HTML给出前后对比并获得用户认可，再进行该变化。无差异迁移仍需实际产品截图与冻结稿/上一轮截图比对，不能用原型截图代替产品。

风险集中于未知工具丢失、自动matched-result过滤、分组keys、Provider嵌套/循环import、源码优化引起折叠或输入焦点重置、原生Interrupt与业务桥重复，以及新增TextPart wrapper。上述均对应执行计划的回归项，不以跳过功能或扩大类型断言解决。

## 兼容与回滚

不改服务端协议、数据库或存量消息。按功能提交后可整体回退UI工厂/contexts/widgets和chat接线；前轮服务/附件数据无须降级。回滚不重置知识库、不删除附件、不改冻结HTML、不推送。原生Electron/IME/读屏和付费供应商边界延续此前记录，实际执行过的才计为本轮通过。
