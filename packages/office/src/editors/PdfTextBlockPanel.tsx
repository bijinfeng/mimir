import { Move, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PdfPageTextBlock, PdfTextBlockTarget } from '@mimir/shared'
import type { PdfHostBlocks } from '../agent/pdf-content-agent.js'
import {
  ToolbarButton,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarToggleGroup,
} from '../shell/EditorShell.js'
import { PdfInspectorHeader, type PdfPanelResult } from './PdfInspector.js'
import { PdfTextBlockRewriteForm } from './PdfTextBlockRewriteForm.js'
import type { PdfTextBlock } from './pdf-text-blocks.js'
import './pdf-text-block-panel.css'

type Apply = (
  tool: string,
  args: Record<string, unknown>,
  version: number,
  signal: AbortSignal,
) => Promise<PdfPanelResult | undefined>

function BlockMoveForm({
  target,
  version,
  busy,
  onApply,
}: {
  target: PdfTextBlockTarget
  version: number
  busy: boolean
  onApply: Apply
}) {
  const [dx, setDx] = useState(0)
  const [dy, setDy] = useState(0)
  const [pending, setPending] = useState(false)
  const [numberFocused, setNumberFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const apply = async () => {
    if (request.current || busy || (!dx && !dy)) return
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setError(null)
    try {
      const result = await onApply(
        'move_text_block',
        {
          page: target.pageIndex + 1,
          target,
          dx,
          dy,
        },
        version,
        controller.signal,
      )
      if (!controller.signal.aborted && !result?.ok)
        setError(result?.error ?? '段落移动未完成，请重试')
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (request.current === controller) {
        request.current = null
        if (!controller.signal.aborted) setPending(false)
      }
    }
  }
  const blocked = busy || pending
  return (
    <>
      <div
        className="mimir-pdf-inspector__content"
        onFocusCapture={(event) =>
          setNumberFocused(
            event.target instanceof HTMLInputElement && !!event.target.closest('.me-input--num'),
          )
        }
        onBlurCapture={() => setNumberFocused(false)}
      >
        <div className="mimir-pdf-inspector__grid">
          <label className="mimir-pdf-inspector__control">
            <span>水平移动 · pt</span>
            <ToolbarNumberField
              label="段落水平偏移（pt）"
              value={dx}
              min={-10000}
              max={10000}
              disabled={blocked}
              onCommit={setDx}
            />
          </label>
          <label className="mimir-pdf-inspector__control">
            <span>垂直移动 · pt</span>
            <ToolbarNumberField
              label="段落垂直偏移（pt）"
              value={dy}
              min={-10000}
              max={10000}
              disabled={blocked}
              onCommit={setDy}
            />
          </label>
        </div>
        <p className="mimir-pdf-inspector__hint">
          正数向右、向下，负数向左、向上。整体移动原文对象，保留字体和字形，不重排其他内容。
        </p>
        {error && (
          <p className="mimir-pdf-inspector__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="mimir-pdf-text-block__actions">
        <ToolbarButton
          label="重置段落偏移"
          disabled={blocked || (!dx && !dy)}
          onClick={() => {
            setDx(0)
            setDy(0)
          }}
        >
          <RotateCcw size={16} />
          重置
        </ToolbarButton>
        <ToolbarButton
          label="应用段落移动"
          primary
          disabled={blocked || (!dx && !dy && !numberFocused)}
          disabledReason={blocked ? 'PDF 正在处理' : '先设置移动距离'}
          onClick={() => void apply()}
        >
          <Move size={16} />
        </ToolbarButton>
      </div>
    </>
  )
}

function BlockTools({
  target,
  block,
  version,
  getVersion,
  busy,
  onApply,
}: {
  target: PdfTextBlockTarget
  block?: PdfPageTextBlock
  version: number
  getVersion(): number
  busy: boolean
  onApply: Apply
}) {
  const [mode, setMode] = useState<'move' | 'rewrite' | 'replace'>('move')
  const canRewrite = block?.canRewrite === true && !!block.format
  return (
    <>
      <div className="mimir-pdf-text-block__modes">
        <ToolbarToggleGroup
          label="原文段落操作"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'move', label: '整体移动' },
            { value: 'rewrite', label: '整段改写', disabled: !canRewrite },
            { value: 'replace', label: '局部替换', disabled: !canRewrite },
          ]}
        />
        {!canRewrite && (
          <p className="mimir-pdf-inspector__hint">
            {block?.rewriteReason ?? '此段落尚未核验为可改写原文，可整体移动。'}
          </p>
        )}
      </div>
      {mode === 'move' || !block?.format ? (
        <BlockMoveForm target={target} version={version} busy={busy} onApply={onApply} />
      ) : (
        <PdfTextBlockRewriteForm
          key={mode}
          target={target}
          block={{ ...block, format: block.format }}
          partial={mode === 'replace'}
          version={version}
          getVersion={getVersion}
          busy={busy}
          onApply={onApply}
        />
      )}
    </>
  )
}

