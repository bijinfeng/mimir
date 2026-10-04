import HeatMap from '@uiw/react-heat-map'
import type { HeatMapValue } from '@uiw/react-heat-map'
import type { UsageDay } from '@mimir/shared'
import { Tooltip } from 'antd'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useHeatmapStyles } from './StatsSection.style'

/**
 * 用量热力图（`docs/PRD.md` §5.11、`docs/DESIGN.md` §3.6.1 / §8.12）。
 *
 * ## 网格与标签交给 `@uiw/react-heat-map`，产品规则留在这里
 *
 * 第一版是手搓的 371 个 div，**实测踩了一个 bug**：月份标签的判定写成
 * 「这一周的第一天所在月与上一周不同就打标签」，而月份变化常常落在周的中间，
 * 于是整月被跳过——370 天只打出 3 个标签（应有 13 个）。日历网格的周对齐、
 * 首周补空、月份定位有一堆这类边界，属于**轮子该别人造**的部分。
 *
 * 换成一个**零运行时依赖**（peer 只有 react / react-dom / @babel/runtime，
 * 而后者本来就在依赖树里）的小库负责网格与标签。这里只剩两件
 * **它不可能知道的产品规则**：
 *
 * | 规则 | 为什么库管不了 |
 * |---|---|
 * | 四档按**当前范围的分位数**着色 | 分档是我们的口径，换范围阈值就变 |
 * | 「有调用但用量未上报」单独成一个状态 | 这是「null ≠ 0」那条契约在界面上的落点 |
 *
 * ## 四个状态，不是一个色阶
 *
 * | 状态 | 表现 | 为什么必须分开 |
 * |---|---|---|
 * | 无调用 | 空格子（浅灰底） | — |
 * | 有调用、用量未上报 | **对角斜线** | 画成空等于说「我那天没用」——图在静默否认发生过的事 |
 * | 有用量 | 按分档着色 | — |
 * | 今天 | 加一圈描边 | 当天的数据不完整（「到现在此刻为止」） |
 *
 * **斜线而不是斜纹**：SVG 里画重复条纹要先在 `<defs>` 定义 `<pattern>`，
 * 而这个库的 SVG 子元素是固定的，插不进去。11px 的格子里一条对角线的
 * 辨识度已经够，而且它是**非颜色线索**——色盲用户也能分辨。
 */

/**
 * 传给库的单格数据。
 *
 * **自定义字段要显式声明**：库的 `HeatMapValue` 只认 `date` / `count` /
 * `content`，我们的上下文（是否今天、斜线类名）它当然不认识，
 * 但运行时会原样转发（`formatData` 用对象展开）。
 * 不声明的话 `rectRender` 里取不到这些字段——类型上就挡住了，
 * 这正是我们想要的（而不是断言成 `any` 把问题推后）。
 */
type HeatCell = HeatMapValue & {
  /** 有调用但供应商没回传用量的次数。> 0 时画一条对角线 */
  unknownCount: number
  /** 这一天的调用次数，只用于 tooltip */
  calls: number
  /** 是否今天（当天数据不完整，加一圈描边） */
  isToday: boolean
  /** 对角线的类名。颜色走 token，所以只能在这里传进来 */
  hatchClass: string
}

/** 星期标签走周日开头（库的网格从周日对齐），只标一 / 三 / 五 */
const WEEK_LABELS = ['', '一', '', '三', '', '五', '']

const MONTH_LABELS = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
]

const CELL = 11
const GAP = 2
/** 库给星期标签留的左内边距。只有 `weekLabels` 非 false 时才存在 */
const WEEK_LABEL_PAD = 28

/**
 * 统一成库内部用的日期键：`YYYY/M/D`，**月份与日不带前导零**。
 *
 * 这是本次踩到的一个静默 bug：API 给的是 `2026-09-18`（补零），
 * 库内部是 `2026/9/18`（不补零），直接 `replaceAll` 转换会得到
 * `2026/09/18`——两边**永远不相等**，于是 `rectRender` 里每次查表都落空、
 * 提前 return，三个覆盖状态（空格子 / 斜线 / 今日描边）**全部悄悄失效**，
 * 而图看起来完全正常（库的默认渲染兜住了）。
 *
 * 与月份标签那个 bug 同一类：**日期格式不一致，不报错、只是不对**。
 * 所以只在这一个函数里转换，不各写一遍。
 */
