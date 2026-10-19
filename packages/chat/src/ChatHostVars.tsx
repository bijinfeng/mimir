import { createStyles } from 'antd-style'
import type { CSSProperties, ReactNode } from 'react'

/**
 * 主题变量的兜底层（宿主挂一次，包内所有样式消费它）。
 *
 * ## 为什么需要它
 *
 * `createStyles` 的样式体是**静态字符串**，读不到 React context 里的普通值；
 * 而这个包也不该 import 宿主的主题模块（它不认识宿主）。CSS 自定义属性是
 * 唯一能跨包流动的通道——这是 `apps/web` 的 `editor-theme-bridge.ts` 早就
 * 定下的做法（那边是 `--me-*`，这里是 `--mimir-chat-*`）。
 *
 * ## 两个变量组，各自的理由
 *
 * - **字号九档**：`.trellis/spec/project/design.md` 的阶梯是宿主的决策（`FONT_SIZE` 九档，
 *   每档一个角色），包里写死数字会让「同一角色在不同页面用不同值」重新
 *   长出来——那正是阶梯要消灭的。所以值由宿主填。
 * - **`--mimir-chat-gutter`**：主视图左右边距 24px，侧栏 16px；消息列上限
 *   808px、输入区域上限 856px。消息列 / 引用块 / 输入框共用边距变量，
 *   由宿主统一控制主视图与窄栏的留白。
 *
 * ## 必须挂在**祖先**上
 *
 * CSS 自定义属性只在声明它的元素及其子树上生效。挂错的表现是「样式全都
 * 退回回退值」——界面能用、字号差半个像素，不报错（`editor-theme-bridge.ts`
 * 记过同一条）。
 *
 * ## 变量走内联 style，布局走类
 *
 * 两件事分开：变量是**数据**（每个宿主的值不同，内联最直接，也便于覆盖），
 * 而 `display: flex` 那一层是**布局链的一环**（见下面的类）。
 *
 * ## 回退值不是装饰
 *
 * 每个变量都带回退值（`var(--mimir-chat-font-note, 12.5px)`），
 * 于是**不挂这一层也能渲染**——包的测试与宿主之外的预览不依赖它。
 * 回退值与宿主 `FONT_SIZE` 的当前值一致；两者都变时以宿主为准
 * （宿主填的那个赢）。
 */
export interface ChatHostFontSize {
  /** 界面正文：对话正文 */
  body: number
  /** 连续回答正文 */
  reading?: number
  /** 展示级大字：空态欢迎语（官方 text-2xl 那一档） */
  display: number
  /** 列表项标题 */
  item: number
  /** 摘要、代码 */
  excerpt: number
  /** 次级说明、引用片段、检索过程 */
  note: number
  /** 元信息 */
  meta: number
  /** 徽标、计数 */
  badge: number
  /** 页面标题：正文 H2 */
  pageTitle: number
  /** 小节标题：正文 H3 */
  section: number
}

export interface ChatHostVarsProps {
  children: ReactNode
  /** 窄栏（文档侧栏）传 16px；主视图不传（吃 24px 的默认值） */
  gutter?: string
  /** 宿主的字号阶梯（对话使用的九档）。缺省用回退值 */
  fontSize?: ChatHostFontSize
}

export function ChatHostVars({ children, gutter, fontSize }: ChatHostVarsProps) {
  const { styles } = useChatVarsStyles()

  const vars: Record<string, string> = {}
  if (gutter !== undefined) vars['--mimir-chat-gutter'] = gutter
  if (fontSize !== undefined) {
    vars['--mimir-chat-font-display'] = `${fontSize.display}px`
    vars['--mimir-chat-font-body'] = `${fontSize.body}px`
    if (fontSize.reading !== undefined) vars['--mimir-chat-font-reading'] = `${fontSize.reading}px`
    vars['--mimir-chat-font-item'] = `${fontSize.item}px`
    vars['--mimir-chat-font-excerpt'] = `${fontSize.excerpt}px`
    vars['--mimir-chat-font-note'] = `${fontSize.note}px`
    vars['--mimir-chat-font-meta'] = `${fontSize.meta}px`
    vars['--mimir-chat-font-badge'] = `${fontSize.badge}px`
    vars['--mimir-chat-font-page-title'] = `${fontSize.pageTitle}px`
    vars['--mimir-chat-font-section'] = `${fontSize.section}px`
  }

  return (
    <div className={styles.vars} style={vars as CSSProperties}>
      {children}
    </div>
  )
}

/**
 * 变量层同时是**布局链的一环**。
 *
 * 它必须是 `height: 100%` 的 flex 列：面板（`wrap`）写的是 `height: 100%`，
 * 而那只在**父容器也定高**时才吃得到高度。一个默认的 `display: block`
 * 包裹层会让链断在这里——实测过同类症状（`editor-theme-bridge.ts` 的
 * 「编辑器只有 219px 高、下面一大片空白」）。
 */
const useChatVarsStyles = createStyles(({ css }) => ({
  vars: css`
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
    min-height: 0;
  `,
}))
