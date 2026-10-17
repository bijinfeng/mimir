import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state'
import { Mapping, ReplaceStep } from '@tiptap/pm/transform'
import type { Node as PmNode } from '@tiptap/pm/model'
import { TRACK_IGNORE } from '../../vendor/apps/docs/src/renderer/editor/revisions.js'
import type { DocxProtectionController } from '../docx-protection.js'
import { FORCED_TRACKING_REASON } from '../docx-forced-tracking.js'
import { inlineToRuns } from '../../vendor/apps/docs/src/renderer/editor/convert.js'
import { mergeRPrModel } from '../../vendor/packages/docx-engine/src/generate.js'

/** No IME deferral: an accepted edit and its revision publish in one applyTransaction. */
export function forcedTrackingPlugin(
  editor: Editor,
  controller: DocxProtectionController,
  onBlocked: (reason: string) => void,
) {
  const inputs = new WeakSet<Transaction>()
  const generated = new WeakSet<Transaction>()
  const sync = () => {
    if (controller.getAccess().mandatoryTracking && editor.storage.trackChanges)
      editor.storage.trackChanges.enabled = true
  }
  const refuse = (cause?: unknown) => {
    onBlocked(cause instanceof Error ? cause.message : FORCED_TRACKING_REASON)
    return false
  }
  return new Plugin({
    key: new PluginKey('mimirForcedTracking'),
    filterTransaction(tr) {
      sync()
      const policy = controller.trackingPolicy()
      if (!policy || !tr.docChanged) return true
      if (tr.doc.eq(tr.before)) return false
      if (tr.doc.attrs.mimirProtectionState !== tr.before.attrs.mimirProtectionState) return true // The settings controller validates this separate atomic transition.
      if (generated.has(tr)) return true
      if (tr.getMeta('history$') || policy.isRestoring(tr.doc.toJSON())) {
        if (!policy.known(tr.doc.toJSON())) return refuse()
        try {
          policy.assertDocument(tr.doc.toJSON())
          return true
        } catch (cause) {
          return refuse(cause)
        }
      }
      if (tr.getMeta(TRACK_IGNORE) || tr.steps.length === 0) return refuse()
      let touched: { from: number; to: number }[] = []
      let onlyExistingDeletions = true
      for (const [i, step] of tr.steps.entries()) {
        if (!(step instanceof ReplaceStep) || step.slice.openStart || step.slice.openEnd)
          return refuse()
        if (
          touched.some((range) =>
            range.from === range.to
              ? step.from <= range.to && step.to >= range.from
              : step.from < range.to && step.to > range.from,
          )
        )
          return refuse(new Error('强制修订不支持同一次操作内重叠的文字修改，请拆分操作'))
        touched = touched.map((range) => ({
          from: step.getMap().map(range.from, 1),
          to: step.getMap().map(range.to, -1),
        }))
        touched.push({ from: step.from, to: step.from + step.slice.size })
        const doc = tr.docs[i]!,
          from = doc.resolve(step.from),
          to = doc.resolve(step.to)
        if (
          !from.sameParent(to) ||
          from.depth !== 1 ||
          !['docParagraph', 'docHeading', 'docListItem'].includes(from.parent.type.name)
        )
          return refuse()
        if (!policy.canEditParagraph(from.parent.toJSON()))
          return refuse(
            new Error('此原生段落含未支持的格式、对象或扩展；强制修订下只读保留，请先停止编辑限制'),
          )
        let textOnly = true
        from.parent.content.forEach((node) => {
          if (!node.isText) textOnly = false
        })
        step.slice.content.forEach((node) => {
          if (
            !node.isText ||
            node.marks.some(
              (mark) =>
                !['bold', 'italic', 'underline', 'strike', 'docTextStyle', 'ins', 'del'].includes(
                  mark.type.name,
                ),
            )
          )
            textOnly = false
        })
        if (!textOnly || from.parent.attrs.blockRevision || from.parent.attrs.moveRevision)
          return refuse()
        if (step.slice.size || step.from === step.to) onlyExistingDeletions = false
        doc.slice(step.from, step.to).content.forEach((node) => {
          if (!node.marks.some((mark) => mark.type.name === 'del')) onlyExistingDeletions = false
        })
      }
      if (onlyExistingDeletions) return false
      try {
        policy.assertDocument(tr.before.toJSON())
      } catch (cause) {
        return refuse(cause)
      }
      inputs.add(tr)
      tr.setMeta(TRACK_IGNORE, true)
      return true
    },
    appendTransaction(transactions, old, state) {
      sync()
      const policy = controller.trackingPolicy()
      if (!policy) return null
      const pending = transactions.filter((tr) => inputs.has(tr))
      if (!pending.length) return null
      const steps = pending.flatMap((tr) =>
        tr.steps.map((step, i) => ({ step: step as ReplaceStep, before: tr.docs[i]! })),
      )
      const mapping = new Mapping(steps.map(({ step }) => step.getMap()))
      const tr = state.tr.setMeta(TRACK_IGNORE, true)
      for (const [{ step, before }, i] of steps.map((value, index) => [value, index] as const)) {
        const author = editor.storage.trackChanges?.author ?? '当前用户'
        const ins = state.schema.marks.ins!.create(policy.revision(author)),
          del = state.schema.marks.del!.create(policy.revision(author))
        const tail = mapping.slice(i + 1)
        if (step.slice.size) {
          const from = tr.mapping.map(tail.map(step.from, 1), 1)
          const to = tr.mapping.map(tail.map(step.from + step.slice.size, -1), -1)
          if (from < to) {
            tr.removeMark(from, to, state.schema.marks.ins)
            tr.removeMark(from, to, state.schema.marks.del)
            tr.addMark(from, to, ins)
            // Fresh styled runs acquire a raw rPr representation on native readback.
            // Publish that exact vendor-generated representation with the new text.
            tr.doc.nodesBetween(from, to, (node, pos) => {
              if (!node.isText) return
              const run = inlineToRuns([node.toJSON()])[0]!
              if (run.rawRPr) return
              const rawRPr = mergeRPrModel('<w:rPr></w:rPr>', run, false)
              if (!rawRPr) return
              const style = node.marks.find((mark) => mark.type.name === 'docTextStyle')
              tr.addMark(
                Math.max(from, pos),
                Math.min(to, pos + node.nodeSize),
                state.schema.marks.docTextStyle!.create({ ...style?.attrs, rawRPr }),
              )
            })
          }
        }
        if (step.to > step.from) {
          const keep: PmNode[] = []
          before.slice(step.from, step.to).content.forEach((node) => {
            if (!policy.ownInsertion(node.toJSON()))
              keep.push(
                node.marks.some((mark) => mark.type.name === 'del')
                  ? node
                  : node.mark(del.addToSet(node.marks)),
              )
          })
          let at = tr.mapping.map(tail.map(step.from + step.slice.size, -1), -1)
          const start = at
          for (const node of keep) {
            tr.insert(at, node)
            at += node.nodeSize
          }
          if (keep.length && state.selection.empty && tr.mapping.map(state.selection.from) === at) {
            const forward =
              steps.length === 1 &&
              !step.slice.size &&
              old.selection.empty &&
              old.selection.from === step.from
            tr.setSelection(TextSelection.create(tr.doc, forward ? at : start))
          }
        }
      }
      policy.assertDocument(tr.doc.toJSON())
      policy.remember(tr.doc.toJSON())
      generated.add(tr)
      return tr.docChanged ? tr : null
    },
    view() {
      sync()
      const unsubscribe = controller.subscribe(sync)
      return { update: sync, destroy: unsubscribe }
    },
  })
}
