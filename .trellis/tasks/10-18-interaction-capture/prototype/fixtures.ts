export type Surface = 'url' | 'upload' | 'library' | 'guard' | 'closed' | 'document'
export type Phase = 'idle' | 'busy' | 'success' | 'failed' | 'partial' | 'uncertain'
export type RowState = 'pending' | 'uploading' | 'done' | 'failed'
export interface FileRow {
  name: string
  path?: string
  format: string
  size: string
  state: RowState
  detail: string
  note?: boolean
}
export interface View {
  surface: Surface
  phase?: Phase
  url?: string
  folder?: string
  directory?: boolean
  failStage?: string
  error?: string
  rows?: FileRow[]
  stageResults?: ('done' | 'failed' | 'unknown')[]
  mode?: string
  message?: string
  entry?: string
}
export interface StateItem {
  id: string
  label: string
  view: string
  note: string
}
export const target = '产品研究 / 资料收集'
export const url = 'https://github.com/Tencent/WeKnora'
const textRow: FileRow = {
  name: '设计系统调研.pdf',
  format: 'PDF',
  size: '2.4 MB',
  state: 'done',
  detail: '已提取 8,426 字',
}
const rawRow: FileRow = {
  name: '交互演示.fig',
  format: 'FIG',
  size: '8.1 MB',
  state: 'done',
  detail: '原件已保存；可搜索状态见详情',
}
const failedRow: FileRow = {
  name: '项目会议纪要.docx',
  format: 'DOCX',
  size: '348 KB',
  state: 'failed',
  detail: '网络连接中断，未能收到上传结果。',
}
export const partialRows: FileRow[] = [textRow, rawRow, failedRow]
const longError =
  '无法解析文档：文件内容与扩展名不符，解析器未能读取内容。详细信息：UnexpectedContentType/'.repeat(
    3,
  )
