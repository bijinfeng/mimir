import matter from 'gray-matter'
import { activeStorage } from '../plugins/host.js'
import { slugify } from './text.js'

/**
 * vault 是我们自己写的笔记的存储层。
 *
 * 一条核心规则：**文件是真相，数据库只是可重建的索引。**
 * 因此 md 文件必须能脱离本应用单独使用——可以直接用 Typora / Obsidian / VS Code 打开，
 * 也可以直接 git 版本管理。frontmatter 只放元数据，正文就是纯 Markdown。
 *
 * 代价是写入要同时落文件和数据库，两边可能不一致；这是刻意的取舍：
 * 换 embedding 模型、改分块策略、甚至整个重建数据库，都可以从文件重来。
 *
 * ## 这一层现在只做「笔记的形状」，不碰文件系统
 *
 * 实际的读写走 `storage` 接缝（`.trellis/spec/project/architecture.md` §7.2）。本文件负责的是
 * **笔记特有的知识**：frontmatter 怎么序列化、路径怎么按年月分、
 * 文件名里的 id 后缀怎么取。这些在两个后端上完全一样。
 *
 * 拆开的理由与 capturer / parser 那次拆分相同：把「存到哪」和「存什么形状」
 * 混在一起时，换一个后端要改三个服务；拆开之后换后端是加一个实现。
 *
 * ## key 的三个前缀
 *
 * `vault/` 是内容，`raw/` 是抓取快照，`avatars/` 是账户资料
 * （D-036：头像刻意不在 vault 下——不进分词、不进导出、不进重建索引的扫描范围）。
 * 本文件只管第一类。
 */

/**
 * 笔记相关的 key 前缀。
 *
 * 导出成常量而不是散在各处的字符串：`vault-index` 要按它遍历、
 * 导出要按它排除头像，两处必须指同一个东西。
 */
export const VAULT_PREFIX = 'vault'
export const TRASH_PREFIX = `${VAULT_PREFIX}/.trash`

export interface VaultNote {
  id: string
  title: string
  tags: string[]
  body: string
  status: string
  /**
   * 所属目录，如 `技术/前端`。null 表示未归档。
   *
   * 存在 frontmatter 里，不靠物理目录结构表达——理由见下方 writeNote 的注释。
   */
  folder: string | null
  createdAt: string
  updatedAt: string
  /** 相对 vault 根目录的路径，如 2026/09/hello-world-a1b2c3d4.md */
  path: string
}

export interface NoteFrontmatter {
  id: string
  title: string
  tags: string[]
  status: string
  folder?: string | null
  createdAt: string
  updatedAt: string
}

/**
 * vault 相对路径 → 存储 key。
 *
 * 数据库里 `path` 存的一直是 **vault 相对路径**（历史如此，且对用户更有意义：
 * 它回答「在 vault 里的哪个位置」）。存储层要的是全局 key，
 * 所以差一个 `vault/` 前缀——转换只在这一对函数里发生。
 */
export function toStorageKey(vaultPath: string): string {
  return `${VAULT_PREFIX}/${vaultPath}`
}

/** 存储 key → vault 相对路径。`list` 的结果要过它才能与数据库里的 path 对上 */
export function toVaultPath(storageKey: string): string {
  const prefix = `${VAULT_PREFIX}/`
  return storageKey.startsWith(prefix) ? storageKey.slice(prefix.length) : storageKey
}

/**
 * 文件名里的 id 后缀。
 *
 * nanoid 的字母表含 `-` 和 `_`，直接取末 8 位会拼出 `标题--a1b2` 这种双横线，
 * 在 shell 和某些工具里很别扭。这里统一只保留字母数字。
 */
function idSuffix(id: string): string {
  return id.replace(/[^A-Za-z0-9]/g, '').slice(-8) || 'notid'
}

