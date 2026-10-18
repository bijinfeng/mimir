import catalog from './scenes.json'

export type Scene = (typeof catalog.scenes)[number]
export type Doc = {
  id: string
  title: string
  ext?: string
  kind: string
  detail: string
  location: string
  status: string
  date: string
}
export const docs: Doc[] = [
  {
    id: 'note',
    title: '产品设计原则',
    kind: '笔记',
    detail: '把知识留在手边，让每一次思考都能继续。',
    location: '当前目录',
    status: '就绪',
    date: '2026/10/18 12:36',
  },
  {
    id: 'docx',
    title: '知识工作台交互规范及文件管理全流程验收说明（修订版）',
    ext: '.docx',
    kind: 'Word',
    detail: '2.4 MB',
    location: '参考资料',
    status: '就绪',
    date: '2026/10/18 11:20',
  },
  {
    id: 'xlsx',
    title: '组件状态与设计验收清单',
    ext: '.xlsx',
    kind: 'Excel',
    detail: '842 KB',
    location: '参考资料/设计规范',
    status: '就绪',
    date: '2026/10/17 16:08',
  },
  {
    id: 'pptx',
    title: '秋季产品分享',
    ext: '.pptx',
    kind: 'PowerPoint',
    detail: '12.8 MB',
    location: '当前目录',
    status: '就绪',
    date: '2026/10/17 15:42',
  },
  {
    id: 'pdf',
    title: '以内容为中心的知识管理研究',
    ext: '.pdf',
    kind: 'PDF',
    detail: '4.6 MB',
    location: '参考资料',
    status: '提取失败',
    date: '2026/10/16 09:30',
  },
  {
    id: 'web',
    title: '把零散的想法连接起来',
    kind: '网页',
    detail: '从记录到整理，再到重新发现。',
    location: '灵感收集',
    status: '就绪',
    date: '2026/10/15 14:08',
  },
  {
    id: 'wechat',
    title: '让阅读成为日常',
    kind: '公众号',
    detail: '阅读时留下问题，也留下自己的理解。',
    location: '灵感收集',
    status: '就绪',
    date: '2026/10/14 10:16',
  },
  {
    id: 'github',
    title: 'WeKnora',
    kind: 'GitHub',
    detail: '知识管理开源项目参考。',
    location: '参考资料',
    status: '就绪',
    date: '2026/10/13 08:05',
  },
]
export const extraKinds = ['HTML', '文本', '图片', '音频', '视频', '压缩包', '代码', '未知文件']
export const longTitle = '关于下一阶段知识工作台的交互细节、内容组织与文件管理设计说明'
export const longDescription =
  '这里沉淀团队的设计原则、研究笔记和产品规范。把零散的信息整理成可以继续思考的知识，让内容之间的联系清晰可见。'.repeat(
    8,
  )
export const labels: Record<string, string> = {
  idle: '默认',
  create: '创建',
  edit: '编辑',
  cancel: '取消恢复',
  success: '请求成功',
  pending: '请求中',
  retry: '重试',
  failure: '失败恢复',
  keyboard: '键盘',
  hover: '悬停',
  focus: '焦点',
  unchanged: '未改直接关闭',
  'request-error': '请求失败',
  'empty-disabled': '空名称',
  trim: '去除首尾空白',
  slash: '含斜杠',
  '60-limit': '60字上限',
  enter: '回车提交',
  'retry-error': '失败并重试',
  'focus-return': '关闭回焦',
  list: '列表',
  card: '卡片',
  '390-light': '390px浅色',
  '390-dark': '390px深色',
  'low-height': '低高度',
  'long-name': '长名称',
  'long-path': '长路径',
  'long-description': '长描述',
  'empty-tag': '空标签',
  'invalid-inline': '字段错误',
  'pending-guard': '等待防重',
  'retry-draft': '失败保留草稿',
  ime: '输入法回车',
  '100-loaded': '100条上限',
  'native-cancel': '原生取消边界',
  'clipboard-error': '剪贴板失败',
  'missing-code': '缺少ID',
  'scope-changing': '切换目录中',
  'cached-refresh-error': '缓存刷新失败',
  'portal-no-open': '菜单无导航冒泡',
  'decision-required': '本轮范围决定',
  'note-only-rename': '仅笔记重命名',
  'move-handoff': '移动交接',
  'folder-assignment-cleared': '清空目录归属',
  'web-softdelete': '资料记录移除',
  'file-original-delete': '文件原件删除',
}
export function stateLabel(value: string) {
  return labels[value] ?? value.replaceAll('-', ' · ')
}
export function group(scene: Scene) {
  return scene.itemId.startsWith('LIB-P')
    ? '拟修复与边界'
    : Number(scene.itemId.slice(4)) <= 12
      ? '首页与工具条'
      : Number(scene.itemId.slice(4)) <= 20
        ? '加载与定位'
        : Number(scene.itemId.slice(4)) <= 33
          ? '列表与卡片'
          : Number(scene.itemId.slice(4)) <= 40
            ? '文件与删除'
            : '交接与适配'
}
export const allScenes = catalog.scenes

