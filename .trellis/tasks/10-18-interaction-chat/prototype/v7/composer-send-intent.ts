import type { ComposerToolbarState } from './composer-toolbar'
import { selectedModel } from './model-settings.ts'
import type { ModelSelection } from './model-settings.ts'
import type { Attachment } from './local-types'
export type ComposerSendIntent = {
  scope: string
  model?: ModelSelection
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
  const model = selectedModel(toolbar.models, toolbar.selectedModel)
  if (
    !toolbar.searchOnly &&
    (!model || toolbar.modelsStatus === 'loading' || toolbar.modelsStatus === 'error')
  )
    throw Error('请选择可用模型后发送。')
  if (
    model?.reasoning.status === 'supported' &&
    !(model.reasoning.allowInherit && !toolbar.selectedModel?.reasoningEffort) &&
    !model.reasoning.options.some(
      (option) => option.value === toolbar.selectedModel?.reasoningEffort,
    )
  )
    throw Error('当前推理等级不可用，请重新选择。')
  return structuredClone({
    intent: {
      scope: toolbar.scope,
      model: toolbar.searchOnly
        ? undefined
        : {
            providerId: model!.providerId,
            modelId: model!.modelId,
            ...(model!.reasoning.status === 'supported' && toolbar.selectedModel?.reasoningEffort
              ? { reasoningEffort: toolbar.selectedModel.reasoningEffort }
              : {}),
          },
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
