import { useEffect, useRef, useState } from 'react'
import type { PptxManualAsset } from '@mimir/shared'
import {
  ToolbarButton,
  ToolbarConfirm,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarTextArea,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import { PptxControlPanel } from './PptxControlPanel.js'
interface MasterElement {
  id: string
  name: string
  type: string
  text: string
  fill: string | null
  strokeColor: string | null
  strokeWidth: number
  box: { x: number; y: number; width: number; height: number; rotation: number }
}
interface MasterPart {
  partPath: string
  kind: 'master' | 'layout'
  name: string
  svg: string
  elements: MasterElement[]
}
export function PptxMasterControls({
  execute,
}: {
  execute: (input: PptxManualAsset) => Promise<Record<string, unknown> | null>
}) {
  const [parts, setParts] = useState<MasterPart[]>([]),
    [partPath, setPartPath] = useState(''),
    [elementId, setElementId] = useState(''),
    [busy, setBusy] = useState(false)
  const [text, setText] = useState(''),
    [color, setColor] = useState('#000000'),
    [strokeColor, setStrokeColor] = useState('#000000'),
    [strokeWidth, setStrokeWidth] = useState(1),
    [box, setBox] = useState({ x: 0, y: 0, width: 100, height: 100, rotation: 0 })
  const [message, setMessage] = useState('正在读取母版…')
  const executeRef = useRef(execute)
  useEffect(() => {
    executeRef.current = execute
  }, [execute])
  useEffect(() => {
    let cancelled = false
    void executeRef.current({ kind: 'master_parts' }).then((data) => {
      if (cancelled) return
      const items = data?.parts as MasterPart[] | undefined
      setParts(items ?? [])
      setPartPath(items?.[0]?.partPath ?? '')
      setMessage(items?.length ? '' : '此文件没有可编辑母版')
    })
    return () => {
      cancelled = true
    }
  }, [])
  const part = parts.find((item) => item.partPath === partPath),
    element = part?.elements.find((item) => item.id === elementId)
  const choose = (id: string) => {
    setElementId(id)
    const el = part?.elements.find((item) => item.id === id)
    if (el) {
      setText(el.text)
      setBox(el.box)
      setColor(el.fill ?? '#000000')
      setStrokeColor(el.strokeColor ?? '#000000')
      setStrokeWidth(el.strokeWidth)
    }
  }
  const apply = async (
    operation: Extract<PptxManualAsset, { kind: 'master_edit' }>['operation'],
  ) => {
    if (!part || !element) return
    setBusy(true)
    setMessage('')
    try {
      const data = await execute({
        kind: 'master_edit',
        part: part.partPath,
        elementId: element.id,
        operation,
      })
      if (data?.parts) {
        setParts(data.parts as MasterPart[])
        setMessage('已更新母版；使用此母版或版式的页面会同步变化')
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '母版修改失败，请重试')
    } finally {
      setBusy(false)
    }
  }
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="母版与版式">
        <ToolbarSelect
          label="编辑范围"
          disabled={busy}
          value={partPath}
          options={parts.map((item) => ({
            value: item.partPath,
            label: `${item.kind === 'master' ? '母版' : '版式'} · ${item.name}`,
          }))}
          onChange={(value) => {
            setPartPath(value)
            setElementId('')
          }}
        />
        {part?.svg && (
          <div
            className="mimir-pptx-asset-preview"
            aria-label="母版预览"
            dangerouslySetInnerHTML={{ __html: part.svg }}
          />
        )}
        <ToolbarSelect
          label="母版对象"
          disabled={busy}
          value={elementId}
          options={[
            { value: '', label: '请选择对象' },
            ...(part?.elements.map((item) => ({
              value: item.id,
              label: `${item.name} · ${item.type}`,
            })) ?? []),
          ]}
          onChange={choose}
        />
      </ToolbarMenuFields>
      {element && (
        <>
          <ToolbarMenuFields label="对象位置（磅）">
            {(['x', 'y', 'width', 'height', 'rotation'] as const).map((key) => (
              <ToolbarNumberField
                key={key}
                label={
                  {
                    x: '水平位置（磅）',
                    y: '垂直位置（磅）',
                    width: '宽度（磅）',
                    height: '高度（磅）',
                    rotation: '旋转（度）',
                  }[key]
                }
                value={box[key]}
                min={key === 'width' || key === 'height' ? 1 : -7200}
                max={7200}
                onCommit={(value) => setBox({ ...box, [key]: value })}
              />
            ))}
            <ToolbarButton
              label="应用母版位置"
              onClick={() => void apply({ action: 'transform', ...box })}
            >
              {'应用母版位置'}
            </ToolbarButton>
          </ToolbarMenuFields>
          {(element.type === 'text' || element.type === 'shape') && (
            <ToolbarMenuFields label="母版文字">
              <ToolbarTextArea label="对象文字" rows={3} value={text} onChange={setText} />
              <ToolbarButton
                label="应用母版文字"
                onClick={() => void apply({ action: 'text', text })}
              >
                {'应用母版文字'}
              </ToolbarButton>
            </ToolbarMenuFields>
          )}
          <ToolbarMenuFields label="对象外观">
            <ToolbarTextField label="填充色（#RRGGBB）" value={color} onChange={setColor} />
            <ToolbarMenuNote>当前填充：{element.fill ?? '无纯色填充'}</ToolbarMenuNote>
            <ToolbarTextField
              label="边框色（#RRGGBB）"
              value={strokeColor}
              onChange={setStrokeColor}
            />
            <ToolbarNumberField
              label="边框宽度（磅）"
              value={strokeWidth}
              min={0}
              max={100}
              onCommit={setStrokeWidth}
            />
            <div className="mimir-pptx-clipboard-actions">
              <ToolbarButton
                label="应用母版填充"
                disabled={!/^#[a-f\d]{6}$/i.test(color)}
                onClick={() => void apply({ action: 'fill', color })}
              >
                {'应用母版填充'}
              </ToolbarButton>
              <ToolbarButton
                label="无填充"
                onClick={() => void apply({ action: 'fill', color: 'none' })}
              >
                {'无填充'}
              </ToolbarButton>
              <ToolbarButton
                label="应用母版边框"
                disabled={!/^#[a-f\d]{6}$/i.test(strokeColor)}
                onClick={() =>
                  void apply({ action: 'stroke', color: strokeColor, widthPt: strokeWidth })
                }
              >
                {'应用母版边框'}
              </ToolbarButton>
            </div>
          </ToolbarMenuFields>
          <ToolbarConfirm
            confirmLabel="删除母版对象"
            title="删除此母版对象？"
            description="使用此母版或版式的页面都会受影响，可通过撤销恢复。"
            onConfirm={() => void apply({ action: 'delete' })}
          >
            <ToolbarButton label="删除母版对象">{'删除母版对象'}</ToolbarButton>
          </ToolbarConfirm>
        </>
      )}
      <ToolbarMenuNote>
        修改会影响所有使用此母版或版式的页面；不含单页覆盖的内容。通过顶部撤销恢复，通过保存写回原文件。
      </ToolbarMenuNote>
      {message && <span role="status">{message}</span>}
    </PptxControlPanel>
  )
}
