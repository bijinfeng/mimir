import { Check, ChevronDown, Library, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createStyles } from 'antd-style'
import type { ChatComposerStatus } from '../types.js'
import type { ChatModelSelection } from '@mimir/shared'
import { changeModel, effortLabel, modelKey, selectedModel } from '../runtime/model-settings.js'
export interface ContextDoc {
  id: string
  title: string
}
const useStyles = createStyles(({ css, token }) => ({
  root: css`
    position: relative;
    display: flex;
    flex: 1 1 180px;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    min-width: 0;
    @container mimir-composer (max-width: 560px) {
      flex: 1 1 0;
      flex-wrap: nowrap;
      gap: 2px;
    }
    button {
      font: inherit;
      cursor: pointer;
    }
    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
    button:focus-visible {
      outline: 2px solid ${token.focusRing ?? token.colorPrimaryBorder};
      outline-offset: 2px;
    }
  `,
  selector: css`
    min-width: 0;
    max-width: 100%;
    @container mimir-composer (max-width: 560px) {
      flex: 0 1 auto;
      &:first-child {
        flex: 1 1 0;
        min-width: 32px;
      }
      &:last-child {
        max-width: 100px;
      }
    }
  `,
  fullLabel: css`
    @container mimir-composer (max-width: 560px) {
      display: none;
    }
  `,
  compactLabel: css`
    display: none;
    @container mimir-composer (max-width: 560px) {
      display: inline;
    }
    @container mimir-composer (max-width: 340px) {
      &[data-scope] {
        display: none;
      }
    }
  `,
  shortestScope: css`
    display: none;
    @container mimir-composer (max-width: 340px) {
      display: inline;
    }
  `,
  trigger: css`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 140px;
    height: 30px;
    border: 0;
    background: transparent;
    color: ${token.colorTextSecondary};
    border-radius: 6px;
    padding: 0 7px;
    font-size: var(--mimir-chat-font-note, 12.5px) !important;
    > svg {
      flex: none;
    }
    @container mimir-composer (max-width: 560px) {
      width: 100%;
      max-width: 100%;
      gap: 3px;
      padding-inline: 3px;
    }
    @container mimir-composer (max-width: 300px) {
      &[data-setting='effort'] > svg:first-child {
        display: none;
      }
    }
    @media (pointer: coarse) {
      height: 40px;
    }
    &:hover:not(:disabled) {
      background: ${token.colorFillTertiary};
      color: ${token.colorText};
    }
    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  menu: css`
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    z-index: 50;
    width: 258px;
    min-width: 0;
    max-width: min(258px, calc(100vw - 48px));
    @container mimir-composer (max-width: 560px) {
      max-width: min(258px, calc(100cqi - 48px));
    }
    max-height: 340px;
    overflow: auto;
    background: ${token.colorBgElevated};
    color: ${token.colorText};
    border: 1px solid ${token.colorBorderSecondary};
    box-shadow: ${token.boxShadowSecondary};
    border-radius: 6px;
    padding: 6px;
    button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
      min-height: 32px;
      text-align: left;
      border: 0;
      background: transparent;
      border-radius: 4px;
      padding: 6px 9px;
      font-size: var(--mimir-chat-font-excerpt, 13px);
    }
    button:hover,
    button:focus-visible {
      background: ${token.colorFillTertiary};
    }
    button span:first-child {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    hr {
      border: 0;
      border-top: 1px solid ${token.colorBorderSecondary};
      margin: 5px 0;
    }
    p {
      margin: 8px;
      font-size: var(--mimir-chat-font-meta, 12px);
      color: ${token.colorTextSecondary};
    }
  `,
  provider: css`
    font-size: var(--mimir-chat-font-badge, 11.5px);
    color: ${token.colorTextTertiary};
    padding: 7px 9px 4px;
  `,
  usage: css`
    font-size: var(--mimir-chat-font-badge, 11.5px);
    color: ${token.colorTextTertiary};
    padding: 0 4px;
  `,
}))
export function ComposerMenus({
  status,
  selection,
  onSelection,
  documentId,
  onDocumentId,
  onManageModels,
}: {
  status: ChatComposerStatus
  selection: ChatModelSelection | undefined
  onSelection: (value: ChatModelSelection) => void
  documentId: string | null
  onDocumentId: (id: string | null) => void
  onManageModels: () => void
}) {
  const { styles } = useStyles()
  const [menu, setMenu] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const model = selectedModel(status.models?.catalog, selection)
  const reasoning = model?.reasoning
  const document = status.documents.items.find((item) => item.id === documentId)
  const close = () => {
    setMenu('')
    trigger.current?.focus()
  }
  useEffect(() => {
    if (!menu) return
    root.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')?.focus()
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setMenu('')
    }
    window.document.addEventListener('pointerdown', outside)
    return () => window.document.removeEventListener('pointerdown', outside)
  }, [menu])
  const toggle = (name: string, event: React.MouseEvent<HTMLButtonElement>) => {
    trigger.current = event.currentTarget
    setMenu(menu === name ? '' : name)
  }
  const pick = (action: () => void) => {
    action()
    close()
  }
  const fixed = reasoning?.status === 'supported' && reasoning.levels.length === 1
  const reasoningLabel = !model
    ? '未选模型'
    : reasoning?.status === 'unsupported'
      ? '不可调节'
      : reasoning?.status === 'unknown'
        ? '等级未知'
        : selection?.reasoningEffort
          ? effortLabel(selection.reasoningEffort)
          : '模型默认'
  const compactReasoningLabel = !model
    ? '未选'
    : reasoning?.status === 'unsupported'
      ? '不支持'
      : reasoning?.status === 'unknown'
        ? '未知'
        : selection?.reasoningEffort
          ? effortLabel(selection.reasoningEffort)
          : '默认'
  return (
    <div
      ref={root}
      className={styles.root}
      aria-label="本轮对话设置"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && menu) {
          event.preventDefault()
          event.stopPropagation()
          close()
        }
        if (menu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault()
          const nodes = [
            ...root.current!.querySelectorAll<HTMLButtonElement>(
              '[role^="menuitem"]:not(:disabled)',
            ),
          ]
          const index = nodes.indexOf(window.document.activeElement as HTMLButtonElement)
          nodes[
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? nodes.length - 1
                : (index + (event.key === 'ArrowUp' ? -1 : 1) + nodes.length) % nodes.length
          ]?.focus()
        }
      }}
    >
      <div className={styles.selector}>
        <button
          type="button"
          className={styles.trigger}
          aria-label={`当前模型：${model?.label ?? '选择模型'}`}
          title={model?.label ?? '选择模型'}
          aria-haspopup="menu"
          aria-expanded={menu === 'model'}
          onClick={(event) => toggle('model', event)}
        >
          <span title={model?.label}>{model?.label ?? '选择模型'}</span>
          <ChevronDown size={13} />
        </button>
        {menu === 'model' && (
          <div className={styles.menu} role="menu" aria-label="选择模型">
            {status.models?.isLoading ? (
              <p role="status">正在加载模型…</p>
            ) : status.models?.isError ? (
              <button type="button" role="menuitem" onClick={() => status.models?.refetch()}>
                模型读取失败，重试
              </button>
            ) : !status.models?.catalog?.providers.length ? (
              <p>还没有可用模型，请前往管理模型</p>
            ) : (
              status.models.catalog.providers.map((provider) => (
                <div key={provider.providerId} role="group" aria-label={provider.providerName}>
                  <div className={styles.provider}>{provider.providerName}</div>
                  {provider.models.map((option) => (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={!!selection && modelKey(option) === modelKey(selection)}
                      key={modelKey(option)}
                      onClick={() =>
                        pick(() =>
                          onSelection(
                            changeModel(
                              status.models?.catalog,
                              option.providerId,
                              option.modelId,
                              selection,
                            ),
                          ),
                        )
                      }
                    >
                      <span title={option.label}>{option.label}</span>
                      <span>
                        {selection && modelKey(option) === modelKey(selection) && (
                          <Check size={14} />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
            <hr />
            <button type="button" role="menuitem" onClick={() => pick(onManageModels)}>
              管理模型
            </button>
          </div>
        )}
      </div>
      <div className={styles.selector}>
        <button
          type="button"
          className={styles.trigger}
          data-setting="effort"
          disabled={reasoning?.status !== 'supported' || fixed}
          title={
            fixed
              ? '当前模型使用固定推理等级'
              : reasoning?.status === 'unknown'
                ? '尚未确认当前模型的推理等级'
                : reasoning?.status === 'unsupported'
                  ? '当前模型不支持调整推理等级'
                  : '按当前模型支持的等级调整'
          }
          aria-label={`推理等级：${selection?.reasoningEffort ? effortLabel(selection.reasoningEffort) : '模型默认'}`}
          aria-haspopup="menu"
          aria-expanded={menu === 'effort'}
          onClick={(event) => toggle('effort', event)}
        >
          <Zap size={14} />
          <span className={styles.fullLabel} aria-hidden>
            {reasoningLabel}
          </span>
          <span className={styles.compactLabel} aria-hidden>
            {compactReasoningLabel}
          </span>
          {reasoning?.status === 'supported' && !fixed && <ChevronDown size={13} />}
        </button>
        {menu === 'effort' && reasoning?.status === 'supported' && (
          <div className={styles.menu} role="menu" aria-label="推理等级">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!selection?.reasoningEffort}
              onClick={() =>
                pick(() => {
                  if (selection)
                    onSelection({ providerId: selection.providerId, modelId: selection.modelId })
                })
              }
            >
              模型默认{!selection?.reasoningEffort && <Check size={14} />}
            </button>
            {reasoning.levels.map((level) => (
              <button
                type="button"
                key={level}
                role="menuitemradio"
                aria-checked={selection?.reasoningEffort === level}
                onClick={() =>
                  pick(() => {
                    if (selection) onSelection({ ...selection, reasoningEffort: level })
                  })
                }
              >
                {effortLabel(level)}
                {selection?.reasoningEffort === level && <Check size={14} />}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={styles.selector}>
        <button
          type="button"
          className={styles.trigger}
          aria-label={`本轮检索范围：${document?.title ?? (documentId ? '当前文档' : '全部文档')}`}
          title={document?.title ?? (documentId ? '当前文档' : '全部文档')}
          aria-haspopup="menu"
          aria-expanded={menu === 'scope'}
          onClick={(event) => toggle('scope', event)}
        >
          <Library size={14} />
          <span className={styles.fullLabel} aria-hidden>
            {document?.title ?? (documentId ? '当前文档' : '全部文档')}
          </span>
          <span className={styles.compactLabel} data-scope="" aria-hidden>
            {documentId ? '当前文档' : '全部文档'}
          </span>
          <span className={styles.shortestScope} aria-hidden>
            {documentId ? '本篇' : '全部'}
          </span>
          <ChevronDown size={13} />
        </button>
        {menu === 'scope' && (
          <div className={styles.menu} role="menu" aria-label="本轮检索范围">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!documentId}
              onClick={() => pick(() => onDocumentId(null))}
            >
              全部文档{!documentId && <Check size={14} />}
            </button>
            <hr />
            {status.documents.isLoading ? (
              <p>加载中…</p>
            ) : status.documents.isError ? (
              <button type="button" role="menuitem" onClick={status.documents.refetch}>
                读取失败，点此重试
              </button>
            ) : !status.documents.items.length ? (
              <p>知识库还没有文档</p>
            ) : (
              status.documents.items.slice(0, 20).map((doc) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={doc.id === documentId}
                  key={doc.id}
                  onClick={() => pick(() => onDocumentId(doc.id))}
                >
                  <span title={doc.title}>{doc.title}</span>
                  {doc.id === documentId && <Check size={14} />}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
export function ContextUsageChip({ usage }: { usage: ChatComposerStatus['usage'] }) {
  const { styles } = useStyles()
  return usage?.promptTokens != null ? (
    <span className={styles.usage} title={`${usage.model} · 输入 ${usage.promptTokens} tokens`}>
      {usage.promptTokens.toLocaleString()} tokens
    </span>
  ) : null
}
