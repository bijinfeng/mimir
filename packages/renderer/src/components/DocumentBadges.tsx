import type { DocumentStatus } from '@mimir/shared'
import { createStyles } from 'antd-style'
import type { CSSProperties, ReactNode } from 'react'
import { useAppearance, type Appearance } from '../theme/appearance'
import { FONT_SIZE } from '../theme/tokens'

/**
 * 文档状态徽标。
 *
 * ## 只有「偏离常态」的状态有徽标（D-054）
 *
 * 原先有「待整理」（inbox）——它随收件箱那条两段式流程一起退役：新收进来的
 * 内容直接可用，不存在「待」这个中间态，所以那个徽标没有依据。
 *
 * **`ready` 刻意不给徽标。** 它是绝大多数文档的状态，给每张卡片都盖一个
 * 「已就绪」等于什么都没说，还会把真正需要注意的状态淹掉。归档徽标已随
 * 归档交互整体退役（D-065）。所以这里只剩一种偏离常态的状态：
 * 提取失败（记录坏了）。
 *
 * 来源（kind）徽标更早移除了（D-047）：来源不是浏览维度，能否编辑在详情里
 * 自然可知。
 *
 * **不要用 `<Tag color="green">` 这种预设色。** 预设走的是 antd 自己的调色板，
 * 对比度不由我们控制。色对与实测对比度见 `.trellis/spec/project/design.md` §3.7，
 * `design.test.ts` 对两套外观跑同一组阈值——深色不能因为「看得过去」就放宽。
 */

type ColorPair = { fg: string; bg: string }
type BadgeSpec = { label: string } & Record<Appearance, ColorPair>

/**
 * 状态徽标（D-054 起「偏离常态才有徽标」，D-079 知识库卡片恢复两态）。
 *
 * **`ready`（就绪）只在知识库卡片上显示**（`StatusBadge` 的 `showReady`）——
 * 卡片底部那一格是「这份文档现在能不能用」的陈列位，两态并列才能扫读；
 * 而在别处（列表行、详情面板）逐个盖「就绪」仍然是噪音，保持原判据。
 * 色对取自校准过的语义色对（`theme/tokens.ts` 的 success / error 组），
 * `design.test.ts` 对两套外观跑同一组阈值。
 */
const STATUS_STYLE: Partial<Record<DocumentStatus, BadgeSpec>> = {
  ready: {
    label: '就绪',
    light: { fg: '#007a45', bg: '#e8f5ee' },
    dark: { fg: '#6bdaa5', bg: '#173a2a' },
  },
  /* 与 §3.7 表里的「抓取失败」同值：两处表达的是同一件事（内容没取到） */
  failed: {
    label: '提取失败',
    light: { fg: '#b42318', bg: '#fef0ee' },
    dark: { fg: '#ffb4ab', bg: '#3b2221' },
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
const useStyles = createStyles(({ css }, props: { fg: string; bg: string; quiet?: boolean }) => ({
  badge: css`
    display: inline-flex;
    align-items: center;
    flex: none;
    font-size: ${props.quiet ? FONT_SIZE.meta : FONT_SIZE.badge}px;
    font-weight: ${props.quiet ? 400 : 600};
    line-height: 1.6;
    letter-spacing: ${props.quiet ? 'normal' : '0.02em'};
    color: ${props.fg};
    background: ${props.quiet ? 'transparent' : props.bg};
    padding: ${props.quiet ? '0' : '1px 6px'};
    border-radius: 4px;
  `,
}))

interface BadgeProps {
  fg: string
  bg: string
  children: ReactNode
  style?: CSSProperties
  quiet?: boolean
}

function Badge({ fg, bg, children, style, quiet }: BadgeProps) {
  const { styles } = useStyles({ fg, bg, quiet })
  return (
    <span className={styles.badge} style={style}>
      {children}
    </span>
  )
}

/**
 * 状态徽标。
 *
 * **没有徽标的状态返回 null**，不是渲染一个空 span——空 span 会在元信息行里
 * 留下一个 gap，看起来像少画了一个东西。
 *
 * 默认 `ready` 不显示（它绝大多数时候是常态）；知识库卡片给 `showReady`
 * 明确要求「两态并列」时才显示「就绪」。
 */
export function StatusBadge({
  status,
  style,
  showReady,
  quiet,
}: {
  status: DocumentStatus
  style?: CSSProperties
  showReady?: boolean
  /** Library cards can show the routine ready state as unobtrusive text. Errors retain a badge. */
  quiet?: boolean
}) {
  const appearance = useAppearance()
  if (status === 'ready' && !showReady) return null
  const item = STATUS_STYLE[status]
  if (!item) return null
  const pair = item[appearance]
  return (
    <Badge fg={pair.fg} bg={pair.bg} style={style} quiet={quiet && status === 'ready'}>
      {item.label}
    </Badge>
  )
}
