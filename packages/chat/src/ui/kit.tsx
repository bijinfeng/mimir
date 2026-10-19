import { createChatUI } from '@tanstack/ai-react/ui'
import type { ChatUIHost, LayoutProps, MessageProps } from '@tanstack/ai-react/ui'
import { selectChatUI } from '@tanstack/ai-client/ui'
import type { ReactNode } from 'react'
import { MessageItem } from '../parts/MessageItem.js'
import { OfficialComposer, CompositionContext, SelectedMessagesContext } from './context.js'
import { partsComponents, toolsComponents } from './widgets.js'

function Message({ message }: MessageProps<unknown>) {
  return <MessageItem message={message} />
}
function Layout({ Messages, Input }: LayoutProps<unknown>) {
  return (
    <>
      <Messages />
      <Input />
    </>
  )
}

// Display registration never authorizes tool execution. Unknown historical names
// use the public manual Part path in MessageParts instead of disappearing.
export const ChatUI = createChatUI<unknown, typeof OfficialComposer>(
  {},
  {
    components: { layout: Layout, message: Message, input: OfficialComposer },
    partsComponents,
    toolsComponents,
  },
)

export function OfficialChatProvider({
  chat,
  children,
}: {
  chat: ChatUIHost<unknown>
  children: ReactNode
}) {
  // Associate separate tool messages through the official public selector.
  const selection = selectChatUI({ messages: chat.messages, interrupts: chat.interrupts })
  return (
    <ChatUI.Provider chat={chat}>
      <CompositionContext value={ChatUI}>
        <SelectedMessagesContext value={selection.messages}>{children}</SelectedMessagesContext>
      </CompositionContext>
    </ChatUI.Provider>
  )
}
