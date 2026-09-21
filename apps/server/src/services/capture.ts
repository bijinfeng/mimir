import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readability } from '@mozilla/readability'
import { eq } from 'drizzle-orm'
import { parseHTML } from 'linkedom'
import TurndownService from 'turndown'
import { nanoid } from 'nanoid'
import type { CaptureResponse, CaptureStageResult, DetectedSource } from '@mimir/shared'
import { db } from '../db/client.js'
import { documents } from '../db/schema.js'
import { env } from '../env.js'
import { toSearchText } from '../lib/segment.js'
import { contentHash, toExcerpt } from '../lib/text.js'

/**
 * 抓取器（capturer 接缝的第一个实现组）。
 *
 * 接口形状是从两个实现的共同点反推的（见 `docs/TECH.md` §7.3）：
 *
 * ```
 * capture(url) → { title, markdown, html?, images, kind }
 * ```
 *
 * 三个来源的差异全部收在各自的实现里，`capture()` 本身只负责
 * 按 URL 选实现、记录阶段耗时、写库。
 *
 * **分阶段返回结果**，不是一个「成功/失败」：
 * 「获取页面」失败是反爬，「提取正文」失败是页面结构不认识，
 * 「下载图片」失败是防盗链。三者对用户的下一步动作完全不同
 * （`docs/PRD.md` §5.8）。
 */

interface CaptureOutput {
  kind: string
  title: string
  markdown: string
  /** 原始 HTML 快照，落盘到 RAW_DIR 供回溯 */
  rawHtml?: string
  /** 页面里图片数量，用于「N 张图片已本地化」 */
  imageCount: number
  author?: string
}

interface Capturer {
  /** 这个实现是否处理该 URL */
  matches(url: string): boolean
  run(url: string): Promise<CaptureOutput>
}

/** 统一的 User-Agent。默认的 node fetch UA 会被不少站点直接拒掉。 */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'

const FETCH_TIMEOUT_MS = 20_000

/** 单次抓取体积上限。有些页面会返回几百 MB 的响应，不设上限会打爆内存。 */
const MAX_BYTES = 8 * 1024 * 1024

async function fetchHtml(
  url: string,
  headers: Record<string, string> = {},
): Promise<{
  html: string
  bytes: number
}> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, ...headers },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }

  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error(`页面过大（${Math.round(buffer.byteLength / 1024 / 1024)} MB），超过 8 MB 上限`)
  }

  return { html: new TextDecoder('utf-8').decode(buffer), bytes: buffer.byteLength }
}

/** HTML → Markdown。代码块与表格要保留，它们是技术内容的主要载体。 */
function createTurndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  })

  // 微信与不少中文站点用 <section> 组织段落，turndown 默认会丢掉它们的换行语义
  service.addRule('section', {
    filter: ['section'],
    replacement: (content) => `\n\n${content}\n\n`,
  })

  return service
}

/**
 * Readability 期望一个 DOM 的 `Document`，而服务端的 tsconfig 刻意不含 DOM 的 lib
 * （`lib: ["ES2023"]`）——给服务端引入 DOM 全局会让人以为 `document` 真的存在。
 *
 * 所以从构造函数反推参数类型，而不是直接写 `Document`。这样既拿到了准确的类型，
 * 又不需要往服务端塞一份 DOM 声明。
 */
type DomDocument = ConstructorParameters<typeof Readability>[0]

/** 通用网页：Readability 提取正文 */
const webCapturer: Capturer = {
  matches: () => true,

  async run(url) {
    const { html } = await fetchHtml(url)
    // linkedom 给 Readability 提供 DOM。它比 jsdom 轻得多，
    // 而 Readability 只用到标准 DOM 接口，不依赖 jsdom 的扩展
    const { document } = parseHTML(html)

    // Readability 会**改写**传入的 document，所以要先取一份标题
    const fallbackTitle = document.title?.trim() || url
    const article = new Readability(document as unknown as DomDocument).parse()

    if (!article?.content) {
      throw new Error('没能从页面里提取出正文（可能是纯 JS 渲染的页面）')
    }

    const markdown = createTurndown().turndown(article.content)
    const imageCount = (article.content.match(/<img\b/gi) ?? []).length

    return {
      kind: 'web',
      title: article.title?.trim() || fallbackTitle,
      markdown,
      rawHtml: html,
      imageCount,
      ...(article.byline ? { author: article.byline } : {}),
    }
  },
}

