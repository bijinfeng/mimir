/** Unsaved settings drafts live only for this running renderer session. Never persist secrets. */
const drafts = new Map<string, string | number | boolean | null>()

export function readSettingDraft(key: string): string | number | boolean | null | undefined {
  return drafts.get(key)
}

export function writeSettingDraft(key: string, value: string | number | boolean | null): void {
  drafts.set(key, value)
}

export function clearSettingDraft(key: string): void {
  drafts.delete(key)
}