/** Mutable mock records start here; all visible results derive from these IDs. */
export function makeDocuments(scene: Scene): Doc[] {
  const state = scene.state
  const item = scene.itemId
  if (
    item === 'LIB-018' ||
    item === 'LIB-020' ||
    (item === 'LIB-019' && state === 'empty') ||
    (item === 'LIB-002' && state === 'created') ||
    (item === 'LIB-043' && state === 'delete-empty')
  )
    return []
  let records = docs.map((doc) => Object.assign({}, doc))
  if (item === 'LIB-029')
    records.push(
      ...extraKinds.map((kind, index) =>
        Object.assign({}, docs[0], {
          id: 'extra-' + index,
          title: kind + '资料示例',
          ext: ['.html', '.txt', '.png', '.mp3', '.mp4', '.zip', '.ts', '.bin'][index],
          kind,
          detail: '128 KB',
        }),
      ),
    )
  if (item === 'LIB-030')
    records = records.slice(1, 4).map((doc, index) =>
      Object.assign({}, doc, {
        title: ['long-stem', 'extension-preserved'].includes(state)
          ? longTitle.repeat(2)
          : index === 1
            ? doc.title + '.XLSX'
            : doc.title,
      }),
    )
  if (item === 'LIB-033' && state === 'null-date')
    records = records.map((doc) => Object.assign({}, doc, { date: '' }))
  if (item === 'LIB-031' && ['empty-body', 'unknown-size'].includes(state))
    records = records
      .slice(0, 3)
      .map((doc) => Object.assign({}, doc, { detail: doc.ext ? '' : '还没有内容' }))
  if (['ready', 'all-ready-list'].includes(state))
    records = records.map((doc) => Object.assign({}, doc, { status: '就绪' }))
  if (state === 'long-excerpt')
    records = records.map((doc) => Object.assign({}, doc, { detail: longDescription }))
  if (item === 'LIB-044' && state === 'read-refresh-error')
    records = records.map((doc) =>
      doc.id === 'note' ? Object.assign({}, doc, { title: '产品设计原则（修订）' }) : doc,
    )
  if (item === 'LIB-045' && state === 'read-refresh-error')
    records = records.map((doc) =>
      doc.id === 'note' ? Object.assign({}, doc, { location: '参考资料' }) : doc,
    )
  if (
    ['100-cap', '100-limit', '100-loaded'].includes(state) ||
    item === 'LIB-050' ||
    (item === 'LIB-047' && ['long-list', 'scrolled'].includes(state))
  )
    records = Array.from({ length: 100 }, (_, index) =>
      Object.assign({}, records[index % records.length], {
        id: records[index % records.length]!.id + '-' + index,
        title: records[index % records.length]!.title + ' · ' + String(index + 1).padStart(3, '0'),
        date:
          '2026/10/18 ' +
          String(23 - Math.floor(index / 60)).padStart(2, '0') +
          ':' +
          String(59 - (index % 60)).padStart(2, '0'),
      }),
    )
  if (item === 'LIB-023' && state === 'success')
    records = records.map((doc) =>
      Object.assign({}, doc, {
        location: doc.location.startsWith('参考资料')
          ? '设计资料' + doc.location.slice('参考资料'.length)
          : doc.location,
      }),
    )
  if (
    (item === 'LIB-037' || item === 'LIB-P05') &&
    ['success', 'success-parse-empty', 'success-parse-error'].includes(state)
  )
    records = records.map((doc) =>
      doc.id === 'pdf'
        ? Object.assign({}, doc, {
            status: state === 'success-parse-error' ? '提取失败' : '就绪',
            detail:
              state === 'success-parse-empty'
                ? '5.2 MB · 无可搜索正文'
                : state === 'success-parse-error'
                  ? '5.2 MB · 正文提取失败'
                  : '5.2 MB',
            date: '2026/10/18 23:59',
          })
        : doc,
    )
  if (item === 'LIB-009' && state === 'success')
    records.unshift({
      id: 'created-note',
      title: '未命名笔记',
      kind: '笔记',
      detail: '还没有内容',
      location: '当前目录',
      status: '就绪',
      date: '2026/10/18 23:59',
    })
  if (item === 'LIB-046' && ['success-undo', 'undo-error'].includes(state))
    records = records.map((doc) =>
      doc.id === 'note' ? Object.assign({}, doc, { location: '灵感收集' }) : doc,
    )
  return records
}
