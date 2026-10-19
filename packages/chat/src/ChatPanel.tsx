import { ArrowDown } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { ChatModelSelection } from '@mimir/shared'
import { useChatPanelStyles } from './ChatPanel.style.js'
import { ChatThread } from './ChatThread.js'
import { ChatUI, OfficialChatProvider } from './ui/kit.js'
import { ComposerContext } from './ui/context.js'
import { EmptyStage } from './EmptyStage.js'
import { MimirChatProvider } from './runtime/chat-context.js'
import { RuntimeContext } from './runtime/runtime-context.js'
import { useMimirRuntime } from './runtime/use-mimir-runtime.js'
import { DocxInterruptBridge } from './runtime/DocxInterruptBridge.js'
import type { ChatPanelProps } from './types.js'

export function ChatPanel(props: ChatPanelProps) {
  const { styles } = useChatPanelStyles()
  const [modelSelection, setModelSelection] = useState<ChatModelSelection>()
  const [documentId, setDocumentId] = useState<string | null>(props.draft?.documentId ?? null)
  const activeAgent = props.documentAgent ?? props.docxAgent
  const { runtime, api, host } = useMimirRuntime({
    io: props.io,
    conversationId: props.conversationId,
    onOpenCitation: props.onOpenCitation,
    onOpenNote: props.onOpenNote,
    docxAgent: activeAgent,
    draftAgent: props.draftAgent,
    snapshotVisionReady: props.snapshotVisionReady,
    composerStatus: props.composerStatus,
    modelSelection:
      modelSelection ?? props.composerStatus.models?.catalog?.defaultSelection ?? undefined,
    setModelSelection,
    documentId,
    setDocumentId,
  })
  const scroll = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const [away, setAway] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const applied = useRef<ChatPanelProps['draft']>(null)
  const effectiveSelection =
    modelSelection ?? props.composerStatus.models?.catalog?.defaultSelection ?? undefined
  const applyIncomingDraft = useEffectEvent((incoming: ChatPanelProps['draft']) => {
    if (incoming && applied.current !== incoming) {
      applied.current = incoming
      if (incoming.text !== undefined && (incoming.text || !incoming.documentId))
        runtime.setDraft(incoming.text)
      setDocumentId(incoming.documentId ?? null)
      runtime.applySnapshotDraft(incoming.snapshot)
    }
  })
  useEffect(() => {
    applyIncomingDraft(props.draft)
  }, [props.draft])
  useEffect(() => {
    if (pinned.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
  })
  const empty = !runtime.messages.length && !runtime.loading
  const centered = empty && !props.guide
  const composerConfig = {
    runtime,
    status: props.composerStatus,
    io: props.io,
    documentId,
    onDocumentIdChange: setDocumentId,
    modelSelection: effectiveSelection,
    onModelSelectionChange: setModelSelection,
    focusOnMount: props.focusComposer,
  }
  const Input = ChatUI.Input
  if (!Input) throw new Error('Official composer registration is missing')
  const composer = <Input />
  return (
    <RuntimeContext value={runtime}>
      <MimirChatProvider api={api}>
        <OfficialChatProvider chat={host}>
          <ComposerContext value={composerConfig}>
            {activeAgent && (
              <DocxInterruptBridge
                agent={activeAgent}
                getRound={runtime.getRound}
                advanceVersion={runtime.advanceVersion}
                registerToolCancel={runtime.registerToolCancel}
                generateDocxImage={props.io.generateDocxImage}
                fetchDocxImage={props.io.fetchDocxImage}
                writeDocxDocument={props.io.writeDocxDocument}
                analyzeDocxMedia={props.io.analyzeDocxMedia}
                createDocxDocument={props.io.createDocxDocument}
                onOpenDocument={props.io.onOpenDocument}
                revisionMode={props.docxRevisionMode ?? false}
              />
            )}
            <div className={styles.wrap} data-mimir-chat="">
              <div className={styles.scrollWrap}>
                <div
                  ref={scroll}
                  className={styles.scroll}
                  data-empty={centered ? '' : undefined}
                  onScroll={() => {
                    const node = scroll.current
                    if (!node) return
                    pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64
                    setAway(!pinned.current)
                    setScrolled(node.scrollTop > 0)
                  }}
                >
                  <div className={centered ? styles.innerEmpty : styles.inner}>
                    <ChatThread
                      stage={
                        props.guide ? props.guide(api.ask) : <EmptyStage draft={props.draft} />
                      }
                      composer={centered ? composer : null}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.backToBottom}
                  aria-label="回到底部"
                  disabled={!away}
                  onClick={() => {
                    pinned.current = true
                    setAway(false)
                    scroll.current?.scrollTo({
                      top: scroll.current.scrollHeight,
                      behavior: 'smooth',
                    })
                  }}
                >
                  <ArrowDown size={16} />
                </button>
              </div>
              {(!empty || props.guide) && (
                <div className={styles.composerLine} data-scrolled={scrolled || undefined}>
                  {empty && props.guideActions && !runtime.snapshot && (
                    <div className={styles.composerTop}>{props.guideActions(api.ask)}</div>
                  )}
                  {composer}
                </div>
              )}
            </div>
          </ComposerContext>
        </OfficialChatProvider>
      </MimirChatProvider>
    </RuntimeContext>
  )
}
