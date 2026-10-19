import inventory from './scenes.json'

export const groups = inventory.groups
export const fixtures = groups.flatMap((group) =>
  group.states.map((state) => ({ ...state, group })),
)
export type Fixture = (typeof fixtures)[number]
export type RequestState =
  | 'ready'
  | 'loading'
  | 'empty'
  | 'error'
  | 'partial'
  | 'retry'
  | 'cached'
  | 'refresh'
  | 'error-cached'
  | 'unauthorized'
export type HostKind =
  | 'none'
  | 'rename'
  | 'move'
  | 'find'
  | 'capture'
  | 'guard'
  | 'document'
  | 'chat'
  | 'created'
export interface Recipe {
  query: string
  request: RequestState
  recent: RequestState
  context: 'none' | 'note' | 'file' | 'loading' | 'error'
  host: HostKind
  hostState: string
  open: boolean
  dirty: boolean
  auto: boolean
  active: number
  large: boolean
}
export function recipeFor(fixture: Fixture): Recipe {
  const [_, group, state] = fixture.id.split('.')
  const recipe: Recipe = {
    query: '',
    request: 'ready',
    recent: 'ready',
    context: 'none',
    host: 'none',
    hostState: state!,
    open: true,
    dirty: false,
    auto: false,
    active: 0,
    large: false,
  }
  if (group === 'entry')
    recipe.open = !['button', 'rail', 'drawer', 'ctrl-k', 'cmd-k', 'editor'].includes(state!)
  if (group === 'recents') {
    recipe.recent =
      (
        {
          loading: 'loading',
          empty: 'empty',
          partial: 'partial',
          failed: 'error',
          retry: 'retry',
          unauthorized: 'unauthorized',
          storage: 'empty',
          'user-unknown': 'empty',
        } as Record<string, RequestState>
      )[state!] ?? 'ready'
    recipe.large = state === 'ready'
  }
  if (group === 'input') {
    recipe.query =
      (
        {
          blank: '   ',
          single: '新',
          two: '知识',
          case: 'GitHub',
          clear: '知识',
          compose: '知识',
          'compose-enter': '新',
          'compose-arrows': '知识',
          long: '知识'.repeat(251),
          paste: '知识'.repeat(245),
        } as Record<string, string>
      )[state!] ?? ''
  }
  if (group === 'query') {
    recipe.query = state === 'pending-command' ? '新建' : '知识'
    recipe.request =
      (
        {
          loading: 'loading',
          'pending-command': 'loading',
          cached: 'cached',
          refresh: 'refresh',
          empty: 'empty',
          error: 'error',
          retry: 'error',
          'retry-pending': 'retry',
          'error-cached': 'error-cached',
          'query-race': 'loading',
          'closed-late': 'loading',
          'query-clear': 'loading',
        } as Record<string, RequestState>
      )[state!] ?? 'ready'
  }
  if (['hits', 'selection', 'open-hit', 'layout'].includes(group!)) recipe.query = '知识'
  if (group === 'selection') {
    if (state === 'documents-first') recipe.query = '新建'
    if (state === 'commands-only') {
      recipe.query = '新建'
      recipe.request = 'empty'
    }
    if (state === 'list-growth') {
      recipe.query = '新建'
      recipe.request = 'loading'
    }
    recipe.large = state === 'scroll'
    recipe.active = ['down', 'scroll', 'list-shrink'].includes(state!) ? 5 : 0
  }
  if (group === 'new-note') {
    recipe.query = '新建'
    recipe.request = 'empty'
    recipe.dirty = ['dirty', 'cancel-guard'].includes(state!)
  }
  if (group === 'capture') {
    recipe.query = '收集'
    recipe.request = 'empty'
    recipe.dirty = state === 'dirty'
  }
  if (group === 'context')
    recipe.context = ['none', 'file', 'loading', 'error'].includes(state!)
      ? (state as Recipe['context'])
      : 'note'
  if (['rename', 'move', 'find'].includes(group!)) {
    recipe.context = 'note'
    recipe.host = group as HostKind
    recipe.open = false
  }
  if (group === 'open-hit') {
    recipe.dirty = state === 'cancel-guard'
    if (state === 'recent') recipe.query = ''
    if (state === 'back') {
      recipe.query = '返回'
      recipe.context = 'note'
      recipe.request = 'empty'
    }
  }
  if (group === 'ai') {
    recipe.query = state === 'blank' ? '' : state === 'one' ? '知' : '怎样整理我的知识？'
    recipe.request = state === 'searching' ? 'loading' : state === 'error' ? 'error' : 'empty'
    recipe.dirty = ['dirty', 'cancel'].includes(state!)
  }
  if (group === 'guard') {
    recipe.host = 'guard'
    recipe.open = false
    recipe.context = 'note'
    recipe.dirty = !['clean', 'saved-during'].includes(state!)
    recipe.auto = ['auto', 'saved-during'].includes(state!)
    if (state === 'clean') {
      recipe.host = 'none'
      recipe.open = true
    }
  }
  if (group === 'layout') {
    recipe.large = ['low', 'zoom', 'touch'].includes(state!)
    recipe.context = 'note'
  }
  return recipe
}

