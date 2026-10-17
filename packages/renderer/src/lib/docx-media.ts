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

async function videoFrames(
  file: File,
  signal: AbortSignal,
  maxDuration = Infinity,
): Promise<DocxMediaPayload[]> {
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
    if (video.duration > maxDuration)
      throw new Error(`视频最长${maxDuration}秒，请先截取需要分析的片段`)
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

/** Bounded speech proxy. The original stays on the user's device. */
export async function prepareVideoAudio(
  file: File,
  signal: AbortSignal,
): Promise<DocxMediaPayload> {
  requireLive(signal)
  if (typeof AudioContext === 'undefined') throw new Error('浏览器无法提取音轨，请单独选择音频文件')
  const context = new AudioContext()
  try {
    const bytes = await file.arrayBuffer()
    requireLive(signal)
    const audio = await new Promise<AudioBuffer>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout)
        signal.removeEventListener('abort', abort)
      }
      const abort = () => {
        cleanup()
        reject(new Error('媒体分析已停止'))
      }
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('音轨解码超过15秒'))
      }, 15_000)
      signal.addEventListener('abort', abort, { once: true })
      context.decodeAudioData(bytes).then(
        (decoded) => {
          cleanup()
          resolve(decoded)
        },
        (error: unknown) => {
          cleanup()
          reject(error)
        },
      )
    })
    requireLive(signal)
    if (
      !Number.isFinite(audio.duration) ||
      audio.duration <= 0 ||
      audio.duration > 120 ||
      audio.numberOfChannels < 1 ||
      audio.numberOfChannels > 8 ||
      audio.length * audio.numberOfChannels > 32_000_000
    )
      throw new Error('音轨时长或解码体积超过分析限制')
    const rate = 16000,
      count = Math.floor(audio.duration * rate)
    const wav = new ArrayBuffer(44 + count * 2),
      view = new DataView(wav)
    const tag = (at: number, value: string) => {
      for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i))
    }
    tag(0, 'RIFF')
    view.setUint32(4, wav.byteLength - 8, true)
    tag(8, 'WAVE')
    tag(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, rate, true)
    view.setUint32(28, rate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    tag(36, 'data')
    view.setUint32(40, count * 2, true)
    const channels = Array.from({ length: audio.numberOfChannels }, (_, channel) =>
      audio.getChannelData(channel),
    )
    for (let sample = 0; sample < count; sample++) {
      const at = Math.min(audio.length - 1, Math.floor((sample * audio.sampleRate) / rate))
      const value = channels.reduce((sum, channel) => sum + channel[at]!, 0) / channels.length
      view.setInt16(44 + sample * 2, Math.round(Math.max(-1, Math.min(1, value)) * 32767), true)
    }
    requireLive(signal)
    return {
      mimeType: 'audio/wav',
      data: await fileBase64(new Blob([wav], { type: 'audio/wav' }), signal),
    }
  } catch (error) {
    requireLive(signal)
    throw new Error(
      `无法提取视频音轨，请单独提供可解码音频：${error instanceof Error ? error.message : '未知格式'}`,
      { cause: error },
    )
  } finally {
    await context.close()
  }
}

export async function preparePptxVideo(
  file: File,
  includeAudio: boolean,
  signal: AbortSignal,
): Promise<{ media: DocxMediaPayload[]; audio?: DocxMediaPayload }> {
  requireLive(signal)
  if (!file.type.startsWith('video/') || !file.size || file.size > 32 * 1024 * 1024)
    throw new Error('请选择不超过32 MiB、120秒的原视频文件')
  const media = await videoFrames(file, signal, 120)
  const audio = includeAudio ? await prepareVideoAudio(file, signal) : undefined
  requireLive(signal)
  return { media, ...(audio ? { audio } : {}) }
}
