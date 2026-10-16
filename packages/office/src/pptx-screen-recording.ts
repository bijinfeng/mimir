import { PPTX_ASSET_MAX_BYTES } from '@mimir/shared'

export type PptxRecordingPhase = 'idle' | 'requesting' | 'recording' | 'stopping'
const MIME_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
export function screenRecordingUnavailable(): string | undefined {
  if (!globalThis.navigator?.mediaDevices?.getDisplayMedia)
    return '当前浏览器不能录屏，请使用支持屏幕共享的浏览器和安全连接。'
  if (!globalThis.MediaRecorder)
    return '当前浏览器不支持视频录制，可先在系统中录制，再通过音视频工具插入。'
  if (!MIME_TYPES.some((mime) => MediaRecorder.isTypeSupported(mime)))
    return '当前浏览器不支持WebM录制，可通过音视频工具插入已有视频。'
  return undefined
}

/** Captures locally. Upload/insertion always requires a separate user action. */
export function createPptxScreenRecording(callbacks: {
  phase: (phase: PptxRecordingPhase) => void
  seconds: (seconds: number) => void
  complete: (file: File) => void
  error: (message: string) => void
}) {
  let disposed = false,
    pending = false
  let stream: MediaStream | undefined, recorder: MediaRecorder | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  const release = () => {
    if (timer) clearInterval(timer)
    timer = undefined
    stream?.getTracks().forEach((track) => track.stop())
    stream = undefined
  }
  const stop = () => {
    if (recorder && recorder.state !== 'inactive') {
      if (!disposed) callbacks.phase('stopping')
      recorder.stop()
    }
  }
  return {
    async start() {
      if (disposed || pending || recorder) return
      const reason = screenRecordingUnavailable()
      if (reason) {
        callbacks.error(reason)
        return
      }
      pending = true
      callbacks.phase('requesting')
      try {
        const captured = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
        if (disposed) {
          captured.getTracks().forEach((track) => track.stop())
          return
        }
        stream = captured
        const mimeType = MIME_TYPES.find((mime) => MediaRecorder.isTypeSupported(mime))!
        const active = new MediaRecorder(captured, { mimeType })
        recorder = active
        const chunks: Blob[] = []
        let size = 0,
          failure = ''
        active.ondataavailable = (event) => {
          if (!event.data.size || disposed) return
          size += event.data.size
          if (size > PPTX_ASSET_MAX_BYTES) {
            failure = '录屏超过32 MiB，已停止采集。请缩短录制时间后重试。'
            chunks.length = 0
            stop()
          } else if (!failure) chunks.push(event.data)
        }
        active.addEventListener(
          'error',
          () => {
            failure = '视频录制失败，请重新选择共享窗口后重试。'
            stop()
          },
          { once: true },
        )
        active.onstop = () => {
          recorder = undefined
          release()
          if (disposed) return
          callbacks.phase('idle')
          if (failure) {
            callbacks.error(failure)
            return
          }
          const blob = new Blob(chunks, { type: 'video/webm' })
          if (!blob.size) {
            callbacks.error('没有录到视频，请重新开始录制。')
            return
          }
          callbacks.complete(
            new File([blob], `screen-recording-${Date.now()}.webm`, { type: 'video/webm' }),
          )
        }
        captured
          .getVideoTracks()
          .forEach((track) => track.addEventListener('ended', stop, { once: true }))
        active.start(1000)
        const startedAt = Date.now()
        callbacks.seconds(0)
        callbacks.phase('recording')
        timer = setInterval(() => {
          const seconds = Math.floor((Date.now() - startedAt) / 1000)
          callbacks.seconds(seconds)
          if (seconds >= 600) stop()
        }, 1000)
      } catch (cause) {
        release()
        recorder = undefined
        if (disposed) return
        callbacks.phase('idle')
        callbacks.error(
          cause instanceof DOMException && cause.name === 'NotAllowedError'
            ? '已取消或未允许屏幕共享。可以重新开始，并在系统窗口中选择要录制的内容。'
            : '无法开始录屏，请检查屏幕录制权限后重试。',
        )
      } finally {
        pending = false
      }
    },
    stop,
    dispose() {
      disposed = true
      stop()
      release()
    },
  }
}