export const baseHits = [
  {
    key: 'mimir-0',
    title: 'mimir 产品说明 · 命中 1',
    snippet: 'mimir 是你的知识工作区。写笔记、收集资料，再从自己的内容里搜索和提问。',
    path: '开始使用',
    kind: 'note',
  },
  {
    key: 'mimir-1',
    title: 'mimir 产品说明 · 命中 2',
    snippet:
      '先在设置里配置模型，再到「设置 › 检索」补全搜索内容。「测试搜索」可帮助你检查结果。没有配置对话模型时，提问会提示先完成配置。',
    path: '开始使用',
    kind: 'note',
  },
  {
    key: 'mimir-2',
    title: 'mimir 产品说明 · 命中 3',
    snippet:
      '数据与备份：上传文件会保留原件。在「设置 › 数据与备份」可以导出文档与附件，也可以导出完整记录。',
    path: '开始使用',
    kind: 'note',
  },
  {
    key: 'mimir-3',
    title: 'mimir 产品说明 · 命中 4',
    snippet:
      '整理与编辑：用知识库和文件夹整理内容，也可以给文档加标签。笔记可直接编辑；上传的原件可以下载、替换或在线编辑。',
    path: '开始使用',
    kind: 'note',
  },
  {
    key: 'mimir-4',
    title: 'mimir 产品说明 · 命中 5',
    snippet:
      '从这里开始写一篇笔记：在知识库中点「新建文件」，直接开始写。收集资料：点「添加文档」上传文件或粘贴链接。',
    path: '开始使用',
    kind: 'note',
  },
]
export const recentHits = [
  {
    key: 'recent-1',
    title: '知识整理的方法',
    snippet: '个人知识库 / 方法与实践',
    path: '个人知识库/方法与实践',
    kind: 'note',
  },
  {
    key: 'recent-2',
    title: '每周回顾 · 把收集变成自己的理解',
    snippet: '个人知识库 / 每周回顾',
    path: '个人知识库/每周回顾',
    kind: 'note',
  },
  { key: 'recent-3', title: 'mimir 产品说明', snippet: '开始使用', path: '开始使用', kind: 'note' },
]

export function hitsFor(fixture: Fixture, query: string) {
  let hits = baseHits.map((hit) => Object.assign({}, hit))
  if (fixture.id === 'search.hits.one') hits = hits.slice(0, 1)
  if (fixture.id === 'search.hits.multi-document')
    hits = [
      hits[0]!,
      { ...hits[1]!, key: 'method', title: '知识整理的方法', path: '个人知识库/方法与实践' },
      { ...hits[2]!, key: 'review', title: '每周回顾', path: '个人知识库/每周回顾' },
    ]
  if (fixture.id === 'search.hits.long-title')
    hits[0]!.path = '个人知识库/方法与实践/长期学习/整理与复习/从资料到理解'
  if (fixture.id === 'search.hits.long-title' || fixture.id.startsWith('search.layout'))
    hits[0]!.title =
      '从收集资料到形成自己的知识体系：一份关于长期整理、复习与写作的完整实践记录 · 命中 1'
  if (fixture.id === 'search.hits.long-snippet')
    hits[0]!.snippet = '知识的价值在于反复使用。'.repeat(35)
  if (fixture.id === 'search.hits.path-null') hits[0]!.path = ''
  if (fixture.id === 'search.hits.file')
    hits = [
      {
        ...hits[0]!,
        key: 'file',
        title: '知识管理研究报告.pdf',
        kind: 'file',
        path: '研究资料/报告',
      },
      {
        ...hits[1]!,
        key: 'web',
        title: 'Building a second brain',
        kind: 'web',
        path: '研究资料/阅读',
      },
    ]
  if (fixture.id === 'search.hits.six' || fixture.id === 'search.hits.count')
    hits.push({ ...hits[0]!, key: 'mimir-5', title: 'mimir 产品说明 · 命中 6' })
  if (fixture.id === 'search.hits.punctuation') {
    hits[0]!.title = '<知识> & "实践" — 原文'
    hits[0]!.snippet = '<script>alert("示例文本不执行")</script> C++ / a_b / 100% & 知识整理'
  }
  if (query.trim() && !['知识', 'Mimir', 'mimir', '新建'].includes(query.trim()))
    hits = hits.slice(0, 2)
  return hits
}
