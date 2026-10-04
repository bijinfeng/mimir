/**
 * 编辑器外壳：六种编辑器共用的布局与控件原语。
 *
 * ## 为什么要有这一层
 *
 * 改之前四种格式各有一套自己的顶栏：docx 是 antd `Space` + 一排 icon 按钮，
 * pptx 是顶栏 + 右侧面板，xlsx 是顶栏 + 表格上方的编辑行，笔记干脆没有顶栏
 * （只有跟随选区的气泡菜单）。同一个应用里四套观感，"不伦不类"就是这么来的。
 *
 * 统一成办公软件那一套：**上面工具条、中间编辑区、下面状态行**。六种格式
 * 用的是同一组组件，所以「一样」不靠约定，靠实现。
 *
 * ## 边界：外壳只管框架，不管业务
 *
 * 这里没有任何格式知识——不知道什么是幻灯片、什么是工作表。它只提供
 * 槽位与一组控件，各编辑器往里填。所以加第七种编辑器不需要改这里。
 *
 * ## 控件用 antd（D-064）
 *
 * 工具条里的**控件**（按钮、下拉、数字框、分段控件、文本框、文件选择）由
 * antd 渲染：高度、内边距、圆角、边框、hover、焦点环、禁用态、字号都由
 * `--ant-*` 承担。这些正是「同一排三种高度 / 三种焦点环」的来源，交给一个
 * 实现就不会漂移。
 *
 * **尺寸档由 `EditorShell` 里那层 `ConfigProvider componentSize="small"` 给**
 * （只传 componentSize、不传 theme——传 theme 会让 antd 重算 cssVar 的 key，
 * `--ant-*` 变量名跟着变，引用处静默失效，见 `apps/web/AGENTS.md` 第 5 条）。
 *
 * 下面这几样**故意不用 antd**，每一条都有理由：
 *
 * | 原语 | 为什么不用 antd |
 * |---|---|
 * | `useToolbarState` | 它订阅 Tiptap 的**外部可变状态**，antd 没有对应物 |
 * | `ToolbarMenu` / `ToolbarColorPicker` | 面板必须**就地渲染**（portal 会离开 `--me-*` 子树，深色下退回浅色回退值）；antd 的 Dropdown/ColorPicker 都会 portal，且 Dropdown 不给 `aria-expanded` |
 * | `ToolbarGroup` / `ToolbarSpacer` / `ToolbarLabel` / `ToolbarNote` / `ToolbarNotice` | 纯布局与文字；antd 的 Space 会给每个子项包一层、Typography 会把字号阶梯改到 antd 那边 |
 * | `ToolbarTabs` | antd 的 Tabs 会把页签渲染成 div 而不是 button，并多一个隐藏的 `.ant-tabs-nav-more` |
 * | `ToolbarGridPicker` | 格子是 18px 的方块；antd 没有这个档（small 档按钮实测 24px），要它就得用字面量覆盖 `.ant-btn-sm`——那条路 D-064 明确否决。与 `.me-tab` / `.me-color__cell` 同一类 |
 * | `EditorState` | 是「居中、不占满高度」的状态块，antd 的 Spin/Result 都会改掉形状 |
 *
 * ## 两条写这个文件的规矩
 *
 * 1. **不抑制 React 规则**——`eslint-disable` 关 hook 规则会让 React Compiler
 *    静默跳过整个组件（改代码结构，别关诊断）
 * 2. **渲染期不读 ref**——同样会被判违规。ref 只在事件与 effect 里读
 *
 * 下面几个需要「打开/关闭」的原语（菜单、颜色选择器）都走同一个
 * `useToolbarPopup`：一份定位 + 键盘 + 关闭的实现，三处抄一遍必然漂移。
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ComponentProps, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import {
  Button,
  ConfigProvider,
  Divider,
  Input,
  InputNumber,
  Popconfirm,
  Segmented,
  Select,
  Upload,
} from 'antd'
import type { InputRef } from 'antd'
import type { FindOptions } from '../shims/ui.js'
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
} from './icons.js'

export interface EditorShellProps {
  /** 顶栏（工具条）。一般不直接放裸子元素，用下面的控件原语摆 */
  toolbar?: ReactNode
  /**
   * 次工具条（工具条下面那一行）。查找替换栏、pptx 的幻灯片导航、xlsx 的
   * 公式栏都落在这里。
   *
   * **它与工具条同包在 `.mimir-editor__chrome` 里**，那个容器才是 sticky 的。
   * 让 subbar 自己再写一条 `position: sticky; top: 0` 是不行的：工具条已经占了
   * `top: 0` 且 z-index 更高、DOM 在后，subbar 会盖住工具条右端的「保存」
   * （这一点实测过）。也不要给 subbar 写死 `top: 32px` 之类——工具条是
   * `flex-wrap` 的，窄窗口下会折成两行，写死的高度立刻错位。
   */
  subbar?: ReactNode
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
  /**
   * 编辑区**右侧**的固定列（如笔记的大纲导航）。
   *
   * 给出时 body 变成「主列 + 侧列」两栏：工具条与状态行仍然**整行**，
   * 侧列夹在它们之间——这是语雀式阅读布局的形状（工具条下面、正文右边），
   * 而不是把侧列放在外壳外面、与工具条并排（那样工具条被挤窄，
   * 与头部和状态行的整行宽度对不上）。
   *
   * 侧列自己滚：外壳不管它的内容与滚动方式。
   */
  bodySide?: ReactNode
}

/**
 * 外壳本体。
 *
 * 五个槽位自上而下：`toolbar` → `subbar` → `children` → `footer` → `status`
 * （工具条与次工具条同包在一条 sticky 容器里，所以视觉上是四行）。
 * 没传的槽位不渲染——**不留空占位**：一条空的次工具条会让人以为这里本来
 * 应该有东西而没显示出来。
 *
 * ## 那层 `ConfigProvider`：只传 `componentSize`，**绝不传 `theme`**
 *
 * 它把这一棵子树里的 antd 控件降到 small 档（六种编辑器、三个就地渲染的
 * 弹层面板一处改完）。两条不能动的边界：
 *
 *  1. **不传 `theme`**：antd 会按传入的 theme 重算 `cssVar` 的 key，
 *     `--ant-*` 变量名跟着变，所有引用变量的地方**静默失效**
 *     （`apps/web/AGENTS.md` 第 5 条）。尺寸档不是主题。
 *  2. **它不产生 DOM 节点**（实测 `host.childElementCount` 渲染前后都是 1），
 *     所以 `.mimir-editor` 的高度链与宽度链不受影响——那两条链断过两次，
 *     见 `shell.css` 与根 `AGENTS.md` 的坑表。
 *
 * 注意它**不是** antd 的 compactAlgorithm 那种全应用密度开关：只把控件降到
 * small 档，间距仍由 `shell.css` 的 `.mimir-editor__bar { gap: 2px }` 管。
 */
export function EditorShell({
  toolbar,
  subbar,
  children,
  footer,
  status,
  flush = false,
  bodySide,
}: EditorShellProps) {
  const hasChrome = toolbar !== undefined || subbar !== undefined
  return (
    <ConfigProvider componentSize="small">
      <div className={flush ? 'mimir-editor mimir-editor--flush' : 'mimir-editor'}>
        {hasChrome && (
          <div className="mimir-editor__chrome">
            {toolbar !== undefined && <div className="mimir-editor__bar">{toolbar}</div>}
            {subbar !== undefined && <div className="mimir-editor__subbar">{subbar}</div>}
          </div>
        )}
        {bodySide !== undefined ? (
          <div className="mimir-editor__body mimir-editor__body--split">
            {children}
            {/* 侧列是 **浮层**：绝对定位钉在 body 右上角，不参与布局——
                滚动仍由主内容自己的容器承担（滚动条在画布最右缘），
                大纲不随内容滚走（语雀式）。内容侧由 padding 让出它的位置 */}
            <div className="mimir-editor__side">{bodySide}</div>
          </div>
        ) : (
          <div className="mimir-editor__body">{children}</div>
        )}
        {footer !== undefined && <div className="mimir-editor__footer">{footer}</div>}
        {status !== undefined && <div className="mimir-editor__status">{status}</div>}
      </div>
    </ConfigProvider>
  )
}

/**
 * 订阅编辑器的状态，`selector` 每次事务后重新算一次，返回**字符串**。
 *
 * ## 为什么必须用它，而不是在渲染期直接读 `editor.isActive`
 *
 * Tiptap v3 的 `useEditor` **默认不在事务上重渲染**
 * （`shouldRerenderOnTransaction` 默认 false，为了性能）。所以渲染期读
 * `isActive` 会停在旧值：把光标移进一段加粗文字，加粗按钮不会亮起来。
 * 它不报错，只是按钮状态永远是打开文档那一刻的——正是这个仓库最在意的
 * 那类静默出错。
 *
 * ## 为什么 selector 返回字符串而不是对象
 *
 * 默认的相等判断是深比较，字符串比它更省也更不容易出意外（对象每次新建，
 * 万一相等判断被换掉就会每次事务都重渲染）。这也是 `MarkdownEditor` 里
 * 那版的做法（`MARK_KEYS.filter(...).join(' ')`）。
 *
 * ## 为什么 docx 也要用
 *
 * `DocxEditor` 之前只在 `useEditor` 上开了 `onUpdate`，工具条按钮的激活态
 * 因此不跟着光标走。工具条「显示当前状态」的那批按钮**全部以这个 hook 为
 * 前提**——绕过它写的按钮在把光标移进加粗文字时不会亮。
 */
export function useToolbarState(
  editor: Editor | null,
  selector: (editor: Editor) => string,
): string {
  const value = useEditorState({
    editor,
    selector: ({ editor: instance }) => (instance === null ? '' : selector(instance)),
  })
  // `useEditorState` 在 editor 为 null 时返回 null（它在挂载前拿不到快照）
  return value ?? ''
}

export interface ToolbarButtonProps {
  /** 提示文字。用原生 `title`——它同时是**无障碍名称**的来源，读屏会念它 */
  label: string
  /** 图标元素（宿主传 antd 图标进来）。省略时按钮只显示文字 */
  children?: ReactNode
  /** 按下态（加粗生效时按钮是「按下去」的样子）。**只有真切换按钮才传** */
  active?: boolean
  disabled?: boolean
  /**
   * 禁用的**原因**（「这个方言没有表格节点」「选中不是列表」）。
   *
   * **必须显示，不能只是禁用**：一个灰着的按钮等于让人猜。禁用时按钮自己的
   * `title` 让给原因，`aria-label` 仍是 `label`——读屏用户听到的是「加粗，
   * 不可用」，鼠标用户看到的是「这个方言没有加粗」。
   *
   * 注意：部分浏览器不给 `disabled` 元素弹 `title`（原生行为），所以原因
   * **不要只写在这里**——真正需要解释的地方（M1 未实现的动作）还要在状态行
   * 或菜单里说一遍。
   */
  disabledReason?: string
  /** 主按钮（保存）。整条工具条最多一个 */
  primary?: boolean
  /**
   * 点击。**可以不给**：文件选择按钮就靠 rc-upload 挂在祖先上的处理器
   * 打开选择器，自己再挂一个空处理函数只会让人以为这里还有事要做。
   */
  onClick?: () => void
  /**
   * 转发给 antd `Button` 的 ref。
   *
   * **必须真的转下去**（React 19 的 ref-as-prop）：`ToolbarConfirm` 这类
   * 包一层的原语用 `cloneElement(child, { ref })` 拿触发元素来定位弹层，
   * 而丢掉 ref 之后弹层会静默留在 `left: -1000vw; top: -1000vh`——DOM 里
   * 看得到、截图里看不见（见下面 `ToolbarButton` 里的实测值）。
   */
  ref?: ComponentProps<typeof Button>['ref']
}

