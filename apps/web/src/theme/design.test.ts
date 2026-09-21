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
