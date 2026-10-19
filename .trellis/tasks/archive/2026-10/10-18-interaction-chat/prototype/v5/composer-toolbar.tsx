import { useState, useRef, useEffect } from 'react'
import { Check, ChevronDown, Library, Zap } from 'lucide-react'
export type ComposerToolbarState = {
  scope: string
  deep: boolean
  sidebar: boolean
  searchOnly: boolean
  documents: string[]
  documentsStatus: 'loaded' | 'loading' | 'error' | 'empty'
  modelRoles: { chat?: string; reasoning?: string }
  initialMenu?: string
}
export function ComposerBusinessToolbar({
  state,
  onAction,
}: {
  state?: ComposerToolbarState
  onAction: (action: string, value?: string) => void
}) {
  const [selection, setSelection] = useState({
    source: state?.initialMenu,
    name: state?.initialMenu || 'none',
  })
  const menu =
    selection.source === state?.initialMenu ? selection.name : state?.initialMenu || 'none'
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const close = () => {
    setSelection({ source: state?.initialMenu, name: 'none' })
    trigger.current?.focus()
  }
  useEffect(() => {
    if (menu === 'none') return
    const click = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node))
        setSelection({ source: state?.initialMenu, name: 'none' })
    }
    document.addEventListener('pointerdown', click)
    return () => document.removeEventListener('pointerdown', click)
  }, [menu, state?.initialMenu])
  useEffect(() => {
    if (menu !== 'none')
      box.current?.querySelector<HTMLButtonElement>('[role^=menuitem]:not(:disabled)')?.focus()
  }, [menu])
  if (!state) return null
  const deep = !state.sidebar && state.deep
  const model = (deep ? state.modelRoles.reasoning : state.modelRoles.chat) || '未配置模型'
  const toggle = (name: string, e: React.MouseEvent<HTMLButtonElement>) => {
    trigger.current = e.currentTarget
    setSelection({ source: state.initialMenu, name: menu === name ? 'none' : name })
  }
  const action = (name: string, value?: string) => {
    onAction(name, value)
    close()
  }
  return (
    <div
      className="business-toolbar"
      ref={box}
      aria-label="本轮对话设置"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          close()
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          const nodes = Array.from(
            box.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ||
              [],
          )
          if (!nodes.length) return
          e.preventDefault()
          const i = nodes.indexOf(document.activeElement as HTMLButtonElement)
          nodes[
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? nodes.length - 1
                : (i + (e.key === 'ArrowUp' ? -1 : 1) + nodes.length) % nodes.length
          ]?.focus()
        }
      }}
    >
      <div className="selector">
        <button
          type="button"
          className="toolbar-button"
          aria-label={`当前全局模型：${model}`}
          aria-haspopup="menu"
          aria-expanded={menu === 'model'}
          onClick={(e) => toggle('model', e)}
        >
          <span title={model}>{model}</span>
          <ChevronDown size={13} />
        </button>
        {menu === 'model' && (
          <div className="toolbar-menu" role="menu" aria-label="全局模型绑定">
            {(['chat', 'reasoning'] as const).map((role) => (
              <button type="button" role="menuitem" disabled key={role}>
                <span>
                  <strong>{role === 'chat' ? '对话模型' : '深度思考模型'}</strong>
                  <small>{state.modelRoles[role] || '未配置'}</small>
                </span>
                {(role === 'reasoning') === deep && <Check size={14} />}
              </button>
            ))}
            <hr />
            <button type="button" role="menuitem" onClick={() => action('toolbar-manage-models')}>
              管理模型
            </button>
          </div>
        )}
      </div>
      <div className="selector">
        <button
          type="button"
          className="toolbar-button"
          disabled={state.sidebar}
          title={state.sidebar ? '文档助手始终使用标准思考强度' : undefined}
          aria-label={`思考强度：${deep ? '深入' : '标准'}${state.sidebar ? '，文档助手不支持深入' : ''}`}
          aria-haspopup="menu"
          aria-expanded={menu === 'strength'}
          onClick={(e) => toggle('strength', e)}
        >
          <Zap size={14} />
          {deep ? '深入' : '标准'}
          {!state.sidebar && <ChevronDown size={13} />}
        </button>
        {menu === 'strength' && (
          <div className="toolbar-menu" role="menu" aria-label="思考强度">
            {[
              ['standard', '标准（对话模型）'],
              ['deep', '深入（推理模型）'],
            ].map(([value, title]) => (
              <button
                type="button"
                key={value}
                role="menuitemradio"
                aria-checked={(value === 'deep') === deep}
                onClick={() => action('toolbar-strength', value)}
              >
                {title}
                {(value === 'deep') === deep && <Check size={14} />}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="selector">
        <button
          type="button"
          className="toolbar-button"
          aria-label={`本轮检索范围：${state.scope || '全部文档'}`}
          aria-haspopup="menu"
          aria-expanded={menu === 'scope'}
          onClick={(e) => toggle('scope', e)}
        >
          <Library size={14} />
          <span title={state.scope || '全部文档'}>{state.scope || '全部文档'}</span>
          <ChevronDown size={13} />
        </button>
        {menu === 'scope' && (
          <div className="toolbar-menu scope-menu" role="menu" aria-label="本轮检索范围">
            {state.scope && (
              <>
                <button type="button" role="menuitem" onClick={() => action('toolbar-scope', '')}>
                  清除本轮检索范围
                </button>
                <hr />
              </>
            )}
            {state.documentsStatus === 'loading' ? (
              <button type="button" role="menuitem" disabled>
                加载中…
              </button>
            ) : state.documentsStatus === 'error' ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => action('toolbar-refetch-documents')}
              >
                读取失败，点此重试
              </button>
            ) : state.documentsStatus === 'empty' ? (
              <button type="button" role="menuitem" disabled>
                知识库还没有文档
              </button>
            ) : (
              state.documents.slice(0, 20).map((doc) => (
                <button
                  type="button"
                  key={doc}
                  role="menuitem"
                  onClick={() => action('toolbar-scope', doc)}
                >
                  <span title={doc}>{doc}</span>
                  {state.scope === doc && <Check size={14} />}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
