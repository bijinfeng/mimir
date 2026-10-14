import { ComposerPrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { Button, Tag } from 'antd'
import { createStyles } from 'antd-style'
import { ArrowUp, Square, X } from 'lucide-react'
import { useEffect } from 'react'
import { CONTENT_WIDTH } from '../ChatPanel.style.js'
import type { ChatIo } from '../runtime/io.js'
import type { ChatComposerStatus } from '../types.js'
import type { ContextDoc } from './ComposerMenus.js'
import {
  AddContextDropdown,
  ContextUsageChip,
  ModelDropdown,
  StrengthDropdown,
} from './ComposerMenus.js'

/**
 * 输入区。
 *
 * Codex 式底栏（用户拍板）：上面是输入框（3 行起、自动长高到 8 行），
 * 下面一条工具栏分两组——
 *
 *  - **左**：+ 添加上下文（把本轮检索范围锁到某篇文档）、范围 pill、
 *    上下文容量（usageLog 里该会话最近一次请求的真实 promptTokens）
 *  - **右**：思考强度（标准 / 深入 = 对话角色 / 推理角色）、当前模型、
 *    发送 / 停止
 *
 * ## 状态归引擎，这里只有「这一轮想锁哪一篇」
 *
 * 输入文本、能不能发、能不能停、队列里有几条——全在 composer 的 state 里
 * （`s.composer.text` / `canSend` / `canCancel` / `queue`），这个组件**不持有**
 * 文本的副本。旧实现里 `useState(initialText)` 那一份正是「把文本放回输入框」
 * 要重挂载组件的根源；现在那条路是 `composer.setText()`。
 *
 * ## 生成中不锁输入框（D-098）
 *
 * 生成时输入框**可打字**（Codex 同款）：Enter 不发送而是**排队**——
 * 本轮正常结束后自动发出；停止时还给输入框（在运行时那层的 `onCancel` 里，
 * 见 `runtime/use-mimir-runtime.ts`）。发送键在生成中仍是「停止」。
 *
 * ## 发送 / 停止是一个键位的两种形态
 *
 * 空闲是发送（`ComposerPrimitive.Send`）、生成中是停止
 * （`ComposerPrimitive.Cancel` 换掉它），可用性由引擎算（`canSend` /
 * `canCancel`），不由我们按 `busy` 猜。旧实现里那个 `creating` 补丁
 * （新会话的建会话那趟）在引擎看来也是「还不能发」，自动落在 `canSend` 上。
 */
const useStyles = createStyles(({ css, token, prefixCls }) => ({
  wrap: css`
    flex: none;
    padding: 12px 0 22px;
    /* 与消息列表的界线不在这里画（D-070）：显形开关在 ChatPanel——
       消息列表的 scrollTop 归它管，线画在包着本组件的 composerLine 上 */
    background: ${token.colorBgContainer};
  `,
  inner: css`
    width: 100%;
    max-width: ${CONTENT_WIDTH}px;
    margin: 0 auto;
    /* 与消息列（ChatPanel 的 inner）同一个变量——输入框必须与上面的内容
       对齐，两处各写死一个 40px 就会在侧栏里错开（见那边的说明） */
    padding: 0 var(--mimir-chat-gutter, 40px);
  `,
  /*
   * 盒子（官方 composer shell）：border-foreground/10（最浅一档描边）、
   * bg = muted 30% 掺透明（比实色 muted 更轻，换算成
   * colorFillQuaternary）、rounded-(--composer-radius) = 1rem、p-2（8px）。
   * 聚焦只把描边提一档（官方 focus-within:border-foreground/25 同款，
   * 不是主色柔光）。
   */
  box: css`
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorBgContainer};
    box-shadow: ${token.boxShadowTertiary};
    padding: 10px;
    /* 焦点态只过渡 border-color：加 box-shadow 那一半会让容器「抖」
       （阴影与边框不同步） */
    transition: border-color 0.12s ease-out;

    &:focus-within {
      border-color: ${token.colorPrimaryBorder};
    }

    /*
     * 输入框不画自己的焦点环——**外层盒子才是容器**（DESIGN §8.8）。
     * antd v6 给聚焦的输入类控件加了 focusOutline（实测计算样式
     * outline: rgb(22,119,255) solid 1px），叠在盒子的聚焦边框上就是
     * 用户看到的两层边框。命令面板当年为同一条关过三处（DESIGN §8.6），
     * 这里是第四处。
     */
    .${prefixCls}-input {
      &:focus,
      &:focus-within,
      &:hover {
        outline: none;
        box-shadow: none;
      }
    }

    /* 引擎渲染的那个 textarea：透明底、自己不写自动增高
       （增高归 ComposerPrimitive.Input 的 minRows/maxRows） */
    textarea {
      border: none;
      outline: none;
      background: none;
      padding: 5px 7px;
      min-height: 40px; /* 官方 min-h-10 */
      resize: none;
      width: 100%;
      font-family: inherit;
      font-size: var(--mimir-chat-font-body, 14px);
      line-height: 1.7;
      color: ${token.colorText};

      &::placeholder {
        color: ${token.colorTextPlaceholder};
      }
    }
  `,
  bar: css`
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
    margin-top: 9px;
  `,
  barGroup: css`
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
  `,
  barLeft: css`
    flex: 1 1 auto;
  `,
  barRight: css`
    justify-content: flex-end;
    margin-left: auto;
  `,
  pill: css`
    display: inline-flex;
    align-items: center;
    max-width: 160px;
    /* 关闭图标始终留在可见区域，长标题只截断文字。 */
    margin-inline-end: 0;
  `,
  pillText: css`
    display: block;
    max-width: 125px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  `,
  /* 发送 / 停止：官方 size-7（28px）rounded-full 深底浅字
     （variant=default 的换算——shadcn 的 default 是近黑底，这里用
     colorText 反色）。禁用只降透明度（官方 disabled:opacity-40） */
  sendButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex: none;
    border: none;
    border-radius: ${token.borderRadiusSM}px;
    background: ${token.colorPrimary};
    color: ${token.colorTextLightSolid};
    cursor: pointer;
    transition:
      background-color 0.12s ease-out,
      opacity 0.12s ease-out;

    &:hover:not(:disabled) {
      background: ${token.colorPrimaryHover};
    }
    &:focus-visible {
      outline: 1px solid ${token.colorPrimaryBorder};
      outline-offset: 2px;
    }
    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  `,
  /* 排队中的追问：输入框与工具栏之间的一行。单行省略——它只是
     「有一条在排队」的提醒，全文等自动发出之后就在回答流里了 */
  queued: css`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    padding: 4px 8px;
    border-radius: ${token.borderRadiusSM}px;
    background: ${token.colorBgContainer};
    border: 1px solid ${token.colorBorderSecondary};
    font-size: var(--mimir-chat-font-badge, 11.5px);
    color: ${token.colorTextSecondary};
  `,
  queuedLabel: css`
    flex: none;
    color: ${token.colorTextTertiary};
  `,
  queuedText: css`
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}))

export interface ComposerProps {
  /** 本轮检索范围（draft 锁定或「+ 添加上下文」所选）；null = 整个知识库 */
  contextDocument: ContextDoc | null
  onContextDocumentChange: (doc: ContextDoc | null) => void
  /** 深入 = 用推理角色回答（随消息的 runConfig 走） */
  deepReasoning: boolean
  onDeepReasoningChange: (deep: boolean) => void
  showReasoningControl?: boolean
  focusOnMount?: boolean
  io: ChatIo
  status: ChatComposerStatus
  onBeforeSubmit: () => void
}

export function Composer({
  contextDocument,
  onContextDocumentChange,
  deepReasoning,
  onDeepReasoningChange,
  showReasoningControl = true,
  focusOnMount,
  io,
  status,
  onBeforeSubmit,
}: ComposerProps) {
  const { styles } = useStyles()
  const aui = useAui()

  /**
   * 把「这一轮的参数」同步进 composer 的 runConfig。
   *
   * 引擎在发送时读 composer 的 runConfig、并把它挂到**这一条消息**上
   * （队列里存的是完整 AppendMessage，所以排队那条带着自己那一轮的
   * 检索范围发出去——实测第二个请求体里带着完整 transcript）。
   *
   * 这是「同步到外部系统」的 effect：composer 的 state 归引擎，
   * 不能在渲染期写它，也不该由每个控件各自记得调一次。
   */
  useEffect(() => {
    aui.composer.setRunConfig({
      custom: {
        documentId: contextDocument?.id ?? null,
        ...(deepReasoning ? { deepReasoning: true } : {}),
      },
    })
  }, [aui, contextDocument, deepReasoning])

  /** 生成中（按钮换成「停止」的相位、占位符也要跟着换） */
  const canCancel = useAuiState((state) => state.composer.canCancel)

  return (
    <div className={styles.wrap}>
      <div className={styles.inner}>
        <ComposerPrimitive.Root
          className={styles.box}
          onSubmitCapture={onBeforeSubmit}
          onClickCapture={(event) => {
            if ((event.target as Element).closest('button[aria-label="发送"]')) onBeforeSubmit()
          }}
        >
          <ComposerPrimitive.Input
            autoFocus={focusOnMount}
            /* 3 行起、到 8 行封顶（Codex 式，既有决策）。
               react-textarea-autosize 的 props 直接透传 */
            minRows={3}
            maxRows={8}
            /* Enter 发送、Shift+Enter 换行是聊天框的通行约定；输入法里的
               回车由引擎自己按 isComposing 挡掉 */
            submitMode="enter"
            /* 引擎默认的 Esc 是「取消输入」（清空草稿），而本仓的 Esc 语义是
               「生成中停止」（见下面 textarea 的 onKeyDown）。关掉默认的，
               由这里显式处理，两件事不混在一个键上。 */
            cancelOnEscape={false}
            /* 触屏键盘把回车键标成「发送」 */
            enterKeyHint="send"
            placeholder={
              canCancel
                ? '生成中 · Enter 排队这条，Esc 停止'
                : contextDocument
                  ? `就「${contextDocument.title}」提问…`
                  : '直接向知识库提问…'
            }
            onKeyDown={(event) => {
              /**
               * 生成中按 Esc 停止。
               *
               * `isComposing` 守卫不能省：中文输入法里 Esc 是**取消候选词**，
               * 这时按下去不该把正在生成的回答也停掉。rc-input 对 Enter
               * 就是这么挡的（`@rc-component/input/es/TextArea.js` 的
               * `e.key === 'Enter' && !e.nativeEvent.isComposing`），
               * 这里照同一个判据。
               */
              if (event.key === 'Escape' && canCancel && !event.nativeEvent.isComposing) {
                event.preventDefault()
                aui.thread.cancelRun()
              }
            }}
          />

          <QueueRow />

          <div className={styles.bar}>
            <div className={`${styles.barGroup} ${styles.barLeft}`}>
              <AddContextDropdown
                onPick={onContextDocumentChange}
                documents={status.documents}
                hasSelection={contextDocument !== null}
              />
              {contextDocument && (
                <Tag
                  closable
                  onClose={() => onContextDocumentChange(null)}
                  className={styles.pill}
                  title={`本轮检索范围：${contextDocument.title}`}
                >
                  <span className={styles.pillText}>范围：{contextDocument.title}</span>
                </Tag>
              )}
              <ContextUsageChip usage={status.usage} />
            </div>
            <div className={`${styles.barGroup} ${styles.barRight}`}>
              {/* 主视图可选思考强度；文档侧栏固定使用标准聊天模型。 */}
              {showReasoningControl && (
                <StrengthDropdown value={deepReasoning} onChange={onDeepReasoningChange} />
              )}
              <ModelDropdown
                deepReasoning={deepReasoning}
                modelRoles={status.modelRoles}
                onManageModels={io.onManageModels}
              />
              {/* 发送 / 停止**共用一个键位**，形态按上游：36px 圆角方块、
                  深底浅字（`size-10 rounded-xl bg-foreground
                  text-background` 的换算）、图标 ArrowUp / Square。
                  两侧都用引擎的按钮——onClick 与 disabled 由引擎算
                  （`canSend` 管「能不能发」，含排队能力），不手写
                  「自己 Button + 调 composer.send()」；空闲渲染 Send、
                  生成中整颗换成 Cancel（条件渲染，两颗都常驻会在空闲
                  时多一块灰方块，上游也是 AuiIf 条件切换）。 */}
              {canCancel ? (
                <ComposerPrimitive.Cancel
                  render={<button type="button" className={styles.sendButton} aria-label="停止" />}
                >
                  <Square size={16} fill="currentColor" />
                </ComposerPrimitive.Cancel>
              ) : (
                <ComposerPrimitive.Send
                  render={<button type="button" className={styles.sendButton} aria-label="发送" />}
                >
                  <ArrowUp size={18} />
                </ComposerPrimitive.Send>
              )}
            </div>
          </div>
        </ComposerPrimitive.Root>
      </div>
    </div>
  )
}

/**
 * 排队条（D-098 的那条追问）。
 *
 * 数据是 `composer.queue`（引擎在生成中把消息收进来，本轮落定后自动发出
 * —— 实测：队列长度 1 → 本轮结束自动发出 → 第二个请求体里带着完整
 * transcript）。
 *
 * ## 只渲染首条
 *
 * D-098 定的是**单条**排队：界面上显示第一条，多出来的（用户又打了一条）
 * 也照引擎的队列排在后面，但这一行只交代「有一条在排队」——排在后面的
 * 那几条等前一条发出去之后会依次露头（同一个组件，取 `queue[0]`）。
 *
 * ## 取回（×）把那条还回输入框
 *
 * 引擎的 `removeQueueItem` 只管删，所以删之前先把文本写进 composer——
 * **与停止时的处理是同一个动作**（见 `runtime/use-mimir-runtime.ts` 的
 * `onCancel`），只是触发点不同：这里是用户点的。
 */
function QueueRow() {
  const { styles } = useStyles()
  const aui = useAui()
  const first = useAuiState((state) => state.composer.queue[0])

  if (!first) return null

  return (
    <div className={styles.queued}>
      <span className={styles.queuedLabel}>已排队</span>
      <span className={styles.queuedText}>{first.prompt}</span>
      <Button
        type="text"
        size="small"
        icon={<X size={14} />}
        aria-label="取回排队的消息"
        onClick={() => {
          /* 先把文本放回输入框再删（`remove` 只管删）——与停止时的处理
             是同一个动作，见 runtime/use-mimir-runtime.ts 的 onCancel */
          aui.composer.setText(first.prompt)
          aui.composer.queueItem({ id: first.id }).remove()
        }}
      />
    </div>
  )
}
