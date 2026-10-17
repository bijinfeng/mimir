import { and, eq, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { contentHash, decodeUploadedText, toExcerpt } from '../lib/text.js'
import {
  FILE_MAX_BYTES,
  extensionOf,
  formatBytes,
  mimeFromFilename,
  titleFromFilename,
  type FileUploadResponse,
} from '@mimir/shared'
import { publishFileReplacement } from '../db/document-index.js'
import { sameUpload, uploadIdentity, withDocumentPublication } from '../lib/document-publication.js'
import { db } from '../db/client.js'
import { documents } from '../db/schema.js'
import { toSearchText } from '@mimir/tokenizer'
import {
  metaKey,
  readUploadMeta,
  removeUpload,
  replacementUploadKey,
  writeUpload,
  type UploadMeta,
} from '../lib/uploads.js'
import { activeStorage } from '../plugins/host.js'
import { rebuildChunksAndEmbed } from './chunks.js'
import { createNote, loadTags, syncTags } from './documents.js'
import { ensureFolders, normalizeFolder } from './folders.js'
import { extractText } from './extract.js'

/**
 * 文件上传的编排（`.trellis/spec/project/architecture.md` §13）。
 *
 * ## 它做四件事，顺序是刻意的
 *
 *   1. 校验（大小）——**在写任何文件之前**
 *   2. `.md` 走 `createNote`：导入为笔记，进 vault、可编辑（见下）
 *   3. 其他：写原件 → 写 meta.json → 提取正文 → 写数据库行
 *   4. 如实报告结果（含「提取失败」这一种成功）
 *
 * ## `.md` 上传为什么变成笔记
 *
 * 它是**可编辑格式**，做成只读副本会立刻产生两个真相：原件不再变、而正文
 * 可以改——两边不一致时谁对？所以 `.md` 走笔记路径：进 vault、
 * 编辑器打开、算「我的笔记」、检索加权。用户想存一份「只读的 md 资料」
 * 是罕见需求，而想「把手头这份 md 收进库里、继续改」是常见需求。
 *
 * 带 frontmatter 时读 `title` / `tags`（见 `lib/vault.ts` 的解析），
 * 读不出就用文件名。
 *
 * ## 提取失败**不是**上传失败
 *
 * 原件已经存下、列表里看得见、能下载、能导出。只是暂时搜不到内容。
 * 这与「嵌入失败绝不让写入失败」是同一条判断（`.trellis/spec/project/architecture.md` §4.10）：
 * **检索是可选能力，收藏是核心**。所以函数正常返回，用 `charCount` 与
 * `parseError` 两个字段分别报告，让界面说实话。
 */

export interface UploadInput {
  filename: string
  /** 浏览器声明的内容类型。**只作为扩展名认不出时的兜底**——见 `mimeFromFilename` */
  declaredMime?: string
  data: Uint8Array
  /** 用户上传时给的标签（可选）。目前界面不传，留给未来的批量导入 */
  tags?: string[]
  /**
   * 归入的目录（可选）。从知识库页上传时带上——「上传文件夹」展开出的
   * 相对子路径也拼在这里（如 `知识库/资料/论文`），由 `ensureFolders`
   * mkdir -p 补注册表行。
   */
  folder?: string
}

export async function uploadFile(input: UploadInput): Promise<FileUploadResponse> {
  const filename = input.filename.trim() || 'unnamed'
  const mime = mimeFromFilename(filename, input.declaredMime)

  // 上限必须在写文件之前判——先写再判会留下一个永远不会被引用的文件
  if (input.data.byteLength > FILE_MAX_BYTES) {
    throw new UploadError(
      'TOO_LARGE',
      `文件太大（${formatBytes(input.data.byteLength)}），上限 ${formatBytes(FILE_MAX_BYTES)}`,
    )
  }
  if (input.data.byteLength === 0) {
    throw new UploadError('EMPTY_FILE', '文件是空的')
  }

  // `.md` → 笔记。判定用扩展名而不是 mime：`.md` 常被浏览器报成 text/plain，
  // 而「用户传的是不是 markdown 文件」这件事只有文件名知道
  if (isMarkdownFilename(filename)) {
    return importMarkdownAsNote(filename, input.data, input.tags ?? [], input.folder)
  }

  return importAsFile(filename, mime, input.data, input.tags ?? [], input.folder)
}

export class UploadError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'UploadError'
  }
}

