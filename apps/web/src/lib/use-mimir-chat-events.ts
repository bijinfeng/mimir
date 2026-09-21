import type { Citation, FailureKind, Trace } from '@mimir/shared'
import { useCallback, useState } from 'react'

/**
 * mimir 在 AI 流里额外收到的业务数据。
 *
 * 聊天协议本身只认「消息」：文本、思考、工具调用。但 mimir 的对话还有两样
 * 协议里不存在的东西——**这次检索的过程**（读了几个通道、切出哪些词、
 * 哪些是子串兜底命中的）与**引用**（哪篇、哪个区间）。
 *
 * 服务端把它们作为自定义事件推来（见 `services/assistant-stream.ts`），
 * 这个 hook 负责收进 state。单独一个文件是因为它有两个使用者：
 * ChatPanel 要渲染它们，中栏要显示「本次引用」。
 */
export interface MimirChatEvents {
  /** 本轮检索过程。模型开始生成之前就已到达 */
  trace: Trace | null
  /** 本轮引用。模型开始生成之前就已到达 */
  citations: Citation[]
  /**
   * 本轮失败。非空时右栏渲染失败卡片而不是回答。
   *
   * 分类来自服务端（它看得到 HTTP 状态码与原始错误），前端只负责选出路。
   */
  failure: { kind: FailureKind; message: string } | null
  /** 设置新值（新会话的 id 由外层管，见 useMimirChat） */
  setTrace: (trace: Trace | null) => void
  setCitations: (citations: Citation[]) => void
  setFailure: (failure: { kind: FailureKind; message: string } | null) => void
  /** 新一轮提问时清空——否则用户会以为这次的引用还是上一次的 */
  reset: () => void
}

export function useMimirChatEvents(): MimirChatEvents {
  const [trace, setTrace] = useState<Trace | null>(null)
  const [citations, setCitations] = useState<Citation[]>([])
  const [failure, setFailure] = useState<{ kind: FailureKind; message: string } | null>(null)

  const reset = useCallback(() => {
    setTrace(null)
    setCitations([])
    setFailure(null)
  }, [])

  return { trace, citations, failure, setTrace, setCitations, setFailure, reset }
}
