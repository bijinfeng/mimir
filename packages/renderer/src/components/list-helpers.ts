import {
  formatBytes,
  formatLabel,
  parseSupport,
  type DocumentSummary,
  type DocumentListQuery,
} from '@mimir/shared'

/**
 * 库视图的状态文案与派生计算。
 *
 * 抽出来的理由：这些函数不依赖组件，而且**它们的一致性直接影响可读性**——
 * 同一个目录路径在侧栏、面包屑、查询参数里必须指的是同一件事，
 * 散在组件里就容易只改一处。
 */

/**
 * scope 字符串 → 列表查询参数。目录与标签是两个不同的筛选维度。
 *
 * 来源（kind）不再是浏览维度（D-047）：界面不按「笔记 / 资料」分组，
 * 组织靠目录、标签与搜索。后端的 kind/kinds 参数仍在契约里，
 * 只是 UI 不再产生它们。
 */
export function scopeParams(scope: string): Pick<DocumentListQuery, 'folder' | 'tag'> {
  if (scope.startsWith('folder:')) return { folder: scope.slice('folder:'.length) }
  if (scope.startsWith('tag:')) return { tag: scope.slice('tag:'.length) }
  return {}
}

/**
 * 库视图的布局偏好（卡片 / 列表）。
 *
 * 纯客户端的渲染偏好，存 `localStorage` 而不是数据库——与侧边栏折叠
 * （`_app.tsx` 的 `NAV_COLLAPSED_KEY`）同一条判断：服务端不关心，
 * 也没必要为它多一次请求。新版工作区默认用便于扫读的列表；已经选过
 * 卡片或列表的用户仍按自己的偏好展示。
 */
export const LIBRARY_LAYOUTS = ['card', 'list'] as const
export type LibraryLayout = (typeof LIBRARY_LAYOUTS)[number]

const LIBRARY_LAYOUT_KEY = 'mimir.library-layout'

export function readLibraryLayout(): LibraryLayout {
  try {
    const value = localStorage.getItem(LIBRARY_LAYOUT_KEY)
    return LIBRARY_LAYOUTS.includes(value as LibraryLayout) ? (value as LibraryLayout) : 'list'
  } catch {
    // localStorage 在隐私模式或存储被禁用时会抛错——一个偏好不该有那种能力
    return 'list'
  }
}

export function writeLibraryLayout(layout: LibraryLayout): void {
  try {
    localStorage.setItem(LIBRARY_LAYOUT_KEY, layout)
  } catch {
    // 写不进去只影响「下次打开还记不记得」，不该影响这次切换
  }
}

/**
 * 库卡片的第二行。
 *
 * ## 为什么这一行不能空着
 *
 * 卡片的第二行是摘要（`.trellis/spec/project/design.md` §8.2）。一份还没提取出正文的文件
 * 没有摘要——如果就此留白，那一行看起来像**加载失败或者坏掉了**。
 * 更糟的是它传达了一个确定的错误信息：「这篇没有内容」。
 *
 * 事实上「没有正文」有四种完全不同的原因，它们给用户的下一步动作不同：
 *
 * | 情形 | 说什么 | 用户该做什么 |
 * |---|---|---|
 * | 空文件 | 「空文件」 | 重新上传一份有内容的 |
 * | 提取失败 | 「提取失败：{原因}」 | 看原因（编码不对？文件损坏？） |
 * | 还没有实现（`planned`，M1-E 起暂无此格式） | 「该格式的正文提取将在后续版本支持」 | 下载原件看，等支持 |
 * | 未知格式 | 「原件已保存，可下载查看」 | 下载原件看 |
 *
 * PDF 原本是 `planned` 的例子；M1-E 给它补了文字层提取（`plugins/parser/src/pdf.ts`），
 * 现在走 `now` 分支——提取不出文字（扫描件）时说「正文是空的（文件里没有可提取的文字）」。
 * `planned` 分支因此保留着但暂时空集，为下一个未实现格式（旧版 .doc / OCR）留着。
 *
 * 这与热力图把「用量未上报」画成斜纹而不是空底是同一条规矩：
 * **不静默说谎**。空白在那里等于在说「我那天没用」。
 *
 * 详情面板（FilePreview 的状态行）也要说同一句话，所以写在一处。
 */
export function excerptText(doc: DocumentSummary): string {
  const text = doc.excerpt.trim()
  if (text !== '') return text

  // 笔记与抓取的资料一定该有正文；它们为空是真出了问题，如实说明
  if (doc.kind !== 'file') return '（还没有内容）'

  if (doc.size === 0) return '空文件'

  const support = parseSupport(doc.mime, doc.title)
  if (support === 'now') return '正文是空的（文件里没有可提取的文字）'
  if (support === 'planned') return '该格式的正文提取将在后续版本支持，原件可下载'

  return '原件已保存，可下载查看'
}

/**
 * 卡片元信息行里的格式与大小：「PDF · 2.4 MB」。
 *
 * 返回 null 表示这条文档没有原件（笔记与抓取的资料），那一行不显示它。
 * 格式是**属性**，用中性文字而不是徽标（DESIGN §0.1：每加一种格式
 * 就多一个色位是说不通的）。
 */
export function formatMeta(doc: DocumentSummary): string | null {
  if (doc.kind !== 'file' || !doc.mime) return null
  const label = formatLabel(doc.mime, doc.title)
  return doc.size === null ? label : `${label} · ${formatBytes(doc.size)}`
}

/**
 * 卡片元信息行里的种类词：笔记 / 网页 / 公众号 / GitHub。
 *
 * 上传件返回 null——它的这一位是「格式」（formatLabel），由调用方画成
 * 徽标，两种身份不混在同一列。
 */
export function kindLabel(doc: DocumentSummary): string | null {
  if (doc.kind === 'note') return '笔记'
  if (doc.kind === 'web') return '网页'
  if (doc.kind === 'wechat') return '公众号'
  if (doc.kind === 'github') return 'GitHub'
  return null
}

/**
 * 上传件的格式徽标（PDF / XLSX / DOCX…）。仅上传件有格式这一说。
 */
export function formatChip(doc: DocumentSummary): string | null {
  if (doc.kind !== 'file' || !doc.mime) return null
  return formatLabel(doc.mime, doc.title)
}

/**
 * 卡片右下角的绝对时间（`2026/09/30 15:15`）。
 *
 * 卡片是**文件**的展台（图1 形态），绝对时间比相对时间对得上用户的文件
 * 习惯；自己拼而不用 toLocaleString：后者在 zh-CN 下是 `2026/9/30 15:15`，
 * 月/日不补零会让同一列的宽度跳。
 */
const pad2 = (value: number) => String(value).padStart(2, '0')

export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/**
 * 相对时间。
 *
 * 自己算而不装 dayjs 的 relativeTime 插件：只为卡片上一处显示引入一个插件
 * 和一份中文语言包不值得，而这段逻辑的规则是稳定的。
 */
export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const minutes = Math.round((Date.now() - then) / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时前`

  const days = Math.round(hours / 24)
  if (days === 1) return '昨天'
  if (days < 30) return `${days} 天前`

  return new Date(iso).toLocaleDateString('zh-CN')
}
