import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import type { SlideSize } from '../vendor/packages/pptx-engine/src/types.js'

/**
 * pptx 的**压缩包读取层**（浏览器安全）。
 *
 * ## 为什么不用上游的 `PackageArchive`
 *
 * 上游那个类在一个文件里同时做了两件事：读（开 zip、读 rels、列幻灯片）与
 * **写**（`entries` 保留每个条目的原始字节，保存时逐字节写回；`originalHash`
 * 是保存前的 sha256）。写那一半依赖 `node:crypto` 与 `Buffer`，在浏览器里
 * 跑不了——而 mimir 的 pptx 预览是**只读**的，不需要那半。
 *
 * 所以这里是读的那半的等价实现，**逐条对着上游 `packages/pptx-engine/src/zip.ts`
 * 写**（`readRels` / `readPresentation` / `resolveSlideChain` /
 * `fallbackLayoutPath`），行为上的差异只有两处，都写在下面。
 *
 * ## 与上游的两处差异（刻意的）
 *
 *   1. **不做 sha256**。上游用它防止「保存前文件被外部改了」。我们不保存，
 *      所以这个值没有消费者；用便宜的 FNV-1a 占位，避免为一个没人读的字段
 *      引入 `node:crypto`。字段名仍是 `originalHash`（类型来自上游），
 *      但**不要**把它当密码学哈希用
 *   2. **不缓存每个条目的原始字节**。上游缓存是为了保存时原样写回；只读预览
 *      按需解压更省内存（一个 50MB 的 pptx 展开后可能几百 MB）
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

export class PptxArchive {
  /** 已读出的字节总数（用来挡住「解压炸弹」，见 `readEntry`） */
  private bytesRead = 0

  private constructor(
    private readonly zip: JSZip,
    /** 便宜的内容指纹（**不是**上游的 sha256，见文件头） */
    readonly fingerprint: string,
  ) {}

  static async open(bytes: Uint8Array): Promise<PptxArchive> {
    const zip = await JSZip.loadAsync(bytes)
    assertWithinLimits(zip)
    return new PptxArchive(zip, fnv1a(bytes))
  }

  has(path: string): boolean {
    return this.zip.file(path) !== null
  }

  /** 读一个部件为 UTF-8 字符串。不存在时返回 null（而不是抛错） */
  async readText(path: string): Promise<string | null> {
    const bytes = await this.readEntry(path)
    if (!bytes) return null
    return new TextDecoder('utf-8').decode(bytes)
  }

  /** 读一个部件为原始字节（图片等） */
  async readBytes(path: string): Promise<Uint8Array | null> {
    return this.readEntry(path)
  }

  /**
   * 解压一个条目，并在**真的解出来之后**按实际长度记账。
   *
   * ## 为什么不用 zip 头部声明的 `uncompressedSize`
   *
   * 那个值写在中央目录里，是**文件自己声明的**——一个恶意文件可以声明 1KB
   * 而实际展开 1GB（这就是解压炸弹的做法）。基于声明的检查根本不成立，
   * 而要读 JSZip 的私有字段才能拿到它，改版就静默失效。
   *
   * 所以这里按**实际解压出来的长度**记账：累计超过上限就抛错。
   * 单次解压仍然会分配那一块内存（JSZip 的 `async()` 没有流式接口），
   * 但单个条目不可能超过它自己声明的压缩后大小乘以一个小倍数——
   * 而我们要挡的是「几十个小条目各炸成几百 MB」那种累积放大。
   *
   * 真正的第一道闸门仍然在上传端点（`FILE_MAX_BYTES`，50MB）。
   */
  private async readEntry(path: string): Promise<Uint8Array | null> {
    const file = this.zip.file(path)
    if (!file) return null
    const bytes = await file.async('uint8array')

    this.bytesRead += bytes.byteLength
    if (this.bytesRead > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error(
        `这份 pptx 解压后过大（累计超过 ${Math.round(MAX_TOTAL_UNCOMPRESSED_BYTES / 1024 / 1024)}MB），已停止解析`,
      )
    }
    return bytes
  }

  /** 一个部件的 .rels 表。没有 rels 时返回空表 */
  async readRels(partPath: string): Promise<Map<string, Relationship>> {
    const rels = new Map<string, Relationship>()
    const xml = await this.readText(relsPathFor(partPath))
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
  async readPresentation(): Promise<{ size: SlideSize; slidePaths: string[] }> {
    const presXml = await this.readText('ppt/presentation.xml')
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
    const rels = await this.readRels('ppt/presentation.xml')
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
  async resolveSlideChain(slidePath: string): Promise<{
    layoutPath?: string
    masterPath?: string
    themePath?: string
  }> {
    const slideRels = await this.readRels(slidePath)
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
    layoutPath ??= await this.fallbackLayoutPath(slidePath)

    let masterPath: string | undefined
    let themePath: string | undefined
    if (layoutPath) {
      for (const rel of (await this.readRels(layoutPath)).values()) {
        if (rel.type.endsWith('/slideMaster')) {
          masterPath = resolveTarget(layoutPath, rel.target)
          break
        }
      }
    }
    if (masterPath) {
      for (const rel of (await this.readRels(masterPath)).values()) {
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
  private async fallbackLayoutPath(slidePath: string): Promise<string | undefined> {
    const presXml = await this.readText('ppt/presentation.xml')
    if (!presXml) return undefined

    const presRels = await this.readRels('ppt/presentation.xml')
    const masterRid = /<p:sldMasterId\b[^>]*\br:id="([^"]+)"/.exec(presXml)?.[1]
    const masterRel = masterRid
      ? presRels.get(masterRid)
      : [...presRels.values()].find((r) => r.type.endsWith('/slideMaster'))
    if (!masterRel) return undefined

    const masterPath = resolveTarget('ppt/presentation.xml', masterRel.target)
    const masterXml = await this.readText(masterPath)
    if (!masterXml) return undefined

    const masterRels = await this.readRels(masterPath)
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

    const wantsTitle = /<p:ph\b[^>]*\btype="ctrTitle"/.test((await this.readText(slidePath)) ?? '')
    if (wantsTitle) {
      for (const p of layouts) {
        if (/<p:sldLayout\b[^>]*\btype="title"/.test((await this.readText(p)) ?? '')) return p
      }
    }
    return layouts[0]
  }

  /** 一个部件的全部条目路径（图片、媒体等按需取用） */
  entryNames(): string[] {
    return Object.keys(this.zip.files)
  }

  /**
   * 把这份演示文稿里**所有图片**取出来，做成 `zip 路径 → data URL` 的表。
   *
   * ## 为什么要预先全取，而不是按需
   *
   * 渲染层的 `MediaResolver` 是**同步**的（`mediaRef → dataUrl`）——它的调用点
   * 埋在 `resolveFill` / `buildNode` 里，那些函数都是纯同步的。而 JSZip 读条目
   * 是异步的。所以只有两条路：把整条渲染路径改成异步，或者先把图片读出来。
   * 这里是后者——图片总量本来就不大（一份演示文稿通常几 MB），一次读完
   * 换来渲染层的纯同步（可测试、无 await 传染）。
   *
   * ## 只取图片，不取视频/音频
   *
   * `<a:videoFile>` / `<a:audioFile>` 可能是几十 MB 的视频，而预览只需要
   * 那张**海报帧**（本身就是一张图片，会以 blipFill 出现）。所以这里按
   * 扩展名过滤到图片格式，不把视频整段读进内存。
   */
  async readMediaDataUrls(): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    const imageExt = /\.(png|jpe?g|gif|bmp|webp|svg|tiff?|emf|wmf)$/i

    for (const name of Object.keys(this.zip.files)) {
      if (!name.startsWith('ppt/media/')) continue
      // 视频/音频不读（几十 MB，而预览只用它的海报帧）
      if (/\.(mp4|m4v|mov|avi|wmv|mp3|m4a|wav|wma)$/i.test(name)) continue
      if (!imageExt.test(name)) continue

      const bytes = await this.readBytes(name)
      if (!bytes) continue
      out.set(name, toDataUrl(name, bytes))
    }
    return out
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
