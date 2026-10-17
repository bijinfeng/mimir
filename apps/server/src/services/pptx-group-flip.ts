import {
  editGroupChildTransform,
  findGroupChild,
  type OpenedPptx,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import {
  runTxn,
  type Op,
  type TxnResult,
} from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import {
  GuidedError,
  lookup,
  register,
  resolveGroup,
  resolveGroupChildId,
  resolveSlide,
} from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/registry.js'

/** Keep the fixed native transaction's validation, snapshot and journal intact. */
export function runPptxHostTxn(opened: OpenedPptx, ops: Op[]): TxnResult {
  const nativeFlip = lookup('flipElements')
  register({
    ...nativeFlip,
    apply(op, context) {
      const record = nativeFlip.apply(op, context)
      if (!op.group) return record
      const { index, slide } = resolveSlide(context, op)
      const groupId = resolveGroup(op, index, slide.elements)
      for (const ref of op.els as unknown[]) {
        const childId = resolveGroupChildId(slide, groupId, String(ref))
        const child = findGroupChild(slide, groupId, childId)?.child
        // Match native flip's target filtering. Its apply already rejects no matches.
        if (!child?.transform) continue
        const transform = child.transform
        // Native flip already preserved the rotated visual center. Flush that exact
        // model into the parent's child slice before a subsequent structural op.
        if (
          !editGroupChildTransform(
            slide,
            groupId,
            childId,
            transform.offset,
            (transform.rot ?? 0) / 60000,
          )
        )
          throw new GuidedError('op "flipElements": group child XML could not be updated.')
      }
      return record
    },
  })
  try {
    // This entire scope MUST stay synchronous (runTxn and OpDef.apply return
    // plain values). No await/Promise: JS requests cannot interleave while the
    // same-name definition is installed. Restore even if the executor throws.
    // No private name is added to the registry, public vocabulary or records.
    return runTxn(opened, { ops, isolation: 'atomic' })
  } finally {
    register(nativeFlip)
  }
}