/**
 * 工具条按钮（antd `Button`）。
 *
 * 四件必须做对的事：
 *
 *  1. **是 `<button>`**，不是带 onClick 的 div——键盘、焦点环、读屏都靠它
 *     （antd 渲染的就是 `<button type="button">`）
 *  2. **用 `onMouseDown` 阻止默认行为**：点按钮会让编辑区失焦，选区随之
 *     被清掉，于是「给选中的文字加粗」作用不到任何东西（Word 也是这么做的）
 *  3. **激活态写进 `aria-pressed`**，样式选择器也读它——状态只留一个真相。
 *     **antd 的 Button 不认这个属性**（它只在 hover/active 上着色），
 *     所以按下态由 `shell.css` 的 `.me-tb[aria-pressed='true']` 画。
 *
 *     **`active` 只给真切换按钮（`aria-pressed` 随之只在这些按钮上出现）**：
 *     保存、上一页、A+/A− 这类一次性动作没有「按下 / 没按下」两个状态，无条件
 *     下发 `aria-pressed="false"` 会让读屏把它们报成「未按下的切换按钮」。不给
 *     `active` 时 React 整个属性都不渲染，而样式只匹配 `'true'`，所以外观不变。
 *  4. **两种外观两种写法，不能混**：
 *     - 普通按钮：`variant="text" color="default"`，**不要同时传 `type`**
 *     - 主按钮（保存）：**只传 `type="primary"`**，不要传 color/variant
 *
 * 第 4 条是 antd 的一条静默陷阱：`button.js` 的分支是「先看 color && variant，
 * 都给了就直接用」，于是 `<Button type="primary" variant="text" color="default">`
 * 会同时带上 `ant-btn-primary` 与 text/default 两个类——**渲染出来是透明的
 * 「保存」**，而它不报任何警告。所以两条路各写一支，且「保存」的断言要同时
 * 盯 `ant-btn-color-primary` 与 `ant-btn-variant-solid`。
 *
 * `autoInsertSpace={false}` 也是必需的：antd 默认会往**两个汉字之间插一个
 * 空格**（`<Button>替换</Button>` 的 textContent 是 "替 换"），而工具条上有
 * 两处按 textContent 认文案的断言。
 */
export function ToolbarButton({
  label,
  children,
  active,
  disabled = false,
  disabledReason,
  primary = false,
  onClick,
  ref,
}: ToolbarButtonProps) {
  return (
    <Button
      /*
       * **ref 要转到 antd 的 Button 上**（React 19 的 ref-as-prop：函数组件直接
       * 收 `ref`，不再是 `forwardRef`）。
       *
       * 不转的话包在 `ToolbarConfirm` / 将来的 Tooltip 里会**静默错位**：
       * rc-trigger 用 `cloneElement(child, { ref })` 拿触发元素来定位，而
       * 函数组件把 `ref` 丢掉之后 `targetEle` 是 null，`onAlign` 直接返回
       * ——弹层留在初始位置 `left: -1000vw; top: -1000vh`（实测：真实浏览器里
       * 确认框的 rect 是 x=-14400、y=-9000，屏幕上根本看不见，而 DOM 里
       * 一切正常、点确认也能走到 `onConfirm`）。
       */
      ref={ref}
      /*
       * 主按钮只传 `type`；其余只传 `variant` + `color`。两者的分支在 antd
       * 里是互斥的糖（见上），混着传会得到透明的实心按钮。
       */
      {...(primary
        ? { type: 'primary' as const }
        : { variant: 'text' as const, color: 'default' as const })}
      className="me-tb"
      autoInsertSpace={false}
      // 禁用时 title 让给原因，aria-label 仍是动作名（读屏听到的是「加粗，不可用」）
      title={disabled && disabledReason !== undefined ? disabledReason : label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children !== undefined && <span className="me-btn__icon">{children}</span>}
      {primary && label}
    </Button>
  )
}

/**
 * 按钮组的边界盒。
 *
 * **不是装饰**：它把「这一批按钮是一件事的几种取值」表达给读屏
 * （`role="group"` + 名字），而 `ToolbarDivider` 只是兄弟 flex 项——工具条是
 * `flex-wrap` 的，换行时那 1px 分隔线会落在行末或行首，看起来像没画对。
 */
export function ToolbarGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="me-group" role="group" aria-label={label}>
      {children}
    </div>
  )
}

