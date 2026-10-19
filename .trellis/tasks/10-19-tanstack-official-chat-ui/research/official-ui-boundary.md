# 官方 Headless UI 接入边界

核查日期：2026-10-19。权威顺序：项目安装的发布版本源码 → 对应公开文档 → 既有产品合同。在线文档主入口 https://tanstack.com/ai/latest/docs/ui/react 直接请求403，浏览器导航超时；前一轮已成功读取官方 GitHub `docs/ui/react.md`；本任务重新获取该文件超时，未保存该文档的原文或哈希。`main` 为可变引用，不把它当固定发布版本；API 的实际可用性以安装的0.30.4源码为准。远端与本地摘要见 `evidence.json`。

## 结论

使用发布包 `@tanstack/ai-react/ui` 的 `createChatUI` 与真实 `useChat` 返回对象接线。官方消息、内容和中断选择器参与产品渲染；保留已批准 Mimir 自有展示组件与业务运行层。无需新增UI依赖、复制上游源码或安装已弃用的 `@tanstack/ai-react-ui`。

## 官方版本证据

| 证据 | 结果及含义 |
| --- | --- |
| `packages/chat/node_modules/@tanstack/ai-react/package.json` exports | 0.30.4实际发布 `/ui`，不是仅开发分支功能 |
| `src/ui.ts:7–45` | 导出createChatUI、createChatHook、createChatHookContexts、TextPart等 |
| `src/chat-ui/create-ui.tsx:47–51,515–555` | ChatUIHost直接使用UseChatReturn；Provider接收现有实例，Chat把官方layout/messages/input等slot组织起来 |
| 同文件:597–676 | Messages按真实消息ID组织MessageView，message组件获得稳定Parts，官方选择消息内容 |
| 同文件:697–797 | 自动Parts使用官方selector；工具名缺映射会warn并不显示，未知工具不能依赖parts.fallback |
| `ai-client/src/ui/selectors.ts:94–188` | 真实tool-call/result/approval关联，matched结果的自动隐藏、generic/tool中断列表分工；使用官方公开选择/渲染API，不抄一套 |
| `src/chat-ui/create-chat-hook.tsx:20–27,78–92` | UI工厂版useAppChat实例override只有threadId/live/forwardedProps/body/initialMessages；现有每实例transport/onChunk/onError不能直接通过该override传入 |
| `src/chat-ui/text-part.tsx:82–114` | 官方TextPart本身使用TanStack Markdown，始终开启streaming，支持components.pre；新增div wrapper须检查主题后代选择器与几何 |
| `src/chat-ui/thinking-part.tsx:55–90` | 便捷ThinkingPart内置英文文案、class与完成自动折叠；本轮使用官方thinking slot接Mimir ReasoningPart，不直接替换为该可见样式 |

官方文档说明“所有可见组件由调用方提供”。这与用户要保留Mimir设计一致，不需要换成别的主题。

## 为什么选 createChatUI

产品 `runtime/use-mimir-runtime.ts:193` 已持有唯一真实useChat实例，其固定connection及onChunk承担canonical ID、Agent来源、终态和副侧车处理；父级依赖每个面板自己的io。`createChatUI` 是官方公开的低层UI套件，允许现有实例进入Provider/Chat；它能接管界面组织而不重建连接。改用高层createChatHook若要移动这些闭包，范围会扩至现有连接和生命周期。本次先用官方提供的现成host入口，不能为了使用某个工厂名称另外启动一套useChat。

这不代表保留现有NativePart类型switch：消息/内容路由应移至官方UI选择器与注册组件表，业务状态只追加展示所需信息。

## 需要明确保留的业务适配

| 现有行为 | 官方接入方式/不得发生的替换 |
| --- | --- |
| 连续工具共用折叠行 | 使用官方Message/Part选择结果形成薄的相邻分组布局，子项经官方Part/注册工具组件渲染；不复制selector逻辑。保留键/开合，不每token重挂 |
| 所有格式及历史未知工具 | 复用共享工具目录注册稳定工具renderer；历史未知工具须通过官方公开手动Part render-prop保留只读名称/参数/结果，不能静默消失。展示注册不能成为执行授权 |
| 文档Agent client_tool中断 | 官方Interrupts/中断上下文用于展示；metadata.kind=client_tool仍交DocxInterruptBridge原目标缓存续传，不能改为通用approval或addToolResult |
| 独立FIFO与停止保稿 | 官方Input slot注册现有Composer；Mimir发送动作仍冻结SendIntent并维护唯一业务FIFO。官方SDK queue不成为第二个发送入口。可视队列继续读取同一FIFO；不为了渲染Queue伪造SDK内部排队状态 |
| 真实附件/专用截图 | 附件侧车、受保护链接、租约与截图目标guard继续使用现有合同；避免snapshot与native image重复 |
| 回答动作与分支 | 保留sidecar/MessageContext及canonical ID，在官方message shell中按真实消息ID读取；普通UIMessage持久化内容不可被展示转换覆盖 |
| Markdown/代码 | 注册官方TextPart并传已有CodeBlock组件表，保留用户消息纯文本；验证流式半截语法/代码复制/HTML与URL边界 |
| 等待/加载/错误与滚动 | 保留ChatPanel/ChatThread布局语义作为官方layout/容器；骨架、空态、侧栏保活和pin-scroll不换成SDK默认输入行为 |

## 最小改动范围

`packages/chat`：新增模块级官方UI工厂/上下文与widgets适配；ChatPanel接现有host，ChatThread移除通用messages.map，MessageItem移除通用NativePart/keyedParts分发，MarkdownPart用官方TextPart。调整runtime返回host，仅作同一对象传递，业务发送/取消/历史算法不重写。因工具分组/中断需要局部调整ToolCallPart/DocxInterruptBridge时，必须有既有HTTP回归守护；不扩大服务端合同。

`packages/renderer`仅允许现有主/侧栏真实接线测试、必要类型适配；默认不改server/shared/provider/office/miniapp/依赖锁。若证据要求超出此范围，先记录原因与方案，不能借接入封装重做产品。

## WeKnora 检查与适用性

本任务检查官网 https://weknora.weixin.qq.com/ 和固定公开源 https://github.com/Tencent/WeKnora/tree/2c0d8384398ca756ee414eef01b71caf91e2caa6 。本轮官网请求成功（HTTP 200），固定源码包重新获取超时，结果见 `evidence.json`。frontend包0.8.3及Agent源码依据当日已归档证据 `.trellis/tasks/archive/2026-10/10-18-interaction-chat/research/vendor-full-thread/weknora-reference-recheck.json`：AgentStreamDisplay.vue:421仅完成且非空回答开放动作，:448/:452为复制/存知识库。该例有助于核对Mimir动作门控及知识库/Agent业务边界；其Vue/TDesign、过程卡与事件模型不能证明TanStack React封装兼容性，不作为本次视觉或Office编辑参考，不新增它的能力。官网版本不证明线上部署SHA。

## 尚未执行

本轮只做发布源码与文档核对，没有改产品、没有运行迁移后产品测试，也没有把既有v7验收算为新接线通过。实施须验证真实host/官方slot/分组/未知工具/中断映射及主侧栏GUI，再给出结果。
