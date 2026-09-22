import { Empty, theme } from 'antd'
import { createGlobalStyle, createStyles } from 'antd-style'
import { act, createElement } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { BADGE_COLORS } from '../components/DocumentBadges'
import { mimirCustomToken } from './customToken'
import { MimirProvider } from './MimirProvider'
import { CONTENT_WIDTH, FONT_MONO, FONT_SANS, mimirTheme } from './tokens'

/**
 * 设计 token 的守卫测试。
 *
 * 这份规范里所有「对比度 ≥ 4.5:1」的承诺都在这里被真正计算一遍——
 * 规范写在 `docs/DESIGN.md`，但如果不测，它会在某次 antd 升级或
 * 某次「我换个颜色试试」之后静默失效。
 *
 * 改 token 导致这里红了，不要改断言，先改设计。
 */

// ── WCAG 相对亮度对比度 ──────────────────────────────────────
// token 有两种形状：不透明 hex 和 antd 派生的 rgba，两种都要能算，
// 且 rgba 必须先合成到底色上——直接拿 alpha 值算出来的数字是错的。

function parse(color: string): [number, number, number, number] {
  const value = color.trim()
  if (value.startsWith('rgb')) {
    const parts = value.match(/[\d.]+/g)?.map(Number) ?? []
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1]
  }
  const hex = value.replace('#', '')
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
    1,
  ]
}

/** 把可能带透明度的前景色合成到底色上 */
function composite(foreground: string, background: string): string {
  const [r1, g1, b1, alpha] = parse(foreground)
  const [r2, g2, b2] = parse(background)
  const mix = (front: number, back: number) => Math.round(front * alpha + back * (1 - alpha))
  return `#${[mix(r1, r2), mix(g1, g2), mix(b1, b2)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`
}