function isMarkdownFilename(filename: string): boolean {
  return /\.(md|markdown)$/i.test(filename)
}

/** `.md` → 笔记。frontmatter 的 title / tags 会用上，读不出就用文件名 */
async function importMarkdownAsNote(
  filename: string,
  data: Uint8Array,
  tags: string[],
  folder?: string,
): Promise<FileUploadResponse> {
  const text = decodeUploadedText(data)
  const { frontmatter, body } = splitFrontmatter(text)

  const title = frontmatter.title ?? titleFromFilename(filename)
  const allTags = [...new Set([...tags, ...(frontmatter.tags ?? [])])]

  const note = await createNote({ title, body, tags: allTags, folder })

  return {
    document: note,
    charCount: body.length,
    parseError: null,
  }
}

/**
 * frontmatter 的最小读法。
 *
 * **刻意不引 gray-matter**：vault 那边的 frontmatter 是我们自己写的
 * （`lib/vault.ts` 用 gray-matter 序列化），而这里读的是**用户从别处拿来的**
 * 文件——它的 frontmatter 可能有任何形状，认不出的键一律忽略。
 * 只读两个标量键（title / tags）用不着一个完整 YAML 解析器：
 * 复杂结构（嵌套、多行字符串）在这里只会被忽略，而忽略是安全的方向。
 */
