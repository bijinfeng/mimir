import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pdfAgentAssetPaths } from '../services/pdf-agent-host.js'
import { pdfAgentCatalog } from '../services/pdf-agent-catalog.js'

vi.mock('../services/pdf-agent-host.js', () => ({
  pdfAgentAssetPaths: vi.fn<() => { pdfium: string; harfbuzz: string }>(),
}))

const assetPaths = vi.mocked(pdfAgentAssetPaths)

describe('PDF Agent tool readiness', () => {
  beforeEach(() => {
    assetPaths.mockReset()
    assetPaths.mockReturnValue({ pdfium: '/test/pdfium.wasm', harfbuzz: '/test/hb-subset.wasm' })
  })

  it('advertises text insertion when both PDF editing assets are available', () => {
    const catalog = pdfAgentCatalog()
    expect(catalog.clientToolNames.has('insert_text')).toBe(true)
    expect(catalog.clientToolNames.has('list_inserted_text')).toBe(true)
    expect(catalog.clientToolNames.has('edit_inserted_text')).toBe(true)
    expect(catalog.clientToolNames.has('move_inserted_text')).toBe(true)
    expect(catalog.clientToolNames.has('delete_inserted_text')).toBe(true)
    expect(catalog.tools.some((tool) => tool.name === 'insert_text')).toBe(true)
    expect(catalog.unavailableTools).toEqual([])
  })

  it('keeps page tools but withholds text insertion when assets are missing', () => {
    assetPaths.mockImplementation(() => {
      throw new Error('missing asset')
    })
    const catalog = pdfAgentCatalog()
    expect(catalog.clientToolNames.has('insert_text')).toBe(false)
    expect(catalog.tools.some((tool) => tool.name === 'insert_text')).toBe(false)
    expect(catalog.clientToolNames.has('apply_ops')).toBe(true)
    expect(catalog.unavailableTools).toEqual(
      [
        'insert_text',
        'list_inserted_text',
        'edit_inserted_text',
        'move_inserted_text',
        'delete_inserted_text',
      ].map((name) => ({
        name,
        reason: 'PDF 编辑资源缺失：PDFium 或 HarfBuzz WASM 未打包',
      })),
    )
  })
})
