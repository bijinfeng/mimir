import { assemble } from '../plugins/host.js'

const LEGACY_KEYS = [
  ['docx.brave.apiKey', 'search.web.brave.apiKey'],
  ['docx.image.apiKey', 'model.image.apiKey'],
  ['docx.image.baseUrl', 'model.image.baseUrl'],
  ['docx.image.model', 'model.image.model'],
  ['docx.media.visionEnabled', 'model.vision.enabled'],
  ['docx.media.apiKey', 'model.transcription.apiKey'],
  ['docx.media.baseUrl', 'model.transcription.baseUrl'],
  ['docx.media.transcriptionModel', 'model.transcription.model'],
] as const

export type MigrationIssue = { key: string; message: string }

let pending: Promise<MigrationIssue[]> | null = null

/** Run before any generic service read, including the first DOCX sidebar request. */
export function migrateAiServiceSettings(): Promise<MigrationIssue[]> {
  if (pending) return pending
  pending = assemble()
    .settings.migrateKeys(LEGACY_KEYS.map(([from, to]) => ({ from, to })))
    .then(({ issues }) => issues)
    .finally(() => {
      pending = null
    })
  return pending
}