export function PdfTextBlockPanel({
  bytes,
  blocks,
  selected,
  getVersion,
  size,
  host,
  busy,
  ready,
  issue,
  onSelect,
  onApply,
  onClose,
}: {
  bytes: Uint8Array
  blocks: readonly PdfTextBlock[]
  selected: PdfTextBlock | null
  getVersion(): number
  size: { width: number; height: number }
  host: PdfHostBlocks
  busy: boolean
  ready: boolean
  issue?: string
  onSelect(block: PdfTextBlock): void
  onApply: Apply
  onClose(): void
}) {
  const [verified, setVerified] = useState<{
    bytes: Uint8Array
    block: PdfTextBlock
    version: number
    target?: PdfTextBlockTarget
    metadata?: PdfPageTextBlock
    error?: string
  } | null>(null)
  const result = verified?.bytes === bytes && verified.block === selected ? verified : null
  useEffect(() => {
    if (!selected || !ready) return
    const version = getVersion()
    const controller = new AbortController()
    void host({
      bytes,
      expectedVersion: version,
      operation: { op: 'inspect', probe: { pageIndex: selected.page, items: selected.items } },
      signal: controller.signal,
    })
      .then((response) => {
        if (controller.signal.aborted || getVersion() !== version) return
        if (response.bytes || response.version !== version || !response.target)
          throw new Error('原文段落核验结果无效')
        setVerified({
          bytes,
          block: selected,
          version,
          target: response.target,
          metadata: response.blocks.blocks.find(
            (block) =>
              block.blockIndex === response.target!.blockIndex &&
              block.page === response.target!.pageIndex + 1,
          ),
        })
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setVerified({
            bytes,
            block: selected,
            version,
            error: cause instanceof Error ? cause.message : String(cause),
          })
      })
    return () => controller.abort()
  }, [bytes, selected, getVersion, host, ready])
  return (
    <section className="mimir-pdf-panel" role="region" aria-label="原文段落编辑面板">
      <PdfInspectorHeader
        title="原文段落"
        detail={`${blocks.length} 个段落`}
        busy={busy || !selected || !ready}
        refreshLabel="重新核验段落"
        closeLabel="关闭原文段落面板"
        onRefresh={() => {
          if (selected) onSelect({ ...selected })
        }}
        onClose={onClose}
      />
      <div className="mimir-pdf-text-block__selection">
        <label className="mimir-pdf-inspector__control">
          <span>当前段落</span>
          <ToolbarSelect<string>
            label="选择原文段落"
            value={selected ? String(selected.blockIndex) : ''}
            disabled={busy || !ready}
            options={[
              {
                value: '',
                label: issue
                  ? '请先保存当前改动'
                  : ready
                    ? '在页面点选或从此处选择'
                    : '正在读取文字层…',
              },
              ...blocks.map((block) => ({
                value: String(block.blockIndex),
                label: `${block.blockIndex + 1}. ${block.text.replace(/\s+/g, ' ').slice(0, 48)}`,
              })),
            ]}
            onChange={(value) => {
              const block = blocks.find((item) => String(item.blockIndex) === value)
              if (block) onSelect(block)
            }}
          />
        </label>
        {selected && (
          <>
            <p className="mimir-pdf-text-block__excerpt">{selected.text}</p>
            <p className="mimir-pdf-inspector__meta">
              位置 {Math.round(selected.rect.x * size.width)}，
              {Math.round(selected.rect.y * size.height)} pt · {selected.items.length} 个文字项
            </p>
          </>
        )}
        <p
          className={result?.error ? 'mimir-pdf-inspector__error' : 'mimir-pdf-inspector__hint'}
          role={result?.error ? 'alert' : undefined}
        >
          {issue ??
            (selected
              ? (result?.error ?? (!result ? '正在核验原文对象…' : '原文对象已核验'))
              : ready && !blocks.length
                ? '本页没有可识别的文字段落。'
                : '点选页面中的原文段落，移动、改写或替换原文。')}
        </p>
      </div>
      {result?.target && !issue ? (
        <BlockTools
          key={`${result.target.sha256}:${result.version}:${result.target.blockIndex}`}
          target={result.target}
          version={result.version}
          block={result.metadata}
          getVersion={getVersion}
          busy={busy}
          onApply={onApply}
        />
      ) : (
        <div className="mimir-pdf-text-block__empty" />
      )}
    </section>
  )
}
