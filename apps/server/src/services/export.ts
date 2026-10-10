import { PassThrough } from 'node:stream'
import { ZipArchive } from 'archiver'
import { asc, isNull } from 'drizzle-orm'
import type { ExportStats } from '@mimir/shared'
import { db } from '../db/client.js'
import { conversations, documents, messages } from '../db/schema.js'
import { slugify } from '../lib/text.js'
import { readUpload } from '../lib/uploads.js'

/**
 * 全量导出（`.trellis/spec/project/product.md` §4 M0）。
 *
 * 为什么这是硬需求：本项目的存储规则是「Markdown 文件是真相」，
 * 那就必须证明**内容可以脱离这个应用被拿走**。
 * 一个只能在自己的 UI 里读的知识库，和一个上锁的柜子没有区别。
 *
 * 两种格式各有用途：
 * - markdown：人读的，也是迁移到 Obsidian / Typora 的入口
 * - json：机读的，含元数据与对话，用于备份
 */

export async function exportStats(): Promise<ExportStats> {
  const rows = await db
    .select({ id: documents.id, kind: documents.kind, body: documents.body, size: documents.size })
    .from(documents)
    .where(isNull(documents.deletedAt))

  const conversationRows = await db.select({ id: conversations.id }).from(conversations)

  const bodyBytes = rows.reduce((sum, row) => sum + Buffer.byteLength(row.body, 'utf8'), 0)
  // 原件也要算进来：界面上的「约 N MB」是用来给用户预期时间与空间的，
  // 漏掉原件会让一个塞满 PDF 的库显示成几 MB
  const fileBytes = rows.reduce((sum, row) => sum + (row.kind === 'file' ? (row.size ?? 0) : 0), 0)

  return {
    documents: rows.length,
    notes: rows.filter((row) => row.kind === 'note').length,
    files: rows.filter((row) => row.kind === 'file').length,
    conversations: conversationRows.length,
    bytes: bodyBytes + fileBytes,
  }
}

/**
 * JSON 导出：一个文件装下全部内容与元数据。
 *
 * 刻意**包含对话**：对话里的结论往往比文档本身更有价值
 * （「我问过什么、它答了什么」），丢了这部分等于丢了半个知识库。
 */
export async function exportJson(): Promise<string> {
  const documentRows = await db
    .select()
    .from(documents)
    .where(isNull(documents.deletedAt))
    .orderBy(asc(documents.createdAt))

  const conversationRows = await db
    .select()
    .from(conversations)
    .orderBy(asc(conversations.createdAt))
  const messageRows = await db.select().from(messages).orderBy(asc(messages.createdAt))

  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    documents: documentRows.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      excerpt: row.excerpt,
      path: row.path,
      url: row.url,
      folder: row.folder,
      author: row.author,
      /**
       * 上传件的原件信息。**JSON 导出不含原件字节**（它是给机器读的元数据
       * 备份）；原件在 markdown 导出（zip）的 `原件/` 目录里。
       *
       * 两个都导出会让人以为「json 是完整备份」，而它其实只有元数据——
       * 于是拿它当备份的人会丢文件。名字上就要说清楚：json 是清单，zip 是内容。
       */
      sourceKey: row.sourceKey,
      mime: row.mime,
      size: row.size,
      parseError: row.parseError,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    conversations: conversationRows.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      messages: messageRows
        .filter((message) => message.conversationId === conversation.id)
        .map((message) => ({
          role: message.role,
          text: message.text,
          citations: message.citations,
          createdAt: message.createdAt.toISOString(),
        })),
    })),
  }

  return JSON.stringify(payload, null, 2)
}

/**
 * Markdown 导出：打包成 zip。
 *
 * 目录结构**按文件夹归类**，而不是照抄 vault 的年月路径——
 * 用户在导出时想要的是「按我组织的方式拿出来」，
 * 而 `2026/09/xxx.md` 对他没有意义。
 */
