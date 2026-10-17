import { useEffect, useRef, useState } from 'react'
import { PPTX_ASSET_MAX_BYTES } from '@mimir/shared'
import { inspectPptxMedia, type PptxMediaInfo } from '../pptx-media-info.js'
import type { PptxUpload } from './PptxAssetControls.js'
import {
  ToolbarButton,
  ToolbarFileButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarPropertyForm,
  ToolbarSelect,
} from '../shell/EditorShell.js'

type Selection = { file: File; url: string; info: PptxMediaInfo }
/** Optional poster capture: bounded, cancellable, and independent of whether
 * the validated original media can be embedded unchanged. */
export function pptxVideoPoster(
  video: HTMLVideoElement | null,
  signal: AbortSignal,
): Promise<File | undefined> {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight || signal.aborted)
    return Promise.resolve(undefined)
  return new Promise((resolve) => {
    let settled = false
    const finish = (file?: File) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      resolve(file)
    }
    const abort = () => finish(),
      timer = setTimeout(() => finish(), 3000)
    signal.addEventListener('abort', abort, { once: true })
    try {
      const canvas = document.createElement('canvas'),
        ratio = Math.min(1, 1280 / video.videoWidth, 1280 / video.videoHeight)
      canvas.width = Math.max(1, Math.round(video.videoWidth * ratio))
      canvas.height = Math.max(1, Math.round(video.videoHeight * ratio))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        finish()
        return
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) =>
          finish(blob ? new File([blob], 'video-poster.png', { type: 'image/png' }) : undefined),
        'image/png',
      )
    } catch {
      finish()
    }
  })
}
export function PptxMediaControls(props: { slide: number; upload: PptxUpload }) {
  return <PptxMediaDraft key={props.slide} {...props} />
}
function PptxMediaDraft({ slide, upload }: { slide: number; upload: PptxUpload }) {
  const [kind, setKind] = useState<'video' | 'audio'>('video'),
    [selected, setSelected] = useState<Selection | null>(null)
  const [preparing, setPreparing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [warning, setWarning] = useState('')
  const epoch = useRef(0),
    pending = useRef<AbortController | null>(null),
    video = useRef<HTMLVideoElement>(null),
    audio = useRef<HTMLAudioElement>(null)
  useEffect(
    () => () => {
      epoch.current++
      pending.current?.abort()
    },
    [],
  )
  useEffect(
    () => () => {
      if (selected) URL.revokeObjectURL(selected.url)
    },
    [selected],
  )
  useEffect(() => {
    if (!selected) return
    const v = video.current,
      a = audio.current
    return () => {
      v?.pause()
      a?.pause()
    }
  }, [selected])
  const choose = async (file: File) => {
    const started = ++epoch.current
    pending.current?.abort()
    setSelected(null)
    setError('')
    setWarning('')
    setPreparing(true)
    try {
      if (!file.size || file.size > PPTX_ASSET_MAX_BYTES)
        throw new Error('请选择不超过32 MiB的非空音视频文件')
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (started !== epoch.current) return
      const info = inspectPptxMedia(bytes, file.name, file.type, kind)
      const url = URL.createObjectURL(new Blob([bytes], { type: info.previewMime }))
      setSelected({ file, url, info })
      setWarning(info.previewWarning ?? '')
    } catch (cause) {
      if (started === epoch.current)
        setError(cause instanceof Error ? cause.message : '媒体读取失败，请重新选择文件')
    } finally {
      if (started === epoch.current) setPreparing(false)
    }
  }
  const changeKind = (next: 'video' | 'audio') => {
    epoch.current++
    pending.current?.abort()
    setKind(next)
    setSelected(null)
    setPreparing(false)
    setError('')
    setWarning('')
  }
  const submit = async () => {
    if (!selected || preparing || pending.current) return
    const controller = new AbortController(),
      started = epoch.current
    pending.current = controller
    setBusy(true)
    setError('')
    try {
      const poster =
        kind === 'video' ? await pptxVideoPoster(video.current, controller.signal) : undefined
      if (controller.signal.aborted || started !== epoch.current) return
      const accepted = await upload(
        { kind: 'media', slide, mediaKind: kind },
        selected.file,
        poster,
        controller.signal,
      )
      if (!controller.signal.aborted && started === epoch.current && !accepted)
        setError('媒体未插入，原文稿已保留；请重试')
    } catch (cause) {
      if (!controller.signal.aborted && started === epoch.current)
        setError(cause instanceof Error ? cause.message : '媒体插入失败，请重试')
    } finally {
      if (pending.current === controller) {
        pending.current = null
        if (started === epoch.current) setBusy(false)
      }
    }
  }
  return (
    <fieldset
      className="mimir-pptx-media-insert"
      disabled={busy}
      aria-busy={busy || preparing}
      aria-label="本地音视频设置"
    >
      <div className="mimir-pptx-media-insert__body">
        <ToolbarPropertyForm columns={1}>
          <ToolbarMenuFields label="本地音视频">
            <ToolbarSelect
              label="媒体类型"
              disabled={busy}
              value={kind}
              options={[
                { value: 'video', label: '视频' },
                { value: 'audio', label: '音频' },
              ]}
              onChange={changeKind}
            />
            <ToolbarFileButton
              label="选择音视频文件"
              accept={kind === 'video' ? '.mp4,.webm,.mov,.m4v,.avi' : '.mp3,.wav,.ogg,.m4a,.aac'}
              onPick={(file) => {
                void choose(file)
              }}
            >
              选择文件
            </ToolbarFileButton>
            <ToolbarMenuNote>
              {kind === 'video'
                ? 'MP4、WebM、MOV、M4V、AVI，最多32 MiB。'
                : 'MP3、WAV、Ogg、M4A、AAC，最多32 MiB。'}
            </ToolbarMenuNote>
            {preparing && <p role="status">正在检查媒体文件…</p>}
            {selected && (
              <>
                <ToolbarMenuNote>
                  {selected.file.name} · {(selected.file.size / 1024 / 1024).toFixed(1)} MiB
                </ToolbarMenuNote>
                {kind === 'video' ? (
                  <video
                    key={selected.url}
                    className="mimir-pptx-media-preview"
                    ref={video}
                    src={selected.url}
                    controls
                    preload="metadata"
                    style={{
                      width: '100%',
                      maxWidth: `${220 * (selected.info.naturalSize ? selected.info.naturalSize.width / selected.info.naturalSize.height : 16 / 9)}px`,
                      marginInline: 'auto',
                      aspectRatio: selected.info.naturalSize
                        ? `${selected.info.naturalSize.width}/${selected.info.naturalSize.height}`
                        : '16/9',
                      height: 'auto',
                    }}
                    onError={() =>
                      setWarning(
                        '浏览器无法预览此编码；文件结构已验证，仍可插入原文件并使用默认封面。',
                      )
                    }
                  />
                ) : (
                  <audio
                    key={selected.url}
                    className="mimir-pptx-media-preview"
                    ref={audio}
                    src={selected.url}
                    controls
                    preload="metadata"
                    onError={() =>
                      setWarning('浏览器无法试听此编码；文件结构已验证，仍可插入原文件。')
                    }
                  />
                )}
                <ToolbarMenuNote>
                  {kind === 'audio'
                    ? '以64pt方形音频图标插入。'
                    : selected.info.naturalSize
                      ? `${selected.info.naturalSize.width} × ${selected.info.naturalSize.height}，按原比例居中插入。`
                      : '无法读取尺寸，将以16:9比例居中插入。'}
                </ToolbarMenuNote>
              </>
            )}
            {warning && <p role="status">{warning}</p>}
            {error && <p role="alert">{error}</p>}
            {busy && <p role="status">正在插入媒体…</p>}
          </ToolbarMenuFields>
        </ToolbarPropertyForm>
      </div>
      <div className="mimir-pptx-media-insert__footer">
        <ToolbarButton
          primary
          label="插入音视频"
          disabled={!selected || preparing || busy}
          disabledReason={preparing ? '正在检查文件' : error || '请先选择有效的音视频文件'}
          onClick={() => {
            void submit()
          }}
        />
      </div>
    </fieldset>
  )
}
