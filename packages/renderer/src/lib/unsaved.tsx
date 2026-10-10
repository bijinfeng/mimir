import { createContext, useContext, useRef, useState } from 'react'
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
  setSave: (save: (() => Promise<boolean>) | null) => void
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

  /**
   * 保存函数放 ref 而不是 state：它只是一个命令入口，
   * 变化时不该触发重新渲染（每次渲染都会产生新闭包）。
   */
  const saveRef = useRef<(() => Promise<boolean>) | null>(null)

  const setDirty = (dirty: boolean) => {
    setDirtyState(dirty)
  }

  const setSave = (save: (() => Promise<boolean>) | null) => {
    saveRef.current = save
  }

  const runGuarded = (action: () => void) => {
    if (!isDirty) {
      action()
      return
    }
    setPending({ action })
  }

  const resolve = (choice: 'cancel' | 'discard' | 'save') => {
    const current = pending
    setPending(null)
    if (!current || choice === 'cancel') return

    if (choice === 'discard') {
      setDirtyState(false)
      current.action()
      return
    }

    void (async () => {
      const save = saveRef.current
      const ok = save ? await save() : true
      if (!ok) {
        // 保存失败就不放行——放行了用户以为存上了，实际丢了，
        // 比不拦截更糟（.trellis/spec/project/product.md §5.9）
        setDirtyState(true)
        return
      }
      setDirtyState(false)
      current.action()
    })()
  }

  return (
    <UnsavedContext.Provider value={{ isDirty, setDirty, setSave, runGuarded, pending, resolve }}>
      {children}
    </UnsavedContext.Provider>
  )
}

export function useUnsaved(): UnsavedContextValue {
  const value = useContext(UnsavedContext)
  if (!value) throw new Error('useUnsaved 必须在 UnsavedProvider 内使用')
  return value
}
