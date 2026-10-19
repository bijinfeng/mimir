import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import { HtmlEditor } from '@gallery-repo/packages/office/src/editors/HtmlEditor'
import { MimirProvider } from '@gallery-repo/packages/renderer/src/theme/MimirProvider'
import { setThemeMode } from '@gallery-repo/packages/renderer/src/theme/appearance'
import { useEditorThemeVars } from '@gallery-repo/packages/renderer/src/theme/editor-theme-bridge'
import { fixtureImage as image } from './image-data.js'
import coverage from './coverage-map.json'
import './style.css'

const query = new URLSearchParams(location.search)
const scene = query.get('scene') ?? 'body'
const theme = query.get('theme') === 'dark' ? 'dark' : 'light'
const width = Math.max(280, Number(query.get('width') ?? 1100))
const height = Math.max(220, Number(query.get('height') ?? 760))
const initialIoMode = query.get('io') ?? 'controlled'
const currentInteraction = coverage.groups.find((item) => item.id === query.get('interaction'))
setThemeMode(theme)
document.documentElement.style.setProperty('--fixture-width', `${width}px`)
document.documentElement.style.setProperty('--fixture-height', `${height}px`)
document.body.dataset.capture = String(query.get('capture') === '1')

const scenes = {
  body: '正文 / 源码与分栏',
  empty: '空白页面',
  long: '长内容与长属性',
  preview: '预览与设备缩放',
  source: '源码视图',
  find: '查找与替换',
  element: '预览点选 / 元素 Inspector',
  text: '文字与标签',
  layout: '布局与 CSS',
  link: '链接属性',
  image: '图片 / 裁切与去背景',
  insert: '全部插入工具',
  presentation: '演示与导出',
  questions: 'AI 前置问题',
  brief: 'AI 页面提纲',
  'brief-long': '长提纲与方向',
  writing: 'AI 生成 / 增量',
  'writing-partial': '部分失败 / 保留丢弃',
  'writing-stale': '正文变化 / 草稿失效',
  'load-pending': '原件读取等待',
  'load-error': '原件读取失败 / 重试',
  save: '保存等待',
  'save-error': '保存失败 / 恢复',
}
const title =
  scene === 'long' ? '个人知识整理与研究资料归档的长期实践方法'.repeat(5) : '让知识形成自己的脉络'
const sections = Array.from(
  { length: scene === 'long' ? 18 : 3 },
  (_, index) =>
    `<section class="note-section" id="section-${index}"><h2>${index + 1}. ${['收集有价值的线索', '整理上下文与来源', '建立可持续的回顾'][index % 3]}</h2><p>知识管理始于一个具体的问题。收集、整理、连接与回顾，让分散的内容逐渐形成自己的理解。这是一段可从真实预览点选并编辑的正文。</p></section>`,
).join('\n')
const source =
  scene === 'empty'
    ? '<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><title>空白页面</title></head><body></body></html>\n'
    : `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin:0; padding:32px; font-family:system-ui,sans-serif; color:#28362e; background:#fff; line-height:1.75; }
    main { max-width:760px; margin:auto; }
    h1 { font-size:32px; line-height:1.3; margin:0 0 12px; }
    h2 { font-size:20px; margin:28px 0 12px; }
    .intro { color:#6c776f; margin-bottom:28px; }
    .cards { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
    .card { padding:18px; border:1px solid #dce5df; border-radius:10px; background:#f6faf7; }
    img { display:block; width:100%; height:auto; border-radius:10px; }
    a { color:#387955; } table { border-collapse:collapse; width:100%; }
    th,td { border:1px solid #dce5df; padding:8px 12px; text-align:left; }
    blockquote { margin:20px 0; padding:12px 18px; border-left:3px solid #70a08c; background:#f6faf7; }
    @media(max-width:500px) { body { padding:20px; } .cards { grid-template-columns:1fr; } }
  </style>
</head>
<body>
<main id="knowledge" class="knowledge-page" data-purpose="${scene === 'long' ? '长期研究与知识整理'.repeat(20) : '资料整理'}">
  <h1>${title}</h1>
  <p class="intro">把有价值的信息，整理成可以反复使用的知识。</p>
  <div class="cards"><article class="card"><h2>收集与筛选</h2><p>记录问题、资料和灵感，保留来源与上下文。</p></article><article class="card"><h2>连接与回顾</h2><p>把新的内容连接到已有经验，每周复盘。</p></article></div>
  <figure><img src="${image}" alt="知识收集与连接的抽象示意图"><figcaption>内嵌固定 PNG，图片工具无需外部资源。</figcaption></figure>
  ${sections}
  <p>继续阅读 <a href="#section-1" title="前往整理方法">知识整理方法</a>，也可以在下面的表格中记录进展。</p>
  <table><thead><tr><th>阶段</th><th>进度</th></tr></thead><tbody><tr><td>资料整理</td><td>进行中</td></tr><tr><td>每周回顾</td><td>已完成</td></tr></tbody></table>
  <blockquote>知识的价值，来自反复整理与使用。</blockquote>
  <ul><li>保留来源</li><li>补充上下文</li><li>每周回顾</li></ul>
</main>
</body>
</html>\n`
const draftSource =
  '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>临时页面草稿</title><style>body{font:16px/1.8 system-ui;padding:32px;color:#28362e}h1{font-size:30px}</style></head><body><h1>从收集到连接</h1><p>这是一份尚未写入原文的本地模拟 HTML 草稿。建立清晰的整理习惯，把新材料与已有知识相连接。</p></body></html>'
