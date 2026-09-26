/**
 * 上传文件的纯函数工具（`docs/TECH.md` §13）。
 *
 * 放在 `shared` 而不是宿主或前端：`mime` 与「哪些类型可以内联」是**两端共用的
 * 判断**——服务端据此决定 `Content-Disposition`，前端据此决定用哪个查看器。
 * 各写一份的话，「服务端内联了 SVG 而前端以为它不可预览」是迟早的事。
 *
 * 这里只放不依赖 Node 与浏览器的东西（映射表与字符串处理），
 * 因此它能同时被两侧引用。
 */

/**
 * 单个上传文件的上限：50 MB。
 *
 * 值本身是**产品判断**——笔记与文档附件都在这个量级，而更大的东西
 * （数据集、视频素材）属于另一个产品形态。
 *
 * 与头像的 `AVATAR_MAX_BYTES` 一样是常量而不是环境变量：它决定的是
 * **产品接受什么**，不是部署环境怎么连。写进 env 会多出一个没人会调、
 * 但出问题时要在两处排查的配置项。
 */
export const FILE_MAX_BYTES = 50 * 1024 * 1024

/** 扩展名 → MIME。未命中的一律 `application/octet-stream` */
const MIME_BY_EXT: Record<string, string> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  json: 'application/json',
  yaml: 'application/yaml',
  yml: 'application/yaml',
  xml: 'application/xml',
  html: 'text/html',
  htm: 'text/html',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  epub: 'application/epub+zip',
  zip: 'application/zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
}

export function extensionOf(filename: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(filename.trim())
  return match ? match[1]!.toLowerCase() : ''
}

/**
 * 判定 MIME。
 *
 * **扩展名优先于浏览器给的 `type`**：后者对不认识的扩展名是空串，而且常错
 * （`.md` 在不少环境里被报成 `text/plain`）。扩展名是文件的真相，
 * MIME 只是我们对它的推断——与「文件是真相，数据库是可重建的索引」同一条道理。
 */
export function mimeFromFilename(filename: string, declared?: string): string {
  const fromExt = MIME_BY_EXT[extensionOf(filename)]
  if (fromExt) return fromExt
  return declared !== undefined && declared !== '' ? declared : 'application/octet-stream'
}

/** 展示用标题：去掉扩展名。空名回落到「未命名文件」，而不是一个空标题 */
export function titleFromFilename(filename: string): string {
  const trimmed = filename.trim()
  const withoutExt = trimmed.replace(/\.[A-Za-z0-9]+$/, '').trim()
  return (withoutExt || trimmed || '未命名文件').slice(0, 200)
}

/**
 * 可以内联预览（`Content-Disposition: inline`）的 MIME。
 *
 * **这是白名单，不是黑名单。** 上传的内容由同一个源提供，而 `text/html`
 * 与 `image/svg+xml` 里可以带脚本——内联它们等于在应用自己的源上执行
 * 用户文件里的脚本，会话 cookie 就在同一个源里。所以这两类强制走
 * `attachment`（下载），其余未知类型同理。
 */
export function isInlineSafe(mime: string): boolean {
  const lower = mime.toLowerCase()
  if (lower === 'image/svg+xml' || lower === 'text/html') return false
  return (
    lower === 'text/plain' ||
    lower === 'text/markdown' ||
    lower === 'text/csv' ||
    lower === 'application/pdf' ||
    lower.startsWith('image/') ||
    lower.startsWith('audio/') ||
    lower.startsWith('video/')
  )
}

/**
 * 原件预览用哪种查看器。
 *
 * 三种都有**浏览器原生能力**，所以一分钱依赖都不花：PDF 交给浏览器自带的
 * 阅读器（iframe）、图片用 `img`、音视频用对应的媒体元素。
 * 其余格式没有查看器——那时原件层的唯一出口是下载，这一点由界面如实说明。
 *
 * **格式族在这里分派，不在组件里判断。** 列表与详情面板都要回答
 * 「这东西能不能看图」，写两处必然有一天不一致（一处说能、一处说不）。
 */
