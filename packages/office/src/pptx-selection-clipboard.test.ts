import { expect, it } from 'vitest'
import { pptxManualAssetSchema } from '@mimir/shared'
import {
  elementDurableId,
  groupChildDurableId,
} from '../vendor/packages/pptx-engine/src/identity.js'
import { selectionFixture } from './editors/pptx-selection-test-fixture.js'
import { pptxClipboardTargets, resolvePptxClipboardTargets } from './pptx-selection-clipboard.js'

it('keeps a whole group intact and gives direct members their explicit parent without replacing the first alias', async () => {
  const { elements } = await selectionFixture()
  const group = elements.find((item) => item.type === 'group')!
  if (group.type !== 'group') throw new Error('Expected group')
  const top = elements.find((item) => item !== group)!
  expect(pptxClipboardTargets(elements, [group.id, top.id])).toEqual([
    { elementId: group.id },
    { elementId: top.id },
  ])
  const member = group.children[0]!
  expect(pptxClipboardTargets(elements, [member.id])).toEqual([
    { elementId: member.id, group: elementDurableId(group) },
  ])
  expect(
    resolvePptxClipboardTargets(elements, [
      { elementId: groupChildDurableId(group, member)!, group: group.id },
    ])[0],
  ).toMatchObject({ element: member, parent: group })
})

it('rejects stale, wrong-parent, duplicate aliases and ancestor overlap as complete requests', async () => {
  const { elements } = await selectionFixture()
  const group = elements.find((item) => item.type === 'group')!
  if (group.type !== 'group') throw new Error('Expected group')
  const child = group.children[0]!
  for (const targets of [
    [{ elementId: group.id }, { elementId: 'missing' }],
    [{ elementId: child.id }],
    [{ elementId: child.id, group: 'missing' }],
    [{ elementId: group.id }, { elementId: elementDurableId(group)! }],
    [
      { elementId: child.id, group: group.id },
      { elementId: groupChildDurableId(group, child)!, group: group.id },
    ],
    [{ elementId: group.id }, { elementId: child.id, group: group.id }],
    [],
    Array.from({ length: 101 }, () => ({ elementId: group.id })),
  ])
    expect(() => resolvePptxClipboardTargets(elements, targets)).toThrow(/失效|重复|组合|请选择/)
  expect(() => pptxClipboardTargets(elements, [child.id, 'missing'])).toThrow('失效')
  const nested = structuredClone(group)
  nested.id = 'nested'
  group.children.push(nested)
  expect(() =>
    resolvePptxClipboardTargets(elements, [{ elementId: 'nested', group: group.id }]),
  ).toThrow('深层')
})

it('accepts exactly one bounded server target representation and rejects client XML', () => {
  const base = { kind: 'copy_elements', slide: 0 }
  expect(pptxManualAssetSchema.safeParse({ ...base, elementIds: ['a'] }).success).toBe(true)
  expect(
    pptxManualAssetSchema.safeParse({ ...base, targets: [{ elementId: 'a', group: 'g' }] }).success,
  ).toBe(true)
  for (const input of [
    base,
    { ...base, elementIds: ['a'], targets: [{ elementId: 'a' }] },
    { ...base, targets: [] },
    { ...base, targets: Array.from({ length: 101 }, () => ({ elementId: 'a' })) },
    { ...base, targets: [{ elementId: 'a', xml: '<p:sp/>' }] },
  ])
    expect(pptxManualAssetSchema.safeParse(input).success).toBe(false)
})
