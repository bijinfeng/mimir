import { Button, Input, Segmented } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PDF_IMAGE_ASPECT_RATIOS,
  type PdfAssetData,
  type PdfAssetReadiness,
  type PdfImageAspectRatio,
} from '@mimir/shared'
import type { PdfHostAssetPreview, PdfHostAssetReadiness } from '../agent/pdf-asset-agent.js'
import { ToolbarSelect } from '../shell/EditorShell.js'
import type { PdfPanelResult } from './PdfInspector.js'
import './pdf-external-images.css'

export type PdfImageSource = 'upload' | 'search' | 'generate'
export interface PdfExternalSelection {
  url: string
  title: string
}
export type PdfAssetAction = (
  tool: string,
  args: Record<string, unknown>,
  version?: number,
  signal?: AbortSignal,
) => Promise<(PdfPanelResult & { data?: unknown }) | undefined>

export function PdfExternalImageSource({
  source,
  onSource,
  getVersion,
  assetSessionId,
  readinessHost,
  previewHost,
  onSelection,
  onAction,
  busy,
  onSettings,
}: {
  source: PdfImageSource
  onSource(source: PdfImageSource): void
  getVersion(): number
  assetSessionId: string
  readinessHost?: PdfHostAssetReadiness
  previewHost?: PdfHostAssetPreview
  onSettings?(kind: 'search' | 'generate'): void
  onSelection(selection: PdfExternalSelection | null): void
  onAction: PdfAssetAction
  busy: boolean
}) {
  const [readiness, setReadiness] = useState<PdfAssetReadiness | null>(null)
  const [readinessError, setReadinessError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [prompt, setPrompt] = useState('')
  const [ratio, setRatio] = useState<PdfImageAspectRatio>('auto')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<PdfAssetData | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const readinessRequest = useRef<AbortController | null>(null)
  const readinessRef = useRef(readinessHost)
  useEffect(() => {
    readinessRef.current = readinessHost
  }, [readinessHost])
  const loadReadiness = useCallback(() => {
    readinessRequest.current?.abort()
    const controller = new AbortController()
    readinessRequest.current = controller
    const host = readinessRef.current
    if (host)
      void host(controller.signal).then(
        (result) => {
          if (!controller.signal.aborted) setReadiness(result)
        },
        (reason: unknown) => {
          if (!controller.signal.aborted)
            setReadinessError(
              reason instanceof Error ? reason.message : '无法读取图片服务配置，请重试',
            )
        },
      )
    return controller
  }, [])
  useEffect(() => {
    const controller = loadReadiness()
    return () => controller.abort()
  }, [loadReadiness])
  useEffect(
    () => () => {
      request.current?.abort()
      readinessRequest.current?.abort()
    },
    [],
  )
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )
  const run = async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setError(null)
    setData(null)
    setSelected(null)
    setPreview(null)
    onSelection(null)
    try {
      const result = await onAction(
        source === 'search' ? 'image_search' : 'generate_image',
        source === 'search' ? { query, max_results: 8 } : { prompt, aspect_ratio: ratio },
        getVersion(),
        controller.signal,
      )
      if (controller.signal.aborted) return
      if (!result?.ok) throw new Error(result?.error ?? '图片素材准备失败，请重试')
      const value = result.data as PdfAssetData
      setData(value)
      if ('url' in value) {
        if (!previewHost) throw new Error('图片预览宿主未连接')
        const blob = await previewHost({
          assetSessionId,
          url: value.url,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setPreview(URL.createObjectURL(blob))
        setSelected(value.url)
        onSelection({ url: value.url, title: '生成图片' })
      }
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(reason instanceof Error ? reason.message : '图片素材准备失败，请重试')
    } finally {
      if (request.current === controller) {
        request.current = null
        setPending(false)
      }
    }
  }
  const capability = readiness?.[source === 'search' ? 'image_search' : 'generate_image']
  return (
    <div className="mimir-pdf-image-source">
      <Segmented
        block
        aria-label="图片来源"
        value={source}
        options={[
          { value: 'upload', label: '上传' },
          { value: 'search', label: '搜索' },
          { value: 'generate', label: '生成' },
        ]}
        onChange={(value) => onSource(value as PdfImageSource)}
      />
      {source !== 'upload' && (
        <>
          {!capability?.available && (
            <div className="mimir-pdf-inspector__hint" role="status">
              {readinessError ??
                capability?.reason ??
                (readinessHost ? '正在检查图片服务配置…' : '图片服务宿主未连接')}
              {(readinessError || capability) && onSettings && (
                <Button size="small" type="link" onClick={() => onSettings(source)}>
                  前往设置
                </Button>
              )}
              {(readinessError || capability) && (
                <Button
                  size="small"
                  type="link"
                  onClick={() => {
                    setReadiness(null)
                    setReadinessError(null)
                    loadReadiness()
                  }}
                >
                  重新检查配置
                </Button>
              )}
            </div>
          )}
          {source === 'search' ? (
            <label className="mimir-pdf-inspector__control">
              <span>搜索图片</span>
              <Input
                aria-label="搜索PDF图片关键词"
                value={query}
                maxLength={500}
                placeholder="输入图片主题"
                disabled={pending || busy}
                onChange={(event) => setQuery(event.target.value)}
                onPressEnter={() => {
                  if (capability?.available && query.trim() && !pending && !busy) void run()
                }}
              />
            </label>
          ) : (
            <>
              <label className="mimir-pdf-inspector__control">
                <span>描述图片</span>
                <Input.TextArea
                  aria-label="PDF生成图片描述"
                  value={prompt}
                  maxLength={2000}
                  autoSize={{ minRows: 3, maxRows: 5 }}
                  placeholder="描述主体、场景和风格"
                  disabled={pending || busy}
                  onChange={(event) => setPrompt(event.target.value)}
                />
              </label>
              <label className="mimir-pdf-inspector__control">
                <span>图片比例</span>
                <ToolbarSelect
                  label="PDF生成图片比例"
                  value={ratio}
                  options={PDF_IMAGE_ASPECT_RATIOS.map((value) => ({
                    value,
                    label: value === 'auto' ? '自动' : value,
                  }))}
                  onChange={setRatio}
                  disabled={pending || busy}
                />
              </label>
              <p className="mimir-pdf-inspector__hint">
                按模型支持的尺寸生成，实际比例以结果宽高为准。生成后仍需插入或替换。
              </p>
            </>
          )}
          <div className="mimir-pdf-image-source__actions">
            <Button
              size="small"
              loading={pending}
              disabled={
                !capability?.available || busy || !(source === 'search' ? query : prompt).trim()
              }
              onClick={() => void run()}
            >
              {source === 'search' ? '搜索图片' : '生成图片'}
            </Button>
            {pending && (
              <Button
                size="small"
                onClick={() => {
                  request.current?.abort()
                  request.current = null
                  setPending(false)
                }}
              >
                取消
              </Button>
            )}
          </div>
          {error && (
            <p className="mimir-pdf-inspector__error" role="alert">
              {error}
            </p>
          )}
          {data &&
            'results' in data &&
            (data.results.length ? (
              <div
                className="mimir-pdf-image-source__results"
                role="group"
                aria-label="图片搜索结果"
              >
                {data.results.map(
                  (image, index) =>
                    image.imageUrl && (
                      <button
                        key={`${image.url}:${image.imageUrl}`}
                        type="button"
                        className="mimir-pdf-image-source__result"
                        aria-label={`选择图片：${image.title || `结果${index + 1}`}`}
                        aria-pressed={selected === image.imageUrl}
                        onClick={() => {
                          setSelected(image.imageUrl!)
                          onSelection({
                            url: image.imageUrl!,
                            title: image.title || `结果${index + 1}`,
                          })
                        }}
                      >
                        <img
                          src={image.imageUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          loading="lazy"
                        />
                        <span>{image.title || `结果${index + 1}`}</span>
                      </button>
                    ),
                )}
              </div>
            ) : (
              <p className="mimir-pdf-inspector__empty" role="status">
                没有找到图片，试试其他关键词。
              </p>
            ))}
          {data && 'url' in data && preview && (
            <figure className="mimir-pdf-image-source__preview">
              <img src={preview} alt="生成图片预览" />
              <figcaption>
                {data.width} × {data.height} px · 20 分钟内可用
              </figcaption>
            </figure>
          )}
          {selected && (
            <p className="mimir-pdf-inspector__hint" role="status">
              已选择素材；点击底部按钮后才会修改文档。
            </p>
          )}
        </>
      )}
    </div>
  )
}
