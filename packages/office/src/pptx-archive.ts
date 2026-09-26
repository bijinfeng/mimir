import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import type { SlideSize } from '../vendor/packages/pptx-engine/src/types.js'

/**
 * pptx 的**压缩包读写层**（浏览器安全）。
 *
 * ## 为什么不用上游的 `PackageArchive`
 *
 * 上游那个类依赖 `node:crypto`（保存前的 sha256）与 `Buffer`，在浏览器里
 * 跑不了。所以这里是它的等价实现，**逐条对着上游
 * `packages/pptx-engine/src/zip.ts` 写**（`readRels` / `readPresentation` /
 * `resolveSlideChain` / `fallbackLayoutPath` / `entries`），
 * 行为上的差异是刻意的，写在这里：
 *
 *   1. **不做 sha256**。上游用它防止「保存前文件被外部改了」。单客户端下
 *      没有消费者；用便宜的 FNV-1a 占位，避免为一个没人读的字段引入
 *      `node:crypto`。字段名仍是 `fingerprint`，**不要**当密码学哈希用
 *   2. **`entries` 是公开可变的**（不是私有）。保存路径的整个前提就是
 *      「没动过的条目原样写回」，而「原样」只有拿着原始字节才做得到
 *      （见 `src/pptx-save.ts`）
 *
 * ## 为什么把全部条目读进内存
 *
 * 上游就是这么做的，而这不是随意选择：**补丁式保存要求每个条目的原始字节
 * 都在手里**——保存时要逐字节写回没动过的条目。
 *
 * 代价是内存。所以 `open` 时按**实际解压出的总字节数**记账并设上限
 * （`MAX_TOTAL_UNCOMPRESSED_BYTES`）。用 zip 头部声明的大小是不成立的：
 * 那是文件自己写的，一个恶意文件可以声明 1KB 实际炸 1GB。
 *
 * 这里**不是**「顺带把预览也改成预加载」——预览与编辑共用同一个 archive，
 * 两套读取语义（一套异步按需、一套同步预加载）只会让调用方到处判断。
 * 统一成预加载 + 同步读，代价由那个上限兜住。
 */

const NS_RELS = 'http://schemas.openxmlformats.org/package/2006/relationships'

export interface Relationship {
  id: string
  type: string
  target: string
  targetMode?: string
}

const relsParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'Relationship' || name === 'sldId' || name === 'Override',
})

const presentationParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'p:sldId',
})

/** XML 节点：属性带 `@_` 前缀（fast-xml-parser 的约定） */
type XmlNode = Record<string, unknown>

