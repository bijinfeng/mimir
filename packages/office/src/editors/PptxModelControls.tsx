import { useEffect, useMemo, useRef, useState } from 'react'
import type { ModelViewerElement } from '@google/model-viewer'
import { validatePptxGlb } from '../pptx-glb.js'
import {
  ToolbarButton,
  ToolbarFileButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
} from '../shell/EditorShell.js'
import { PptxControlPanel } from './PptxControlPanel.js'
import type { PptxUpload } from './PptxAssetControls.js'
interface LocalModel {
  file: File
  url: string
}
export function PptxModelControls({
  slide,
  upload,
  existing,
}: {
  slide: number
  upload: PptxUpload
  existing?: { bytes: Uint8Array; name: string }
}) {
  const host = useRef<HTMLDivElement>(null),
    viewer = useRef<ModelViewerElement | null>(null)
  const [selected, setSelected] = useState<LocalModel | null>(null),
    [ready, setReady] = useState(false),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    void import('@google/model-viewer')
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch(() => {
        if (!cancelled) setError('3D 预览器加载失败，请重新打开面板')
      })
    return () => {
      cancelled = true
    }
  }, [])
  const lifecycle = useRef({ mounted: true, pick: 0 })
  useEffect(() => {
    const current = lifecycle.current
    current.mounted = true
    return () => {
      current.mounted = false
      current.pick++
    }
  }, [])
  const existingIssue = useMemo(() => {
    if (!existing) return ''
    try {
      validatePptxGlb(existing.bytes)
      return ''
    } catch (cause) {
      return cause instanceof Error ? cause.message : '模型无效'
    }
  }, [existing])
  useEffect(() => {
    if (!ready || !host.current || existingIssue) return
    const element = document.createElement('model-viewer')
    element.setAttribute('camera-controls', '')
    element.setAttribute('interaction-prompt', 'none')
    element.setAttribute('loading', 'eager')
    element.setAttribute('alt', '本地 3D 模型，拖动旋转，滚轮缩放')
    element.className = 'mimir-pptx-model-preview'
    setLoaded(false)
    let url = selected?.url
    if (existing && !url) {
      url = URL.createObjectURL(
        new Blob([new Uint8Array(existing.bytes)], { type: 'model/gltf-binary' }),
      )
    }
    element.addEventListener('load', () => {
      setLoaded(true)
      setError('')
    })
    element.addEventListener('error', () => {
      setLoaded(false)
      setError('模型无法显示，可能不支持此格式或 WebGL 不可用。请尝试未压缩的 GLB。')
    })
    element.addEventListener('webglcontextlost', () => {
      setLoaded(false)
      setError('3D 图形上下文已丢失，请重新打开面板')
    })
    if (url) element.setAttribute('src', url)
    host.current.replaceChildren(element)
    viewer.current = element
    return () => {
      viewer.current = null
      element.remove()
      if (existing && !selected && url) URL.revokeObjectURL(url)
    }
  }, [ready, selected, existing, existingIssue])
  useEffect(
    () => () => {
      if (selected) URL.revokeObjectURL(selected.url)
    },
    [selected],
  )
  const choose = async (file: File) => {
    setLoaded(false)
    setError('')
    const pick = ++lifecycle.current.pick
    try {
      if (file.size < 28 || file.size > 32 * 1024 * 1024)
        throw new Error('GLB 文件须在 28 字节至 32 MiB 内')
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (!lifecycle.current.mounted || lifecycle.current.pick !== pick) return
      validatePptxGlb(bytes)
      setSelected({ file, url: URL.createObjectURL(file) })
    } catch (cause) {
      if (!lifecycle.current.mounted || lifecycle.current.pick !== pick) return
      setError(cause instanceof Error ? cause.message : '模型校验失败')
    }
  }
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label={existing ? '3D 模型预览' : '插入 3D 模型'}>
        {!existing && (
          <ToolbarFileButton label="选择 GLB 模型" accept=".glb,model/gltf-binary" onPick={choose}>
            {'选择 GLB 模型'}
          </ToolbarFileButton>
        )}
        {selected && (
          <ToolbarMenuNote>
            {selected.file.name} · {(selected.file.size / 1024 / 1024).toFixed(1)} MiB
          </ToolbarMenuNote>
        )}
        <div ref={host} />
        {!ready && !error && <ToolbarMenuNote>正在加载 3D 预览器…</ToolbarMenuNote>}
        <ToolbarMenuNote>
          拖动旋转，滚轮缩放。仅支持自包含、未压缩 GLB，最大 32 MiB。
        </ToolbarMenuNote>
      </ToolbarMenuFields>
      {(error || existingIssue) && <span role="alert">{error || existingIssue}</span>}
      <ToolbarMenuNote>保存模型附件和当前视角封面，不含 PowerPoint 交互式 3D。</ToolbarMenuNote>
      {!existing && (
        <div className="mimir-pptx-model-actions">
          <ToolbarButton
            primary
            label="插入模型与当前封面"
            disabled={!selected || !loaded || !ready || !!error}
            disabledReason={error || '先选择可预览的 GLB 模型'}
            onClick={() => {
              if (!selected || !viewer.current) return
              setBusy(true)
              void viewer.current
                .toBlob({ mimeType: 'image/png', idealAspect: true })
                .then((blob) => {
                  if (!lifecycle.current.mounted) return
                  return upload(
                    { kind: 'model3d', slide },
                    selected.file,
                    new File([blob], 'model-poster.png', { type: 'image/png' }),
                  )
                })
                .catch(
                  (cause: unknown) =>
                    lifecycle.current.mounted &&
                    setError(cause instanceof Error ? cause.message : '封面生成失败'),
                )
                .finally(() => {
                  if (lifecycle.current.mounted) setBusy(false)
                })
            }}
          />
        </div>
      )}
    </PptxControlPanel>
  )
}