/** 分组分隔线。相邻但不同类的一组操作之间用它，不要每两个按钮都插一条 */
export function ToolbarDivider() {
  /*
   * antd 的 `Divider`。两点要注意：
   *
   *  1. **`orientation="vertical"`，不是 `type="vertical"`**——后者是 v5 的
   *     写法，在 v6 里已废弃，实测会在 console.error 打
   *     `Warning: [antd: Divider] type is deprecated. Please use orientation instead.`
   *  2. **`aria-hidden` 要自己加**：antd 自带 `role="separator"`，不加的话
   *     读屏会把工具条上每一处分隔线都念一遍（docx 有 17 处）
   *
   * 不传 `className`：`.me-sep` 是「1px 宽 + background」的画法，而 antd 画的是
   * `border-inline-start` ——两个属性不重叠、特异性相同、都生效，结果会是内容盒
   * 1px 加左边框 1px，且颜色的来源变成两套。**这一条是从两边的源码推的**：
   * happy-dom 对 `border-inline-start-width` 取不到值，要在真浏览器里核。
   * 不传 className 就没有这个风险。
   */
  return <Divider orientation="vertical" aria-hidden="true" />
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

/**
 * 说明性的一整段文字（放在 `footer` 槽位，或者状态行里）。
 *
 * ## 为什么不能拿 `ToolbarLabel` 凑
 *
 * 那个原语是给工具条上的**短标签**的（页码、字数、`第 3 / 4 页`），它带
 * `white-space: nowrap`——工具条上换行会把一行拆成两行，所以才这么定。但
 * 「保存会重写整个文件」「裁剪只改可视区」这类说明往往有一两百字，nowrap 会
 * 让它**一路撑出外壳**：实测 420px 宽的窗口下 footer 的 `scrollWidth` 是 2150
 * 对 `clientWidth` 418，整页横向滚动、工具条右端的「保存」被推出可视区。
 *
 * 两种文字的形状不同（一个是标签，一个是段落），所以是两个原语。
 */
export function ToolbarNote({ children }: { children: ReactNode }) {
  return <p className="me-note">{children}</p>
}

/**
 * 状态行上的一次性提示：**动作的结果没成**（图片读不出尺寸、导进来的页面
 * 是空的之类）。
 *
 * ## 为什么不是 `ToolbarLabel` 也不是 `ToolbarNote`
 *
 * 三个原语是三件事，形状各不相同：
 *
 * | 原语 | 形状 | 场景 |
 * |---|---|---|
 * | `ToolbarLabel` | nowrap 的次要文字 | 页码、字数（一行里的短标签） |
 * | `ToolbarNote` | 能折行的灰色段落（`<p>`） | 说明「保存会重写整个文件」 |
 * | `ToolbarNotice` | 危险色、能断词的行内文字 | **刚才那个动作失败了，原因是什么** |
 *
 * 用前两个顶这一档都出过问题：状态行是 `flex` + `space-between`，`ToolbarLabel`
 * 的 `nowrap` 会让一条长原因把这一行撑破，而 `ToolbarNote` 是段落、放进
 * 状态行里与相邻的标签不在一个基线上。所以这一档单列一个原语。
 *
 * **不弹窗**：提示是编辑动作的直接结果，落在状态行上与「保存失败」同一个位置，
 * 不打断正在做的事。docx 之前自己造了一个 `span.mimir-docx-notice`（全仓库只有
 * 它一个消费者），而 pdf 拿 `ToolbarNote` 顶——同一档文案两处分叉，收进这里。
 */
export function ToolbarNotice({ children }: { children: ReactNode }) {
  return <span className="me-notice">{children}</span>
}

export interface ToolbarConfirmProps {
  /** 问句。一句话说清要发生什么（「删掉这一页？」） */
  title: string
  /**
   * 后果。**必须有**：这一档不是「确认一下」，而是「这件事没有退路、退路是
   * 什么」——用户在按下之前要知道代价。
   */
  description: string
  /** 确认按钮的文案。写成动作本身（「删除这一页」）而不是「确定」 */
  confirmLabel: string
  /** 取消的文案。默认「算了」——比「取消」更像人话，也说得清它是「不做了」 */
  cancelLabel?: string
  /** 禁用时不弹（按钮自己已经灰了、且写着原因） */
  disabled?: boolean
  onConfirm: () => void
  /** 触发按钮。**必须是一个能渲染 `title` 与 `aria-label` 的 `<button>`** */
  children: ReactNode
}

/**
 * 不可逆动作的**就地确认**（antd `Popconfirm`）。
 *
 * ## 为什么要有这个原语
 *
 * 工具条上有几处动作没有撤销：pdf 的「删除这一页」就是。它与左右两个按钮
 * （插入空白页、导入页面）都是纯图标、并排一排，代价却完全不对称——一次
 * 误点就少一页，而 pdf 这条工具条**没有别的格式都有的撤销**，唯一的路是
 * 「不保存、退出、重进」。
 *
 * 三处约束的来源：
 *
 *  1. **别自己写一个二次确认**（改按钮文案、第一次点变「再点一次」之类）：
 *     那是一套只有这一个控件懂的状态，键盘用户与读屏用户都拿不到
 *  2. **弹层 portal 到 body 是显式的例外**——`.mimir-editor` 是 `overflow: clip`，
 *     就地渲染会被裁掉；antd 的弹层自带 `css-var-root`，`--ant-*` 由它自己提供，
 *     深色下不会退回浅色回退值（与 `ToolbarSelect` 同一条，见那里的长注释）
 *  3. **编辑器不直接 import antd**（`pdf-toolbar-render.test.tsx` 有一条静态守护
 *     在守它）：所以这一档收进外壳，与其余控件同一个出处
 *
 * ## 为什么不用 `Modal.confirm`
 *
 * 命令式的 `Modal.confirm` 拿的是自己的状态，与 React 树脱开——`PdfEditor`
 * 里那些「改哪一页」的判据都在闭包里，命令式那条路要么把状态再读一遍、要么
 * 拿到过期的值。声明式的 `Popconfirm` 就在这棵子树里，点确认时它调用的函数
 * 与按钮上的那个是同一次渲染的。
 */
export function ToolbarConfirm({
  title,
  description,
  confirmLabel,
  cancelLabel = '算了',
  disabled,
  onConfirm,
  children,
}: ToolbarConfirmProps) {
  return (
    <Popconfirm
      title={title}
      description={description}
      okText={confirmLabel}
      cancelText={cancelLabel}
      // 确认按钮是危险动作，用危险色——它与「取消」只差一个位置，颜色是唯一
      // 提示「这一下真的会删掉东西」
      okButtonProps={{ danger: true, autoInsertSpace: false }}
      /*
        `autoInsertSpace: false` 与 `ToolbarButton` 那一条同一个理由：antd 会在
        **两个汉字**的按钮文案里插一个空格（「算了」→「算 了」），而这条工具条
        上其余控件都没有那个空格。这一档是 antd 自己建的按钮，只能在这里关。
      */
      cancelButtonProps={{ autoInsertSpace: false }}
      disabled={disabled === true}
      onConfirm={onConfirm}
    >
      {children}
    </Popconfirm>
  )
}

export interface ToolbarTextButtonProps {
  /**
   * 文字。**它同时是可见文案、`title` 与无障碍名称**——这一档没有图标，文字
   * 就是它的名字，所以只有一个真相、不存在「读屏念的」与「眼睛看的」不一致。
   *
   * （`ToolbarButton` 需要 `label` + `children` 分开，是因为那个是方框按钮、
   * 通常只有图标。这一档不拆——拆开就等于把一句话的可见部分与朗读部分分别维护。）
   *
   * 用整句话（「保存失败：磁盘已满 · 点此重试」）是**对的**：这一档是状态文字
   * 的延伸，读屏用户听到的应该与屏幕上写的一样。想给一个短名字的动作用
   * `ToolbarButton`。
   */
  label: string
  /** 危险色（动作与一次失败绑在一起）。默认是普通文字色 */
  danger?: boolean
  disabled?: boolean
  /**
   * 禁用的原因。与 `ToolbarButton` 同一条规矩：禁用时 `title` 让给原因，
   * `aria-label` 仍是动作名。
   */
  disabledReason?: string
  onClick?: () => void
}

/**
 * 状态行上的**可点文字**：一段说明 + 一个动作合成一档
 * （「保存失败：磁盘已满 · 点此重试」、「插图失败：文件太大 · 点此关闭」）。
 *
 * ## 为什么它长得不像按钮
 *
 * 它是状态行那句话本身的延伸，不是一个方框控件。同一条状态行里已经有
 * `ToolbarLabel`（页码、字数）与 `ToolbarNotice`（失败原因），把动作画成一个
 * 24px 的方框按钮会让这一行看起来像第二条工具条。所以：无边框、无底色、
 * 内边距为零、危险色 + 下划线——**它就是文字，只是可点**。
 *
 * ## 与 `ToolbarNotice` / `ToolbarButton` 的分工
 *
 * | 原语 | 形状 | 有没有动作 |
 * |---|---|---|
 * | `ToolbarNotice` | 危险色的行内文字 | 没有（只说明原因） |
 * | `ToolbarTextButton` | 危险色的行内文字 + 下划线 | **有**（重试 / 关掉这条提示） |
 * | `ToolbarButton` | 24px 的方框按钮 | 有（工具条上的动作） |
 *
 * 「保存失败」这一档以前两个格式各写各的：markdown 是状态行里的裸
 * `<button className="me-status-action">`（原生控件，D-064 要消掉的那种），
 * pdf 是一条 `ToolbarNotice` 加一个方框「知道了」。现在两边的**动作文字**这一
 * 半收进这里，`ToolbarNotice` 负责说明那一半。
 *
 * ## 仍然是 antd 的 `Button`（D-064）
 *
 * 尺寸、焦点环、hover、禁用态由 antd 承担；`variant="link"` 本来就没有边框与
 * 底色，且 `isUnBorderedButtonVariant('link')` 为真——antd 不会往两个汉字之间
 * 插空格（`autoInsertSpace` 再显式关一次，`textContent` 与可见文案一字不差）。
 * `.me-text-btn` 只改「像一个控件」的那几处：高度、内边距、边框、字号、nowrap。
 *
 * **不要把它挂到实心按钮上**：`.me-text-btn` 会用自己的底色与字色盖掉 antd 的
 * 实心外观（与 `.me-btn` 挂到 antd 按钮上是同一类坑）。
 *
 * 三条与 `ToolbarButton` 一致的语义：
 *
 *  1. **`onMouseDown` 阻止默认行为**：点它不该把焦点从正文里拿走——重试/关掉
 *     提示之后用户往往接着打字，而失焦会让光标位置在界面上消失
 *  2. 禁用时 `title` 让给原因（「可点而无事发生是最坏的一种」）
 *  3. **字号取 `--me-font-size-sm`（12px）是有意的例外**：这一档是**状态文字
 *     的一部分**，必须与同一行的 `ToolbarLabel` 同号；跟着 antd 的 small 档
 *     （14px）会让状态行左右两半的字号不一致。高度仍是 `auto`——它是文字，
 *     不是那一排 24px 的控件
 */
export function ToolbarTextButton({
  label,
  danger = false,
  disabled = false,
  disabledReason,
  onClick,
}: ToolbarTextButtonProps) {
  return (
    <Button
      /*
       * `link` 而不是 `text`：text 档的 hover 底色是 `colorErrorBg`（一块浅红
       * 底），而这一档要的是「文字」——link 档的 hover 只是字色加深
       * （`linkHoverBg: 'transparent'`），与下划线是同一套语言。
       */
      variant="link"
      color={danger ? 'danger' : 'default'}
      // 危险态单列一个类：`.me-text-btn--danger` 把字色钉在宿主校准过的
      // `--me-danger` 上（antd 的 `color="danger"` 只给 hover/active 阶，
      // 那两个由 error 种子派生，没走过宿主那次校准）
      className={danger ? 'me-text-btn me-text-btn--danger' : 'me-text-btn'}
      autoInsertSpace={false}
      title={disabled && disabledReason !== undefined ? disabledReason : label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

/** `ToolbarSelect` 的一项。`disabled` 用于「有这一档但当前文档用不了」 */
export interface ToolbarSelectOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

export interface ToolbarSelectProps<T extends string> {
  /** 这组取值是什么（读屏用）。如「字号」「段落样式」 */
  label: string
  /**
   * 当前值。**`null` 表示「不是选项里的任何一个」**（混合选区、光标在
   * 两种格式之间）——那不是错误状态，所以有一个单独的显示（见 `fallbackLabel`）。
   */
  value: T | null
  options: readonly ToolbarSelectOption<T>[]
  onChange: (value: T) => void
  /** `value` 不在选项里时显示什么。默认 `—` */
  fallbackLabel?: string
  /**
   * `value === null` 时显示什么。省略时用 `fallbackLabel`。
   *
   * ## 为什么这一档要能与 `fallbackLabel` 分开
   *
   * 那是**两件不同的事**，而它们现在共用一个说法：
   *
   *   - `value === null`：这一处**没有直接取值**，实际值继承自别处
   *     （docx 的字号继承自段落样式）——用户什么都没选
   *   - 值不在选项里：**有一个具体的值**，只是不在预设档位里（docx 半磅 22 =
   *     11 磅，档位表里没有）
   *
   * 用同一个词（docx 原先两处共用一个「其它」）时，第一句会被读成第二句：
   * 「我（不知何时）选了别的字号」，而事实是「这里没有字号，跟着样式走」。
   */
  emptyLabel?: string
}

/**
 * 枚举下拉（antd `Select`）。
 *
 * ## 为什么是下拉而不是一排按钮
 *
 * 按钮只有布尔态，而这里**显示区本身就是状态**（当前是几号字）。21 档字号
 * 用按钮要 21 个，还占掉整条工具条。
 *
 * ## 三条与 antd 默认行为不同的地方
 *
 *  1. **值不在选项里时不显示原值**：旧实现显示 `值（—）`，而 antd 默认显示
 *     原值本身。理由不是怀旧——docx 的「字号」存的是**半磅**（`w:sz` 的单位），
 *     直接显示 `22` 会让界面说一个用户从没见过的数（他填的是 11 磅）。所以用
 *     `labelRender` 把这种状态标成 `22（其它）`，与 `fallbackLabel` 同一个说法。
 *  2. **`suffixIcon` 必须给**：antd 的默认箭头带 `aria-label="down"`，同一条
 *     工具条上有几个下拉就有几个同名控件，docx 的「无障碍名称不得重复」
 *     会直接红（实测 9 个下拉 → 9 个 "down"）。
 *  3. **`title` 要一起给**：工具条上唯一的悬停说明就是它，漏了就只剩读屏
 *     知道这是什么。
 *
 * ## 下拉弹层会 portal 到 body（**这一条是显式例外**）
 *
 * 打开后 `document.body.childElementCount` 会 +1，弹层的祖先链离开了
 * `--me-*` 子树（实测弹层上 `--me-accent` 是空串）。**这不影响颜色**：弹层
 * 自带 `css-var-root` / `ant-select-css-var` 类，`--ant-*` 由它自己提供。
 *
 * 改 `getPopupContainer` 就地渲染是不行的：antd 弹层在 getPopupContainer 下
 * 用 `position: absolute`，而 `.mimir-editor` 是 `overflow: clip`——会被裁掉。
 * **所以「弹层内容要用 `--me-*` 上色」的控件（菜单、颜色面板）必须继续用我们
 * 自己的就地渲染 + `position: fixed`**，那是 `ToolbarMenu` / `ToolbarColorPicker`
 * 不迁的硬理由。
 *
 * `virtual={false}` 是**有意的**：antd 默认只渲染可视区那十几项（虚拟列表），
 * 于是「这个下拉到底列了哪些档」在 DOM 里读不全——段落样式的「只列文档里真的
 * 存在的标题级别」、字号的「21 档」这两条断言就会退化成「至少能看到几项」。
 * 字体与字号这类列表最长几十项，全渲染的代价可以忽略。
 */
export function ToolbarSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  fallbackLabel = '—',
  emptyLabel,
}: ToolbarSelectProps<T>) {
  const known = value !== null && options.some((option) => option.value === value)
  return (
    <Select
      aria-label={label}
      title={label}
      virtual={false}
      // 值不在选项里时把 value 交给 placeholder——**不要传原值当 value**：
      // antd 会把原值原样显示出来，而不在档位里时那往往是一个内部单位
      // （docx 的字号存半磅，直接显示 22 而用户填的是 11 磅）
      value={known ? value : null}
      // 两种「不是档位里的值」各有各的说法：`null` 是「这里没有直接取值」，
      // 其余是「有一个具体的值，只是不在预设档位里」（见 `emptyLabel` 的说明）
      placeholder={value === null ? (emptyLabel ?? fallbackLabel) : `${value}（${fallbackLabel}）`}
      suffixIcon={<ChevronDownIcon />}
      options={options.map((option) => ({
        value: option.value,
        label: option.label,
        disabled: option.disabled === true,
      }))}
      onChange={(next) => onChange(next as T)}
    />
  )
}

/** `ToolbarToggleGroup` 的一项 */
export interface ToolbarToggleOption<T extends string> {
  value: T
  label: string
  /** 图标。省略时按钮只显示 label（建议总是给，工具条位置紧） */
  icon?: ReactNode
  disabled?: boolean
}

export interface ToolbarToggleGroupProps<T extends string> {
  /** 这组按钮是什么（读屏用）。如「对齐方式」「html 的设备预览」 */
  label: string
  value: T
  options: readonly ToolbarToggleOption<T>[]
  onChange: (value: T) => void
}

/**
 * 互斥图标按钮组：**一个 value 进、一个 value 出**（antd `Segmented`）。
 *
 * ## 为什么不能是一排 `ToolbarButton`
 *
 * 那样「当前是哪一个」会退化成「每个按钮各自读一次当前状态」——写错一处就是
 * 两个同时亮（或者一个都不亮），而界面不会报错，只是看着奇怪。互斥关系由
 * 这一个 `value` 表达，就只有一个地方可能写错。
 *
 * ## 选中态的载体变了，语义没变
 *
 * 旧实现是三个 `aria-pressed` 的按钮，现在是 `role="radiogroup"` + 每项一个
 * `radio`（antd 的选中态由它自己画）。互斥仍然只有一个真相：`value`。
 *
 * ## 三条与旧实现不同的地方（都是有意接受的）
 *
 *  1. **`onMouseDown` 必须显式阻止默认行为**：antd 的 Segmented 项本身**不**
 *     preventDefault（实测 `SEG_MOUSEDOWN_PREVENTED: false`），落点是一个
 *     可聚焦的 `<input type=radio>`。不拦的话点一下就可能把编辑区失焦、
 *     选区被清（工具条里最容易静默坏掉的一条）。拦在根元素上，事件冒泡到
 *     根时被吃掉，与旧实现等效。
 *  2. **禁用项的原因没法用 `title` 表达**：antd 把 `title` 让给 label 文本了
 *     （实测禁用项的 title 就是它自己的名字）。将来要给某档加 `disabled` 时，
 *     原因得另找地方说——现在这 4 个调用点**都没有禁用档**，所以这风险还没兑现。
 *  3. **图标档只有图标，但名称不能丢**：antd 的 `icon` + `label` 会两个都画
 *     （工具条位置紧，不能显示文字），所以文字不能直接当 `label` 传。但
 *     `label` 又**不能不给**——`title` 挂在内层 label 的 div 上，可聚焦的是
 *     `<input type=radio>`，两者不关联。实测真 Chromium 的 AX 树：只传
 *     `title` 时 6 个档全部 `name: ""`（把 title 挪到 input 上也仍然是空），
 *     读屏只念「单选按钮 1 of 3」。所以文字用 `.me-sr-only` 塞进 label 元素
 *     ——它留在无障碍树里给出名称，视觉上不占位。
 */
export function ToolbarToggleGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: ToolbarToggleGroupProps<T>) {
  return (
    <Segmented
      aria-label={label}
      value={value}
      onMouseDown={(event) => event.preventDefault()}
      options={options.map((option) =>
        option.icon === undefined
          ? // 没有图标时退回 label 文字：只传 icon 的那一支会渲染成一个空档
            {
              value: option.value,
              label: option.label,
              title: option.label,
              disabled: option.disabled === true,
            }
          : {
              value: option.value,
              icon: option.icon,
              // 文字只给读屏（`.me-sr-only`），档上只显示图标
              label: <span className="me-sr-only">{option.label}</span>,
              title: option.label,
              disabled: option.disabled === true,
            },
      )}
      onChange={(next) => onChange(next as T)}
    />
  )
}

export interface ToolbarNumberFieldProps {
  /** 这是什么（读屏用）。如「页码」「字号」 */
  label: string
  value: number
  onCommit: (value: number) => void
  min?: number
  max?: number
  /** 跟在输入后面的单位（`pt`、`页`） */
  suffix?: string
}

/**
 * 连续取值的输入框（页码、字号、缩放百分比）。
 *
 * ## 为什么不是一个下拉或一排按钮
 *
 * 取值空间是**连续**的，而且上界随文档变（页码是 1..N，N 打开才知道）。
 * 下拉要枚举 N 项，按钮要点 N 次。
 *
 * ## 三条提交规矩仍由这一层管，antd 只管画（D-064）
 *
 * | 动作 | 结果 |
 * |---|---|
 * | 回车 / 失焦 | 提交，并**夹到 `[min, max]`** |
 * | Esc | 还原（丢掉草稿，显示回到外部值） |
 * | 非数字 / 空 | **不提交**——`Number('')` 是 0，不拦会把页码静默改成 0 |
 *
 * 这三条不能交给 antd 的 `InputNumber`（实测）：
 *
 *  1. 清空输入框它立刻报 `onChange(null)`，而**失焦后输入框仍是空的**——
 *     照「空值不提交」的规矩走，界面显示空、模型还是 12，**界面说了假话**；
 *     只有外部 value 变化才重新同步
 *  2. **Esc 没有还原语义**（输入 99 按 Esc 仍是 "99"）
 *  3. 夹区间只发生在它自己的解析路径上，表达不了「值没变不提交」
 *
 * 所以草稿（`string | null`）留在我们这边，`InputNumber` 只是一个渲染外壳。
 *
 * ## `controls={false}` 不是可选项
 *
 * 默认它会渲染两个 `<span role="button" aria-label="Increase Value">` /
 * `"Decrease Value"`——10 个数字框就是 10 组重复的无障碍名，docx 那条
 * 「名字不得重复」会直接红。视觉上也与原来一致（原来是
 * `appearance: textfield` 去掉的上下箭头）。
 *
 * ## 草稿为 `null` 时直接显示外部值
 *
 * **不把外部值复制进 state**：复制一份就要在外部值变化时同步回来（渲染期
 * setState 或 effect 二选一），而「没在编辑时读外部值」天然是对的——页码
 * 随翻页变、字号随选区变，一个都不用写同步代码。
 */
export function ToolbarNumberField({
  label,
  value,
  onCommit,
  min,
  max,
  suffix,
}: ToolbarNumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    if (draft === null) return
    setDraft(null)
    const text = draft.trim()
    const parsed = Number(text)
    // 空串也要拦：`Number('')` 是 0，不拦就等于「清空输入框 = 提交 0」
    if (text === '' || !Number.isFinite(parsed)) return
    let clamped = parsed
    if (min !== undefined) clamped = Math.max(min, clamped)
    if (max !== undefined) clamped = Math.min(max, clamped)
    if (clamped !== value) onCommit(clamped)
  }

  /*
   * 把输入框里的**文本**读回来。用 `onInput` 而不是 `onChange` 的第二参：
   * 后者在「清空」时给的是 `undefined`（实测），而草稿是字符串。
   */
  const onInput = (text: string) => {
    setDraft(typeof text === 'string' ? text : String(text))
  }

  return (
    <span className="me-field">
      {/*
        **`stringMode`**：值按字符串进出。作用是让草稿里的中间态原样留着——
        输入框清空时显示空（不是跳回外部值）、输入 `abc` 时显示 `abc`（不是
        被解析器吃掉半个），而夹区间与格式化留给提交那一刻。这正好对上
        「草稿 `string | null`」那套语义，也让 min/max 能跟着草稿类型走。
      */}
      <InputNumber<string>
        className="me-input--num"
        aria-label={label}
        title={label}
        stringMode
        value={draft ?? String(value)}
        min={min === undefined ? undefined : String(min)}
        max={max === undefined ? undefined : String(max)}
        controls={false}
        onInput={onInput}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') setDraft(null)
        }}
        onBlur={commit}
      />
      {suffix !== undefined && <span className="me-field__suffix">{suffix}</span>}
    </span>
  )
}

