import type { RunConfig } from '@assistant-ui/react'
import type { ComposerToolbarState } from './composer-toolbar'
export type ComposerSendIntent = { scope: string; deep: boolean; kind: 'composer' | 'append' }
/** Captured synchronously before the SDK reads runConfig or finalizes attachments. */
export function freezeComposerIntent(
  runConfig: RunConfig,
  toolbar: ComposerToolbarState | undefined,
  kind: ComposerSendIntent['kind'],
): RunConfig {
  if (!toolbar) throw new Error('本轮设置尚未就绪，请稍后发送。')
  return {
    ...runConfig,
    custom: {
      ...runConfig.custom,
      mimirComposerIntent: {
        scope: toolbar.scope,
        deep: toolbar.sidebar ? false : toolbar.deep,
        kind,
      } satisfies ComposerSendIntent,
    },
  }
}
export function readComposerIntent(
  runConfig: RunConfig | undefined,
): ComposerSendIntent | undefined {
  const value = runConfig?.custom?.mimirComposerIntent as ComposerSendIntent | undefined
  return value &&
    typeof value.scope === 'string' &&
    typeof value.deep === 'boolean' &&
    (value.kind === 'composer' || value.kind === 'append')
    ? value
    : undefined
}
