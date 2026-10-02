import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type {
  CaptureRaw,
  CaptureResponse,
  CaptureStageResult,
  DetectedSource,
  ParseInput,
} from '@mimir/shared'
import { db } from '../db/client.js'
import { documents } from '../db/schema.js'
import { toSearchText } from '@mimir/tokenizer'
import { contentHash, toExcerpt } from '../lib/text.js'
import { assemble, activeStorage } from '../plugins/host.js'
import { ensureFolders, normalizeFolder } from './folders.js'
import { rebuildChunksAndEmbed } from './chunks.js'

/**
 * 抓取编排（宿主的适配层）。
 *
 * ## 它现在只做四件事
 *
 *   1. 按 URL 从 `capturer` 接缝挑实现
 *   2. 把抓到的原始内容交给 `parser` 接缝转成 Markdown
 *   3. 落盘原始快照（宿主才知道 RAW_DIR 在哪）
 *   4. 写库（宿主才知道表结构）
 *
 * 站点特有知识在 `plugins/capturer/`，HTML 转换在 `plugins/parser/`，
 * 两边都不碰数据库、不碰文件系统——那正是「解析引擎只负责文档解析」
 * 这条边界的落点。
 *
 * ## 阶段是真实推进的，不是前端演动画
 *
 * 每一步都在后端实际发生，失败时能准确指出是哪一步挂的。
 * 「获取页面」失败是反爬，「提取正文」失败是页面结构不认识——
 * 两者对用户的下一步动作完全不同（`docs/PRD.md` §5.8）。
 */

export interface CaptureParams {
  url: string
  source: DetectedSource
  /** 抓完归入的目录（可选）。从知识库页发起时带上，见 captureInputSchema */
  folder?: string
}

/** 按注册顺序找第一个匹配的抓取器。`web` 的 matches 永远为真，所以一定有结果 */
function pickCapturer(seams: ReturnType<typeof assemble>['seams'], url: string) {
  const implementations = seams.capturer.implementations()
  const found = implementations.find(({ impl }) => impl.matches(url))

  if (!found) {
    // 只可能是「连兜底的 web 都没注册」——那是装配错误，不是用户错误
    throw new Error('没有注册任何可用的抓取器（兜底的 web 实现缺失）')
  }
  return found
}

/** 选一个能处理这种输入类型的解析器。`accepts` 是静态声明，不用 try 一遍 */
function pickParser(seams: ReturnType<typeof assemble>['seams'], type: ParseInput['type']) {
  const found = seams.parser.implementations().find(({ impl }) => impl.accepts.includes(type))

  if (!found) {
    throw new Error(`没有能处理 ${type} 的解析器。检查 plugins/parser/ 是否注册了对应实现`)
  }
  return found
}