export interface ToolbarTextFieldProps {
  /** 这是什么（读屏用）。如「查找内容」「链接地址」 */
  label: string
  value: string
  onChange: (value: string) => void
  /** 回车。**含义各处不同**（查找是「下一个」、链接是「应用」），所以回调化 */
  onSubmit?: () => void
  /** Esc */
  onCancel?: () => void
  placeholder?: string
  /**
   * 这是「查找」输入框。挂上之后 `useFindHotkey` 能按 Ctrl+F 把焦点送进来
   * （标记走 `data-find-input`，**不看 className 或 aria-label**——那两样
   * 都会被无关的样式/文案调整改掉，而改掉的那一刻快捷键是静默失效的）。
   */
  findInput?: boolean
}

/** `Input` 的 ref 形状（`.select()` 拿它做「打开就选中已有查询」） */
export type ToolbarInputRef = InputRef

/**
 * 文本输入框（antd `Input`）。
 *
 * ## 为什么必须共用这一个
 *
 * 同一排里出现三种高度 / 三种焦点环（原生 input 裸着放、`me-input`、自绘的
 * 假输入框）正是 D-054 要消掉的漂移：字号、圆角、焦点环、禁用态各写一遍，
 * 只在用户眼里对上。凡是工具条里的文本输入都走这里。
 *
 * 两个与 antd 默认行为不同的地方：
 *
 *  1. **Esc 要自己判**：`Input` 没有对应的 prop，`onKeyDown` 是唯一入口
 *  2. **宽度靠 `className`**：antd 的 Input 自带 `width: 100%`，而这个原语
 *     的约定是「工具条上一行不拉满」（180px）；面板里的调用点再覆盖成 100%
 *     （`.me-link .me-input--text`）。两份样式特异性相同、项目样式在 head 里
 *     更靠后，所以能压过 antd。
 */
export function ToolbarTextField({
  label,
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  findInput = false,
}: ToolbarTextFieldProps) {
  return (
    <Input
      className="me-input--text"
      type="text"
      aria-label={label}
      title={label}
      placeholder={placeholder}
      value={value}
      {...(findInput ? { 'data-find-input': true } : {})}
      // 查找框 / 链接地址被拼写检查划红线是纯噪音
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSubmit?.()
        if (event.key === 'Escape') onCancel?.()
      }}
    />
  )
}

/**
 * Ctrl / Cmd+F 打开查找。
 *
 * ## 为什么要有这条
 *
 * docx 的工具条上写着「查找和替换 **(Ctrl+F)**」，而按下去实际弹出的是
 * **浏览器自带的查找**（那是找整个页面的，不是找文档内容）——标签承诺了
 * 一个不存在的动作（实测发现，D-096）。xlsx 的查找框是常驻的，而
 * markdown 笔记根本没有查找。
 *
 * ## 焦点由这里统一送
 *
 * `onReveal` 只负责「把查找栏显示出来」——各编辑器的打开方式不同
 * （docx/html 是隐藏的栏，xlsx 常驻不用开）。焦点统一送到
 * `[data-find-input]`（两种查找框都挂了），**并且 `select()`**：
 * 与浏览器 Ctrl+F 的行为一致，再按一次是「改掉上次的查询」而不是追加。
 *
 * `preventDefault` 是必须的：不拦的话浏览器自带的查找条会同时弹出来，
 * 两层查找叠在一起。唯一拦不住的场景是 html 编辑器的**预览 iframe 里**
 * ——焦点在 iframe 内时按键事件到不了宿主窗口，那一层留给浏览器原生查找
 * （在状态行也没承诺过那种情况下可用）。
 */
