import { DOCX_ENCRYPTION_ATTR } from '../docx-encryption-state.js'
import { DOCX_PRIVACY_ATTR } from '../docx-privacy-state.js'
import { Extension } from '@tiptap/core'
import { forcedTrackingPlugin } from './docx-forced-tracking.js'
import { FORCED_TRACKING_REASON } from '../docx-forced-tracking.js'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import './docx-protection.css'
import { toggleProtectedForm } from './docx-form-controls.js'
import type { DocxProtectionController } from '../docx-protection.js'

/** Local guard: NodeView DOM listeners run before PM handleDOMEvents. */
export const DocxProtectionExtension = Extension.create<{
  controller: DocxProtectionController | null
  onBlocked: (reason: string) => void
}>({
  name: 'mimirNativeProtection',
  priority: 10_000,
  addOptions: () => ({ controller: null, onBlocked: () => {} }),
  addGlobalAttributes() {
    return [
      { types: ['doc'], attributes: { mimirProtectionState: { default: null, rendered: false } } },
    ]
  },
  addProseMirrorPlugins() {
    const { controller, onBlocked } = this.options
    if (!controller) return []
    // PM can recreate plugin views while keeping the same NodeView DOM. Keep
    // originals for the plugin lifetime, not for each individual view instance.
    const buttons = new WeakMap<HTMLButtonElement, { disabled: boolean; title: string }>()
    const textboxes = new WeakMap<HTMLElement, string | null>()
    const formTitles = new WeakMap<HTMLElement, string | null>()
    let applying = false
    const blocked = () => {
      const access = controller.getAccess()
      if (access.writable) return false
      onBlocked(access.reason ?? '原件受保护，不能修改')
      return true
    }
    return [
      forcedTrackingPlugin(this.editor, controller, onBlocked),
      new Plugin({
        key: new PluginKey('mimirNativeProtection'),
        state: {
          init: () => null,
          apply: (tr) => {
            applying = true
            try {
              if (tr.docChanged) controller.activateSettingsDocument(tr.doc.toJSON())
            } finally {
              applying = false
            }
            return null
          },
        },
        filterTransaction: (tr, state) => {
          if (!tr.docChanged) return true
          if (tr.doc.attrs[DOCX_ENCRYPTION_ATTR] !== state.doc.attrs[DOCX_ENCRYPTION_ATTR]) {
            const access = controller.getAccess()
            if (!access.writable || access.mandatoryTracking) {
              onBlocked(access.reason ?? '原件编辑限制不允许更改打开密码')
              return false
            }
          }
          if (tr.doc.attrs[DOCX_PRIVACY_ATTR] !== state.doc.attrs[DOCX_PRIVACY_ATTR]) {
            const access = controller.getAccess()
            if (!access.writable || access.mandatoryTracking) {
              onBlocked(access.reason ?? '原件编辑限制不允许更改个人信息设置')
              return false
            }
          }
          if (tr.doc.attrs.mimirProtectionState !== state.doc.attrs.mimirProtectionState)
            return controller.allowsSettingsTransaction(state.doc.toJSON(), tr.doc.toJSON())
          return (
            controller.allowsCommentTransaction(tr.doc.toJSON()) ||
            controller.allowsFormTransaction(tr.doc.toJSON()) ||
            !blocked()
          )
        },
        props: {
          editable: () => controller.getAccess().writable,
          // Vendor resize/floating-drag plugins preview directly in the DOM before
          // dispatching a transaction. Stop their handlers while keeping native
          // text selection (no preventDefault on ordinary mousedown) available.
          handleDOMEvents: { mousedown: () => !controller.getAccess().writable },
        },
        view: (view) => {
          const syncReadOnlyControls = () => {
            const access = controller.getAccess()
            const controls = access.formsOnly
              ? controller.readFormControls(view.state.doc.toJSON())
              : []
            for (const span of view.dom.querySelectorAll<HTMLElement>(
              '.doc-checkbox-control, [data-instr-field="FORMCHECKBOX"]',
            )) {
              if (!access.formsOnly) {
                delete span.dataset.mimirNativeForm
                if (formTitles.has(span)) {
                  const title = formTitles.get(span)
                  if (title === null || title === undefined) span.removeAttribute('title')
                  else span.setAttribute('title', title)
                  formTitles.delete(span)
                }
                continue
              }
              if (!formTitles.has(span)) formTitles.set(span, span.getAttribute('title'))
              const from = view.posAtDOM(span, 0),
                to = from + (span.textContent?.length ?? 0)
              const matches = controls.filter(
                (c) => c.from !== null && c.to !== null && c.from < to && c.to > from,
              )
              const allowed = matches.length > 0 && matches.every((c) => c.reason === null)
              span.dataset.mimirNativeForm = allowed ? 'editable' : 'readonly'
              span.title = allowed
                ? '点击切换复选框；也可在“文档保护”中使用键盘填写'
                : (matches.find((c) => c.reason)?.reason ??
                  '此原生控件当前不能安全填写，可在“文档保护”中查看原因')
            }
            for (const button of view.dom.querySelectorAll<HTMLButtonElement>(
              '.doc-formula-edit',
            )) {
              if (!access.writable || access.mandatoryTracking) {
                if (!buttons.has(button))
                  buttons.set(button, { disabled: button.disabled, title: button.title })
                button.disabled = true
                button.title = access.mandatoryTracking
                  ? FORCED_TRACKING_REASON
                  : (access.reason ?? '原件受保护，不能修改')
              } else {
                const original = buttons.get(button)
                if (original) {
                  button.disabled = original.disabled
                  button.title = original.title
                  buttons.delete(button)
                }
              }
            }
            for (const textbox of view.dom.querySelectorAll<HTMLElement>(
              '.doc-protected .doc-textbox-editor',
            )) {
              if (!access.writable || access.mandatoryTracking) {
                if (!textboxes.has(textbox))
                  textboxes.set(textbox, textbox.getAttribute('aria-readonly'))
                textbox.setAttribute('aria-readonly', 'true')
              } else if (textboxes.has(textbox)) {
                const original = textboxes.get(textbox)
                if (original === null || original === undefined)
                  textbox.removeAttribute('aria-readonly')
                else textbox.setAttribute('aria-readonly', original)
                textboxes.delete(textbox)
              }
            }
          }
          syncReadOnlyControls()
          const formClick = (event: MouseEvent) => {
            if (
              !controller.getAccess().formsOnly ||
              event.button !== 0 ||
              event.detail > 1 ||
              event.shiftKey ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey
            )
              return false
            const target =
              event.target instanceof Element
                ? event.target.closest('.doc-checkbox-control, [data-instr-field="FORMCHECKBOX"]')
                : null
            if (!target || !view.dom.contains(target)) return false
            for (const control of controller.readFormControls(view.state.doc.toJSON())) {
              if (control.from === null || control.to === null) continue
              try {
                // Resolve each edge toward the glyph. At a wrapped line boundary
                // the default forward side would put the end on the next line.
                const start = view.coordsAtPos(control.from, 1),
                  end = view.coordsAtPos(control.to, -1)
                if (
                  event.clientX < Math.min(start.left, end.left) ||
                  event.clientX > Math.max(start.left, end.left) ||
                  event.clientY < start.top ||
                  event.clientY > start.bottom
                )
                  continue
                if (control.reason) onBlocked(control.reason)
                else {
                  toggleProtectedForm(view, controller, control.id)
                  onBlocked('可继续填写，完成后保存到库')
                }
                return true
              } catch (cause) {
                onBlocked(cause instanceof Error ? cause.message : String(cause))
                return true
              }
            }
            return false
          }
          const guard = (event: Event) => {
            if (event.type === 'click' && formClick(event as MouseEvent)) {
              event.preventDefault()
              event.stopImmediatePropagation()
              return
            }
            const access = controller.getAccess()
            if (access.writable && !access.mandatoryTracking) return
            const target = event.target instanceof Element ? event.target : null
            const object = target?.closest('.doc-protected, .doc-nested-table, [data-inline-math]')
            const objectEntry = event.type === 'dblclick' && object
            const formulaEntry = event.type === 'click' && target?.closest('.doc-formula-edit')
            const handle =
              (event.type === 'mousedown' || event.type === 'pointerdown') &&
              target?.closest(
                '.doc-move-handle, .box-resize-handle, .img-resize-handle, .table-resize-handle, .column-resize-handle',
              )
            const mutation = ['beforeinput', 'input', 'paste', 'cut', 'drop', 'dragstart'].includes(
              event.type,
            )
            if (!objectEntry && !formulaEntry && !handle && !mutation) return
            if (access.mandatoryTracking) {
              if (
                !objectEntry &&
                !formulaEntry &&
                !handle &&
                !['drop', 'dragstart'].includes(event.type)
              )
                return
              onBlocked(FORCED_TRACKING_REASON)
            } else if (!blocked()) return
            // Double-clicking protected text may still select it; only the
            // NodeView editor activation must be intercepted.
            if (!objectEntry) event.preventDefault()
            event.stopImmediatePropagation()
          }
          const events = [
            'dblclick',
            'click',
            'mousedown',
            'pointerdown',
            'beforeinput',
            'input',
            'paste',
            'cut',
            'drop',
            'dragstart',
          ]
          events.forEach((event) => view.dom.addEventListener(event, guard, true))
          const unsubscribe = controller.subscribe(() => {
            // The only P0 transition is an explicit recommended-only choice.
            // Refresh editable props without a content transaction/history entry.
            if (!applying) view.updateState(view.state)
          })
          return {
            update: syncReadOnlyControls,
            destroy() {
              unsubscribe()
              events.forEach((event) => view.dom.removeEventListener(event, guard, true))
            },
          }
        },
      }),
    ]
  },
})
