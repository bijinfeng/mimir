import JSZip from 'jszip'

/** 浏览器内 Office 打开预算。服务端正文提取有独立的更低预算（D-109）。 */
export const MAX_ZIP_INPUT_BYTES = 50 * 1024 * 1024
export const MAX_ZIP_PARTS = 10_000
export const MAX_ZIP_ENTRY_BYTES = 64 * 1024 * 1024
export const MAX_ZIP_TOTAL_BYTES = 400 * 1024 * 1024

interface ZipLimits {
  inputBytes: number
  parts: number
  entryBytes: number
  totalBytes: number
}

const DEFAULT_LIMITS: ZipLimits = {
  inputBytes: MAX_ZIP_INPUT_BYTES,
  parts: MAX_ZIP_PARTS,
  entryBytes: MAX_ZIP_ENTRY_BYTES,
  totalBytes: MAX_ZIP_TOTAL_BYTES,
}

/** JSZip 3.10.2 的运行时流接口；其 .d.ts 未公开 internalStream。 */
interface InternalZipStream {
  on(event: 'data', callback: (chunk: Uint8Array) => void): this
  on(event: 'error', callback: (error: Error) => void): this
  on(event: 'end', callback: () => void): this
  resume(): this
  pause(): this
}

/**
 * JSZip 的 `file.async()` 会先物化整个条目。这里改走 internalStream 的
 * data 回调，在每个输出块到达时检查预算并 pause，而非事后检查长度。
 */
async function readEntry(
  file: JSZip.JSZipObject,
  entryLimit: number,
  totalRemaining: number,
  collect: boolean,
): Promise<{ data: Uint8Array | null; size: number }> {
  return new Promise((resolve, reject) => {
    const stream = (
      file as JSZip.JSZipObject & { internalStream(type: 'uint8array'): InternalZipStream }
    ).internalStream('uint8array')
    const chunks: Uint8Array[] = []
    let size = 0
    let settled = false

    stream.on('data', (chunk) => {
      if (settled) return
      size += chunk.byteLength
      if (size > entryLimit || size > totalRemaining) {
        settled = true
        stream.pause()
        reject(
          new Error(
            size > entryLimit
              ? `Office ZIP 单个部件超过 ${entryLimit} 字节：${file.name}`
              : `Office ZIP 累计解压量超过预算：${file.name}`,
          ),
        )
        return
      }
      if (collect) chunks.push(new Uint8Array(chunk))
    })
    stream.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
    stream.on('end', () => {
      if (settled) return
      settled = true
      if (!collect) {
        resolve({ data: null, size })
        return
      }
      const data = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        data.set(chunk, offset)
        offset += chunk.byteLength
      }
      resolve({ data, size })
    })
    stream.resume()
  })
}

export class BoundedZip {
  private readonly cached = new Map<string, Uint8Array>()
  private totalBytes = 0

  private constructor(
    private readonly zip: JSZip,
    private readonly limits: ZipLimits,
    private readonly names: string[],
  ) {}

  static async open(bytes: Uint8Array, limits: ZipLimits = DEFAULT_LIMITS): Promise<BoundedZip> {
    if (bytes.byteLength > limits.inputBytes) {
      throw new Error(`Office ZIP 压缩包超过 ${limits.inputBytes} 字节`)
    }
    const zip = await JSZip.loadAsync(bytes)
    const names = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir)
    if (names.length > limits.parts) throw new Error(`Office ZIP 部件数超过 ${limits.parts}`)
    return new BoundedZip(zip, limits, names)
  }

  list(prefix = ''): string[] {
    return this.names.filter((name) => name.startsWith(prefix))
  }

  async read(path: string): Promise<Uint8Array | null> {
    const cached = this.cached.get(path)
    if (cached) return cached
    const file = this.zip.files[path]
    if (!file || file.dir) return null
    const remaining = this.limits.totalBytes - this.totalBytes
    const { data, size } = await readEntry(file, this.limits.entryBytes, remaining, true)
    this.totalBytes += size
    this.cached.set(path, data!)
    return data
  }

  async readText(path: string): Promise<string | null> {
    const data = await this.read(path)
    return data === null ? null : new TextDecoder('utf-8').decode(data)
  }

  /** 编辑路径保留每个条目的原字节，以便补丁式保存。 */
  async readAll(): Promise<Map<string, Uint8Array>> {
    for (const name of this.names) await this.read(name)
    return new Map(this.cached)
  }

  /** docx 的 vendored 解析器前预检；不保留解压字节，不修改 vendor。 */
  async preflightAll(): Promise<void> {
    let total = 0
    for (const name of this.names) {
      const file = this.zip.files[name]!
      const { size } = await readEntry(
        file,
        this.limits.entryBytes,
        this.limits.totalBytes - total,
        false,
      )
      total += size
    }
  }
}
