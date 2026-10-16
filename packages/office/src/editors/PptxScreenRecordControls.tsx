import { useEffect, useRef, useState } from 'react'
import {
  createPptxScreenRecording,
  screenRecordingUnavailable,
  type PptxRecordingPhase,
} from '../pptx-screen-recording.js'
import { ToolbarButton, ToolbarMenuFields, ToolbarMenuNote } from '../shell/EditorShell.js'
import { PptxControlPanel } from './PptxControlPanel.js'
import type { PptxUpload } from './PptxAssetControls.js'

export function PptxScreenRecordControls({ slide, upload }: { slide: number; upload: PptxUpload }) {
  const [phase, setPhase] = useState<PptxRecordingPhase>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const [recorded, setRecorded] = useState<{ file: File; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const recording = useRef<ReturnType<typeof createPptxScreenRecording> | null>(null)
  const pending = useRef(false)
  useEffect(() => {
    const controller = createPptxScreenRecording({
      phase: setPhase,
      seconds: setSeconds,
      error: setError,
      complete: (file) => setRecorded({ file, url: URL.createObjectURL(file) }),
    })
    recording.current = controller
    return () => {
      controller.dispose()
      recording.current = null
    }
  }, [])
  useEffect(
    () => () => {
      if (recorded) URL.revokeObjectURL(recorded.url)
    },
    [recorded],
  )
  const unavailable = screenRecordingUnavailable()
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="录制屏幕">
        <ToolbarMenuNote>
          选择一个窗口、标签页或屏幕，录制静音视频。停止后可先预览，再插入当前幻灯片。
        </ToolbarMenuNote>
        <p className="mimir-pptx-recording-status" role="status" aria-live="polite">
          {phase === 'requesting'
            ? '请在系统窗口选择共享内容…'
            : phase === 'recording'
              ? `正在录制 · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
              : phase === 'stopping'
                ? '正在生成预览…'
                : recorded
                  ? '录制完成，尚未插入'
                  : '准备录制'}
        </p>
        {phase === 'idle' && !recorded && (
          <ToolbarButton
            primary
            label="选择屏幕并开始"
            disabled={!!unavailable}
            disabledReason={unavailable}
            onClick={() => {
              setError('')
              void recording.current?.start()
            }}
          />
        )}
        {phase === 'recording' && (
          <ToolbarButton primary label="停止屏幕录制" onClick={() => recording.current?.stop()} />
        )}
        {recorded && (
          <>
            <video
              className="mimir-pptx-media-preview"
              src={recorded.url}
              controls
              preload="metadata"
              aria-label="录屏预览"
            />
            <ToolbarMenuNote>
              {(recorded.file.size / 1024 / 1024).toFixed(1)} MiB · 静音WebM
            </ToolbarMenuNote>
            <ToolbarButton
              label="放弃当前录屏"
              onClick={() => {
                setRecorded(null)
                setError('')
              }}
            >
              放弃并重新录制
            </ToolbarButton>
          </>
        )}
        {(error || unavailable) && <ToolbarMenuNote>{error || unavailable}</ToolbarMenuNote>}
        <ToolbarMenuNote>
          最长10分钟，不超过32 MiB。关闭面板会停止采集并释放本地预览。
        </ToolbarMenuNote>
      </ToolbarMenuFields>
      {recorded && (
        <div className="mimir-pptx-model-actions">
          <ToolbarButton
            primary
            label="将录屏插入幻灯片"
            disabled={busy}
            onClick={() => {
              if (pending.current) return
              pending.current = true
              setBusy(true)
              setError('')
              void upload({ kind: 'media', slide, mediaKind: 'video' }, recorded.file)
                .catch((cause) =>
                  setError(cause instanceof Error ? cause.message : '插入失败，可保留预览后重试'),
                )
                .finally(() => {
                  pending.current = false
                  setBusy(false)
                })
            }}
          />
        </div>
      )}
    </PptxControlPanel>
  )
}
