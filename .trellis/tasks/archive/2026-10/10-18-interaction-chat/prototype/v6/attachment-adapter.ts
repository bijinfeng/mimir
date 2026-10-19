import type {
  AttachmentAdapter,
  Attachment,
  CompleteAttachment,
  PendingAttachment,
} from './local-types'
export const proposedAttachmentPolicy = {
  maxFileBytes: 10 * 1024 * 1024,
  maxImageBytes: 5 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  maxFiles: 4,
  maxImageEdge: 4096,
  maxImagePixels: 16_000_000,
  accept:
    '.txt,.md,.csv,.tsv,.json,.yaml,.yml,.xml,.ts,.js,.py,.pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.webp',
}
export type AttachmentMode =
  | 'ready'
  | 'uploading'
  | 'failed'
  | 'send-pending'
  | 'send-failed'
  | 'unsupported'
  | 'oversize'
  | 'expired'
  | 'image'
  | 'total-size'
  | 'context-limit'
type Decision = 'complete' | 'failed' | 'cancel'
type SendContext = {
  searchOnly: boolean
  noVision: boolean
  noModel: boolean
  agentActive: boolean
  dedicatedSnapshot: boolean
}
const gates = new Map<string, (decision: Decision) => void>()
export function settleLocalAttachments(decision: Decision) {
  for (const resolve of gates.values()) resolve(decision)
  gates.clear()
}
const delay = () => new Promise((resolve) => globalThis.setTimeout(resolve, 250))
const fileDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)), { once: true })
    reader.addEventListener('error', () => reject(new Error('本地文件读取失败')), { once: true })
    reader.readAsDataURL(file)
  })
