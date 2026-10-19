import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import { XlsxEditor } from '@gallery-repo/packages/office/src/editors/XlsxEditor'
import { MimirProvider } from '@gallery-repo/packages/renderer/src/theme/MimirProvider'
import { setThemeMode } from '@gallery-repo/packages/renderer/src/theme/appearance'
import { useEditorThemeVars } from '@gallery-repo/packages/renderer/src/theme/editor-theme-bridge'
import { XlsxValidationConfirmationError } from '@mimir/shared'
import searchUrl from './fixtures/search.xlsx?url'
import richUrl from './fixtures/rich.xlsx?url'
import pivotUrl from './fixtures/pivot.xlsx?url'
import crossUrl from './fixtures/cross-sheet.xlsx?url'
import validationUrl from './fixtures/validation.xlsx?url'
import fillUrl from './fixtures/fill.xlsx?url'
import objectsUrl from './fixtures/objects.xlsx?url'
import './style.css'

const query = new URLSearchParams(location.search)
const scene = query.get('scene') ?? 'rich'
const theme = query.get('theme') === 'dark' ? 'dark' : 'light'
const width = Math.max(280, Number(query.get('width') ?? 1100))
const height = Math.max(220, Number(query.get('height') ?? 760))
const initialIoMode = query.get('io') ?? 'controlled'
const scenes = {
  search: '240条真实检索与公式错误',
  rich: '原生丰富工作簿',
  pivot: '透视来源数据',
  'cross-sheet': '多表、隐藏与保护',
  validation: '真实验证规则与提示',
  fill: '条件格式与继承填充',
  objects: '原生形状对象',
  'load-pending': '原件读取等待',
  'load-error': '原件读取失败',
  save: '保存等待与重开',
  'save-error': '保存失败与恢复',
  data: '数据工具',
  chart: '图表与对象',
  layout: '布局范围',
  view: '视图与导航',
}
const fixtureUrl =
  {
    search: searchUrl,
    pivot: pivotUrl,
    'cross-sheet': crossUrl,
    validation: validationUrl,
    fill: fillUrl,
    objects: objectsUrl,
    data: pivotUrl,
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
        throw new Error('隔离模拟：XLSX 原件读取失败，请重试。')
      const bytes =
        savedRef.current ?? new Uint8Array(await (await fetch(fixtureUrl)).arrayBuffer())
      if (scene === 'load-pending') await deferred('读取 XLSX 原件', undefined)
      addLog(`本地固定 XLSX 原件已读取：${bytes.length} 字节`)
      return new Uint8Array(bytes)
    },
    save: async (bytes) => {
      await deferred('保存 XLSX 原件', undefined)
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
          XLSX 真实组件 · {__GALLERY_VARIANT__ === 'before' ? '基线 dcb9a40' : '当前实现'}
        </strong>
        <span>
          真实原生 XLSX 与编辑器；保存为页面内存模拟，工具由隔离本地 Node 执行，无产品后台请求。
        </span>
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
              addLog('从最近模拟保存的真实 XLSX 字节重开；将丢弃之后的未保存变更')
            }}
          >
            重开最近模拟保存原件
          </button>
          <button
            disabled={!ready}
            onClick={() => {
              const context = handleRef.current?.getContext()
              addLog(
                `公开 Agent 上下文：版本 ${handleRef.current?.getVersion()}，${Object.keys(context ?? {}).length} 个上下文字段；不记录正文`,
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
          分类和 Inspector 请点击真实 Ribbon；场景 URL 仅选原生固定工作簿或 IO
          条件，不自动打开面板。
          基础单元格编辑和保存为真实字节。范围/对象/透视提交由127.0.0.1隔离Node
          helper执行产品原生逻辑，不连接数据库。静态归档默认不连接helper；远程图片、上传图片、外部计算明确拒绝。
        </p>
      </header>
      <div className={`fixture-frame ${bridge.vars}`}>
        <XlsxEditor
          documentId={`gallery-xlsx-${epoch}`}
          io={io}
          hostApply={async (request) => {
            if (!import.meta.env.DEV && query.get('helper') !== '1')
              throw new Error(
                '静态归档未连接本地 Node helper；此操作需要在运行 helper 的 Demo 中执行。',
              )
            if (request.imageFile)
              throw new Error('隔离 Demo 不接收图片上传；请在产品宿主验收此路径。')
            const encoded = btoa(
              Array.from(request.bytes, (value) => String.fromCharCode(value)).join(''),
            )
            addLog(
              `真实本地 Node 宿主：${request.ops.map((op) => op.op).join('、') || request.action}`,
            )
            const response = await fetch(`http://127.0.0.1:5206/${__GALLERY_VARIANT__}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                documentId: request.documentId,
                bytes: encoded,
                expectedVersion: request.expectedVersion,
                ops: request.ops,
                validationConsent: request.validationConsent,
                action: request.action,
              }),
              signal: request.signal,
            })
            const result = await response.json()
            if (!response.ok) {
              if (result.warning) throw new XlsxValidationConfirmationError(result.warning)
              throw new Error(result.error || '本地 Node helper 执行失败；未修改原件。')
            }
            return {
              ...result,
              bytes: Uint8Array.from(atob(result.bytes), (value) => value.charCodeAt(0)),
            }
          }}
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
