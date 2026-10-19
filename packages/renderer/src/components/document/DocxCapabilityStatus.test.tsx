import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DocxCapabilityStatus } from './DocxCapabilityStatus'

type StatusProps = Parameters<typeof DocxCapabilityStatus>[0]
function props(overrides: Partial<StatusProps> = {}): StatusProps {
  return {
    modelStatus: 'available',
    loading: false,
    error: false,
    onRetry: () => {},
    onSettings: () => {},
    revisionMode: false,
    onRevisionModeChange: () => {},
    ...overrides,
  }
}
const renderStatus = (overrides: Partial<StatusProps> = {}) =>
  renderToStaticMarkup(createElement(DocxCapabilityStatus, props(overrides)))

describe('DOCX 能力状态', () => {
  it('shows revision behavior and defers model capabilities to the composer without listing tools', () => {
    const html = renderStatus()
    expect(html).toContain('AI 修订')
    expect(html).toContain('编辑会直接更新DOCX原件')
    expect(html).toContain('工具能力以输入框所选模型为准')
    expect(html).not.toContain('工具状态')
    expect(html).not.toContain('尚未配置')
    expect(html).not.toContain('配置模型')
    expect(renderStatus({ revisionMode: true })).toContain('保留待审阅')
  })
  it('only claims no available models when the configured model catalogue is empty', () => {
    const html = renderStatus({ modelStatus: 'empty' })
    expect(html).toContain('尚未配置可用的模型')
    expect(html).toContain('配置模型')
    expect(html).not.toContain('尚未配置支持工具调用')
    expect(renderStatus({ modelStatus: 'loading' })).toContain('正在读取模型列表')
    expect(renderStatus({ modelStatus: 'error' })).toContain('模型列表读取失败，请在输入框重试')
  })
  it('keeps actual canvas and capability-read failures distinct from model catalogue state', () => {
    expect(renderStatus({ error: true })).toContain('读取编辑能力失败')
    expect(renderStatus({ error: true })).toContain('重试检测')
    expect(renderStatus({ loading: true })).toContain('正在检测当前文档能力')
    expect(renderStatus({ loading: true })).toContain('aria-busy="true"')
    const noCanvas = renderStatus({ canvasReady: false, modelStatus: 'available' })
    expect(noCanvas).toContain('原件画布尚未就绪')
    expect(noCanvas).not.toContain('编辑会直接更新')
  })
  it('retains revision, settings and capability retry actions', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onRevisionModeChange = vi.fn<(enabled: boolean) => void>()
    const onSettings = vi.fn<(section: 'models' | 'network-search') => void>()
    const onRetry = vi.fn<() => void>()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    try {
      const callbacks = { onRevisionModeChange, onSettings, onRetry }
      await act(async () =>
        root.render(
          createElement(DocxCapabilityStatus, props({ ...callbacks, modelStatus: 'empty' })),
        ),
      )
      await act(async () => host.querySelector<HTMLElement>('[role="switch"]')!.click())
      expect(onRevisionModeChange.mock.calls[0]?.[0]).toBe(true)
      const settings = [...host.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('配置模型'),
      )!
      await act(async () => settings.click())
      expect(onSettings).toHaveBeenCalledWith('models')
      await act(async () =>
        root.render(createElement(DocxCapabilityStatus, props({ ...callbacks, error: true }))),
      )
      const retry = [...host.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('重试'),
      )!
      await act(async () => retry.click())
      expect(onRetry).toHaveBeenCalledOnce()
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
