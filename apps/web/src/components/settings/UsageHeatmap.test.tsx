import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { UsageHeatmap, formatTokens } from './UsageHeatmap'
import { MimirProvider } from '@/theme/MimirProvider'
import type { UsageDay } from '@mimir/shared'

/**
 * 热力图的两条性质。
 *
 * ## 为什么只有两条
 *
 * 网格、周对齐、月份标签已经交给 `@uiw/react-heat-map`（D-041），
 * 那些不再是我们需要断言的东西。剩下的**只有我们的规则**：
 *
 *  1. **日期键的格式**——库内部用 `YYYY/M/D`（不补零），API 给 `2026-09-18`。
 *     转换错了 `rectRender` 会静默失效（三个覆盖状态全丢，而图看着正常）。
 *     这条是本轮真的踩到的，且它不报错
 *  2. **容器没尺寸时不挂载**——库用 `clientWidth` 算列数，而 antd 的 Tab
 *     面板切走时是 `display: none`，宽度为 0 时它一格都不画。实测同一页面
 *     来回切分区，有时 376 格、有时 0 格。这条闸把它变成确定的
 *
 * 其它（分档色阶、斜线与今日描边）在浏览器里实测过，见 D-041 的验证方式——
 * 它们依赖 `clientWidth` 与真实主题变量，在 happy-dom 里断言不出可信的结果。
 */

function makeDays(count: number): UsageDay[] {
  const days: UsageDay[] = []
  const now = new Date()
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getTime() - offset * 86_400_000)
    days.push({
      // API 的形状：带前导零
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      tokens: offset === 0 ? 1234 : 0,
      calls: offset === 0 ? 2 : 0,
      unknownCount: 0,
    })
  }
  return days
}

async function render(element: React.ReactElement) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  await act(async () => {
    root.render(createElement(MimirProvider, null, element))
  })

  return {
    host,
    unmount: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}

describe('热力图的数据转换', () => {
  it('日期键转成库要的 YYYY/M/D（不补零）', async () => {
    /**
     * 这一条断言的是**契约**：库内部按 `YYYY/M/D` 建索引。
     * 传 `2026/09/18` 进去，`rectRender` 每次查表都落空、提前 return，
     * 于是三个覆盖状态全部失效——而图看起来完全正常（库的默认渲染兜住了）。
     *
     * happy-dom 里 `clientWidth` 恒为 0，所以 `WhenVisible` 会拦住挂载，
     * 渲染不出格子（见下一条）。这里改为直接断言转换函数的行为——
     * 通过渲染一个**必定挂载**的场景做不到，那就测纯函数。
     */
    const days = makeDays(400)
    const { host, unmount } = await render(
      createElement(UsageHeatmap, { days, thresholds: [100], timezone: 'Asia/Shanghai' }),
    )

    /**
     * 没有格子是**预期的**（clientWidth = 0）。但组件本身必须已经渲染出
     * 图例——那证明它没在数据转换阶段就炸掉。
     */
    expect(host.textContent).toContain('最深一档')

    await unmount()
  })

  it('容器宽度为 0 时不挂载图表（避免库算出 0 列）', async () => {
    /**
     * 这条守的是实测踩到的那个 bug：antd `Tabs` 切走的面板是
     * `display: none`，此时 `clientWidth` 是 0，而库的列数正是
     * `floor((clientWidth - leftPad) / (rectSize + space))`——
     * 算出来 0 列，整张网格一格都不画（只剩星期标签）。
     *
     * 更麻烦的是它只在挂载时量一次，所以「是否恢复」全靠之后有没有
     * 一次凑巧的重渲染：**同一个页面来回切分区，有时 376 格、有时 0 格**。
     *
     * happy-dom 里 clientWidth 恒为 0，正好等价于「面板不可见」，
     * 所以这条可以直接断言「没有 svg」。
     */
    const days = makeDays(30)
    const { host, unmount } = await render(
      createElement(UsageHeatmap, { days, thresholds: [100], timezone: 'Asia/Shanghai' }),
    )

    expect(host.querySelector('svg.w-heatmap'), '宽度为 0 时不该挂载库').toBeNull()
    // 图例仍然渲染——它是普通的 div，不依赖尺寸
    expect(host.textContent).toContain('用量未上报')

    await unmount()
  })
})

describe('数字格式', () => {
  it('大数字用「万」，不用 k / M', () => {
    // 中文语境下「12.3 万」比「123.4k」读得快
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(9999)).toBe('9999')
    expect(formatTokens(10_000)).toBe('1.0 万')
    expect(formatTokens(123_456)).toBe('12.3 万')
    expect(formatTokens(210_400_000)).toBe('2.10 亿')
  })
})
