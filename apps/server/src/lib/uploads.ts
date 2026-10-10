import { z } from 'zod'
import { nanoid } from 'nanoid'
import { activeStorage } from '../plugins/host.js'

/**
 * 上传原件的存放规则（`docs/TECH.md` §13）。
 *
 * ## 路径形状：首次上传 `uploads/<文档id>/<原文件名>`；替换写 `versions/<版本>/<原文件名>`
 *
 * **按 id 分目录，不按 hash。** 内容寻址（按 hash 存、多文档共享一份原件）
 * 的唯一收益是「重复文件只占一份空间」——单用户自洽的库里这个收益很小，
 * 而代价是删除要引用计数、磁盘上认不出哪个文件属于哪篇。`<id>/` 让
 * `data/uploads` 目录**自己就能回答问题**：这个目录对应哪条文档、
 * 它是什么格式、什么时候进来的（文件 mtime）。
 *
 * **文件名保留用户给的原文**（只做最小消毒，保留名 `meta.json` 除外），不 slugify：中文文件名
 * 直接可读，而 slugify 会把它变成一串拼音或 `untitled`——磁盘上就没法认了。
 * 与 `vault/年/月/标题-id.md` 同一个想法。
 *
 * ## `meta.json` 与原件同目录
 *
 * 它回答的是「数据库丢了怎么重建」：标题、标签、目录、状态、时间都在里面。
 * 这正是抓取件做不到的一点（抓取件没有原件文件，只有 raw 快照），
 * 所以上传件反而是**重建能力最强**的一类。
 *
 * ## 写入顺序：原件 → meta.json → 数据库
 *
 * 铁律 2 的延长。替换必须写唯一 key，meta.json 用 sourceKey 指明当前原件。
 * 中间失败最坏产生「有文件没入库」，重建索引能捡回来；
 * 反过来会产生「库里有记录、文件打不开」，那是裂图。
 */

export const UPLOAD_PREFIX = 'uploads'

/** 与原件同目录的元数据文件名。以 `.` 开头，所以不会被 `list` 当作文档 */
const META_NAME = 'meta.json'

/**
 * 原文件名消毒。
 *
 * 只做**必须**的四件事，其余原样保留：
 *  1. 去掉任何路径分隔符与 `..`——否则 `../../etc/passwd` 会穿透出目录
 *  2. 去掉控制字符（含 NUL）——文件系统与 JSON 都不接受
 *  3. 去掉以 `.` 开头的名字前缀——`list` 跳过隐藏项，存下去会「存了但重建时看不见」
 *  4. 限长 120 字符（按字符不按字节，中文文件名不该被腰斩）
 *
 * **不做的**：不 slugify、不转小写、不换扩展名。用户看到的名字要与磁盘上的一致，
 * 否则「我传的那个文件去哪了」会成为每次排查的开头。
 */
export function sanitizeFilename(rawName: string): string {
  const stripped = rawName
    .replace(/^.*[/\\]/, '')
    // eslint-disable-next-line no-control-regex -- 控制字符正是要过滤的目标
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .replace(/^\.+/, '')

  if (stripped === '') return 'unnamed'

  // 按字符截断，同时保住扩展名——否则长名字会把 `.pdf` 截掉，
  // 之后 `mimeFromFilename` 就认不出格式了
  if (stripped.length <= 120) return stripped

  const dot = stripped.lastIndexOf('.')
  if (dot <= 0 || stripped.length - dot > 12) return stripped.slice(0, 120)

  const ext = stripped.slice(dot)
  return `${stripped.slice(0, 120 - ext.length)}${ext}`
}

/** 原件的存储 key */
export function uploadKey(documentId: string, filename: string): string {
  return `${UPLOAD_PREFIX}/${documentId}/${storageFilename(filename)}`
}

/** 替换始终写独立版本；即使文件名相同也不能覆盖当前原件。 */
export function replacementUploadKey(documentId: string, filename: string): string {
  return `${UPLOAD_PREFIX}/${documentId}/versions/${nanoid(12)}/${sanitizeFilename(filename)}`
}

/** 原件不能占用同目录的元数据保留名（Windows 上大小写也视为相同）。 */
function storageFilename(filename: string): string {
  const safe = sanitizeFilename(filename)
  return safe.toLowerCase() === META_NAME ? `original-${safe}` : safe
}

/** 元数据的存储 key */
export function metaKey(documentId: string): string {
  return `${UPLOAD_PREFIX}/${documentId}/${META_NAME}`
}

/** 从 key 里取出文档 id。不是上传件时返回 null */
export function documentIdFromKey(key: string): string | null {
  const parts = key.split('/')
  if (parts[0] !== UPLOAD_PREFIX) return null
  return parts[1] && parts.length >= 3 ? parts[1] : null
}