export function useFindHotkey(onReveal?: () => void): void {
  const revealRef = useRef(onReveal)
  useEffect(() => {
    revealRef.current = onReveal
  })
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f') return
      event.preventDefault()
      revealRef.current?.()
      /**
       * 用 **setTimeout 而不是 requestAnimationFrame**。
       *
       * 与 `pagination.ts` 里那条同一个坑：rAF 在**不可见**（后台标签页、
       * 某些内嵌 webview）时根本不派发帧——实测 IAB 里 `rafFired === false`，
       * 于是焦点永远送不到查找框（症状是「Ctrl+F 什么都不发生」）。
       * 这里只需要「等这一次渲染落地」，`setTimeout(0)` 与 rAF 等价且不受
       * 可见性影响。
       */
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>('[data-find-input]')
        input?.focus()
        input?.select()
      }, 0)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}

export interface ToolbarTextAreaProps {
  /** 这是什么（读屏用）。如「第 1 段」 */
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /**
   * 初始可见行数。默认 1——**1 行不等于单行输入框**：它仍是一个 `<textarea>`，
   * 所以框里的换行都保得住。见下面「为什么不能用 `ToolbarTextField`」。
   */
  rows?: number
}

/**
 * 多行文本输入（antd `Input.TextArea`）。
 *
 * ## 为什么单列一个原语：`ToolbarTextField` 顶不了
 *
 * 那个原语是 `type="text"`（单行，没有 `rows`、没有 resize），而**一段文字
 * 天生可能带换行**。换行不是某一种格式的属性：
 *
 * | 场景 | 换行从哪来 |
 * |---|---|
 * | pptx 的一个段落 | 软换行 `<a:br/>` 在模型里就是一条 `text === '\n'` 的 run |
 * | 将来别的格式 | 段落/单元格里的硬换行 |
 *
 * 硬换一个单行 `Input` 的代价是**静默的**：HTML 的值消毒算法会把 `\n` 直接从
 * `input.value` 里删掉，于是「改一个字」顺手把那一处软换行也删了，而界面不会
 * 报错（文件里少了 `<a:br/>`，要对着 XML 看才发现）。所以多行必须是真的
 * textarea。
 *
 * 它进外壳而不是留在编辑器里：留在调用点就会像上一版 pptx 那样再长出一套
 * 自己的高度 / 字号 / 焦点环（`.mimir-paras__item`），而那正是 D-064 要消掉的
 * 漂移——「换行」是文本的属性，不是幻灯片的属性。
 *
 * ## 两条如实记录的差别（都不是漏配）
 *
 *  1. **它比工具条那一排高**：antd 给原生 textarea 的 `min-height` 取
 *     `controlHeight`（32px）且**不随 size 档变小**（`input/style/textarea.js`
 *     的 `textarea.ant-input` 规则；small 档只改内边距与字号），而工具条那一排
 *     控件是 24px。两者不在同一行里——这个原语目前只用在内容下方的附属面板
 *     （一段一个框、自己成一列），所以「同一排三种高度」不成立。要把它压到
 *     24px 只能覆盖 antd 的 `min-height`，那正是 D-064 否决的「拿自己的样式
 *     覆盖控件观感」。
 *  2. **`resize` 用 antd 的默认值**（`vertical`）：与上一版手写的那条
 *     `resize: vertical` 一致，所以「拖高一点看整段」这个动作还在。
 */
export function ToolbarTextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 1,
}: ToolbarTextAreaProps) {
  return (
    <Input.TextArea
      rows={rows}
      aria-label={label}
      title={label}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export interface ToolbarFileButtonProps {
  /** 按钮名字。也是可见按钮的无障碍名称（隐藏 input 不进无障碍树，不需要名字） */
  label: string
  /** 交给系统文件选择器的过滤条件，如 `image/png,image/jpeg` */
  accept?: string
  disabled?: boolean
  /** 选中文件后的处理（docx 插图、pdf 导入页面）。可以是异步的 */
  onPick: (file: File) => void | Promise<void>
  /** 图标。省略时按钮显示 label 文字 */
  children?: ReactNode
}

/**
 * 按钮 + 隐藏的 `input[type=file]`（antd `Upload`）。
 *
 * ## 为什么不能用一个 `ToolbarButton` 加个 onClick
 *
 * 它开不了系统文件选择器。真要做就得每个调用点自己藏一个 input，并且
 * **每次选完记得把 `input.value` 清空**——不清的话，第二次选同一个文件
 * 不触发 `change`，症状是「点了没反应」，而代码看不出问题。这条清理是同一个
 * 坑，所以只写一遍。
 *
 * ## 为什么用 `Upload` 而不是自己藏 input
 *
 * 上面那条「清空」在 antd 里是**换 key 重挂 input**（`AjaxUploader` 的
 * `reset()` 改 uid、`uid` 当 input 的 key）——目标一致、机制不同。自己再写
 * 一遍清 value 就成了同一件事的第二份实现。
 *
 * 两处要注意：
 *
 *  1. **`beforeUpload` 返回 `false` 拦截上传**：我们只要文件本身，不要它替我们
 *     POST 到哪去。返回 `false` 之后 antd **不会**再上传，`onChange` 也不走
 *     上传路径——所以 `onPick` 就写在 `beforeUpload` 里（这是唯一拿得到文件的
 *     地方，且只调一次）。
 *  2. **`showUploadList={false}`**：antd 默认会在按钮下面列出「已上传文件」
 *     的列表，而我们的文件去向由调用方自己管（docx 插图、pdf 导入页面），
 *     显示一个永远转圈的列表是假状态。
 *
 * `disabled` 仍由我们那个带 label 的按钮表达（Upload 自身没有 size 档，
 * 也没法把 `className` 给到里面那个 button）。
 */
export function ToolbarFileButton({
  label,
  accept,
  disabled = false,
  onPick,
  children,
}: ToolbarFileButtonProps) {
  return (
    <span className="me-file">
      <Upload
        accept={accept}
        showUploadList={false}
        disabled={disabled}
        beforeUpload={(file) => {
          void onPick(file)
          // 不要上传：文件由调用方处理（保存路径各不相同）
          return false
        }}
      >
        <ToolbarButton label={label} disabled={disabled}>
          {children}
        </ToolbarButton>
      </Upload>
    </span>
  )
}

/* ── 弹出层（菜单 / 颜色面板共用） ─────────────────────────────── */

interface PopupPosition {
  top?: number
  bottom?: number
  left: number
}

/** 面板最小可用宽度，与 `shell.css` 的 `.me-menu__panel` 保持一致 */
const POPUP_MIN_WIDTH = 176
/** 面板高度估计值：打开那一刻它还没挂载，量不到真实高度 */
const POPUP_EST_HEIGHT = 240

/**
 * 目标算不算「面板里的东西」——**包括从面板里的控件 portal 出去的弹层**。
 *
 * 面板里的 antd `Select` 打开后弹层挂在 body 上（见 `ToolbarSelect` 的说明），
 * 祖先链不在面板里。只按祖先判断的话，按选项、滚选项都会被当成「点了外面」：
 * 面板一关、弹层跟着卸载，选项永远点不中——界面不报错，只是点了没反应。
 *
 * 判据用 antd 自己写的 `aria-controls` / `aria-owns`：它把弹层与触发它的
 * 输入框连了起来（`${id}_list`）。「属于面板」= 目标、目标的祖先、或目标的
 * 后代，是面板里某个控件声明拥有的元素。不用类名：类名等 antd 改版就失效。
 */
function insidePanel(panel: HTMLElement | null, target: Node): boolean {
  if (panel === null) return false
  if (panel.contains(target)) return true
  const ids = new Set<string>()
  for (const element of panel.querySelectorAll('[aria-controls], [aria-owns]')) {
    for (const attribute of ['aria-controls', 'aria-owns'] as const) {
      for (const id of (element.getAttribute(attribute) ?? '').split(/\s+/)) {
        if (id !== '') ids.add(id)
      }
    }
  }
  for (const id of ids) {
    const owned = document.getElementById(id)
    if (owned === null) continue
    if (owned === target || owned.contains(target) || target.contains(owned)) return true
  }
  return false
}

/**
 * 一条弹出层的定位 + 键盘 + 关闭。
 *
 * ## 为什么**不 portal 到 body**
 *
 * portal 会把面板移出 `--me-*` 所在的那棵子树，于是深色主题下弹层退回浅色
 * 回退值（这个包不依赖 antd，回退值是浅色的）。就地渲染 + `position: fixed`
 * 是等价的：fixed 的包含块是**视口**，所以外壳的 `overflow: clip`
 * （见 `shell.css` 的 `.mimir-editor`）裁不到它。
 *
 * 一个前提：祖先里不能有 `transform` / `filter` / `will-change`——有的话
 * fixed 会相对那个祖先定位。外壳这一层没有，宿主往上加的时候要知道。
 *
 * ## 为什么滚动就关
 *
 * 坐标是**打开那一刻**算出来的。滚动之后触发按钮已经不在原处，面板还悬在
 * 旧位置——比关掉更让人困惑。改窗口大小同理。
 */
function useToolbarPopup() {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<PopupPosition | null>(null)
  const open = position !== null

  const toggle = () => {
    if (position !== null) {
      setPosition(null)
      return
    }
    // 位置在**事件里**算：渲染期读 ref 会被 React Compiler 判违规
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect === undefined) {
      setPosition({ top: 0, left: 0 })
      return
    }
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPUP_MIN_WIDTH - 8))
    const below = window.innerHeight - rect.bottom
    setPosition(
      below < POPUP_EST_HEIGHT && rect.top > below
        ? // 下方放不下就往上展开：用 `bottom` 锚定，面板实际高度与估计值不同也不会越过按钮
          { bottom: window.innerHeight - rect.top + 4, left }
        : { top: rect.bottom + 4, left },
    )
  }

  /** 关掉并把焦点还给触发按钮（键盘用户不能掉到 body 上） */
  const close = () => {
    setPosition(null)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const dismiss = (returnFocus: boolean) => {
      setPosition(null)
      if (returnFocus) triggerRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target === null) return
      // 面板内（含它 portal 出去的弹层）与触发按钮上的按下不算「点外部」
      // ——触发按钮自己会 toggle
      if (insidePanel(panelRef.current, target)) return
      if (triggerRef.current?.contains(target) === true) return
      dismiss(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape 关闭并**还焦点**：焦点留在被卸载的元素上会让键盘用户掉到 body
      if (event.key === 'Escape') dismiss(true)
    }
    const onScroll = (event: Event) => {
      const target = event.target as Node | null
      // 面板自己内部滚动（max-height）不算「外面滚了」；
      // portal 出去的弹层同理（它也有 max-height）
      if (target !== null && insidePanel(panelRef.current, target)) return
      dismiss(false)
    }
    const onResize = () => dismiss(false)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  // 打开后把焦点交给面板：键盘用户要能直接按方向键（读屏也会念出这是一条菜单）
  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
  }, [open])

  return { open, position, triggerRef, panelRef, toggle, close }
}