/**
 * 新笔记的落盘位置：`<年>/<月>/<slug>-<短id>.md`
 *
 * **物理路径不表达目录归属。** 目录（「技术 / 前端 / React」）存在 frontmatter 的
 * `folder` 字段里，落盘位置始终按年月分。
 *
 * 为什么不用物理目录：那样「归入目录」就变成一次文件移动，而移动会让路径失效——
 * 用户正在编辑时移动文件、外部工具按旧路径打开、git 里出现大量 rename diff。
 * 更要紧的是年月分组本身有价值（按时间找一个东西是检索之外的常用路径），
 * 物理目录只能表达一种分组，两种需求会互相挤掉。
 *
 * ## 为什么这里用 `/` 而不是 `path.join`
 *
 * key 是契约（`StorageBackend` 的注释），不是平台路径：同一条 key 在 S3 后端上
 * 就是对象名，那里只有 `/`。`path.join` 在 Windows 上会产出 `\`，
 * 于是同一份数据在两个平台上得到不同的 key——那是「数据库里的路径指向
 * 不存在的文件」这类问题的源头。分隔符的转换由本地后端在自己的边界上做。
 */
export function buildNotePath(title: string, id: string, date = new Date()): string {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}/${month}/${slugify(title)}-${idSuffix(id)}.md`
}

export async function writeNote(note: VaultNote): Promise<void> {
  const frontmatter: NoteFrontmatter = {
    id: note.id,
    title: note.title,
    tags: note.tags,
    status: note.status,
    // 空的 folder 不写进文件：frontmatter 里出现 `folder: null` 是噪音，
    // 而「没有这个字段」本身就表示未归档
    ...(note.folder ? { folder: note.folder } : {}),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }

  const file = matter.stringify(`\n${note.body.trim()}\n`, frontmatter)
  await activeStorage().write(toStorageKey(note.path), file)
}

export async function readNote(vaultPath: string): Promise<VaultNote> {
  const raw = Buffer.from(await activeStorage().read(toStorageKey(vaultPath))).toString('utf8')
  const parsed = matter(raw)
  const data = parsed.data as Partial<NoteFrontmatter>

  return {
    id: data.id ?? vaultPath,
    title: data.title ?? '未命名',
    tags: Array.isArray(data.tags) ? data.tags : [],
    body: parsed.content.trim(),
    status: data.status ?? 'ready',
    folder: typeof data.folder === 'string' && data.folder.trim() ? data.folder.trim() : null,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
    path: vaultPath,
  }
}

/**
 * 笔记改名会移动文件。先确认新路径可写再改数据库，避免出现
 * 「文件已移走但记录还指向旧路径」的悬空状态。
 *
 * ## 「要么成功，要么没动过」在两个后端上靠的东西不同
 *
 * 本地是 `rename(2)`，文件系统保证原子；S3 是复制 + 删除，**没有这个保证**
 * （`.trellis/spec/project/research.md` §10.3a）。后者最坏的失败是留下一个重复文件，
 * 而那是可修复的——`reindexVault` 会检测「同一个 id 出现在多个路径」
 * 并跳过其中一个，同时留下日志。
 *
 * 顺序不能改：先复制后删除，最坏是多一个文件；先删后复制，
 * 复制失败就是数据丢失。
 */
export async function moveNote(fromPath: string, toPath: string): Promise<void> {
  if (fromPath === toPath) return
  await activeStorage().move(toStorageKey(fromPath), toStorageKey(toPath))
}

/**
 * 删除＝移到 vault 内的 `.trash`，保留可恢复性，不做物理删除。
 *
 * 目标 key 用时间戳前缀，所以同一篇笔记被反复删除不会互相覆盖
 * （`move` 在 S3 上是复制 + 删除，同名会静默盖掉上一条回收站记录）。
 */
export async function trashNote(vaultPath: string): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const base = vaultPath.split('/').pop() ?? 'note.md'

  await activeStorage().move(toStorageKey(vaultPath), `${TRASH_PREFIX}/${stamp}-${base}`)
}
