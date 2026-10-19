export type RunConfig = { custom?: Record<string, unknown> }
export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'image'; image: string; filename?: string }
  | { type: 'file'; data: string; mimeType: string; filename?: string; sourceType?: 'url' }
  | {
      type: 'tool-call'
      toolCallId: string
      toolName: string
      args: unknown
      argsText?: string
      result?: unknown
      demoMetadata?: Record<string, unknown>
      isError?: boolean
    }
export type ThreadUserMessagePart = Extract<MessagePart, { type: 'text' | 'image' | 'file' }>
export type Attachment = {
  id: string
  type: string
  name: string
  contentType: string
  file?: File
  content?: ThreadUserMessagePart[]
  status?: { type: string; reason?: string; message?: string; progress?: number }
}
export type CompleteAttachment = Attachment & { content: ThreadUserMessagePart[] }
export type PendingAttachment = Attachment
export type ThreadMessageLike = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string | MessagePart[]
  attachments?: Attachment[]
  status?: { type: string; reason?: string; error?: unknown }
}
export type AttachmentAdapter = {
  accept: string
  add(input: { file: File }): AsyncGenerator<Attachment>
  remove(attachment: Attachment): Promise<void>
  send(
    attachment: PendingAttachment,
    options?: { signal?: AbortSignal },
  ): Promise<CompleteAttachment>
}
