import type { ReactNode } from 'react'
import { Children, isValidElement, useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useCodeBlockStyles } from './CodeBlock.style.js'

/**
 * 代码块的两段式：**上面一条头（语言名 + 复制），下面 pre**。
 *
 * ## 它怎么挂进 Markdown 渲染
 *
 * `@tanstack/markdown` 的 `components` 表按 **HTML 标签名**索引
 * （它内部是 `options.components?.[tag] ?? tag`），所以「替换 pre」
 * 是它支持的那条路——`MarkdownPart` 把 `pre: CodeBlock` 交给它，
 * 代码块渲染出来时这个组件就收到 `data-lang` 与那个 `code` 子元素。
 *
 * 试过但走不通的两条：按 `pre > code` 的 DOM 结构去反查语言名（拿不到），
 * 以及给 markdown 加一个自定义 block 渲染器（那要动解析层，而解析层是
 * 上游负责的）。
 *
 * ## 为什么这一条是从 assistant-ui 借来的
 *
 * mimir 之前的代码块只有 `pre`（样式覆写在面板的 `thread` 里），
 * 于是两个具体的问题：
 *
 *  - **没有一键复制**。回答里的命令要选中、右键、复制——中文正文里
 *    选中一段等宽文本比看起来难
 *  - **语言名不显示**。`data-lang` 只是个属性，没有任何视觉表达
 *
 * 复制按钮的图标交换用 200ms 的曲线（DESIGN §7），与发送/停止那一对同源。
 */
export function CodeBlock({
  children,
  className,
  ...rest
}: {
  children?: ReactNode
  className?: string
  'data-lang'?: string
}) {
  const { styles } = useCodeBlockStyles()
  const lang = rest['data-lang'] ?? ''
  const text = plainTextOf(children)

  /**
   * 取不到纯文本（上游换了渲染形状、或有人挂了高亮器让 code 的 children
   * 变成 HTML 元素）时**退化成普通的 pre**：头里那个按钮复制不了东西，
   * 比没有更糟——点一下没反应、也不报错。
   */
  if (text === null) {
    return (
      <pre className={className} {...rest}>
        {children}
      </pre>
    )
  }

  return (
    /* 两个属性都要：`data-code-frame` 是**跨文件的选择器钩子**（面板那边的
       `[data-role='assistant'] pre` 与这里的规则都按它匹配），样式类负责
       这组自己的观感。只有类名的话那两条覆盖选择器就找不着它了 */
    <div data-code-frame className={styles.frame}>
      <CodeBar lang={lang} text={text} />
      <pre className={className} {...rest}>
        {children}
      </pre>
    </div>
  )
}

/**
 * `pre > code` 的 children 里那串源码。
 *
 * 上游在不挂高亮器时把源码作为**字符串**放进 `code` 的 children；
 * 挂了高亮器则放 `dangerouslySetInnerHTML`（那种情况下这里返回 null，
 * 走退化分支）。多一层 Fragment 也认——渲染器在 `node.title` 存在时会
 * 把 pre 包进 figure，children 的形状不变。
 */
function plainTextOf(children: ReactNode): string | null {
  for (const child of Children.toArray(children)) {
    if (typeof child === 'string') return child
    if (isValidElement<{ children?: ReactNode }>(child)) {
      const inner = child.props.children
      if (typeof inner === 'string') return inner
      if (Array.isArray(inner) && inner.every((item) => typeof item === 'string')) {
        return inner.join('')
      }
    }
  }
  return null
}

/** 头：语言名 + 复制。单独一个小部件，复制状态与定时器归它自己 */
function CodeBar({ lang, text }: { lang: string; text: string }) {
  const { styles } = useCodeBlockStyles()
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)

  /* 复制状态 2 秒后自己回去。定时器在卸载时清掉——否则切走会话之后
     还会去 setState（React 会警告，而且那是真的泄漏） */
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  return (
    <div className={styles.bar}>
      <span className={styles.lang}>{lang || '文本'}</span>
      {failed && <span role="status">复制失败，请重试</span>}
      <button
        type="button"
        className={styles.copy}
        data-copied={copied || undefined}
        onClick={copy}
        aria-label={copied ? '已复制' : '复制代码'}
      >
        {/* 两个图标叠在同一格（位置靠 CSS 的负 margin 对齐），
            用 opacity + scale 交换 */}
        <Copy size={12} />
        <Check size={12} />
      </button>
    </div>
  )
}