export function createLocalAttachmentAdapter(
  getMode: () => AttachmentMode,
  getContext: () => SendContext,
): AttachmentAdapter {
  const active = new Map<string, File>()
  const prepared = new Map<string, CompleteAttachment['content']>()
  return {
    accept: proposedAttachmentPolicy.accept,
    async *add({ file }) {
      const id = `local-attachment-${crypto.getRandomValues(new Uint32Array(4)).join('-')}`
      const image = /^image\/(png|jpeg|webp)$/.test(file.type)
      const pending = {
        id,
        type: image ? 'image' : 'document',
        name: file.name,
        contentType: file.type || 'application/octet-stream',
        file,
      }
      const unsupported =
        !/\.(txt|md|csv|tsv|json|ya?ml|xml|ts|js|py|pdf|docx|xlsx|pptx|png|jpe?g|webp)$/i.test(
          file.name,
        )
      const total = Array.from(active.values()).reduce((sum, item) => sum + item.size, file.size)
      const problem =
        file.size >
        (image ? proposedAttachmentPolicy.maxImageBytes : proposedAttachmentPolicy.maxFileBytes)
          ? `拟定限制：${image ? '图片5' : '文档10'} MiB，请重新选择。`
          : active.size >= proposedAttachmentPolicy.maxFiles
            ? '拟定限制：每条消息最多4个附件。'
            : total > proposedAttachmentPolicy.maxTotalBytes || getMode() === 'total-size'
              ? '拟定限制：单轮附件合计最多20 MiB，请移除部分附件。'
              : unsupported
                ? '此格式不在拟定支持范围，请重新选择。'
                : ''
      if (problem) {
        yield { ...pending, status: { type: 'incomplete', reason: 'error', message: problem } }
        return
      }
      active.set(id, file)
      yield { ...pending, status: { type: 'running', reason: 'uploading', progress: 0.25 } }
      let decision: Decision = 'complete'
      if (getMode() === 'uploading')
        decision = await new Promise<Decision>((resolve) => gates.set(id, resolve))
      else await delay()
      if (!active.has(id)) return
      if (decision === 'cancel') {
        active.delete(id)
        yield {
          ...pending,
          status: {
            type: 'incomplete',
            reason: 'error',
            message: '本地准备已取消，请移除后重新选择。',
          },
        }
        return
      }
      if (getMode() === 'failed' || getMode() === 'expired' || decision === 'failed') {
        yield {
          ...pending,
          status: {
            type: 'incomplete',
            reason: 'error',
            message:
              getMode() === 'expired'
                ? '模拟草稿附件已超过24h，请移除后重新选择。'
                : '模拟附件准备失败，请移除后重选。',
          },
        }
        return
      }
      if (image) {
        const bitmap = await createImageBitmap(file)
        const invalid =
          Math.max(bitmap.width, bitmap.height) > proposedAttachmentPolicy.maxImageEdge ||
          bitmap.width * bitmap.height > proposedAttachmentPolicy.maxImagePixels
        bitmap.close()
        if (invalid) {
          yield {
            ...pending,
            status: {
              type: 'incomplete',
              reason: 'error',
              message: '拟定图片限制：最大边4096像素、总像素16MP。',
            },
          }
          return
        }
      }
      const content: CompleteAttachment['content'] = image
        ? [{ type: 'image', image: await fileDataUrl(file), filename: file.name }]
        : [{ type: 'text', text: `[本地附件模拟：${file.name}；未执行真实解析、上传或模型请求]` }]
      prepared.set(id, content)
      yield { ...pending, content, status: { type: 'requires-action', reason: 'composer-send' } }
    },
    async remove(attachment: Attachment) {
      active.delete(attachment.id)
      prepared.delete(attachment.id)
      gates.get(attachment.id)?.('cancel')
      gates.delete(attachment.id)
    },
    async send(attachment: PendingAttachment, options) {
      const context = getContext()
      if (context.dedicatedSnapshot)
        throw new Error('专用文档截图不能混入通用附件，请移除通用附件后再发送，草稿保留。')
      if (context.agentActive)
        throw new Error(
          '通用附件仅用于普通问答，不授权文档Agent编辑。请切回问答或移除附件，草稿保留。',
        )
      if (context.searchOnly)
        throw new Error('拟定策略：只检索不接受临时附件。请切回模型问答；草稿与附件保留。')
      if (context.noModel) throw new Error('请先配置聊天模型，草稿与附件保留。')
      if (attachment.type === 'image' && context.noVision)
        throw new Error('当前选中模型不具备视觉能力。请切换视觉模型，草稿与附件保留。')
      if (getMode() === 'context-limit')
        throw new Error(
          '模拟提取文本超过单件12000字符或本轮24000字符。请缩小内容后重选，不静默截断。',
        )
      if (options?.signal?.aborted) throw new DOMException('已取消准备', 'AbortError')
      if (getMode() === 'send-pending')
        await new Promise<void>((resolve, reject) => {
          gates.set(attachment.id, (decision) =>
            decision === 'complete' ? resolve() : reject(new Error('模拟附件准备失败或取消')),
          )
          options?.signal?.addEventListener(
            'abort',
            () => {
              gates.delete(attachment.id)
              reject(new DOMException('已取消准备', 'AbortError'))
            },
            { once: true },
          )
        })
      if (getMode() === 'send-failed' || !active.has(attachment.id))
        throw new Error('模拟发送前准备失败，请保留草稿后重新选择附件。')
      const content = prepared.get(attachment.id)
      if (!content) throw new Error('附件尚未准备完成')
      active.delete(attachment.id)
      prepared.delete(attachment.id)
      return {
        id: attachment.id,
        type: attachment.type,
        name: attachment.name,
        contentType: attachment.contentType,
        status: { type: 'complete' },
        content,
      }
    },
  }
}
export function localAttachmentFixture(mode: AttachmentMode): File {
  if (mode === 'oversize')
    return new File(
      [new Uint8Array(proposedAttachmentPolicy.maxFileBytes + 1)],
      '超出拟定限制.txt',
      { type: 'text/plain' },
    )
  if (mode === 'unsupported')
    return new File(['local fixture'], '不支持的音频.mp3', { type: 'audio/mpeg' })
  if (mode === 'image')
    return new File(
      [
        Uint8Array.from(
          atob(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          ),
          (character) => character.charCodeAt(0),
        ),
      ],
      '视觉附件示例.png',
      { type: 'image/png' },
    )
  return new File(['Local attachment preparation fixture. No server request.'], '研究资料.txt', {
    type: 'text/plain',
  })
}
