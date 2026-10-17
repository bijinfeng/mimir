import * as CFB from 'cfb'
import {
  DOCX_ENCRYPTION_MAX_CONTAINER_BYTES,
  encryptionFailure as fail,
} from './docx-encryption-types.js'
const FREE = 0xffffffff,
  END = 0xfffffffe,
  FAT = 0xfffffffd,
  DIF = 0xfffffffc
const MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
const word = (data: Uint8Array, p: number) =>
  new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(p, true)
interface Directory {
  name: string
  type: number
  left: number
  right: number
  child: number
  start: number
  size: number
}
/** Strict, bounded CFB reader. Untrusted input never enters the general-purpose CFB parser. */
export function readEncryptionContainer(input: Uint8Array): {
  info: Uint8Array
  package: Uint8Array
} {
  if (input.length > DOCX_ENCRYPTION_MAX_CONTAINER_BYTES) fail('budget')
  if (input.length < 512 || MAGIC.some((v, i) => input[i] !== v)) fail('damaged')
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength)
  const u16 = (p: number) => view.getUint16(p, true)
  const u32 = (p: number) => view.getUint32(p, true)
  const major = u16(26),
    shift = u16(30)
  if (
    u16(28) !== 0xfffe ||
    !((major === 3 && shift === 9) || (major === 4 && shift === 12)) ||
    u16(32) !== 6 ||
    u32(56) !== 4096
  )
    fail('unsupported')
  const sectorSize = 2 ** shift,
    count = input.length / sectorSize - 1
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    u32(44) > count ||
    u32(64) > count ||
    u32(72) > count ||
    (major === 3 && u32(40) !== 0)
  )
    fail('damaged')
  const sector = (id: number) => {
    if (id >= count) fail('damaged')
    return input.subarray((id + 1) * sectorSize, (id + 2) * sectorSize)
  }
  const claimed = new Set<number>()
  const claim = (id: number) => {
    if (id >= count || claimed.has(id)) fail('damaged')
    claimed.add(id)
  }
  const fatIds: number[] = []
  const addFat = (id: number) => {
    if (id !== FREE) {
      claim(id)
      fatIds.push(id)
    }
  }
  for (let p = 76; p < 512; p += 4) addFat(u32(p))
  let difat = u32(68)
  for (let n = 0; n < u32(72); n++) {
    claim(difat)
    const data = sector(difat)
    for (let p = 0; p < sectorSize - 4; p += 4) addFat(word(data, p))
    difat = word(data, sectorSize - 4)
  }
  if (
    (u32(72) > 0 && difat !== END) ||
    (u32(72) === 0 && difat !== END && difat !== FREE) ||
    fatIds.length !== u32(44)
  )
    fail('damaged')
  const fat = new Uint32Array((fatIds.length * sectorSize) / 4)
  fatIds.forEach((id, index) => {
    const data = sector(id)
    for (let p = 0; p < sectorSize; p += 4) fat[(index * sectorSize) / 4 + p / 4] = word(data, p)
  })
  if (fat.length < count || fatIds.some((id) => fat[id] !== FAT)) fail('damaged')
  // DIFAT sectors were claimed separately. Each must carry its reserved FAT marker.
  for (const id of claimed) if (!fatIds.includes(id) && fat[id] !== DIF) fail('damaged')
  const chain = (
    start: number,
    size?: number,
    limit = DOCX_ENCRYPTION_MAX_CONTAINER_BYTES,
  ): Uint8Array => {
    const ids: number[] = []
    let id = start
    while (id !== END) {
      claim(id)
      ids.push(id)
      if (ids.length * sectorSize > limit) fail('budget')
      if (ids.length > count || (size !== undefined && ids.length > Math.ceil(size / sectorSize)))
        fail('damaged')
      id = fat[id]!
    }
    if (size !== undefined && ids.length !== Math.ceil(size / sectorSize)) fail('damaged')
    const output = new Uint8Array(size ?? ids.length * sectorSize)
    ids.forEach((v, i) =>
      output.set(
        sector(v).subarray(0, Math.min(sectorSize, output.length - i * sectorSize)),
        i * sectorSize,
      ),
    )
    return output
  }
  const directoryBytes = chain(u32(48), undefined, 128 * 512)
  if (directoryBytes.length > 128 * 512) fail('budget')
  if (major === 4 && directoryBytes.length / sectorSize !== u32(40)) fail('damaged')
  const dirs: Directory[] = []
  for (let p = 0; p < directoryBytes.length; p += 128) {
    const d = new DataView(directoryBytes.buffer, p, 128)
    const type = d.getUint8(66),
      length = d.getUint16(64, true)
    if (![0, 1, 2, 5].includes(type)) fail('damaged')
    if (type && (length < 2 || length > 64 || length % 2 || d.getUint16(length - 2, true) !== 0))
      fail('damaged')
    let name = ''
    if (type) {
      for (let i = 0; i < length - 2; i += 2) name += String.fromCharCode(d.getUint16(i, true))
    }
    if (type && (!name || name.includes('\u0000') || /[/\\!]/.test(name))) fail('damaged')
    const size = d.getUint32(120, true) + d.getUint32(124, true) * 2 ** 32
    if (size > DOCX_ENCRYPTION_MAX_CONTAINER_BYTES) fail('budget')
    dirs.push({
      name,
      type,
      size,
      left: d.getUint32(68, true),
      right: d.getUint32(72, true),
      child: d.getUint32(76, true),
      start: d.getUint32(116, true),
    })
  }
  const root = dirs[0]
  if (
    !root ||
    root.type !== 5 ||
    root.left !== FREE ||
    root.right !== FREE ||
    dirs.slice(1).some((d) => d.type === 5)
  )
    fail('damaged')
  const paths = new Map<number, string>(),
    visited = new Set<number>([0])
  const walk = (id: number, parent: string, depth: number) => {
    if (id === FREE) return
    if (depth > 64 || visited.has(id) || !dirs[id]?.type) fail('damaged')
    visited.add(id)
    const d = dirs[id]!,
      path = `${parent}/${d.name.toLowerCase()}`
    if ([...paths.values()].includes(path)) fail('damaged')
    paths.set(id, path)
    walk(d.left, parent, depth + 1)
    walk(d.right, parent, depth + 1)
    if (d.type === 1) walk(d.child, path, depth + 1)
    else if (d.child !== FREE) fail('damaged')
  }
  walk(root.child, '', 0)
  if (dirs.some((d, i) => d.type && !visited.has(i))) fail('damaged')
  const miniFatBytes = u32(64) ? chain(u32(60), u32(64) * sectorSize) : new Uint8Array()
  if (!u32(64) && u32(60) !== END && u32(60) !== FREE) fail('damaged')
  if (root.size % 64) fail('damaged')
  const miniStream = root.size ? chain(root.start, root.size) : new Uint8Array()
  const miniClaimed = new Set<number>()
  const readStream = (d: Directory) => {
    if (!d.size) return new Uint8Array()
    if (d.size >= 4096) return chain(d.start, d.size)
    const output = new Uint8Array(d.size)
    let id = d.start,
      n = 0
    while (id !== END) {
      if (
        (id + 1) * 64 > miniStream.length ||
        id * 4 >= miniFatBytes.length ||
        miniClaimed.has(id) ||
        n >= Math.ceil(d.size / 64)
      )
        fail('damaged')
      miniClaimed.add(id)
      output.set(miniStream.subarray(id * 64, id * 64 + Math.min(64, d.size - n * 64)), n * 64)
      id = word(miniFatBytes, id * 4)
      n++
    }
    if (n !== Math.ceil(d.size / 64)) fail('damaged')
    return output
  }
  let info: Uint8Array | undefined, encrypted: Uint8Array | undefined
  for (const [index, path] of paths) {
    const d = dirs[index]!
    if (d.type !== 2) continue
    if (path === '/encryptioninfo') {
      if (d.name !== 'EncryptionInfo' || d.size > 65536) fail('damaged')
      info = readStream(d)
    } else if (path === '/encryptedpackage') {
      if (d.name !== 'EncryptedPackage') fail('damaged')
      encrypted = readStream(d)
    } else {
      if (d.size > 1024 * 1024) fail('budget')
      readStream(d)
    }
  }
  if (!info || !encrypted) fail('damaged')
  return { info, package: encrypted }
}
/** The writer only sees trusted generated streams; output is re-read by our strict reader. */
export function writeEncryptionContainer(info: Uint8Array, encrypted: Uint8Array): Uint8Array {
  const file = CFB.utils.cfb_new()
  CFB.utils.cfb_add(file, 'EncryptionInfo', info)
  CFB.utils.cfb_add(file, 'EncryptedPackage', encrypted)
  CFB.utils.cfb_del(file, '\u0001Sh33tJ5')
  const output = new Uint8Array(CFB.write(file, { type: 'array', fileType: 'cfb' }))
  readEncryptionContainer(output)
  return output
}