function asNode(value: unknown): XmlNode {
  return (value ?? {}) as XmlNode
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

/** UTF-8 编解码（替代上游的 `Buffer.from(x, 'utf8')` / `Buffer.toString('utf8')`） */
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8')

export class PptxArchive {
  private constructor(
    /**
     * 每个条目的**原始字节**，键是 zip 内的路径。
     *
     * 公开可变：保存路径要原样写回它们，新增关系/媒体时也要往里塞
     * （上游的 `appendRel` 就是这么做的）。
     */
    readonly entries: Map<string, Uint8Array>,
    /** 便宜的内容指纹（**不是**上游的 sha256，见文件头） */
    readonly fingerprint: string,
  ) {}

  static async open(bytes: Uint8Array): Promise<PptxArchive> {
    const zip = await JSZip.loadAsync(bytes)
    assertWithinLimits(zip)

    const entries = new Map<string, Uint8Array>()
    let total = 0
    for (const name of Object.keys(zip.files)) {
      const file = zip.files[name]
      if (!file || file.dir) continue
      const data = await file.async('uint8array')
      total += data.byteLength
      if (total > MAX_TOTAL_UNCOMPRESSED_BYTES) {
        throw new Error(
          `这份 pptx 解压后过大（累计超过 ${Math.round(MAX_TOTAL_UNCOMPRESSED_BYTES / 1024 / 1024)}MB），已停止解析`,
        )
      }
      entries.set(name, data)
    }

    return new PptxArchive(entries, fnv1a(bytes))
  }

  has(path: string): boolean {
    return this.entries.has(path)
  }

  /** 读一个部件为 UTF-8 字符串。不存在时返回 null（而不是抛错） */
  readText(path: string): string | null {
    const bytes = this.entries.get(path)
    return bytes ? decoder.decode(bytes) : null
  }

  /** 读一个部件为原始字节（图片等） */
  readBytes(path: string): Uint8Array | null {
    return this.entries.get(path) ?? null
  }

  /** 写入/替换一个条目（保存路径用：新增关系、改幻灯片 XML） */
  setEntry(path: string, data: Uint8Array | string): void {
    this.entries.set(path, typeof data === 'string' ? encoder.encode(data) : data)
  }

  /** 删除一个条目（保存路径用：清理不再被引用的媒体/字体） */
  deleteEntry(path: string): void {
    this.entries.delete(path)
  }

  /** 一个部件的全部条目路径 */
  entryNames(): string[] {
    return [...this.entries.keys()]
  }

  /**
   * 把这份演示文稿里**所有图片**取出来，做成 `zip 路径 → data URL` 的表。
   *
   * ## 为什么要预先全取，而不是按需
   *
   * 渲染层的 `MediaResolver` 是**同步**的（`mediaRef → dataUrl`）——它的调用点
   * 埋在 `resolveFill` / `buildNode` 里，那些函数都是纯同步的。所以只有两条路：
   * 把整条渲染路径改成异步，或者先把图片读出来。这里是后者——图片总量本来就
   * 不大（一份演示文稿通常几 MB），一次读完换来渲染层的纯同步（可测试）。
   *
   * ## 只取图片，不取视频/音频
   *
   * `<a:videoFile>` / `<a:audioFile>` 可能是几十 MB 的视频，而预览只需要
   * 那张**海报帧**（本身就是一张图片，会以 blipFill 出现）。所以这里按
   * 扩展名过滤到图片格式，不把视频整段转成 base64。
   */
  readMediaDataUrls(): Map<string, string> {
    const out = new Map<string, string>()
    const imageExt = /\.(png|jpe?g|gif|bmp|webp|svg|tiff?|emf|wmf)$/i

    for (const [name, bytes] of this.entries) {
      if (!name.startsWith('ppt/media/')) continue
      if (/\.(mp4|m4v|mov|avi|wmv|mp3|m4a|wav|wma)$/i.test(name)) continue
      if (!imageExt.test(name)) continue
      out.set(name, toDataUrl(name, bytes))
    }
    return out
  }

  /** 一个部件的 .rels 表。没有 rels 时返回空表 */
  readRels(partPath: string): Map<string, Relationship> {
    const rels = new Map<string, Relationship>()
    const xml = this.readText(relsPathFor(partPath))
    if (!xml) return rels

    const doc = asNode(relsParser.parse(xml))
    const list = asNode(doc.Relationships).Relationship
    for (const raw of asArray(list)) {
      const r = asNode(raw)
      const id = String(r['@_Id'] ?? '')
      if (!id) continue
      rels.set(id, {
        id,
        type: String(r['@_Type'] ?? ''),
        target: String(r['@_Target'] ?? ''),
        ...(r['@_TargetMode'] != null ? { targetMode: String(r['@_TargetMode']) } : {}),
      })
    }
    return rels
  }

  /** 演示文稿的画布尺寸与**按顺序**的幻灯片部件路径 */
  readPresentation(): { size: SlideSize; slidePaths: string[] } {
    const presXml = this.readText('ppt/presentation.xml')
    if (!presXml) throw new Error('这不是一份有效的 pptx（缺少 ppt/presentation.xml）')

    const pres = asNode(presentationParser.parse(presXml))
    const root = asNode(pres['p:presentation'] ?? pres.presentation)
    if (Object.keys(root).length === 0) throw new Error('ppt/presentation.xml 结构不对')

    const szRaw = root['p:sldSz'] ?? root.sldSz
    const sz = szRaw ? asNode(szRaw) : null
    const size: SlideSize = {
      // 默认 10in × 7.5in（4:3）
      cx: sz ? emuOr(sz['@_cx'], 9144000) : 9144000,
      cy: sz ? emuOr(sz['@_cy'], 6858000) : 6858000,
    }

    // 幻灯片顺序由 presentation.xml.rels 的 r:id → 部件路径决定
    const rels = this.readRels('ppt/presentation.xml')
    const sldIdLst = asNode(root['p:sldIdLst'] ?? root.sldIdLst)
    const slidePaths: string[] = []
    for (const raw of asArray(sldIdLst['p:sldId'])) {
      const id = asNode(raw)
      const rId = id['@_r:id'] ?? id['@_id']
      if (!rId) continue
      const rel = rels.get(String(rId))
      if (!rel) continue
      slidePaths.push(resolveTarget('ppt/presentation.xml', rel.target))
    }
    return { size, slidePaths }
  }

  /** 一张幻灯片的版式 / 母版 / 主题部件路径（沿 rels 链上溯） */
  resolveSlideChain(slidePath: string): {
    layoutPath?: string
    masterPath?: string
    themePath?: string
  } {
    const slideRels = this.readRels(slidePath)
    let layoutPath: string | undefined
    for (const rel of slideRels.values()) {
      if (rel.type.endsWith('/slideLayout')) {
        layoutPath = resolveTarget(slidePath, rel.target)
        break
      }
    }
    /**
     * 损坏的 pptx 会带没有 rels（或没有必需的 slideLayout 关系）的幻灯片。
     * PowerPoint 拒绝这种文件；LibreOffice 拿第一个母版的第一个版式渲染，
     * 于是保住了背景与装饰——这里照做，否则用户看到的是「幻灯片是空的」。
     */
    layoutPath ??= this.fallbackLayoutPath(slidePath)

    let masterPath: string | undefined
    let themePath: string | undefined
    if (layoutPath) {
      for (const rel of this.readRels(layoutPath).values()) {
        if (rel.type.endsWith('/slideMaster')) {
          masterPath = resolveTarget(layoutPath, rel.target)
          break
        }
      }
    }
    if (masterPath) {
      for (const rel of this.readRels(masterPath).values()) {
        if (rel.type.endsWith('/theme')) {
          themePath = resolveTarget(masterPath, rel.target)
          break
        }
      }
    }
    return { layoutPath, masterPath, themePath }
  }

  /**
   * 丢了 slideLayout 关系的幻灯片用哪个版式：母版 `sldLayoutIdLst` 顺序里的第一个，
   * 若这张幻灯片带 `ctrTitle` 占位符则优先那个标题版式（即它本来多半会引用的那个）。
   */
  private fallbackLayoutPath(slidePath: string): string | undefined {
    const presXml = this.readText('ppt/presentation.xml')
    if (!presXml) return undefined

    const presRels = this.readRels('ppt/presentation.xml')
    const masterRid = /<p:sldMasterId\b[^>]*\br:id="([^"]+)"/.exec(presXml)?.[1]
    const masterRel = masterRid
      ? presRels.get(masterRid)
      : [...presRels.values()].find((r) => r.type.endsWith('/slideMaster'))
    if (!masterRel) return undefined

    const masterPath = resolveTarget('ppt/presentation.xml', masterRel.target)
    const masterXml = this.readText(masterPath)
    if (!masterXml) return undefined

    const masterRels = this.readRels(masterPath)
    const layouts: string[] = []
    for (const m of masterXml.matchAll(/<p:sldLayoutId\b[^>]*\br:id="([^"]+)"/g)) {
      const rel = m[1] ? masterRels.get(m[1]) : undefined
      if (rel) layouts.push(resolveTarget(masterPath, rel.target))
    }
    if (layouts.length === 0) {
      for (const rel of masterRels.values()) {
        if (rel.type.endsWith('/slideLayout')) layouts.push(resolveTarget(masterPath, rel.target))
      }
    }
    if (layouts.length === 0) return undefined

    const wantsTitle = /<p:ph\b[^>]*\btype="ctrTitle"/.test(this.readText(slidePath) ?? '')
    if (wantsTitle) {
      for (const p of layouts) {
        if (/<p:sldLayout\b[^>]*\btype="title"/.test(this.readText(p) ?? '')) return p
      }
    }
    return layouts[0]
  }
}