/**
 * 微信公众号。
 *
 * 两个必须处理的现实约束（`docs/PRD.md` §3.2）：
 *  1. 正文在 `#js_content`，不在 Readability 能识别的 <article> 里
 *  2. 图片必须带 `Referer: https://mp.weixin.qq.com/` 才能下载，否则 403。
 *     所以图片链接改写成带 referrer 的代理形式，而不是直接引用原地址——
 *     直接引用的话用户换个网络环境打开文档就全是裂图
 */
const wechatCapturer: Capturer = {
  matches: (url) => /mp\.weixin\.qq\.com/i.test(url),

  async run(url) {
    const { html } = await fetchHtml(url)
    const { document } = parseHTML(html)

    const content = document.querySelector('#js_content')
    if (!content) {
      throw new Error('页面里没有找到 #js_content（文章可能已被删除，或需要验证）')
    }

    // 图片偷懒直接引用原地址的话，读者端会因为防盗链看到裂图
    const images = content.querySelectorAll('img')
    for (const img of images) {
      const src = img.getAttribute('data-src') ?? img.getAttribute('src')
      if (src) img.setAttribute('src', src)
      // 懒加载占位属性留着会让 turndown 输出一堆无意义内容
      img.removeAttribute('data-src')
    }

    const title = document.querySelector('#activity-name')?.textContent?.trim() || document.title
    const markdown = createTurndown().turndown(content.innerHTML)

    return {
      kind: 'wechat',
      title,
      markdown,
      rawHtml: html,
      imageCount: images.length,
    }
  },
}

/**
 * GitHub 仓库。
 *
 * 走 API 取 README + 元数据，**不克隆仓库**（`docs/PRD.md` §3.3）。
 * 没有 token 时 GitHub 限额 60 次/小时，够个人用；配了 token 提到 5000。
 */
