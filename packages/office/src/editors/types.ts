/**
 * 编辑器与宿主之间的契约。
 *
 * ## 为什么不直接 import API 客户端
 *
 * 这个包不碰网络、不认识 cookie、不知道端点长什么样。它只知道两件事：
 * 「给我原件字节」「把这个字节写回去」。取与存由宿主提供——于是同一个
 * 编辑器在浏览器里走 HTTP、在桌面端走 IPC，包本身不用改。
 *
 * ## 保存失败必须抛错
 *
 * `save` 抛出的 Error 的 message 会**原样显示在状态行上**，所以它要写成人
 * 话（「HTTP 413」不如「原件太大，超过服务端限制」）。吞掉错误返回 false
 * 的写法在这里不行：编辑器需要一个原因才能给出下一步。
 */

export interface SaveTarget {
  /** 文件名（含扩展名）。服务端可能用它推断类型 */
  name: string
  /** 原件的 MIME，与扩展名一致 */
  mime: string
}

export interface EditorIo {
  /** 取原件字节。失败时抛错，message 会显示给用户 */
  load: () => Promise<Uint8Array>
  /** 把新的原件字节写回库。失败时抛错 */
  save: (bytes: Uint8Array, target: SaveTarget) => Promise<void>
}

/** 三种 Office 格式的 MIME。写在一处——散着写必然有一处拼错，而那是静默的 */
export const OFFICE_MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  html: 'text/html',
  pdf: 'application/pdf',
} as const

export interface EditorProps {
  /** 这份文档的标识。**它变了一定要重新加载**——所以它是加载的唯一依赖 */
  documentId: string
  io: EditorIo
  /**
   * 有没有未保存的改动。宿主用它武装「离开前拦截」——不报的话用户
   * 在防抖窗口里切走就会丢内容（`apps/web/src/lib/unsaved` 记了实测）。
   */
  onDirtyChange?: (dirty: boolean) => void
  /**
   * 贴边模式：编辑器已经在某个面板里（文档详情右栏），不要再套一层外框。
   */
  flush?: boolean
}
