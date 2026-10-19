import { usePptxPicturePreview } from './use-pptx-picture-preview.js'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  PPTX_ASSET_MAX_BYTES,
  PPTX_PICTURE_ACCEPT,
  PPTX_PICTURE_FORMATS,
  type PptxManualUpload,
} from '@mimir/shared'
import type { PictureElement } from '../../vendor/packages/pptx-engine/src/types.js'
import { openPptxForEdit, type PptxEditSession } from '../pptx.js'
import { renderSlide } from '../pptx-render.js'
import {
  ToolbarButton,
  ToolbarFileButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import { PptxControlPanel } from './PptxControlPanel.js'

export type PptxUpload = (
  input: PptxManualUpload,
  file: File,
  poster?: File,
  signal?: AbortSignal,
) => Promise<boolean>
function assetNote(file: File) {
  return `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MiB`
}
export { PptxMediaControls } from './PptxMediaControls.js'

export function PptxImageFillControls({
  slide,
  elementId,
  upload,
}: {
  slide: number
  elementId: string | null
  upload: PptxUpload
}) {
  const { selected, choose, preparing, error } = usePptxPicturePreview()
  const pending = useRef(false)
  const [destination, setDestination] = useState(elementId ? 'shape' : 'background')
  const [mode, setMode] = useState('stretch')
  const [busy, setBusy] = useState(false)
  return (
    <fieldset
      className="mimir-pptx-control-panel mimir-pptx-image-fill"
      disabled={busy}
      aria-busy={busy}
      aria-label="图片填充设置"
    >
      <div className="mimir-pptx-image-fill__body">
        <ToolbarPropertyForm columns={1}>
          {busy && <p role="status">正在应用修改…</p>}
          <ToolbarMenuFields label="图片填充">
            <ToolbarSelect
              label="填充位置"
              disabled={busy}
              value={destination}
              options={[
                { value: 'shape', label: '所选形状或文本框' },
                { value: 'background', label: '当前幻灯片背景' },
              ]}
              onChange={setDestination}
            />
            <ToolbarFileButton
              label="选择填充图片"
              accept={PPTX_PICTURE_ACCEPT}
              onPick={(file) => {
                void choose(file)
              }}
            >
              选择图片
            </ToolbarFileButton>
            {selected && (
              <>
                <img className="mimir-pptx-asset-preview" src={selected.url} alt="所选填充图片" />
                <ToolbarMenuNote>{assetNote(selected.file)}</ToolbarMenuNote>
              </>
            )}
            {preparing && <ToolbarMenuNote>正在准备图片预览…</ToolbarMenuNote>}
            {error && <p role="alert">{error}</p>}
            {selected?.info.ext === 'tiff' && (
              <ToolbarMenuNote>TIFF 显示尺寸最大的安全页面，保存保留全部页面。</ToolbarMenuNote>
            )}
            <ToolbarSelect
              label="填充方式"
              disabled={busy}
              value={mode}
              options={[
                { value: 'stretch', label: '拉伸填满' },
                { value: 'tile', label: '平铺' },
              ]}
              onChange={setMode}
            />
            <ToolbarMenuNote>
              {PPTX_PICTURE_FORMATS}，不超过8 MiB。替换填充后仍可编辑形状文字和边框。
            </ToolbarMenuNote>
          </ToolbarMenuFields>
        </ToolbarPropertyForm>
      </div>
      <div className="mimir-pptx-image-fill__footer">
        <ToolbarButton
          primary
          label="应用图片填充"
          disabled={
            preparing ||
            !selected ||
            selected.file.size > 8 * 1024 * 1024 ||
            (destination === 'shape' && !elementId)
          }
          disabledReason={
            destination === 'shape' && !elementId
              ? '先选择形状或文本框'
              : '请选择不超过8 MiB的有效图片'
          }
          onClick={() => {
            if (!selected || pending.current) return
            pending.current = true
            setBusy(true)
            void upload(
              destination === 'shape'
                ? { kind: 'image_fill', slide, elementId: elementId!, tile: mode === 'tile' }
                : { kind: 'image_background', slide, tile: mode === 'tile' },
              selected.file,
            ).finally(() => {
              pending.current = false
              setBusy(false)
            })
          }}
        />
      </div>
    </fieldset>
  )
}

function pagesOf(value: string, count: number): number[] | null {
  const indices: number[] = []
  if (!value.trim()) return null
  for (const token of value.split(/[,，]/)) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(token)
    if (!match) return null
    const start = Number(match[1]),
      end = Number(match[2] ?? match[1])
    if (start < 1 || end < start || end > count || end - start > 40) return null
    for (let i = start; i <= end; i++) if (!indices.includes(i - 1)) indices.push(i - 1)
  }
  return indices.length && indices.length <= 40 ? indices : null
}
export function PptxImportControls({
  afterIndex,
  upload,
}: {
  afterIndex: number
  upload: PptxUpload
}) {
  const previewId = useId()
  const [source, setSource] = useState<{ file: File; session: PptxEditSession } | null>(null)
  const [pages, setPages] = useState('1')
  const [style, setStyle] = useState('destination')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const token = useRef(0)
  const pending = useRef(false)
  useEffect(
    () => () => {
      token.current++
    },
    [],
  )
  const indices = source ? pagesOf(pages, source.session.slides().length) : null
  const preview =
    source && indices
      ? renderSlide(source.session.view(), indices[0]!, { fitWidthPx: 300, svgIdPrefix: previewId })
          ?.svg
      : ''
  return (
    <PptxControlPanel
      busy={busy}
      actions={
        <ToolbarButton
          primary
          label="导入幻灯片"
          disabled={!source || !indices}
          disabledReason="请选择源文件并填写有效页码，例如1-3,5"
          onClick={() => {
            if (!source || !indices || pending.current) return
            pending.current = true
            setBusy(true)
            void upload(
              {
                kind: 'import_slides',
                afterIndex,
                slideIndices: indices,
                keepSourceFormatting: style === 'source',
              },
              source.file,
            ).finally(() => {
              pending.current = false
              setBusy(false)
            })
          }}
        />
      }
    >
      <ToolbarMenuFields label="源演示文稿">
        <ToolbarFileButton
          label="选择源PPTX文件"
          accept=".pptx"
          onPick={(file) => {
            const request = ++token.current
            setBusy(true)
            setError('')
            void (async () => {
              try {
                if (!file.size || file.size > PPTX_ASSET_MAX_BYTES)
                  throw new Error('源PPTX须为非空文件且不超过32 MiB')
                const session = await openPptxForEdit(new Uint8Array(await file.arrayBuffer()))
                if (token.current === request) {
                  setSource({ file, session })
                  setPages('1')
                }
              } catch (cause) {
                if (token.current === request) {
                  setSource(null)
                  setError(cause instanceof Error ? cause.message : '源文件无法打开')
                }
              } finally {
                if (token.current === request) setBusy(false)
              }
            })()
          }}
        >
          选择PPTX文件
        </ToolbarFileButton>
        {source && (
          <ToolbarMenuNote>
            {source.file.name} · 共{source.session.slides().length}页
          </ToolbarMenuNote>
        )}
        <ToolbarTextField
          label="导入页码"
          value={pages}
          onChange={setPages}
          placeholder="例如：1-3,5"
        />
        {preview && (
          <div
            className="mimir-pptx-asset-preview"
            role="img"
            aria-label="首张导入幻灯片预览"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        )}
        <ToolbarSelect
          label="导入格式"
          disabled={busy}
          value={style}
          options={[
            { value: 'destination', label: '使用目标主题' },
            { value: 'source', label: '保留源格式' },
          ]}
          onChange={setStyle}
        />
        <ToolbarMenuNote>
          在第{afterIndex + 1}
          页之后导入，最多40页。源文件须与当前文稿页面尺寸一致；失败时整批不应用。
        </ToolbarMenuNote>
        {error && <ToolbarMenuNote>{error}</ToolbarMenuNote>}
      </ToolbarMenuFields>
    </PptxControlPanel>
  )
}

