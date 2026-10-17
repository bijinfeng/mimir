import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pdfAssetReadiness } from '../services/pdf-external-assets.js'
import { pdfImageTools } from '../services/pdf-image-catalog.js'
import { pdfAgentAssetPaths } from '../services/pdf-agent-host.js'
import { pdfAgentCatalog } from '../services/pdf-agent-catalog.js'

vi.mock('../services/pdf-agent-host.js', () => ({
  pdfAgentAssetPaths: vi.fn<() => { pdfium: string; harfbuzz: string }>(),
}))

vi.mock('../services/pdf-external-assets.js', () => ({
  pdfAssetReadiness: vi.fn<typeof pdfAssetReadiness>(),
}))
const readiness = vi.mocked(pdfAssetReadiness)

const assetPaths = vi.mocked(pdfAgentAssetPaths)

describe('PDF Agent tool readiness', () => {
  beforeEach(() => {
    readiness.mockResolvedValue({
      image_search: { available: true },
      generate_image: { available: true },
    })
    assetPaths.mockReset()
    assetPaths.mockReturnValue({ pdfium: '/test/pdfium.wasm', harfbuzz: '/test/hb-subset.wasm' })
  })

  it('advertises text insertion when both PDF editing assets are available', async () => {
    const catalog = await pdfAgentCatalog()
    expect(catalog.clientToolNames.has('insert_text')).toBe(true)
    expect(catalog.clientToolNames.has('list_inserted_text')).toBe(true)
    expect(catalog.clientToolNames.has('edit_inserted_text')).toBe(true)
    expect(catalog.clientToolNames.has('move_inserted_text')).toBe(true)
    expect(catalog.clientToolNames.has('delete_inserted_text')).toBe(true)
    expect(catalog.tools.some((tool) => tool.name === 'insert_text')).toBe(true)
    for (const tool of pdfImageTools) {
      expect(catalog.clientToolNames.has(tool.name)).toBe(true)
      expect(catalog.tools.some((entry) => entry.name === tool.name)).toBe(true)
    }
    expect(catalog.unavailableTools).toEqual([])
  })

  it('advertises only strict batch operations with actual annotation and pending text IDs', async () => {
    const batch = (await pdfAgentCatalog()).tools.find((tool) => tool.name === 'apply_ops')!
    const schema = batch.inputSchema as {
      additionalProperties: boolean
      properties: {
        ops: {
          minItems: number
          maxItems: number
          items: {
            oneOf: Array<{
              additionalProperties: boolean
              properties: Record<string, { const?: string; additionalProperties?: boolean }>
            }>
          }
        }
      }
    }
    expect(schema.additionalProperties).toBe(false)
    expect(schema.properties.ops).toMatchObject({ minItems: 1, maxItems: 30 })
    const operations = schema.properties.ops.items.oneOf
    expect(operations.map((op) => op.properties.op!.const)).toEqual([
      'removeMarkup',
      'setNoteContents',
      'removeTextInsert',
      'setMetadata',
      'setFormValue',
      'rotatePages',
      'deletePage',
      'setPageOrder',
    ])
    for (const op of operations) expect(op.additionalProperties).toBe(false)
    expect(
      operations.find((op) => op.properties.op!.const === 'setFormValue')!.properties.value!
        .additionalProperties,
    ).toBe(false)
  })

  it('keeps page tools but withholds text insertion when assets are missing', async () => {
    assetPaths.mockImplementation(() => {
      throw new Error('missing asset')
    })
    const catalog = await pdfAgentCatalog()
    expect(catalog.clientToolNames.has('insert_text')).toBe(false)
    for (const tool of pdfImageTools) expect(catalog.clientToolNames.has(tool.name)).toBe(false)
    expect(catalog.tools.some((tool) => tool.name === 'insert_text')).toBe(false)
    expect(catalog.clientToolNames.has('apply_ops')).toBe(true)
    expect(catalog.unavailableTools).toEqual(
      [
        ...pdfImageTools.map((tool) => tool.name),
        'list_text_blocks',
        'move_text_block',
        'edit_block',
        'edit_text',
        'markup_text',
        'read_annotations',
        'add_note',
        'reply_note',
        'edit_note',
        'delete_note',
        'delete_markup',
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
  it('gates search/generation independently with strict upstream arguments and unavailable reasons', async () => {
    readiness.mockResolvedValue({
      image_search: { available: false, reason: 'Brave设置不可用' },
      generate_image: { available: true },
    })
    const catalog = await pdfAgentCatalog()
    expect(catalog.clientToolNames.has('image_search')).toBe(false)
    expect(catalog.clientToolNames.has('generate_image')).toBe(true)
    expect(catalog.tools.find((tool) => tool.name === 'generate_image')?.inputSchema).toMatchObject(
      {
        additionalProperties: false,
        properties: {
          aspect_ratio: { enum: ['1:1', '4:3', '16:9', '9:16', '3:4', '2:3', '3:2', 'auto'] },
        },
      },
    )
    expect(catalog.unavailableTools).toContainEqual({
      name: 'image_search',
      reason: 'Brave设置不可用',
    })
    readiness.mockResolvedValue({
      image_search: { available: true },
      generate_image: { available: false, reason: '图片模型设置不可用' },
    })
    const search = await pdfAgentCatalog()
    expect(search.clientToolNames.has('generate_image')).toBe(false)
    expect(search.tools.find((tool) => tool.name === 'image_search')?.inputSchema).toMatchObject({
      additionalProperties: false,
      properties: { max_results: { minimum: 1, maximum: 10, default: 8 } },
    })
  })
})
