export type DocxMediaKind = 'image' | 'audio' | 'video'
export type DocxMediaPayload = { mimeType: string; data: string }

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const AUDIO_TYPES = new Set(['audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg'])

function requireLive(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('媒体分析已停止')
}

async function fileBase64(file: Blob, signal: AbortSignal): Promise<string> {
  requireLive(signal)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const abort = () => reader.abort()
    signal.addEventListener('abort', abort, { once: true })
    reader.addEventListener(
      'load',
      () => {
        signal.removeEventListener('abort', abort)
        const dataUrl = reader.result
        if (typeof dataUrl !== 'string') reject(new Error('无法读取媒体文件'))
        else resolve(dataUrl.slice(dataUrl.indexOf(',') + 1))
      },
      { once: true },
    )
    reader.addEventListener(
      'error',
      () => {
        signal.removeEventListener('abort', abort)
        reject(reader.error ?? new Error('无法读取媒体文件'))
      },
      { once: true },
    )
    reader.addEventListener(
      'abort',
      () => {
        signal.removeEventListener('abort', abort)
        reject(new Error('媒体分析已停止'))
      },
      { once: true },
    )
    reader.readAsDataURL(file)
  })
}

function waitForVideo(
  video: HTMLVideoElement,
  event: 'loadedmetadata' | 'loadeddata' | 'seeked',
  signal: AbortSignal,
): Promise<void> {
  requireLive(signal)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('视频解码超时'))
    }, 10_000)
    const cleanup = () => {
      clearTimeout(timeout)
      video.removeEventListener(event, success)
      video.removeEventListener('error', failure)
      signal.removeEventListener('abort', abort)
    }
    const success = () => {
      cleanup()
      resolve()
    }
    const failure = () => {
      cleanup()
      reject(new Error('无法解码视频文件'))
    }
    const abort = () => {
      cleanup()
      reject(new Error('媒体分析已停止'))
    }
    video.addEventListener(event, success, { once: true })
    video.addEventListener('error', failure, { once: true })
    signal.addEventListener('abort', abort, { once: true })
  })
}

async function videoFrames(file: File, signal: AbortSignal): Promise<DocxMediaPayload[]> {
  const objectUrl = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  try {
    const loaded = waitForVideo(video, 'loadedmetadata', signal)
    video.src = objectUrl
    video.load()
    await loaded
    if (!Number.isFinite(video.duration) || video.duration <= 0)
      throw new Error('视频时长无效，无法抽帧')
    if (
      !Number.isFinite(video.videoWidth) ||
      !Number.isFinite(video.videoHeight) ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    )
      throw new Error('视频画面尺寸无效，无法抽帧')
    const scale = Math.min(1, 1280 / video.videoWidth, 720 / video.videoHeight)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法处理视频画面')
    const frames: DocxMediaPayload[] = []
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
      await waitForVideo(video, 'loadeddata', signal)
    const positions = [
      ...new Set(
        [0.1, 0.35, 0.65, 0.9].map(
          (ratio) =>
            Math.round(Math.max(0, Math.min(video.duration - 0.01, video.duration * ratio)) * 100) /
            100,
        ),
      ),
    ]
    for (const position of positions) {
      requireLive(signal)
      if (Math.abs(video.currentTime - position) > 0.001) {
        const seeked = waitForVideo(video, 'seeked', signal)
        video.currentTime = position
        await seeked
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const data = canvas.toDataURL('image/jpeg', 0.76).split(',')[1]
      if (!data) throw new Error('视频抽帧失败')
      if (data.length > 7_000_000) throw new Error('视频画面超过大小限制')
      frames.push({ mimeType: 'image/jpeg', data })
    }
    return frames
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(objectUrl)
  }
}

/** File selection happens in the chat UI; only bounded media bytes reach the server. */
export async function prepareDocxMedia(
  file: File,
  kind: DocxMediaKind,
  signal: AbortSignal,
): Promise<DocxMediaPayload[]> {
  requireLive(signal)
  if (kind === 'video') {
    if (!file.type.startsWith('video/') || file.size > 100 * 1024 * 1024)
      throw new Error('请选择不超过 100 MiB 的视频文件')
    return videoFrames(file, signal)
  }
  const allowed = kind === 'image' ? IMAGE_TYPES : AUDIO_TYPES
  const limit = kind === 'image' ? 5 * 1024 * 1024 : 10 * 1024 * 1024
  if (!allowed.has(file.type) || file.size === 0 || file.size > limit)
    throw new Error(
      kind === 'image'
        ? '请选择不超过 5 MiB 的 PNG、JPEG 或 WebP 图片'
        : '请选择不超过 10 MiB 的 WAV、MP3、M4A 或 Ogg 音频',
    )
  return [{ mimeType: file.type, data: await fileBase64(file, signal) }]
}
