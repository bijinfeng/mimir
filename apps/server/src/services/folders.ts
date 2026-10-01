import { and, count, eq, isNull, like, or, sql } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'
import type { DocumentStatus, FolderNode } from '@mimir/shared'
import { db } from '../db/client.js'
import { documents, folders } from '../db/schema.js'
import { HttpError } from '../lib/http.js'
import { readUploadMeta, writeUploadMeta } from '../lib/uploads.js'
import { writeNote } from '../lib/vault.js'
import { loadTags } from './documents.js'

/**
 * 目录树与目录管理（D-068）。
 *
 * `folders` 表是**树结构的唯一真相**，`documents.folder` 是**归档指派**
 * （冗余路径串，列表过滤与计数仍走它）。为什么推翻「纯派生、不建表」：
 * 侧边栏要直接增删改移目录，而空目录没有文档、在派生模型里无处存在。
 * 两边的一致性由这里的四个操作维护：
 *
 *  - 指派到新路径 → `ensureFolders` 自动补建祖先（mkdir -p 语义）
 *  - 改名 / 移动 → 前缀重写：folders 行 + documents 行 + 笔记 frontmatter
 *    + 上传件 meta.json（**文件先写、数据库后写**，铁律 2）
 *  - 删除 → 子树行删除，里面的文档**保留**、指派清空（回库根）
 */

/**
 * 知识库短码。从 32 字符表（去掉了易混的 0/O、1/I/L）里取 6 位——单用户
 * 的几百个目录撞不上；路径才是身份，短码只承担「能念、能复制」。
 */
