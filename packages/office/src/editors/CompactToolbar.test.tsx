/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { CompactToolbar } from './CompactToolbar.js'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

it('keeps every command in the visible band when the editor column is narrow', () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  host.style.width = '320px'
  document.body.append(host)
  const root = createRoot(host)
  const action = vi.fn<() => void>()
  act(() => {
    root.render(
      <CompactToolbar
        sections={[
          { key: 'find', label: '查找', minWidth: 0, content: <button>查找</button> },
          {
            key: 'cell',
            label: '单元格',
            minWidth: 1200,
            content: <button onClick={action}>清空单元格</button>,
          },
        ]}
      />,
    )
  })
  const command = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === '清空单元格',
  )
  expect(command).toBeDefined()
  expect(host.querySelector('button[aria-label="更多工具"]')).toBeNull()
  expect(host.querySelector('[role="group"][aria-label="单元格"]')).not.toBeNull()
  act(() => command?.click())
  expect(action).toHaveBeenCalledOnce()
  act(() => root.unmount())
})

it('switches named ribbon tabs with click and arrow keys', () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      <CompactToolbar
        tabs={[
          { key: 'home', label: '开始' },
          { key: 'insert', label: '插入' },
        ]}
        sections={[
          {
            key: 'format',
            tab: 'home',
            label: '文字',
            minWidth: 0,
            content: <button>加粗</button>,
          },
          {
            key: 'table',
            tab: 'insert',
            label: '表格',
            minWidth: 1200,
            content: <button>插入表格</button>,
          },
        ]}
      />,
    )
  })
  const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  expect(tabs).toHaveLength(2)
  expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')
  expect(host.textContent).toContain('加粗')
  expect(host.textContent).not.toContain('插入表格')
  const commands = host.querySelector<HTMLElement>('.mimir-compact-toolbar__commands')
  if (!commands) throw new Error('缺少命令滚动区')
  commands.scrollLeft = 180
  act(() => {
    tabs[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  })
  expect(commands.scrollLeft).toBe(0)
  expect(tabs[1]?.getAttribute('aria-selected')).toBe('true')
  expect(document.activeElement).toBe(tabs[1])
  expect(host.textContent).toContain('插入表格')
  expect(host.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(tabs[1]?.id)
  act(() => tabs[0]?.click())
  expect(host.textContent).toContain('加粗')
  act(() => root.unmount())
})

it('keeps quick actions before the scrolling tabs as the active tab changes', () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  host.style.width = '320px'
  document.body.append(host)
  const root = createRoot(host)
  const save = vi.fn<() => void>()
  act(() => {
    root.render(
      <CompactToolbar
        quickAccess={<button onClick={save}>保存</button>}
        tabs={[
          { key: 'home', label: '开始' },
          { key: 'insert', label: '插入' },
        ]}
        sections={[
          { key: 'edit', tab: 'home', label: '编辑', minWidth: 0, content: <button>编辑</button> },
          {
            key: 'table',
            tab: 'insert',
            label: '表格',
            minWidth: 0,
            content: <button>插入表格</button>,
          },
        ]}
      />,
    )
  })

  const row = host.querySelector('.mimir-compact-toolbar__tab-row')
  const actions = host.querySelector('[role="group"][aria-label="快捷操作"]')
  const divider = host.querySelector('.mimir-compact-toolbar__quick-divider')
  const tablist = host.querySelector('[role="tablist"]')
  const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  const button = actions?.querySelector<HTMLButtonElement>('button')
  expect([...row!.children]).toEqual([actions, divider, tablist])
  expect(button).not.toBeNull()
  act(() => button?.focus())
  expect(document.activeElement).toBe(button)
  act(() => tabs[1]?.click())
  expect(host.textContent).toContain('插入表格')
  expect(actions?.contains(button ?? null)).toBe(true)
  expect(document.activeElement).toBe(button)
  act(() => button?.click())
  expect(save).toHaveBeenCalledOnce()
  act(() => root.unmount())
})

it('lets the editor reveal a controlled tab for keyboard shortcuts', () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const onTabChange = vi.fn<(key: string) => void>()
  const render = (activeTab: string) =>
    root.render(
      <CompactToolbar
        tabs={[
          { key: 'home', label: '开始' },
          { key: 'find', label: '查找' },
        ]}
        activeTab={activeTab}
        onTabChange={onTabChange}
        sections={[
          { key: 'edit', tab: 'home', label: '编辑', minWidth: 0, content: <button>编辑</button> },
          {
            key: 'query',
            tab: 'find',
            label: '查找',
            minWidth: 0,
            content: <input data-find-input />,
          },
        ]}
      />,
    )
  act(() => render('home'))
  act(() => host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]?.click())
  expect(onTabChange).toHaveBeenCalledWith('find')
  expect(host.querySelector('[data-find-input]')).toBeNull()
  act(() => render('find'))
  expect(host.querySelector('[data-find-input]')).not.toBeNull()
  act(() => root.unmount())
})

it('omits unavailable and empty command groups', () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      <CompactToolbar
        sections={[
          { key: 'edit', label: '编辑', minWidth: 0, content: <button>编辑</button> },
          {
            key: 'unsupported',
            label: '不支持',
            minWidth: 0,
            enabled: false,
            content: <button>不可用</button>,
          },
          { key: 'unselected', label: '位置与大小', minWidth: 0, content: null },
        ]}
      />,
    )
  })
  expect(host.querySelectorAll('[role="group"]')).toHaveLength(1)
  expect(host.textContent).toContain('编辑')
  expect(host.textContent).not.toContain('不支持')
  expect(host.textContent).not.toContain('位置与大小')
  act(() => root.unmount())
})
