import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DOCX_ALL_TOOLS } from '@mimir/shared'
import { DocxCapabilityStatus } from './DocxCapabilityStatus'

describe('DOCX 能力状态', () => {
  it('完整工具集在状态列表中使用中文名称', () => {
    const html = renderToStaticMarkup(
      createElement(DocxCapabilityStatus, {
        capabilities: {
          documentId: 'd1',
          modelReady: true,
          availableTools: DOCX_ALL_TOOLS.map((tool) => tool.name),
          unavailableTools: [],
        },
        loading: false,
        error: false,
        onRetry: () => {},
        onSettings: () => {},
        revisionMode: false,
        onRevisionModeChange: () => {},
      }),
    )
    for (const tool of DOCX_ALL_TOOLS) expect(html).not.toContain(`>${tool.name}<`)
    expect(html).toContain('撰写文档')
    expect(html).toContain('插入图表')
  })

  it('只展示服务端实际开放的工具，并解释不可用搜索', () => {
    const html = renderToStaticMarkup(
      createElement(DocxCapabilityStatus, {
        capabilities: {
          documentId: 'd1',
          modelReady: true,
          availableTools: ['get_document_context', 'replace_selection'],
          unavailableTools: [{ name: 'web_search', reason: '请配置 Brave Search API 密钥' }],
        },
        loading: false,
        error: false,
        onRetry: () => {},
        onSettings: () => {},
        revisionMode: false,
        onRevisionModeChange: () => {},
      }),
    )
    expect(html).toContain('当前已开放 2 项工具')
    expect(html).toContain('读取当前文档')
    expect(html).toContain('替换选区')
    expect(html).toContain('网页搜索：请配置 Brave Search API 密钥')
    expect(html).toContain('网络搜索设置')
    expect(html).not.toContain('模型设置')
    expect(html).not.toContain('生成图片')
  })

  it('模型不可用时不把工具显示为可用', () => {
    const html = renderToStaticMarkup(
      createElement(DocxCapabilityStatus, {
        capabilities: {
          documentId: 'd1',
          modelReady: false,
          availableTools: [],
          unavailableTools: [
            { name: 'read_blocks', reason: '请先配置可用的聊天模型' },
            { name: 'web_search', reason: '请先配置可用的聊天模型' },
          ],
        },
        loading: false,
        error: false,
        onRetry: () => {},
        onSettings: () => {},
        revisionMode: false,
        onRevisionModeChange: () => {},
      }),
    )
    expect(html).toContain('聊天模型未就绪')
    expect(html).toContain('读取段落：请先配置可用的聊天模型')
    expect(html).toContain('模型设置')
    expect(html).not.toContain('网络搜索设置')
    expect(html).not.toContain('当前已开放')
  })

  it('媒体已配置时说明模型输入模态尚未实测', () => {
    const html = renderToStaticMarkup(
      createElement(DocxCapabilityStatus, {
        capabilities: {
          documentId: 'd1',
          modelReady: true,
          mediaKinds: ['image', 'video'],
          availableTools: ['analyze_media'],
          unavailableTools: [],
        },
        loading: false,
        error: false,
        onRetry: () => {},
        onSettings: () => {},
        revisionMode: false,
        onRevisionModeChange: () => {},
      }),
    )
    expect(html).toContain('媒体服务已配置')
    expect(html).toContain('模型的图片、音频或视频输入能力尚未实测')
  })

  it('图片生成和媒体分析缺失时指向通用模型设置', () => {
    const html = renderToStaticMarkup(
      createElement(DocxCapabilityStatus, {
        capabilities: {
          documentId: 'd1',
          modelReady: true,
          availableTools: ['read_blocks'],
          unavailableTools: [
            { name: 'generate_image', reason: '请配置图片生成服务' },
            { name: 'analyze_media', reason: '请配置视觉或转录服务' },
          ],
        },
        loading: false,
        error: false,
        onRetry: () => {},
        onSettings: () => {},
        revisionMode: false,
        onRevisionModeChange: () => {},
      }),
    )
    expect(html).toContain('模型设置')
    expect(html).not.toContain('网络搜索设置')
  })
})