const generateCode = customAlphabet('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 6)

/** 把 `技术/前端/React` 拆成逐段路径，用于构建中间节点 */
function segmentsOf(folder: string): string[] {
  return folder
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

/**
 * 目录路径校验：不能是文件系统的绝对路径，也不能越出 vault。
 * `..` 与空段在 schema 层已经拒了，这里补上前缀清理。
 */
export function normalizeFolder(input: string): string {
  return segmentsOf(input.replace(/^\/+/, '')).join('/')
}

interface MutableNode {
  name: string
  /** 该节点自身（不含子节点）的文档数 */
  own: number
  children: Map<string, MutableNode>
  description: string | null
  icon: string | null
  /** 知识库短码。注册表里没有的派生节点为 null（树会照常挂出来计数） */
  code: string | null
}

/**
 * 目录树。结构来自 `folders` 表；计数仍从 `documents.folder` 聚合——
 * 树上每个数字必须与点进去看到的条数一致。
 */
export async function listFolderTree(): Promise<FolderNode[]> {
  const [rows, docCounts] = await Promise.all([
    db
      .select({
        path: folders.path,
        description: folders.description,
        icon: folders.icon,
        code: folders.code,
      })
      .from(folders),
    db
      .select({ folder: documents.folder, count: count() })
      .from(documents)
      .where(and(isNull(documents.deletedAt), sql`${documents.folder} is not null`))
      .groupBy(documents.folder),
  ])

  const root: MutableNode = {
    name: '',
    own: 0,
    children: new Map(),
    description: null,
    icon: null,
    code: null,
  }

  // 先按注册表建骨架——没有文档的目录也要出现在树里（这正是 D-068 的意义）
  for (const row of rows) {
    const segments = segmentsOf(row.path)
    if (segments.length === 0) continue

    let current = root
    for (const segment of segments) {
      let next = current.children.get(segment)
      if (!next) {
        next = {
          name: segment,
          own: 0,
          children: new Map(),
          description: null,
          icon: null,
          code: null,
        }
        current.children.set(segment, next)
      }
      current = next
    }
    // 元信息落在**路径自己那一级**（祖先行是 mkdir -p 的副产品，没有元信息）
    current.description = row.description || null
    current.icon = row.icon
    current.code = row.code || null
  }

  // 再把计数落上去。注册表之外的 folder（理论上不应存在，见 ensureFolders
  // 的调用点）也照常计入——树会通过下面的兜底分支把它们挂出来，
  // 宁可多显示一个目录也不能让计数与点进去的条数对不上
  for (const row of docCounts) {
    if (!row.folder) continue
    const segments = segmentsOf(row.folder)
    if (segments.length === 0) continue

    let current = root
    for (const segment of segments) {
      let next = current.children.get(segment)
      if (!next) {
        next = {
          name: segment,
          own: 0,
          children: new Map(),
          description: null,
          icon: null,
          code: null,
        }
        current.children.set(segment, next)
      }
      current = next
    }
    current.own += Number(row.count)
  }

  return toNodes(root, '')
}

/** 递归转成响应形状，同时把子节点的计数累加到父节点 */
function toNodes(node: MutableNode, prefix: string): FolderNode[] {
  const out: FolderNode[] = []

  for (const child of node.children.values()) {
    const path = prefix ? `${prefix}/${child.name}` : child.name
    const children = toNodes(child, path)
    const descendantTotal = children.reduce((sum, item) => sum + item.count, 0)

    out.push({
      path,
      name: child.name,
      count: child.own + descendantTotal,
      description: child.description,
      icon: child.icon,
      code: child.code,
      children,
    })
  }

  // 按名称排序而不是按数量：目录树是空间结构，位置稳定比「热门在前」重要——
  // 数量一变就换位置，用户会找不到自己的目录
  out.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  return out
}

/**
 * 确保路径及其全部祖先都在注册表里（mkdir -p 语义）。
 *
 * 所有「把文档指派到某个目录」的写入点都要经过它——否则外部 md 文件的
 * frontmatter 带来一个新目录、或用户归档到一个还没建的目录时，
 * 指派存在而注册表没有，树就对不上。
 */
export async function ensureFolders(folder: string | null | undefined): Promise<void> {
  if (!folder) return
  const normalized = normalizeFolder(folder)
  if (!normalized) return

  const segments = segmentsOf(normalized)
  const rows = segments.map((_, index) => ({
    path: segments.slice(0, index + 1).join('/'),
    /* 每行都给短码：子目录将来被移动成顶层时不用补号 */
    code: generateCode(),
  }))
  await db.insert(folders).values(rows).onConflictDoNothing()
}

/** 新建目录。路径含父级（mkdir -p）；已存在时 409 */
export interface CreateFolderInput {
  path: string
  /** 知识库描述（D-078）。只附着在目标路径自己那行上，祖先行留空 */
  description?: string | undefined
  /** 知识库图标键（shared 的 FOLDER_ICONS 之一） */
  icon?: string | undefined
}

export async function createFolder(input: CreateFolderInput): Promise<string> {
  const path = normalizeFolder(input.path)
  if (!path) throw new HttpError(400, 'INVALID_INPUT', '目录路径不合法')

  const segments = segmentsOf(path)
  const rows = segments.map((_, index) => {
    const isTarget = index === segments.length - 1
    return {
      path: segments.slice(0, index + 1).join('/'),
      /* 描述与图标只属于被创建的那一级：mkdir -p 建出的祖先行是路径的
         副产品，不该继承子级的元信息 */
      description: isTarget ? (input.description?.trim() ?? '') : '',
      icon: isTarget ? (input.icon ?? null) : null,
      code: generateCode(),
    }
  })
  const inserted = await db.insert(folders).values(rows).onConflictDoNothing().returning()

  // 最后一段必须真的插进去了，否则就是「目录已存在」——
  // 中间祖先已存在是正常的（mkdir -p 语义），不算冲突
  if (!inserted.some((row) => row.path === path)) {
    throw new HttpError(409, 'FOLDER_EXISTS', '目录已存在')
  }
  return path
}

/** 前缀匹配：`技术/前端` 要命中它自己和它的全部子孙 */
function prefixOf(path: string): ReturnType<typeof or> {
  return or(eq(folders.path, path), like(folders.path, `${path}/%`))
}

/** 改名 / 移动（同一个操作）：把 `from` 子树整体搬到 `to`。返回受影响文档数 */
export async function moveFolder(from: string, to: string): Promise<number> {
  const source = normalizeFolder(from)
  const target = normalizeFolder(to)
  if (!source || !target) throw new HttpError(400, 'INVALID_INPUT', '目录路径不合法')
  if (source === target) return 0
  // 搬进自己的子树会让前缀重写套娃（技术 → 技术/前端/技术），直接拒绝
  if (target === source || target.startsWith(`${source}/`)) {
    throw new HttpError(400, 'INVALID_TARGET', '不能把目录移动到它自己的子目录里')
  }

  const [existing] = await db
    .select({ path: folders.path })
    .from(folders)
    .where(eq(folders.path, source))
  if (!existing) throw new HttpError(404, 'FOLDER_NOT_FOUND', '目录不存在')
  const [clash] = await db
    .select({ path: folders.path })
    .from(folders)
    .where(eq(folders.path, target))
  if (clash) throw new HttpError(409, 'FOLDER_EXISTS', '目标目录已存在')

  const affected = await db
    .select({
      id: documents.id,
      kind: documents.kind,
      path: documents.path,
      folder: documents.folder,
      title: documents.title,
      body: documents.body,
      status: documents.status,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(
      and(
        isNull(documents.deletedAt),
        sql`(${documents.folder} = ${source} or ${documents.folder} like ${`${source}/%`})`,
      ),
    )

  const rewrite = (folder: string): string =>
    folder === source ? target : `${target}${folder.slice(source.length)}`

  // 文件先写（铁律 2）：笔记改 frontmatter，上传件改 meta.json
  const tagsByDoc = await loadTags(affected.map((row) => row.id))
  for (const row of affected) {
    const nextFolder = row.folder ? rewrite(row.folder) : null
    if (row.kind === 'note' && row.path) {
      await writeNote({
        id: row.id,
        title: row.title,
        tags: tagsByDoc.get(row.id) ?? [],
        body: row.body,
        status: row.status as DocumentStatus,
        folder: nextFolder,
        createdAt: row.createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
        path: row.path,
      })
    } else if (row.kind === 'file') {
      const meta = await readUploadMeta(row.id)
      if (meta) {
        await writeUploadMeta(row.id, { ...meta, folder: nextFolder }).catch((error: unknown) => {
          console.warn(`写回 meta.json 失败（${row.id}），重建索引后目录指派可能回退：`, error)
        })
      }
    }
    // 抓取的资料（web / wechat / github）没有 vault 文件，数据库就是它们的真相
  }

  // 文件都写完了，再动数据库：先按旧路径取出全部目录行，再逐行改写——
  // 边查边改会拿到混合了新旧前缀的快照。
  // **不用事务**：better-sqlite3 的事务回调是同步契约，async 回调会在
  // 提交后继续执行（实测 500）。与其它服务一致，顺序写靠「文件先行」兜底。
  const folderRows = await db.select({ path: folders.path }).from(folders).where(prefixOf(source))
  for (const row of affected) {
    await db
      .update(documents)
      .set({ folder: rewrite(row.folder!) })
      .where(eq(documents.id, row.id))
  }
  for (const row of folderRows) {
    await db
      .update(folders)
      .set({ path: rewrite(row.path) })
      .where(eq(folders.path, row.path))
  }

  return affected.length
}

/** 删除目录（含子目录）。里面的文档**保留**、指派清空（回库根）。返回移出文档数 */
export async function deleteFolder(input: string): Promise<number> {
  const path = normalizeFolder(input)
  if (!path) throw new HttpError(400, 'INVALID_INPUT', '目录路径不合法')

  const [existing] = await db
    .select({ path: folders.path })
    .from(folders)
    .where(eq(folders.path, path))
  if (!existing) throw new HttpError(404, 'FOLDER_NOT_FOUND', '目录不存在')

  const affected = await db
    .select({
      id: documents.id,
      kind: documents.kind,
      path: documents.path,
      title: documents.title,
      body: documents.body,
      status: documents.status,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(
      and(
        isNull(documents.deletedAt),
        sql`(${documents.folder} = ${path} or ${documents.folder} like ${`${path}/%`})`,
      ),
    )

  // 文件先写：指派清空 = frontmatter / meta.json 去掉 folder 字段
  const tagsByDoc = await loadTags(affected.map((row) => row.id))
  for (const row of affected) {
    if (row.kind === 'note' && row.path) {
      await writeNote({
        id: row.id,
        title: row.title,
        tags: tagsByDoc.get(row.id) ?? [],
        body: row.body,
        status: row.status as DocumentStatus,
        folder: null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
        path: row.path,
      })
    } else if (row.kind === 'file') {
      const meta = await readUploadMeta(row.id)
      if (meta) {
        await writeUploadMeta(row.id, { ...meta, folder: null }).catch((error: unknown) => {
          console.warn(`写回 meta.json 失败（${row.id}），重建索引后目录指派可能回退：`, error)
        })
      }
    }
  }

  for (const row of affected) {
    await db.update(documents).set({ folder: null }).where(eq(documents.id, row.id))
  }
  await db.delete(folders).where(prefixOf(path))

  return affected.length
}
