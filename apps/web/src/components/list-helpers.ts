import {
  CLIP_KINDS,
  formatBytes,
  formatLabel,
  parseSupport,
  type DocumentSummary,
  type DocumentListQuery,
} from '@mimir/shared'

/**
 * 中栏的状态文案与派生计算。
 *
 * 抽出来的理由：这些函数不依赖组件，而且**它们的一致性直接影响可读性**——
 * 「收件箱」这个标题在导航、中栏、查询参数里必须指的是同一件事，
 * 散在组件里就容易只改一处。
 */
export const SCOPE_LABEL: Record<string, string> = {
  inbox: '收件箱',
  all: '全部文档',
  note: '我的笔记',
  clip: '收集的资料',
}

/**
 * 类型筛选胶囊。**按来源，不按格式**（`docs/TECH.md` §13）。
 *
 * 「文件」是一个来源（上传来的原件），它里面可能是 PDF、Word、图片、
 * 压缩包——那些是**格式**，不是类型。格式不进胶囊：每加一种格式就多一个
 * 选项，而胶囊组只有 300px 宽、现在已经要换行了。
 * 想看某个格式，用搜索或在元信息行里认。
 */
export const KIND_FILTERS = [
  { label: '全部', value: 'all' },
  { label: '笔记', value: 'note' },
  { label: '网页', value: 'web' },
  { label: '公众号', value: 'wechat' },
  { label: 'GitHub', value: 'github' },
  { label: '文件', value: 'file' },
]

/**
 * 命中通道 → 人类可读的标签。
 *
 * `matchedBy` 里的名字来自检索通道注册表（plugins/leg），
 * 所以这里要把技术名翻成用户看得懂的话：看到「子串兜底」就知道
 * 是分词没切对但被兜住了；看到「词级召回」才是正常命中。
 */
export function channelLabel(matchedBy: string[]): string {
  const labels: Record<string, string> = {
    keyword: '词级召回',
    substring: '子串兜底',
    vector: '语义召回',
    scope: '范围限定',
  }
  const names = matchedBy.map((name) => labels[name] ?? name)
  return names.length > 0 ? names.join(' · ') : '已引用'
}

/**
 * scope 字符串 → 列表查询参数。目录与标签是两个不同的筛选维度。
 *
 * **`clip` 用 `kinds`（多值），不是 `kind`。** 这里原先返回空对象——
 * 于是「收集的资料」这个视图**不过滤任何东西**，点进去看到的是全部文档，
 * 而左导航上的计数是按「非笔记」算的。两个数字对不上，且因为当时库里
 * 全是笔记而看不出来。现在两个都引用 `CLIP_KINDS`（`@mimir/shared`），
 * 加一种来源只有一处要改。
 */
export function scopeParams(
  scope: string,
): Pick<DocumentListQuery, 'folder' | 'tag' | 'status' | 'kind' | 'kinds'> {
  if (scope.startsWith('folder:')) return { folder: scope.slice('folder:'.length) }
  if (scope.startsWith('tag:')) return { tag: scope.slice('tag:'.length) }
  if (scope === 'inbox') return { status: 'inbox' }
  if (scope === 'note') return { kind: 'note' }
  if (scope === 'clip') return { kinds: [...CLIP_KINDS] }
  return {}
}

export function scopeTitle(scope: string, query: string): string {
  if (query) return '搜索结果'
  if (scope.startsWith('folder:')) {
    const path = scope.slice('folder:'.length)
    return path.split('/').pop() ?? '目录'
  }
  if (scope.startsWith('tag:')) return `#${scope.slice('tag:'.length)}`
  return SCOPE_LABEL[scope] ?? '全部文档'
}

/**
 * 列表项的第二行。
 *
 * ## 为什么这一行不能空着
 *
 * 列表项的第二行是摘要（`docs/DESIGN.md` §8.2）。一份还没提取出正文的文件
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
 * 截图里的实现是把这几句写在一处、由列表项直接调用的——不散在组件里，
 * 因为详情面板也要说同一句话（`FilePreview` 的状态行）。
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
 * 列表项元信息行里的格式与大小：「PDF · 2.4 MB」。
 *
 * 返回 null 表示这条文档没有原件（笔记与抓取的资料），那一行不显示它。
 */
export function formatMeta(doc: DocumentSummary): string | null {
  if (doc.kind !== 'file' || !doc.mime) return null
  const label = formatLabel(doc.mime, doc.title)
  return doc.size === null ? label : `${label} · ${formatBytes(doc.size)}`
}

/**
 * 相对时间。
 *
 * 自己算而不装 dayjs 的 relativeTime 插件：只为列表里一处显示引入一个插件
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
