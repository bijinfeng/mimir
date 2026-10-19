import { createContext, useContext } from 'react'
import type { ComponentProps } from 'react'
import type { createChatUI } from '@tanstack/ai-react/ui'
import type { ChatUISelectedMessage } from '@tanstack/ai-client/ui'
import { Composer } from '../composer/Composer.js'

// Widgets consume the public composition surface, never their importing factory.
type Composition = Pick<ReturnType<typeof createChatUI<unknown>>, 'Messages' | 'Message' | 'Part'>
export const CompositionContext = createContext<Composition | null>(null)
export const SelectedMessagesContext = createContext<ChatUISelectedMessage[]>([])
export const ComposerContext = createContext<ComponentProps<typeof Composer> | null>(null)

export function useChatComposition() {
  const ui = useContext(CompositionContext)
  if (!ui) throw new Error('Chat composition requires the official UI provider')
  return ui
}

export function OfficialComposer() {
  const props = useContext(ComposerContext)
  if (!props) throw new Error('Chat composer requires its business configuration')
  return <Composer {...props} />
}
