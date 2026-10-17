/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { CompactToolbar } from './CompactToolbar.js'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

it('keeps commands directly available before layout measurements are available', () => {
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

it('collapses right groups into named menus according to actual editor width without duplicating commands', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  let width = 300
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.classList.contains('mimir-compact-toolbar__commands'))
      return DOMRect.fromRect({ width, height: 56 })
    if (this.dataset.sectionKey)
      return DOMRect.fromRect({ width: this.hasAttribute('data-collapsed') ? 72 : 150, height: 56 })
    return DOMRect.fromRect({ width: 100, height: 32 })
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host),
    action = vi.fn<() => void>()
  const render = () =>
    root.render(
      <CompactToolbar
        sections={[
          { key: 'font', label: '字体', minWidth: 0, content: <button>字体命令</button> },
          { key: 'paragraph', label: '段落', minWidth: 0, content: <button>段落命令</button> },
          {
            key: 'format',
            label: '文字格式',
            minWidth: 0,
            content: <button onClick={action}>清除格式</button>,
          },
        ]}
      />,
    )
  act(render)
  expect(host.querySelector('[data-section-key=font]')?.hasAttribute('data-collapsed')).toBe(false)
  expect(host.querySelectorAll('[data-collapsed]')).toHaveLength(2)
  expect(host.querySelector('button[aria-label="更多工具"]')).toBeNull()
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="文字格式"]')!.click())
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)))
  const commands = Array.from(host.querySelectorAll('button')).filter(
    (button) => button.textContent === '清除格式',
  )
  expect(commands).toHaveLength(1)
  act(() => commands[0]!.click())
  expect(action).toHaveBeenCalledOnce()
  width = 600
  act(render)
  expect(host.querySelectorAll('[data-collapsed]')).toHaveLength(0)
  expect(
    Array.from(host.querySelectorAll('button')).filter(
      (button) => button.textContent === '清除格式',
    ),
  ).toHaveLength(1)
  act(() => root.unmount())
})

it('reveals a collapsed find group and focuses its only input for Cmd+F', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return DOMRect.fromRect({
      width: this.classList.contains('mimir-compact-toolbar__commands') ? 160 : 200,
      height: 56,
    })
  })
  const host = document.createElement('div')
  // Hidden/embedded browsers may never run animation-frame callbacks.
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 1)
  document.body.append(host)
  const root = createRoot(host)
  act(() =>
    root.render(
      <CompactToolbar
        sections={[
          { key: 'font', label: '字体', minWidth: 0, content: <button>字体命令</button> },
          {
            key: 'query',
            label: '查找与替换',
            minWidth: 0,
            content: <input data-find-input aria-label="查找文字" />,
          },
        ]}
      />,
    ),
  )
  expect(host.querySelector('input')).toBeNull()
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
  const input = host.querySelector('input')
  expect(input).not.toBeNull()
  // Deferred focus follows menu mounting without depending on a frame.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 40)))
  expect(document.activeElement).toBe(input)
  act(() => root.unmount())
})

it('keeps named groups readable and limits overflow to the command row when all seven groups cannot fit at the minimum touch width', () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  let width = 280
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return DOMRect.fromRect({
      width: this.classList.contains('mimir-compact-toolbar__commands') ? width : 150,
      height: 56,
    })
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const labels = ['图片', '图表', '音视频', '动态字段', '形状库', '公式', '导入']
  const render = () =>
    root.render(
      <CompactToolbar
        sections={labels.map((label, index) => ({
          key: String(index),
          label,
          minWidth: 150,
          content: <button>{label}命令</button>,
        }))}
      />,
    )
  act(render)
  expect(host.querySelectorAll('[data-collapsed]')).toHaveLength(7)
  expect(
    host.querySelector('.mimir-compact-toolbar__commands')?.hasAttribute('data-overflow'),
  ).toBe(true)
  expect(
    [...host.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]')].map((button) =>
      button.getAttribute('aria-label'),
    ),
  ).toEqual(labels)
  const commands = host.querySelector<HTMLElement>('.mimir-compact-toolbar__commands')!
  commands.scrollLeft = 120
  act(render)
  expect(commands.scrollLeft).toBe(120)
  width = 1100
  act(render)
  expect(host.querySelector('[data-overflow]')).toBeNull()
  expect(host.querySelector('[data-collapsed]')).toBeNull()
  act(() => root.unmount())
})

it.each([338, 390, 432])(
  'keeps six groups readable in a %ipx column with accurate overflow and the last command usable',
  async (width) => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return DOMRect.fromRect({
        width: this.classList.contains('mimir-compact-toolbar__commands') ? width : 150,
        height: 56,
      })
    })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const action = vi.fn<() => void>()
    const labels = ['字体', '文字格式', '段落样式', '对齐', '列表', '缩进']
    act(() =>
      root.render(
        <CompactToolbar
          sections={labels.map((label) => ({
            key: label,
            label,
            minWidth: 150,
            content: <button onClick={action}>{label}命令</button>,
          }))}
        />,
      ),
    )
    const commands = host.querySelector<HTMLElement>('.mimir-compact-toolbar__commands')!
    const collapsedWidth = Number.parseInt(commands.style.getPropertyValue('--compact-group-width'))
    expect(collapsedWidth).toBe(72)
    expect(collapsedWidth * labels.length).toBeGreaterThanOrEqual(width)
    expect(commands.hasAttribute('data-overflow')).toBe(collapsedWidth * labels.length > width)
    expect(host.querySelectorAll('[data-collapsed]')).toHaveLength(6)
    expect(
      [...commands.querySelectorAll('button[aria-haspopup="menu"]')].map((button) =>
        button.getAttribute('aria-label'),
      ),
    ).toEqual(labels)
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="缩进"]')!
    act(() => trigger.click())
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)))
    const lastCommand = [...host.querySelectorAll<HTMLButtonElement>('button')].filter(
      (button) => button.textContent === '缩进命令',
    )
    expect(lastCommand).toHaveLength(1)
    act(() => lastCommand[0]!.click())
    expect(action).toHaveBeenCalledOnce()
    act(() =>
      lastCommand[0]!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      ),
    )
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
    act(() => root.unmount())
  },
)