const brief = {
  title: scene === 'brief-long' ? '个人知识管理与长期研究资料整理方法'.repeat(5) : '从收集到连接',
  tone: '清晰、自然、克制',
  audience: '希望长期整理研究资料的读者',
  core_hook: '让分散的资料成为可以反复使用的知识，呈现从收集到回顾的具体方法。',
  style: {
    name: '清晰的研究手记',
    tone: '自然、安静',
    palette: {
      primary: '#387955',
      accent: '#b29665',
      bg: '#ffffff',
      surface: '#f6faf7',
      text: '#28362e',
    },
    typography: { heading: 'system-ui', body: 'system-ui', scale: '32 / 20 / 16' },
    tokens: { radius: '10px', spacing: '24px', shadow: 'none' },
    layout: '单栏正文与两列摘要',
    density: '舒展',
    docx_friendly: true,
  },
  alternatives: [
    {
      name: '温暖的资料卡片',
      tone: '温暖、简洁',
      palette: {
        primary: '#8d6a43',
        accent: '#b7996e',
        bg: '#faf8f3',
        surface: '#ffffff',
        text: '#3b352d',
      },
      typography: { heading: 'system-ui', body: 'system-ui', scale: '32 / 20 / 16' },
    },
  ],
  sections: Array.from({ length: scene === 'brief-long' ? 12 : 3 }, (_, index) => ({
    title: `${index + 1}. ${['从具体问题开始', '保留来源与上下文', '建立回顾习惯'][index % 3]}`,
    purpose:
      scene === 'brief-long'
        ? '说明资料整理的方法、边界与实践细节。'.repeat(12)
        : '说明这一阶段的具体实践与关键问题。',
  })),
  meta: { language: '简体中文', length: '约 1500 字' },
}

