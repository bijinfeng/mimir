import type { ReactNode } from 'react'
import type { SettingSource } from '@mimir/shared'
import { useStatusStyles, useStyles } from './settings.style'

/**
 * 设置页的四个零件。
 *
 * 抽出来是因为六个分区用的是**同一套形态**（`docs/DESIGN.md` §8 的理由：
 * 没有形态可依时每个分区各写各的，界面就会一件件地跑偏）。分区的差异
 * 只应该是「填什么内容」，不是「长什么样」。
 */

/** 一组相关的设置项。`title` 是分组标签，不是标题 */
export function Panel({ title, children }: { title?: ReactNode; children: ReactNode }) {
  const { styles } = useStyles()
  return (
    <div className={styles.panel}>
      {title ? <div className={styles.panelTitle}>{title}</div> : null}
      {children}
    </div>
  )
}

/**
 * 面板标题里的 `seam:` 标识。
 *
 * 走等宽（`docs/DESIGN.md` §4.1 把「插件的 seam 标识」列为等宽的用途之一）：
 * 它是一个代码里的标识符，不是中文文案——等宽让它在标题里一眼可分。
 */
export function SeamTag({ children }: { children: ReactNode }) {
  const { styles } = useStyles()
  return <span className={styles.seamTag}>{children}</span>
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

/** 等宽的文件路径 / seam 标识——比说明再弱一档 */
export function FilePath({ children }: { children: ReactNode }) {
  const { styles } = useStyles()
  return <div className={styles.file}>{children}</div>
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

/**
 * 值的来源徽标：界面 / 环境变量 / 默认。
 *
 * **这是可写设置页上最有信息量的一处**（`docs/TECH.md` §7.5）。
 * 解析顺序是「界面覆盖 > 环境变量 > 默认」，所以用户必须能一眼看出
 * 「我现在看到的是我改过的，还是别人（部署配置）定的」——
 * 否则改了不生效时他没法判断是自己没保存，还是被环境变量压住了。
 *
 * 三种来源用三种**文字**而不是三种颜色：颜色需要对比度守卫，
 * 而这三者不是状态的好坏之分（环境变量并不比界面值「更好」或「更差」）。
 */
export function SourceBadge({ source }: { source: SettingSource }) {
  const { styles } = useStyles()
  const label = source === 'settings' ? '界面' : source === 'env' ? '环境变量' : '默认'

  return (
    <span className={styles.sourceBadge} title={SOURCE_HINT[source]}>
      {label}
    </span>
  )
}

const SOURCE_HINT: Record<SettingSource, string> = {
  settings: '这个值是在本页设置的，优先于环境变量',
  env: '来自部署时的环境变量。在本页填写会覆盖它',
  default: '没人配过，用的是代码里的默认值',
}
