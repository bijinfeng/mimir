#!/usr/bin/env node
/**
 * 从 vendored 的 `styles.css` 裁出**编辑器真正需要**的那部分。
 *
 * ## 为什么必须裁
 *
 * 上游那份 264 KB / 1374 条规则是**整个办公应用**的样式表：ribbon 工具栏
 * 170+ 条、AI 侧栏、打印对话框、文件列表页、`body` 与 `:root` 上的全局
 * 变量。直接引进来有两个真问题：
 *
 *  1. **污染 mimir 自己的样式**：`:root` 上的 `--accent` / `--word-blue`
 *     这类变量名会与宿主页面互相覆盖，`body` 上的规则会改全局排版
 *  2. 绝大多数规则用不上（mimir 没有 ribbon、没有 AI 侧栏）
 *
 * ## 裁的判据
 *
 * 保留**编辑器与纸张排版**的规则，即选择器命中下列前缀之一：
 *   `.doc-*`        文档模型渲染出的元素（页、段、表、列表、批注、修订…）
 *   `.ProseMirror*` 编辑器容器
 *   `.page-*`       纸张与分页
 *   `.hf-*`         页眉页脚
 *
 * 顺带把 `:root { --docs-* }` 里的自定义属性**原样保留但加前缀**——
 * 编辑器的规则要读它们，而直接叫 `--accent` 会和 mimir 的 token 撞名。
 * 全局选择器（`body`、`html`）与办公壳前缀（`.ribbon`、`.ai-`…）一律丢弃。
 *
 * ## 产物
 *
 * `src/generated/editor.css`（**生成物，进 .gitignore，由 sync 一并产出**）。
 * 不要手改它——改判据要改这个脚本。
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = join(here, '..')
const SRC = join(pkgRoot, 'vendor/apps/docs/src/renderer/styles.css')
const OUT = join(pkgRoot, 'src/generated/editor.css')

/** 保留的选择器前缀。加前缀前先问：这个元素是编辑器渲染出来的吗？ */
const KEEP_PREFIXES = ['.doc-', '.doc_', '.ProseMirror', '.page-', '.hf-', '.rb-']

/** 这些选择器**看起来**像编辑器，其实是壳：显式排除（各自写明原因） */
const DROP_PREFIXES = [
  '.rb-font-size-menu', // ribbon 的字号下拉
  '.rb-font-family-menu', // ribbon 的字体下拉
  '.rb-split-wrap', // ribbon 的分裂按钮
]

/**
 * 极简 CSS 分块器：按 `{}` 配对切开顶层规则，保留注释。
 * 不做完整 CSS 解析——样式表是我们自己 vendored 的、形状已知，
 * 而引一个 PostCSS 只为切块不划算。
 */
function splitRules(css) {
  const out = []
  let depth = 0
  let start = 0
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        out.push(css.slice(start, i + 1))
        start = i + 1
      }
    }
  }
  const tail = css.slice(start)
  if (tail.trim()) out.push(tail)
  return out
}

/**
 * 取规则的选择器。
 *
 * **必须剥掉前置注释**：上游大量写成
 * ```css
 * /* 说明这段干什么 *\/
 * :root { … }
 * ```
 * 不剥的话 `startsWith(':root')` 判 false，整块变量被丢掉——症状是
 * 「分页算得好好的，但纸上什么都看不见」（`--canvas` 没了，灰带透明）。
 * 实测踩过。
 */
