import { describe, expect, it, vi } from 'vitest'
import { markdownAgentCatalog } from '../services/markdown-agent-catalog.js'

vi.mock('../services/docx-image-generation.js', () => ({ docxImageReady: async () => false }))
vi.mock('../services/docx-brave-search.js', () => ({
  braveSearchReady: async () => false,
  braveImageSearch: vi.fn<() => void>(),
}))

describe('Markdown Agent model-facing operation contract', () => {
  it('requires a supported op discriminator and teaches a complete insertContent call', async () => {
    const catalog = await markdownAgentCatalog()
    const apply = catalog.tools.find((tool) => tool.name === 'apply_ops')
    expect(apply).toBeDefined()

    const schema = apply?.inputSchema as {
      properties: {
        ops: {
          minItems: number
          items: {
            required: string[]
            properties: {
              op: { enum: string[] }
              after: unknown
              markdown: unknown
            }
          }
        }
      }
    }
    const operations = schema.properties.ops
    expect(operations.minItems).toBe(1)
    expect(operations.items.required).toContain('op')
    expect(operations.items.properties.op.enum).toEqual([
      'insertContent',
      'replaceBlocks',
      'deleteBlocks',
      'replaceText',
      'setStyle',
      'setLink',
      'setBlockType',
      'toggleList',
      'moveBlocks',
      'duplicateBlocks',
      'insertTable',
      'insertHorizontalRule',
      'insertImage',
      'editTable',
      'setFrontmatter',
    ])
    expect(operations.items.properties.after).toBeDefined()
    expect(operations.items.properties.markdown).toBeDefined()
    expect(apply?.description).toContain(
      '{"ops":[{"op":"insertContent","after":-1,"markdown":"New paragraph"}]}',
    )
    expect(apply?.description).toContain('insertContent {op, after, markdown}')
  })
})
