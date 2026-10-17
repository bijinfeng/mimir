import { Button, Input } from 'antd'
import { ImagePlus, RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { PdfSignatureSource, PdfVisualSignature } from '@mimir/shared'
import { importedSignature, SIGNATURE_FONTS, typedSignature } from './pdf-signature.js'
import './pdf-signature.css'

type Point = [number, number]
const signaturePadPoint = (e: PointerEvent<HTMLCanvasElement>): Point => {
  const r = e.currentTarget.getBoundingClientRect()
  return [
    Math.max(0, Math.min(560, ((e.clientX - r.left) * 560) / r.width)),
    Math.max(0, Math.min(280, ((e.clientY - r.top) * 280) / r.height)),
  ]
}
export function PdfSignaturePanel({
  busy,
  ready,
  signatures,
  error,
  onPrepare,
  onSelect,
  onDelete,
  onClose,
}: {
  busy: boolean
  ready: boolean
  signatures: PdfVisualSignature[]
  error: string | null
  onPrepare(source: PdfSignatureSource): void
  onSelect(signature: PdfVisualSignature): void
  onDelete(signature: PdfVisualSignature): void
  onClose(): void
}) {
  const [mode, setMode] = useState<'ink' | 'type' | 'image'>('ink'),
    [color, setColor] = useState('#111111'),
    [text, setText] = useState(''),
    [font, setFont] = useState(0)
  const [strokes, setStrokes] = useState<Point[][]>([]),
    [image, setImage] = useState<PdfSignatureSource | null>(null),
    [mono, setMono] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [issue, setIssue] = useState<string | null>(null),
    [loading, setLoading] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null),
    input = useRef<HTMLInputElement>(null),
    generation = useRef(0),
    gesture = useRef<{ id: number; points: Point[] } | null>(null)
  useEffect(
    () => () => {
      generation.current++
      gesture.current = null
    },
    [],
  )
  useEffect(() => {
    if (mode !== 'ink') return
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext('2d')
    if (!ctx) return
    const ratio = Math.max(1, window.devicePixelRatio || 1)
    el.width = Math.round((el.clientWidth || 280) * ratio)
    el.height = Math.round(el.width / 2)
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.setTransform(el.width / 560, 0, 0, el.height / 280, 0, 0)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3
    ctx.strokeStyle = color
    for (const path of strokes) {
      ctx.beginPath()
      path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.stroke()
    }
  }, [strokes, color, mode])
  const changeMode = (next: typeof mode) => {
    generation.current++
    setLoading(false)
    setIssue(null)
    gesture.current = null
    setMode(next)
  }
  const decode = async (next: File, black: boolean) => {
    const token = ++generation.current
    setLoading(true)
    setIssue(null)
    setImage(null)
    try {
      const source = await importedSignature(next, black)
      if (token === generation.current) setImage(source)
    } catch (e) {
      if (token === generation.current) setIssue(e instanceof Error ? e.message : String(e))
    } finally {
      if (token === generation.current) setLoading(false)
    }
  }
  const prepare = async () => {
    if (busy || loading || !ready) return
    const token = ++generation.current
    setLoading(true)
    setIssue(null)
    try {
      let source: PdfSignatureSource
      if (mode === 'ink') {
        const points = strokes.flat()
        if (!points.length) throw new Error('请先写下签名')
        const left = Math.min(...points.map((p) => p[0])) - 4,
          top = Math.min(...points.map((p) => p[1])) - 4,
          right = Math.max(...points.map((p) => p[0])) + 4,
          bottom = Math.max(...points.map((p) => p[1])) + 4
        source = {
          kind: 'ink',
          width: right - left,
          height: bottom - top,
          color,
          thickness: 3,
          strokes: strokes.map((path) => path.map(([x, y]) => [x - left, y - top])),
        }
      } else if (mode === 'type') source = await typedSignature(text, font, color)
      else {
        if (!image) throw new Error('请先选择签名图片')
        source = image
      }
      if (token === generation.current) onPrepare(source)
    } catch (e) {
      if (token === generation.current) setIssue(e instanceof Error ? e.message : String(e))
    } finally {
      if (token === generation.current) setLoading(false)
    }
  }
  return (
    <section className="mimir-pdf-panel mimir-pdf-signature-panel" aria-label="签名与印章面板">
      <header className="mimir-pdf-inspector__header">
        <div>
          <h2>签名与印章</h2>
          <span className="mimir-pdf-inspector__meta">视觉签名，不包含数字证书</span>
        </div>
        <Button type="text" icon={<X size={16} />} aria-label="关闭签名面板" onClick={onClose} />
      </header>
      <div className="mimir-pdf-inspector__content mimir-pdf-signature-panel__body">
        <div className="mimir-pdf-signature-tabs" role="tablist" aria-label="签名方式">
          {(['ink', 'type', 'image'] as const).map((m, i) => (
            <button
              type="button"
              role="tab"
              aria-selected={mode === m}
              key={m}
              disabled={busy}
              onClick={() => changeMode(m)}
            >
              {['手写', '输入', '图片'][i]}
            </button>
          ))}
        </div>
        {mode === 'ink' ? (
          <>
            <canvas
              ref={canvas}
              width={560}
              height={280}
              className="mimir-pdf-signature-pad"
              aria-label="手写签名区域"
              onPointerDown={(e) => {
                if (busy || loading || gesture.current || e.button !== 0 || e.isPrimary === false)
                  return
                if (strokes.length >= 64) {
                  setIssue('最多 64 笔，请撤销部分笔画')
                  return
                }
                e.preventDefault()
                e.currentTarget.setPointerCapture?.(e.pointerId)
                gesture.current = { id: e.pointerId, points: [signaturePadPoint(e)] }
              }}
              onPointerMove={(e) => {
                const g = gesture.current
                if (!g || g.id !== e.pointerId) return
                const p = signaturePadPoint(e),
                  last = g.points.at(-1)!
                if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2) return
                if (strokes.flat().length + g.points.length >= 2000) {
                  setIssue('签名累计最多 2000 点')
                  return
                }
                g.points.push(p)
                const ctx = e.currentTarget.getContext('2d')
                if (ctx) {
                  ctx.strokeStyle = color
                  ctx.lineWidth = 3
                  ctx.lineCap = 'round'
                  ctx.beginPath()
                  ctx.moveTo(...last)
                  ctx.lineTo(...p)
                  ctx.stroke()
                }
              }}
              onPointerUp={(e) => {
                const g = gesture.current
                if (!g || g.id !== e.pointerId) return
                gesture.current = null
                if (g.points.length > 1) setStrokes((s) => [...s, g.points])
                else setStrokes((s) => [...s])
              }}
              onPointerCancel={() => {
                gesture.current = null
                setStrokes((s) => [...s])
              }}
            />
            <div className="mimir-pdf-signature-row">
              <span className="mimir-pdf-inspector__meta">
                {strokes.length ? `${strokes.length} 笔` : '在上方写下签名'}
              </span>
              <Button
                type="text"
                icon={<RotateCcw size={14} />}
                disabled={busy || !strokes.length}
                onClick={() => setStrokes((s) => s.slice(0, -1))}
              >
                撤销上笔
              </Button>
              <Button
                type="text"
                icon={<Trash2 size={14} />}
                disabled={busy || !strokes.length}
                onClick={() => setStrokes([])}
              >
                清空
              </Button>
            </div>
          </>
        ) : mode === 'type' ? (
          <>
            <label className="mimir-pdf-inspector__control">
              <span>姓名</span>
              <Input
                aria-label="签名姓名"
                maxLength={100}
                value={text}
                disabled={busy}
                onChange={(e) => {
                  generation.current++
                  setLoading(false)
                  setText(e.target.value)
                }}
              />
            </label>
            <div className="mimir-pdf-signature-fonts" role="group" aria-label="签名字体">
              {SIGNATURE_FONTS.map((f, i) => (
                <button
                  type="button"
                  key={f.label}
                  aria-pressed={font === i}
                  disabled={busy}
                  onClick={() => {
                    generation.current++
                    setLoading(false)
                    setFont(i)
                  }}
                >
                  <span
                    style={{
                      fontFamily: f.family,
                      fontStyle: f.italic ? 'italic' : 'normal',
                      color,
                    }}
                  >
                    {text.trim() || '张三 Li'}
                  </span>
                  <small>{f.label}</small>
                </button>
              ))}
            </div>
            <p className="mimir-pdf-inspector__meta">使用本机可用字体，预览字样将作为图片落纸。</p>
          </>
        ) : (
          <>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg"
              hidden
              onChange={(e) => {
                const next = e.target.files?.[0]
                e.target.value = ''
                if (next) {
                  setFile(next)
                  void decode(next, mono)
                }
              }}
            />
            <Button
              icon={<ImagePlus size={15} />}
              disabled={busy || loading}
              onClick={() => input.current?.click()}
            >
              选择签名图片
            </Button>
            {image?.kind === 'stamp' && (
              <img
                className="mimir-pdf-signature-preview"
                src={`data:image/png;base64,${image.png}`}
                alt="签名图片预览"
              />
            )}
            <div className="mimir-pdf-signature-tabs" role="group" aria-label="图片处理">
              {[false, true].map((v, i) => (
                <button
                  key={String(v)}
                  type="button"
                  aria-pressed={mono === v}
                  disabled={busy || loading}
                  onClick={() => {
                    setMono(v)
                    if (file) void decode(file, v)
                  }}
                >
                  {['保留原色', '黑白去浅底'][i]}
                </button>
              ))}
            </div>
            <p className="mimir-pdf-inspector__meta">
              PNG / JPEG，最大 8 MiB。图片仅在此文档中使用。
            </p>
          </>
        )}
        {mode !== 'image' && (
          <label className="mimir-pdf-signature-color">
            <span>颜色</span>
            <input
              type="color"
              aria-label="签名颜色"
              value={color}
              disabled={busy}
              onChange={(e) => {
                generation.current++
                setLoading(false)
                setColor(e.target.value)
              }}
            />
          </label>
        )}
        {!!signatures.length && (
          <div className="mimir-pdf-signature-existing">
            <h3>本页签名</h3>
            {signatures.map((s, i) => (
              <div key={s.id}>
                <Button disabled={busy || !ready} onClick={() => onSelect(s)}>
                  调整{s.kind === 'ink' ? '手写' : '图片'}签名 {i + 1}
                </Button>
                <Button
                  type="text"
                  danger
                  icon={<Trash2 size={14} />}
                  aria-label={`删除签名 ${i + 1}`}
                  disabled={busy}
                  onClick={() => onDelete(s)}
                />
              </div>
            ))}
          </div>
        )}
        {(issue || error) && (
          <p role="alert" className="mimir-pdf-inspector__error">
            {issue || error}
          </p>
        )}
      </div>
      <footer className="mimir-pdf-inspector__footer">
        <Button
          type="primary"
          block
          loading={loading}
          disabled={
            busy ||
            !ready ||
            (mode === 'ink' ? !strokes.length : mode === 'type' ? !text.trim() : !image)
          }
          onClick={() => void prepare()}
        >
          准备放置
        </Button>
      </footer>
    </section>
  )
}