/** 面板里能被方向键选中的项（`role` 是判据，不是类名） */
const ITEM_SELECTOR = '[role="menuitem"]:not([disabled])'

/**
 * 面板里的**表单控件**。
 *
 * 判据是「事件从哪来」，不是「它在哪个类名的容器里」：类名要每个调用点自己记得
 * 挂，漏一个就静默失效一次。docx 曾经靠 `MenuFields` 的 `stopPropagation` 绕过
 * 方向键处理器，而 markdown 的两个面板（`.me-link` / `.me-insert`）没有那一层
 * ——地址框里按上下键、Home、End 全被菜单吃掉，输入框还在，只是键按不动。
 */
const FORM_CONTROL_SELECTOR =
  'input, textarea, select, [role="textbox"], [role="spinbutton"], [role="combobox"], [role="listbox"]'

/** 这个按键是不是来自面板里的表单控件（是的话菜单别抢，见 `onPanelKeyDown`） */
function fromFormControl(event: ReactKeyboardEvent<HTMLDivElement>): boolean {
  const target = event.target
  return target instanceof Element && target.closest(FORM_CONTROL_SELECTOR) !== null
}

/** `ToolbarMenu` 的一项 */
export interface ToolbarMenuItem {
  /** 稳定标识。做 React key */
  key: string
  label: string
  onSelect?: () => void
  /** 当前值（打勾）。配合 `disabled` 表达 DESIGN §8.4 的「当前值禁用」 */
  active?: boolean
  disabled?: boolean
  /** 禁用原因。**必须给**：可点而无事发生是最坏的一种（DESIGN §8.4） */
  disabledReason?: string
  /** 分组线。分的是「类别」，不是「每两项之间」 */
  separator?: boolean
}

export interface ToolbarMenuProps {
  /** 触发按钮的名字。也是面板的无障碍名称 */
  label: string
  /** 触发按钮上的文字（可选，如「插入」）。省略时只有图标 + 箭头 */
  text?: string
  icon?: ReactNode
  items?: readonly ToolbarMenuItem[]
  /**
   * 自定义面板（颜色网格、图层列表这类 `items` 表达不了的）。
   * `close` 由外壳给——**别自己想办法关**，否则焦点不会回到触发按钮。
   */
  renderPanel?: (close: () => void) => ReactNode
  /** 没有可选项时那条禁用说明的文字（DESIGN §8.4 规矩 1：不留空子菜单） */
  emptyLabel?: string
}

export interface ToolbarMenuItemRowProps {
  item: ToolbarMenuItem
  /**
   * 选中之后关掉面板。
   *
   * **可以不给**：`renderPanel` 里那些与菜单项混排的控件（连着用的动作、输入框）
   * 不该被一次点击带走——docx 的「修订」面板就是这个形状（上一处/下一处要点着
   * 连看，点一下就收面板等于每看一处都要重开一次）。
   */
  close?: () => void
}

/**
 * 一条菜单项（`role="menuitem"`）。
 *
 * ## 为什么要单独导出
 *
 * `ToolbarMenu` 的面板只能是 `items` **或** `renderPanel` 二者之一，而
 * `renderPanel` 拿到的是裸 `close`——没有「把这一条渲染成菜单项」的手段。于是
 * 「菜单项 + 输入框混在同一个面板里」的表格菜单 / 修订面板只能照着 `items`
 * 那一支的 markup 手抄一遍，而**抄的正好是三件静默错的事**：
 *
 *  1. `aria-current` 表达「当前值是这一项」
 *  2. 禁用时把 `title` 让给原因（一个灰着的行等于让人猜）
 *  3. 点完关面板（自己想办法关的话焦点不会回到触发按钮）
 *
 * 所以收进原语：`items` 分支用它，调用方的 `renderPanel` 也用它——两边不可能
 * 再漂移。docx 的 `TableActions` / `RevisionsPanel` 因此各删掉一份手抄。
 */
export function ToolbarMenuItemRow({ item, close }: ToolbarMenuItemRowProps) {
  if (item.separator === true) return <ToolbarMenuSeparator />
  return (
    <button
      type="button"
      role="menuitem"
      className="me-menu__item"
      aria-current={item.active === true ? 'true' : undefined}
      // 禁用时 title 让给原因，可用时 title 就是名字（悬停说明与读屏名称同源）
      title={
        item.disabled === true && item.disabledReason !== undefined
          ? item.disabledReason
          : item.label
      }
      disabled={item.disabled === true}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        item.onSelect?.()
        close?.()
      }}
    >
      <span className="me-menu__check" aria-hidden="true">
        {item.active === true ? <CheckIcon /> : null}
      </span>
      <span className="me-menu__label">{item.label}</span>
    </button>
  )
}

/**
 * 面板里的一道分组线（分的是「类别」，不是「每两项之间」）。
 *
 * 与 `ToolbarMenuItem` 的 `separator` 是同一件事——单独导出是给 `renderPanel`
 * 用的：它拿不到 items 的渲染器，但同样要能把面板里的几组控件分开。
 */
export function ToolbarMenuSeparator() {
  return <div className="me-menu__sep" role="separator" />
}

/**
 * 面板里的一组**普通控件**（输入框、下拉，而不是菜单项）。
 *
 * 与 `ToolbarMenuSeparator` 同一个理由单独导出：`renderPanel` 拿不到 items 的
 * 渲染器，但同样要把面板里的「标签 + 控件」摆成一行行。**样式与 markup 都归
 * 这里**——`.me-menu__fields` 原来住在 `shell.css` 却由调用方手写 div，于是
 * 「shell.css 定义、外壳不产出」的类又多一处（那正是 `ToolbarGridPicker` 要
 * 消掉的那件事）。
 *
 * 键盘规矩**不在这里**：方向键那条已经收进 `ToolbarMenu` 的 `onPanelKeyDown`
 * （按事件来源判断，表单控件里的一律不抢）。
 */
export function ToolbarMenuFields({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="me-menu__fields" role="group" aria-label={label}>
      {children}
    </div>
  )
}

/** 面板里的一句说明（说清这个开关是干什么的、或为什么某项给不了） */
export function ToolbarMenuNote({ children }: { children: ReactNode }) {
  return <p className="me-menu__note">{children}</p>
}

/**
 * 触发按钮 + 面板。
 *
 * 三条 DESIGN §8.4 的规矩在这里实现：
 *
 *  1. **不留空子菜单**：`items` 为空（且没有 `renderPanel`）时给一条禁用的
 *     说明项，而不是渲染一个空面板——展开后什么都没有会让人以为坏了
 *  2. **当前值禁用**：由调用方给 `disabled` + `disabledReason`，外壳负责让
 *     它在视觉与读屏上都表达出来（禁用时 `title` 让给原因）
 *  3. **危险动作不进这个菜单**：删除这类不可撤销的动作留在它该在的地方。
 *     这条是调用方的纪律，外壳只能用注释守住
 *
 * 键盘：方向键在项间移动、Home/End 到两端、Escape 关闭并还焦点、Tab 关闭。
 */
export function ToolbarMenu({
  label,
  text,
  icon,
  items,
  renderPanel,
  emptyLabel = '没有可选项',
}: ToolbarMenuProps) {
  const { open, position, triggerRef, panelRef, toggle, close } = useToolbarPopup()

  const enabledItems = (): HTMLElement[] => {
    const list = panelRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR)
    return list === undefined ? [] : Array.from(list)
  }

  const moveFocus = (step: number) => {
    const all = enabledItems()
    if (all.length === 0) return
    const index = all.findIndex((element) => element === document.activeElement)
    const next =
      index === -1 ? (step > 0 ? 0 : all.length - 1) : (index + step + all.length) % all.length
    all[next]?.focus()
  }

  const focusEdge = (edge: 'first' | 'last') => {
    const all = enabledItems()
    const target = edge === 'first' ? all[0] : all[all.length - 1]
    target?.focus()
  }

  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    /*
     * **表单控件里的按键归它们自己**：数字框的上下键是改数、下拉的上下键是换档、
     * Home/End 在输入框里是回到行首行尾。抢过来的话控件看着还在、就是按不动。
     *
     * 这一层以前由调用方自己加（docx 的 `MenuFields` 挂了个 `stopPropagation`），
     * 而 markdown 的两个面板漏了——所以规矩收进原语，别再靠每个调用点记得。
     * Tab 也从这里走：焦点在面板内的控件上时，先让 Tab 在面板里正常走。
     */
    if (fromFormControl(event)) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(-1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusEdge('first')
    } else if (event.key === 'End') {
      event.preventDefault()
      focusEdge('last')
    } else if (event.key === 'Tab') {
      // 关掉但**不抢焦点**：Tab 的默认行为接着把焦点交给触发按钮后面的控件
      close()
    }
  }

  const hasItems = items !== undefined && items.length > 0

  return (
    <span className="me-menu">
      <button
        ref={triggerRef}
        type="button"
        /*
         * **裸 `<button className="me-btn">`，不经过 `ToolbarButton`**：
         * 这个触发器带 `aria-haspopup` / `aria-expanded`，而 antd 的 Button
         * 不认那两个属性（也不认 `aria-pressed`），且我们要的就是这一份手写的
         * 尺寸与焦点环（`.me-btn` 归这两个未迁移的弹层触发器用，见 shell.css）。
         */
        className="me-btn"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggle}
      >
        {icon !== undefined && <span className="me-btn__icon">{icon}</span>}
        {text !== undefined && text !== '' && <span className="me-menu__text">{text}</span>}
        <span className="me-btn__icon me-menu__caret">
          <ChevronDownIcon />
        </span>
      </button>
      {open && position !== null && (
        <div
          ref={panelRef}
          className="me-menu__panel"
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onPanelKeyDown}
          style={
            position.bottom === undefined
              ? { top: position.top, left: position.left }
              : { bottom: position.bottom, left: position.left }
          }
        >
          {renderPanel !== undefined ? (
            renderPanel(close)
          ) : hasItems ? (
            items.map((item) => <ToolbarMenuItemRow key={item.key} item={item} close={close} />)
          ) : (
            // 规矩 1：空菜单要给一条**禁用的说明**，不是空面板
            <ToolbarMenuItemRow
              item={{ key: 'empty', label: emptyLabel, disabled: true, disabledReason: emptyLabel }}
            />
          )}
        </div>
      )}
    </span>
  )
}

