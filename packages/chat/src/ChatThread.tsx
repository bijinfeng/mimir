import { useChatRuntime } from './runtime/runtime-context.js'
import { useContext } from 'react'
import type { ReactNode } from 'react'
import { useChatPanelStyles } from './ChatPanel.style.js'
import { SelectedMessagesContext, useChatComposition } from './ui/context.js'

/**
 * 消息区（滚动容器里的那一列）。
 *
 * ## 这一块的关注点是**顺序**与**三种状态**
 *
 * ```
 * 加载历史 → 骨架屏
 * 空会话   → 舞台（主视图的问候语 + 输入框成一组，或侧栏的指南）
 * 有消息   → 消息列
 * ```
 *
 * 三者在同一个位置上互斥，散在各处最容易乱掉。
 *
 * ## 空态与输入区在这里成一组
 *
 * **主视图**：问候语 + 输入框是**一组**（居中舞台，面板的 `data-empty` +
 * `margin: auto` 承担布局），所以输入区节点由面板传进来、在这一支里渲染。
 * 「侧栏」是另一态：指南占滚动区、输入框固定底部（那个节点不在这一支里）。
 *
 * ## 历史加载是**骨架屏**而不是转圈
 *
 * 打开旧会话时 `thread.isLoading` 为真（实测 true→false）。骨架模仿消息的
 * 形状（一条短的提问 + 三条递减的文本条），比转圈更能说明「这里将出现
 * 什么」；`role="status"` + 一句读屏文案让它在无障碍树上也说得清。
 *
 * 骨架**在这一支之前判**：加载中 `isEmpty` 也是真，先判空态会让骨架永远
 * 没有机会出现。
 *
 * 宿主因此不再需要「数据没到位就不许挂载」那条硬契约——那是旧引擎
 * `initialMessages` 只在挂载那一刻生效留下的产物。
 */
export function ChatThread({
  stage,
  composer,
}: {
  /**
   * 空态要渲染的舞台（**已渲染的节点**）。
   *
   * 由面板决定是「问候语」还是「侧栏指南」——两者都是宿主给的渲染函数
   * 调用的结果（那一步必须在宿主那一侧发生，理由见 `types.ts` 的
   * `guide` 说明）。这一层只负责把它放进滚动区。
   */
  stage: ReactNode
  /** 空态时输入区的落位（与舞台成一组）；非空态时由面板挂底部 */
  composer: ReactNode
}) {
  const { styles } = useChatPanelStyles()
  const runtime = useChatRuntime()
  const { Messages } = useChatComposition()
  const isEmpty = runtime.messages.length === 0
  const isLoading = runtime.loading
  if (runtime.loadError)
    return (
      <div role="alert">
        {runtime.loadError}{' '}
        <button type="button" onClick={runtime.reloadHistory}>
          重新加载
        </button>
      </div>
    )

  if (isLoading) {
    /* 官方 ThreadHistorySkeleton 的形状：右侧的提问气泡 + 两组递减的
       文本条（组内 8px、组间 24px），入场 fade-in */
    return (
      <div className={styles.skeleton} role="status" aria-live="polite">
        <span className={styles.srOnly}>正在加载会话</span>
        <div className={styles.skeletonAsk} />
        <div className={styles.skeletonGroup}>
          <div className={styles.skeletonLine} style={{ width: '91%' }} />
          <div className={styles.skeletonLine} style={{ width: '80%' }} />
          <div className={styles.skeletonLine} style={{ width: '60%' }} />
        </div>
        <div className={styles.skeletonAsk} style={{ width: '33%' }} />
        <div className={styles.skeletonGroup}>
          <div className={styles.skeletonLine} style={{ width: '83%' }} />
          <div className={styles.skeletonLine} style={{ width: '66%' }} />
        </div>
      </div>
    )
  }

  if (isEmpty) {
    return (
      <>
        {stage}
        {composer}
      </>
    )
  }

  /* 消息列。组件表是**模块级常量**（见 parts/MessageItem.tsx 的说明）——
     写成 `children` 渲染函数的话那个内联箭头会被判成「渲染期定义组件」，
     React Compiler 随即跳过宿主组件（铁律 1 的静默退化）。

     外面这层 `styles.thread` 不能省：全部消息排版（用户消息的 › 标记与
     字重、助手的行高与 markdown 元素规范）都是 thread 里
     `[data-role=…]` 的**后代选择器**——没有这个祖先类它们整批静默失配
     （实测：› 消失、正文回到浏览器默认，界面能用但「丑了一圈」，
     不报错。第一版就漏了它）。 */
  return (
    <div className={styles.thread}>
      {runtime.branch.count > 1 && (
        <nav aria-label="本地会话分支" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            aria-label="上一个分支"
            disabled={runtime.running || runtime.branch.index === 0}
            onClick={() => runtime.branch.select(runtime.branch.index - 1)}
          >
            ‹
          </button>
          <span>
            {runtime.branch.index + 1} / {runtime.branch.count}
          </span>
          <button
            type="button"
            aria-label="下一个分支"
            disabled={runtime.running || runtime.branch.index === runtime.branch.count - 1}
            onClick={() => runtime.branch.select(runtime.branch.index + 1)}
          >
            ›
          </button>
        </nav>
      )}
      <Messages />
      <PendingMessage />
    </div>
  )
}

// Waiting/failure before the first assistant frame is business chrome, not a
// second SDK message source. Render its existing shell through official Message.
function PendingMessage() {
  const runtime = useChatRuntime()
  const selected = useContext(SelectedMessagesContext)
  const { Message } = useChatComposition()
  const last = runtime.messages.at(-1)
  if (!last || selected.some((item) => item.message.id === last.id)) return null
  return <Message message={last} />
}
