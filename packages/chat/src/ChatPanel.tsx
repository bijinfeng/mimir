import { AssistantRuntimeProvider, ThreadPrimitive, useAuiState } from '@assistant-ui/react'
import { Button } from 'antd'
import { ArrowDown } from 'lucide-react'
import { useRef, useState } from 'react'
import { useChatPanelStyles } from './ChatPanel.style.js'
import { ChatThread } from './ChatThread.js'
import { Composer } from './composer/Composer.js'
import type { ContextDoc } from './composer/ComposerMenus.js'
import { EmptyStage } from './EmptyStage.js'
import { useScrolled } from './hooks/use-scrolled.js'
import { MimirChatProvider, useMimirChatApi } from './runtime/chat-context.js'
import { useMimirRuntime } from './runtime/use-mimir-runtime.js'
import type { ChatPanelProps } from './types.js'

/**
 * 对话面板。
 *
 * 会话优先意味着对话是**主视图**，不是侧边面板（`docs/PRD.md` §5.2）。
 * 它有两个宿主：对话页（860px 宽列）与文档页的「问 AI」侧栏（400px 窄栏）
 * ——差异只有 `draft`（锁范围）与 `guide`（指南模式，D-090），其余全同，
 * 所以是**同一个组件**而不是两份实现（D-087「复用而不是另写一套」）。
 *
 * ## 这个文件只剩四件事
 *
 * 1. **组装**：滚动区（消息）+ 底部输入线（或空态里与问候语成组）
 * 2. **两块本轮设置**：检索范围（`contextDocument`）与思考强度
 *    （`deepReasoning`）——它们每轮写进 composer 的 runConfig
 * 3. **两个滚动的可见结果**：「回到底部」（贴底即隐形）与 `data-scrolled`
 *    （输入区上方的界线，D-070）
 * 4. **空态两种形态的分派**（居中舞台 / 侧栏指南）
 *
 * 流式状态、消息、队列、停止——全在 `useMimirRuntime` 与引擎里。
 * 组件不碰流式状态，这条纪律与旧实现一致，只是引擎换了。
 */
export function ChatPanel({
  conversationId,
  draft,
  onOpenCitation,
  onOpenNote,
  io,
  ...rest
}: ChatPanelProps) {
  const { runtime, api } = useMimirRuntime({ io, conversationId, onOpenCitation, onOpenNote })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <MimirChatProvider api={api}>
        <ChatPanelBody
          {...rest}
          draft={draft}
          onOpenCitation={onOpenCitation}
          onOpenNote={onOpenNote}
          io={io}
        />
      </MimirChatProvider>
    </AssistantRuntimeProvider>
  )
}

function ChatPanelBody({
  draft,
  guide,
  guideActions,
  io,
  composerStatus,
}: Pick<
  ChatPanelProps,
  'draft' | 'guide' | 'guideActions' | 'io' | 'composerStatus' | 'onOpenCitation' | 'onOpenNote'
>) {
  const { styles } = useChatPanelStyles()
  const api = useMimirChatApi()
  const empty = useAuiState((state) => state.thread.isEmpty)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  /* 输入区上方的界线随滚动显形（D-070）。滚动容器是引擎的 viewport，
     ref 挂在它上面；`useScrolled` 同时监听 document 的捕获，所以
     它晚挂载也能接上 */
  const scrolled = useScrolled(scrollRef)

  /**
   * 本轮检索范围（「+ 添加上下文」所选，或从文档工具条带进来的 draft 锁定）。
   *
   * `Composer` 每轮把它写进 composer 的 runConfig，于是排队的那条也带着
   * 自己那一轮的范围（引擎存的是完整 AppendMessage）。null = 整个知识库。
   *
   * 范围锁定的来源**只有 `draft`**：空态里点选的那一篇随收件箱退役了
   * （D-054），再留一个永远为 undefined 的 state 会让「范围为什么锁在
   * 这一篇」多一条不存在的路径。
   */
  const [contextDoc, setContextDoc] = useState<ContextDoc | null>(
    draft?.documentId ? { id: draft.documentId, title: '当前文档' } : null,
  )
  /** 深入 = 用推理角色回答（这一轮的设置，随消息的 runConfig 走） */
  const [deepReasoning, setDeepReasoning] = useState(false)

  /**
   * 「一句话直接发出去」的入口——指南里的建议问题、输入框上方的快捷提问
   * 胶囊都收它。
   *
   * 走 `api.ask`（= composer 的 setText + send）而不是 `thread.append`：
   * 服务端收到的消息与用户手打的完全一致，包括那一轮的 runConfig。
   */
  const ask = (question: string) => {
    api.ask(question, { documentId: contextDoc?.id ?? null, deepReasoning })
  }

  /**
   * 指南模式（D-090/D-093）：空态且宿主给了 `guide` 时，空态不再是居中
   * 舞台——指南占滚动区、输入框固定底部（语雀的阅读助手同形）。
   * 判据只看「空 + 有指南」：一旦开始对话这一块就恢复成消息列
   * （指南的使命是「第一次打开时告诉他这面板能干什么」，对话开始后
   * 它不该再占位置）。
   */
  const guideMode = empty && guide !== undefined
  /** 居中舞台：主视图的空态（问候语与输入框成一组，ChatGPT / Notion 形态） */
  const centered = empty && !guideMode

  const composer = (
    <Composer
      contextDocument={contextDoc}
      onContextDocumentChange={setContextDoc}
      deepReasoning={deepReasoning}
      onDeepReasoningChange={setDeepReasoning}
      io={io}
      status={composerStatus}
    />
  )

  return (
    <ThreadPrimitive.Root className={styles.wrap}>
      <div className={styles.scrollWrap}>
        <ThreadPrimitive.Viewport
          ref={scrollRef}
          className={styles.scroll}
          data-empty={centered ? '' : undefined}
        >
          <div className={centered ? styles.innerEmpty : styles.inner}>
            <ChatThread
              /* 空态舞台：指南（侧栏）或问候语（主视图）。两者都由宿主
                 拍板，这一层只负责落位与顺序 */
              stage={guideMode ? guide(ask) : <EmptyStage draft={draft} />}
              /* 居中舞台时输入区与问候语成一组；指南模式下它在下面的底栏 */
              composer={centered ? composer : null}
            />
          </div>
        </ThreadPrimitive.Viewport>

        {/* 离底时才出现、到底即隐形——`ScrollToBottom` 在贴底时把自己置为
            disabled，样式里 `visibility: hidden`（不是条件渲染：那会让按钮
            在出现/消失时改变布局，而它是浮层，不该参与布局）。
            它浮在滚动区之上，所以不能放进滚动容器里 */}
        <ThreadPrimitive.ScrollToBottom
          render={
            <Button
              className={styles.backToBottom}
              size="small"
              shape="circle"
              icon={<ArrowDown size={16} />}
              aria-label="回到底部"
            />
          }
        />
      </div>

      {/* 空态（且非指南模式）时输入区在居中组里（ChatThread 渲染），
          底部这条不渲染——否则同一个输入框会出现两份。
          指南模式下反过来：输入框**固定在这条底部线上**，指南自己占滚动区 */}
      {(!empty || guideMode) && (
        <div className={styles.composerLine} data-scrolled={scrolled || undefined}>
          {/* 快捷提问贴着输入框（D-093）。放在 composerLine 里面而不是
              滚动区：它要一直看得见，且与输入框同一条对齐线 */}
          {guideMode && guideActions !== undefined ? (
            <div className={styles.composerTop}>{guideActions(ask)}</div>
          ) : null}
          {composer}
        </div>
      )}
    </ThreadPrimitive.Root>
  )
}
