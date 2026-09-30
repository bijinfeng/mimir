import type { UIMessage } from '@tanstack/ai-react'
import type { ReactNode } from 'react'
import { createChatUI, TextPart } from '@tanstack/ai-react/ui'
import type { ChatUIHost } from '@tanstack/ai-react/ui'

/**
 * mimir 的对话 UI。
 *
 * 用官方 `createChatUI` 而不是自己拼一套：消息列表的遍历、part 的分发、
 * 自动滚动、输入禁用与排队——这些都由它提供。手写一遍等于
 * 把它们重做一遍，而且一定会漏（流式 token 的拼接顺序、中断时的清理、
 * 并发发送的排队策略）。
 *
 * **「自动滚动」那句是错的，改过一次**：`createChatUI` 的 `Messages` 就是
 * `messages.map(...)`（`create-ui.js` 的 `Messages`），没有任何 scrollTop
 * 写入；带 autoScroll 的是已废弃的 `ChatMessages`（`chat-messages.js`）。
 * 这个仓库的滚动在 `lib/use-stick-to-bottom.ts` 里自己实现——三栏布局里
 * 「哪一块滚」是本项目的事，不是聊天组件的事。
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
      /**
       * 一个 part 都没有的助手消息**不渲染**。
       *
       * 这不是省一层 div：停止生成或流一开始就断掉时，SDK 会留下
       * `[user, assistant(0 parts)]`（实测：一个字都没到时就是这个形状），
       * 而空盒子仍然占着 `thread` 的 `gap: 20px`——用户看到的是「提问下面
       * 莫名多出一段空白」，看起来像空气泡。没有内容就没有这一条。
       */
      message: ({ message, Parts }) =>
        message.parts.length === 0 ? null : (
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
