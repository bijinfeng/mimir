import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { StorageBackend, StorageProbe } from '@mimir/shared'

/**
 * 本地磁盘后端：`DATA_DIR` 下的普通文件。
 *
 * 这是**默认后端**，也是这次改动之前唯一存在的行为——本文件的职责是把
 * `lib/vault.ts` 与 `services/avatar.ts` 里原先各自手写的那套文件操作
 * 收成一个实现，**不改变任何落盘结果**：
 *
 * ```
 * key  vault/2026/09/名字-a1b2.md  →  <DATA_DIR>/vault/2026/09/名字-a1b2.md
 * ```
 *
 * 于是老部署升级上去之后，`data/` 里一个字节都不动，Typora / Obsidian /
 * git 仍然直接可用（`docs/RESEARCH.md` §10.8）。
 *
 * ## 为什么 key 用 `/` 而不是平台分隔符
 *
 * key 是**契约**，不是路径。同一条 key 在 S3 后端上就是对象名，那里只有 `/`。
 * 平台分隔符只在进出文件系统的两个边界上转（`resolveKey` 与 `toKey`），
 * 中间一律是 POSIX。写死 `\` 会让同一份数据在 Windows 上产生不同的 key，
 * 那是「数据库里存的路径指向不存在的文件」这类问题的源头。
 */

export interface LocalStorageOptions {
  /** 数据根目录的绝对路径（来自 `DATA_DIR`） */
  root: string
}

/**
 * 把 key 变成一个安全的绝对路径。
 *
 * **这是这个后端的安全边界**，防的是目录穿越：`key` 会来自数据库里的
 * `path` 列，而它可能被手工改过、也可能是从别处导入的 frontmatter。
 * `../../../etc/passwd` 必须在这里被拒绝，而不是等到 `readFile` 才出问题。
 *
 * 与改动前 `lib/vault.ts` 的 `resolveInVault` 是同一条防线，只是范围从
 * 「vault 之内」放宽成「数据根之内」——因为现在一个根管三个前缀。
 */
function resolveKey(root: string, key: string): string {
  const abs = resolve(root, key)
  const base = resolve(root)
  if (abs !== base && !abs.startsWith(base + sep)) {
    throw new Error(`存储 key 越界：${key}`)
  }
  return abs
}

/** 绝对路径 → key。分隔符统一成 `/`，这是列出操作唯一需要转换的地方 */
function toKey(root: string, abs: string): string {
  return relative(root, abs).split(sep).join('/')
}

export function createLocalStorage(options: LocalStorageOptions): StorageBackend {
  const root = resolve(options.root)

  /** 递归收集文件。**不返回中间目录**——对象存储没有目录这个概念（见契约注释） */
  async function walk(dir: string, found: string[]): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      // 前缀不存在时给空列表，不抛错。
      // 对「列出这一批文件」这个意图来说，「没有任何文件」是一个合法答案——
      // 抛错会逼每个调用方写一遍 try/catch，而它们要的分明是同一个结果。
      // （空 vault 重建索引就走这条路：不是异常，是刚初始化完的正常状态）
      return
    }

    for (const entry of entries) {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(abs, found)
      } else if (entry.isFile()) {
        found.push(toKey(root, abs))
      }
    }
  }

  return {
    id: 'local',

    async read(key) {
      return readFile(resolveKey(root, key))
    },

    async write(key, data) {
      const abs = resolveKey(root, key)
      await mkdir(dirname(abs), { recursive: true })
      await writeFile(abs, data)
    },

    async remove(key) {
      await unlink(resolveKey(root, key)).catch((error: NodeJS.ErrnoException) => {
        // ENOENT 是成功的：这个函数的作用是「让 key 不存在」，它已经达成了
        if (error.code !== 'ENOENT') throw error
      })
    },

    async move(from, to) {
      const source = resolveKey(root, from)
      const target = resolveKey(root, to)
      if (source === target) return

      await mkdir(dirname(target), { recursive: true })
      // 直接用 rename(2)：同一个文件系统内它是**原子**的。
      // 这正是本地后端与 S3 后端差别最大的地方——那边没有这个操作，
      // 只能复制 + 删除（见 StorageBackend.move 的注释）
      await rename(source, target)
    },

    async list(prefix) {
      const found: string[] = []
      // 允许调用方给 'vault' 或 'vault/' 两种写法：前者更自然，
      // 后者是从 S3 那边带过来的习惯，不值得让调用方猜
      const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
      await walk(resolveKey(root, base), found)
      return found
    },

    async probe(): Promise<StorageProbe> {
      const key = `.probe/${Date.now().toString(36)}`
      const payload = 'mimir-storage-probe'

      try {
        await this.write(key, payload)
        const readBack = Buffer.from(await this.read(key)).toString('utf8')
        await this.remove(key)

        if (readBack !== payload) {
          return { ok: false, message: '写入后读回的内容不一致（磁盘故障？）' }
        }
        return { ok: true, message: `写入、读回与删除都成功（${root}）` }
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        }
      }
    },
  }
}
