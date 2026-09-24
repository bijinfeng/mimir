import type { DocumentKind, DocumentStatus } from '@mimir/shared'
import { createStyles } from 'antd-style'
import type { CSSProperties, ReactNode } from 'react'
import { useAppearance, type Appearance } from '@/theme/appearance'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 文档类型徽标。
 *
 * `PRD.md` §2.3 要求「资料与笔记必须一眼可分」，所以每种来源有自己的一对
 * 颜色（文字 + 底）。色对与实测对比度见 `docs/DESIGN.md` §3.7，
 * 两套外观下全部 ≥ 4.5:1。
 *
 * **不要用 `<Tag color="green">` 这种预设色。** 预设走的是 antd 自己的调色板，
 * 对比度不由我们控制，改了也不会同步到这份规范里。
 *
 * ## 两张表，不是一个滤镜
 *
 * 深色**不是**把浅色的字与底互换：浅色是「深字 + 极浅底」，深色是
 * 「亮字 + 深底」，两套的色相各自校准（深色那一套是按 antd 蓝色阶的
 * 亮端逐个挑的）。自动反色会让「笔记」那个绿在深底上变成荧光绿，
 * 而这里有八组色对，逐个看得出差别。
 *
 * 所以就是两张表，`design.test.ts` 对它们跑**同一组阈值**——深色不能
 * 因为「看得过去」就放宽标准，那是这份规范最容易发生的退化。
 *
 * 色对留在本文件而不进 `customToken`：它们是「哪种来源配哪个色」的映射表，
 * 主题层不该知道 `kind` 有几种。规范要求色对集中在一处并由守门测试看着，
 * 这里就是那一处。
 */

type ColorPair = { fg: string; bg: string }
type BadgeSpec = { label: string } & Record<Appearance, ColorPair>

const KIND_STYLE: Record<DocumentKind, BadgeSpec> = {
  note: {
    label: '笔记',
    light: { fg: '#137333', bg: '#e6f4ea' },
    dark: { fg: '#8ee29b', bg: '#1b2a1e' },
  },
  web: {
    label: '网页',
    light: { fg: '#1a56c4', bg: '#e8f0fe' },
    dark: { fg: '#87b7ff', bg: '#172338' },
  },
  wechat: {
    label: '公众号',
    light: { fg: '#0f7b3f', bg: '#e8f7ec' },
    dark: { fg: '#6fd6a6', bg: '#152a22' },
  },
  github: {
    label: 'GitHub',
    light: { fg: '#5b32b8', bg: '#f0ebfa' },
    dark: { fg: '#bda6ff', bg: '#231f3a' },
  },
  /**
   * `file` = 上传的文件。**不按格式分组**：PDF、Word、图片、压缩包
   * 都是这一种来源，格式写在元信息行里（正文色文字，不是彩色徽标）。
   *
   * 这里原先还有一个 `pdf` 分组，与 `file` 并排。删掉它的理由：
   * `kind` 回答「从哪来」而不是「是什么格式」（见 `@mimir/shared`
   * 的 `documentKindSchema`），而**给 PDF 一个专属色、给 docx 没有**
   * 是一种说不通的不一致——按那个路子走下去，每加一种格式就要多一组
   * 徽标色对，而 `docs/DESIGN.md` §0.1 明确反对「给每个类型配一个色」。
   */
  file: {
    label: '文件',
    light: { fg: '#5c6570', bg: '#f0f1f3' },
    dark: { fg: '#b3bac2', bg: '#23262b' },
  },
}

/** 待整理是流程状态，不是来源，所以单独一张表 */
const STATUS_STYLE: Partial<Record<DocumentStatus, BadgeSpec>> = {
  inbox: {
    label: '待整理',
    light: { fg: '#b45309', bg: '#fff3e0' },
    dark: { fg: '#e5b45f', bg: '#2a2213' },
  },
  failed: {
    label: '抓取失败',
    light: { fg: '#c5221f', bg: '#fef7f6' },
    dark: { fg: '#ff8f8a', bg: '#2f1b1c' },
  },
}

/** 供守门测试使用：规范里的表必须和这里的值一致，两套外观都要给 */
function pairsFor(appearance: Appearance): Record<string, ColorPair> {
  const out: Record<string, ColorPair> = {}
  for (const [key, spec] of Object.entries(KIND_STYLE)) out[key] = spec[appearance]
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

export function KindBadge({ kind, style }: { kind: DocumentKind; style?: CSSProperties }) {
  const appearance = useAppearance()
  const item = KIND_STYLE[kind]
  const pair = item[appearance]
  return (
    <Badge fg={pair.fg} bg={pair.bg} style={style}>
      {item.label}
    </Badge>
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
