import { createHash } from 'node:crypto'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const fnpack = Object.freeze({
  version: '1.2.3',
  url: 'https://static2.fnnas.com/fnpack/fnpack-1.2.3-linux-amd64',
  sha256: '54b97fa7b70968c4d05c79840f5daeff508957d0bb2062fdb0376d00d9615c93',
})

export function verifyFnpack(bytes) {
  if (createHash('sha256').update(bytes).digest('hex') !== fnpack.sha256)
    throw new Error('fnpack 1.2.3 checksum mismatch')
  if (bytes.toString('hex', 0, 4) !== '7f454c46' || bytes.readUInt16LE(18) !== 62)
    throw new Error('fnpack must be Linux x86_64 ELF')
}

async function install(destination) {
  if (!destination) throw new Error('Usage: node scripts/fnos-fnpack.mjs <output>')
  const response = await fetch(fnpack.url, { signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`fnpack download failed: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  verifyFnpack(bytes)
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, bytes)
  await chmod(destination, 0o755)
  console.log(`Verified official fnpack ${fnpack.version} SHA-256 ${fnpack.sha256}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await install(process.argv[2])
