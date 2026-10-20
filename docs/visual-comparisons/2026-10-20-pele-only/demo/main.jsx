import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorContent, useEditor } from '@tiptap/react'
import { createExtensions } from '@trial/editor/extensions'
import { MimirProvider } from '@trial/theme/MimirProvider'
import { setThemeMode } from '@trial/theme/appearance'
import { useContentStyles } from '@trial/components/ContentTypography.style'
import { cases, markdownOf } from './fixtures'
import './style.css'

const query = new URLSearchParams(location.search)
const selected = Object.hasOwn(cases, query.get('case')) ? query.get('case') : 'flowchart'
const theme = query.get('theme') === 'dark' ? 'dark' : 'light'
const width = Math.max(320, Number(query.get('width')) || 900)
const editable = query.get('editable') === '1'
setThemeMode(theme)
document.documentElement.dataset.theme = theme

function navigate(key, value) {
  const url = new URL(location.href)
  url.searchParams.set(key, value)
  location.assign(url)
}

function Trial() {
  const { styles } = useContentStyles()
  const [saved, setSaved] = useState(null)
  const editor = useEditor({
    extensions: createExtensions(),
    content: markdownOf(selected),
    contentType: 'markdown',
    editable,
  })
  return (
    <main style={{ width }}>
      <header>
        <h1>Pele 单引擎</h1>
        <p>真实 Tiptap 图表节点、宿主排版与主题；固定样例，无后端或资料写入。</p>
        <nav aria-label="对比条件">
          <label>
            样例
            <select value={selected} onChange={(event) => navigate('case', event.target.value)}>
              {Object.entries(cases).map(([id, item]) => (
                <option value={id} key={id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            主题
            <select value={theme} onChange={(event) => navigate('theme', event.target.value)}>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
          <label>
            宽度
            <select
              value={String(width)}
              onChange={(event) => navigate('width', event.target.value)}
            >
              <option value="900">900 px</option>
              <option value="390">390 px</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={editable}
              onChange={(event) => navigate('editable', event.target.checked ? '1' : '0')}
            />
            编辑源码
          </label>
        </nav>
      </header>
      <article className={styles.content} aria-label="真实文档组件">
        <EditorContent editor={editor} />
      </article>
      <footer>
        <button type="button" onClick={() => setSaved(editor?.getMarkdown() ?? '')}>
          读取 Markdown
        </button>
        <button
          type="button"
          disabled={saved === null}
          onClick={() => editor?.commands.setContent(saved, { contentType: 'markdown' })}
        >
          从已读源码重开
        </button>
        <button
          type="button"
          onClick={() =>
            editor?.commands.setContent(markdownOf('flowchart'), { contentType: 'markdown' })
          }
        >
          换为有效图表
        </button>
        <button type="button" onClick={() => editor?.commands.undo()}>
          撤销
        </button>
        <output aria-label="已读 Markdown">{saved ?? '尚未读取'}</output>
      </footer>
    </main>
  )
}

createRoot(document.getElementById('root')).render(
  <MimirProvider>
    <Trial />
  </MimirProvider>,
)