export const views: Record<string, View> = {
  'entry.sidebar': { surface: 'closed', entry: '展开侧栏' },
  'entry.compact': { surface: 'closed', entry: '紧凑侧栏' },
  'entry.mobile': { surface: 'closed', entry: '窄屏导航' },
  'entry.palette': { surface: 'closed', entry: '命令面板' },
  'entry.menu-url': { surface: 'closed', entry: '知识库添加菜单', folder: target },
  'entry.menu-upload': { surface: 'closed', entry: '上传文件', folder: target },
  'entry.menu-directory': {
    surface: 'closed',
    entry: '上传文件夹',
    folder: target,
    directory: true,
  },
  'entry.empty': { surface: 'closed', entry: '知识库空状态', folder: target },
  'url.empty': { surface: 'url', url: '' },
  'url.valid': { surface: 'url', url: 'https://example.com/articles/design', folder: target },
  'url.wechat': {
    surface: 'url',
    url: 'https://mp.weixin.qq.com/s/illustrative-article',
    folder: target,
  },
  'url.github': { surface: 'url', url },
  'url.github-path': {
    surface: 'url',
    url: 'https://github.com/Tencent/WeKnora/tree/main/frontend',
  },
  'url.false-host': { surface: 'url', url: 'https://example.com/?from=github.com' },
  'url.invalid': { surface: 'url', url: 'example.com/article' },
  'url.protocol': { surface: 'url', url: 'https://' },
  'url.whitespace': { surface: 'url', url: '   ' },
  'url.long': {
    surface: 'url',
    url:
      'https://example.com/articles/research?title=' +
      encodeURIComponent('设计系统资料来源与可访问性规范') +
      '&context=' +
      'reference-'.repeat(19),
    folder: '产品研究 / 设计系统 / 视觉规范 / 2026 年秋季 / 参考与归档 / 网页资料',
  },
  'url.over-limit': { surface: 'url', url: 'https://example.com/?query=' + 'research'.repeat(260) },
  'url.ime': { surface: 'url', url, mode: 'ime' },
  'url.edit-error': {
    surface: 'url',
    url,
    error: '无法获取页面：连接超时',
    phase: 'failed',
    failStage: 'fetch',
    mode: 'edit-error',
  },
  'stage.wait': { surface: 'url', url, phase: 'busy' },
  'stage.fetch': {
    surface: 'url',
    url,
    phase: 'failed',
    failStage: 'fetch',
    error: '无法获取页面：服务器拒绝访问（403）',
  },
  'stage.extract': {
    surface: 'url',
    url: 'https://example.com/article',
    phase: 'failed',
    failStage: 'extract',
    error: '页面中未找到可提取的正文',
  },
  'stage.wechat': {
    surface: 'url',
    url: 'https://mp.weixin.qq.com/s/illustrative-article',
    phase: 'failed',
    failStage: 'fetch',
    error: '公众号页面限制访问，请在浏览器确认链接是否可用',
  },
  'stage.network': {
    surface: 'url',
    url,
    phase: 'uncertain',
    error: '网络连接中断，未能收到抓取结果。',
  },
  'stage.assets': {
    surface: 'url',
    url,
    phase: 'failed',
    failStage: 'assets',
    error: '处理图片失败（契约防御场景，非现有服务常规返回）',
  },
  'stage.convert': {
    surface: 'url',
    url,
    phase: 'failed',
    failStage: 'convert',
    error: '整理内容失败（契约防御场景，非现有服务常规返回）',
  },
  'stage.partial': {
    surface: 'url',
    url,
    phase: 'partial',
    stageResults: ['done', 'done', 'failed', 'done'],
    message: '契约防御：正文已有文档 ID，但图片阶段返回 failed。',
  },
  'stage.success': { surface: 'url', url, phase: 'success', folder: target },
  'stage.null-id': {
    surface: 'url',
    url,
    phase: 'success',
    mode: 'null-id',
    message: '契约防御：四阶段返回完成，但没有可打开的文档 ID。',
  },
  'stage.long-error': {
    surface: 'url',
    url,
    phase: 'failed',
    failStage: 'extract',
    error: longError,
  },
  'stage.duplicate': {
    surface: 'url',
    url,
    phase: 'success',
    mode: 'duplicate',
    message: '服务端可按规范链接返回已有文档 ID；响应不区分新建与重复，不承诺更新或移动。',
  },
  'upload.empty': { surface: 'upload', folder: target },
  'upload.chooser': { surface: 'upload', mode: 'chooser', folder: target },
  'upload.wait': {
    surface: 'upload',
    phase: 'busy',
    folder: target,
    rows: [
      textRow,
      { ...rawRow, state: 'uploading', detail: '上传中…' },
      { ...failedRow, state: 'pending', detail: '等待上传' },
    ],
  },
  'upload.pending': {
    surface: 'upload',
    phase: 'busy',
    rows: [
      { ...textRow, state: 'uploading', detail: '上传中…' },
      { ...rawRow, state: 'pending', detail: '等待上传' },
      { ...failedRow, state: 'pending', detail: '等待上传' },
    ],
  },
  'upload.partial': { surface: 'upload', phase: 'partial', folder: target, rows: partialRows },
  'upload.success': {
    surface: 'upload',
    phase: 'success',
    folder: target,
    rows: [textRow, { ...failedRow, state: 'done', detail: '已提取 1,352 字' }],
  },
  'upload.all-failed': {
    surface: 'upload',
    phase: 'failed',
    rows: [failedRow, { ...textRow, state: 'failed', detail: '文件是空的', size: '0 B' }],
  },
  'upload.raw': { surface: 'upload', phase: 'success', rows: [rawRow] },
  'upload.markdown': {
    surface: 'upload',
    phase: 'success',
    rows: [
      {
        name: '项目笔记.md',
        format: 'MD',
        size: '14 KB',
        state: 'done',
        detail: '已提取 2,140 字',
        note: true,
      },
    ],
  },
  'upload.empty-markdown': {
    surface: 'upload',
    phase: 'success',
    rows: [
      {
        name: '仅含属性的笔记.md',
        format: 'MD',
        size: '108 B',
        state: 'done',
        detail: '原件已保存；可搜索状态见详情',
        note: true,
      },
    ],
  },
  'upload.too-large': {
    surface: 'upload',
    phase: 'failed',
    rows: [{ ...textRow, state: 'failed', size: '58 MB', detail: '文件太大（58 MB），上限 50 MB' }],
  },
  'upload.boundary': {
    surface: 'upload',
    phase: 'busy',
    rows: [{ ...textRow, state: 'uploading', size: '50 MB', detail: '上传中…' }],
    message: '大小等于 52,428,800 字节允许发送；并非配额选择器。',
  },
  'upload.zero': {
    surface: 'upload',
    phase: 'failed',
    rows: [{ ...textRow, size: '0 B', state: 'failed', detail: '文件是空的' }],
  },
  'upload.network': { surface: 'upload', phase: 'uncertain', rows: [failedRow] },
  'upload.long': {
    surface: 'upload',
    phase: 'partial',
    folder: '产品研究 / 2026 / 设计系统 / 信息架构 / 海外资料与研究归档',
    rows: [
      {
        ...textRow,
        name: '关于知识库交互设计与响应式布局在复杂工作空间中的应用及比较研究最终版本修订稿.pdf',
        path: '资料集/设计研究/用户访谈/第一阶段',
      },
      { ...rawRow, name: '长后缀文件.' + 'extension'.repeat(9) },
      { ...failedRow, detail: longError },
    ],
  },
  'upload.names': {
    surface: 'upload',
    phase: 'success',
    rows: [
      { ...textRow, name: '会议纪要.docx', format: 'DOCX' },
      { ...textRow, name: '会议纪要.docx', format: 'DOCX' },
      { ...rawRow, name: '.env', format: '文件' },
      { ...rawRow, name: 'README', format: '文件' },
    ],
  },
  'upload.many': {
    surface: 'upload',
    phase: 'success',
    rows: Array.from({ length: 24 }, (_, i) => ({
      ...textRow,
      name: `资料_${String(i + 1).padStart(2, '0')}.pdf`,
    })),
  },
  'directory.empty': { surface: 'upload', directory: true, folder: target },
  'directory.busy': {
    surface: 'upload',
    directory: true,
    phase: 'busy',
    folder: target,
    rows: [
      { ...textRow, path: '论文集/2024', state: 'uploading', detail: '上传中…' },
      { ...rawRow, path: '论文集/附件', state: 'pending', detail: '等待上传' },
    ],
  },
  'directory.success': {
    surface: 'upload',
    directory: true,
    phase: 'success',
    folder: target,
    rows: [
      { ...textRow, path: '论文集/2024' },
      { ...rawRow, path: '论文集/附件' },
    ],
  },
  'directory.no-files': {
    surface: 'upload',
    directory: true,
    folder: target,
    message: '空文件夹没有文件可导入，保留当前空态；不会创建空目录。',
  },
  'drop.idle': { surface: 'library', folder: target, mode: 'idle' },
  'drop.hover': { surface: 'library', folder: target, mode: 'hover' },
  'drop.busy': {
    surface: 'library',
    folder: target,
    mode: 'busy',
    phase: 'busy',
    rows: [
      textRow,
      { ...rawRow, state: 'uploading', detail: '上传中…' },
      { ...failedRow, state: 'pending', detail: '等待上传' },
    ],
  },
  'drop.partial': {
    surface: 'library',
    folder: target,
    mode: 'partial',
    phase: 'partial',
    rows: partialRows,
  },
  'drop.failed': {
    surface: 'library',
    folder: target,
    mode: 'failed',
    phase: 'failed',
    rows: [failedRow],
  },
  'drop.success': {
    surface: 'library',
    folder: target,
    mode: 'success',
    phase: 'success',
    rows: [textRow, rawRow],
  },
  'drop.non-files': {
    surface: 'library',
    folder: target,
    mode: 'non-files',
    message: '文本拖入不触发导入。HTML不会执行浏览器默认跳转。',
  },
  'drop.disabled': {
    surface: 'library',
    mode: 'disabled',
    message: '标签及全部文档视图没有整页拖放入口。',
  },
  'drop.empty': {
    surface: 'library',
    folder: target,
    mode: 'empty',
    message: '空 FileList 不发送请求，也不创建空批次。',
  },
  'guard.manual': { surface: 'guard', mode: 'manual', rows: partialRows, folder: target },
  'guard.auto': { surface: 'guard', mode: 'auto', rows: partialRows, folder: target },
  'guard.office': { surface: 'guard', mode: 'office', rows: partialRows, folder: target },
  'guard.saving': { surface: 'guard', mode: 'saving', rows: partialRows, folder: target },
  'guard.failed': { surface: 'guard', mode: 'failed', rows: partialRows, folder: target },
  'lifecycle.closed': { surface: 'closed', entry: '收集' },
  'lifecycle.reopen': { surface: 'closed', entry: '重新打开', folder: target },
  'lifecycle.busy-tab': {
    surface: 'upload',
    phase: 'busy',
    rows: [{ ...textRow, state: 'uploading', detail: '上传中…' }],
    mode: 'busy-tab',
  },
  'lifecycle.handoff': {
    surface: 'document',
    message: '收集成功后沿原宿主打开文档；HTML仅展示交接目标，不加载真实文档。',
  },
  'layout.narrow': { surface: 'upload', phase: 'partial', folder: target, rows: partialRows },
  'layout.low': { surface: 'upload', phase: 'partial', folder: target, rows: partialRows },
  'layout.dark': {
    surface: 'url',
    url,
    phase: 'failed',
    failStage: 'extract',
    error: '页面中未找到可提取的正文',
  },
  'layout.zoom': { surface: 'upload', phase: 'partial', folder: target, rows: partialRows },
}
export function source(value: string, strict = false) {
  const input = value.trim()
  if (!/^https?:\/\//i.test(input)) return null
  if (strict) {
    try {
      const parsed = new URL(input)
      if (!parsed.hostname || input.length > 2000) return null
    } catch {
      return null
    }
  }
  if (/mp\.weixin\.qq\.com/i.test(input))
    return { label: '微信公众号', note: '图片保留原链接，正文可离线阅读' }
  if (/github\.com/i.test(input)) return { label: 'GitHub 仓库', note: '收集仓库信息和 README' }
  return { label: '网页', note: '提取网页正文' }
}
export const groups = [
  {
    id: 'entry',
    label: '入口与落点',
    keys: [
      'entry.sidebar',
      'entry.compact',
      'entry.mobile',
      'entry.palette',
      'entry.menu-url',
      'entry.menu-upload',
      'entry.menu-directory',
      'entry.empty',
    ],
  },
  {
    id: 'url',
    label: '链接输入与来源',
    keys: [
      'url.empty',
      'url.valid',
      'url.wechat',
      'url.github',
      'url.github-path',
      'url.false-host',
      'url.invalid',
      'url.protocol',
      'url.whitespace',
      'url.long',
      'url.over-limit',
      'url.ime',
      'url.edit-error',
    ],
  },
  {
    id: 'stage',
    label: '抓取等待与结果',
    keys: [
      'stage.wait',
      'stage.fetch',
      'stage.extract',
      'stage.wechat',
      'stage.network',
      'stage.assets',
      'stage.convert',
      'stage.partial',
      'stage.success',
      'stage.null-id',
      'stage.long-error',
      'stage.duplicate',
    ],
  },
  {
    id: 'upload',
    label: '文件与批次',
    keys: [
      'upload.empty',
      'upload.chooser',
      'upload.wait',
      'upload.pending',
      'upload.partial',
      'upload.success',
      'upload.all-failed',
      'upload.raw',
      'upload.markdown',
      'upload.empty-markdown',
      'upload.too-large',
      'upload.boundary',
      'upload.zero',
      'upload.network',
      'upload.long',
      'upload.names',
      'upload.many',
    ],
  },
  {
    id: 'directory',
    label: '文件夹导入',
    keys: ['directory.empty', 'directory.busy', 'directory.success', 'directory.no-files'],
  },
  {
    id: 'drop',
    label: '知识库整页拖放',
    keys: [
      'drop.idle',
      'drop.hover',
      'drop.busy',
      'drop.partial',
      'drop.failed',
      'drop.success',
      'drop.non-files',
      'drop.disabled',
      'drop.empty',
    ],
  },
  {
    id: 'guard',
    label: '交接与未保存保护',
    keys: ['guard.manual', 'guard.auto', 'guard.office', 'guard.saving', 'guard.failed'],
  },
  {
    id: 'lifecycle',
    label: '关闭与恢复',
    keys: ['lifecycle.closed', 'lifecycle.reopen', 'lifecycle.busy-tab', 'lifecycle.handoff'],
  },
  {
    id: 'layout',
    label: '外观与极端布局',
    keys: ['layout.narrow', 'layout.low', 'layout.dark', 'layout.zoom'],
  },
]
export const labels: Record<string, string> = {
  'entry.sidebar': '展开侧栏 · 根目录',
  'entry.compact': '紧凑侧栏 · 根目录',
  'entry.mobile': '窄屏导航收起后打开',
  'entry.palette': '命令面板交接',
  'entry.menu-url': '目录菜单 · 网页抓取',
  'entry.menu-upload': '目录菜单 · 文件',
  'entry.menu-directory': '目录菜单 · 文件夹',
  'entry.empty': '知识库空状态',
  'url.empty': '空链接与禁用',
  'url.valid': '网页 · 本地识别',
  'url.wechat': '公众号来源说明',
  'url.github': 'GitHub 仓库',
  'url.github-path': 'GitHub 子路径',
  'url.false-host': '共享来源子串识别边界',
  'url.invalid': '缺少协议',
  'url.protocol': '不完整 URL',
  'url.whitespace': '纯空白',
  'url.long': '长链接与长路径',
  'url.over-limit': '超过 2000 字符',
  'url.ime': '输入法 Enter 保护',
  'url.edit-error': '失败后编辑与重提',
  'stage.wait': '单次请求等待',
  'stage.fetch': '获取页面失败',
  'stage.extract': '提取正文失败',
  'stage.wechat': '公众号限制',
  'stage.network': '响应丢失 · 结果不确定',
  'stage.assets': '图片失败 · 契约防御',
  'stage.convert': '整理失败 · 契约防御',
  'stage.partial': '部分阶段失败 · 契约防御',
  'stage.success': '完成 · 自动交接前',
  'stage.null-id': '完成但无 ID · 防御',
  'stage.long-error': '完整长错误',
  'stage.duplicate': '规范链接重复 · 无标志',
  'upload.empty': '选择与拖入空态',
  'upload.chooser': '模拟选择与取消',
  'upload.wait': '已完成 / 上传中 / 等待',
  'upload.pending': '首项等待返回',
  'upload.partial': '部分失败',
  'upload.success': '全成功与打开首个',
  'upload.all-failed': '全失败与继续上传',
  'upload.raw': '原件保存也算成功',
  'upload.markdown': 'Markdown 导入笔记',
  'upload.empty-markdown': '空正文 Markdown',
  'upload.too-large': '超出 50 MB',
  'upload.boundary': '等于 50 MiB',
  'upload.zero': '零字节服务端拒绝',
  'upload.network': '上传响应不确定',
  'upload.long': '长名称 / 后缀 / 错误',
  'upload.names': '重名 / 隐藏 / 无后缀',
  'upload.many': '24 项内部滚动',
  'directory.empty': '选择文件夹',
  'directory.busy': '相对路径与顺序',
  'directory.success': '保留所选根与子路径',
  'directory.no-files': '空文件夹不创建',
  'drop.idle': '当前目录待拖入',
  'drop.hover': 'Files 拖入高亮',
  'drop.busy': '整页导入等待',
  'drop.partial': '部分失败逐项反馈',
  'drop.failed': '全部失败',
  'drop.success': '完成与刷新',
  'drop.non-files': '非 Files 类型',
  'drop.disabled': '非目录范围不可拖放',
  'drop.empty': '空 FileList',
  'guard.manual': '手动保存 · 三个选择',
  'guard.auto': '自动保存 · 安全交接',
  'guard.office': 'Office 无法代存',
  'guard.saving': '保存中禁止重复',
  'guard.failed': '保存失败保留结果',
  'lifecycle.closed': '取消 / Esc / 遮罩回焦',
  'lifecycle.reopen': '重新打开重置草稿',
  'lifecycle.busy-tab': '忙碌切页签与丢队列',
  'lifecycle.handoff': '成功交接目标',
  'layout.narrow': '390px 窄屏',
  'layout.low': '低高度滚动',
  'layout.dark': '深色错误反馈',
  'layout.zoom': '200% 文字布局',
}
