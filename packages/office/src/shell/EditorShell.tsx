/**
 * 编辑器外壳：四种编辑器共用的布局与控件原语。
 *
 * ## 为什么要有这一层
 *
 * 改之前四种格式各有一套自己的顶栏：docx 是 antd `Space` + 一排 icon 按钮，
 * pptx 是顶栏 + 右侧面板，xlsx 是顶栏 + 表格上方的编辑行，笔记干脆没有顶栏
 * （只有跟随选区的气泡菜单）。同一个应用里四套观感，"不伦不类"就是这么来的。
 *
 * 统一成办公软件那一套：**上面工具条、中间编辑区、下面状态行**。四种格式
 * 用的是同一组组件，所以「一样」不靠约定，靠实现。
 *
 * ## 边界：外壳只管框架，不管业务
 *
 * 这里没有任何格式知识——不知道什么是幻灯片、什么是工作表。它只提供
 * 四个槽位与一组控件，各编辑器往里填。所以加第五种编辑器不需要改这里。
 *
 * ## 不依赖 antd
 *
 * 图标、按钮都从宿主传进来。主题值走 CSS 自定义属性（见 `shell.css`），
 * 宿主把 antd token 填进去。好处是这个包能独立测试与预览，而浅色/深色、
 * 品牌色仍然跟着界面走。
 */

import type { ReactNode } from 'react'

export interface EditorShellProps {
  /** 顶栏（工具条）。一般不直接放裸子元素，用下面的控件原语摆 */
  toolbar?: ReactNode
  /** 编辑区。**滚动容器由调用方决定**——分页、缩放、表格的滚动方式各不相同 */
  children: ReactNode
  /** 内容下方的附属面板（pptx 的段落编辑、xlsx 的单元格编辑） */
  footer?: ReactNode
  /** 状态行两侧的内容。左：状态/说明；右：页码、字数这类计数 */
  status?: ReactNode
  /**
   * 贴边模式：去掉外框与圆角，用于它已经在面板里（文档详情右栏）的场景。
   * 留一个框会在面板里出现「框套框」，看起来像两个可以分别滚动的东西。
   */
  flush?: boolean
}

/**
 * 外壳本体。
 *
 * 四个槽位自上而下：`toolbar` → `children` → `footer` → `status`。
 * 没传的槽位不渲染——**不留空占位**：一条空的状态行会让人以为这里本来
 * 应该有东西而没显示出来。
 */
export function EditorShell({
  toolbar,
  children,
  footer,
  status,
  flush = false,
}: EditorShellProps) {
  return (
    <div className={flush ? 'mimir-editor mimir-editor--flush' : 'mimir-editor'}>
      {toolbar !== undefined && <div className="mimir-editor__bar">{toolbar}</div>}
      <div className="mimir-editor__body">{children}</div>
      {footer !== undefined && <div className="mimir-editor__footer">{footer}</div>}
      {status !== undefined && <div className="mimir-editor__status">{status}</div>}
    </div>
  )
}

export interface ToolbarButtonProps {
  /** 提示文字。用原生 `title`——它同时是**无障碍名称**的来源，读屏会念它 */
  label: string
  /** 图标元素（宿主传 antd 图标进来）。省略时按钮只显示文字 */
  children?: ReactNode
  /** 按下态（加粗生效时按钮是「按下去」的样子） */
  active?: boolean
  disabled?: boolean
  /** 主按钮（保存）。整条工具条最多一个 */
  primary?: boolean
  onClick: () => void
}

/**
 * 工具条按钮。
 *
 * 三件必须做对的事：
 *
 *  1. **是 `<button>`**，不是带 onClick 的 div——键盘、焦点环、读屏都靠它
 *  2. **用 `onMouseDown` 阻止默认行为**：点按钮会让编辑区失焦，选区随之
 *     被清掉，于是「给选中的文字加粗」作用不到任何东西（Word 也是这么做的）
 *  3. **激活态写进 `aria-pressed`**，样式选择器也读它——状态只留一个真相
 */
export function ToolbarButton({
  label,
  children,
  active = false,
  disabled = false,
  primary = false,
  onClick,
}: ToolbarButtonProps) {
  const className = primary ? 'me-btn me-btn--primary' : 'me-btn'
  return (
    <button
      type="button"
      className={className}
      title={label}
      aria-label={children === undefined ? undefined : label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children !== undefined && <span className="me-btn__icon">{children}</span>}
      {primary && label}
    </button>
  )
}

/** 分组分隔线。相邻但不同类的一组操作之间用它，不要每两个按钮都插一条 */
export function ToolbarDivider() {
  return <span className="me-sep" aria-hidden="true" />
}

/**
 * 撑开剩余空间，把后面的内容推到右边。
 *
 * 工具条的约定：**左边是「对内容做什么」，右边是「这份内容怎么了」**
 * （状态文字 + 保存）。所以每个编辑器的工具条末尾都会有一个它。
 */
export function ToolbarSpacer() {
  return <span className="me-spacer" />
}

/** 工具条上的次要文字（状态、计数） */
export function ToolbarLabel({ children }: { children: ReactNode }) {
  return <span className="me-label">{children}</span>
}

export interface ToolbarTabsProps<T extends string | number> {
  items: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  /** 这组页签是什么（读屏用）。如「工作表」「幻灯片」 */
  label: string
}

/**
 * 页签（xlsx 的工作表、pptx 的翻页）。
 *
 * 值用 `aria-selected` 表达选中而不是另加类名——与按钮同一条规矩。
 */
export function ToolbarTabs<T extends string | number>({
  items,
  value,
  onChange,
  label,
}: ToolbarTabsProps<T>) {
  return (
    <div className="me-tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          className="me-tab"
          aria-selected={item.value === value}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

/** 居中状态块（骨架、空、错误）。错误态用 `tone="error"` */
export function EditorState({
  children,
  tone = 'muted',
}: {
  children: ReactNode
  tone?: 'muted' | 'error'
}) {
  return (
    <div className={tone === 'error' ? 'me-state me-state--error' : 'me-state'}>{children}</div>
  )
}