/** `ToolbarColorPicker` 的一档颜色 */
export interface ToolbarColorOption {
  /**
   * 存进文档的值。docx 的突出显示存的是 **OOXML 色名**（`yellow` / `darkBlue`
   * 这 16 个，见 `marks.ts` 的 `HIGHLIGHT_CSS`）——写错色名 Word 会静默忽略。
   */
  value: string
  label: string
  /** 界面上显示的颜色（CSS 颜色）。**与 `value` 分开**：一个是存储格式，一个是显示 */
  swatch: string
}

export interface ToolbarColorPickerProps {
  /** 这是什么（读屏用）。如「字体颜色」「突出显示」 */
  label: string
  /** 当前值。`null` = **没有设置**（不是「默认色」） */
  value: string | null
  options: readonly ToolbarColorOption[]
  onPick: (value: string) => void
  /** 给了才渲染「清除」。字体颜色可以「自动」、段落底纹可以「无」 */
  onClear?: () => void
  /**
   * 触发器上的图标。**同一个工具条里有两个以上的取色器时必须给**：
   * 没设置颜色时它们的触发器长得一模一样（都是一条斜线 + 箭头），
   * 光看形状分不出哪个是字体颜色、哪个是段落底纹——只有悬停看 title 才知道。
   */
  icon?: ReactNode
  /**
   * 内联形态：只渲染那排色块，不渲染触发器、不渲染弹层、不开 popup。
   * 给「面板里的一小节」用——docx 的单元格底纹在**已经展开的表格菜单**里，
   * 那里再套一个「触发器 + 弹层」就成了面板里再开一层面板。
   *
   * 两种形态共用同一份网格与同一条键盘/选中语义（见 `ToolbarColorGrid`），
   * 不内联的那一支只是把它包进弹层。
   */
  inline?: boolean
  /**
   * 「清除」那一格的说明。默认「清除颜色」。
   *
   * 给了才需要它：同一个原语在两处当不同的东西用（字体颜色 / 突出显示 /
   * 段落底纹 / 单元格底纹），读屏念出来的应当是对应的那件事——单元格底纹上
   * 念「清除颜色」是**界面说了假话**，只是不明显。
   */
  clearLabel?: string
}

/**
 * 色块那一排。**`ToolbarColorPicker` 的两种形态共用它**——这是「面板里手抄
 * 一份内部 markup」不再发生的原因：抄的那份会漏掉 `aria-pressed`（全仓库
 * 一度一处都没有），于是「当前是哪个颜色」在界面与读屏上都丢了。
 *
 * 用 `role="group"` + 一排真 `<button>`，不用 `role="menu"`：颜色网格里方向键
 * 的语义（上下是同一列还是相邻色）没有共识，而真按钮的 Tab / Enter / 空格是
 * 浏览器给的、不用自己实现一半。
 *
 * `onPicked` 是**选中之后**的钩子：弹层形态拿它关面板，内联形态不给（面板
 * 是调用方的，关不关由调用方决定）。
 */
function ToolbarColorGrid({
  label,
  value,
  options,
  onPick,
  onClear,
  clearLabel = '清除颜色',
  onPicked,
}: {
  label: string
  value: string | null
  options: readonly ToolbarColorOption[]
  onPick: (value: string) => void
  onClear?: () => void
  clearLabel?: string
  onPicked?: () => void
}) {
  return (
    <div className="me-picker-grid" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="me-color__cell"
          title={option.label}
          aria-label={option.label}
          /*
           * 选中的那一档。**这是网格上唯一的「当前值」表达**——原来只有
           * 弹层形态有它，内联那一份（docx 的单元格底纹）漏了，于是「这一格
           * 现在是什么颜色」在界面上读不出来。两种形态共用这里就不可能再漏。
           */
          aria-pressed={option.value === value}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onPick(option.value)
            onPicked?.()
          }}
        >
          <span className="me-color__swatch" style={{ background: option.swatch }} />
        </button>
      ))}
      {onClear !== undefined && (
        <button
          type="button"
          className="me-color__cell me-color__cell--clear"
          title={clearLabel}
          aria-label={clearLabel}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onClear()
            onPicked?.()
          }}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  )
}

/**
 * 色块触发器 + 调色板（或者只有调色板，见 `inline`）。
 *
 * 触发器上显示**当前颜色**（这就是它不能是一个普通按钮的原因：按钮只有
 * 按下/没按下，而这里要显示一个值）。
 *
 * ## 内联形态（`inline`）
 *
 * 它存在的理由是「面板里的一小节」：docx 的单元格底纹长在**已经展开的表格
 * 菜单**里，那个位置没法再套一个弹层。之前只能照着这里的内部 markup 手抄一份
 * `me-color__cell`——抄漏了 `aria-pressed`，于是「当前底纹是什么」在界面与读屏
 * 上都读不出来（那个 bug 是静默的，看着只是「这排色块没反应」）。
 *
 * 内联形态**仍然要 `label`**：它给那排色块当 `role="group"` 的组名。
 */
export function ToolbarColorPicker({
  label,
  value,
  options,
  onPick,
  onClear,
  icon,
  inline = false,
  clearLabel,
}: ToolbarColorPickerProps) {
  const { open, position, triggerRef, panelRef, toggle, close } = useToolbarPopup()
  const current = options.find((option) => option.value === value)

  const grid = (
    <ToolbarColorGrid
      label={label}
      value={value}
      options={options}
      onPick={onPick}
      onClear={onClear}
      clearLabel={clearLabel}
      /*
       * 弹层里选完要关；内联形态**不关**——它没有自己的弹层可关，`close` 是
       * 调用方的 `ToolbarMenu` 的那个（关掉整个表格菜单会让人没法连着改几个
       * 格子上的底纹）。
       */
      onPicked={inline ? undefined : close}
    />
  )

  // 内联：不渲染触发器、不开 popup，只是把那排色块交出去
  if (inline) return grid

  return (
    <span className="me-menu">
      <button
        ref={triggerRef}
        type="button"
        className="me-btn"
        title={label}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggle}
      >
        {icon !== undefined && <span className="me-btn__icon">{icon}</span>}
        <span className="me-btn__icon">
          {current === undefined ? (
            // 没设置（或值不在选项里）时画一条斜线，**不能**显示成第一个颜色
            <span className="me-color__swatch me-color__swatch--none" />
          ) : (
            <span className="me-color__swatch" style={{ background: current.swatch }} />
          )}
        </span>
        <span className="me-btn__icon me-menu__caret">
          <ChevronDownIcon />
        </span>
      </button>
      {open && position !== null && (
        <div
          ref={panelRef}
          className="me-menu__panel me-color__panel"
          /*
           * **面板这一层不带 `role` / `aria-label`**：语义（`role="group"` +
           * 名字）在那排色块自己的 `ToolbarColorGrid` 上。两层都挂同一个名字
           * 会让读屏把「突出显示」念两遍，而定位于那个名字的辅助软件会命中
           * 外面这层不可点的容器。
           */
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === 'Tab') close()
          }}
          style={
            position.bottom === undefined
              ? { top: position.top, left: position.left }
              : { bottom: position.bottom, left: position.left }
          }
        >
          {grid}
        </div>
      )}
    </span>
  )
}

export interface ToolbarGridPickerProps {
  /** 这一组格子是什么（读屏用）。如「插入表格的大小」 */
  label: string
  rows: number
  columns: number
  /** 某一格的说明。每一格都用它当 `title` 与 `aria-label`（不用数格子） */
  cellLabel: (row: number, column: number) => string
  /** 点某一格（行列都从 1 起） */
  onPick: (row: number, column: number) => void
}

/**
 * 格子选择器（docx 的「插入表格」：8×8 的方块，点哪一格就插多大的表）。
 *
 * ## 为什么它不是 antd 的控件
 *
 * 格子是 **18px** 的方块，antd 最小的档（small）实测 24px——要 18px 就得写
 * 字面量覆盖 `.ant-btn-sm`，而那条路 D-064 明确否决（不覆写 antd 内部结构）。
 * 它与 `.me-tab` / `.me-color__cell` 是同一类：**不是 antd 控件的自绘小方块**。
 *
 * ## 为什么收进外壳而不是留在 docx 里
 *
 * 那套 `.me-table-grid*` 的样式本来就住在 `shell.css`（原语的样式表）里，却
 * 没有任何原语产出这些类名——全仓库仅有的「shell.css 定义、`EditorShell.tsx`
 * 完全不用」的几个类之一。样式在原语里、markup 在调用方，就等于每一处新
 * 调用点都要把 markup 再抄一遍（每一格手写 `title` 与 `aria-label`）。
 */
