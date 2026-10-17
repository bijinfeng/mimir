import {
  validateDocxPassword,
  validateDocxPasswordCredential,
  type DocxPasswordCredential,
} from './docx-protection-password-crypto.js'
export const DOCX_PASSWORD_DEADLINE_MS = 30_000
/** One isolated worker per request. Every completion path terminates and settles exactly once. */
export async function verifyDocxModificationPassword(
  password: string,
  credential: DocxPasswordCredential,
  signal: AbortSignal,
): Promise<boolean> {
  return passwordWorker(password, credential, signal) as Promise<boolean>
}
export async function createDocxPassword(
  password: string,
  signal: AbortSignal,
): Promise<DocxPasswordCredential> {
  if (!password) throw new Error('新密码不能为空；移除密码请显式选择清除')
  return passwordWorker(password, null, signal) as Promise<DocxPasswordCredential>
}
async function passwordWorker(
  password: string,
  credential: DocxPasswordCredential | null,
  signal: AbortSignal,
): Promise<boolean | DocxPasswordCredential> {
  signal.throwIfAborted()
  validateDocxPassword(password)
  if (credential) validateDocxPasswordCredential(credential)
  if (typeof Worker === 'undefined')
    throw new Error('当前环境无法启动本地密码验证，请在支持 Worker 的浏览器中打开')
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./docx-protection-password.worker.ts', import.meta.url), {
        type: 'module',
      })
    } catch {
      reject(new Error('本地密码验证无法启动，请重试'))
      return
    }
    let settled = false
    const finish = (error?: Error, matches?: boolean | DocxPasswordCredential) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      worker.removeEventListener('message', message)
      worker.removeEventListener('error', failure)
      worker.removeEventListener('messageerror', messageFailure)
      worker.terminate()
      if (error) reject(error)
      else resolve(matches!)
    }
    const abort = () => finish(new DOMException('已取消密码验证', 'AbortError'))
    const timeout = setTimeout(
      () => finish(new Error('密码验证超过 30 秒，请重试')),
      DOCX_PASSWORD_DEADLINE_MS,
    )
    signal.addEventListener('abort', abort, { once: true })
    const failure = () => finish(new Error('本地密码验证失败，请重试'))
    const messageFailure = () => finish(new Error('本地密码验证响应无效，请重试'))
    const message = ({ data }: MessageEvent<unknown>) => {
      if (
        !credential &&
        data &&
        typeof data === 'object' &&
        'credential' in data &&
        Object.keys(data).length === 1
      ) {
        try {
          validateDocxPasswordCredential(data.credential as DocxPasswordCredential)
          const value = data.credential as DocxPasswordCredential
          if (
            Object.keys(value).length !== 4 ||
            value.spinCount !== 100000 ||
            atob(value.salt).length !== 16
          )
            throw new Error('Invalid credential response')
          finish(
            undefined,
            Object.freeze({
              algorithmSid: value.algorithmSid,
              spinCount: value.spinCount,
              hash: value.hash,
              salt: value.salt,
            }),
          )
        } catch {
          finish(new Error('本地密码计算响应无效，请重试'))
        }
        return
      }
      if (
        !credential ||
        !data ||
        typeof data !== 'object' ||
        !('matches' in data) ||
        typeof data.matches !== 'boolean' ||
        Object.keys(data).length !== 1
      )
        finish(new Error('本地密码验证未完成，请重试'))
      else finish(undefined, data.matches)
    }
    worker.addEventListener('message', message)
    worker.addEventListener('error', failure)
    worker.addEventListener('messageerror', messageFailure)
    if (signal.aborted) {
      abort()
      return
    }
    try {
      worker.postMessage(credential ? { password, credential } : { password, create: true }, [])
    } catch {
      finish(new Error('本地密码验证无法启动，请重试'))
    }
  })
}