export async function capture(params: CaptureParams): Promise<CaptureResponse> {
  const { seams } = assemble()
  const stages: CaptureStageResult[] = []
  const capturer = pickCapturer(seams, params.url)
  const folder = params.folder ? normalizeFolder(params.folder) || null : null
  if (folder) await ensureFolders(folder)

  // 阶段 1：抓取。与「提取正文」在同一个实现里——把它们拆开只会复制代码，
  // 而拆解只影响进度展示的粒度，不影响正确性
  const fetchStart = performance.now()
  let raw: CaptureRaw
  try {
    raw = await capturer.impl.run(params.url)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    stages.push({ stage: 'fetch', status: 'failed', error: message })
    return {
      kind: params.source.kind,
      label: params.source.label,
      note: params.source.note,
      stages,
      preview: null,
      documentId: null,
    }
  }

  const fetchMs = Math.round(performance.now() - fetchStart)
  const fetchedBytes =
    raw.rawHtml?.length ?? (raw.content.type === 'html' ? raw.content.html.length : 0)
  stages.push({
    stage: 'fetch',
    status: 'done',
    meta: `${fetchedBytes / 1024 >= 1 ? `${Math.round(fetchedBytes / 1024)} KB` : `${fetchedBytes} B`} · ${(fetchMs / 1000).toFixed(1)}s`,
  })

  // 阶段 2：解析。失败要单独报——「拿到页面但认不出正文」与「页面都没拿到」
  // 是两类完全不同的失败，用户要做的事也不同
  let markdown: string
  let imageCount = raw.imageCount
  let title = raw.title
  try {
    const parser = pickParser(seams, raw.content.type)
    const parsed = await parser.impl.parse({
      type: raw.content.type,
      content: raw.content.type === 'html' ? raw.content.html : raw.content.markdown,
      baseUrl: params.url,
    })
    markdown = parsed.markdown
    // 解析器数到的图片数更准（抓取器只数 DOM 里的 <img>，
    // 而 Markdown 直通路径的图片是语法形式）
    imageCount = parsed.imageCount || raw.imageCount
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    stages.push({ stage: 'extract', status: 'failed', error: message })
    return {
      kind: params.source.kind,
      label: params.source.label,
      note: params.source.note,
      stages,
      preview: null,
      documentId: null,
    }
  }

  stages.push({ stage: 'extract', status: 'done', meta: `${markdown.length} 字` })

  // 标题：抓取器给的多半是 URL 兜底值，解析出来的内容里可能有更好的
  const firstHeading = markdown.match(/^#{1,2}\s+(.+)$/m)?.[1]?.trim()
  if (title === params.url && firstHeading) title = firstHeading

  // 图片本地化：做的是**改写链接**而不是真的下载。
  // 下载需要处理每个站点的防盗链、去重、存储命名，而这一步的收益
  // （原文删除后图片还在）要到 M2 的浏览器扩展才真正成立。
  // 现在如实报告数量，不假装已经本地化
  stages.push({
    stage: 'assets',
    status: 'done',
    meta: imageCount > 0 ? `${imageCount} 张（保留原链接）` : '无图片',
  })
  stages.push({ stage: 'convert', status: 'done', meta: '已统一为 Markdown' })

  // 先落原始快照，再写数据库——顺序遵循全局规则（文件是真相）。
  // 抓来的资料没有 vault 文件，但 raw 快照是它的真相
  if (raw.rawHtml) {
    const snapshotKey = `raw/${contentHash(markdown).slice(0, 16)}/index.html`
    await activeStorage()
      .write(snapshotKey, raw.rawHtml)
      .catch((error: unknown) => {
        // 快照写失败不该让整个抓取失败——正文才是用户要的
        console.warn(`原始快照写入失败：${snapshotKey}`, error)
      })
  }

  const { documentId } = await ingestDocument({
    kind: raw.kind,
    title,
    markdown,
    url: params.url,
    author: raw.author ?? null,
    folder,
  })

  return {
    kind: params.source.kind,
    label: params.source.label,
    note: params.source.note,
    stages,
    preview: {
      title,
      excerpt: toExcerpt(markdown, 200),
      charCount: markdown.length,
      imageCount,
    },
    documentId,
  }
}

/**
 * URL 归一化，用于去重。
 *
 * 只做「确定安全」的归一化：去掉 fragment、utm 系列参数、末尾斜杠。
 * **不**去掉其它查询参数——`?id=123` 这类在很多站点上决定内容，
 * 去掉会把不同文章误判成同一篇。
 */
export function canonicalize(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''

    // searchParams 的 keys() 是**活迭代器**：边遍历边删会跳过紧邻的下一个元素。
    // 实测 `?utm_a=1&utm_b=2&id=9` 不带快照时会剩 `utm_b=2` 删不掉，
    // 所以这个展开是必需的，不是「复制一份更保险」。
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^utm_|^spm$|^from$|^share_|^ref$/i.test(key)) parsed.searchParams.delete(key)
    }

    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '')
    return parsed.toString()
  } catch {
    return url.trim()
  }
}

export interface IngestInput {
  kind: string
  title: string
  markdown: string
  /** 来源地址。它是**去重键**（`canonical_url`）的来源 */
  url: string
  author?: string | null
  folder?: string | null
  publishedAt?: Date | null
}

/**
 * 把一份「已经转成 Markdown」的内容入库。**抓取与 RSS 订阅共用这一条路径。**
 *
 * 抽出来的理由与上传那次漏掉分块是同一个教训（`upload.ts` 的注释）：
 * 写入路径一旦有第二份拷贝，就会有一份漏掉某个环节——而漏掉的那个
 * 表现是「这篇搜不到」，没有任何报错。
 *
 * 返回 `{ documentId, created }`：
 * - `created: false` = 同一 URL 已经在库里（`canonical_url` 唯一索引命中）
 * - 已存在时**不重算分块、不重跑嵌入**（正文与原来相同，重跑是白花钱）
 */
export async function ingestDocument(input: IngestInput): Promise<{
  documentId: string | null
  created: boolean
}> {
  const id = nanoid(16)
  const now = new Date()

  const [row] = await db
    .insert(documents)
    .values({
      id,
      kind: input.kind,
      status: 'ready',
      title: input.title,
      body: input.markdown,
      excerpt: toExcerpt(input.markdown),
      searchText: toSearchText(input.title, input.markdown),
      contentHash: contentHash(input.markdown),
      url: input.url,
      canonicalUrl: canonicalize(input.url),
      author: input.author ?? null,
      folder: input.folder ?? null,
      ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
      capturedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: documents.canonicalUrl })
    .returning({ id: documents.id })

  // 同一篇文章抓两次只留一条（canonical_url 唯一索引）。冲突时返回已有记录的 id，
  // 而不是报错——用户重复粘贴同一个链接是常见行为，不该看到错误
  const documentId =
    row?.id ??
    (
      await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.canonicalUrl, canonicalize(input.url)))
    )[0]?.id ??
    null

  if (!row?.id || !documentId) return { documentId, created: false }

  /**
   * 分块 + 尽力嵌入。**只在这次真的新入库时做**：重复抓同一篇
   * （`onConflictDoNothing` 命中）时正文与原来相同，重算分块是白花时间、
   * 重跑嵌入是白花钱。
   */
  await rebuildChunksAndEmbed(documentId, input.markdown).catch((error: unknown) => {
    // 分块失败不该让抓取显示为失败：正文已经入库了，重建索引会补上。
    // 但必须留日志——否则「这篇搜不到」会没有任何线索
    console.warn(`入库后的分块/嵌入失败（${documentId}），重建索引可修复：`, error)
  })

  return { documentId, created: true }
}