function dateKey(date: string): string {
  const [year, month, day] = date.split(/[-/]/).map(Number)
  return `${year}/${month}/${day}`
}

/** 某个日期所在周的周日（库的网格从周日对齐）*/
function startOfWeek(date: Date): Date {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())
  return start
}

interface HeatmapProps {
  days: UsageDay[]
  /** 分档阈值（升序）。空数组表示范围内没有任何用量 */
  thresholds: number[]
  timezone: string
}

/**
 * 把分位数阈值翻译成库要的 `panelColors`。
 *
 * **这个映射不直观，改之前先读库的 `existColor`**：它取「第一个
 * **严格大于** count 的阈值」对应的颜色。
 *
 * ```
 * 键:  0            t1            t2            t3            ceiling
 * 值:  空           L1            L2            L3            L4
 *      ↑             ↑
 *      count=0 落这  count 落在 (0,t1) 时命中 L1
 * ```
 *
 * 所以键的含义是「小于它才算上一档」，`count === t1` 会升到 L2。
 * `ceiling` 必须大于范围内最大值，否则最忙的那天取不到 L4。
 *
 * 颜色用 CSS 变量引用：变量在容器的 `createStyles` 里由 token 定义
 * （`StatsSection.style.ts`），所以色值仍然只有一个来源。
 */
function panelColorsFor(thresholds: number[], maxTokens: number): Record<number, string> {
  if (thresholds.length === 0) return { 0: 'var(--mimir-heat-empty)' }

  const colors: Record<number, string> = { 0: 'var(--mimir-heat-empty)' }
  const levels = [1, 2, 3, 4] as const

  thresholds.forEach((threshold, index) => {
    colors[threshold] = `var(--mimir-heat-l${levels[index] ?? 4})`
  })

  colors[maxTokens + 1] = 'var(--mimir-heat-l4)'
  return colors
}

/**
 * 单格渲染。**必须是模块作用域的纯函数**，不能内联在组件的 props 里。
 *
 * 两条理由，一条是规则、一条是实际收益：
 *
 * 1. 内联的箭头函数会被 lint 判为「渲染期定义的组件」（React Compiler
 *    与这款 lint 都会因此跳过优化）。**改结构而不是关诊断**——
 *    见 `AGENTS.md` 铁律 1
 * 2. 提到外面之后它只依赖 `(props, item)` 两个入参，本身可测、也稳定
 *
 * 所以所需的上下文（是否今天、斜线类名）**放在 `value` 的条目里**由库转发：
 * `formatData` 用的是对象展开，自定义字段会原样到达这里。
 */
function renderCell(
  props: React.SVGProps<SVGRectElement>,
  valueItem: HeatMapValue & { column: number; row: number; index: number },
): React.ReactElement {
  /**
   * 这一处断言是**契约边界上的**：库的签名只声明 `HeatMapValue`，
   * 而它在运行时把我们传给 `value` 的字段原样转发（`formatData` 用对象展开）。
   *
   * 断言收在这一个地方、紧贴读取点，而不是把整个函数参数放宽成 `any`——
   * 后者会让 `props` 也一起失去检查。同 `services/model.ts` 里
   * 「唯一成本是一次类型断言」的做法。
   */
  const item = valueItem as typeof valueItem & HeatCell

  const unknown = (item.unknownCount ?? 0) > 0
  const isToday = item.isToday === true

  const rect = (
    <rect
      {...props}
      /**
       * 零用量要显式覆盖成空格子色。
       *
       * 库对 `count = 0` 给的是**第一档**颜色（`existColor` 会跳过键 0），
       * 于是「那天没用」被画成「那天用了一点」——正是这张图最不该犯的错。
       * 「未上报」同理：覆写成空格底 + 一条对角线。
       */
      fill={unknown || item.count === 0 ? 'var(--mimir-heat-empty)' : props.fill}
      stroke={isToday ? 'var(--ant-color-primary-border)' : undefined}
      strokeWidth={isToday ? 1 : undefined}
      /* 库的内联样式带 cursor: pointer，而这里点击没有行为——
         留着手型会让人以为能点开（DESIGN §7.4）。内联样式优先级高于
         样式表，所以必须在这里覆盖掉，不能只靠 CSS */
      style={{ ...props.style, cursor: 'default' }}
    />
  )

  return (
    <Tooltip
      key={item.date}
      title={
        <span>
          {formatDay(item.date)} · {formatTokens(item.count)} token · {item.calls ?? 0} 次调用
          {unknown ? `（其中 ${item.unknownCount} 次未上报用量）` : ''}
        </span>
      }
    >
      {unknown ? (
        <g>
          {rect}
          {/* 对角线与空格子共用底色，所以它是**非颜色线索**——色盲用户也能分辨 */}
          <line
            x1={props.x}
            y1={Number(props.y) + CELL}
            x2={Number(props.x) + CELL}
            y2={props.y}
            className={item.hatchClass as string}
          />
        </g>
      ) : (
        rect
      )}
    </Tooltip>
  )
}

