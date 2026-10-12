import { DOCX_AGENT_OP_NAMES, DOCX_AGENT_TOOL_NAMES } from '@mimir/office'
import { DOCX_ALL_TOOLS, DOCX_OFFICE_TOOLS } from '@mimir/shared'
import { describe, expect, it } from 'vitest'

describe('DOCX agent cross-package tool catalog', () => {
  it('advertises every Office tool once under the pinned upstream name', () => {
    const advertised = DOCX_ALL_TOOLS.map((tool) => tool.name)
    expect(advertised).toHaveLength(36)
    expect(new Set(advertised).size).toBe(36)
    expect(advertised.toSorted()).toEqual([...DOCX_AGENT_TOOL_NAMES].toSorted())
  })

  it('keeps all apply_ops names in the model schema and Office executor', () => {
    const applyOps = DOCX_OFFICE_TOOLS.find((tool) => tool.name === 'apply_ops')
    expect(applyOps).toBeDefined()
    const op = applyOps?.inputSchema.properties.ops.items.properties.op
    if (!op) throw new Error('apply_ops schema is missing the op property')
    expect(op.enum).toHaveLength(15)
    expect(op.enum).toEqual(DOCX_AGENT_OP_NAMES)
  })
})
