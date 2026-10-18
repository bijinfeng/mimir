import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * 未保存内容的拦截。
 *
 * `.trellis/spec/project/product.md` §5.9 要求离开未保存内容时给**三个**选项：
 * 继续编辑 / 丢弃改动 / 保存并离开。两选项（留下 / 丢弃）会把这个场景
 * 变成二选一的拷问，而用户真正想要的往往是第三种。
 *
 * 为什么需要跨组件：保存状态在编辑器里，但「离开」的触发点在左导航、
 * 中栏列表、命令面板——它们互相不认识。所以脏标记必须提到一个共同祖先，
 * 而不是靠编辑器往下传回调（那样每加一个导航入口都要改编辑器）。
 */

export interface PendingLeave {
  /** 用户想做的事。确认后执行它 */
  action: () => void
}

interface UnsavedContextValue {
  /** 当前是否有未保存的改动 */
  isDirty: boolean
  /** 由编辑器在挂载/状态变化时调用 */
  setDirty: (dirty: boolean) => void
  /** 提供一个「重新保存」的入口，供「保存并离开」调用 */
  setSave: (
    save: (() => Promise<boolean>) | null,
    mode?: 'auto' | 'manual',
    canSaveFromGuard?: boolean,
    editorId?: string,
  ) => void
  /** 自动保存笔记不能承诺丢弃已写入的版本 */
  saveMode: 'auto' | 'manual'
  canSave: boolean
  saving: boolean
  saveError: string | null
  /**
   * 执行一个可能被拦截的动作。
   *
   * 用法：`runGuarded(() => navigate(...))`。
   * 没有未保存内容时直接执行，不留任何中间态。
   */
  runGuarded: (action: () => void) => void
  /** 待确认的动作，由 Guard 组件消费 */
  pending: PendingLeave | null
  /** 三个选项的处理 */
  resolve: (choice: 'cancel' | 'discard' | 'save') => void
}

const UnsavedContext = createContext<UnsavedContextValue | null>(null)

export function UnsavedProvider({ children }: { children: ReactNode }) {
  const [isDirty, setDirtyState] = useState(false)
  const [pending, setPending] = useState<PendingLeave | null>(null)
  const [saveMode, setSaveMode] = useState<'auto' | 'manual'>('manual')
  const [saving, setSaving] = useState(false)
  const [canSave, setCanSave] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const canSaveRef = useRef(false)
  const changeVersion = useRef(0)
  const editorVersion = useRef(0)
  const editorIdRef = useRef<string | undefined>(undefined)
  const registrationVersion = useRef(0)
  const pendingRef = useRef<PendingLeave | null>(null)

  /**
   * 保存函数放 ref 而不是 state：它只是一个命令入口，
   * 变化时不该触发重新渲染（每次渲染都会产生新闭包）。
   */
  const saveRef = useRef<(() => Promise<boolean>) | null>(null)

  const setDirty = useCallback((dirty: boolean) => {
    if (dirty) changeVersion.current += 1
    dirtyRef.current = dirty
    setDirtyState(dirty)
  }, [])

  const setSave = useCallback(
    (
      save: (() => Promise<boolean>) | null,
      mode: 'auto' | 'manual' = 'manual',
      canSaveFromGuard = true,
      editorId?: string,
    ) => {
      const invalidateEditor = () => {
        editorVersion.current += 1
        pendingRef.current = null
        savingRef.current = false
        setPending(null)
        setSaving(false)
        setSaveError(null)
      }
      // React effect cleanup/setup may unregister and re-register the same
      // editor in one commit. Only a different document ID invalidates it.
      if (save && editorId !== undefined && editorId !== editorIdRef.current) {
        invalidateEditor()
        editorIdRef.current = editorId
      }
      registrationVersion.current += 1
      const registration = registrationVersion.current
      saveRef.current = save
      canSaveRef.current = Boolean(save) && canSaveFromGuard
      setCanSave(Boolean(save) && canSaveFromGuard)
      setSaveMode(save ? mode : 'manual')
      if (!save) {
        queueMicrotask(() => {
          if (saveRef.current || registrationVersion.current !== registration) return
          invalidateEditor()
          editorIdRef.current = undefined
        })
      }
    },
    [],
  )

  const runGuarded = (action: () => void) => {
    if (savingRef.current) return
    if (!dirtyRef.current) {
      action()
      return
    }
    setSaveError(null)
    const request = { action }
    pendingRef.current = request
    setPending(request)
  }

  const resolve = (choice: 'cancel' | 'discard' | 'save') => {
    const current = pendingRef.current
    if (!current || savingRef.current) return
    if (choice === 'cancel') {
      pendingRef.current = null
      setPending(null)
      setSaveError(null)
      return
    }

    if (choice === 'discard') {
      if (saveMode === 'auto') return
      pendingRef.current = null
      setPending(null)
      dirtyRef.current = false
      setDirtyState(false)
      current.action()
      return
    }

    if (!dirtyRef.current) {
      pendingRef.current = null
      setPending(null)
      current.action()
      return
    }

    if (!canSaveRef.current) {
      setSaveError('当前编辑器无法代为保存，请继续编辑并在工具栏中保存。')
      return
    }

    savingRef.current = true
    setSaving(true)
    setSaveError(null)
    const version = changeVersion.current
    const editor = editorVersion.current
    void (async () => {
      const save = saveRef.current
      try {
        const ok = save ? await save() : false
        if (editorVersion.current !== editor || pendingRef.current !== current) return
        if (!ok) {
          setSaveError('保存未完成，请重试或继续编辑。')
        } else if (dirtyRef.current && changeVersion.current !== version) {
          // A successful write of an older snapshot is not a successful flush.
          // Editors draining all newer changes report setDirty(false).
          setSaveError('保存期间又有新改动，请再次保存或继续编辑。')
        } else {
          dirtyRef.current = false
          setDirtyState(false)
          pendingRef.current = null
          setPending(null)
          current.action()
        }
      } catch (error) {
        // 保存失败就不放行——放行了用户以为存上了，实际丢了，
        // 比不拦截更糟（.trellis/spec/project/product.md §5.9）
        if (editorVersion.current === editor && pendingRef.current === current)
          setSaveError(error instanceof Error ? error.message : '保存失败，请重试。')
      } finally {
        if (editorVersion.current === editor) {
          savingRef.current = false
          setSaving(false)
        }
      }
    })()
  }

  return (
    <UnsavedContext.Provider
      value={{
        isDirty,
        setDirty,
        setSave,
        saveMode,
        canSave,
        saving,
        saveError,
        runGuarded,
        pending,
        resolve,
      }}
    >
      {children}
    </UnsavedContext.Provider>
  )
}

export function useUnsaved(): UnsavedContextValue {
  const value = useContext(UnsavedContext)
  if (!value) throw new Error('useUnsaved 必须在 UnsavedProvider 内使用')
  return value
}
