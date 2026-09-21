import type { DocumentListQuery } from '@mimir/shared'

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

export const KIND_FILTERS = [
  { label: '全部', value: 'all' },
  { label: '笔记', value: 'note' },
  { label: '网页', value: 'web' },
  { label: '公众号', value: 'wechat' },
  { label: 'GitHub', value: 'github' },
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

/** scope 字符串 → 列表查询参数。目录与标签是两个不同的筛选维度。 */
export function scopeParams(
  scope: string,
): Pick<DocumentListQuery, 'folder' | 'tag' | 'status' | 'kind'> {
  if (scope.startsWith('folder:')) return { folder: scope.slice('folder:'.length) }
  if (scope.startsWith('tag:')) return { tag: scope.slice('tag:'.length) }
  if (scope === 'inbox') return { status: 'inbox' }
  if (scope === 'note') return { kind: 'note' }
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