/**
 * 容器有真实尺寸之后才渲染 `children`。
 *
 * ## 为什么必须这么写（实测踩到）
 *
 * `@uiw/react-heat-map` 的列数是**量出来的**：
 *
 * ```
 * gridNum = floor((svg.clientWidth - leftPad) / (rectSize + space))
 * ```
 *
 * 而设置页的分区是 antd `Tabs`——**切走的那个面板是 `display: none`**，
 * 此时 `clientWidth` 是 0，算出的列数就是 0，于是整张网格一格都不渲染
 * （只剩星期标签与月份标签，图看起来「加载了但是空的」）。
 *
 * 更麻烦的是它只在挂载时量一次（effect 的依赖里没有宽度），所以
 * **是否恢复正常全靠之后有没有一次凑巧的重渲染**。实测就是这个现象：
 * 同一个页面来回切分区，有时 376 格、有时 0 格。
 *
 * 这里用一个 `ResizeObserver` 把它变成确定的：宽度为 0 时**根本不挂载**
 * 那个库，等它真的有位置了再挂——那时库量到的就是真实宽度，
 * 不需要赌任何时序。
 */
function WhenVisible({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const holderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = holderRef.current
    if (!node) return

    /**
     * 先量一次当前值：`ResizeObserver` 只在**尺寸变化**时回调，
     * 而「挂载时就已经可见」这种情况不会有变化事件，只在 observer 里等
     * 就永远等不到。
     */
    const measure = () => {
      if (node.clientWidth > 0) setReady(true)
    }
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return <div ref={holderRef}>{ready ? children : null}</div>
}

export function UsageHeatmap({ days, thresholds, timezone }: HeatmapProps) {
  const { styles } = useHeatmapStyles()

  /* 没有任何记录时给一句话，而不是 `return null`——上一层的 Panel 会照常
     渲染标题，留下一个只有「消耗热力图」四个字的空盒子（新实例上就是这个
     样子）。「没有」要说得出来才算如实 */
  if (days.length === 0) {
    return <div className={styles.empty}>这一年还没有用量记录。</div>
  }

  const from = days[0]!.date
  const to = days.at(-1)!.date
  const maxTokens = Math.max(...days.map((day) => day.tokens), 0)

  /**
   * 每格都进 `value`，**包括 0 用量的那些**。
   *
   * 不筛掉零值是为了让每一格都拿到 tooltip——筛掉的话「没用的那天」
   * 连日期都点不出来，而用户想确认的恰恰是「这天真的没记上吗」。
   *
   * `dateKey` 把日期统一成库内部的 `YYYY/M/D`（见该函数的注释：不统一
   * 会让 `rectRender` 静默失效）。
   */
  const value = days.map((day) => ({
    date: dateKey(day.date),
    count: day.tokens,
    /** 下面三个是给 `renderCell` 的上下文，库会原样转发 */
    unknownCount: day.unknownCount,
    calls: day.calls,
    isToday: dateKey(day.date) === dateKey(to),
    hatchClass: styles.hatchLine,
  }))

  /**
   * 网格列数**必须自己算**：库的 `gridNum` 是从容器宽度推的
   * （`floor((clientWidth - leftPad) / (rectSize + space))`），不是从日期
   * 范围推的——所以它会安静地丢掉放不下的那几天。
   *
   * 实测：370 天在 680px 的容器里只渲染 53 列，最后 4 天（含「今天」）
   * 整个消失，而图看起来完全正常。给它一个刚好够宽的尺寸就没这个问题。
   */
  const totalDays =
    Math.round(
      (new Date(`${to}T00:00:00`).getTime() - startOfWeek(new Date(`${from}T00:00:00`)).getTime()) /
        86_400_000,
    ) + 1
  const columns = Math.ceil(totalDays / 7)
  const chartWidth = WEEK_LABEL_PAD + columns * (CELL + GAP)

  return (
    <div className={styles.wrap}>
      <div className={styles.chartScroll}>
        {/* 容器有尺寸之后才挂载——见 WhenVisible 的注释 */}
        <WhenVisible>
          <HeatMap
            className={styles.chart}
            style={{ width: chartWidth }}
            value={value}
            startDate={new Date(`${from}T00:00:00`)}
            endDate={new Date(`${to}T00:00:00`)}
            rectSize={CELL}
            space={GAP}
            weekLabels={WEEK_LABELS}
            monthLabels={MONTH_LABELS}
            monthPlacement="top"
            /* 0 关掉库自带的图例——下面画自己的，它会标出真实阈值 */
            legendCellSize={0}
            panelColors={panelColorsFor(thresholds, maxTokens)}
            rectProps={{ rx: 2 }}
            rectRender={renderCell}
          />
        </WhenVisible>
      </div>

      <div className={styles.legend}>
        <span className={styles.legendLabel}>少</span>
        <span className={`${styles.swatch} ${styles.swatchEmpty}`} />
        <span className={`${styles.swatch} ${styles.swatch1}`} />
        <span className={`${styles.swatch} ${styles.swatch2}`} />
        <span className={`${styles.swatch} ${styles.swatch3}`} />
        <span className={`${styles.swatch} ${styles.swatch4}`} />
        <span className={styles.legendLabel}>多</span>

        {/* 斜线单独说明：它不是色阶的一档，而是「有调用但用量未知」 */}
        <svg width={13} height={13} className={styles.hatchSwatch} aria-hidden="true">
          <rect width={11} height={11} rx={2} x={1} y={1} className={styles.swatchEmpty} />
          <line x1={1} y1={12} x2={12} y2={1} className={styles.hatchLine} />
        </svg>
        <span className={styles.legendLabel}>用量未上报</span>

        {/*
          图例给出**真实区间**，而不是只说「少 / 多」。

          分档取的是这一年里的分位数（`docs/TECH.md` §12.4），所以一格颜色
          对应的是一个确定的数量级——不写出来，用户只能猜「深蓝是多少」。
          tooltip 给的是单日精确值，这里给的是档位边界，两者分工不同。

          范围固定一年之后，「按当前范围分档」那句解释也就不需要了：
          一档就是一个确定的区间（第一版有范围切换，所以必须声明这一点，
          否则对比两张截图会看不懂为什么同样的颜色代表不同的数字）。
        */}
        <span className={styles.legendNote}>
          {thresholds.length > 0
            ? `最深一档 ≥ ${formatTokens(thresholds.at(-1) ?? 0)}`
            : '这一年还没有用量'}
        </span>

        <span className={styles.legendNote}>· 按 {timezone} 聚合</span>
      </div>
    </div>
  )
}

/**
 * 大数字用「万」，不用 k / M。
 *
 * 中文语境下「12.3 万」比「123.4k」读得快，而这是给中文用户看的界面。
 * **精确数字留给 tooltip**——图上需要的是量级，不是个位。
 */
export function formatTokens(tokens: number): string {
  if (tokens < 10_000) return String(tokens)
  if (tokens < 100_000_000) return `${(tokens / 10_000).toFixed(1)} 万`
  return `${(tokens / 100_000_000).toFixed(2)} 亿`
}

/** tooltip 的日期：`9 月 23 日`。库给的是 `2026/9/23` */
function formatDay(date: string): string {
  const [, month, day] = date.split('/')
  return `${Number(month)} 月 ${Number(day)} 日`
}
