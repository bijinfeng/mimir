import { theme } from 'antd'
import { createGlobalStyle, createStyles } from 'antd-style'
import { act, createElement } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { BADGE_COLORS } from '../components/DocumentBadges'
import { setThemeMode } from './appearance'
import type { Appearance } from './appearance'
import { mimirCustomToken, mimirDarkCustomToken, customTokenFor } from './customToken'
import { MimirProvider } from './MimirProvider'
import {
  algorithmFor,
  CONTENT_WIDTH,
  FONT_MONO,
  FONT_SANS,
  effectiveTokens,
  mimirDarkTheme,
  NAV_NARROW_BREAKPOINT,
  NAV_NARROW_QUERY,
  themeConfigFor,
} from './tokens'

/**
 * 设计 token 的守卫测试。
 *
 * 这份规范里所有「对比度 ≥ 4.5:1」的承诺都在这里被真正计算一遍——
 * 规范写在 `docs/DESIGN.md`，但如果不测，它会在某次 antd 升级或
 * 某次「我换个颜色试试」之后静默失效。
 *
 * 改 token 导致这里红了，不要改断言，先改设计。
 *
 * ## 两套外观跑同一组断言
 *
 * 深色不是「附加项」，它和浅色受**同一组阈值**约束。这里没有
 * 「深色稍差一点也可以」的分支——那种分支一旦存在，深色就会在几次
 * 迭代后变成「看起来还行」而不是「测得过的」。所以断言全部走
 * `it.each(APPEARANCES)`，新增一条浅色规则就等于同时约束深色。
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

const APPEARANCES: readonly Appearance[] = ['light', 'dark']

const NAMES: Record<Appearance, string> = { light: '浅色', dark: '深色' }

/**
 * 热力色阶的四档。
 *
 * 提到模块级是 lint 的要求（`unicorn/consistent-function-scoping`）：
 * 它不捕获任何外层变量，写在 `describe` 里只会每次调用重建一个函数。
 */
function scaleOf(appearance: Appearance): string[] {
  const custom = customTokenFor(appearance)
  return [custom.heatL1, custom.heatL2, custom.heatL3, custom.heatL4]
}

/**
 * 每套外观的生效 token。
 *
 * 走 `effectiveTokens` 而不是在这里写 `getDesignToken(mimirDarkTheme)`：
 * 后者会漏掉 `darkAlgorithm`（它由 antd-style 在运行时补），算出来的
 * 是一份**不存在于任何界面上的** token 集——那种错误不报错，只会让
 * 守门测试守着一个假的界面。
 *
 * `lightToken` 是**浅色的**生效 token，供少量「深色必须比浅色更亮/更暗」
 * 这类跨外观断言使用。
 */
const lightToken = effectiveTokens('light')
const darkToken = effectiveTokens('dark')

function tokenOf(appearance: Appearance) {
  return appearance === 'light' ? lightToken : darkToken
}

/**
 * 内容出现的底。文字阶在每一种上都要达标——
 * 只测容器底会漏掉「元信息落在导航列上」这类真实组合。
 */
function surfacesOf(appearance: Appearance): Record<string, string> {
  const token = tokenOf(appearance)
  const custom = customTokenFor(appearance)
  return {
    容器底: String(token.colorBgContainer),
    列表底: custom.tintList,
    导航底: custom.tintNav,
    布局底: String(token.colorBgLayout),
  }
}

