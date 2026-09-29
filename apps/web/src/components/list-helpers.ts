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
 * 「收件箱」这个标题在导航、库视图、查询参数里必须指的是同一件事，
 * 散在组件里就容易只改一处。
 */
export const SCOPE_LABEL: Record<string, string> = {
  all: '全部文档',
}

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
 * 标题栏里那一行标题。
 *
 * ## 搜索时为什么目录要说「全部文档」
 *
 * 检索契约（`@mimir/shared` 的 `searchQuerySchema`）只有 `kind` / `tag`，
 * **没有目录**——所以带着 `scope=folder:X` 搜索时，结果其实来自全库。
 * 而侧栏那条目录仍高亮着，界面不说破的话，用户会得出「这个目录里有这篇
 * 文章」——一个错的结论，且看不出来（DESIGN §0.2「状态必须能被看见」）。
 *
 * 所以在目录里搜索时，标题如实写出范围是**全部文档**；标签能被检索过滤
 * （`tag` 参数存在），标题照旧只说「搜索结果」。
 */
export function scopeTitle(scope: string, query: string): string {
  if (query) return scope.startsWith('folder:') ? '搜索结果 · 全部文档' : '搜索结果'
  if (scope.startsWith('folder:')) {
    const path = scope.slice('folder:'.length)
    return path.split('/').pop() ?? '目录'
  }
  if (scope.startsWith('tag:')) return `#${scope.slice('tag:'.length)}`
  return SCOPE_LABEL[scope] ?? '全部文档'
}

/**
 * 空态里那句「这个动作不会落进当前范围」。
 *
 * ## 为什么要有它
 *
 * 空目录里的两个入口（收集内容 / 新建笔记）建出来的东西**不归入该目录**：
 * 新建笔记写 `folder: null`（`services/documents.ts` 的 `createNote`），
 * 收集走的是上传 + 抓取，也不带目录。于是用户站在空目录里点「新建笔记」，
 * 内容落在库根，回来一看目录还是空的——像按钮没生效。
 *
 * 改动写入路径要动契约（`noteCreateSchema` 没有 folder）与服务端写路径，
 * 超出了这一处；所以先**如实说明**会建到哪里、以及建好后怎么指派
 * （同 `excerptText` 那条「不静默说谎」）。
 *
 * 只给目录、不给标签：**空目录是一个正常状态**（D-068 起目录是实体，
 * 侧栏会列出它），用户会真的站在一个空目录里；而标签由文档派生，
 * 「标签视图为空」只出现在旧链接上，不是日常路径。
 *
 * 返回 null 表示当前 scope 没有这个落差（全部文档 / 标签 / 认不出的 scope）。
 */
export function emptyScopeHint(scope: string): string | null {
  if (scope.startsWith('folder:')) {
    return '新建与收集的内容落在库根，建好后可在详情的「⋯」里指派到这个目录'
  }
  return null
}

/**
 * 库视图的布局偏好（卡片 / 列表）。
 *
 * 纯客户端的渲染偏好，存 `localStorage` 而不是数据库——与侧边栏折叠
 * （`_app.tsx` 的 `NAV_COLLAPSED_KEY`）同一条判断：服务端不关心，
 * 也没必要为它多一次请求。读不到或值非法时回落**卡片**——它是
 * D-047 以来的默认形态，老用户不应因为加了个开关就换一种观感。
 */
export const LIBRARY_LAYOUTS = ['card', 'list'] as const
export type LibraryLayout = (typeof LIBRARY_LAYOUTS)[number]

const LIBRARY_LAYOUT_KEY = 'mimir.library-layout'

export function readLibraryLayout(): LibraryLayout {
  try {
    const value = localStorage.getItem(LIBRARY_LAYOUT_KEY)
    return LIBRARY_LAYOUTS.includes(value as LibraryLayout) ? (value as LibraryLayout) : 'card'
  } catch {
    // localStorage 在隐私模式或存储被禁用时会抛错——一个偏好不该有那种能力
    return 'card'
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
 * 卡片的第二行是摘要（`docs/DESIGN.md` §8.2）。一份还没提取出正文的文件
 * 没有摘要——如果就此留白，那一行看起来像**加载失败或者坏掉了**。
 * 更糟的是它传达了一个确定的错误信息：「这篇没有内容」。
 *
 * 事实上「没有正文」有四种完全不同的原因，它们给用户的下一步动作不同：
 *
 * | 情形 | 说什么 | 用户该做什么 |
 * |---|---|---|
 * | 空文件 | 「空文件」 | 重新上传一份有内容的 |
 * | 提取失败 | 「提取失败：{原因}」 | 看原因（编码不对？文件损坏？） |
 * | 还没有实现（PDF） | 「该格式的正文提取将在后续版本支持」 | 下载原件看，等支持 |
 * | 未知格式 | 「原件已保存，可下载查看」 | 下载原件看 |
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