function splitFrontmatter(text: string): {
  frontmatter: { title?: string; tags?: string[] }
  body: string
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!match) return { frontmatter: {}, body: text }

  const raw = match[1] ?? ''
  const body = text.slice(match[0].length)
  const frontmatter: { title?: string; tags?: string[] } = {}

  for (const line of raw.split('\n')) {
    const title = /^title:\s*(.+)$/.exec(line.trim())
    if (title?.[1]) {
      frontmatter.title = title[1]
        .trim()
        .replace(/^["']|["']$/g, '')
        .slice(0, 200)
      continue
    }

    // `tags: [a, b]` 与 `tags:\n  - a\n  - b` 两种都读——前者是我们的写法，
    // 后者是 Obsidian 等工具的写法，用户从那里导出来的文件多是后者
    const inline = /^tags:\s*\[(.+)\]$/.exec(line.trim())
    if (inline?.[1] !== undefined) {
      frontmatter.tags = inline[1]
        .split(',')
        .map((tag) => tag.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
      continue
    }

    const single = /^tags:\s*(\S.+)$/.exec(line.trim())
    if (single?.[1] && !single[1].startsWith('-')) {
      frontmatter.tags = single[1]
        .split(/[,\s]+/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    }
  }

  // `tags:` 后面跟列表的写法
  const listBlock = /^tags:\s*\n((?:\s*-\s*.+\n?)+)/m.exec(raw)
  if (listBlock?.[1]) {
    frontmatter.tags = listBlock[1]
      .split('\n')
      .map((line) =>
        line
          .replace(/^\s*-\s*/, '')
          .trim()
          .replace(/^["']|["']$/g, ''),
      )
      .filter(Boolean)
  }

  return { frontmatter, body }
}

/**
 * 非 md 文件：原件 + meta.json + 尽力提取正文。
 *
 * 正文提取放在**写原件之后**：提取可能很慢（一个 50MB 的 xlsx 解压要几秒），
 * 而原件必须先落盘——不然提取到一半进程挂了，原件的字节就只存在于内存里。
 */
async function importAsFile(
  filename: string,
  mime: string,
  data: Uint8Array,
  tags: string[],
  folder?: string,
): Promise<FileUploadResponse> {
  const id = nanoid(16)
  const now = new Date()
  const title = titleFromFilename(filename)

  const extracted = await extractText(filename, mime, data)

  const assignedFolder = folder ? normalizeFolder(folder) || null : null

  const meta: UploadMeta = {
    id,
    title,
    filename,
    mime,
    size: data.byteLength,
    tags,
    folder: assignedFolder,
    status: 'ready',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }

  // 先文件（铁律 2）：原件 → meta.json → 数据库行。目录指派要过
  // ensureFolders——注册表没有的路径先补建（mkdir -p，D-068）
  if (assignedFolder) await ensureFolders(assignedFolder)
  const { key } = await writeUpload(id, filename, data, meta)

  const body = extracted.markdown
  const [row] = await db
    .insert(documents)
    .values({
      id,
      kind: 'file',
      status: 'ready',
      title,
      body,
      excerpt: toExcerpt(body),
      searchText: toSearchText(title, body),
      contentHash: contentHash(body),
      sourceKey: key,
      mime,
      size: data.byteLength,
      parseError: extracted.error,
      folder: assignedFolder,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!row) throw new Error('上传入库失败：数据库未返回记录')

  if (tags.length > 0) await syncTags(id, tags)

  /**
   * 分块 + 尽力嵌入。**这是第四条写入路径**（笔记新建、笔记更新、抓取入库、
   * 上传入库）——上面那三条都调了 `rebuildChunksAndEmbed`，漏掉这一条的
   * 后果是「上传的文件正文提取出来了、也能搜到词，但检索单元在分块表里
   * 没有对应行」——`search.test.ts` 的「文本文件内容可被搜索」当场抓到了它。
   *
   * 失败不让上传失败：文件与数据库都已经写好，重建索引会补上分块。
   */
  await rebuildChunksAndEmbed(id, body).catch((error: unknown) => {
    console.warn(`上传后的分块/嵌入失败（${id}），重建索引可修复：`, error)
  })

  return {
    document: toUploadSummary(row, tags),
    charCount: body.length,
    parseError: extracted.error,
  }
}

/** 与 `services/documents.ts` 的 toSummary 同形状。列多在这里，避免跨模块循环依赖 */
function toUploadSummary(
  row: typeof documents.$inferSelect,
  tags: string[],
): FileUploadResponse['document'] {
  return {
    id: row.id,
    kind: row.kind as FileUploadResponse['document']['kind'],
    status: row.status as FileUploadResponse['document']['status'],
    title: row.title,
    excerpt: row.excerpt,
    tags,
    path: row.path,
    url: row.url,
    mime: row.mime,
    fileExtension: row.kind === 'file' ? extensionOf(row.sourceKey ?? '') || null : null,
    size: row.size,
    folder: row.folder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * 替换一个上传件的原件（`.trellis/spec/project/architecture.md` §13）。
 *
 * ## 为什么需要它
 *
 * 「改一下这份 PDF」的现实路径是：下载 → 用外部工具改 → 传回来。
 * 没有这个动作，用户只能删掉重传——而**标签、目录、整理状态会全丢**，
 * 还得重新整理一遍。这在「重新导出一次季度报告」这种常见动作上尤其烦。
 *
 * ## 保留什么、不保留什么
 *
 * | | 处理 | 理由 |
 * |---|---|---|
 * | 标签 / 目录 / 状态 / 创建时间 | **保留** | 它们是用户整理的结果，与文件内容无关 |
 * | 正文 / 提取错误 / 大小 / mime | 重算 | 内容变了，派生数据全都要跟着变 |
 * | 原文件名 | 用新名字 | 用户多半也在改文件名（`.v2.pdf`），拦着不让改很怪 |
 *
 * 每次替换都用唯一版本 key，同名也不能覆盖数据库当前指向的旧原件。
 */
export async function replaceUpload(
  documentId: string,
  input: UploadInput,
): Promise<FileUploadResponse | null> {
  const response = await withDocumentPublication(documentId, () =>
    replaceUploadLocked(documentId, input),
  )
  if (response)
    await rebuildChunksAndEmbed(
      documentId,
      (
        await db
          .select({ body: documents.body })
          .from(documents)
          .where(eq(documents.id, documentId))
      )[0]?.body ?? '',
    ).catch((error: unknown) => {
      console.warn(`替换原件后的分块/嵌入失败（${documentId}）：`, error)
    })
  return response
}

async function replaceUploadLocked(
  documentId: string,
  input: UploadInput,
): Promise<FileUploadResponse | null> {
  const [existing] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))

  if (!existing || existing.kind !== 'file') return null

  const filename = input.filename.trim() || 'unnamed'
  const mime = mimeFromFilename(filename, input.declaredMime)

  if (input.data.byteLength > FILE_MAX_BYTES) {
    throw new UploadError(
      'TOO_LARGE',
      `文件太大（${formatBytes(input.data.byteLength)}），上限 ${formatBytes(FILE_MAX_BYTES)}`,
    )
  }
  if (input.data.byteLength === 0) throw new UploadError('EMPTY_FILE', '文件是空的')

  const source = await uploadIdentity(documentId)
  const extracted = await extractText(filename, mime, input.data)
  const currentSource = await uploadIdentity(documentId)
  if (source ? !sameUpload(source, currentSource) : currentSource !== null)
    throw new Error('原件已变化，请重新读取后再保存')

  const oldKey = existing.sourceKey
  const rawMeta = await activeStorage()
    .read(metaKey(documentId))
    .catch(() => null)
  const meta = await readUploadMeta(documentId)
  const tags = (await loadTags([documentId])).get(documentId) ?? []
  const now = new Date()

  const key = replacementUploadKey(documentId, filename)
  try {
    await writeUpload(
      documentId,
      filename,
      input.data,
      meta === null
        ? {
            id: documentId,
            title: existing.title,
            filename,
            mime,
            size: input.data.byteLength,
            tags,
            folder: existing.folder,
            status: existing.status,
            createdAt: existing.createdAt.toISOString(),
            updatedAt: now.toISOString(),
          }
        : {
            ...meta,
            filename,
            mime,
            size: input.data.byteLength,
            updatedAt: now.toISOString(),
          },
      key,
    )
  } catch (error) {
    // Storage writes can fail after writing bytes. Restore meta before discarding the candidate.
    await rollbackReplacement(documentId, rawMeta, key)
    throw error
  }

  const body = extracted.markdown
  let row: typeof documents.$inferSelect
  try {
    row = await publishFileReplacement(documentId, existing, {
      body,
      excerpt: toExcerpt(body),
      searchText: toSearchText(existing.title, body),
      contentHash: contentHash(body),
      sourceKey: key,
      mime,
      size: input.data.byteLength,
      parseError: extracted.error,
      updatedAt: now,
    })
  } catch (error) {
    await rollbackReplacement(documentId, rawMeta, key)
    throw error
  }

  // **放在数据库写入之后**：反过来一旦写库失败，
  // 原件已经没了，而记录还指着它（裂图）。现在最坏是留一个孤儿文件
  if (oldKey && oldKey !== key) {
    await activeStorage()
      .remove(oldKey)
      .catch((error: unknown) => {
        console.warn(`删除旧原件失败：${oldKey}`, error)
      })
  }

  return {
    document: toUploadSummary(row, tags),
    charCount: body.length,
    parseError: extracted.error,
  }
}

async function rollbackReplacement(
  documentId: string,
  rawMeta: Uint8Array | null,
  key: string,
): Promise<void> {
  try {
    if (rawMeta) await activeStorage().write(metaKey(documentId), rawMeta)
    else await activeStorage().remove(metaKey(documentId))
    await activeStorage().remove(key)
  } catch (error) {
    console.warn(`替换原件回滚失败（${documentId}），请核对 meta.json：`, error)
  }
}

/** 删除文档时一并清掉原件目录。见 `lib/uploads.ts` 的 removeUpload */
export async function removeUploadsFor(documentId: string): Promise<void> {
  await removeUpload(documentId)
}
