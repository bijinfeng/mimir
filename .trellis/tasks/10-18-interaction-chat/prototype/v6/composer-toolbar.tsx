import { useState, useRef, useEffect } from 'react'
import { Check, ChevronDown, Library, Zap } from 'lucide-react'
import { modelKey, selectedModel, selectModel } from './model-settings'
import type { ModelOption, ModelSelection } from './model-settings'
export type ComposerToolbarState = {
  scope: string
  sidebar: boolean
  searchOnly: boolean
  documents: string[]
  documentsStatus: 'loaded' | 'loading' | 'error' | 'empty'
  models: ModelOption[]
  selectedModel?: ModelSelection
  modelsStatus?: 'loaded' | 'loading' | 'error' | 'empty'
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
    const target =
      trigger.current ||
      box.current?.querySelector<HTMLButtonElement>(`[data-menu-trigger="${menu}"]`)
    setSelection({ source: state?.initialMenu, name: 'none' })
    target?.focus()
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
  const activeModel = selectedModel(state.models, state.selectedModel)
  const model = activeModel?.label || '选择模型'
  const capability = activeModel?.reasoning
  const effort =
    capability?.status === 'supported'
      ? capability.options.find((option) => option.value === state.selectedModel?.reasoningEffort)
      : undefined
  const fixed =
    capability?.status === 'supported' &&
    capability.options.length === 1 &&
    !capability.allowInherit
  const unavailable = !activeModel
    ? '请先选择模型'
    : capability?.status === 'unsupported'
      ? '当前模型不支持调整推理等级'
      : capability?.status === 'loading'
        ? '正在读取当前模型的推理能力，请稍候'
        : capability?.status === 'error'
          ? '推理能力读取失败，请在模型管理中重试'
          : '尚未确认当前模型的推理等级'
  const groups = [...new Set(state.models.map((model) => model.providerId))]
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
          data-menu-trigger="model"
          aria-label={`当前模型：${model}`}
          aria-haspopup="menu"
          aria-expanded={menu === 'model'}
          onClick={(e) => toggle('model', e)}
        >
          <span title={model}>{model}</span>
          <ChevronDown size={13} />
        </button>
        {menu === 'model' && (
          <div className="toolbar-menu model-menu" role="menu" aria-label="选择模型">
            {state.modelsStatus === 'loading' ? (
              <p className="menu-status" role="status">
                正在加载模型…
              </p>
            ) : state.modelsStatus === 'error' ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => onAction('toolbar-refetch-models')}
              >
                模型读取失败，重试
              </button>
            ) : !state.models.length ? (
              <p className="menu-status">还没有可用模型，请前往管理模型</p>
            ) : (
              groups.map((providerId) => (
                <div
                  role="group"
                  aria-label={
                    state.models.find((model) => model.providerId === providerId)!.providerLabel
                  }
                  key={providerId}
                >
                  <div className="provider-label">
                    {state.models.find((model) => model.providerId === providerId)!.providerLabel}
                  </div>
                  {state.models
                    .filter((model) => model.providerId === providerId)
                    .map((option) => (
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={
                          !!state.selectedModel &&
                          modelKey(option) === modelKey(state.selectedModel)
                        }
                        key={modelKey(option)}
                        onClick={() => action('toolbar-model', modelKey(option))}
                      >
                        <span title={option.label}>{option.label}</span>
                        <span className="menu-check">
                          {!!state.selectedModel &&
                            modelKey(option) === modelKey(state.selectedModel) && (
                              <Check size={14} />
                            )}
                        </span>
                      </button>
                    ))}
                </div>
              ))
            )}
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
          disabled={capability?.status !== 'supported' || fixed}
          title={
            fixed
              ? '当前模型使用固定推理等级'
              : capability?.status === 'supported'
                ? '按当前模型支持的等级调整'
                : unavailable
          }
          data-menu-trigger="strength"
          aria-label={
            capability?.status === 'supported'
              ? `推理等级：${effort?.label || (capability.allowInherit ? '模型默认' : '未选择')}`
              : unavailable
          }
          aria-haspopup="menu"
          aria-expanded={menu === 'strength'}
          onClick={(e) => toggle('strength', e)}
        >
          <Zap size={14} />
          {capability?.status === 'supported'
            ? effort?.label || (capability.allowInherit ? '模型默认' : '选择等级')
            : !activeModel
              ? '未选模型'
              : capability?.status === 'unsupported'
                ? '不可调节'
                : capability?.status === 'loading'
                  ? '能力加载中'
                  : capability?.status === 'error'
                    ? '能力读取失败'
                    : '等级未知'}
          {capability?.status === 'supported' && !fixed && <ChevronDown size={13} />}
        </button>
        {menu === 'strength' && capability?.status === 'supported' && !fixed && (
          <div className="toolbar-menu" role="menu" aria-label="推理等级">
            {capability.allowInherit && (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={!state.selectedModel?.reasoningEffort}
                onClick={() => action('toolbar-strength', '__inherit__')}
              >
                模型默认
                <span className="menu-check">
                  {!state.selectedModel?.reasoningEffort && <Check size={14} />}
                </span>
              </button>
            )}
            {capability.options.map((option) => (
              <button
                type="button"
                key={option.value}
                role="menuitemradio"
                aria-checked={option.value === state.selectedModel?.reasoningEffort}
                onClick={() => action('toolbar-strength', option.value)}
              >
                {option.label}
                <span className="menu-check">
                  {option.value === state.selectedModel?.reasoningEffort && <Check size={14} />}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="selector">
        <button
          type="button"
          className="toolbar-button"
          data-menu-trigger="scope"
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

/** The same transition is used by the embedded thread and both demo hosts. */
export function updateToolbar(
  state: ComposerToolbarState,
  action: string,
  value?: string,
): ComposerToolbarState {
  if (action === 'toolbar-scope') return { ...state, scope: value || '' }
  if (action === 'toolbar-refetch-models') return { ...state, modelsStatus: 'loaded' }
  if (action === 'toolbar-model') {
    const model = state.models.find((model) => modelKey(model) === value)
    return model ? { ...state, selectedModel: selectModel(model, state.selectedModel) } : state
  }
  if (action === 'toolbar-strength') {
    const capability = selectedModel(state.models, state.selectedModel)?.reasoning
    if (
      capability?.status === 'supported' &&
      (capability.options.some((option) => option.value === value) ||
        (value === '__inherit__' && capability.allowInherit)) &&
      state.selectedModel
    )
      return {
        ...state,
        selectedModel: {
          ...state.selectedModel,
          reasoningEffort: value === '__inherit__' ? undefined : value,
        },
      }
  }
  return state
}
