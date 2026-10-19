import type { ComposerToolbarState } from './composer-toolbar'
import type { Attachment } from './local-types'
export type ComposerSendIntent = {
  scope: string
  deep: boolean
  kind: 'composer' | 'append'
  snapshot?: boolean
  context?: Record<string, unknown>
  attachmentIds?: string[]
}
/** One synchronous snapshot, called before any attachment work or async SDK dispatch. */
export function captureSendIntent(
  toolbar: ComposerToolbarState | undefined,
  kind: ComposerSendIntent['kind'],
  snapshot: boolean,
  context: Record<string, unknown> | undefined,
  attachments: Attachment[],
): { intent: ComposerSendIntent; attachments: Attachment[] } {
  if (!toolbar) throw Error('本轮设置尚未就绪，请稍后发送。')
  return structuredClone({
    intent: {
      scope: toolbar.scope,
      deep: toolbar.sidebar ? false : toolbar.deep,
      kind,
      snapshot,
      context,
      attachmentIds: attachments.map((a) => a.id),
    },
    attachments,
  })
}
export function canRestoreQueuedDraft(draft: string): boolean {
  return !draft.trim()
}
