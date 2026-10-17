/** Private browser encryption protocol. Never add passwords to document/Agent/history contracts. */
export const DOCX_ENCRYPTION_MAX_BYTES = 50 * 1024 * 1024
export const DOCX_ENCRYPTION_MAX_CONTAINER_BYTES = 52 * 1024 * 1024
export const DOCX_ENCRYPTION_DEADLINE_MS = 30_000
export const DOCX_ENCRYPTION_MAX_SPIN = 1_000_000
export type DocxEncryptionFailure =
  | 'wrong-password'
  | 'damaged'
  | 'unsupported'
  | 'budget'
  | 'unavailable'
  | 'timeout'
const messages: Record<DocxEncryptionFailure, string> = {
  'wrong-password': '打开密码不正确，请重试',
  damaged: '加密文件结构或完整性校验失败，原件保持不变',
  unsupported: '当前不支持此 Office 加密格式或参数，原件保持不变',
  budget: '文件或加密参数超过本地处理预算，原件保持不变',
  unavailable: '本地加密无法启动或响应无效，请重试',
  timeout: '本地加密处理超过 30 秒，已停止；原件保持不变',
}
export class DocxEncryptionError extends Error {
  readonly code: DocxEncryptionFailure
  constructor(code: DocxEncryptionFailure) {
    super(messages[code])
    this.code = code
    this.name = 'DocxEncryptionError'
  }
}
export function encryptionFailure(code: DocxEncryptionFailure): never {
  throw new DocxEncryptionError(code)
}
export function validateEncryptionPassword(password: string): void {
  if (typeof password !== 'string' || password.length === 0 || password.length > 1024)
    encryptionFailure('budget')
}
export type DocxEncryptionFormat = 'standard' | 'agile'
export interface DocxEncryptionResult {
  bytes: Uint8Array
  format: DocxEncryptionFormat
}
export interface DocxEncryptionRequest {
  id: number
  operation: 'decrypt' | 'encrypt'
  bytes: Uint8Array
  password: string
}
export type DocxEncryptionResponse =
  | { id: number; result: DocxEncryptionResult }
  | { id: number; error: DocxEncryptionFailure }
