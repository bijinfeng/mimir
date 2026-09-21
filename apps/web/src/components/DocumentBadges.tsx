import type { DocumentKind, DocumentStatus } from '@mimir/shared'
import { createStyles } from 'antd-style'
import type { CSSProperties, ReactNode } from 'react'

/**
 * 文档类型徽标。
 *
 * `PRD.md` §2.3 要求「资料与笔记必须一眼可分」，所以每种来源有自己的一对
 * 颜色（深色文字 + 浅底）。色对与实测对比度见 `docs/DESIGN.md` §3.7，
 * 全部 ≥ 4.5:1。
 *
 * **不要用 `<Tag color="green">` 这种预设色。** 预设走的是 antd 自己的调色板，
 * 对比度不由我们控制，改了也不会同步到这份规范里。
 *
 * 色对留在本文件而不进 `customToken`：它们是「哪种来源配哪个色」的映射表，
 * 主题层不该知道 `kind` 有几种。规范要求色对集中在一处并由 `design.test.ts`
 * 守住——这里就是那一处。
 */

const KIND_STYLE: Record<DocumentKind, { label: string; fg: string; bg: string }> = {
  note: { label: '笔记', fg: '#137333', bg: '#e6f4ea' },
  web: { label: '网页', fg: '#1a56c4', bg: '#e8f0fe' },
  wechat: { label: '公众号', fg: '#0f7b3f', bg: '#e8f7ec' },
  github: { label: 'GitHub', fg: '#5b32b8', bg: '#f0ebfa' },
  pdf: { label: 'PDF', fg: '#b45309', bg: '#fff3e0' },
  file: { label: '文件', fg: '#5c6570', bg: '#f0f1f3' },
}

/** 待整理是流程状态，不是来源，所以单独一张表 */
const STATUS_STYLE: Partial<Record<DocumentStatus, { label: string; fg: string; bg: string }>> = {
  inbox: { label: '待整理', fg: '#b45309', bg: '#fff3e0' },
  failed: { label: '抓取失败', fg: '#c5221f', bg: '#fef7f6' },
}

/** 供守门测试使用：规范里的表必须和这里的值一致 */
export const BADGE_COLORS = { ...KIND_STYLE, ...STATUS_STYLE }

/** 色对随 props 变化，所以走 createStyles 的第二个入参而不是内联 style */
const useStyles = createStyles(({ css }, props: { fg: string; bg: string }) => ({
  badge: css`
    display: inline-flex;
    align-items: center;
    flex: none;
    font-size: 10.5px;
    font-weight: 600;
    line-height: 1.6;
    letter-spacing: 0.02em;
    color: ${props.fg};
    background: ${props.bg};
    padding: 1px 6px;
    border-radius: 4px;
  `,
}))

interface BadgeProps {
  fg: string
  bg: string
  children: ReactNode
  style?: CSSProperties
}

function Badge({ fg, bg, children, style }: BadgeProps) {
  const { styles } = useStyles({ fg, bg })
  return (
    <span className={styles.badge} style={style}>
      {children}
    </span>
  )
}

export function KindBadge({ kind, style }: { kind: DocumentKind; style?: CSSProperties }) {
  const item = KIND_STYLE[kind]
  return (
    <Badge fg={item.fg} bg={item.bg} style={style}>
      {item.label}
    </Badge>
  )
}

export function StatusBadge({ status, style }: { status: DocumentStatus; style?: CSSProperties }) {
  const item = STATUS_STYLE[status]
  if (!item) return null
  return (
    <Badge fg={item.fg} bg={item.bg} style={style}>
      {item.label}
    </Badge>
  )
}
