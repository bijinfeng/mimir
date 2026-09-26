/**
 * @vitest-environment happy-dom
 *
 * 外壳的渲染契约。
 *
 * 这些断言守的都是**静默失效**：界面看起来是对的，只有键盘用户、读屏用户、
 * 或者下一次改样式的人才会碰到。所以它们不测「长什么样」（那是视觉验证的
 * 事），只测结构上与行为上的硬要求。
 *
 * 这个文件单独要 DOM 环境（见 vitest.config.ts 里为什么默认是 Node）。
 */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EditorShell,
  EditorState,
  ToolbarButton,
  ToolbarDivider,
  ToolbarLabel,
  ToolbarSpacer,
  ToolbarTabs,
} from './EditorShell.js'

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node)

/* ── DOM 渲染的小工具：挂载 → 交互 → 卸载 ─────────────────────── */

const mounted: { unmount: () => void }[] = []

afterEach(() => {
  for (const item of mounted) item.unmount()
  mounted.length = 0
})

function mount(node: Parameters<typeof createRoot>[1] extends never ? never : React.ReactNode) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  // React 要求测试里显式声明这是 act 环境，否则 setState 会打警告
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  act(() => root.render(node))
  mounted.push({ unmount: () => act(() => root.unmount()) })
  return host
}

describe('EditorShell', () => {
  it('四个槽位自上而下：工具条 → 内容 → 附属面板 → 状态行', () => {
    const out = html(
      <EditorShell
        toolbar={<ToolbarLabel>工具条</ToolbarLabel>}
        footer={<span>附属</span>}
        status={<span>状态</span>}
      >
        <div>内容</div>
      </EditorShell>,
    )

    const at = (needle: string) => {
      const index = out.indexOf(needle)
      expect(index, `没找到「${needle}」`).toBeGreaterThan(-1)
      return index
    }
    expect(at('工具条')).toBeLessThan(at('内容'))
    expect(at('内容')).toBeLessThan(at('附属'))
    expect(at('附属')).toBeLessThan(at('状态'))
  })

  it('没传的槽位不渲染——空槽位会占位、看起来像内容没出来', () => {
    const out = html(
      <EditorShell>
        <div>内容</div>
      </EditorShell>,
    )
    expect(out).not.toContain('mimir-editor__bar')
    expect(out).not.toContain('mimir-editor__footer')
    expect(out).not.toContain('mimir-editor__status')
    expect(out).toContain('内容')
  })

  it('贴边模式去掉外框与圆角（它已经在面板里，不要框套框）', () => {
    const flush = html(
      <EditorShell flush>
        <div>内容</div>
      </EditorShell>,
    )
    const boxed = html(
      <EditorShell>
        <div>内容</div>
      </EditorShell>,
    )
    expect(flush).toContain('mimir-editor--flush')
    expect(boxed).not.toContain('mimir-editor--flush')
  })
})

describe('ToolbarButton', () => {
  it('是真 button，不是带 onClick 的 div（键盘与读屏都靠它）', () => {
    const out = html(<ToolbarButton label="加粗" onClick={() => {}} />)
    expect(out).toContain('<button')
    expect(out).toContain('type="button"')
  })

  it('按下态写进 aria-pressed，没有第二处状态', () => {
    const on = html(<ToolbarButton label="加粗" active onClick={() => {}} />)
    const off = html(<ToolbarButton label="加粗" onClick={() => {}} />)
    expect(on).toContain('aria-pressed="true"')
    expect(off).toContain('aria-pressed="false"')
  })

  it('提示文字同时是无障碍名称（title 之外还要 aria-label）', () => {
    const withIcon = html(
      <ToolbarButton label="加粗" onClick={() => {}}>
        <b>B</b>
      </ToolbarButton>,
    )
    expect(withIcon).toContain('title="加粗"')
    expect(withIcon).toContain('aria-label="加粗"')
  })

  it('主按钮显示文字标签——只有图标的话「保存」这个动作认不出来', () => {
    const out = html(<ToolbarButton label="保存" primary onClick={() => {}} />)
    expect(out).toContain('me-btn--primary')
    expect(out).toContain('保存')
  })

  it('禁用态落到 disabled 属性上，而不是只把颜色调淡', () => {
    const out = html(<ToolbarButton label="保存" disabled onClick={() => {}} />)
    expect(out).toContain('disabled')
  })

  /**
   * **按下时不能让编辑区失焦。**
   *
   * 这是工具条里最容易静默坏掉的一条：按钮默认会在 mousedown 时拿走焦点，
   * 浏览器随即清掉编辑区里的选区，于是 `toggleMark('bold')` 作用在一个
   * 空选区上——「点了加粗，没有反应，也不报错」。Word 也是这么做的。
   */
  it('按下时阻止默认行为——否则选区先被清掉，命令作用不到它', () => {
    const host = mount(<ToolbarButton label="加粗" onClick={() => {}} />)
    const button = host.querySelector('button')!
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    act(() => {
      button.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
  })

  it('点击转发到 onClick', () => {
    const onClick = vi.fn<() => void>()
    const host = mount(<ToolbarButton label="加粗" onClick={onClick} />)
    act(() => {
      host.querySelector('button')!.click()
    })
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('ToolbarTabs', () => {
  it('选中态写进 aria-selected，且带 role=tab（读屏要靠它报「第几张表」）', () => {
    const out = html(
      <ToolbarTabs
        label="工作表"
        value="b"
        onChange={() => {}}
        items={[
          { value: 'a', label: '表一' },
          { value: 'b', label: '表二' },
        ]}
      />,
    )
    expect(out).toContain('role="tablist"')
    expect(out).toContain('aria-label="工作表"')
    expect(out).toContain('aria-selected="true"')
    expect(out).toContain('aria-selected="false"')
  })

  it('点页签把它的值报上去', () => {
    const onChange = vi.fn<(value: string) => void>()
    const host = mount(
      <ToolbarTabs
        label="工作表"
        value="a"
        onChange={onChange}
        items={[
          { value: 'a', label: '表一' },
          { value: 'b', label: '表二' },
        ]}
      />,
    )
    const tabs = host.querySelectorAll('button')
    act(() => {
      tabs[1]!.click()
    })
    expect(onChange).toHaveBeenCalledWith('b')
  })
})

describe('零件', () => {
  it('分隔线与撑开块都是纯装饰，读屏不该念它们', () => {
    expect(html(<ToolbarDivider />)).toContain('aria-hidden="true"')
    expect(html(<ToolbarSpacer />)).not.toContain('<button')
  })

  it('错误态与普通态是两个类，不靠颜色硬编码区分', () => {
    const error = html(<EditorState tone="error">读取失败</EditorState>)
    const muted = html(<EditorState>读取中</EditorState>)
    expect(error).toContain('me-state--error')
    expect(muted).not.toContain('me-state--error')
  })
})
