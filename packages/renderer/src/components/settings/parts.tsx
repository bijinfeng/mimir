import type { ReactNode } from 'react'
import { useStatusStyles, useStyles } from './settings.style'

/**
 * 设置页共享的标题、行、状态与说明。
 *
 * 抽出来是因为六个分区用的是**同一套形态**（`.trellis/spec/project/design.md` §8 的理由：
 * 没有形态可依时每个分区各写各的，界面就会一件件地跑偏）。分区的差异
 * 只应该是「填什么内容」，不是「长什么样」。
 */

/**
 * 一组相关的设置项。`title` 是分组标签，`extra` 是标题条**右端**的动作。
 *
 * `extra`（「拉取模型」/「+ 手动添加」这类）放在标题条上而不是内容区顶部：
 * 它们是**这一组的动作**，属于标题条的一部分。放进内容区会让「这一组是
 * 什么」与「能对它做什么」分成两块纵排，白白多占一行高度（demo 形态，
 * 用户拍板）。右对齐靠 `margin-left: auto`，标题是什么长度都不影响。
 *
 * `children` 可省——「预设」那个面板的全部内容（当前选的是哪家 +
 * 「重新选择」）都在标题条上，没有内容体，再塞一个空 div 会多出
 * 一段没有内容的内边距。
 */
export function Panel({
  title,
  extra,
  children,
}: {
  title?: ReactNode
  extra?: ReactNode
  children?: ReactNode
}) {
  const { styles } = useStyles()
  return (
    <div className={styles.panel}>
      {title || extra ? (
        <div className={styles.panelTitle}>
          {title}
          {extra ? <span className={styles.panelExtra}>{extra}</span> : null}
        </div>
      ) : null}
      {children}
    </div>
  )
}

/** 键值行。标签列定宽，值列对齐 */
export function Row({
  label,
  children,
  pending = false,
}: {
  label: string
  children: ReactNode
  /** 值是「未启用」这类状态时置位：用更弱的一档文字，避免和真实取值同样醒目 */
  pending?: boolean
}) {
  const { styles } = useStyles()
  return (
    <div className={styles.row}>
      <div className={styles.rowLabel}>{label}</div>
      <div className={`${styles.rowValue} ${pending ? styles.pending : ''}`}>{children}</div>
    </div>
  )
}

/** 占满整行的块：插件条目、说明 + 按钮这类不是键值对的内容 */
export function Block({ children }: { children: ReactNode }) {
  const { styles } = useStyles()
  return <div className={styles.block}>{children}</div>
}

/** 块标题行：名称 + 可选的状态徽标 */
export function BlockTitle({ children, badge }: { children: ReactNode; badge?: ReactNode }) {
  const { styles } = useStyles()
  return (
    <div className={styles.blockTitle}>
      <span>{children}</span>
      {badge}
    </div>
  )
}

export function BlockDesc({ children }: { children: ReactNode }) {
  const { styles } = useStyles()
  return <div className={styles.blockDesc}>{children}</div>
}

/**
 * 状态徽标。
 *
 * 早期版本在插件行右侧挂了一个 `disabled` 的 `Switch`：它看起来像一个
 * **可以打开的开关**，实际上永远打不开，也没有 tooltip 说明原因。
 * 那比没有更糟——用户会以为是自己没找到开启的方式。徽标只陈述事实。
 */
export function StatusBadge({ on, children }: { on: boolean; children: ReactNode }) {
  const { styles } = useStatusStyles({ on })
  return <span className={styles.badge}>{children}</span>
}

/** 说明块：解释「为什么这里改不了」这类前提，不是提示条 */
export function Note({ children }: { children: ReactNode }) {
  const { styles } = useStyles()
  return <div className={styles.note}>{children}</div>
}

/** 几个并列的事实（导出的统计数字）。不是仪表盘——只是键值对的紧凑形式 */
export function Stats({ items }: { items: { label: string; value: string }[] }) {
  const { styles } = useStyles()
  return (
    <div className={styles.stats}>
      {items.map((item) => (
        <div key={item.label}>
          <div className={styles.statLabel}>{item.label}</div>
          <div className={styles.statValue}>{item.value}</div>
        </div>
      ))}
    </div>
  )
}
