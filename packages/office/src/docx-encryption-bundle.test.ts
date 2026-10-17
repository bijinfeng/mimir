import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import JSZip from 'jszip'
import { build } from 'vite'
import { beforeAll, expect, it } from 'vitest'
import type { DocxEncryptionRequest, DocxEncryptionResponse } from './docx-encryption-types.js'

let entry: URL
const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(new URL(`../tests/fixtures/docx-encryption/${name}`, import.meta.url)),
  )
beforeAll(async () => {
  const output = mkdtempSync(join(tmpdir(), 'mimir-docx-browser-bundle-'))
  await build({
    configFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    logLevel: 'silent',
    build: {
      outDir: output,
      emptyOutDir: false,
      minify: true,
      rolldownOptions: {
        input: fileURLToPath(new URL('./docx-encryption.worker.ts', import.meta.url)),
        output: { format: 'iife', entryFileNames: 'production-worker.mjs' },
      },
    },
  })
  // A .js file outside type:module receives Node's CommonJS `require`, hiding
  // CFB's browser export defect. Both the bridge and browser output must be ESM.
  const bridge = join(output, 'bridge.mjs')
  writeFileSync(
    bridge,
    `import { parentPort } from 'node:worker_threads';
    if (typeof require !== 'undefined') throw new Error('Worker regression requires real ESM');
    globalThis.Buffer = undefined;
    globalThis.process = undefined;
    globalThis.self = globalThis;
    globalThis.importScripts = () => { throw new Error('Module worker cannot import scripts'); };
    globalThis.addEventListener = (_type, listener) => parentPort.once('message', data => listener({data}));
    globalThis.postMessage = (data, transfers) => parentPort.postMessage(data, transfers);
    await import(${JSON.stringify(pathToFileURL(join(output, 'production-worker.mjs')).href)});
    parentPort.postMessage({ready: true});`,
  )
  entry = pathToFileURL(bridge)
})

async function request(operation: 'encrypt' | 'decrypt', input: Uint8Array) {
  const worker = new Worker(entry)
  try {
    return await new Promise<Extract<DocxEncryptionResponse, { result: unknown }>['result']>(
      (resolve, reject) => {
        worker.once('error', reject)
        worker.on('message', (message: DocxEncryptionResponse | { ready: true }) => {
          if ('ready' in message) {
            const bytes = input.slice(),
              data: DocxEncryptionRequest = {
                id: 1,
                operation,
                password: 'Password1234_',
                bytes,
              }
            worker.postMessage(data, [bytes.buffer])
          } else if ('error' in message) reject(new Error(message.error))
          else resolve(message.result)
        })
      },
    )
  } finally {
    await worker.terminate()
  }
}

for (const format of ['standard', 'agile'])
  it(`browser-bundled ESM Worker edits external ${format}, writes Agile, and decrypts exact native bytes`, async () => {
    const opened = await request('decrypt', fixture(`office-${format}-password.docx`))
    expect(opened.format).toBe(format)
    expect(opened.bytes).toEqual(fixture(`office-${format}-plain.docx`))
    const zip = await JSZip.loadAsync(opened.bytes),
      document = await zip.file('word/document.xml')!.async('string')
    expect(document).toContain('ipsum')
    zip.file('word/document.xml', document.replace('ipsum', 'ipsum 浏览器加密保存回归'))
    const plain = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }),
      encrypted = await request('encrypt', plain)
    expect(encrypted.format).toBe('agile')
    expect((await request('decrypt', encrypted.bytes)).bytes).toEqual(plain)
    // Official synthetic artifacts for the independent password + HMAC oracle.
    writeFileSync(`/tmp/mimir-docx-browser-bundle-${format}-20261017.docx`, encrypted.bytes)
    writeFileSync(`/tmp/mimir-docx-browser-bundle-${format}-plain-20261017.docx`, plain)
  })