export type ViewerKind = 'pdf' | 'image' | 'audio' | 'video' | 'office' | 'sheet' | 'deck' | 'none'

/**
 * `office` 是**编辑器**不是只读查看器（`packages/office`）：docx 可在网页里
 * 直接改并保存回原件。
 *
 * `sheet` / `deck` 是 xlsx / pptx 的**只读预览**（网格与幻灯片）。它们与
 * `office` 分开而不是合并，因为三者的能力面不同——合并成一个 kind 会让
 * 「能不能编辑」这件事只能靠 MIME 再判断一次，那就把这条分派规则拆成两处了。
 * 各自的实现见 `docs/TECH.md` §15.7。
 */
export function viewerFor(mime: string | null | undefined): ViewerKind {
  const lower = (mime ?? '').toLowerCase()
  if (lower === 'application/pdf') return 'pdf'
  if (lower.startsWith('image/')) return 'image'
  if (lower.startsWith('audio/')) return 'audio'
  if (lower.startsWith('video/')) return 'video'
  if (lower === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'office'
  }
  // xlsx 是**只读网格预览**（与 office 的可编辑不同：电子表格的读取路径
  // 需要另一套工程，见 TECH §15.7）
  if (lower === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return 'sheet'
  }
  // pptx 是**只读幻灯片预览**（渲成 SVG；见 TECH §15.7）
  if (lower === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    return 'deck'
  }
  return 'none'
}

/**
 * 这个格式的正文**现在**能不能自动提取出来。
 *
 * 三态，每一态在界面上对应一句不同的话——因为用户的下一步动作不同：
 *
 * | 值 | 含义 | 界面说什么 | 用户能做什么 |
 * |---|---|---|---|
 * | `'now'` | 有实现 | 正文照常显示 | 读、搜、被引用 |
 * | `'planned'` | 现在没有、路线图上要加 | 「该格式的正文提取将在后续版本支持」 | 下载原件 |
 * | `'none'` | 这个格式没有「正文」这个概念 | 「原件已保存」 | 下载原件 |
 *
 * 把 `'planned'` 说成「解析失败」就等于说它坏了，而它只是还没有——
 * 这与「用量未上报画成斜纹而不是空底」是同一条：**不静默说谎**。
 */
export type ParseSupport = 'now' | 'planned' | 'none'

/**
 * MIME → 该用哪个 parser 实现（`accepts` 的取值）。
 *
 * **必须在两端说同一件事**：服务端据此选实现，前端据此决定「正文这一层
 * 有没有东西可看」。各写一份的话，会出现「服务端提取出了正文、而前端
 * 以为这个格式没有正文因而不显示」——那种 bug 看起来像数据丢了。
 *
 * 与 `parseSupport` 的关系：这里只回答「用哪个实现」，不回答「有没有」。
 * 分开是必要的——`planned` 的格式现在没有实现（返回 null），
 * 而界面仍要知道它是「将要有」而不是「压根没有」。
 */
export type ParseTarget = 'markdown' | 'html' | 'text' | 'docx' | 'xlsx' | 'pptx'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

export function parseTargetFor(
  mime: string | null | undefined,
  filename?: string,
): ParseTarget | null {
  const lower = (mime ?? '').toLowerCase()

  if (lower === 'text/markdown') return 'markdown'
  if (lower === 'text/html') return 'html'
  if (lower === DOCX_MIME) return 'docx'
  if (lower === XLSX_MIME) return 'xlsx'
  if (lower === PPTX_MIME) return 'pptx'

  // 其余文本类（txt / csv / json / yaml / xml / 代码）都走纯文本直通
  if (lower.startsWith('text/')) return 'text'

  // MIME 认不出来时看扩展名。两份判断**顺序一致**（先 mime 后扩展名），
  // 否则「浏览器报 text/plain 的 .csv」与「浏览器不报类型的 .csv」会走不同路径
  const ext = extensionOf(filename ?? '')
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  if (ext === 'html' || ext === 'htm') return 'html'
  if (ext === 'docx') return 'docx'
  if (ext === 'xlsx') return 'xlsx'
  if (ext === 'pptx') return 'pptx'
  if (TEXT_EXTENSIONS.has(ext)) return 'text'

  return null
}

