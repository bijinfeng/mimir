import { readPptxImageInfo } from '@mimir/shared'
import type { ChatDraftAgent, ChatPptxSnapshot } from '../types.js'

export const SNAPSHOT_LIMIT = 4
export const snapshotFilename = (name: string) => /^第[1-9]\d*页截图-[\w-]+\.png$/.test(name)
type NamedPart = { type: string; filename?: string; data?: string; image?: string }
type AttachmentLike = { name: string; content?: readonly NamedPart[] }
export function snapshotNames(attachments: readonly AttachmentLike[]): string[] {
  return attachments.filter((item) => snapshotFilename(item.name)).map((item) => item.name)
}
export function assertSnapshotTarget(snapshot: ChatPptxSnapshot, agent?: ChatDraftAgent | null) {
  const target = snapshot.target
  if (!snapshot.sourceIsCurrent())
    throw new Error('截图对应的文档、页面或版本已变化，请重新点击“美化本页”')
  const context = agent?.getContext() as
    | { slides?: { id?: string }[]; selection?: { slideIndex?: number } }
    | undefined
  const id = `s_${target.slidePath.match(/^ppt\/slides\/slide([1-9]\d*)\.xml$/)?.[1] ?? ''}`
  if (
    !agent ||
    agent.format !== 'pptx' ||
    agent.documentId !== target.documentId ||
    agent.getVersion() !== target.version ||
    context?.selection?.slideIndex !== target.slideIndex ||
    context?.slides?.[target.slideIndex]?.id !== id
  )
    throw new Error('截图对应的文档、页面或版本已变化，请重新点击“美化本页”')
}
/** Bounded session memory only; no generic uploader or persistent attachment store. */
export class PptxSnapshotRegistry {
  private readonly entries = new Map<string, ChatPptxSnapshot>()
  add(snapshot: ChatPptxSnapshot, protectedNames: readonly string[] = []): void {
    if (
      !snapshotFilename(snapshot.image.name) ||
      !snapshot.id ||
      snapshot.image.mimeType !== 'image/png' ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(snapshot.image.dataUrl) ||
      snapshot.image.dataUrl.length > 7_000_000 ||
      !Number.isSafeInteger(snapshot.target.version) ||
      snapshot.target.version < 0 ||
      !Number.isSafeInteger(snapshot.target.slideIndex) ||
      snapshot.target.slideIndex < 0
    )
      throw new Error('截图草稿无效，请重新准备')
    const encoded = snapshot.image.dataUrl.split(',')[1]!
    const binary = atob(encoded)
    if (binary.length > 5 * 1024 * 1024) throw new Error('截图不能超过 5 MiB')
    const info = readPptxImageInfo(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
    if (
      info.ext !== 'png' ||
      info.width !== snapshot.image.width ||
      info.height !== snapshot.image.height ||
      info.width > 1280 ||
      info.height > 1920 ||
      info.width * info.height > 2_457_600
    )
      throw new Error('截图内容或尺寸无效，请重新准备')
    if (!this.entries.has(snapshot.image.name) && this.entries.size >= SNAPSHOT_LIMIT) {
      const evict = [...this.entries.keys()].find((name) => !protectedNames.includes(name))
      if (!evict) throw new Error('已有 4 份截图等待发送，请先处理队列中的草稿')
      this.entries.delete(evict)
    }
    this.entries.set(snapshot.image.name, snapshot)
  }
  get(name: string): ChatPptxSnapshot {
    const snapshot = this.entries.get(name)
    if (!snapshot) throw new Error('截图目标已失效，请重新点击“美化本页”')
    return snapshot
  }
  byId(id: string): ChatPptxSnapshot {
    const snapshot = [...this.entries.values()].find((item) => item.id === id)
    if (!snapshot) throw new Error('截图目标已失效，请重新点击“美化本页”')
    return snapshot
  }
  attachment(snapshot: ChatPptxSnapshot) {
    return {
      id: `pptx-snapshot-${snapshot.id}`,
      type: 'image' as const,
      name: snapshot.image.name,
      contentType: 'image/png',
      content: [
        { type: 'image' as const, image: snapshot.image.dataUrl, filename: snapshot.image.name },
      ],
    }
  }
  restoreParts(parts: readonly NamedPart[]): ChatPptxSnapshot[] {
    return parts.flatMap((part) => {
      if (part.type !== 'file' || !part.filename || !snapshotFilename(part.filename)) return []
      const snapshot = this.get(part.filename)
      if (part.data !== snapshot.image.dataUrl) throw new Error('排队截图与原草稿不符，请重新准备')
      return [snapshot]
    })
  }
}