describe('对比度底线', () => {
  it.each(APPEARANCES)('语义色对「文字 on 同语义底」%s下 ≥ 4.5:1', (appearance) => {
    const token = tokenOf(appearance)
    const pairs = [
      ['成功', token.colorSuccessText, token.colorSuccessBg],
      ['警告', token.colorWarningText, token.colorWarningBg],
      ['错误', token.colorErrorText, token.colorErrorBg],
      ['信息', token.colorInfoText, token.colorInfoBg],
    ] as const

    for (const [name, foreground, background] of pairs) {
      expect(
        contrast(String(foreground), String(background)),
        `${NAMES[appearance]}：${name}色对不达标`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(APPEARANCES)('语义文字落在容器底上 %s下 ≥ 4.5:1', (appearance) => {
    // 徽标与状态文字经常直接躺在面板里（不总是躺在自己的浅底上），
    // 所以「文字 on 自己的底」达标还不够
    const token = tokenOf(appearance)
    const container = String(token.colorBgContainer)
    for (const key of ['colorSuccessText', 'colorWarningText', 'colorErrorText', 'colorInfoText']) {
      expect(
        contrastOn(String(token[key as keyof typeof token]), container),
        `${NAMES[appearance]}：${key} 在容器底上不达标`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(APPEARANCES)('文字-2 / 文字-3 在四种底上 %s下 ≥ 4.5:1', (appearance) => {
    const token = tokenOf(appearance)
    for (const [surface, background] of Object.entries(surfacesOf(appearance))) {
      expect(
        contrastOn(String(token.colorTextSecondary), background),
        `${NAMES[appearance]}：文字-2 在${surface}上不达标`,
      ).toBeGreaterThanOrEqual(4.5)
      expect(
        contrastOn(String(token.colorTextTertiary), background),
        `${NAMES[appearance]}：文字-3 在${surface}上不达标`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(APPEARANCES)('文字-1（正文）在四种底上 %s下 ≥ 7:1（AAA）', (appearance) => {
    const token = tokenOf(appearance)
    for (const [surface, background] of Object.entries(surfacesOf(appearance))) {
      expect(
        contrastOn(String(token.colorText), background),
        `${NAMES[appearance]}：正文在${surface}上不达 AAA`,
      ).toBeGreaterThanOrEqual(7)
    }
  })

  it.each(APPEARANCES)('链接色（文字角色）在容器底与选中底上 %s下 ≥ 4.5:1', (appearance) => {
    const token = tokenOf(appearance)
    expect(
      contrastOn(String(token.colorLink), String(token.colorBgContainer)),
      `${NAMES[appearance]}：链接色在容器底上不达标`,
    ).toBeGreaterThanOrEqual(4.5)
    // 选中态导航项就是「链接色 on colorPrimaryBg」——最常见的那个组合
    expect(
      contrastOn(String(token.colorLink), String(token.colorPrimaryBg)),
      `${NAMES[appearance]}：链接色在选中底上不达标`,
    ).toBeGreaterThanOrEqual(4.5)
  })

  /**
   * 悬停与按下的链接色。
   *
   * **这一条是补的洞**：第一版只校准了 `colorLink` 的最终值，hover / active
   * 交给算法派生——深色下得到 `#15417e`（容器底 **1.80:1**）与 `#1554ad`
   * （2.51:1），比常态的 8.74:1 弱五倍：鼠标一放上去链接就像被禁用了
   * （实测发现，D-096）。浅色的 hover 也只有 2.80:1。
   *
   * 两个键都显式写进了主题（它们不是种子名，`formatToken` 不删），
   * 这里守生效值：**比常态不能更弱**，且仍达 AA。
   */
  it.each(APPEARANCES)('悬停/按下的链接色 %s下也达 4.5:1（且不弱于常态）', (appearance) => {
    const token = tokenOf(appearance)
    const surfaces = [String(token.colorBgContainer), String(token.colorPrimaryBg)]
    const base = contrastOn(String(token.colorLink), String(token.colorBgContainer))
    for (const [name, value] of [
      ['colorLinkHover', token.colorLinkHover],
      ['colorLinkActive', token.colorLinkActive],
    ] as const) {
      for (const surface of surfaces) {
        const ratio = contrastOn(String(value), surface)
        expect(
          ratio,
          `${NAMES[appearance]}：${name} 在 ${surface} 上不达 4.5:1（实测 ${ratio.toFixed(2)}）`,
        ).toBeGreaterThanOrEqual(4.5)
      }
      // 「悬停比常态更弱」正是修掉的那个 bug，这里守它不再回来
      expect(
        contrastOn(String(value), String(token.colorBgContainer)),
        `${NAMES[appearance]}：${name} 比常态链接色更弱`,
      ).toBeGreaterThanOrEqual(base * 0.8)
    }
  })

  it.each(APPEARANCES)('占位符允许低于 4.5，但仍要看得见（%s下 ≥ 3:1）', (appearance) => {
    // 占位符 / 禁用态不承载信息，WCAG 不要求 4.5；
    // 但低到 2:1 以下就等于没画，这里守一个下限。
    const token = tokenOf(appearance)
    expect(
      contrastOn(String(token.colorTextQuaternary), String(token.colorBgContainer)),
    ).toBeGreaterThanOrEqual(3)
  })

  it.each(APPEARANCES)('主按钮上的白字 %s下不低于浅色的既有基线', (appearance) => {
    /**
     * 4.10:1 是**浅色既有的、已被记录的取值**（DESIGN §3.5 那行
     * 「白字 on 主色填充 4.10:1」），它按「大字号/非文本」那一档被接受。
     *
     * 这里不把门槛提到 4.5——那等于顺手改掉一个已评审过的决定，而深色
     * 并不需要它。要守的是**不回归**：深色不得低于这个基线（实测 5.19）。
     */
    const token = tokenOf(appearance)
    const value = contrast('#ffffff', String(token.colorPrimary))
    expect(value, `${NAMES[appearance]}：主按钮白字的对比度低于既有基线`).toBeGreaterThanOrEqual(
      contrast('#ffffff', '#1677ff'),
    )
  })
})

describe('非文本对比度：焦点环与描边', () => {
  /**
   * 焦点环是「键盘用户能不能看见自己在哪」的线索（DESIGN §7.2），
   * 所以它按**非文本**标准衡量。
   *
   * ## 为什么这里用「不得弱于浅色」而不是绝对的 3:1
   *
   * antd 画的焦点环是 `3px solid colorPrimaryBorder`（它的 `genFocusOutline`），
   * 而浅色的 `colorPrimaryBorder` 是 antd 派生的 `#91caff`——它在白底上
   * 只有 **1.74:1**。这是既有的、规范里认过的基线（§7.2 只要求「焦点可见」，
   * 没有承诺非文本的 3:1）。
   *
   * 临时把门槛提到 3:1 会让浅色也红，而修法只能是顺手改掉一个已评审的
   * 决定——那超出了这次改动的范围。所以守**不回归**：深色不得弱于浅色，
   * 同时两套外观下环都必须与底**可分辨**（>1.5，防「环与底同值」这种
   * 彻底看不见的情况）。
   *
   * 深色确实踩过那个坑：antd 的深色算法把 `colorPrimaryBg` 与
   * `colorPrimaryBorder` 设成**同一个值**（`#15325b`），同值意味着焦点环
   * 落在选中项上完全看不见（实测 1.00:1）。深色因此单独校准了描边这一半。
   */
  const LIGHT_RING_ON_CONTAINER = contrast('#91caff', '#ffffff')
  const LIGHT_RING_ON_PRIMARY_BG = contrast('#91caff', '#e6f4ff')

  it.each(APPEARANCES)('焦点环与它所在的底可分辨 %s下', (appearance) => {
    const token = tokenOf(appearance)
    const ring = String(token.colorPrimaryBorder)
    for (const [surface, background] of Object.entries({
      容器底: String(token.colorBgContainer),
      浮层底: String(token.colorBgElevated),
      选中底: String(token.colorPrimaryBg),
    })) {
      expect(
        contrast(ring, background),
        `${NAMES[appearance]}：焦点环在${surface}上几乎看不见`,
      ).toBeGreaterThan(1.5)
    }
  })

  it('深色的焦点环不比浅色弱', () => {
    /**
     * 跨外观的不回归规则。
     *
     * 浅色的环是 antd 派生的淡蓝（`#91caff`），压在深色底上会是「深蓝环
     * 压深蓝底」——照搬浅色的取值就会掉进这个坑，而它看起来只是「焦点
     * 不太明显」，不会有人去查。所以显式拿浅色的两处基线比。
     */
    const darkRing = String(darkToken.colorPrimaryBorder)
    expect(
      contrast(darkRing, String(darkToken.colorBgContainer)),
      '深色焦点环比浅色还弱',
    ).toBeGreaterThanOrEqual(LIGHT_RING_ON_CONTAINER)
    expect(
      contrast(darkRing, String(darkToken.colorPrimaryBg)),
      '深色焦点环在选中底上比浅色还弱',
    ).toBeGreaterThanOrEqual(LIGHT_RING_ON_PRIMARY_BG)
  })

  it('深色的全部文字阶与语义色文字都不弱于浅色（跨外观不回归）', () => {
    // 深色最常见的退化是「看着还行就用」：某些组合悄悄比浅色更弱，
    // 而单看深色的截图判断不出来。这条逐项比一遍
    const container = {
      light: String(lightToken.colorBgContainer),
      dark: String(darkToken.colorBgContainer),
    }
    const pairs = [
      ['文字-2', 'colorTextSecondary'],
      ['文字-3', 'colorTextTertiary'],
      ['链接色', 'colorLink'],
      ['成功文字', 'colorSuccessText'],
      ['警告文字', 'colorWarningText'],
      ['错误文字', 'colorErrorText'],
      ['信息文字', 'colorInfoText'],
    ] as const

    for (const [name, key] of pairs) {
      expect(
        contrastOn(String(darkToken[key]), container.dark),
        `深色的${name}在容器底上比浅色弱`,
      ).toBeGreaterThanOrEqual(contrastOn(String(lightToken[key]), container.light))
    }
  })

  it.each(APPEARANCES)('选中项的描边与它的底能分开 %s下 ≥ 1.5:1', (appearance) => {
    // 列表项的选中态是「浅底 + 一道描边」，两者同色时描边就是白画的
    const token = tokenOf(appearance)
    expect(
      contrast(String(token.colorPrimaryBorder), String(token.colorPrimaryBg)),
    ).toBeGreaterThanOrEqual(1.5)
  })

  it.each(APPEARANCES)('分隔线与边框在容器底上看得见 %s下', (appearance) => {
    const token = tokenOf(appearance)
    const container = String(token.colorBgContainer)
    expect(contrast(String(token.colorBorderSecondary), container)).toBeGreaterThanOrEqual(1.1)
    expect(contrast(String(token.colorBorder), container)).toBeGreaterThanOrEqual(1.3)
  })

  it.each(APPEARANCES)('列底与容器底、布局底能分开 %s下', (appearance) => {
    /**
     * 三层表面模型（DESIGN §3.6）：列底靠**明度差**与内容区分开，
     * 而不是靠边框。
     *
     * 阈值刻意低（1.02 / 1.04）：这个差本来就是「几乎看不见的一层冷色」，
     * 规范明说它「用来分隔而不加边框」。要拦的是**同值**（那时两栏会糊成
     * 一整片，而看起来只是「有点闷」），不是要求它像边框一样清楚。
     * 实测：浅色 1.025 / 1.055，深色 1.027 / 1.051。
     */
    const token = tokenOf(appearance)
    const custom = customTokenFor(appearance)
    expect(
      contrast(custom.tintList, String(token.colorBgContainer)),
      `${NAMES[appearance]}：列表底与容器底几乎同色`,
    ).toBeGreaterThan(1.02)
    expect(
      contrast(custom.tintList, String(token.colorBgLayout)),
      `${NAMES[appearance]}：列表底与布局底几乎同色`,
    ).toBeGreaterThan(1.04)
    // 两个列底也要能区分：它们相邻（左栏导航 / 中栏列表），同值会让两栏连成一片
    expect(custom.tintList, `${NAMES[appearance]}：两个列底完全相同`).not.toBe(custom.tintNav)
  })
})

describe('关键值真的覆盖了 antd 默认', () => {
  it('浅色的语义文字不用 antd 默认值', () => {
    // antd 默认那套文字色在自家浅底上只有 1.83–3.66:1，见 docs/DESIGN.md §3
    const fallback = theme.getDesignToken()
    expect(lightToken.colorSuccessText).not.toBe(fallback.colorSuccessText)
    expect(lightToken.colorWarningText).not.toBe(fallback.colorWarningText)
    expect(lightToken.colorErrorText).not.toBe(fallback.colorErrorText)
    expect(lightToken.colorInfoText).not.toBe(fallback.colorInfoText)
    expect(lightToken.colorTextTertiary).not.toBe(fallback.colorTextTertiary)
    expect(lightToken.colorTextQuaternary).not.toBe(fallback.colorTextQuaternary)
  })

  it('深色的语义文字与文字阶也不用 antd 深色默认值', () => {
    const fallback = theme.getDesignToken({ algorithm: theme.darkAlgorithm })
    expect(darkToken.colorSuccessText).not.toBe(fallback.colorSuccessText)
    expect(darkToken.colorWarningText).not.toBe(fallback.colorWarningText)
    expect(darkToken.colorErrorText).not.toBe(fallback.colorErrorText)
    expect(darkToken.colorInfoText).not.toBe(fallback.colorInfoText)
    expect(darkToken.colorTextTertiary).not.toBe(fallback.colorTextTertiary)
    expect(darkToken.colorTextQuaternary).not.toBe(fallback.colorTextQuaternary)
  })

  it('深色的链接色来自校准层，且确实不同于 antd 深色默认', () => {
    /**
     * 这条守的是最容易静默失效的一处：与**种子同名**的覆盖值会被 antd
     * 的 `formatToken` 从最终结果里删掉，最终值由算法重新派生
     * （见 `tokens.ts` 的 `darkCalibration`）。
     *
     * 所以「在 token 里写了 colorLink」不等于「生效」——必须断言**生效值**
     * 等于我们要的那个色，而且它不等于 antd 自己派生出来的那个。
     */
    const antdDarkDefault = theme.getDesignToken({ algorithm: theme.darkAlgorithm })
    const ours = String(darkToken.colorLink)
    expect(ours).not.toBe(String(antdDarkDefault.colorLink))
    // 校准层里写死的那个值，逐字比对——改了取值而忘了改这里会红，
    // 那正是「文档与代码各说各话」的入口（DESIGN §3.8 有同一张表）
    expect(ours).toBe('#79b8ff')
  })

  it('深色主题把校准层挂在 algorithm 上（不是定义了一个没人用的函数）', () => {
    /**
     * `darkCalibration` 定义了却忘了挂进 `mimirDarkTheme.algorithm` 时，
     * 深色会静默用回 antd 深色默认的链接色（3.50:1，不达 AA）——
     * 单看截图只是「链接有点暗」，不会有人去查。
     */
    expect(mimirDarkTheme.algorithm, '深色主题缺少校准层').toBeDefined()
    // 校准层只放自己的那一步：基础算法由 antd-style 按 appearance 补，
    // 这里再写一遍 darkAlgorithm 会让它跑两次
    expect(mimirDarkTheme.algorithm).not.toBe(theme.darkAlgorithm)
    expect(algorithmFor('dark')[0]).toBe(theme.darkAlgorithm)
  })

  it('深色的底来自 darkAlgorithm（而不是浅色那套）', () => {
    // 「忘了把 darkAlgorithm 接进算法链」的症状是深色下底色仍是白的，
    // 而那时文字阶的对比度看起来「还挺好」——所以必须单独断言底色
    expect(String(darkToken.colorBgContainer)).not.toBe(String(lightToken.colorBgContainer))
    expect(luminance(String(darkToken.colorBgContainer))).toBeLessThan(
      luminance(String(lightToken.colorBgContainer)),
    )
    expect(luminance(String(darkToken.colorText))).toBeGreaterThan(
      luminance(String(lightToken.colorText)),
    )
  })

  it('品牌与形状保持既有决定', () => {
    expect(lightToken.colorPrimary).toBe('#1677ff')
    expect(lightToken.borderRadius).toBe(8)
    expect(lightToken.fontSize).toBe(14)
  })

  it('两套外观共用同一份形状与字体', () => {
    /**
     * 半径、字号、字体栈只有一份定义（`tokens.ts` 的 `BASE_TOKEN`）。
     * 分成两份 ThemeConfig 时最容易发生的漂移就是「深色忘了带这些」——
     * 而症状只是「深色下圆角好像小一点」，没人会去查。
     */
    for (const key of ['borderRadius', 'fontSize', 'fontFamily', 'fontFamilyCode'] as const) {
      expect(String(darkToken[key]), `${key} 在两套外观下不一致`).toBe(String(lightToken[key]))
    }
  })
})

describe('设置页分区标签的选中色（antd Tabs）', () => {
  /**
   * antd 的 `itemSelectedColor` 默认取 `colorPrimary`——那是**填充**角色
   * （按钮底、选中项底，见 §3.5）。而同一排里未选中的标签走 `colorText`，
   * 于是强调关系是反的：实测深色下选中项 3.50:1，未选中项 13.23:1
   * （浅色 4.10 对 10.89）。「我现在在哪一区」成了整排里最暗、最难读的
   * 那一个，看起来像被禁用。
   *
   * 这条要守的是**静默失效**：组件 token 写错名字，或 `components` 层
   * 没挂进 ThemeConfig，界面只是「蓝得不一样」，没人会当成 bug 去查——
   * 所以这里断言生效值等于本外观的链接色，而不是「看着挺蓝」。
   */
  it.each(APPEARANCES)('%s 下选中色走链接色而不是主色填充', (appearance) => {
    const tabs = themeConfigFor(appearance).components?.Tabs
    expect(
      tabs?.itemSelectedColor,
      `${NAMES[appearance]}：Tabs 没有组件级选中色（会退回 colorPrimary）`,
    ).toBe(appearance === 'dark' ? '#79b8ff' : '#0958d9')
    // 与 colorPrimary 同值就是没覆盖上——那正是要拦的退化
    expect(tabs?.itemSelectedColor).not.toBe(String(tokenOf(appearance).colorPrimary))
  })

  it.each(APPEARANCES)('选中标签在容器底上 %s 下 ≥ 4.5:1', (appearance) => {
    const selected = String(themeConfigFor(appearance).components?.Tabs?.itemSelectedColor)
    expect(
      contrastOn(selected, String(tokenOf(appearance).colorBgContainer)),
      `${NAMES[appearance]}：当前分区的标签读不清（13.5px 正文要 AA）`,
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('深色的选中标签不比浅色弱（跨外观不回归）', () => {
    // §3.8 的不回归规则。这条在本条发现里是**反过来**的：修之前
    // 深色 3.50 弱于浅色 4.10，而单看深色截图判断不出来。
    const selectedOf = (appearance: Appearance) =>
      contrastOn(
        String(themeConfigFor(appearance).components?.Tabs?.itemSelectedColor),
        String(tokenOf(appearance).colorBgContainer),
      )
    expect(selectedOf('dark'), '深色的选中标签比浅色还弱').toBeGreaterThanOrEqual(
      selectedOf('light'),
    )
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
 * CSS 模板字符串里的反引号。
 *
 * ## 为什么值得一条测试
 *
 * `createStyles` / `createGlobalStyle` 的样式体是**模板字符串**，而反引号
 * 会提前把它结束掉——于是整段样式变成非法 TS，React Compiler 插件报
 * `Expected a semicolon`，而报错位置指向一句看起来毫无问题的中文注释。
 *
 * 这个坑**咬过三次**，每次都是往注释里加了一对用于强调的反引号
 * （写成 \`colorPrimaryBg\` 这种 Markdown 习惯）：
 *
 *  1. `StatsSection.style.ts` 的「不设 overflow: hidden」那条注释
 *  2. `styles/global.ts` 的底色注释（并行改动引入）
 *  3. `StatsSection.style.ts` 的表格竖线注释（我修第 1 条时又写的）
 *
 * 前两次都写进了 `TECH.md` §10 的坑表——**但文档拦不住手**。
 * 所以补这条机器守：它扫的就是那对多余的引号。
 */
async function scanTemplateBackticks(): Promise<string[]> {
  const { readdir, readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')

  const offenders: string[] = []

  /**
   * **不用正则**：`/(?:css|createGlobalStyle)`([\s\S]*?)`/` 这类写法在这里
   * 是错的——非贪婪匹配会停在**第一个杂散反引号**处，于是捕获到的「模板体」
   * 里永远不含反引号，测试永远绿。第一版就是这么写的，注入一个违规验证时
   * 才发现它抓不到（**加断言后要验它能红**，否则等于没加）。
   *
   * 改成按行配对：这个代码库的约定是**收尾反引号独占一行**
   * （缩进 + 反引号，后面可跟一个逗号），所以「开标签行」到
   * 「独占反引号行」之间出现的任何反引号都必然是杂散的。
   */
  const OPENER = /(?:^|\s)(?:css|createGlobalStyle)`/
  const TERMINATOR = /^\s*`\s*,?\s*$/

  async function walk(dir: string) {
    for (const entry of await readdir(join(process.cwd(), dir), { withFileTypes: true })) {
      const rel = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(rel)
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
        const text = await readFile(join(process.cwd(), rel), 'utf8')
        let inside = false

        text.split('\n').forEach((line, index) => {
          if (!inside && OPENER.test(line)) {
            inside = true
            return
          }
          if (inside) {
            if (TERMINATOR.test(line)) {
              inside = false
            } else if (line.includes('`')) {
              offenders.push(`${rel}:${index + 1}`)
            }
          }
        })
      }
    }
  }

  for (const root of ['src/components', 'src/routes', 'src/styles']) await walk(root)
  return offenders
}

describe('样式模板里没有多余的反引号', () => {
  it('createStyles / createGlobalStyle 的模板体内不出现反引号', async () => {
    const offenders = await scanTemplateBackticks()
    expect(
      offenders,
      `这些样式模板体内有反引号，会提前结束模板字符串：\n${offenders.join('\n')}`,
    ).toEqual([])
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
   *    于是它成为全站唯一一个「不服从主题」的元素——**深色模式下尤其明显**，
   *    那口井会在深色导航上留下一个白色的洞。
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
    expect(lightToken.fontFamily).toBe(FONT_SANS)
    expect(lightToken.fontFamilyCode).toBe(FONT_MONO)
  })

  it('字体栈含中文兜底', () => {
    // docs/DESIGN.md §2.1：antd 默认栈到 Roboto 就结束，
    // Linux 上会一路落到 sans-serif，中文可能渲染成点阵字体
    expect(FONT_SANS).toContain('PingFang SC')
    expect(FONT_SANS).toContain('Microsoft YaHei')
    expect(FONT_SANS.endsWith('sans-serif')).toBe(true)
  })
})

describe('自定义 token', () => {
  it.each(APPEARANCES)('四个表面色与热力色阶都有值且是 hex（%s）', (appearance) => {
    const custom = customTokenFor(appearance)
    for (const key of [
      'tintList',
      'tintNav',
      'tintHover',
      'inlineCodeFg',
      'highlightBg',
    ] as const) {
      expect(custom[key], `${key} 不是 hex`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('两套外观的自定义 token 确实不同（不是复制过来的）', () => {
    // 最常见的失误：加了深色分支却把浅色的值原样复制一份。
    // 那种情况下界面「能用」，只是深色看着不对劲——没有任何报错
    for (const key of Object.keys(mimirCustomToken) as (keyof typeof mimirCustomToken)[]) {
      expect(mimirDarkCustomToken[key], `深色的 ${key} 与浅色相同`).not.toBe(mimirCustomToken[key])
    }
  })

  /**
   * 悬停底与列表底必须**看得出差别**。
   *
   * `tintHover` 的第一版是 `#fafbff` 对 `#fcfcfd`——对比度 **1.01:1**，
   * 浅色下「悬停提亮一档」这个信号等于不存在（引用卡、列表行都是这个
   * 组合），而静态截图完全看不出来（实测发现，D-096）。
   *
   * 下限取 1.06：`colorFillTertiary` 那类悬停底在同类底色上大约是 1.08–1.12，
   * 1.06 是「肉眼可辨」的最低档；低于它就是在原地踏步。
   */
  it.each(APPEARANCES)('悬停底与列表底可辨（%s下 ≥ 1.06:1）', (appearance) => {
    const custom = customTokenFor(appearance)
    const ratio = contrast(custom.tintHover, custom.tintList)
    expect(
      ratio,
      `${NAMES[appearance]}：tintHover 与 tintList 只差 ${ratio.toFixed(3)}:1，悬停没有反馈`,
    ).toBeGreaterThanOrEqual(1.06)
  })

  it.each(APPEARANCES)('行内代码字色配 fill-secondary 底 %s下 ≥ 4.5:1', (appearance) => {
    // fill-secondary 是半透明的，要合成到内容实际所在的底上再算。
    // 内容区与列表底两种都要达标。
    const token = tokenOf(appearance)
    const custom = customTokenFor(appearance)
    for (const surface of [String(token.colorBgContainer), custom.tintList]) {
      expect(
        contrastOver(custom.inlineCodeFg, String(token.colorFillSecondary), surface),
        `${NAMES[appearance]}：行内代码在 ${surface} 上对比度不足`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  /**
   * 代码块的语法高亮底色。
   *
   * 这组着色的**第一版完全没有 CSS**：`CodeBlockLowlight` 解析出带
   * `hljs-keyword` 之类的 span，但全仓没有一条 `hljs` 规则，于是所有 token
   * 渲染成同一个颜色——看起来像「编辑器不支持高亮」，实际只是少了样式，
   * 而且不报错。现在把取色也纳入守卫：它们落在 `tintNav` 底的代码块里，
   * 属于「小字号 + 非正文色」这种最容易掉到 4.5 以下的组合。
   *
   * 色值直接取自 antd 语义 token（`tokens.ts` 已覆盖的值），这里按最终
   * 生效的颜色再算一遍——多一层校验不亏，因为这四个值同时被两个视图使用。
   */
  it.each(APPEARANCES)('代码块语法高亮配色在代码块底上 %s下 ≥ 4.5:1', (appearance) => {
    const token = tokenOf(appearance)
    const custom = customTokenFor(appearance)
    const surfaces = [custom.tintNav, String(token.colorBgContainer)]
    const highlightColors = {
      注释: String(token.colorTextTertiary),
      关键字: String(token.colorLink),
      字符串: String(token.colorSuccessText),
      数字: String(token.colorWarningText),
    }
    for (const [name, color] of Object.entries(highlightColors)) {
      for (const surface of surfaces) {
        expect(
          contrast(color, surface),
          `${NAMES[appearance]}：语法高亮「${name}」在 ${surface} 上对比度不足`,
        ).toBeGreaterThanOrEqual(4.5)
      }
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
  it.each(APPEARANCES)('选中态与未选中态的底色不同 %s下', (appearance) => {
    const token = tokenOf(appearance)
    const selected = String(token.colorPrimaryBg)
    const unselected = String(token.colorBgContainer)
    expect(selected).not.toBe(unselected)
    // 与容器底至少能看出不同（同色相不同明度，不要求 3:1——
    // 非文本对比度要求针对的是「必须靠它才能理解内容」的图形，
    // 而这里选中的信息由底色 + 字色 + 字重共同承担）
    expect(contrast(selected, unselected)).toBeGreaterThan(1.05)
    // 真正被要求 ≥ 4.5:1 的是**选中项上的文字**（DESIGN §3.2 已算过）
    expect(contrastOn(String(token.colorLink), selected)).toBeGreaterThanOrEqual(4.5)
  })

  /**
   * 警告文字在容器底上的对比度。
   *
   * 整理条退役之后（D-054）这条断言只剩一个底要算——原先还有个
   * `tintWarningSurface`（整理条专用的淡橙底），那个 token 已随它一起退役。
   * 保留容器底这一条：警告文字仍然会出现在卡片、弹窗这些容器底上。
   */
  it.each(APPEARANCES)('警告文字在容器底上 %s 下 ≥ 4.5:1', (appearance) => {
    const token = tokenOf(appearance)
    expect(
      contrast(String(token.colorWarningText), String(token.colorBgContainer)),
    ).toBeGreaterThanOrEqual(4.5)
  })
})

describe('用量热力图色阶', () => {
  /**
   * 这里测的不是「配色好不好看」，而是那个**最容易做错的判断**：
   * 空格子（无调用）与最浅档（有一点活动）必须能分开。
   *
   * 浅色下用 `colorPrimaryBg`（#e6f4ff）当最浅档时，它与白底只差 1.05:1，
   * 「有一点活动」和「完全没活动」在屏幕上几乎一样——这是贡献图
   * 最常见的失败（docs/DESIGN.md §3.6.1）。
   *
   * 深色下同一个判断仍在，但方向相反：空格子是**更暗**的一方，
   * 所以色阶往亮走。
   */

  it.each(APPEARANCES)('四档都有值且是 hex（%s）', (appearance) => {
    for (const color of scaleOf(appearance)) expect(color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it.each(APPEARANCES)('最浅档与空格子、布局底都能分开 %s下', (appearance) => {
    const token = tokenOf(appearance)
    // 空格子的底是 colorFillQuaternary（半透明），先合成到容器底上再比
    const empty = composite(String(token.colorFillQuaternary), String(token.colorBgContainer))
    expect(contrast(scaleOf(appearance)[0]!, empty)).toBeGreaterThan(1.1)
    // 也明显区别于布局底——否则在没铺底色时同样分不出来
    expect(contrast(scaleOf(appearance)[0]!, String(token.colorBgLayout))).toBeGreaterThan(1.1)
  })

  it.each(APPEARANCES)('相邻两档能分开，否则四档等于两档（%s）', (appearance) => {
    const levels = [
      composite(
        String(tokenOf(appearance).colorFillQuaternary),
        String(tokenOf(appearance).colorBgContainer),
      ),
      ...scaleOf(appearance),
    ]
    for (let i = 1; i < levels.length; i += 1) {
      expect(
        contrast(levels[i]!, levels[i - 1]!),
        `${NAMES[appearance]}：第 ${i} 档与第 ${i - 1} 档几乎一样`,
      ).toBeGreaterThan(1.15)
    }
  })

  it.each(APPEARANCES)('色阶单调加深（%s）', (appearance) => {
    /**
     * 分档写反会「越忙越浅」，而那种错误看起来只是「配色有点怪」。
     *
     * 两边共用同一条规则、但**方向相反**：
     *  - 浅色：底是亮的，越忙越深 → 明度递减
     *  - 深色：底是暗的，越忙越亮 → 明度递增
     *
     * 所以在状态里带上期望方向，而不是写死「递减」——后者会让深色那套
     * 只能靠人眼判断「差不多对」。
     */
    const luminances = scaleOf(appearance).map((color) => luminance(color))
    /**
     * 方向用符号表达，而不是在循环里 if/else。
     *
     * 两份等价的写法（差值乘方向后必须为正），但 if/else 版本里
     * 两个 `expect` 都是有条件的——`vitest/no-conditional-expect` 会拦下它，
     * 而那条规则的理由在此成立：条件分支里的断言在条件恒假时**静默不跑**，
     * 看起来是「通过了」。
     */
    const direction = appearance === 'dark' ? 1 : -1
    for (let i = 1; i < luminances.length; i += 1) {
      expect(
        (luminances[i]! - luminances[i - 1]!) * direction,
        `${NAMES[appearance]}：第 ${i} 档的明度方向反了`,
      ).toBeGreaterThan(0)
    }
  })
})

describe('状态徽标色对', () => {
  // docs/DESIGN.md §3.7 的表。来源徽标已随 D-047 移除、收件箱徽标随 D-054
  // 移除、归档徽标随 D-065 移除，这张表只剩**提取失败**一个偏离常态的状态。
  // 改配色时这里会拦下来。
  it.each(APPEARANCES)('徽标文字 on 自身底 %s下 ≥ 4.5:1', (appearance) => {
    for (const [name, pair] of Object.entries(BADGE_COLORS[appearance])) {
      expect(
        contrast(pair.fg, pair.bg),
        `${NAMES[appearance]}：「${name}」徽标对比度不足`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(APPEARANCES)('徽标的底与容器底能分开 %s下', (appearance) => {
    // 徽标的底如果和面板底色同值，它就退化成一个纯文字标签，
    // 而「状态可辨」靠的正是那块底色
    const container = String(tokenOf(appearance).colorBgContainer)
    for (const [name, pair] of Object.entries(BADGE_COLORS[appearance])) {
      expect(
        contrast(pair.bg, container),
        `${NAMES[appearance]}：「${name}」徽标的底与容器底几乎同色`,
      ).toBeGreaterThan(1.03)
    }
  })
})

describe('设置页与对话区的色对', () => {
  /**
   * 这几组是上面的通用矩阵**没有覆盖**的组合：
   *
   *  1. 插件条目的状态徽标：`colorSuccessText` on **容器底**（不是 on 自己的浅绿底——
   *     徽标直接落在面板里）；以及「待开发」用 `colorFillTertiary` 这个半透明底
   *  2. 自检结果里的警告文字：`colorWarningText` on 容器底
   *  3. 抓取进度里那三个阶段圆点：图标 on 同语义浅底（成对使用）
   *
   * 它们都属于「状态必须能被看见」（DESIGN §0.2），所以照样要有底线。
   */
  it.each(APPEARANCES)('状态徽标：successText on 容器底 %s下 ≥ 4.5:1', (appearance) => {
    const token = tokenOf(appearance)
    expect(
      contrast(String(token.colorSuccessText), String(token.colorBgContainer)),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it.each(APPEARANCES)(
    '状态徽标「待开发」：secondary on fill-tertiary %s下 ≥ 4.5:1',
    (appearance) => {
      // colorFillTertiary 是半透明的，必须先合成到容器底上再算——
      // 直接拿 alpha 值算会得到把黑色当底色的假数字
      const token = tokenOf(appearance)
      expect(
        contrastOver(
          String(token.colorTextSecondary),
          String(token.colorFillTertiary),
          String(token.colorBgContainer),
        ),
      ).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each(APPEARANCES)('抓取阶段的三个圆点：图标 on 语义底 %s下 ≥ 4.5:1', (appearance) => {
    const token = tokenOf(appearance)
    const pairs = [
      ['完成', token.colorSuccessText, token.colorSuccessBg],
      ['失败', token.colorErrorText, token.colorErrorBg],
      // 正在跑的那一步用的是链接色（文字角色）而不是主色
      ['进行中', token.colorLink, token.colorPrimaryBg],
    ] as const
    for (const [name, foreground, background] of pairs) {
      expect(
        contrast(String(foreground), String(background)),
        `${NAMES[appearance]}：抓取阶段「${name}」的圆点不达标`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(APPEARANCES)('来源标注（手动 / AI）成对使用语义色 %s下 ≥ 4.5:1', (appearance) => {
    const token = tokenOf(appearance)
    // 手动编辑走信息色对
    expect(contrast(String(token.colorInfoText), String(token.colorInfoBg))).toBeGreaterThanOrEqual(
      4.5,
    )
    // AI 整理走中性色对
    expect(
      contrastOver(
        String(token.colorTextSecondary),
        String(token.colorFillTertiary),
        String(token.colorBgContainer),
      ),
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      contrast(String(token.colorWarningText), String(token.colorBgContainer)),
    ).toBeGreaterThanOrEqual(4.5)
  })
})

describe('布局常量', () => {
  it('内容列只有一个宽度值', () => {
    // docs/DESIGN.md §5.4：同一条内容在列表里和详情里不该有两种宽度。
    // 页面里出现新的 maxWidth 字面量时，先问它是不是第三种「内容列」。
    expect(CONTENT_WIDTH).toBe(760)
  })

  /**
   * 窄屏断点只有一处。
   *
   * 它同时决定两件事：外壳的**网格宽度**（`_app.tsx` 的 `@media`）与栏内
   * **内容怎么渲染**（`lib/nav-collapse.ts` 的 `matchMedia`）。第一版就是
   * 两处各写各的——网格收到 48px 而栏里仍按展开态渲染，于是中文标签逐字竖排、
   * 品牌名与折叠开关叠在一起。**不报错，只是全变形了**，而且改的人只会去看
   * 自己改的那一半。
   *
   * 所以查询串从 `tokens.ts` 派生，`_app.tsx` 里不许再出现这个字面量。
   */
  it('窄屏断点在 tokens.ts 定义一次（外壳不与它各写一份）', async () => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')

    expect(NAV_NARROW_QUERY).toBe(`(max-width: ${NAV_NARROW_BREAKPOINT}px)`)

    const shell = await readFile(join(process.cwd(), 'src/routes/_app.tsx'), 'utf8')
    // 注释里写「≤880px」是说明，不算重复定义——只查代码里还留着的数字
    const code = shell
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
      .replace(/\/\/.*/g, '')
    const offenders = code
      .split('\n')
      .map((line, index) => [index + 1, line] as const)
      .filter(([, line]) => line.includes(String(NAV_NARROW_BREAKPOINT)))

    expect(
      offenders,
      `断点值又写进了外壳（用 NAV_NARROW_QUERY，否则栏内内容会与网格脱节）：\n${offenders
        .map(([line, text]) => `_app.tsx:${line}: ${text.trim()}`)
        .join('\n')}`,
    ).toEqual([])
    expect(shell).toContain('NAV_NARROW_QUERY')
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

/**
 * 当前注入的 token 变量块。
 *
 * cssinjs 把变量写在 `style[data-token-hash="mimir"]` 里（值是 `cssVar` 的
 * key），所以「组件 token 有没有真的注册成变量」只能从这里读。
 * 提到模块级是 lint 的要求（`unicorn/consistent-function-scoping`）。
 */
function readTokenVars(): string {
  return [...document.querySelectorAll('style[data-token-hash="mimir"]')]
    .map((style) => style.textContent ?? '')
    .join('\n')
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
    /** 重读一次注入的 CSS（切换外观后用） */
    readCss: () =>
      [...document.querySelectorAll('style')].map((style) => style.textContent ?? '').join('\n'),
    unmount: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}

/** 把外观切到指定值（沿用真实的状态存储，不绕过它） */
async function switchAppearance(appearance: Appearance): Promise<void> {
  await act(async () => {
    setThemeMode(appearance)
  })
}

afterEach(async () => {
  // 状态是模块级的，跑完一轮要还原成跟随系统，避免污染下一条测试
  await switchAppearance('light')
})

describe('cssVar 运行时确实注入了变量', () => {
  it('浅色下 --ant-* 变量带着 mimir 的覆盖值出现', async () => {
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

  it('html 的底色带 !important（否则压不过首帧脚本的内联兜底）', async () => {
    /**
     * `index.html` 的首帧脚本给 `html` 写了一个**内联**兜底背景，
     * 只为覆盖「脚本执行到样式注入」那一段空白。内联样式优先于样式表，
     * 所以这里的全局规则不加 `!important` 就会一直输——**运行时切换外观时
     * html 的底不会跟着变**（刷新后才对），表现是切换后 overscroll
     * 露出上一层外观的颜色。这条守的就是那个 `!important`。
     */
    const { css, unmount } = await renderApp()

    expect(css).toMatch(/html\s*\{[^}]*background:[^;}]*!important/i)

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
    // 直接用 antd 的 Empty 当探针：不给 description 时它渲染 locale 的默认文案。
    const { Empty } = await import('antd')
    const { host, unmount } = await renderApp(createElement(Empty))

    expect(host.textContent).toContain('暂无数据')
    await unmount()
  })
})

describe('外观切换真的生效', () => {
  /**
   * 这一组是本文件里**最重要**的运行时断言。
   *
   * 静态 token 测过不等于装配对了：变量块可能还是旧的、可能变成两块
   * （后一块覆盖前一块）、也可能只换了 `--ant-*` 而自定义 token 没跟着走。
   * 三种都静默。
   */
  it('切到深色后变量块被替换成深色的值，且只有一块', async () => {
    const { css, unmount } = await renderApp()
    expect(css).toContain('--ant-color-bg-container:#ffffff')

    await switchAppearance('dark')
    const after = document.querySelectorAll('style[data-token-hash="mimir"]')

    // 只有一个变量块：两块共存时后一块会盖住前一块，
    // 表面上「看着对」，但只要渲染顺序变一次就会翻车
    //
    // 选择器用 `data-token-hash`（cssinjs 的 ATTR_TOKEN），值是 cssVar 的
    // key（'mimir'）。写错的话 count 是 0，而 0 也会让「不该有两份」通过——
    // 所以下面还要断言真正拿到了深色的值
    expect(after.length, '变量块不该有第二份').toBe(1)

    const darkVars = [...after].map((style) => style.textContent ?? '').join('\n')
    expect(darkVars).toMatch(/--ant-color-bg-container:\s*#141618/i)
    expect(darkVars).toMatch(/--ant-color-link:\s*#79b8ff/i)
    expect(darkVars).toMatch(/--ant-color-text-tertiary:\s*rgba\(255,\s*255,\s*255,\s*0?\.52\)/i)
    // 浅色那套值必须已经不在了——否则就是「两套色混在一起」，最难查的一种
    expect(darkVars).not.toContain('--ant-color-bg-container:#ffffff')

    await unmount()
  })

  it('切到深色后自定义 token 也换了（createStyles 重新生成）', async () => {
    const { css: before, readCss, unmount } = await renderApp()
    expect(before).toContain(mimirCustomToken.tintList)

    await switchAppearance('dark')
    const after = readCss()

    expect(after).toContain(mimirDarkCustomToken.tintList)
    expect(after).toContain(mimirDarkCustomToken.inlineCodeFg)

    await unmount()
  })

  it('切换到深色会把 html 的 data-theme 与 color-scheme 一起换掉', async () => {
    const { unmount } = await renderApp()

    await switchAppearance('dark')
    // 原生控件（滚动条、select 下拉）只认 color-scheme，
    // 不设它深色页面上就会挂着一根亮色滚动条
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')

    await unmount()
  })

  it('切回浅色能还原（不是单向的）', async () => {
    const { unmount } = await renderApp()

    await switchAppearance('dark')
    await switchAppearance('light')
    const block = document.querySelector('style[data-token-hash="mimir"]')?.textContent ?? ''

    expect(block).toMatch(/--ant-color-bg-container:\s*#ffffff/i)
    expect(block).not.toContain('--ant-color-bg-container:#141618')

    await unmount()
  })

  it('组件级 token 也被 provider 栈注入成变量（切换外观后跟着换）', async () => {
    /**
     * 上面那条静态断言只证明「配置里写了」。组件 token 要经
     * `getComponentToken` 合并、再经 cssinjs 注册成 `--ant-tabs-*`，
     * 中间任何一环断了都**只有界面会变**（退回 `colorPrimary`，
     * 仍然「是蓝色」，看着不像坏了）。所以这里挂真实 provider 栈
     * 取自证的实际生效变量——组件 token 走的是与全局 token 不同的注册
     * 路径（`useCSSVarRegister` 只对渲染过的组件注册），静态值测不出来。
     */
    const { Tabs } = await import('antd')
    const { host, unmount } = await renderApp(
      createElement(Tabs, {
        items: [
          { key: 'a', label: '模型' },
          { key: 'b', label: '检索' },
        ],
      }),
    )

    expect(readTokenVars(), '浅色下 Tabs 变量没有注册').toMatch(
      /--ant-tabs-item-selected-color:#0958d9/i,
    )
    // 选中项必须真的画成那个色：变量注册了但选择器没用上，界面还是旧色
    // （jsdom 会把 var() 解出来，但不把 hex 规范化成 rgb——两种写法都要认）
    const selected = host.querySelector('.ant-tabs-tab-active .ant-tabs-tab-btn')
    expect(['#0958d9', 'rgb(9, 88, 217)']).toContain(getComputedStyle(selected as Element).color)

    await switchAppearance('dark')
    expect(readTokenVars(), '深色下 Tabs 变量没跟着换').toMatch(
      /--ant-tabs-item-selected-color:#79b8ff/i,
    )

    await unmount()
  })
})

describe('表单校验的错误文字用校准过的色', () => {
  /**
   * ## 这条守的是一个「变量对、画面对不上」的洞
   *
   * antd 的 Form 把校验错误写成 `color: token.colorError`
   * （`es/form/style/index.js:246`）——那是**未校准**的 `#ff4d4f`
   * （白底 3.27:1），而不是本规范 §3.3/§3.4 校准过的 `colorErrorText`
   * （浅色 `#c5221f` 5.80:1、深色 `#f0777a` 6.59:1）。
   *
   * 上面那组「语义色对」断言测的是 token——两边都是绿的，而画面上那行
   * 红字是另一个值。**变量对不等于渲染出来的就对**，所以这里必须把
   * provider 栈挂起来、真的读一次 `getComputedStyle`。
   *
   * `styles/global.ts` 里那条规则盖的就是这个（选择器写两段是为了压过
   * antd 自己的 (0,2,0)）。删掉它这条会红。
   *
   * **先切外观再挂载**：`getComputedStyle` 读的是真实渲染出来的那一帧，
   * 而默认外观是浅色——不切的话深色那一轮读到的其实是浅色的值
   * （上面那些静态断言不受影响，它们比的是 token 本身）。
   */
  it.each(APPEARANCES)(
    '%s 下 explain-error 是 colorErrorText，不是 antd 的 colorError',
    async (appearance) => {
      await switchAppearance(appearance)

      const { Form } = await import('antd')
      const { host, unmount } = await renderApp(
        createElement(
          Form,
          null,
          createElement(
            Form.Item as never,
            {
              label: '邮箱',
              validateStatus: 'error',
              help: '请输入邮箱',
              children: createElement('input'),
            } as never,
          ),
        ),
      )

      const node = host.querySelector('.ant-form-item-explain-error')
      expect(node, '没有渲染出校验错误行，测试本身失效了').not.toBeNull()

      const token = tokenOf(appearance)
      const expected = String(token.colorErrorText)
      const rendered = getComputedStyle(node as Element).color

      // jsdom 会把 var() 解出来，但不把 hex 规范化成 rgb——两种写法都要认
      expect(
        [expected, hexToRgb(expected)],
        `${NAMES[appearance]}：校验错误文字没走校准色`,
      ).toContain(rendered)
      // 与未校准的那一支必须不同，否则这条断言等于没写
      expect(expected).not.toBe(String(token.colorError))

      await unmount()
    },
  )
})

/** `#c5221f` → `rgb(197, 34, 31)`。只处理六位 hex（token 全是这个形状） */
function hexToRgb(hex: string): string {
  const value = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(value.slice(at, at + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}