/** 按扩展名判定的纯文本类型。没有它就只剩 mime 一条路，而 mime 常缺 */
const TEXT_EXTENSIONS = new Set([
  'txt',
  'text',
  'log',
  'csv',
  'tsv',
  'json',
  'jsonl',
  'ndjson',
  'yaml',
  'yml',
  'toml',
  'ini',
  'conf',
  'env',
  'xml',
  'css',
  'scss',
  'less',
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'tsx',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'php',
  'swift',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'sql',
  'graphql',
  'vue',
  'svelte',
  'diff',
  'patch',
])

export function parseSupport(mime: string | null | undefined, filename?: string): ParseSupport {
  if (parseTargetFor(mime, filename) !== null) return 'now'

  const lower = (mime ?? '').toLowerCase()
  if (PLANNED_MIMES.has(lower)) return 'planned'

  // 扩展名兜底：`.pdf` 在浏览器里报 `application/octet-stream` 是常见情况
  const ext = extensionOf(filename ?? '')
  if (PLANNED_EXTENSIONS.has(ext)) return 'planned'

  return 'none'
}

/**
 * 现在还没有正文提取、但路线图上有的一类。
 *
 * `application/pdf` 在这里——它缺的是**文本提取**，而它的**预览**已经能用了
 * （浏览器自带的阅读器），所以界面上 PDF 是「能看原件 + 还没有可搜的正文」，
 * 这与 Office 那三个（有提取、无预览）正好互补。
 */
const PLANNED_MIMES = new Set(['application/pdf'])

const PLANNED_EXTENSIONS = new Set(['pdf'])

/**
 * 人类可读的字节数。
 *
 * 服务端的错误文案（「文件超过 50 MB」）与前端列表的元信息行共用这一份，
 * 避免两处对同一个数字给出不同说法——这个项目最不能忍的就是两处各说各话。
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${Math.round(bytes)} B`

  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`

  const mb = kb / 1024
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`

  return `${(mb / 1024).toFixed(1)} GB`
}

/**
 * 元信息行里显示的格式名：「PDF」「Word」「图片」。
 *
 * 显示的是**人能念的格式名**而不是 MIME 原文（`application/vnd…`）——
 * 元信息行只有 12.5px，而用户认的是「Word」不是那串 vendor 前缀。
 * 认不出来的回落到扩展名大写（`ZIP`），最后才是「文件」。
 */
export function formatLabel(mime: string | null | undefined, filename?: string): string {
  const lower = (mime ?? '').toLowerCase()
  const exact: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/zip': 'ZIP',
    'application/json': 'JSON',
    'application/yaml': 'YAML',
    'application/xml': 'XML',
    'application/epub+zip': 'EPUB',
  }
  if (exact[lower]) return exact[lower]

  if (lower.includes('wordprocessingml') || lower === 'application/msword') return 'Word'
  if (lower.includes('spreadsheetml') || lower === 'application/vnd.ms-excel') return 'Excel'
  if (lower.includes('presentationml') || lower === 'application/vnd.ms-powerpoint') return 'PPT'
  if (lower.startsWith('image/')) return '图片'
  if (lower.startsWith('audio/')) return '音频'
  if (lower.startsWith('video/')) return '视频'
  if (lower.startsWith('text/')) return '文本'

  const ext = extensionOf(filename ?? '')
  return ext ? ext.toUpperCase() : '文件'
}
