import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validatePptxGlb } from './pptx-glb.js'
const fixture = () =>
  new Uint8Array(readFileSync(new URL('../tests/fixtures/local-tetrahedron.glb', import.meta.url)))
function withModel(change: (model: Record<string, unknown>) => void) {
  const bytes = fixture(),
    view = new DataView(bytes.buffer),
    length = view.getUint32(12, true)
  const model = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as Record<
    string,
    unknown
  >
  change(model)
  const encoded = new TextEncoder().encode(JSON.stringify(model))
  const padded = Math.ceil(encoded.length / 4) * 4
  const out = new Uint8Array(20 + padded + bytes.length - 20 - length)
  out.set(bytes.subarray(0, 12))
  const header = new DataView(out.buffer)
  header.setUint32(8, out.length, true)
  header.setUint32(12, padded, true)
  header.setUint32(16, 0x4e4f534a, true)
  out.fill(32, 20, 20 + padded)
  out.set(encoded, 20)
  out.set(bytes.subarray(20 + length), 20 + padded)
  return out
}
describe('self-contained GLB model validation', () => {
  it('accepts an actual indexed tetrahedron and rejects truncated, external and decoder-based models', () => {
    expect(() => validatePptxGlb(fixture())).not.toThrow()
    expect(() => validatePptxGlb(fixture().subarray(0, 40))).toThrow('有效')
    expect(() =>
      validatePptxGlb(
        withModel((m) => {
          m.images = [{ uri: 'https://example.com/a.png' }]
        }),
      ),
    ).toThrow('自包含')
    expect(() =>
      validatePptxGlb(
        withModel((m) => {
          m.extensionsUsed = ['KHR_draco_mesh_compression']
        }),
      ),
    ).toThrow('解码器')
  })
  it('bounds malformed lists, missing binary data and large sparse accessor allocations', () => {
    expect(() =>
      validatePptxGlb(
        withModel((m) => {
          m.extensionsRequired = {}
        }),
      ),
    ).toThrow('列表')
    expect(() =>
      validatePptxGlb(
        withModel((m) => {
          m.buffers = [{ byteLength: 1000000 }]
        }),
      ),
    ).toThrow('二进制')
    expect(() =>
      validatePptxGlb(
        withModel((m) => {
          m.accessors = [{ count: 100000000, type: 'MAT4' }]
        }),
      ),
    ).toThrow('超出')
  })
})
