import type { DocumentStatus } from '@mimir/shared'
import { createStyles } from 'antd-style'
import type { CSSProperties, ReactNode } from 'react'
import { useAppearance, type Appearance } from '@/theme/appearance'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 文档状态徽标（收件箱「待整理」）。
 *
 * 来源（kind）徽标已随 D-047 移除：来源不再是浏览分类，能否编辑在详情里
 * 自然可知，不需要一枚常驻徽标。状态徽标保留——「待整理」是**流程状态**，
 * 是整理流（收件箱 → ready）的进行时标记，与来源是两个维度。
 *
 * **不要用 `<Tag color="green">` 这种预设色。** 预设走的是 antd 自己的调色板，
 * 对比度不由我们控制。色对与实测对比度见 `docs/DESIGN.md` §3.7，
 * `design.test.ts` 对两套外观跑同一组阈值——深色不能因为「看得过去」就放宽。
 */

type ColorPair = { fg: string; bg: string }
type BadgeSpec = { label: string } & Record<Appearance, ColorPair>

const STATUS_STYLE: Partial<Record<DocumentStatus, BadgeSpec>> = {
  inbox: {
    label: '待整理',
    light: { fg: '#b45309', bg: '#fff3e0' },
    dark: { fg: '#e5b45f', bg: '#2a2213' },
  },
}

/** 供守门测试使用：规范里的表必须和这里的值一致，两套外观都要给 */
function pairsFor(appearance: Appearance): Record<string, ColorPair> {
  const out: Record<string, ColorPair> = {}
  for (const [key, spec] of Object.entries(STATUS_STYLE)) out[key] = spec![appearance]
  return out
}

export const BADGE_COLORS: Record<Appearance, Record<string, ColorPair>> = {
  light: pairsFor('light'),
  dark: pairsFor('dark'),
}

/** 色对随 props 变化，所以走 createStyles 的第二个入参而不是内联 style */
const useStyles = createStyles(({ css }, props: { fg: string; bg: string }) => ({
  badge: css`
    display: inline-flex;
    align-items: center;
    flex: none;
    font-size: ${FONT_SIZE.badge}px;
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

export function StatusBadge({ status, style }: { status: DocumentStatus; style?: CSSProperties }) {
  const appearance = useAppearance()
  const item = STATUS_STYLE[status]
  if (!item) return null
  const pair = item[appearance]
  return (
    <Badge fg={pair.fg} bg={pair.bg} style={style}>
      {item.label}
    </Badge>
  )
}
