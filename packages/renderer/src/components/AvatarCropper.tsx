import { App, Modal } from 'antd'
import { createStyles } from 'antd-style'
import Cropper from 'cropperjs'
import { useEffect, useRef, useState } from 'react'
import { canvasToAvatar, type CroppedAvatar } from '../lib/avatar'

/**
 * 头像可视化裁切弹窗（cropperjs v2，`.trellis/spec/project/architecture.md` §12.6）。
 *
 * ## 流程
 *
 * 1. 用户在账号分区点头像 → 选文件
 * 2. 本弹窗打开，把选中的图片加载到 cropperjs
 * 3. 用户拖拽 / 缩放选区（强制正方形，aspectRatio = 1）
 * 4. 点「确定」→ `selection.$toCanvas({ width: 256, height: 256 })` 产出裁切 canvas
 *    → `canvasToAvatar()` 编码为 webp blob + 预览 URL
 * 5. `onConfirm(cropped)` 回传给调用方上传
 *
 * ## 为什么强制正方形
 *
 * 头像在界面上永远是圆形显示，方形是它的最小包围盒。允许非正方形选区会让
 * 服务端还要处理「拉伸 / 留黑边」这种情况，而用户也看不出区别——圆形裁掉
 * 了四个角。所以从源头锁死 1:1。
 *
 * ## cropperjs v2 初始化的时序坑
 *
 * cropperjs 构造函数会**同步读取** `element.src`（`dist/cropper.esm.js` 第 3581 行），
 * 然后把它设到内部 `<cropper-image>` 上，再把原始 `<img>` 设为 `display:none`。
 *
 * 所以必须保证：
 * 1. `<img>` 已挂载到 DOM
 * 2. `src` 已设置
 * 3. 然后再 `new Cropper(img)`
 *
 * ## blob URL 必须在 useEffect 中创建和撤销
 *
 * 不能用 `useState(() => URL.createObjectURL(file))` + `useEffect` 清理撤销：
 * React StrictMode 下，`useState` 的 lazy initializer **只执行一次**，但
 * `useEffect` 会经历「挂载 → 清理 → 重挂载」。清理时撤销了 blob URL，
 * 重挂载时 state 里还是那个已失效的 URL，图片加载失败（ERR_FILE_NOT_FOUND）。
 *
 * 把创建和撤销都放进 `useEffect`，StrictMode 的双调用就会正确地
 * 「创建 → 撤销 → 再创建」。
 *
 * 用 `useEffect`（而非 `useLayoutEffect`）是因为 Antd Modal 的内容渲染在
 * Portal 中，`useLayoutEffect` 执行时 img 可能还没挂载到真实 DOM
 * （`imgRef.current` 为 null）。`useEffect` 在浏览器绘制后执行，DOM 已就绪。
 */
export interface AvatarCropperProps {
  /** 待裁切的图片文件 */
  file: File
  /** 裁切确认后的结果（blob + 预览 URL） */
  onConfirm: (cropped: CroppedAvatar) => void
  /** 取消裁切 */
  onCancel: () => void
}

const useStyles = createStyles(({ css, token }) => ({
  /**
   * 裁切区容器。给一个固定高度让 cropperjs 有布局空间——
   * 不设高度的话 canvas 会坍缩成 0，用户看不到图。
   */
  cropperWrap: css`
    height: 360px;
    background: ${token.colorFillQuaternary};
    border-radius: ${token.borderRadius}px;
    overflow: hidden;
  `,
}))

/** 头像输出尺寸：256×256 正方形（`avatar.ts` 的 MAX_SIDE） */
const OUTPUT_SIZE = 256

/**
 * cropperjs v2 的默认 template，只改了 selection 的两个属性：
 * - `aspect-ratio="1"`：强制正方形选区
 * - `initial-coverage="0.8"`：初始选区占图片 80%（默认 50% 太小）
 *
 * 其它与 DEFAULT_TEMPLATE 完全一致——少改一点就少出一点问题。
 */
