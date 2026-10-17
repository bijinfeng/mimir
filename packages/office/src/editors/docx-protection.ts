import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { DocxProtectionController } from '../docx-protection.js'

/** Local guard: NodeView DOM listeners run before PM handleDOMEvents. */
export const DocxProtectionExtension = Extension.create<{
  controller: DocxProtectionController | null
  onBlocked: (reason: string) => void
}>({
  name: 'mimirNativeProtection',
  priority: 10_000,
  addOptions: () => ({ controller: null, onBlocked: () => {} }),
  addProseMirrorPlugins() {
    const { controller, onBlocked } = this.options
    if (!controller) return []
    // PM can recreate plugin views while keeping the same NodeView DOM. Keep
    // originals for the plugin lifetime, not for each individual view instance.
    const buttons = new WeakMap<HTMLButtonElement, { disabled: boolean; title: string }>()
    const textboxes = new WeakMap<HTMLElement, string | null>()
    const blocked = () => {
      const access = controller.getAccess()
      if (access.writable) return false
      onBlocked(access.reason ?? '原件受保护，不能修改')
      return true
    }
    return [
      new Plugin({
        key: new PluginKey('mimirNativeProtection'),
        filterTransaction: (tr) => !tr.docChanged || !blocked(),
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
            for (const button of view.dom.querySelectorAll<HTMLButtonElement>(
              '.doc-formula-edit',
            )) {
              if (!access.writable) {
                if (!buttons.has(button))
                  buttons.set(button, { disabled: button.disabled, title: button.title })
                button.disabled = true
                button.title = access.reason ?? '原件受保护，不能修改'
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
              if (!access.writable) {
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
          const guard = (event: Event) => {
            if (controller.getAccess().writable) return
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
            if (!blocked()) return
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
            view.updateState(view.state)
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
