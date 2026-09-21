import type { UIMessage } from '@tanstack/ai-react'
import type { ReactNode } from 'react'
import { createChatUI, TextPart } from '@tanstack/ai-react/ui'
import type { ChatUIHost } from '@tanstack/ai-react/ui'

/**
 * mimir 的对话 UI。
 *
 * 用官方 `createChatUI` 而不是自己拼一套：消息列表的遍历、part 的分发、
 * 空态/加载态、自动滚动、输入禁用与排队——这些都由它提供。手写一遍等于
 * 把它们重做一遍，而且一定会漏（流式 token 的拼接顺序、中断时的清理、
 * 并发发送的排队策略）。
 *
 * 这里只注册 mimir 自己的**渲染**差异：
 *  - 文本 part 用官方的 `TextPart`（自带流式 markdown 解析、HTML 转义、
 *    代码高亮入口），不自己写 markdown 渲染
 *  - 消息用 `<div>` 而不是它默认的样式，因为三栏布局的间距由 mimir 的
 *    设计规范定（`docs/DESIGN.md` §5.1），不是通用聊天气泡
 *
 * 引用卡与检索过程**不注册成 part 渲染器**：它们是「这一轮的结果」，
 * 不是消息流里的一个片段。由 ChatPanel 在消息列表之外渲染，位置更可控
 * （引用要横跨整列，见 `docs/PRD.md` §5.2）。
 *
 * **必须在模块作用域建一次。** `createChatUI` 的设计就是绑定一次然后共享
 * （与 `createFormHook` / `createTableHook` 同一个模式）。放在组件里每次
 * 渲染都新建，React 会当成不同的组件类型而把整棵子树重挂载。
 */
/**
 * 显式标注返回类型。
 *
 * `createChatUI` 的推断类型引用了几层 pnpm 内部路径下的类型（MessagePart、
 * ChatUIMessages…），而 TS 在生成声明时无法命名它们（TS2883）。标注成本
 * 很低、收益是把这些内部路径挡在这个模块里，不再往外泄漏。
 */
type MimirChatUI = {
  Chat: (props: { chat: ChatUIHost }) => ReactNode
  Messages: (props: { children?: (messages: UIMessage[]) => ReactNode }) => ReactNode
}

export const mimirChatUI: MimirChatUI = createChatUI(
  {},
  {
    components: {
      // 布局与滚动由 ChatPanel 负责（它是三栏的一部分，不是独立的聊天窗口）
      layout: ({ Messages }) => <Messages />,
      message: ({ message, Parts }) => (
        <div data-role={message.role} data-message-id={message.id}>
          <Parts />
        </div>
      ),
    },
    partsComponents: {
      text: ({ part }) => <TextPart content={part.content} />,
    },
  },
)