export function exportMarkdownZip(): PassThrough {
  // archiver 8 换掉了「默认导出一个工厂函数」的老 API，改成具名类。
  // ZipArchive 本身就是 stream.Transform，所以 pipe 出去就是 zip 字节流
  const archive = new ZipArchive({ zlib: { level: 9 } })
  const output = new PassThrough()
  archive.pipe(output)

  void (async () => {
    try {
      const rows = await db
        .select()
        .from(documents)
        .where(isNull(documents.deletedAt))
        .orderBy(asc(documents.title))

      const used = new Map<string, number>()
      // 原件与 md 各用一张去重表：两边同名是正常情况
      // （`2025年度报告.md` 与 `2025年度报告.pdf` 本来就该并存）
      const usedOriginals = new Map<string, number>()

      for (const row of rows) {
        // 资料以「来源-标题」区分，笔记按自己的目录放。
        // 两类混在同一个 zip 里时，至少文件名要能一眼看出哪个是可编辑的
        const prefix = row.kind === 'note' ? '' : '资料/'
        const folder = row.folder ? `${row.folder}/` : ''

        const fileName = uniqueName(used, `${folder}${slugify(row.title)}.md`)
        archive.append(renderMarkdownDocument(row), {
          name: `${prefix}${fileName}`.replace(/^\//, ''),
        })

        /**
         * 上传的原件一并打包进 `原件/`。
         *
         * **这是导出对文件类文档必须做的事。** 导出的承诺是「内容可以脱离
         * 这个应用被拿走」（`.trellis/spec/project/product.md` §4 M0），而对一份 PDF 来说，
         * 正文只是它的派生物——原件才是内容。只导正文等于搬走了目录、
         * 留下了书。
         *
         * 读失败只告警不中断：一份原件读不到不该让整个导出失败，
         * 而缺了什么会在 zip 里看得出来（有 md 没有原件）。
         */
        if (row.kind === 'file' && row.sourceKey) {
          try {
            const data = await readUpload(row.sourceKey)
            // **保留原文件名**：用户认的是「2025年度报告.pdf」，
            // 而 slugify 之后的中文名或 `untitled.pdf` 认不出来。
            // 同名冲突走同一个 uniqueName（它的去重逻辑按扩展名切，两者都能用）
            const originalName = row.sourceKey.split('/').pop() ?? `${slugify(row.title)}.bin`
            const unique = uniqueName(usedOriginals, originalName)
            archive.append(Buffer.from(data), { name: `原件/${unique}` })
          } catch (error) {
            console.warn(`导出时读不到原件（${row.id}）：`, error)
          }
        }
      }

      // 对话单独一个目录。它们不是可编辑文档，混进正文目录会让人以为能改
      const conversationRows = await db
        .select()
        .from(conversations)
        .orderBy(asc(conversations.createdAt))
      const messageRows = await db.select().from(messages).orderBy(asc(messages.createdAt))

      for (const conversation of conversationRows) {
        const items = messageRows.filter((message) => message.conversationId === conversation.id)
        if (items.length === 0) continue

        const body = items
          .map((message) => {
            const who = message.role === 'user' ? '我' : 'mimir'
            return `## ${who}\n\n${message.text}`
          })
          .join('\n\n')

        archive.append(
          `---\ntitle: ${yamlString(conversation.title || '未命名会话')}\ncreatedAt: ${conversation.createdAt.toISOString()}\n---\n\n${body}\n`,
          { name: `对话/${slugify(conversation.title || '未命名会话')}.md` },
        )
      }

      archive.append(README, { name: 'README.md' })
      await archive.finalize()
    } catch (error) {
      archive.emit('error', error)
    }
  })()

  return output
}

/** 单篇文档的 Markdown 全文，含 frontmatter */
function renderMarkdownDocument(row: typeof documents.$inferSelect): string {
  const frontmatter = [
    '---',
    `title: ${yamlString(row.title)}`,
    row.folder ? `folder: ${yamlString(row.folder)}` : null,
    row.url ? `url: ${row.url}` : null,
    `kind: ${row.kind}`,
    `createdAt: ${row.createdAt.toISOString()}`,
    '---',
  ]
    .filter(Boolean)
    .join('\n')

  return `${frontmatter}\n\n# ${row.title}\n\n${row.body}\n`
}

/** 同名文档追加序号而不是覆盖——导出不该丢内容 */
function uniqueName(used: Map<string, number>, name: string): string {
  const count = used.get(name) ?? 0
  used.set(name, count + 1)
  if (count === 0) return name

  // 在扩展名前插序号，保留扩展名（否则 `.pdf` 会被挤掉，文件打不开）
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return `${name}-${count}`
  return `${name.slice(0, dot)}-${count}${name.slice(dot)}`
}

/** YAML 里含冒号、引号的标题会破坏 frontmatter，统一走双引号转义 */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

const README = `# mimir 导出

这个压缩包是 mimir 知识库的全量内容。

## 目录

- \`*.md\` —— 你自己写的笔记，按当初归入的目录组织
- \`资料/\` —— 抓取来的外部内容（网页 / 公众号 / GitHub）与上传文件的正文，只读
- \`原件/\` —— 上传文件的原始文件（PDF / Word / 图片…），原样保留
- \`对话/\` —— 与 AI 的问答记录，含当时的引用来源

## 说明

- 正文是标准 Markdown，可直接用 Obsidian / Typora / VS Code 打开
- frontmatter 里保留了标题、目录、来源链接与时间，不依赖 mimir 也能读
- 笔记里的站内链接形如 \`[标题](/doc/<id>)\`，在别的工具里会失效——
  但它们不影响正文可读性
- \`资料/\` 里那些非笔记文档的正文是**从原件提取**的（PDF/Word 等由对应工具
  生成的文本），排版可能与原件不同；要精确内容请看 \`原件/\`
`
