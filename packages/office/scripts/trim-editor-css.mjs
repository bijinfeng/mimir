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

function keep(rule) {
  const selector = selectorOf(rule)
  if (selector === null) return false
  const first = selector.split(',')[0].trim()

  if (DROP_PREFIXES.some((p) => first.startsWith(p))) return false

  /**
   * 变量块：只留编辑器自用的前缀。
   *
   * `--canvas` 必须一起留——它是**页间隙灰带的底色**（`.page-gap::before`
   * 的 `background`）。漏了它的症状是：分页功能完全正常（页数对、间隙高度对），
   * 但**纸上什么都看不见**——因为灰带画成了透明。实测踩过。
   */
  if (first.startsWith(':root')) {
    return /--(docs|word|doc|page|cell|hf)-|--canvas\b/.test(selector)
  }
  /**
   * 只含变量的主题覆写块（`.workspace-dark`、`.page-dark`）也保留：
   * 它们定义深色下的 `--canvas` / `--docs-paper`，而编辑器规则读这些变量。
   * 判据是「块里只有自定义属性，没有实际声明」——纯变量容器值得留，
   * 带任何真实声明的（那是壳的样式）丢弃。
   */
  if (/^\.(workspace-dark|page-dark)\b/.test(first)) {
    const body = rule.slice(rule.indexOf('{') + 1)
    const declarations = body
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
    return declarations.length > 0 && declarations.every((d) => d.startsWith('--'))
  }
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

async function main() {
  const css = await readFile(SRC, 'utf8')
  const rules = splitRules(css)
  const kept = rules.filter(keep).map((rule) => {
    let out = rule
    for (const [pattern, replacement] of VAR_FIX) out = out.replace(pattern, replacement)
    return out
  })

  const header = [
    '/* 生成物，不要手改 —— 由 packages/office/scripts/trim-editor-css.mjs 从',
    ' * vendor/apps/docs/src/renderer/styles.css 裁出。改判据请改那个脚本。',
    ` *${' '}保留了 ${kept.length}/${rules.length} 条规则（只留编辑器与纸张排版）。`,
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
