import type { App } from 'antd'
import type { ReactNode } from 'react'

/** Keep the affected object and failure visible until the operation really succeeds. */
export function confirmDanger(
  modal: ReturnType<typeof App.useApp>['modal'],
  {
    title,
    content,
    onConfirm,
  }: { title: string; content: ReactNode; onConfirm: () => Promise<unknown> },
) {
  const dialog = modal.confirm({
    title,
    content,
    okText: '删除',
    okButtonProps: { danger: true },
    cancelText: '取消',
    focusable: { autoFocusButton: 'cancel' },
    mask: { closable: false },
    onOk: async () => {
      dialog.update({
        content,
        keyboard: false,
        cancelButtonProps: { disabled: true },
        okText: '删除中…',
      })
      try {
        await onConfirm()
      } catch (error) {
        dialog.update({
          keyboard: true,
          cancelButtonProps: { disabled: false },
          okText: '重试删除',
          content: (
            <>
              {content}
              <p role="alert">
                删除失败：{error instanceof Error ? error.message : '请重试'}。请重试或取消。
              </p>
            </>
          ),
        })
        // A rejected promise tells AntD to retain this exact confirmation.
        throw error
      }
    },
  })
  // Hook-modal promise mode handles the rejected request without an unhandled rejection.
  void dialog.then(
    () => undefined,
    () => undefined,
  )
  return dialog
}
