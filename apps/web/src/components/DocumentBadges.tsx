import type { DocumentStatus } from '@mimir/shared'
import { createStyles } from 'antd-style'
import type { CSSProperties, ReactNode } from 'react'
import { useAppearance, type Appearance } from '@/theme/appearance'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 文档状态徽标。
 *
 * ## 只有「偏离常态」的状态有徽标（D-054）
 *
 * 原先有「待整理」（inbox）——它随收件箱那条两段式流程一起退役：新收进来的
 * 内容直接可用，不存在「待」这个中间态，所以那个徽标没有依据。
 *
 * **`ready` 刻意不给徽标。** 它是绝大多数文档的状态，给每张卡片都盖一个
 * 「已就绪」等于什么都没说，还会把真正需要注意的状态淹掉。所以这里只列
 * 两种偏离常态的状态：归档（不再出现在默认列表里）与提取失败（记录坏了）。
 *
 * 来源（kind）徽标更早移除了（D-047）：来源不是浏览维度，能否编辑在详情里
 * 自然可知。
 *
 * **不要用 `<Tag color="green">` 这种预设色。** 预设走的是 antd 自己的调色板，
 * 对比度不由我们控制。色对与实测对比度见 `docs/DESIGN.md` §3.7，
 * `design.test.ts` 对两套外观跑同一组阈值——深色不能因为「看得过去」就放宽。
 */

type ColorPair = { fg: string; bg: string }
type BadgeSpec = { label: string } & Record<Appearance, ColorPair>

const STATUS_STYLE: Partial<Record<DocumentStatus, BadgeSpec>> = {
  /* 中性灰对（与 §3.7 表里的「文件」行同值）：归档是**状态的变化**，
     不是警告也不是错误，用语义色（红/黄）会把它说成一件出问题的事 */
  archived: {
    label: '已归档',
    light: { fg: '#5c6570', bg: '#f0f1f3' },
    dark: { fg: '#b3bac2', bg: '#23262b' },
  },
  /* 与 §3.7 表里的「抓取失败」同值：两处表达的是同一件事（内容没取到） */
  failed: {
    label: '提取失败',
    light: { fg: '#c5221f', bg: '#fef7f6' },
    dark: { fg: '#ff8f8a', bg: '#2f1b1c' },
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

/**
 * 状态徽标。
 *
 * **没有徽标的状态返回 null**，不是渲染一个空 span——空 span 会在元信息行里
 * 留下一个 gap，看起来像少画了一个东西（`ready` 就是这种情况，而它是常态）。
 */
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