function selectorOf(rule) {
  const brace = rule.indexOf('{')
  if (brace === -1) return null
  const head = rule.slice(0, brace).replace(/\/\*[\s\S]*?\*\//g, '')
  return head.trim()
}

/**
 * 取规则的**声明体**（第一个 `{` 与最后一个 `}` 之间）。
 *
 * `:root` 变量块的判据必须看这里而不是选择器：选择器就叫 `:root`，
 * 里面有没有 `--docs-*` 变量在它上面看不出来。第一版写成
 * `.test(selector)` 于是**所有变量块都被静默丢掉**——症状不是报错，
 * 而是 `--docs-paper-ink` 这类变量全程解析成空值：页眉页脚虚线不画、
 * 图表标签在深色下是黑压深底（实测见 D-096）。
 */
function bodyOf(rule) {
  const brace = rule.indexOf('{')
  const last = rule.lastIndexOf('}')
  return brace === -1 || last <= brace ? '' : rule.slice(brace + 1, last)
}

/** 与变量块相关的名字：编辑器规则读它们，所以定义块要一起留下 */
const VAR_NAME = /--(docs|word|doc|page|cell|hf)-|--canvas\b/

function keep(rule) {
  const selector = selectorOf(rule)
  if (selector === null) return false
  const first = selector.split(',')[0].trim()

  if (DROP_PREFIXES.some((p) => first.startsWith(p))) return false

  /**
   * 媒体查询：**递归过滤内部规则**，而不是整块收或整块丢。
   *
   * 这一条是 D-096 修的第二个静默洞：深色纸张机制（`.page-dark` 的变量块
   * 与 `--dk-*` 孪生的消费规则）整个包在 `@media screen { … }` 里，而
   * `selectorOf` 给出的选择器是 `@media screen`——它不以任何保留前缀开头，
   * 于是那 5.6KB 规则被整块丢掉。症状是**深色下作者显式写的文字颜色
   * 不被重映射**（显式黑字落在深色纸上，实测不可见），而整套 `--dk-*`
   * 孪生值照常由编辑器代码发出、只是没人消费。
   *
   * `prefers-color-scheme` 的暗色块**显式丢弃**：那是 vendor 应用按
   * **系统偏好**切自己的壳，而 mimir 的外观是用户设置（与系统偏好可以
   * 不一致）。深色的纸张由宿主加 `.page-dark` 类驱动——见
   * `apps/web/src/components/document/OfficeSourceEditor.tsx`。
   */
  if (first.startsWith('@media')) {
    if (first.includes('prefers-color-scheme')) return false
    return splitRules(bodyOf(rule)).some(keep)
  }

  /**
   * 变量块：只留编辑器自用的前缀。
   *
   * 判据看**声明体**（见 `bodyOf` 的说明）。`--canvas` 必须一起留——它是
   * **页间隙灰带的底色**（`.page-gap::before` 的 `background`）。漏了它的
   * 症状是：分页功能完全正常（页数对、间隙高度对），但**纸上什么都看不见**
   * ——因为灰带画成了透明。实测踩过。
   */
  if (first.startsWith(':root')) {
    return VAR_NAME.test(bodyOf(rule))
  }
  /**
   * 只含变量的主题覆写块（`.workspace-dark`）保留：判据是「块里只有自定义
   * 属性，没有实际声明」——纯变量容器值得留，带任何真实声明的丢弃。
   */
  if (/^\.workspace-dark\b/.test(first)) {
    const declarations = bodyOf(rule)
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
    return declarations.length > 0 && declarations.every((d) => d.startsWith('--'))
  }
  /**
   * `.page-dark` 作用域下的规则整组保留（变量块与 `--dk-*` 孪生的消费规则
   * 都以此前缀开头）。它们是纸张的深色机制，不在 KEEP_PREFIXES 的
   * 「元素类名」判断里，但同属编辑器渲染层。
   *
   * **要连 `:where(.page-dark)` 一起匹配**：消费规则写的是
   * `:where(.page-dark) [style*='--dk-c:']…`（` :where()` 压低特异性
   * 让后来的纸张规则能盖过它），选择器**以 `:where(` 开头**。
   * 只判 `.page-dark` 前缀会把它们全丢——而那正是「显式颜色在深色下
   * 不被重映射」的直接原因（实测踩过）。
   */
  if (first.startsWith('.page-dark') || first.includes('.page-dark')) return true

  // 全局元素选择器一律丢弃（会改 mimir 的整页排版）
  if (/^(html|body|\*)/.test(first)) return false

  return KEEP_PREFIXES.some((p) => first.startsWith(p))
}

/**
 * 变量重命名：编辑器规则里读的 `var(--docs-x)` 保持不动（我们连变量块一起
 * 保留了），但 `var(--accent)` 这类**通用名**来自被丢弃的 `:root`，
 * 会解析成空值。把它们映射到带前缀的等价量，避免「样式静默失效」。
 */
const VAR_FIX = [
  [/var\(--accent-soft\)/g, 'var(--docs-accent-soft, #e8f1fb)'],
  [/var\(--accent-dark\)/g, 'var(--docs-accent-dark, #124a9e)'],
  [/var\(--accent\)/g, 'var(--docs-accent, #185abd)'],
  [/var\(--word-blue-dark\)/g, 'var(--docs-word-blue-dark, #124a9e)'],
  [/var\(--word-blue\)/g, 'var(--docs-word-blue, #185abd)'],
  [/var\(--word-heading\)/g, 'var(--docs-word-heading, #2f5496)'],
]

/**
 * 媒体查询块的重建：保留外壳（`@media … {` … `}`），内部只放通过 `keep`
 * 的规则。`keep` 对媒体块的判断是「内部**有**可留的规则」，而真正写出时
 * 要的是「只有可留的规则」——两件事分开做（前者用于统计与断言，
 * 后者用于产物）。
 */
function filterMedia(rule) {
  const brace = rule.indexOf('{')
  const inner = splitRules(rule.slice(brace + 1, rule.lastIndexOf('}'))).filter(keep)
  if (inner.length === 0) return null
  return `${rule.slice(0, brace + 1)}\n${inner.join('\n')}\n}`
}

async function main() {
  const css = await readFile(SRC, 'utf8')
  const rules = splitRules(css)
  const kept = []
  for (const rule of rules) {
    if (!keep(rule)) continue
    const first = selectorOf(rule).split(',')[0].trim()
    let out = first.startsWith('@media') ? filterMedia(rule) : rule
    if (out === null) continue
    for (const [pattern, replacement] of VAR_FIX) out = out.replace(pattern, replacement)
    kept.push(out)
  }

  /**
   * 自检：这几样东西一旦被裁掉，症状都是**静默**的（界面不报错，只是颜色
   * 或虚线没了）。放在生成脚本里而不是测试里：产物进 .gitignore，
   * 而每次生成都会跑这一遍——构建时就红，比事后翻界面快。
   */
  const output = kept.join('\n')
  const REQUIRED = [
    ['.page-dark', '深色纸张机制（--dk-* 孪生的消费规则）'],
    ['--docs-paper-ink', '纸张墨色变量'],
    ['--canvas', '页间隙灰带底色'],
  ]
  for (const [needle, why] of REQUIRED) {
    if (!output.includes(needle)) {
      throw new Error(
        `裁剪产物缺少「${why}」（找 ${needle}）——判据又把它丢了。` +
          `症状是静默的：界面不报错，只是这一类元素颜色/虚线不画。`,
      )
    }
  }

  const header = [
    '/* 生成物，不要手改 —— 由 packages/office/scripts/trim-editor-css.mjs 从',
    ' * vendor/apps/docs/src/renderer/styles.css 裁出。改判据请改那个脚本。',
    ` *${' '}保留了 ${kept.length}/${rules.length} 条顶层规则（只留编辑器与纸张排版）。`,
    ' */',
    '',
  ].join('\n')

  await (await import('node:fs/promises')).mkdir(dirname(OUT), { recursive: true })
  await (await import('node:fs/promises')).writeFile(OUT, header + kept.join('\n') + '\n')

  const bytes = (header + kept.join('\n')).length
  console.log(`裁剪样式：${rules.length} → ${kept.length} 条规则，${Math.round(bytes / 1024)} KB`)
  console.log(`输出 ${OUT.replace(pkgRoot + '/', '')}`)
}

await main()
