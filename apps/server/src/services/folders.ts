import { and, isNull, sql } from 'drizzle-orm'
import type { FolderNode } from '@mimir/shared'
import { db } from '../db/client.js'
import { documents } from '../db/schema.js'

/**
 * 目录树。
 *
 * 由 `documents.folder` 派生，不单独建表——理由见 `db/schema.ts` 里该列的注释：
 * 目录是文件系统的形状，而文件是真相。建表会立刻产生两个真相源。
 *
 * 因此这里的工作是「把一堆路径字符串拼成一棵树」，而不是「查询一棵树」。
 * 中间节点（`技术/前端`）本身不需要有文档，只要有文档落在它下面就该出现在树里。
 */

/** 把 `技术/前端/React` 拆成逐段路径，用于构建中间节点 */
function segmentsOf(folder: string): string[] {
  return folder
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

interface MutableNode {
  name: string
  /** 该节点自身（不含子节点）的文档数 */
  own: number
  children: Map<string, MutableNode>
}

export async function listFolderTree(): Promise<FolderNode[]> {
  const rows = await db
    .select({ folder: documents.folder, count: sql<number>`count(*)::int` })
    .from(documents)
    .where(and(isNull(documents.deletedAt), sql`${documents.folder} is not null`))
    .groupBy(documents.folder)

  const root: MutableNode = { name: '', own: 0, children: new Map() }

  for (const row of rows) {
    if (!row.folder) continue
    const segments = segmentsOf(row.folder)
    if (segments.length === 0) continue

    let current = root
    for (const segment of segments) {
      let next = current.children.get(segment)
      if (!next) {
        next = { name: segment, own: 0, children: new Map() }
        current.children.set(segment, next)
      }
      current = next
    }
    // 计数落在最深一节上，再由 toNodes 向上汇总——
    // 这样父目录的 count 天然包含子目录，与界面上「技术 12」的语义一致
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
      children,
    })
  }

  // 按名称排序而不是按数量：目录树是空间结构，位置稳定比「热门在前」重要——
  // 数量一变就换位置，用户会找不到自己的目录
  out.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  return out
}

/**
 * 目录路径校验：不能是文件系统的绝对路径，也不能越出 vault。
 * `..` 在 schema 层已经拒了，这里补上前缀清理。
 */
export function normalizeFolder(input: string): string {
  return segmentsOf(input.replace(/^\/+/, '')).join('/')
}
