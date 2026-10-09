import { useEffect, useState } from 'react'
import { useStyles } from '@/components/WindowControls.style'
import { desktopBridge } from '@/lib/desktop-bridge'

/**
 * 三枚窗口控件（Windows / Linux）。
 *
 * 尺寸（46×44）与 Windows 11 一致：46 是那个平台上「三枚控件挤在右上角」
 * 的通行宽度，44 与标题栏等高（命中区铺满整条，不是一个小方块）。
 *
 * **macOS 整组不渲染**：那边的红绿灯由系统画在左上角，右边再来三枚就是
 * 两套控件（那正是 mac 上不该出现的东西）。
 *
 * **关闭按钮的 hover 是红底白字**——那是 Windows 的约定，也是唯一一处
 * 用危险色而**不需要**确认的地方：它是系统级动作，用户按下之前就已经知道
 * 会发生什么（而且系统菜单里还有「关闭窗口」同一个动作）。
 *
 * ## 为什么是独立组件（D-103）
 *
 * 两处用它：主界面的标题栏、以及首启选择页。选择页原先是一份自包含的静态
 * HTML，自己抄了一套控件（两枚，连样式一起）——那份拷贝与这里必然漂移，
 * 而漂移是静默的（尺寸差几像素、hover 色不一样，单看一处都「像是对的」）。
 */
export interface WindowControlsProps {
  /**
   * 不渲染哪几枚。
   *
   * 选择页传 `['maximize']`：那一页是一次性的选择，撑满屏幕没有意义。
   */
  omit?: readonly ('minimize' | 'maximize' | 'close')[]
}

/** 默认值提到模块级：行内 `[]` 每次渲染都是新引用，破坏引用相等 */
const OMIT_NONE: readonly ('minimize' | 'maximize' | 'close')[] = []

export function WindowControls({ omit = OMIT_NONE }: WindowControlsProps) {
  const { styles } = useStyles()
  const [maximized, setMaximized] = useState(false)

  /**
   * 最大化状态**订阅宿主**，不自己算。
   *
   * 它能由按钮、双击标题栏、系统快捷键、Windows 贴靠四条路改变——
   * 页面自己维护的布尔值必然有一天与真相脱节（症状是「最大化之后按钮
   * 还是『最大化』的图标」，而那看起来像按钮坏了）。
   */
  useEffect(() => {
    const api = desktopBridge?.window
    if (!api) return

    let alive = true
    void api.isMaximized().then((value) => {
      if (alive) setMaximized(value)
    })
    const unsubscribe = api.onMaximizeChange(setMaximized)

    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const api = desktopBridge?.window
  // macOS 用系统红绿灯；没有桥（理论上不该发生）时也不画
  if (!api || api.platform === 'darwin') return null

  const show = (which: 'minimize' | 'maximize' | 'close') => !omit.includes(which)

  return (
    <div className={styles.controls}>
      {show('minimize') && (
        <button
          type="button"
          className={`${styles.ctl} me-no-drag`}
          aria-label="最小化"
          title="最小化"
          onClick={() => api.minimize()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      )}

      {show('maximize') && (
        <button
          type="button"
          className={`${styles.ctl} me-no-drag`}
          aria-label={maximized ? '向下还原' : '最大化'}
          title={maximized ? '向下还原' : '最大化'}
          onClick={() => api.toggleMaximize()}
        >
          {maximized ? (
            /* 「还原」是两格叠角：Windows 与 macOS 都这么画 */
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" />
              <path d="M2.5 2.5V0.5h7v7h-2" fill="none" stroke="currentColor" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
            </svg>
          )}
        </button>
      )}

      {show('close') && (
        <button
          type="button"
          className={`${styles.ctl} ${styles.ctlClose} me-no-drag`}
          aria-label="关闭"
          title="关闭"
          onClick={() => api.close()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      )}
    </div>
  )
}