function Fixture() {
  const { styles: bridge } = useEditorThemeVars()
  const handleRef = useRef(null)
  const pendingRef = useRef([])
  const modeRef = useRef(initialIoMode)
  const writerRef = useRef(null)
  const controllerRef = useRef(null)
  const loadCountRef = useRef(0)
  const [ready, setReady] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState([])
  const [active, setActive] = useState(false)
  const [writing, setWriting] = useState(false)
  const [log, setLog] = useState([])
  const addLog = (message) => setLog((items) => [...items.slice(-14), message])
  const syncPending = () => setPending(pendingRef.current.map((entry) => entry.label))
  const deferred = (label, value, signal) => {
    addLog(`模拟请求：${label}`)
    if (modeRef.current === 'error')
      return Promise.reject(new Error(`隔离模拟：${label}失败，请重试。`))
    if (modeRef.current === 'success') return Promise.resolve(value)
    return new Promise((resolve, reject) => {
      const entry = { label, value, resolve, reject, cleanup: () => {} }
      const abort = () => {
        pendingRef.current = pendingRef.current.filter((item) => item !== entry)
        signal?.removeEventListener('abort', abort)
        syncPending()
        reject(new Error('隔离模拟：请求已停止。'))
      }
      entry.cleanup = () => signal?.removeEventListener('abort', abort)
      pendingRef.current.push(entry)
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
      syncPending()
    })
  }
  const settle = (fail) => {
    const entries = pendingRef.current.splice(0)
    syncPending()
    entries.forEach((entry) => {
      entry.cleanup()
      if (fail) entry.reject(new Error(`隔离模拟：${entry.label}失败；原内容保留。`))
      else entry.resolve(entry.value)
    })
    addLog(`手动${fail ? '失败' : '完成'}：${entries.length}项（没有真实后端 IO）`)
  }
  const io = {
    load: () => {
      loadCountRef.current += 1
      if (scene === 'load-error' && loadCountRef.current === 1)
        return Promise.reject(new Error('隔离模拟：HTML 原件读取失败，请重试。'))
      const bytes = new TextEncoder().encode(source)
      return scene === 'load-pending' ? deferred('读取 HTML 原件', bytes) : Promise.resolve(bytes)
    },
    save: async (bytes) => {
      await deferred('保存 HTML 原件', undefined)
      addLog(`模拟保存成功：${bytes.length} 字节，未写盘`)
    },
  }
  const services = {
    planPage: ({ signal }) => deferred('生成页面提纲', structuredClone(brief), signal),
    writeDocument: async ({ signal, onDelta }) => {
      writerRef.current = onDelta
      setWriting(true)
      try {
        return await deferred('生成 HTML 页面', { html: draftSource, complete: true }, signal)
      } finally {
        writerRef.current = null
        setWriting(false)
      }
    },
  }
  const onHandle = (handle) => {
    handleRef.current = handle
    setReady(Boolean(handle))
  }
  const run = async (tool, args) => {
    const handle = handleRef.current
    if (!handle || controllerRef.current) return
    const controller = new AbortController()
    controllerRef.current = controller
    setActive(true)
    try {
      const result = await handle.execute(tool, args, {
        roundId: 'gallery-html-round',
        signal: controller.signal,
      })
      addLog(
        `公开 Agent ${tool}：${result.ok ? '成功' : '未写入'} · ${result.summary ?? result.error ?? '完成'}`,
      )
    } catch (cause) {
      addLog(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
      setActive(false)
    }
  }
  useEffect(() => {
    const toggle = (event) => {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'h') {
        event.preventDefault()
        document.body.dataset.capture = String(document.body.dataset.capture !== 'true')
      }
    }
    document.addEventListener('keydown', toggle)
    return () => {
      document.removeEventListener('keydown', toggle)
      controllerRef.current?.abort()
    }
  }, [])
  const urlFor = (nextScene, nextTheme = theme) => {
    const params = new URLSearchParams(query)
    params.set('scene', nextScene)
    params.set('theme', nextTheme)
    return `?${params}`
  }
  return (
    <>
      <header className="fixture-tools">
        <strong>
          HTML 真实组件 · {__GALLERY_VARIANT__ === 'before' ? '基线 0c44cde' : '当前实现'}
        </strong>
        <span>固定本地原件；模型、读写库 IO 均为模拟。演示/导出按钮仍执行真实浏览器动作。</span>
        <nav aria-label="演示场景">
          {Object.entries(scenes).map(([key, label]) => (
            <a key={key} href={urlFor(key)} aria-current={key === scene ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <details>
          <summary>{coverage.count} 项真实交互入口索引（不代表已逐项验收）</summary>
          <nav aria-label="交互编号索引">
            {coverage.groups.map((item) => (
              <a key={item.id} href={`${urlFor(item.scene)}&interaction=${item.id}`}>
                {item.id} {item.title}
              </a>
            ))}
          </nav>
        </details>
        {currentInteraction && (
          <p>
            <strong>
              {currentInteraction.id} {currentInteraction.title}
            </strong>
            ：{currentInteraction.entry}。{currentInteraction.states}。{currentInteraction.boundary}
            。
          </p>
        )}
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
            disabled={!ready || active}
            onClick={() =>
              void run('ask_clarification', {
                questions: [
                  {
                    id: 'audience',
                    label: '页面主要面向哪些读者？',
                    description: '单选问题，未选择时由 AI 决定。',
                    options: ['个人研究者', '项目团队', '公开分享读者'],
                  },
                  {
                    id: 'content',
                    label: '需要包含哪些内容？',
                    description: '可选择多项。',
                    options: ['整理方法', '实践示例', '资料清单'],
                    multi: true,
                  },
                ],
              })
            }
          >
            打开实际前置问题
          </button>
          <button
            disabled={!ready || active}
            onClick={() =>
              void run('plan_page', {
                mode: 'extract',
                instruction: '提取当前页面的内容主张与章节，显示真实可编辑确认面板。',
              })
            }
          >
            开始实际提纲流程
          </button>
          <button
            disabled={!ready || active}
            onClick={() =>
              void run('write_document', {
                title: '从收集到连接',
                plan: '用清晰的章节说明收集、整理、连接与回顾的方法。',
              })
            }
          >
            开始实际写作流程
          </button>
          <button
            disabled={!writing}
            onClick={() => {
              writerRef.current?.(draftSource)
              addLog('发送固定本地 HTML 模拟增量')
            }}
          >
            发送模拟增量
          </button>
          <button disabled={!active} onClick={() => controllerRef.current?.abort()}>
            外部取消本轮 Agent
          </button>
          <button
            disabled={!ready}
            onClick={async () =>
              addLog(`撤销实际整轮：${await handleRef.current?.undoRound('gallery-html-round')}`)
            }
          >
            撤销实际 Agent 整轮
          </button>
          <button
            disabled={!ready}
            onClick={() => {
              const handle = handleRef.current
              const result = handle?.applyOps([
                {
                  op: 'str_replace',
                  old: '把有价值的信息',
                  new: '正文已在生成期间改变：把有价值的信息',
                },
              ])
              addLog(
                `公开 live handle.applyOps 修改正文：${result?.ok ? '成功' : (result?.error ?? '未就绪')}，供草稿过期验证`,
              )
            }}
          >
            修改原文使草稿过期
          </button>
        </div>
        <p role="status">
          当前场景：{scenes[scene] ?? scene} · Agent {ready ? '就绪' : '初始化'} ·{' '}
          {dirty ? '有未保存变更' : '没有未保存变更'} · 等待：{pending.join('、') || '无'}
        </p>
        <p>
          源码/分栏/预览、设备/缩放、查找、插入、元素 Inspector 与图片工具请通过真实 Ribbon
          操作；点选预览中的正文、容器、图片、链接或表格进入相应工具。场景导航仅切换固定数据与说明，不伪造组件状态。
        </p>
      </header>
      <div className={`fixture-frame ${bridge.vars}`}>
        <HtmlEditor
          documentId="gallery-html"
          io={io}
          flush
          onDirtyChange={setDirty}
          onAgentHandleChange={onHandle}
          agentServices={query.get('capabilities') === 'missing' ? undefined : services}
          onAiPreset={
            query.get('capabilities') === 'missing'
              ? undefined
              : (instruction) =>
                  addLog(`模拟宿主 AI 预设已接收（${instruction.length} 字符），未发模型请求`)
          }
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
