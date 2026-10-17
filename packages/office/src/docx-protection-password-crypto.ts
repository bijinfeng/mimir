/** Private local verification protocol. Never include these values in editor/Agent snapshots. */
export interface DocxPasswordCredential {
  readonly hash: string
  readonly salt: string
  readonly spinCount: number
  readonly algorithmSid: 14
}
export const DOCX_PASSWORD_MAX_SPIN = 1_000_000
export const DOCX_PASSWORD_DEFAULT_SPIN = 100_000
export const DOCX_PASSWORD_MAX_LENGTH = 1024
function decodeBase64(value: unknown, min: number, max: number): Uint8Array {
  if (
    typeof value !== 'string' ||
    value.length > 128 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  )
    throw new Error('原件密码凭据格式不受支持')
  const decoded = atob(value)
  if (decoded.length < min || decoded.length > max || btoa(decoded) !== value)
    throw new Error('原件密码凭据长度不受支持')
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0))
}
export function validateDocxPasswordCredential(value: DocxPasswordCredential): void {
  if (
    !value ||
    value.algorithmSid !== 14 ||
    !Number.isSafeInteger(value.spinCount) ||
    value.spinCount < 0 ||
    value.spinCount > DOCX_PASSWORD_MAX_SPIN
  )
    throw new Error('原件密码算法或迭代次数不受支持')
  decodeBase64(value.hash, 64, 64)
  decodeBase64(value.salt, 1, 64)
}
export function validateDocxPassword(password: string): void {
  if (typeof password !== 'string' || password.length > DOCX_PASSWORD_MAX_LENGTH)
    throw new Error('密码长度不能超过 1024 个字符')
}
/** Called only inside the dedicated worker; UTF-16LE preserves Chinese and surrogate pairs. */
export async function checkDocxPasswordInWorker(
  password: string,
  credential: DocxPasswordCredential,
): Promise<boolean> {
  validateDocxPasswordCredential(credential)
  validateDocxPassword(password)
  const salt = decodeBase64(credential.salt, 1, 64),
    expected = decodeBase64(credential.hash, 64, 64)
  const hash = await hashDocxPassword(password, salt, credential.spinCount)
  let difference = 0
  for (let index = 0; index < expected.length; index++)
    difference |= hash[index]! ^ expected[index]!
  hash.fill(0)
  expected.fill(0)
  salt.fill(0)
  return difference === 0
}
async function hashDocxPassword(
  password: string,
  salt: Uint8Array,
  spin: number,
): Promise<Uint8Array> {
  const input = new Uint8Array(salt.length + password.length * 2)
  input.set(salt)
  const view = new DataView(input.buffer)
  for (let index = 0; index < password.length; index++)
    view.setUint16(salt.length + index * 2, password.charCodeAt(index), true)
  let hash = new Uint8Array(await crypto.subtle.digest('SHA-512', input))
  input.fill(0)
  const next = new Uint8Array(68),
    iteration = new DataView(next.buffer)
  for (let index = 0; index < spin; index++) {
    next.set(hash)
    iteration.setUint32(64, index, true)
    hash = new Uint8Array(await crypto.subtle.digest('SHA-512', next))
  }
  next.fill(0)
  return hash
}
/** Random salt and default iterations are generated inside the same isolated worker. */
export async function createDocxPasswordInWorker(
  password: string,
): Promise<DocxPasswordCredential> {
  validateDocxPassword(password)
  if (!password) throw new Error('新密码不能为空；移除密码请显式选择清除')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await hashDocxPassword(password, salt, DOCX_PASSWORD_DEFAULT_SPIN)
  const result = Object.freeze({
    algorithmSid: 14 as const,
    spinCount: DOCX_PASSWORD_DEFAULT_SPIN,
    salt: btoa(String.fromCharCode(...salt)),
    hash: btoa(String.fromCharCode(...hash)),
  })
  hash.fill(0)
  salt.fill(0)
  return result
}