/**
 * 字节 → data URL。
 *
 * `FileReader.readAsDataURL` 是浏览器专属，而这一层在测试里跑在 Node 上
 * （`pnpm test`）。所以这里手写 base64：浏览器与 Node 都有 `btoa`，
 * 但它只吃 latin1 字符串，所以先分块转（一次全转会在几十 MB 的图上
 * 撑爆调用栈——`String.fromCharCode(...bytes)` 的参数个数有上限）。
 */
function toDataUrl(name: string, bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return `data:${mimeOf(name)};base64,${btoa(binary)}`
}

/** 按扩展名给 MIME。取不到时给 `application/octet-stream`（浏览器仍会按内容嗅探） */
function mimeOf(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  const table: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    emf: 'image/emf',
    wmf: 'image/wmf',
  }
  return table[ext] ?? 'application/octet-stream'
}

/** `ppt/slides/slide1.xml` → `ppt/slides/_rels/slide1.xml.rels` */
export function relsPathFor(partPath: string): string {
  const idx = partPath.lastIndexOf('/')
  const dir = idx >= 0 ? partPath.slice(0, idx) : ''
  const name = idx >= 0 ? partPath.slice(idx + 1) : partPath
  return dir ? `${dir}/_rels/${name}.rels` : `_rels/${name}.rels`
}

