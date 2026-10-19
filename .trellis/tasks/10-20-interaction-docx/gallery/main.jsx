import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import { DocxEditor } from '@gallery-repo/packages/office/src/editors/DocxEditor'
import { MimirProvider } from '@gallery-repo/packages/renderer/src/theme/MimirProvider'
import { setThemeMode } from '@gallery-repo/packages/renderer/src/theme/appearance'
import { useEditorThemeVars } from '@gallery-repo/packages/renderer/src/theme/editor-theme-bridge'
import richUrl from './fixtures/rich.docx?url'
import headingsUrl from './fixtures/headings.docx?url'
import reportUrl from './fixtures/report.docx?url'
import columnsUrl from './fixtures/columns.docx?url'
import footnotesUrl from './fixtures/footnotes.docx?url'
import standardUrl from './fixtures/office-standard-password.docx?url'
import agileUrl from './fixtures/office-agile-password.docx?url'
import './style.css'

const query = new URLSearchParams(location.search)
const scene = query.get('scene') ?? 'rich'
const theme = query.get('theme') === 'dark' ? 'dark' : 'light'
const width = Math.max(280, Number(query.get('width') ?? 1100))
const height = Math.max(220, Number(query.get('height') ?? 760))
const initialIoMode = query.get('io') ?? 'controlled'
const scenes = {
  rich: '原生丰富文档',
  headings: '标题与导航',
  report: '中文报告',
  columns: '双栏与版面',
  footnotes: '脚注与尾注',
  'load-pending': '原件读取等待',
  'load-error': '原件读取失败',
  save: '保存等待与重开',
  'save-error': '保存失败与恢复',
  standard: '真实 Standard 加密原件',
  agile: '真实 Agile 加密原件',
  find: '查找替换',
  chart: '图表 Inspector',
  textbox: '文本框 Inspector',
  page: '页面与节',
  watermark: '水印',
  notes: '脚注尾注管理',
  styles: '样式管理',
  review: '审阅与保护',
  view: '视图与导航',
  image: '图片与形状',
  table: '表格',
}
const fixtureUrl =
  {
    headings: headingsUrl,
    report: reportUrl,
    columns: columnsUrl,
    footnotes: footnotesUrl,
    standard: standardUrl,
    agile: agileUrl,
  }[scene] ?? richUrl
setThemeMode(theme)
document.documentElement.style.setProperty('--fixture-width', `${width}px`)
document.documentElement.style.setProperty('--fixture-height', `${height}px`)
document.body.dataset.capture = String(query.get('capture') === '1')

