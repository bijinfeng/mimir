import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import { PptxEditor } from '@gallery-repo/packages/office/src/editors/PptxEditor'
import { MimirProvider } from '@gallery-repo/packages/renderer/src/theme/MimirProvider'
import { setThemeMode } from '@gallery-repo/packages/renderer/src/theme/appearance'
import { useEditorThemeVars } from '@gallery-repo/packages/renderer/src/theme/editor-theme-bridge'
import titleUrl from './fixtures/title-layout.pptx?url'
import textUrl from './fixtures/formatted-text.pptx?url'
import imageUrl from './fixtures/image-deck.pptx?url'
import emptyUrl from './fixtures/empty-deck.pptx?url'
import richUrl from './fixtures/rich.pptx?url'
import tableUrl from './fixtures/table.pptx?url'
import chartUrl from './fixtures/chart.pptx?url'
import groupsUrl from './fixtures/groups.pptx?url'
import './style.css'

const query = new URLSearchParams(location.search)
const scene = query.get('scene') ?? 'rich'
const theme = query.get('theme') === 'dark' ? 'dark' : 'light'
const width = Math.max(280, Number(query.get('width') ?? 1100))
const height = Math.max(220, Number(query.get('height') ?? 760))
const initialIoMode = query.get('io') ?? 'controlled'
const scenes = {
 rich: '丰富演示文稿', title: '标题与版式', text: '丰富文本', image: '原生图片', empty: '空文稿',
 table: '真实表格', chart: '真实图表', groups: '组合与对象',
 'load-pending': '原件读取等待', 'load-error': '原件读取失败', save: '保存与重开',
}
const fixtureUrl = { title: titleUrl, text: textUrl, image: imageUrl, empty: emptyUrl,
 table: tableUrl, chart: chartUrl, groups: groupsUrl }[scene] ?? richUrl
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
  const nativeHost = async (kind, request) => {
    if (!import.meta.env.DEV && query.get('helper') !== '1')
      throw new Error('静态归档未连接本地 Node helper；此操作需要 helper=1 和隔离 helper。')
    const encode = (bytes) => bytes && btoa(Array.from(bytes, (value) => String.fromCharCode(value)).join(''))
    addLog(`真实本地 Node 宿主：${kind} · ${request.action ?? request.ops?.map((op) => op.op).join('、')}`)
    const response = await fetch(`http://127.0.0.1:5210/${__GALLERY_VARIANT__}/${kind}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: request.signal,
      body: JSON.stringify({ ...request, signal: undefined, assetFile: undefined, posterFile: undefined,
        bytes: encode(request.bytes), imageBytes: encode(request.imageBytes), assetBytes: encode(request.assetBytes), posterBytes: encode(request.posterBytes) }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || '本地原生宿主失败，原件未修改。')
    return { ...result, bytes: Uint8Array.from(atob(result.bytes), (value) => value.charCodeAt(0)) }
  }
  const io = {
    load: async () => {
      loadCountRef.current += 1
      if (scene === 'load-error' && loadCountRef.current === 1)
        throw new Error('隔离模拟：PPTX 原件读取失败，请重试。')
      const bytes =
        savedRef.current ?? new Uint8Array(await (await fetch(fixtureUrl)).arrayBuffer())
      if (scene === 'load-pending') await deferred('读取 PPTX 原件', undefined)
      addLog(`本地固定 PPTX 原件已读取：${bytes.length} 字节`)
      return new Uint8Array(bytes)
    },
    save: async (bytes) => {
      await deferred('保存 PPTX 原件', undefined)
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
          PPTX 真实组件 · {__GALLERY_VARIANT__ === 'before' ? '基线 3b5d912' : '当前实现'}
        </strong>
        <span>
          真实原生 PPTX 与编辑器；保存仅页面内存。原生工具由隔离 Node 宿主执行，无数据库请求。
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
              addLog('从最近模拟保存的真实 PPTX 字节重开；将丢弃之后的未保存变更')
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
          分类和 Inspector 请点击真实 Ribbon；场景 URL 仅选原生固定演示文稿或 IO
          条件，不自动打开面板。
          文字编辑和保存使用真实字节。原生工具提交由127.0.0.1隔离Node
          helper执行产品原生逻辑，不连接数据库。静态归档默认不连接helper；外部服务、Agent生成与远程图片明确拒绝。
        </p>
      </header>
      <div className={`fixture-frame ${bridge.vars}`}>
        <PptxEditor
          documentId={`gallery-pptx-${epoch}`}
          io={io}
          hostApply={(request) => nativeHost('ops', request)}
          hostPicture={(request) => nativeHost('picture', request)}
          hostAsset={async (request) => nativeHost('upload', {
            ...request, assetBytes: new Uint8Array(await request.assetFile.arrayBuffer()),
            assetName: request.assetFile.name, assetMime: request.assetFile.type,
            posterBytes: request.posterFile ? new Uint8Array(await request.posterFile.arrayBuffer()) : undefined,
          })}
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
