/**
 * 输入方式追踪：区分「鼠标点进来」与「键盘走过来」。
 *
 * ## 为什么需要它
 *
 * `docs/DESIGN.md` §7.2 要求焦点必须可见。对绝大多数控件 `:focus-visible`
 * 就够了——浏览器只在键盘导航时给它匹配。但**对文本输入类元素（`<input>`、
 * `contenteditable`）`:focus-visible` 永远匹配**，这是规范行为：文本输入需要
 * 光标与焦点提示，而浏览器无法假定用户接下来会用键盘还是鼠标。
 *
 * 于是笔记正文那个 contenteditable 每次点击都会画出一圈浏览器原生焦点环
 * （实测 `outline: auto 1px rgb(16,16,16)`，围着 680×432 的编辑区）。
 * 用户反馈「中文 focus 还有一圈阴影」——而点进正文是几乎每一次编辑都会做的事，
 * 这圈环因此成了常驻噪声。
 *
 * 两个都不能接受：直接 `outline: none` 会牺牲键盘用户的焦点可见性（§7.2，
 * 那条规范存在的理由就是它最常被设计洁癖牺牲）；保留原生环则是用户要修的问题。
 *
 * ## 做法
 *
 * 记录**最近一次输入方式**，写成一个 CSS 自定义属性：
 *
 *   html 的 `--mimir-focus-ring-style` = `none`（鼠标）或 `solid`（键盘）
 *
 * 它只存**样式关键字**，宽度与颜色由使用处的规则自己给：
 *
 * ```css
 * outline-style: var(--mimir-focus-ring-style, none);
 * outline-width: 2px;
 * outline-color: var(--ant-color-primary-border);
 * ```
 *
 * **为什么不在变量里存完整的 ring 值**（比如
 * `2px solid var(--ant-color-primary-border)`）：自定义属性里的 `var()`
 * 是在**声明它的元素**上求值的。这里声明在 `html` 上，而 `--ant-*` 注入在
 * antd 组件的 DOM 子树上（见 `AGENTS.md` 的样式第 6 条），`html` 上取不到
 * → 整个值在 computed-value 阶段无效 → `outline` 退回 `none`，
 * 键盘用户的焦点环**静默消失**（实测过）。只存关键字就没有内层引用，
 * 宽度与颜色在使用处（正文元素上，`--ant-*` 可用）解析。
 *
 * 修饰键（Shift / Ctrl / Alt / Meta）单独按下不算切换输入方式——它们总是
 * 与其他键组合，单独按下就切成键盘模式会让「按着 Shift 点鼠标」出现焦点环。
 */

/** 鼠标与键盘各自对应的 outline-style */
const RING_STYLE = { pointer: 'none', keyboard: 'solid' } as const

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta'])

/**
 * 安装全局监听。只需调用一次（在应用挂载处）。
 *
 * 用捕获阶段：某些组件会在冒泡阶段 `stopPropagation`，而输入方式是全局状态，
 * 不该被局部组件拦掉。
 */
export function installInputModalityTracking(): void {
  const root = document.documentElement

  const set = (mode: keyof typeof RING_STYLE) => {
    const next = RING_STYLE[mode]
    // 避免无谓的样式重算：值没变就不写
    if (root.style.getPropertyValue('--mimir-focus-ring-style') !== next) {
      root.style.setProperty('--mimir-focus-ring-style', next)
    }
  }

  // 初始为 pointer：刚打开页面时用户还没用键盘，不该有任何焦点环
  set('pointer')

  window.addEventListener('pointerdown', () => set('pointer'), {
    capture: true,
    passive: true,
  })

  window.addEventListener(
    'keydown',
    (event) => {
      if (MODIFIER_KEYS.has(event.key)) return
      set('keyboard')
    },
    { capture: true },
  )
}