const CROPPER_TEMPLATE =
  '<cropper-canvas background>' +
  '<cropper-image rotatable scalable skewable translatable></cropper-image>' +
  '<cropper-shade hidden></cropper-shade>' +
  '<cropper-handle action="select" plain></cropper-handle>' +
  '<cropper-selection aspect-ratio="1" initial-coverage="0.8" movable resizable>' +
  '<cropper-grid role="grid" bordered covered></cropper-grid>' +
  '<cropper-crosshair centered></cropper-crosshair>' +
  '<cropper-handle action="move" theme-color="rgba(255, 255, 255, 0.35)"></cropper-handle>' +
  '<cropper-handle action="n-resize"></cropper-handle>' +
  '<cropper-handle action="e-resize"></cropper-handle>' +
  '<cropper-handle action="s-resize"></cropper-handle>' +
  '<cropper-handle action="w-resize"></cropper-handle>' +
  '<cropper-handle action="ne-resize"></cropper-handle>' +
  '<cropper-handle action="nw-resize"></cropper-handle>' +
  '<cropper-handle action="se-resize"></cropper-handle>' +
  '<cropper-handle action="sw-resize"></cropper-handle>' +
  '</cropper-selection>' +
  '</cropper-canvas>'

export function AvatarCropper({ file, onConfirm, onCancel }: AvatarCropperProps) {
  const { styles } = useStyles()
  const { message } = App.useApp()

  const cropperRef = useRef<Cropper | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const [submitting, setSubmitting] = useState(false)

  /**
   * 初始化 cropperjs。
   *
   * blob URL 的创建和撤销都在这里：StrictMode 下会「创建 → 撤销 → 再创建」，
   * 保证 img.src 始终指向一个有效的 blob URL。
   *
   * `img.src = objectUrl` 必须在 `new Cropper(img)` 之前——cropperjs 构造函数
   * 同步读取 `element.src`，src 必须在构造前就存在。
   *
   * 用 `setTimeout(0)` 延迟并轮询 img：Antd Modal 的内容渲染在 Portal 中，
   * `useEffect` 执行时 img 可能还没挂载到真实 DOM。延迟 + 轮询确保 DOM 就绪。
   *
   * 依赖 `[file]`：`file` 由父组件在弹窗打开时传入，生命周期内不变。
   */
  useEffect(() => {
    let cancelled = false

    const init = () => {
      if (cancelled) return
      const img = document.querySelector<HTMLImageElement>('img[alt="待裁切头像"]')
      if (!img) {
        // img 还没挂载，再等一帧
        setTimeout(init, 0)
        return
      }

      const objectUrl = URL.createObjectURL(file)
      img.src = objectUrl

      const cropper = new Cropper(img, { template: CROPPER_TEMPLATE })
      cropperRef.current = cropper

      // cropperjs 创建的 canvas 需要铺满容器
      const canvas = cropper.getCropperCanvas()
      if (canvas) {
        canvas.style.width = '100%'
        canvas.style.height = '100%'
      }

      // 保存清理函数
      cleanupRef.current = () => {
        cropper.destroy()
        cropperRef.current = null
        URL.revokeObjectURL(objectUrl)
      }
    }

    setTimeout(init, 0)

    return () => {
      cancelled = true
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [file])

  const handleConfirm = async () => {
    const cropper = cropperRef.current
    if (!cropper) return
    const selection = cropper.getCropperSelection()
    if (!selection) {
      message.error('裁切区域未就绪，请稍候')
      return
    }

    setSubmitting(true)
    try {
      // $toCanvas 返回 Promise<HTMLCanvasElement>，尺寸由 width/height 指定
      const canvas = await selection.$toCanvas({
        width: OUTPUT_SIZE,
        height: OUTPUT_SIZE,
      })
      const cropped = await canvasToAvatar(canvas)
      onConfirm(cropped)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '裁切失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="裁切头像"
      open
      onOk={handleConfirm}
      onCancel={onCancel}
      okText="确定"
      cancelText="取消"
      confirmLoading={submitting}
      destroyOnHidden
      width={520}
    >
      <div className={styles.cropperWrap}>
        {/*
          cropperjs 构造函数会把这个 img 设为 display:none，
          并在其后插入 cropper-canvas 结构。
          src 在 useEffect 中设置（blob URL 创建后立即赋值），
          保证 `new Cropper(img)` 读取 element.src 时已有值。
          img 通过 querySelector 查找（不用 ref），因为 Modal Portal
          在 useEffect 执行时可能还没挂载到 DOM。
        */}
        <img alt="待裁切头像" />
      </div>
    </Modal>
  )
}