/** 把 rels 里的 Target 解析成 zip 内的绝对路径（处理 `../` 与绝对路径两种写法） */
export function resolveTarget(basePart: string, target: string): string {
  // 绝对路径（以 / 开头）与外部链接（TargetMode="External"）分别处理
  if (target.startsWith('/')) return target.slice(1)
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target

  const baseDir = basePart.includes('/') ? basePart.slice(0, basePart.lastIndexOf('/')) : ''
  const parts = `${baseDir}/${target}`.split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

/**
 * 压缩包边界。
 *
 * 两条都是**便宜且成立**的检查：
 *   - **条目数**：中央目录里的条目数（读一次即可，文件自己声明的值在这里
 *     是可信的——它决定不了我们要分配多少内存）
 *   - **累计解压量**：在 `readEntry` 里按实际解出的字节记账。用声明值是不
 *     成立的（恶意文件可以声明 1KB 实际炸 1GB），所以那条没做
 */
function assertWithinLimits(zip: JSZip): void {
  const count = Object.values(zip.files).filter((f) => !f.dir).length
  if (count > MAX_PARTS) {
    throw new Error(`这份 pptx 的部件数异常（${count} 个，超过 ${MAX_PARTS}）`)
  }
}

/** 部件数上限。一张幻灯片至少一个部件，一万个足够任何真实演示文稿 */
const MAX_PARTS = 10000

/**
 * 累计解压上限（字节）。取 400MB：一份 50MB 的 pptx（上传上限）正常展开
 * 大约是这个量级，而解压炸弹会远超它。
 */
const MAX_TOTAL_UNCOMPRESSED_BYTES = 400 * 1024 * 1024

/** FNV-1a 32 位。**不是**密码学哈希，只用来给「同一份文件」一个稳定标识 */
function fnv1a(bytes: Uint8Array): string {
  let hash = 0x811c9dc5
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * 读一个 `sldSz` 属性。
 *
 * 坏掉的 presentation.xml 可能给出缺字段或非数字的尺寸，而没有这个兜底
 * `parseInt` 会产出 NaN——它会污染后面每一处版式计算（症状是整页画到
 * 坐标 `NaN`，也就是**什么都不显示**）。
 */
function emuOr(raw: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(raw), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export { NS_RELS }