function Fixture() {
  const { styles: bridge } = useEditorThemeVars()
  const modeRef = useRef(initialIoMode)
  const pendingRef = useRef([])
  const handleRef = useRef(null)
  const savedRef = useRef(null)
  const loadCountRef = useRef(0)
  const [pending, setPending] = useState([])
  const [log, setLog] = useState([])
  const [ready, setReady] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [epoch, setEpoch] = useState(0)
  const [hasSaved, setHasSaved] = useState(false)
  const addLog = (message) => setLog((items) => [...items.slice(-15), message])
  const syncPending = () => setPending(pendingRef.current.map((entry) => entry.label))
  const deferred = (label, value) => {
    addLog(`模拟宿主 IO：${label}`)
    if (modeRef.current === 'error')
      return Promise.reject(new Error(`隔离模拟：${label}暂时失败，请重试。`))
    if (modeRef.current === 'success') return Promise.resolve(value)
    return new Promise((resolve, reject) => {
      pendingRef.current.push({ label, value, resolve, reject })
      syncPending()
    })
  }
  const settle = (fail) => {
    const entries = pendingRef.current.splice(0)
    syncPending()
    entries.forEach((entry) =>
      fail
        ? entry.reject(new Error(`隔离模拟：${entry.label}失败；当前内容保留。`))
        : entry.resolve(entry.value),
    )
    addLog(`手动${fail ? '失败' : '完成'} ${entries.length} 项；没有写入文件或后端`)
  }
  const io = {
    load: async () => {
      loadCountRef.current += 1
      if (scene === 'load-error' && loadCountRef.current === 1)
        throw new Error('隔离模拟：DOCX 原件读取失败，请重试。')
      const bytes =
        savedRef.current ?? new Uint8Array(await (await fetch(fixtureUrl)).arrayBuffer())
      if (scene === 'load-pending') await deferred('读取 DOCX 原件', undefined)
      addLog(`本地固定 DOCX 原件已读取：${bytes.length} 字节`)
      return new Uint8Array(bytes)
    },
    save: async (bytes) => {
      await deferred('保存 DOCX 原件', undefined)
      savedRef.current = new Uint8Array(bytes)
      setHasSaved(true)
      addLog(`模拟保存 ACK：${bytes.length} 字节；仅当前页面内存，可重开验证`)
    },
  }
  useEffect(() => {
    const toggle = (event) => {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'h') {
        event.preventDefault()
        document.body.dataset.capture = String(document.body.dataset.capture !== 'true')
      }
    }
    document.addEventListener('keydown', toggle)
    return () => document.removeEventListener('keydown', toggle)
  }, [])
  const urlFor = (key, nextTheme = theme) => {
    const params = new URLSearchParams(query)
    params.set('scene', key)
    params.set('theme', nextTheme)
    return `?${params}`
  }
  return (
    <>
      <header className="fixture-tools">
        <strong>
          DOCX 真实组件 · {__GALLERY_VARIANT__ === 'before' ? '基线 6f6af4c' : '当前实现'}
        </strong>
        <span>真实原生 DOCX 与编辑器；宿主读写库模拟，零后端请求。</span>
        <nav aria-label="原件与交互场景">
          {Object.entries(scenes).map(([key, label]) => (
            <a key={key} href={urlFor(key)} aria-current={key === scene ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <div className="fixture-actions">
          <a href={urlFor(scene, theme === 'dark' ? 'light' : 'dark')}>切换主题</a>
          <label>
            模拟 IO{' '}
            <select
              defaultValue={initialIoMode}
              onChange={(event) => {
                modeRef.current = event.target.value
                addLog(`模拟 IO：${event.target.value}`)
              }}
            >
              <option value="controlled">手动完成</option>
              <option value="success">立即成功</option>
              <option value="error">立即失败</option>
            </select>
          </label>
          <button
            onClick={() => {
              document.body.dataset.capture = 'true'
            }}
          >
            隐藏辅助区（Alt+Shift+H 恢复）
          </button>
          <button disabled={!pending.length} onClick={() => settle(false)}>
            完成模拟请求
          </button>
          <button disabled={!pending.length} onClick={() => settle(true)}>
            失败模拟请求
          </button>
          <button
            disabled={!hasSaved || pending.length > 0}
            onClick={() => {
              setEpoch((value) => value + 1)
              addLog('从最近模拟保存的真实 DOCX 字节重开；将丢弃之后的未保存变更')
            }}
          >
            重开最近模拟保存原件
          </button>
          <button
            disabled={!ready}
            onClick={() => {
              const context = handleRef.current?.getContext()
              addLog(
                `公开 Agent 上下文：版本 ${handleRef.current?.getVersion()}，${context?.blocks.length ?? 0} 块；不记录正文`,
              )
            }}
          >
            读取真实 Agent 上下文
          </button>
        </div>
        <p role="status">
          当前：{scenes[scene] ?? scene} · Agent {ready ? '就绪' : '初始化'} ·{' '}
          {dirty ? '有未保存变更' : '没有未保存变更'} · 等待：{pending.join('、') || '无'}
        </p>
        <p>
          分类和 Inspector 请点击真实 Ribbon；场景 URL 仅选原生固定文档或 IO
          条件，不自动打开面板。图表/文本框从插入分类进入，页面/水印/脚注尾注/样式按真实分类操作。加密原件密码见
          fixture 来源说明。
        </p>
      </header>
      <div className={`fixture-frame ${bridge.vars}`}>
        <DocxEditor
          documentId={`gallery-docx-${epoch}`}
          io={io}
          flush
          appearance={theme}
          onDirtyChange={setDirty}
          onAgentHandleChange={(handle) => {
            handleRef.current = handle
            setReady(Boolean(handle))
          }}
        />
      </div>
      <pre className="fixture-log" aria-label="模拟 IO 日志">
        {log.join('\n')}
      </pre>
    </>
  )
}
createRoot(document.getElementById('root')).render(
  <MimirProvider>
    <Fixture />
  </MimirProvider>,
)
