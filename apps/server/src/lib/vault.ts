import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import matter from 'gray-matter'
import { env } from '../env.js'
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
 */

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

/** 相对路径 → 绝对路径，并拒绝任何越出 vault 的路径（防目录穿越） */
export function resolveInVault(relPath: string): string {
  const abs = resolve(env.vaultDir, relPath)
  const root = resolve(env.vaultDir)
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`路径越界：${relPath}`)
  }
  return abs
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
 * 新笔记落盘位置：<年>/<月>/<slug>-<短id>.md
 *
 * **物理路径不表达目录归属。** 目录（「技术 / 前端 / React」）存在 frontmatter 的
 * `folder` 字段里，落盘位置始终按年月分。
 *
 * 为什么不用物理目录：那样「归入目录」就变成一次文件移动，而移动会让路径失效——
 * 用户正在编辑时移动文件、外部工具按旧路径打开、git 里出现大量 rename diff。
 * 更要紧的是年月分组本身有价值（按时间找一个东西是检索之外的常用路径），
 * 物理目录只能表达一种分组，两种需求会互相挤掉。
 */
export function buildNotePath(title: string, id: string, date = new Date()): string {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return join(year, month, `${slugify(title)}-${idSuffix(id)}.md`)
}

export async function writeNote(note: VaultNote): Promise<void> {
  const abs = resolveInVault(note.path)
  await mkdir(dirname(abs), { recursive: true })

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
  await writeFile(abs, file, 'utf8')
}

export async function readNote(relPath: string): Promise<VaultNote> {
  const abs = resolveInVault(relPath)
  const raw = await readFile(abs, 'utf8')
  const parsed = matter(raw)
  const data = parsed.data as Partial<NoteFrontmatter>

  return {
    id: data.id ?? relPath,
    title: data.title ?? '未命名',
    tags: Array.isArray(data.tags) ? data.tags : [],
    body: parsed.content.trim(),
    status: data.status ?? 'inbox',
    folder: typeof data.folder === 'string' && data.folder.trim() ? data.folder.trim() : null,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
    path: relPath,
  }
}

/**
 * 笔记改名会移动文件。先确认新路径可写再改数据库，避免出现
 * 「文件已移走但记录还指向旧路径」的悬空状态。
 */
export async function moveNote(fromRel: string, toRel: string): Promise<void> {
  const from = resolveInVault(fromRel)
  const to = resolveInVault(toRel)
  if (from === to) return
  await mkdir(dirname(to), { recursive: true })
  await rename(from, to)
}

/** 删除＝移到 vault 内的 .trash，保留可恢复性，不做物理删除 */
export async function trashNote(relPath: string): Promise<void> {
  const abs = resolveInVault(relPath)
  const trashDir = resolve(env.vaultDir, '.trash')
  await mkdir(trashDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const base = relPath.split(sep).pop() ?? 'note.md'
  await rename(abs, join(trashDir, `${stamp}-${base}`))
}

/** vault 相对路径，用于落库 */
export function toVaultRelative(absPath: string): string {
  return relative(env.vaultDir, absPath)
}