export function PptxMediaPlayer({
  session,
  element,
  version,
}: {
  session: PptxEditSession
  element: PictureElement
  version: number
}) {
  const media = element.media
  const [error, setError] = useState('')
  const player = useRef<HTMLMediaElement | null>(null)
  const source = useMemo(() => {
    if (session.version() !== version) return null
    if (!media?.target || media.external) return null
    const bytes = session.mediaPart(media.target)
    if (!bytes || bytes.length > PPTX_ASSET_MAX_BYTES) return null
    const ext = media.target.split('.').at(-1)?.toLowerCase() ?? ''
    const mime = (
      {
        mp4: 'video/mp4',
        webm: 'video/webm',
        mov: 'video/mp4',
        m4v: 'video/mp4',
        avi: 'video/x-msvideo',
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        m4a: 'audio/mp4',
        ogg: 'audio/ogg',
        aac: 'audio/aac',
      } as Record<string, string>
    )[ext]
    if (!mime) return null
    let binary = ''
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
    return `data:${mime};base64,${btoa(binary)}`
  }, [session, media, version])
  useEffect(() => {
    if (!source) return
    const node = player.current
    return () => {
      node?.pause()
      node?.removeAttribute('src')
      node?.load()
    }
  }, [source])
  return (
    <PptxControlPanel busy={false}>
      <ToolbarMenuFields label={media?.kind === 'audio' ? '音频播放' : '视频播放'}>
        <ToolbarMenuNote>{element.name}</ToolbarMenuNote>
        {source ? (
          media?.kind === 'audio' ? (
            <audio
              className="mimir-pptx-media-preview"
              ref={(node) => {
                player.current = node
              }}
              key={source}
              src={source}
              controls
              onError={() => setError('浏览器不支持此音频编码，可下载原件后使用PowerPoint播放。')}
            />
          ) : (
            <video
              className="mimir-pptx-media-preview"
              ref={(node) => {
                player.current = node
              }}
              key={source}
              src={source}
              controls
              onError={() => setError('浏览器不支持此视频编码，可下载原件后使用PowerPoint播放。')}
            />
          )
        ) : (
          <ToolbarMenuNote>
            {media?.external
              ? '这是外链媒体，编辑器不会自动加载外部地址。'
              : '媒体缺失、编码暂不支持或超过32 MiB预览上限。原件内容保留。'}
          </ToolbarMenuNote>
        )}
        {error && <ToolbarMenuNote>{error}</ToolbarMenuNote>}
        <ToolbarMenuNote>播放不修改文稿。媒体以原生Office音视频结构保存在文件中。</ToolbarMenuNote>
      </ToolbarMenuFields>
    </PptxControlPanel>
  )
}
