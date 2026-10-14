import type { DocxAgentCapabilities } from '@mimir/shared'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DocxCapabilityStatus } from './DocxCapabilityStatus'

function renderStatus({
  capabilities,
  loading = false,
  error = false,
}: {
  capabilities?: DocxAgentCapabilities
  loading?: boolean
  error?: boolean
}) {
  return renderToStaticMarkup(
    createElement(DocxCapabilityStatus, {
      capabilities,
      loading,
      error,
      onRetry: () => {},
      onSettings: () => {},
      revisionMode: false,
      onRevisionModeChange: () => {},
    }),
  )
}

describe('DOCX 能力状态', () => {
  it('模型就绪时仅显示 AI 修订，不展示工具清单或配置说明', () => {
    const html = renderStatus({
      capabilities: {
        documentId: 'd1',
        modelReady: true,
        mediaKinds: ['image', 'video'],
        availableTools: ['get_document_context', 'replace_selection'],
        unavailableTools: [{ name: 'web_search', reason: '请配置 Brave Search API 密钥' }],
      },
    })
    expect(html).toContain('AI 修订')
    expect(html).not.toContain('工具状态')
    expect(html).not.toContain('已开放')
    expect(html).not.toContain('不可用')
    expect(html).not.toContain('网页搜索')
    expect(html).not.toContain('网络搜索设置')
    expect(html).not.toContain('模型设置')
    expect(html).not.toContain('媒体服务已配置')
  })

  it('模型不可用时保留可操作的设置入口', () => {
    const html = renderStatus({
      capabilities: {
        documentId: 'd1',
        modelReady: false,
        availableTools: [],
        unavailableTools: [{ name: 'read_blocks', reason: '请先配置可用的聊天模型' }],
      },
    })
    expect(html).toContain('需要聊天模型')
    expect(html).toContain('模型设置')
    expect(html).not.toContain('读取段落')
    expect(html).not.toContain('工具状态')
  })

  it('读取失败时保留重试入口；加载中不显示说明文案', () => {
    const failed = renderStatus({ error: true })
    expect(failed).toContain('能力状态读取失败')
    expect(failed).toContain('重试')

    const loading = renderStatus({ loading: true })
    expect(loading).toContain('AI 修订')
    expect(loading).not.toContain('读取中')
    expect(loading).not.toContain('工具状态')
  })

  it('修订开关、模型设置和读取失败重试仍可操作', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onRevisionModeChange = vi.fn<(enabled: boolean) => void>()
    const onSettings = vi.fn<(section: 'models' | 'network-search') => void>()
    const onRetry = vi.fn<() => void>()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    const render = async (error: boolean) => {
      await act(async () => {
        root.render(
          createElement(DocxCapabilityStatus, {
            capabilities: {
              documentId: 'd1',
              modelReady: false,
              availableTools: [],
              unavailableTools: [],
            },
            loading: false,
            error,
            onRetry,
            onSettings,
            revisionMode: false,
            onRevisionModeChange,
          }),
        )
      })
    }

    try {
      await render(false)
      await act(async () => host.querySelector<HTMLElement>('[role="switch"]')!.click())
      expect(onRevisionModeChange.mock.calls[0]?.[0]).toBe(true)

      const settings = Array.from(host.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('模型设置'),
      )
      await act(async () => settings!.click())
      expect(onSettings).toHaveBeenCalledWith('models')

      await render(true)
      const retry = Array.from(host.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('重试'),
      )
      await act(async () => retry!.click())
      expect(onRetry).toHaveBeenCalledOnce()
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