/** sRGB 通道 → 线性光。WCAG 2.x 的定义，两个分支都是常数值。 */
function linearize(channel: number): number {
  return channel <= 0.039_28 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function luminance(color: string): number {
  const [red, green, blue] = parse(color)
  return (
    0.2126 * linearize(red / 255) + 0.7152 * linearize(green / 255) + 0.0722 * linearize(blue / 255)
  )
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground)
  const second = luminance(background)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

/** 前景可能是带透明度的 token，所以要合成后再算 */
function contrastOn(foreground: string, background: string): number {
  return contrast(composite(foreground, background), background)
}

/**
 * 底色也可能是半透明的（`colorFillSecondary` 就是 rgba），同样要先合成。
 * 不合成直接算是错的——实测会得到 2.86:1 这种把黑色当底色的假结果。
 */
function contrastOver(foreground: string, translucentBackground: string, surface: string): number {
  return contrast(foreground, composite(translucentBackground, surface))
}

const token = theme.getDesignToken(mimirTheme)

/**
 * 内容出现的四种底。文字阶在每一种上都要达标——
 * 只测白底会漏掉「元信息落在导航列上」这类真实组合。
 */
const SURFACES = {
  容器底: '#ffffff',
  列表底: mimirCustomToken.tintList,
  导航底: mimirCustomToken.tintNav,
  布局底: '#f5f6f8',
} as const

describe('对比度底线', () => {
  it.each([
    ['成功', token.colorSuccessText, token.colorSuccessBg],
    ['警告', token.colorWarningText, token.colorWarningBg],
    ['错误', token.colorErrorText, token.colorErrorBg],
    ['信息', token.colorInfoText, token.colorInfoBg],
  ])('语义色对「%s」文字 on 同语义浅底 ≥ 4.5:1', (_name, foreground, background) => {
    expect(contrast(String(foreground), String(background))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(Object.entries(SURFACES))('文字-2（次要正文）在%s ≥ 4.5:1', (_surface, background) => {
    expect(contrastOn(String(token.colorTextSecondary), background)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(Object.entries(SURFACES))('文字-3（元信息）在%s ≥ 4.5:1', (_surface, background) => {
    expect(contrastOn(String(token.colorTextTertiary), background)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(Object.entries(SURFACES))('文字-1（正文）在%s ≥ 7:1（AAA）', (_surface, background) => {
    expect(contrastOn(String(token.colorText), background)).toBeGreaterThanOrEqual(7)
  })

  it.each([
    ['容器底', '#ffffff'],
    ['选中项底色', '#e8f1ff'],
    ['antd 浅蓝底', '#e6f4ff'],
  ])('链接色（文字角色）在%s ≥ 4.5:1', (_surface, background) => {
    expect(contrastOn(String(token.colorLink), background)).toBeGreaterThanOrEqual(4.5)
  })

  it('占位符允许低于 4.5，但仍要看得见（≥ 3:1）', () => {
    // 占位符 / 禁用态不承载信息，WCAG 不要求 4.5；
    // 但低到 2:1 以下就等于没画，这里守一个下限。
    expect(contrastOn(String(token.colorTextQuaternary), '#ffffff')).toBeGreaterThanOrEqual(3)
  })
})

describe('关键值真的覆盖了 antd 默认', () => {
  const fallback = theme.getDesignToken()

  it('语义色文字不用 antd 默认值', () => {
    // antd 默认那套文字色在自家浅底上只有 1.83–3.66:1，见 docs/DESIGN.md §3
    expect(token.colorSuccessText).not.toBe(fallback.colorSuccessText)
    expect(token.colorWarningText).not.toBe(fallback.colorWarningText)
    expect(token.colorErrorText).not.toBe(fallback.colorErrorText)
    expect(token.colorInfoText).not.toBe(fallback.colorInfoText)
  })

  it('文字阶被覆盖', () => {
    expect(token.colorTextTertiary).not.toBe(fallback.colorTextTertiary)
    expect(token.colorTextQuaternary).not.toBe(fallback.colorTextQuaternary)
  })

  it('品牌与形状保持既有决定', () => {
    expect(token.colorPrimary).toBe('#1677ff')
    expect(token.borderRadius).toBe(8)
    expect(token.fontSize).toBe(14)
  })
})

/**
 * 扫描组件源码，找出违反字号阶梯的行。
 *
 * 抽成模块级函数是因为有两条规则要查（字面量、多余括号），
 * 而测试文件里嵌套的辅助函数拿不到外层 describe 的局部变量
 * （第一版就踩了这个：`roots is not defined`）。
 */
async function scanFontSizeViolations(): Promise<{
  literals: string[]
  extraBraces: string[]
}> {
  const { readdir, readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')

  const literals: string[] = []
  const extraBraces: string[] = []

  async function walk(dir: string) {
    for (const entry of await readdir(join(process.cwd(), dir), { withFileTypes: true })) {
      const rel = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(rel)
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
        const text = await readFile(join(process.cwd(), rel), 'utf8')
        for (const line of text.split('\n')) {
          // 唯一的例外：图标字形的大小。阶梯管的是**可读文本**，
          // 图标的大小由它所在的容器决定。必须显式标注 `非文本` 才放行。
          if (/font-size:\s*[0-9.]+px/.test(line) && !line.includes('非文本')) {
            literals.push(`${rel}: ${line.trim()}`)
          }
          if (/FONT_SIZE\.[a-zA-Z]+\}\}px/.test(line)) {
            extraBraces.push(`${rel}: ${line.trim()}`)
          }
        }
      }
    }
  }

  for (const root of ['src/components', 'src/routes']) await walk(root)
  return { literals, extraBraces }
}

describe('字号阶梯', () => {
  /**
   * 字号是**最容易被随手改**的样式——它看起来无害。
   * 之前全仓散落过 11 个不同的 px 值（10/10.5/11/11.5/12/12.5/13/13.5/14/15/16），
   * 而同一个角色在不同页面用了不同值（元信息在文档页 12.5、列表页 11.5）。
   * 这不会报错，只会让整页看起来「不整齐」——用户说不清哪里不对，但觉得粗糙。
   */
  it('组件里没有字面的 font-size（一律走 FONT_SIZE）', async () => {
    const { literals } = await scanFontSizeViolations()
    expect(literals, `这些地方的字号没走阶梯：\n${literals.join('\n')}`).toEqual([])
  })

  /**
   * 插值括号写错也要拦。
   *
   * 这条是**补救**：我用脚本把字面量批量换成 `FONT_SIZE` 时多留了一个右花括号，
   * 写成 `${FONT_SIZE.note}}px`。CSS 模板字符串里的语法错误**不会让 typecheck
   * 报错**（它就是一段字符串），结果是 61 处样式静默失效——界面上字号退回
   * 浏览器默认的 13.3333px、颜色退回黑色。
   *
   * 发现它靠的是在浏览器里逐个量计算样式。所以现在把它写成测试。
   */
  it('FONT_SIZE 插值没有多余的括号', async () => {
    const { extraBraces } = await scanFontSizeViolations()
    expect(extraBraces, `这些插值多写了括号：\n${extraBraces.join('\n')}`).toEqual([])
  })
})

/**
 * 取出品牌标记的 path 数据，并规范化空白。
 *
 * 规范化是必需的：`z` 与 `M` 之间空格可有可无，两种写法渲染完全相同，
 * 但逐字比对会把它们当成差异。抹平这一处，其余任何不同都算真分叉。
 */
function brandPathOf(text: string): string | undefined {
  const m = text.match(/d="([^"]*M11 7\.4[^"]*)"/)
  return m?.[1]
    ?.replace(/\s+/g, ' ')
    .replace(/z(?=M)/g, 'z ')
    .replace(/\s+/g, ' ')
    .trim()
}

describe('品牌标记', () => {
  /**
   * 标记的两条实现约束，都是**踩过才知道**的：
   *
   * 1. 井口必须用 `fill-rule="evenodd"` 挖空，不能拿白色圆形盖上去。
   *    白圆在白底上看着没问题，但标记放到主色按钮或深色浮层上就会露出白点。
   * 2. 颜色必须走 `currentColor`。写死 hex 的话，主题换色时 logo 不跟着走，
   *    于是它成为全站唯一一个「不服从主题」的元素。
   */
  it('品牌标记是镂空的，且颜色跟随 currentColor', async () => {
    const { readFile } = await import('node:fs/promises')
    const src = await readFile('src/components/BrandMark.tsx', 'utf8')

    expect(src, '井口要用 evenodd 挖空，而不是白色圆形覆盖').toContain('evenodd')
    expect(src, '颜色要走 currentColor，否则主题换色时 logo 不跟随').toContain(
      'fill="currentColor"',
    )
    // 标记自己的 path 里不该出现字面色值
    expect(src, '标记内部不该出现字面色值').not.toMatch(/fill="#[0-9a-f]{3,6}"/i)
  })

  it('favicon 与组件用的是同一个形状', async () => {
    const { readFile } = await import('node:fs/promises')
    const favicon = await readFile('public/favicon.svg', 'utf8')
    const component = await readFile('src/components/BrandMark.tsx', 'utf8')

    // 取 path 的 d 属性，逐字比对——两处画不一样的形状会让品牌分叉
    const fromFavicon = brandPathOf(favicon)
    const fromComponent = brandPathOf(component)

    expect(fromFavicon).toBeDefined()
    expect(fromComponent).toBe(fromFavicon)
  })
})

describe('字体栈只有一处定义', () => {
  it('token 里的字体栈来自 tokens.ts 的常量', () => {
    // 字体栈曾经定义在 global.css、由 tokens.ts 用 var(--mimir-font-sans) 引用。
    // 改用 antd-style 后 customToken 能直接承载它，于是改成真常量：
    // 引用方拿到的是字体栈本身，不是一次变量间接。
    expect(token.fontFamily).toBe(FONT_SANS)
    expect(token.fontFamilyCode).toBe(FONT_MONO)
  })

  it('字体栈含中文兜底', () => {
    // docs/DESIGN.md §2.1：antd 默认栈到 Roboto 就结束，
    // Linux 上会一路落到 sans-serif，中文可能渲染成点阵字体
    expect(FONT_SANS).toContain('PingFang SC')
    expect(FONT_SANS).toContain('Microsoft YaHei')
    expect(FONT_SANS.endsWith('sans-serif')).toBe(true)
  })
})

describe('自定义 token 与内容区色', () => {
  it('列底色与行内代码色有值且是 hex', () => {
    expect(mimirCustomToken.tintList).toMatch(/^#[0-9a-f]{6}$/i)
    expect(mimirCustomToken.tintNav).toMatch(/^#[0-9a-f]{6}$/i)
    expect(mimirCustomToken.inlineCodeFg).toMatch(/^#[0-9a-f]{6}$/i)
    expect(mimirCustomToken.highlightBg).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('行内代码字色配 fill-secondary 底 ≥ 4.5:1', () => {
    // fill-secondary 是半透明的，要合成到内容实际所在的底上再算。
    // 白底 4.93:1、列表底 4.80:1——两种都要达标。
    for (const surface of ['#ffffff', mimirCustomToken.tintList]) {
      expect(
        contrastOver(mimirCustomToken.inlineCodeFg, String(token.colorFillSecondary), surface),
        `行内代码在 ${surface} 上对比度不足`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  /**
   * 选中态的可辨识度。
   *
   * 这条测试的**第一版是错的**：我给它加了一道 `#cfe0ff` 描边（照抄原型），
   * 然后断言「描边与选中底 ≥ 3:1」。结果 1.19:1，测试红了。
   *
   * 红得对——那条线肉眼根本看不见。但**修法不是加深描边**，而是删掉它：
   * 原型本来就没有描边，选中态靠的是「底色 + 字色 + 字重」三重线索。
   * 多加一道看不见的线只是噪声。
   *
   * 所以这条测试改成断言**真正的要求**：选中与未选中必须能区分。
   * 判据是「选中底与未选中的底不是同一个颜色」，而不是「某条装饰线够深」。
   * 这是把测试写对，不是把断言改松。
   */
  it('选中态与未选中态的底色不同（三重线索的第一重）', () => {
    const selected = String(token.colorPrimaryBg)
    const unselected = String(token.colorBgContainer)
    expect(selected).not.toBe(unselected)
    // 与白底至少能看出不同（同色相不同明度，不要求 3:1——
    // 非文本对比度要求针对的是「必须靠它才能理解内容」的图形，
    // 而这里选中的信息由底色 + 字色 + 字重共同承担）
    expect(contrast(selected, unselected)).toBeGreaterThan(1.05)
    // 真正被要求 ≥ 4.5:1 的是**选中项上的文字**，DESIGN §3.2 已算过 5.50:1
    expect(contrast(String(token.colorLink), selected)).toBeGreaterThanOrEqual(4.5)
  })

  it('整理条上的警告文字 ≥ 4.5:1', () => {
    expect(
      contrast(String(token.colorWarningText), mimirCustomToken.tintWarningSurface),
    ).toBeGreaterThanOrEqual(4.5)
    // 收集标签的胶囊底是容器白，也要一起算
    expect(
      contrast(String(token.colorWarningText), String(token.colorBgContainer)),
    ).toBeGreaterThanOrEqual(4.5)
  })
})

describe('来源徽标色对', () => {
  // docs/DESIGN.md §3.7 的表：PRD 要求「资料与笔记一眼可分」，
  // 但分得清的前提是看得清。改徽标配色时这里会拦下来。
  it.each(Object.entries(BADGE_COLORS))('徽标「%s」文字 on 自身浅底 ≥ 4.5:1', (name, color) => {
    if (!color?.fg || !color?.bg) return
    expect(contrast(color.fg, color.bg), `${name} 徽标对比度不足`).toBeGreaterThanOrEqual(4.5)
  })
})

describe('布局常量', () => {
  it('内容列只有一个宽度值', () => {
    // docs/DESIGN.md §5.4：同一条内容在列表里和详情里不该有两种宽度。
    // 页面里出现新的 maxWidth 字面量时，先问它是不是第三种「内容列」。
    expect(CONTENT_WIDTH).toBe(760)
  })
})

// ── 运行时：真的渲染一遍 ────────────────────────────────────
// 上面测的是 token 的静态值。下面把 provider 栈真的挂起来，
// 确认 cssVar 注入了变量、自定义 token 传到了 createStyles、
// 全局样式真的落在了 DOM 上——这三件事静态值都测不出来。

/** 故意用自定义 token 与嵌套选择器，覆盖迁移后新增的两条路径 */
const useProbeStyles = createStyles(({ css, token: t }) => ({
  probe: css`
    color: ${t.inlineCodeFg};
    background: ${t.tintList};

    h1 {
      font-size: 28px;
    }
  `,
}))

const ProbeGlobal = createGlobalStyle`
  .probe-global { color: ${(p) => p.theme.inlineCodeFg}; }
`

function Probe() {
  const { styles } = useProbeStyles()
  return createElement(
    'div',
    { className: styles.probe },
    createElement(ProbeGlobal),
    createElement('h1', null, '标题'),
  )
}

/** 挂载真实的 provider 栈，返回 DOM、注入的 CSS 文本与卸载函数 */
async function renderApp(child: ReactElement = createElement(Probe)) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const globalWithAct = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  globalWithAct.IS_REACT_ACT_ENVIRONMENT = true

  await act(async () => {
    root.render(createElement(MimirProvider, null, child))
  })

  const css = [...document.querySelectorAll('style')]
    .map((style) => style.textContent ?? '')
    .join('\n')

  return {
    host,
    css,
    unmount: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}

describe('cssVar 运行时确实注入了变量', () => {
  it('--ant-* 变量带着 mimir 的覆盖值出现', async () => {
    const { host, css, unmount } = await renderApp()

    // 这些变量是内容排版与列底色的依赖：它们必须真的存在
    expect(css).toMatch(/--ant-color-text-tertiary:\s*#68707c/i)
    expect(css).toMatch(/--ant-color-success-text:\s*#137333/i)
    expect(css).toMatch(/--ant-font-family:/i)

    // cssVar 的作用域挂在 antd 组件子树上，plain div 拿不到——
    // 所以引用 --ant-* 的元素必须在 antd 组件内部
    const app = host.querySelector('.ant-app')
    expect(app?.className).toContain('mimir')

    await unmount()
  })

  it('自定义 token 能传进 createStyles 并被真的用上', async () => {
    const { css, unmount } = await renderApp()

    // 探针样式里用了 inlineCodeFg 与 tintList，两者都应落到生成的 CSS 里
    expect(css).toContain(mimirCustomToken.inlineCodeFg)
    expect(css).toContain(mimirCustomToken.tintList)

    await unmount()
  })

  it('createStyles 的嵌套选择器按预期展开', async () => {
    const { css, unmount } = await renderApp()

    // 探针里写了 `h1 { font-size: 28px }`——内容区排版依赖这个能力
    expect(css).toMatch(/h1\s*\{[^}]*font-size:\s*28px/i)

    await unmount()
  })

  it('createGlobalStyle 把全局规则真的插进了 DOM', async () => {
    const { css, unmount } = await renderApp()

    // 重置与高度链是全局样式，前缀来自主题（antd 换前缀时跟着换）
    expect(css).toContain('.probe-global')
    expect(css).toMatch(/box-sizing:\s*border-box/i)
    expect(css).toMatch(/#root\s*>\s*\.ant-app\s*\{[^}]*height:\s*100%/i)

    await unmount()
  })

  it('动效退化规则在全局样式里', async () => {
    const { css, unmount } = await renderApp()

    // docs/DESIGN.md §6：前庭功能敏感的用户，这不是可选项
    expect(css).toMatch(/prefers-reduced-motion/)
    expect(css).toMatch(/transition-duration:\s*0\.01ms/)

    await unmount()
  })

  it('嵌套 ConfigProvider 不会把 cssVar 的 key 改掉', async () => {
    // MimirProvider 里 ConfigProvider 只传 locale、不传 theme。
    // 如果哪天有人补上 theme，antd 会重算 cssVar key，--ant-* 变量名就变了，
    // 所有引用变量的地方会静默失效——所以在这里守一条。
    const { host, css, unmount } = await renderApp()

    expect(css).toMatch(/--ant-color-text-tertiary:\s*#68707c/i)
    expect(host.querySelector('.ant-app')?.className).toContain('mimir')

    await unmount()
  })
})

describe('主题真的接通了', () => {
  it('mimir 的覆盖值是通过 provider 栈生效的，不是碰巧同值', async () => {
    // provider 栈少一层（比如忘了 ThemeProvider）时变量就不会带着我们的覆盖值出现。
    // 断言覆盖值 + 变量类名两件事，才能区分「接通了」和「antd 默认恰好也是这个色」。
    const { host, css, unmount } = await renderApp()

    expect(css).toContain('--ant-color-primary:#1677ff')
    expect(css).toContain('--ant-color-link:#0958d9')
    expect(css).toContain('--ant-border-radius:8px')
    expect(host.querySelector('.ant-app')?.className).toContain('mimir')

    await unmount()
  })

  it('locale 仍然是中文', async () => {
    // MimirProvider 里 ConfigProvider 只负责 locale。重构 provider 时
    // 很容易把它连着 theme 一起搬走，表现是组件文案静默变回英文。
    // Empty 不给 description 时会渲染 locale 里的默认文案，用它当探针。
    const { host, unmount } = await renderApp(createElement(Empty))

    expect(host.textContent).toContain('暂无数据')

    await unmount()
  })
})
