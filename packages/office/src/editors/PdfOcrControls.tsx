import { Button, Progress, Radio } from 'antd'
import { Copy, ScanText, Square, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { PdfInspectorHeader } from './PdfInspector.js'
import type { PdfOcrState } from './use-pdf-ocr.js'
import './pdf-ocr.css'

export function PdfOcrControls({
  state,
  activePage,
  currentText,
  blocked,
  onStart,
  onStop,
  onClear,
  onClose,
  onSelect,
}: {
  state: PdfOcrState
  activePage: number
  currentText: string
  blocked?: string
  onStart(scope: 'current' | 'scanned'): void
  onStop(): void
  onClear(): void
  onClose(): void
  onSelect(): void
}) {
  const [scope, setScope] = useState<'current' | 'scanned'>('current')
  const [copyStatus, setCopyStatus] = useState('')
  return (
    <div className="mimir-pdf-panel mimir-pdf-ocr-panel">
      <PdfInspectorHeader
        title="识别扫描文字"
        detail="本地临时 OCR · 简体中文与英文"
        busy={state.running}
        refreshLabel="清除识别结果"
        closeLabel="关闭扫描文字识别"
        onRefresh={onClear}
        onClose={onClose}
      />
      <div className="mimir-pdf-inspector__content">
        <p className="mimir-pdf-inspector__hint">
          识别结果仅供本次打开时复制与查找，可能有误。不会写回 PDF 或知识库。
        </p>
        <div className="mimir-pdf-inspector__control">
          <span>识别范围</span>
          <Radio.Group
            aria-label="识别范围"
            value={scope}
            disabled={state.running}
            onChange={(event) => setScope(event.target.value)}
            className="mimir-pdf-ocr-scope"
          >
            <Radio value="current">当前第 {activePage + 1} 页</Radio>
            <Radio value="scanned">从当前页起顺序识别扫描页</Radio>
          </Radio.Group>
        </div>
        <p className="mimir-pdf-inspector__hint">
          每次最多 50 页、10 分钟；单页最长边 2048 像素。原生文字页会跳过。
        </p>
        {state.running && (
          <div role="status" aria-live="polite">
            <p>
              {state.status} · {state.done}/{state.total} 页
            </p>
            <Progress
              percent={Math.round(((state.done + state.progress) / Math.max(1, state.total)) * 100)}
              size="small"
            />
          </div>
        )}
        {!state.running && state.status && (
          <p className="mimir-pdf-inspector__hint" role="status">
            {state.status}
          </p>
        )}
        {currentText ? (
          <div className="mimir-pdf-inspector__control">
            <span>当前页临时文字</span>
            <pre className="mimir-pdf-ocr-preview">{currentText}</pre>
            <div className="mimir-pdf-ocr-actions">
              <Button
                icon={<Copy size={14} />}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(currentText)
                    setCopyStatus('已复制当前页识别文字')
                  } catch {
                    setCopyStatus('无法访问剪贴板，请选择下方文字后复制')
                  }
                }}
              >
                复制文字
              </Button>
              <Button onClick={onSelect}>在页面上选字</Button>
            </div>
            {copyStatus && (
              <span role="status" className="mimir-pdf-inspector__hint">
                {copyStatus}
              </span>
            )}
          </div>
        ) : (
          !state.running && <p className="mimir-pdf-inspector__empty">当前页尚无临时识别文字。</p>
        )}
        {state.results.length > 0 && (
          <Button icon={<Trash2 size={14} />} disabled={state.running} onClick={onClear}>
            清除临时结果（{state.results.length} 页）
          </Button>
        )}
      </div>
      <footer className="mimir-pdf-inspector__footer">
        {(state.error || blocked) && (
          <p role="alert" className="mimir-pdf-inspector__hint">
            {state.error || blocked}
          </p>
        )}
        {state.running ? (
          <Button type="primary" icon={<Square size={14} />} onClick={onStop}>
            停止识别
          </Button>
        ) : (
          <Button
            type="primary"
            icon={<ScanText size={16} />}
            disabled={!!blocked}
            onClick={() => onStart(scope)}
          >
            {state.error ? '重试识别' : '开始本地识别'}
          </Button>
        )}
      </footer>
    </div>
  )
}