/**
 * `meta.json` 的形状。
 *
 * **刻意不用数据库的列名**（`contentHash` → `contentHash` 这样照抄）：
 * 这份文件要在**没有数据库**的环境里被读懂（重建索引、人工查看），
 * 所以字段名按「人读」定，而不是按表结构定。
 *
 * 校验用 zod 而不是 `JSON.parse` 后直接断言：一份手改坏的 meta.json
 * 应当让那一条被跳过并打日志，而不是让整次重建炸掉。
 */
export const uploadMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** 用户给的原文件名（含扩展名）；保留名冲突时可能不同于 key 的最后一段。 */
  filename: z.string(),
  /** 当前原件的精确 key；旧版 meta 没有此字段，重建时按原文件名回退。 */
  sourceKey: z.string().optional(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  tags: z.array(z.string()).default([]),
  folder: z.string().nullable().default(null),
  status: z.string().default('ready'),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type UploadMeta = z.infer<typeof uploadMetaSchema>

/**
 * 写原件与元数据。**先原件后 meta**——反过来的话，一个只有 meta.json
 * 没有原件的目录会让重建索引读到一条指向不存在文件的记录。
 */
export async function writeUpload(
  documentId: string,
  filename: string,
  data: Uint8Array,
  meta: UploadMeta,
  key = uploadKey(documentId, filename),
): Promise<{ key: string; metaKey: string }> {
  const storage = activeStorage()
  const metaFile = metaKey(documentId)

  await storage.write(key, data)
  await storage.write(metaFile, JSON.stringify({ ...meta, sourceKey: key }, null, 2))

  return { key, metaKey: metaFile }
}

/** 读原件。不存在时抛错（调用方要知道「记录在而文件不在」） */
export async function readUpload(key: string): Promise<Uint8Array> {
  return activeStorage().read(key)
}

/**
 * 删除整个上传目录里的文件（原件 + meta.json）。
 *
 * 文档被删除时调用。**失败不阻止删除**——数据库里那条已经被标删了，
 * 留下一个孤儿文件不致命（重建索引会看到它、并且因为 id 已存在而跳过）。
 * 阻塞删除反而让用户以为「删不掉」。
 *
 * ## 本地后端会留下一个空目录，这是接受的
 *
 * 存储接缝只有「路径 → 字节」，**没有目录的概念**（对象存储里根本没有）。
 * 所以删掉文件之后那个 `uploads/<id>/` 空壳会留在磁盘上。
 *
 * 不为它加一个 `rmdir` 到接缝里，理由有两条：
 *
 *  1. 那个方法只对一个后端有意义（S3 上是空实现），属于「把接口设计
 *     迁就某一个实现」——而 `docs/TECH.md` §7.3 要的正是相反的方向
 *  2. **这个项目本来就是这个行为**：`trashNote` 也把笔记移走、
 *     留下空的 `年/月/` 目录。为了一个纯装饰性的差别引进一条新接缝，
 *     换不来任何东西
 *
 * 不影响任何功能：重建索引按**文件**扫描（`StorageBackend.list` 只返回文件），
 * 空目录对它完全不可见——所以 `orphanUploads` 也不会把它算成孤儿。
 */
export async function removeUpload(documentId: string): Promise<void> {
  const storage = activeStorage()
  const prefix = `${UPLOAD_PREFIX}/${documentId}/`

  const keys = await storage.list(`${UPLOAD_PREFIX}/${documentId}`).catch(() => [] as string[])
  for (const key of keys) {
    if (!key.startsWith(prefix)) continue
    await storage.remove(key).catch((error: unknown) => {
      console.warn(`删除上传文件失败：${key}`, error)
    })
  }
}

/**
 * 只更新 `meta.json`（不动原件）。
 *
 * 用于「改了标签 / 目录 / 标题」这类**只影响元数据**的修改。理由见
 * `services/documents.ts` 的 `updateNote`：meta.json 是上传件的 frontmatter，
 * 用户整理的结果必须落在那里，否则重建索引会把它们读回旧值。
 */
export async function writeUploadMeta(documentId: string, meta: UploadMeta): Promise<void> {
  await activeStorage().write(metaKey(documentId), JSON.stringify(meta, null, 2))
}

/**
 * 读某个文档的 meta.json。没有或坏了都返回 null。
 *
 * 坏掉的 meta 要**打日志而不是抛错**：重建索引会遍历很多目录，
 * 一份手改坏的元数据不该让整次重建失败。
 */
export async function readUploadMeta(documentId: string): Promise<UploadMeta | null> {
  const raw = await activeStorage()
    .read(metaKey(documentId))
    .catch(() => null)
  if (!raw) return null

  try {
    const parsed = uploadMetaSchema.safeParse(JSON.parse(new TextDecoder().decode(raw)))
    if (!parsed.success) {
      console.warn(`跳过格式不正确的 ${metaKey(documentId)}：${parsed.error.message}`)
      return null
    }
    return parsed.data
  } catch (error) {
    console.warn(`跳过无法解析的 ${metaKey(documentId)}`, error)
    return null
  }
}
