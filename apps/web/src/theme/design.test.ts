import { App, ConfigProvider, theme } from 'antd'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { BADGE_COLORS } from '../components/DocumentBadges'
import { CONTENT_WIDTH, mimirTheme } from './tokens'

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

const token = theme.getDesignToken(mimirTheme)

/**
 * 内容出现的四种底。文字阶在每一种上都要达标——
 * 只测白底会漏掉「元信息落在导航列上」这类真实组合。
 */
const SURFACES = {
  容器底: '#ffffff',
  列表底: '#fcfcfd',
  导航底: '#fbfbfc',
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

  it('字体栈只有一处定义（global.css），token 引用它', () => {
    // 防止有人在这里再写一份字体栈，变成两处真相
    expect(token.fontFamily).toBe('var(--mimir-font-sans)')
    expect(token.fontFamilyCode).toBe('var(--mimir-font-mono)')
  })
})

describe('来源徽标色对', () => {
  // docs/DESIGN.md §3.7 的表：PRD 要求「资料与笔记一眼可分」，
  // 但分得清的前提是看得清。改徽标配色时这里会拦下来。
  it.each(Object.entries(BADGE_COLORS))('徽标「%s」文字 on 自身浅底 ≥ 4.5:1', (name, color) => {
    if (!color?.fg || !color.bg) return
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

describe('cssVar 运行时确实注入了变量', () => {
  it('--ant-* 变量带着 mimir 的覆盖值出现', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const globalWithAct = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    globalWithAct.IS_REACT_ACT_ENVIRONMENT = true

    await act(async () => {
      root.render(
        createElement(
          ConfigProvider,
          { theme: mimirTheme },
          createElement(App, null, createElement('div', { className: 'note-body' }, '正文')),
        ),
      )
    })

    const css = [...document.querySelectorAll('style')]
      .map((style) => style.textContent ?? '')
      .join('\n')

    // 这些变量是 global.css 与内容排版的依赖：它们必须真的存在
    expect(css).toMatch(/--ant-color-text-tertiary:\s*#68707c/i)
    expect(css).toMatch(/--ant-color-success-text:\s*#137333/i)
    expect(css).toMatch(/--ant-mimir-font|--ant-font-family:/i)

    // cssVar 的作用域挂在 antd 组件子树上，plain div 拿不到——
    // 所以 global.css 里引用 --ant-* 的元素必须在 antd 组件内部
    const app = host.querySelector('.ant-app')
    expect(app?.className).toContain('mimir')

    await act(async () => root.unmount())
    host.remove()
  })
})