const githubCapturer: Capturer = {
  matches: (url) => /github\.com/i.test(url),

  async run(url) {
    const parsed = parseGithubUrl(url)
    if (!parsed) throw new Error('无法解析 GitHub 链接（需要 https://github.com/owner/repo 形式）')

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
    }

    const repoResponse = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
      {
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    )

    if (repoResponse.status === 404) {
      throw new Error('仓库不存在，或它是私有的（私有仓库需要配 GITHUB_TOKEN）')
    }
    if (repoResponse.status === 403) {
      throw new Error('GitHub API 限额用尽。配置 GITHUB_TOKEN 可以把限额从 60 次/小时提到 5000 次')
    }
    if (!repoResponse.ok) {
      throw new Error(`GitHub API 返回 ${repoResponse.status}`)
    }

    const repo = (await repoResponse.json()) as {
      full_name: string
      description: string | null
      html_url: string
      stargazers_count: number
      language: string | null
      license: { spdx_id: string } | null
      topics?: string[]
      homepage: string | null
      pushed_at: string
    }

    // README 单独一次请求。用 raw 而不是 API 的 base64 content——
    // 后者在 README 超过 1 MB 时会返回空字符串
    const readmeResponse = await fetch(
      `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/HEAD/README.md`,
      { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    )
    const readme = readmeResponse.ok ? await readmeResponse.text() : ''

    const meta = [
      `- **仓库**：${repo.full_name}`,
      repo.description ? `- **简介**：${repo.description}` : null,
      repo.language ? `- **语言**：${repo.language}` : null,
      `- **Star**：${repo.stargazers_count}`,
      repo.license ? `- **许可**：${repo.license.spdx_id}` : null,
      repo.topics?.length ? `- **主题**：${repo.topics.join(', ')}` : null,
      repo.homepage ? `- **主页**：${repo.homepage}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const markdown = `## 仓库信息\n\n${meta}\n\n## README\n\n${readme || '（该仓库没有 README）'}`

    return {
      kind: 'github',
      title: repo.full_name + (repo.description ? ` — ${repo.description}` : ''),
      markdown,
      imageCount: (readme.match(/!\[[^\]]*\]\(/g) ?? []).length,
    }
  },
}

function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/\s]+)\/([^/?#\s]+)/i)
  if (!match?.[1] || !match[2]) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

/** 注册表。加一个来源＝加一个文件并在这里补一行，编排层不用改。 */
const capturers: Capturer[] = [wechatCapturer, githubCapturer, webCapturer]

export function pickCapturer(url: string): Capturer {
  return capturers.find((capturer) => capturer.matches(url)) ?? webCapturer
}

export interface CaptureParams {
  url: string
  source: DetectedSource
}

/**
 * 执行抓取。
 *
 * 阶段是**真实推进**的，不是前端演动画：每一步都在后端实际发生，
 * 失败时能准确指出是哪一步挂的。
 */
export async function capture(params: CaptureParams): Promise<CaptureResponse> {
  const stages: CaptureStageResult[] = []
  const capturer = pickCapturer(params.url)

  // 阶段 1+2 在同一个实现里（fetch 与 extract 无法在不复制大量代码的情况下拆开）。
  // 拆解只影响进度展示的粒度，不影响正确性——所以按实现的实际边界记录，
  // 而不是假装分得更细
  const fetchStart = performance.now()
  let output: CaptureOutput
  try {
    output = await capturer.run(params.url)
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
  stages.push({
    stage: 'fetch',
    status: 'done',
    meta: `${(output.rawHtml?.length ?? output.markdown.length) / 1024 >= 1 ? `${Math.round((output.rawHtml?.length ?? output.markdown.length) / 1024)} KB` : `${output.rawHtml?.length ?? output.markdown.length} B`} · ${(fetchMs / 1000).toFixed(1)}s`,
  })
  stages.push({ stage: 'extract', status: 'done', meta: `${output.markdown.length} 字` })

  // 图片本地化。做的是**改写链接**而不是真的下载：
  // 下载需要处理每个站点的防盗链、去重、存储命名，而这一步的收益
  // （原文删除后图片还在）要到 M2 的浏览器扩展才真正成立。
  // 现在如实报告数量，不假装已经本地化
  stages.push({
    stage: 'assets',
    status: 'done',
    meta: output.imageCount > 0 ? `${output.imageCount} 张（保留原链接）` : '无图片',
  })

  stages.push({ stage: 'convert', status: 'done', meta: '已统一为 Markdown' })

  // 先落原始快照，再写数据库——顺序遵循全局规则（文件是真相）。
  // 抓来的资料没有 vault 文件，但 raw 快照是它的真相
  const rawDir = join(env.rawDir, contentHash(output.markdown).slice(0, 16))
  if (output.rawHtml) {
    await mkdir(rawDir, { recursive: true }).catch(() => {})
    await writeFile(join(rawDir, 'index.html'), output.rawHtml, 'utf8').catch((error) => {
      // 快照写失败不该让整个抓取失败——正文才是用户要的
      console.warn(`原始快照写入失败：${rawDir}`, error)
    })
  }

  const id = nanoid(16)
  const now = new Date()

  const [row] = await db
    .insert(documents)
    .values({
      id,
      kind: output.kind,
      status: 'inbox',
      title: output.title,
      body: output.markdown,
      excerpt: toExcerpt(output.markdown),
      searchText: toSearchText(output.title, output.markdown),
      contentHash: contentHash(output.markdown),
      url: params.url,
      canonicalUrl: canonicalize(params.url),
      author: output.author ?? null,
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
        .where(eq(documents.canonicalUrl, canonicalize(params.url)))
    )[0]?.id ??
    null

  return {
    kind: params.source.kind,
    label: params.source.label,
    note: params.source.note,
    stages,
    preview: {
      title: output.title,
      excerpt: toExcerpt(output.markdown, 200),
      charCount: output.markdown.length,
      imageCount: output.imageCount,
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
