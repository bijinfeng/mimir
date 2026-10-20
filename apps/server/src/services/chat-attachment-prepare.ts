import { attachmentParserModuleUrl } from '../plugins/host.js'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Worker } from 'node:worker_threads'
import { pathToFileURL } from 'node:url'
import { CHAT_ATTACHMENT_LIMITS, extensionOf } from '@mimir/shared'

const require = createRequire(import.meta.url)
const entryJs = new URL('./chat-attachment-worker.js', import.meta.url)
const entry = existsSync(entryJs)
  ? entryJs
  : new URL('./chat-attachment-worker.ts', import.meta.url)
// Dev/test load TS only inside worker. Production uses explicit compiled entries.
const source = String.raw`(async()=>{
 const {workerData,parentPort}=await import('node:worker_threads');
 try {
  if(workerData.tsx){
   // Keep vendor ESM native: tsx's dynamic-import sourcemaps exceed the heap budget
   // on Node 22. Both modules are reused by the real PDF parser below.
   for(const url of workerData.nativeImports) await import(url);
   const {register}=await import(workerData.tsx);register();
  }
  await import(workerData.entry);
 }catch(e){parentPort.postMessage({error:e instanceof Error?e.message:String(e)})}
})()`
type PreparationResult = { mime: string; kind: 'document' | 'image'; text: string | null }
let active = 0
const waiting: Array<() => void> = []
const timeoutError = () => new Error('附件准备超过 30 秒，请缩小文件后重选')

/** Real worker termination is awaited on success, error, timeout and cancellation. */
export async function runPreparationWorker(
  worker: Worker,
  signal?: AbortSignal,
  timeoutMs: number = CHAT_ATTACHMENT_LIMITS.preparationMs,
): Promise<PreparationResult> {
  try {
    return await new Promise((resolve, reject) => {
      const done = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
      const abort = () => {
        done()
        reject(new Error('附件准备已取消'))
      }
      const timer = setTimeout(
        () => {
          done()
          reject(timeoutError())
        },
        Math.max(0, timeoutMs),
      )
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
      worker.once('message', (message) => {
        done()
        if (message.error) reject(new Error(message.error))
        else resolve(message.result)
      })
      worker.once('error', (error) => {
        done()
        reject(error)
      })
      worker.once('exit', (code) => {
        done()
        reject(new Error(`附件解析进程退出（${code}）`))
      })
    })
  } finally {
    await worker.terminate()
  }
}
export async function prepareAttachmentBytes(
  name: string,
  mime: string,
  data: Uint8Array,
  signal?: AbortSignal,
  timeoutMs: number = CHAT_ATTACHMENT_LIMITS.preparationMs,
): Promise<PreparationResult> {
  signal?.throwIfAborted()
  const started = Date.now()
  if (active >= 2) {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
      const ready = () => {
        cleanup()
        active++
        resolve()
      }
      const remove = () => {
        const i = waiting.indexOf(ready)
        if (i >= 0) waiting.splice(i, 1)
      }
      const abort = () => {
        cleanup()
        remove()
        reject(new Error('附件准备已取消'))
      }
      const timer = setTimeout(() => {
        cleanup()
        remove()
        reject(timeoutError())
      }, timeoutMs)
      waiting.push(ready)
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
    })
  } else active++
  try {
    signal?.throwIfAborted()
    const worker = new Worker(source, {
      eval: true,
      workerData: {
        chatAttachment: true,
        parserModule: attachmentParserModuleUrl(),
        entry: entry.href,
        tsx: entry.pathname.endsWith('.ts') ? require.resolve('tsx/esm/api') : undefined,
        nativeImports:
          entry.pathname.endsWith('.ts') && extensionOf(name) === 'pdf'
            ? ['pdfjs-dist/legacy/build/pdf.mjs', 'pdfjs-dist/legacy/build/pdf.worker.mjs'].map(
                (specifier) => pathToFileURL(require.resolve(specifier)).href,
              )
            : [],
        name,
        mime,
        data,
      },
      resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 16 },
    })
    return await runPreparationWorker(worker, signal, timeoutMs - (Date.now() - started))
  } finally {
    active--
    waiting.shift()?.()
  }
}
