import { useRef, useState } from 'react'
import { pptxManualAssetSchema, type PptxManualAsset } from '@mimir/shared'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarSelect,
} from '../shell/EditorShell.js'
import { PptxControlPanel } from './PptxControlPanel.js'

type Clip = { ref: string; kind: 'elements' | 'slide'; count: number }
const STORAGE_KEY = 'mimir.pptx.internal-clipboard'
function readClip(): Clip | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as Clip | null
    if (value?.kind === 'elements' || value?.kind === 'slide') {
      pptxManualAssetSchema.parse(
        value.kind === 'elements'
          ? { kind: 'paste_elements', slide: 0, ref: value.ref }
          : { kind: 'paste_slide', afterIndex: 0, ref: value.ref },
      )
      return value
    }
  } catch {
    /* A stale or edited reference is simply unavailable. */
  }
  return null
}
export function PptxClipboardControls({
  slide,
  elementId,
  slideCount,
  execute,
}: {
  slide: number
  elementId: string | null
  slideCount: number
  execute: (input: PptxManualAsset) => Promise<Record<string, unknown> | null>
}) {
  const [kind, setKind] = useState(elementId ? 'element' : 'slide')
  const [clip, setClip] = useState(readClip)
  const [sourceStyle, setSourceStyle] = useState('destination')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [message, setMessage] = useState('')
  const run = async (input: PptxManualAsset) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try {
      const data = await execute(input)
      if (!data) return
      if (typeof data.ref === 'string' && (data.kind === 'elements' || data.kind === 'slide')) {
        const value: Clip = { ref: data.ref, kind: data.kind, count: Number(data.count) }
        setClip(value)
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
        } catch {
          /* In-memory copy remains usable. */
        }
        setMessage(
          input.kind.startsWith('cut') ? '已剪切，可粘贴到其他位置' : '已复制，可粘贴到其他位置',
        )
      } else setMessage('已粘贴，格式和关联资源已保留')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  const noSelection = kind === 'element' && !elementId
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="复制与剪切">
        <ToolbarSelect
          label="复制内容"
          value={kind}
          options={[
            { value: 'element', label: '所选对象' },
            { value: 'slide', label: `当前幻灯片（第${slide + 1}页）` },
          ]}
          onChange={setKind}
        />
        {noSelection && <ToolbarMenuNote>先在画布上选择要复制的对象。</ToolbarMenuNote>}
        <div className="mimir-pptx-clipboard-actions">
          <ToolbarButton
            label={kind === 'element' ? '复制对象' : '复制幻灯片'}
            disabled={noSelection}
            disabledReason="先选择一个对象"
            onClick={() =>
              void run(
                kind === 'element'
                  ? { kind: 'copy_elements', slide, elementIds: [elementId!] }
                  : { kind: 'copy_slide', slide },
              )
            }
          >
            复制
          </ToolbarButton>
          <ToolbarButton
            label={kind === 'element' ? '剪切对象' : '剪切幻灯片'}
            disabled={noSelection || (kind === 'slide' && slideCount <= 1)}
            disabledReason={noSelection ? '先选择一个对象' : '至少保留一张幻灯片，最后一页可复制'}
            onClick={() =>
              void run(
                kind === 'element'
                  ? { kind: 'cut_elements', slide, elementIds: [elementId!] }
                  : { kind: 'cut_slide', slide },
              )
            }
          >
            剪切
          </ToolbarButton>
        </div>
      </ToolbarMenuFields>
      <ToolbarMenuFields label="粘贴">
        <ToolbarMenuNote>
          {clip
            ? clip.kind === 'slide'
              ? '已复制1张幻灯片，将插在当前页之后。'
              : `已复制${clip.count}个对象，将粘贴到当前页并稍微错开。`
            : '尚未复制内容。'}
        </ToolbarMenuNote>
        {clip?.kind === 'slide' && (
          <ToolbarSelect
            label="粘贴格式"
            value={sourceStyle}
            options={[
              { value: 'destination', label: '使用目标主题' },
              { value: 'source', label: '保留源格式' },
            ]}
            onChange={setSourceStyle}
          />
        )}
        <ToolbarButton
          primary
          label={clip?.kind === 'slide' ? '粘贴幻灯片' : '粘贴对象'}
          disabled={!clip}
          disabledReason="先复制对象或幻灯片"
          onClick={() => {
            if (clip)
              void run(
                clip.kind === 'slide'
                  ? {
                      kind: 'paste_slide',
                      afterIndex: slide,
                      ref: clip.ref,
                      keepSourceFormatting: sourceStyle === 'source',
                    }
                  : { kind: 'paste_elements', slide, ref: clip.ref, dx: 190500, dy: 190500 },
              )
          }}
        />
        <ToolbarMenuNote>
          适用于本窗口内的 Mimir 演示文稿，有效15分钟。系统文字剪贴板保留原用法。
        </ToolbarMenuNote>
        {message && <span role="status">{message}</span>}
      </ToolbarMenuFields>
    </PptxControlPanel>
  )
}
