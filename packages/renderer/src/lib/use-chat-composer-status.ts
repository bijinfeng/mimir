import type { ChatComposerStatus } from '@mimir/chat'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'

/**
 * 输入区底栏那三份数据（宿主取好，交给包渲染）。
 *
 * ## 为什么在宿主而不是包里
 *
 * 三个控件（「+ 添加上下文」「当前模型」「上下文容量」）原先各自 `useQuery`，
 * 那让它们 import 宿主的 `api.ts`——包不认识宿主。而这三份数据的
 * **键名、缓存策略、什么时候失效**都是这个应用的知识（`['documents']`
 * 在问答结束后要失效，那是宿主的 orchestration）。所以取在这里，
 * 包只渲染。
 *
 * ## 三态（加载中 / 失败 / 空）都如实交给包
 *
 * 这正是当初「不要手搓三态」那条结论的落点：「读取失败」与「还没有文档」
 * 是两件事，混成一支会让用户以为自己的内容没了（`ComposerMenus.tsx` 的
 * `retry` 那一支）。所以这里传的是 `isLoading` / `isError` / `items` 三个
 * 独立的事实，而不是一个 `data | undefined`。
 */
export function useChatComposerStatus(conversationId: string | undefined): ChatComposerStatus {
  const documents = useQuery({
    queryKey: ['documents', 'composer'],
    queryFn: () => api.documents.list({}),
  })
  const config = useQuery({ queryKey: ['config'], queryFn: api.config })
  const usage = useQuery({
    queryKey: ['context-usage', conversationId],
    queryFn: () => api.conversationContext(conversationId as string),
    enabled: conversationId !== undefined,
  })

  const roles = config.data?.modelConfig.roles ?? []
  const chatModel = roles.find((role) => role.role === 'chat')?.model
  const reasoningModel = roles.find((role) => role.role === 'reasoning')?.model

  /**
   * 直接返回新对象，**不手写 `useMemo`**（React Compiler 会在编译期做，
   * 手写一份只会让人误判优化来自哪里——`apps/web/AGENTS.md` 的规矩）。
   * 包内读它时用的是**字段**而不是对象本身（`status.documents` 等），
   * 所以身份每次变化不造成额外渲染。
   */
  return {
    documents: {
      items: (documents.data?.items ?? []).map((doc) => ({ id: doc.id, title: doc.title })),
      isLoading: documents.isLoading,
      isError: documents.isError,
      refetch: () => {
        void documents.refetch()
      },
    },
    modelRoles: { chat: chatModel, reasoning: reasoningModel },
    usage: usage.data ?? null,
  }
}
