import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Extension } from '@tiptap/core'
import { MarkdownEditor } from '@gallery-repo/packages/office/src/editors/MarkdownEditor'
import { createExtensions } from '@gallery-repo/packages/renderer/src/editor/extensions'
import { MimirProvider } from '@gallery-repo/packages/renderer/src/theme/MimirProvider'
import { setThemeMode } from '@gallery-repo/packages/renderer/src/theme/appearance'
import { useContentStyles } from '@gallery-repo/packages/renderer/src/components/ContentTypography.style'
import { useEditorThemeVars } from '@gallery-repo/packages/renderer/src/theme/editor-theme-bridge'
import { useStyles as useDocumentStyles } from '@gallery-repo/packages/renderer/src/components/document/DocumentPanel.style'
import './style.css'

const query = new URLSearchParams(location.search)
const scene = query.get('scene') ?? 'body'
const capabilitiesMissing = query.get('capabilities') === 'missing'
const initialIoMode = query.get('io') ?? (scene.includes('error') ? 'error' : 'controlled')
const theme = query.get('theme') === 'dark' ? 'dark' : 'light'
const width = Math.max(280, Number(query.get('width') ?? 1100))
const height = Math.max(220, Number(query.get('height') ?? 760))
setThemeMode(theme)
document.documentElement.style.setProperty('--fixture-width', `${width}px`)
document.documentElement.style.setProperty('--fixture-height', `${height}px`)
document.body.dataset.capture = String(query.get('capture') === '1')
const longTitle = '面向未来的个人知识管理与长期研究资料整理方法'.repeat(5)
const notes = [
  { id: 'note-start', title: '从收集开始' },
  { id: 'note-review', title: '每周回顾与知识整理' },
  { id: 'note-long', title: longTitle },
]
const body = `## 从收集开始\n\n把分散的信息整理成自己的知识。选择这段文字可以体验提问、改写与翻译。\n\n- 收集有价值的线索\n- 为资料补充上下文\n- 定期回顾与连接\n\n> 笔记的价值，来自不断整理与使用。\n\n### 项目进度\n\n| 事项 | 状态 |\n| --- | --- |\n| 整理资料 | 进行中 |\n| 每周回顾 | 已完成 |\n\n### 示例代码\n\n\`\`\`javascript\nconst knowledge = ['收集', '整理', '连接']\nconsole.log(knowledge.join(' → '))\n\`\`\`\n\n### 继续探索\n\n可以使用 / 插入内容，也可以用 [[ 连接已有笔记。\n\n`
const diagramBody = `## 公式与图表\n\n$$\nx^2 + y^2 = z^2\n$$\n\n\`\`\`mermaid\ngraph LR\n  A[收集] --> B[整理] --> C[连接]\n\`\`\`\n\n\`\`\`wavedrom\n{signal:[{name:"clk",wave:"p....."},{name:"data",wave:"x.345x",data:["收集","整理","连接"]}]}\n\`\`\`\n\n`
const invalidDiagramBody = `## 无效源码反馈\n\n$$\n\\notAValidCommand{\n$$\n\n\`\`\`mermaid\nthis is invalid mermaid\n\`\`\`\n\n\`\`\`wavedrom\nthis is invalid wavedrom\n\`\`\`\n`
const scenes = {
  body: '正文与完整工具栏',
  diagrams: '公式与图表',
  'diagram-error': '无效公式与图表',
  side: '宿主侧栏槽位',
  empty: '空白笔记',
  long: '长正文与超长字段',
  inline: '选区 AI 工具',
  link: '链接面板',
  wiki: '笔记候选',
  'wiki-loading': '候选等待',
  'wiki-error': '候选失败',
  'wiki-empty': '候选为空',
  'wiki-long': '超长候选',
  slash: '斜杠菜单',
  'slash-empty': '无匹配命令',
  table: '表格上下文',
  code: '代码上下文',
  frontmatter: 'YAML 属性',
  'frontmatter-loading': '属性读取等待',
  'frontmatter-error': '属性读取失败',
  'frontmatter-save': '属性保存等待',
  save: '保存生命周期',
  'save-error': '保存失败与重试',
  find: '查找替换',
  writing: '写作生成',
  'writing-partial': '写作部分失败',
  'writing-stale': '草稿过期',
  'writing-stop': '停止与保留/丢弃',
  export: '导出反馈',
  image: '插图失败',
}
const editorProbe = Extension.create({
  name: 'galleryPublicEditorProbe',
  onCreate() {
    document.dispatchEvent(new CustomEvent('gallery-editor-created', { detail: this.editor }))
  },
  onDestroy() {
    document.dispatchEvent(new CustomEvent('gallery-editor-destroyed', { detail: this.editor }))
  },
})
function Fixture() {
  const { styles: content } = useContentStyles()
  const { styles: bridge } = useEditorThemeVars()
  const { styles: documentStyles } = useDocumentStyles()
  const editorRef = useRef(null)
  const handleRef = useRef(null)
  const saveRef = useRef(null)
  const pendingRef = useRef([])
  const writerRef = useRef(null)
  const operationRef = useRef(null)
  const preparedRef = useRef(false)
  const yamlRef = useRef('tags:\n  - 知识管理\nstatus: draft\n')
  const [log, setLog] = useState([])
  const [pending, setPending] = useState([])
  const [saveState, setSaveState] = useState('idle')
  const [dirty, setDirty] = useState(false)
  const [rewriting, setRewriting] = useState(false)
  const [writerActive, setWriterActive] = useState(false)
  const [operationActive, setOperationActive] = useState(false)
  const [ready, setReady] = useState(false)
  const modeRef = useRef(initialIoMode)
  const addLog = useCallback((text) => setLog((old) => [...old.slice(-15), text]), [])
  const syncPending = useCallback(
    () => setPending(pendingRef.current.map((item) => item.label)),
    [],
  )
  const deferred = useCallback(
    (label, value, signal) => {
      addLog(`模拟请求：${label}`)
      if (modeRef.current === 'error')
        return Promise.reject(new Error(`隔离模拟：${label}暂时失败，请重试`))
      if (modeRef.current === 'success') return Promise.resolve(value)
      return new Promise((resolve, reject) => {
        const entry = { label, value, resolve, reject }
        pendingRef.current.push(entry)
        const abort = () => {
          pendingRef.current = pendingRef.current.filter((item) => item !== entry)
          syncPending()
          reject(new Error('隔离模拟：请求已停止'))
        }
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) abort()
        syncPending()
      })
    },
    [addLog, syncPending],
  )
  const settle = useCallback(
    (fail) => {
      const entries = pendingRef.current.splice(0)
      syncPending()
      for (const item of entries) {
        if (fail) item.reject(new Error(`隔离模拟：${item.label}失败，原内容保留`))
        else item.resolve(item.value)
      }
      addLog(`模拟请求${fail ? '失败' : '成功'}：${entries.length} 项`)
    },
    [addLog, syncPending],
  )
  const extensions = useMemo(() => [...createExtensions(), editorProbe], [])
  useEffect(() => {
    const created = (event) => {
      editorRef.current = event.detail
      setReady(true)
    }
    const destroyed = (event) => {
      if (editorRef.current === event.detail) editorRef.current = null
    }
    document.addEventListener('gallery-editor-created', created)
    document.addEventListener('gallery-editor-destroyed', destroyed)
    return () => {
      document.removeEventListener('gallery-editor-created', created)
      document.removeEventListener('gallery-editor-destroyed', destroyed)
    }
  }, [])
  const services = useMemo(
    () => ({
      fetchImage: () => Promise.reject(new Error('隔离模拟：未启用外部图片下载')),
      generateImage: () => Promise.reject(new Error('隔离模拟：未接真实模型')),
      uploadImage: () =>
        deferred('插入图片', {
          url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="80"%3E%3Crect width="160" height="80" fill="%2388a9a0"/%3E%3C/svg%3E',
          name: '模拟插图.svg',
        }),
      readFrontmatter: () =>
        scene === 'frontmatter'
          ? Promise.resolve(yamlRef.current)
          : deferred('读取笔记属性', yamlRef.current),
      writeFrontmatter: async (yaml, expected) => {
        if (expected !== yamlRef.current) throw new Error('隔离模拟：属性版本冲突')
        await deferred('保存笔记属性', yaml)
        yamlRef.current = yaml
        return yaml
      },
      writeDocument: async (_input, signal, onDelta) => {
        writerRef.current = onDelta
        setWriterActive(true)
        try {
          return await deferred(
            '生成写作草稿',
            '## 新的整理思路\n\n以问题为线索，把收集到的资料连接起来。\n',
            signal,
          )
        } finally {
          writerRef.current = null
          setWriterActive(false)
        }
      },
    }),
    [deferred],
  )
  const selectFixture = useCallback((kind) => {
    const editor = editorRef.current
    if (!editor) return
    let pos = null
    editor.state.doc.descendants((node, at) => {
      if (pos !== null) return false
      if (kind === 'inline' && node.isText && node.text.includes('选择这段')) {
        const start = node.text.indexOf('选择这段')
        pos = { from: at + start, to: at + Math.min(node.text.length, start + 21) }
      }
      if (kind === 'table' && node.type.name === 'tableCell') pos = { from: at + 2, to: at + 2 }
      if (kind === 'code' && node.type.name === 'codeBlock') pos = { from: at + 1, to: at + 1 }
    })
    if (pos) return editor.chain().focus().setTextSelection(pos).run()
    return false
  }, [])
  const insertTrigger = useCallback((text) => {
    const editor = editorRef.current
    if (!editor) return
    editor
      .chain()
      .focus('end')
      .insertContent([
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text }] },
      ])
      .run()
  }, [])
  const startWriting = useCallback(async () => {
    if (operationRef.current || !handleRef.current) return
    const controller = new AbortController()
    operationRef.current = controller
    setOperationActive(true)
    try {
      const result = await handleRef.current.execute(
        'write_document',
        { plan: '整理一份知识管理笔记', afterIndex: 0 },
        { roundId: 'gallery-writing-round', signal: controller.signal },
      )
      addLog(`真实 Agent 结果：${result.summary ?? result.error}`)
    } finally {
      if (operationRef.current === controller) operationRef.current = null
      setOperationActive(false)
    }
  }, [addLog])
  const initial =
    scene === 'diagrams'
      ? diagramBody
      : scene === 'diagram-error'
        ? invalidDiagramBody
        : scene === 'empty'
          ? ''
          : scene === 'long'
            ? body +
              Array.from({ length: 24 }, (_, i) => `## 回顾 ${i + 1}\n\n${longTitle}\n\n`).join('')
            : body
  const changeHandle = useCallback((handle) => {
    handleRef.current = handle
  }, [])
  const changeSaveHandle = useCallback((handle) => {
    saveRef.current = handle
  }, [])
  const save = useCallback(async () => {
    addLog(`宿主保存结果：${await saveRef.current?.()}`)
  }, [addLog])
  const preset = useCallback(
    (instruction) => addLog(`真实 AI 预设回调：${instruction}；本 Demo 不发送模型请求`),
    [addLog],
  )
  const searchNotes = useCallback(
    async (text) => {
      if (scene === 'wiki-empty') return []
      const values =
        scene === 'wiki-long'
          ? [notes[2], ...notes.slice(0, 2)]
          : notes.filter((item) => !text || item.title.includes(text))
      if (scene === 'wiki' || scene === 'wiki-long') return values
      return deferred('检索笔记候选', values)
    },
    [deferred],
  )
  useEffect(() => {
    const toggle = (event) => {
      if (event.altKey && event.shiftKey && event.code === 'KeyH') {
        document.body.dataset.capture = String(document.body.dataset.capture !== 'true')
        event.preventDefault()
      }
    }
    document.addEventListener('keydown', toggle)
    return () => document.removeEventListener('keydown', toggle)
  }, [])
  useEffect(() => {
    if (!ready || preparedRef.current || query.get('prepare') !== '1') return
    preparedRef.current = true
    if (scene === 'inline') selectFixture('inline')
    if (scene === 'table' || scene === 'code') selectFixture(scene)
    if (scene.startsWith('wiki')) insertTrigger('[[')
    if (scene === 'slash' || scene === 'slash-empty')
      insertTrigger(scene === 'slash' ? '/' : '/zzzznomatch')
  }, [ready, selectFixture, insertTrigger])
  return (
    <>
      <header className="fixture-tools">
        <strong>Markdown · {__GALLERY_VARIANT__ === 'before' ? '基线 46a2120' : '打磨后'}</strong>
        <span>真实组件与方言；所有 IO 为本地可控 Promise，不调用模型/后端、不保存文件。</span>
        <nav>
          {Object.entries(scenes).map(([key, label]) => (
            <a key={key} href={`?scene=${key}&theme=${theme}&width=${width}&height=${height}`}>
              {label}
            </a>
          ))}
        </nav>
        <div className="fixture-actions">
          <a
            href={`?scene=${scene}&theme=${theme === 'dark' ? 'light' : 'dark'}&width=${width}&height=${height}`}
          >
            切换主题
          </a>
          <label>
            模拟 IO{' '}
            <select
              defaultValue={initialIoMode}
              onChange={(event) => {
                modeRef.current = event.target.value
                addLog(`IO 模式：${event.target.value}`)
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
          <button
            disabled={pending.length === 0}
            title="有等待中的模拟请求时可完成"
            onClick={() => settle(false)}
          >
            完成模拟请求
          </button>
          <button
            disabled={pending.length === 0}
            title="有等待中的模拟请求时可失败"
            onClick={() => settle(true)}
          >
            失败模拟请求
          </button>
          <button disabled={!ready} onClick={() => selectFixture('inline')}>
            选中正文文字
          </button>
          <button disabled={!ready} onClick={() => selectFixture('table')}>
            进入实际表格
          </button>
          <button disabled={!ready} onClick={() => selectFixture('code')}>
            进入实际代码块
          </button>
          <button disabled={!ready} onClick={() => insertTrigger('[[')}>
            输入 [[
          </button>
          <button disabled={!ready} onClick={() => insertTrigger('/')}>
            输入 /
          </button>
          <button disabled={!ready} onClick={() => insertTrigger('/zzzznomatch')}>
            输入无匹配 /
          </button>
          <button disabled={!ready} onClick={save}>
            宿主立即保存
          </button>
          <button
            disabled={!ready || capabilitiesMissing || operationActive}
            title="Agent就绪且没有正在进行的写作时可开始"
            onClick={startWriting}
          >
            开始实际写作流程
          </button>
          <button
            disabled={!writerActive}
            title="实际写作服务等待期间可发送模拟增量"
            onClick={() => {
              writerRef.current?.(
                '## 临时写作草稿\n\n建立清晰的整理习惯，把新材料与已有知识相连接。\n',
              )
              addLog('发送一段本地模拟增量')
            }}
          >
            发送模拟增量
          </button>
          <button
            disabled={!operationActive}
            title="实际Agent写作正在进行时可取消"
            onClick={() => operationRef.current?.abort()}
          >
            外部取消本轮 Agent
          </button>
          <button
            disabled={!ready}
            onClick={async () =>
              addLog(`撤销整轮结果：${await handleRef.current?.undoRound('gallery-writing-round')}`)
            }
          >
            撤销实际写作整轮
          </button>
          <button
            disabled={!writerActive}
            title="实际写作服务等待期间可发送模拟增量"
            onClick={() => {
              writerRef.current?.('很长的临时草稿内容，滚动查看。'.repeat(300))
              addLog('发送长模拟增量')
            }}
          >
            发送长模拟增量
          </button>
          <button disabled={!ready} onClick={() => insertTrigger('正文已在生成期间改变')}>
            修改正文使草稿过期
          </button>
        </div>
        <p role="status">
          当前场景：{scenes[scene] ?? scene} · 保存 {saveState} ·{' '}
          {dirty ? '有未保存变更' : '没有未保存变更'} · Agent {ready ? '就绪' : '初始化'} · 等待：
          {pending.join('、') || '无'}
        </p>
        <p>
          工具栏、链接、属性、表格、查找与草稿的打开/关闭请直接操作真实控件。上方按钮仅驱动真实编辑器公开命令与宿主回调；导航用于固定数据及
          IO 条件。
        </p>
      </header>
      <div
        className={`fixture-frame ${bridge.vars ?? bridge.theme ?? Object.values(bridge).join(' ')}`}
      >
        <div className={`${documentStyles.root} fixture-document`}>
          <MarkdownEditor
            documentId="gallery-note"
            extensions={extensions}
            initialContent={initial}
            contentClassName={content.content}
            flush
            contentHeader={
              <header className="fixture-content-header">
                <h1>
                  {scene === 'long' ? longTitle : scene === 'empty' ? '未命名笔记' : '从收集开始'}
                </h1>
                <p>固定演示标题与元信息 · 宿主 Header 为 gallery 简化布局</p>
              </header>
            }
            onSave={async (markdown) => {
              await deferred('保存正文', undefined)
              addLog(`模拟保存成功，${markdown.length} 字符（未写盘）`)
            }}
            onSaveStateChange={setSaveState}
            onDirtyChange={setDirty}
            onSaveHandle={changeSaveHandle}
            onAgentHandleChange={changeHandle}
            agentServices={capabilitiesMissing ? undefined : services}
            searchNotes={capabilitiesMissing ? undefined : searchNotes}
            onOpenInternalNote={(id) => addLog(`内部笔记导航回调：${id}；未离开 Demo`)}
            onAskAboutSelection={(text) => addLog(`提问回调：已选 ${text.length} 字符；未发送`)}
            onRewrite={
              capabilitiesMissing
                ? undefined
                : async (text, action) => {
                    setRewriting(true)
                    try {
                      return await deferred(`选区${action}`, `已模拟改写：${text}`)
                    } catch (error) {
                      addLog(error.message)
                      return null
                    } finally {
                      setRewriting(false)
                    }
                  }
            }
            rewriting={rewriting}
            onUploadImage={capabilitiesMissing ? undefined : services.uploadImage}
            onExportMarkdown={async (markdown) => {
              await deferred('导出 Markdown', undefined)
              addLog(`模拟导出完成，${markdown.length} 字符（未下载文件）`)
            }}
            onAiPreset={capabilitiesMissing ? undefined : preset}
            bodySide={
              scene === 'side' ? (
                <aside className={documentStyles.outlineSide}>
                  <div className={documentStyles.outlineTitle}>大纲 · 宿主槽位演示</div>
                  {['从收集开始', '项目进度', '示例代码', '继续探索'].map((title, index) => (
                    <button
                      type="button"
                      key={title}
                      className={documentStyles.olItem}
                      onClick={() => {
                        const editor = editorRef.current
                        let seen = 0
                        editor?.state.doc.descendants((node, pos) => {
                          if (node.type.name === 'heading' && seen++ === index) {
                            editor
                              .chain()
                              .focus()
                              .setTextSelection(pos + 1)
                              .scrollIntoView()
                              .run()
                          }
                        })
                      }}
                    >
                      {title}
                    </button>
                  ))}
                </aside>
              ) : undefined
            }
          />
        </div>
      </div>
      <pre className="fixture-log" aria-label="本地模拟操作日志">
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