export function ToolbarGridPicker({
  label,
  rows,
  columns,
  cellLabel,
  onPick,
}: ToolbarGridPickerProps) {
  return (
    <div className="me-picker-grid" role="group" aria-label={label}>
      {Array.from({ length: rows }, (_unusedRow, r) => (
        <div key={r} className="me-table-grid">
          {Array.from({ length: columns }, (_unusedColumn, c) => (
            <button
              key={c}
              type="button"
              className="me-table-grid__cell"
              // 每一格自己说明白点它会做什么——不用数格子
              title={cellLabel(r + 1, c + 1)}
              aria-label={cellLabel(r + 1, c + 1)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPick(r + 1, c + 1)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/* ── 查找 / 替换 ──────────────────────────────────────────────── */

/**
 * 查找面板对编辑器的适配接口。
 *
 * **形状与 vendored 的 `FindTarget` 一致**（`src/shims/ui.ts`，来自上游
 * `packages/ui/src/find-panel.tsx`）——所以 html 那边现成的 `cmFindTarget`
 * 可以**零适配**直接传进来。
 */
export interface FindAdapter {
  /**
   * 重新扫描并高亮，返回匹配数。`activeIndex` 是当前要高亮的那一个（0 起）。
   * 上游把 `FindOptions` 放在**第二个**参数，这里保持一致。
   */
  search(query: string, options: FindOptions, activeIndex: number): number
  /** 把当前匹配挪到 `index` 并滚进视野 */
  activate(index: number): void
  /** 清掉所有高亮 */
  clear(): void
  /** 文档变化后回调（拿它重新扫描）。返回取消订阅 */
  onDocChanged?: (listener: () => void) => () => void
}

/**
 * 带替换的适配器。**替换是可选的**：pdf 只有查找（改文字要 PDFium 的 WASM，
 * 见 TECH §15.12）。上一版把 `replaceOne` / `replaceAll` 定成必选又要
 * 「pdf 只有查找」，那会逼 pdf 塞两个空实现——空实现点了没反应，
 * 正是这个仓库最讨厌的那种按钮。
 */
export interface FindReplaceAdapter extends FindAdapter {
  /** 替换第 `index` 个匹配。方法不存在 = 这条栏不渲染替换区 */
  replaceOne?(index: number, replacement: string): void
  /** 全部替换 */
  replaceAll?(replacement: string): void
}

export interface FindReplaceBarProps {
  /** 匹配与替换的落点。`null` = 还没有可查的内容（还在解析），整条栏空转 */
  adapter: FindReplaceAdapter | null
  /**
   * 查询串。**受控**：「打开时带上选中的文字」这类行为只有调用方知道，
   * 在这里再存一份就会有两个真相。
   */
  query: string
  onQueryChange: (query: string) => void
  /** 替换文本。不给的话栏自己存（`onReplaceChange` 同理） */
  replace?: string
  onReplaceChange?: (value: string) => void
  /**
   * 查找选项。**给了才渲染那两个开关**——pdf 是按页取文本再自己比，
   * 全词匹配不一定实现得了，不该让它显示一个做不到的开关。
   */
  options?: FindOptions
  onOptionsChange?: (options: FindOptions) => void
  /** 关掉这条栏（宿主控制显隐）。Esc 也走这里 */
  onClose?: () => void
  /** 挂载时把焦点给查询框并选中已有内容（默认 true） */
  autoFocus?: boolean
  /** 整条栏的无障碍名称 */
  label?: string
}

/** 查找结果的快照：`count` 是文档给的，`active` 是当前要高亮的那一个 */
interface FindSnapshot {
  count: number
  active: number
}

/**
 * 匹配结果的 store。
 *
 * ## 为什么不直接用 `useState` 存数量
 *
 * `count` **不是这个组件内部算出来的**，而是外部系统（编辑器）报回来的。
 * 用 `useState` 就意味着「在 effect 里同步 `setState`」，而那有两重代价：
 *
 *  1. 级联渲染（`react(set-state-in-effect)` 报的就是这个）
 *  2. **React Compiler 会因此跳过整个组件**——这个仓库的铁律之一。它不报错，
 *     只是这个组件不再被优化，正是「以为没问题的时候悄悄地错」
 *
 * `useSyncExternalStore` 是 React 给「读外部可变来源」的答案：订阅在适配器上、
 * 快照只在本组件读，两边不会读到不一致的值。数量与下标一起进快照，是因为
 * 「第几个」在数量变小的时候必须跟着夹回来——两个值分开存就会出现
 * 「12 / 3」这种中间态。
 */
function createFindStore() {
  let snapshot: FindSnapshot = { count: 0, active: 0 }
  const listeners = new Set<() => void>()
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => snapshot,
    publish(next: FindSnapshot) {
      // 值没变就不通知：`useSyncExternalStore` 会因为一次无意义的通知重新读快照
      if (next.count === snapshot.count && next.active === snapshot.active) return
      snapshot = next
      for (const listener of listeners) listener()
    },
  }
}

/**
 * 跑一次匹配，返回新快照。
 *
 * **会画高亮**（`activate`），所以只能在事件与订阅回调里调，不能在渲染期调。
 * `activate` 为假时不挪高亮（文档变化后的重扫用它：挪动会派发事务，
 * 而事务又触发 `onDocChanged`——那是一个转不停的循环）。
 */
function searchNow(
  adapter: FindReplaceAdapter,
  query: string,
  options: FindOptions,
  requested: number,
  activate: boolean,
): FindSnapshot {
  const count = adapter.search(query, options, requested)
  const active = count === 0 ? 0 : Math.min(requested, count - 1)
  if (activate && count > 0) adapter.activate(active)
  return { count, active }
}

/**
 * 查找 / 替换栏。六种格式共用**同一条**，差别只在谁来匹配：
 *
 * | 格式 | 适配器怎么来 |
 * |---|---|
 * | docx | `searchPluginKey` 的 decoration + 自己比块文本 |
 * | pptx | `setText` 循环 |
 * | html | vendored 的 `cmFindTarget`（**零适配**） |
 * | pdf | `getTextContent` 取文本后自己比（没有替换） |
 *
 * 匹配与索引的状态**在适配器里**，这条栏只知道数量与下标：`search` 返回几个、
 * `activate` 挪到第几个。所以它不需要知道任何一个格式的文档长什么样。
 */
export function FindReplaceBar({
  adapter,
  query,
  onQueryChange,
  replace,
  onReplaceChange,
  options,
  onOptionsChange,
  onClose,
  autoFocus = true,
  label = '查找与替换',
}: FindReplaceBarProps) {
  const [store] = useState(createFindStore)
  const { count, active } = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [localReplace, setLocalReplace] = useState('')
  const queryRef = useRef<InputRef>(null)

  const matchCase = options?.matchCase ?? false
  const wholeWord = options?.wholeWord ?? false
  const replaceText = replace ?? localReplace
  const setReplaceText = onReplaceChange ?? setLocalReplace

  useEffect(() => {
    if (adapter === null) {
      store.publish({ count: 0, active: 0 })
      return
    }
    /*
     * 查询串是**受控 prop**，所以「它变了要重扫」只能在这里做（挂载时也要）。
     * 结果不走 `setState` 而是进 store——见 `createFindStore` 的说明。
     *
     * `options` 对象每次渲染都是新的，所以按它的**两个字段**做依赖、在 effect
     * 里现构——把对象本身放进依赖数组会让这个 effect 每渲染都重跑。
     */
    const current = store.getSnapshot().active
    const searchOptions: FindOptions = { matchCase, wholeWord }
    store.publish(searchNow(adapter, query, searchOptions, current, true))

    // 文档变了要重扫（只重算，不挪高亮——见 searchNow 的说明）
    return adapter.onDocChanged?.(() => {
      const at = store.getSnapshot().active
      store.publish(searchNow(adapter, query, searchOptions, at, false))
    })
  }, [adapter, query, matchCase, wholeWord, store])

  // 高亮是**画在编辑器上**的：这条栏卸载时要自己擦掉，否则关掉查找之后
  // 那些高亮会一直留在文档里（看着像文档本身带了底色）
  useEffect(() => {
    if (adapter === null) return
    return () => adapter.clear()
  }, [adapter])

  useEffect(() => {
    if (!autoFocus) return
    // select() 会一并聚焦：打开就输入等于替换掉旧查询
    queryRef.current?.select()
  }, [autoFocus])

  const canReplaceOne = adapter?.replaceOne !== undefined
  const canReplaceAll = adapter?.replaceAll !== undefined
  const hasReplace = canReplaceOne || canReplaceAll

  /**
   * 当前查找选项。**在事件里现构**，不在渲染期存一份：`options` 是对象，
   * 每次渲染都是新的引用，存下来就得处理同步（而环境里那两个开关的值就在
   * `matchCase` / `wholeWord` 两个 prop 里，现取就够了）。
   */
  const optionsNow = (): FindOptions => ({ matchCase, wholeWord })

  const step = (delta: number) => {
    if (adapter === null || count === 0) return
    const next = (active + delta + count) % count
    store.publish(searchNow(adapter, query, optionsNow(), next, true))
  }

  const replaceCurrent = () => {
    if (adapter === null || count === 0) return
    adapter.replaceOne?.(active, replaceText)
    // 替换会改文档，所以重扫一次（不能等 onDocChanged：它是可选的）
    store.publish(searchNow(adapter, query, optionsNow(), active, true))
  }

  const replaceEvery = () => {
    if (adapter === null || count === 0) return
    adapter.replaceAll?.(replaceText)
    store.publish(searchNow(adapter, query, optionsNow(), 0, true))
  }

  const countLabel = query === '' ? '—' : count === 0 ? '无匹配' : `${active + 1} / ${count}`

  /**
   * 这几个按钮禁用时给的原因。**必须给**（DESIGN §8.4）：它们灰着的判据是
   * `count === 0`，而那有两种情形——还没输查询词、输了但没找到。不说清的
   * 话 `title` 落回按钮自己的名字，用户只能猜是哪一种。
   */
  const findReason = query === '' ? '先输入要查找的内容' : '没有匹配的内容'

  /** 查询框：回车 = 下一个（Shift+回车 = 上一个），与浏览器自带的查找一致 */
  const onQueryKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      step(event.shiftKey ? -1 : 1)
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose?.()
    }
  }

  /** 替换框：回车 = 替换这一个（不是「下一个」——那样会连替换一起跳过） */
  const onReplaceKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      replaceCurrent()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose?.()
    }
  }

  return (
    <div className="me-find" role="search" aria-label={label}>
      <div className="me-find__row">
        {/*
          这里用 antd 的 `Input` 而**不是** `ToolbarTextField`：查询框要
          `ref`（挂载时 select 已有内容）且回车要区分 Shift（上一个 / 下一个），
          而那个原语的两个入口都表达不了。属性集与它保持一致（aria-label +
          title + spellCheck），宽度走 `.me-find__query`（原语的
          `.me-input--text` 是 180px 固定宽，这一格要弹性）。
        */}
        <Input
          ref={queryRef}
          className="me-find__query"
          type="text"
          value={query}
          aria-label="查找内容"
          title="查找内容"
          placeholder="查找"
          spellCheck={false}
          /* Ctrl+F 的焦点落点（`useFindHotkey` 查这个属性，不看类名） */
          data-find-input="true"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onQueryKeyDown}
        />
        {/* aria-live：匹配数变化要念出来——它是「有没有找到」的唯一反馈 */}
        <span className="me-find__count" aria-live="polite">
          {countLabel}
        </span>
        <ToolbarButton
          label="上一个匹配"
          disabled={count === 0}
          disabledReason={findReason}
          onClick={() => step(-1)}
        >
          <ChevronLeftIcon />
        </ToolbarButton>
        <ToolbarButton
          label="下一个匹配"
          disabled={count === 0}
          disabledReason={findReason}
          onClick={() => step(1)}
        >
          <ChevronRightIcon />
        </ToolbarButton>
        {options !== undefined && onOptionsChange !== undefined && (
          <ToolbarGroup label="查找选项">
            <ToolbarButton
              label="区分大小写"
              active={matchCase}
              onClick={() => onOptionsChange({ matchCase: !matchCase, wholeWord })}
            >
              Aa
            </ToolbarButton>
            <ToolbarButton
              label="全词匹配"
              active={wholeWord}
              onClick={() => onOptionsChange({ matchCase, wholeWord: !wholeWord })}
            >
              ab
            </ToolbarButton>
          </ToolbarGroup>
        )}
        {onClose !== undefined && (
          <ToolbarButton label="关闭查找" onClick={onClose}>
            <CloseIcon />
          </ToolbarButton>
        )}
      </div>
      {hasReplace && (
        <div className="me-find__row">
          <Input
            className="me-find__query"
            type="text"
            value={replaceText}
            aria-label="替换为"
            title="替换为"
            placeholder="替换为"
            spellCheck={false}
            onChange={(event) => setReplaceText(event.target.value)}
            onKeyDown={onReplaceKeyDown}
          />
          {canReplaceOne && (
            <ToolbarButton
              label="替换这一个"
              disabled={count === 0}
              disabledReason={findReason}
              onClick={replaceCurrent}
            >
              替换
            </ToolbarButton>
          )}
          {canReplaceAll && (
            <ToolbarButton
              label="全部替换"
              disabled={count === 0}
              disabledReason={findReason}
              onClick={replaceEvery}
            >
              全部替换
            </ToolbarButton>
          )}
        </div>
      )}
    </div>
  )
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
