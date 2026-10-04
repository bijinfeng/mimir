import { useEffect, useState } from 'react'
import { Tooltip } from 'antd'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { desktopBridge } from '@/lib/desktop-shell'
import { useStyles as useNavStyles } from '@/components/NavSidebar.style'
import { useStyles } from '@/components/TitleBar.style'
import { BrandMark } from '@/components/BrandMark'

/**
 * 自绘窗口标题栏（D-094，方案 A）。
 *
 * ## 它只在桌面端渲染
 *
 * 浏览器里没有窗口可控制，画一条自己的标题栏等于复刻浏览器的标签栏——
 * 那三个按钮点了什么都不会发生（`desktopBridge` 是 undefined）。
 * 所以**整块不渲染**，Web 部署下界面与现在完全一样。
 *
 * ## 一条贯穿全宽的横条，下面才是「侧栏 + 主区」
 *
 * 它与侧栏/主区是**上下关系**，不是并排：这样它自己的宽度与窗口等宽，
 * 右端的控件贴住窗口右缘（最大化时贴屏幕角），中途不需要为侧栏的宽度
 * 做任何调整。
 *
 * ## 合并了侧栏原来的顶栏（净增高度为 0）
 *
 * 侧栏顶部原本有一条 44px 的「品牌 + 折叠按钮」行，而标题栏要做的是
 * 同一件事（显示品牌）——两条并排就是重复。合并之后：
 *
 * ```
 *   标题栏（44px）  ＝ 侧栏顶栏（44px）  ← 高度没有增加
 * ```
 *
 * 折叠按钮也跟着搬过来（与 VSCode / 语雀同一个位置：品牌旁边）；
 * 侧栏那条顶栏在桌面端**整块不再渲染**（`NavSidebar` 的 `hideTopBar`）。
 *
 * ## macOS：内容给红绿灯让位
 *
 * mac 上保留系统红绿灯（`titleBarStyle: 'hidden'`），它们画在左上角、
 * 压在标题栏上。所以标题栏的内容整体右移（`--titlebar-pad-left`）——
 * 这个值在样式里按平台给，不在这里判断。
 *
 * ## 拖动区与 no-drag（最容易静默出错的一处）
 *
 * 整条标题栏是 `-webkit-app-region: drag`，**里面每个可点的东西都要
 * 显式标 `no-drag`**——漏标的表现是「按钮点不动」，而且不报错、控制台
 * 也没有任何东西。现在的可点元素只有两个（折叠按钮、三枚窗口控件），
 * 但**以后往标题栏里加任何东西都要记得标**（这也是方案 C 被否掉的理由，
 * 见 demo 的对照表）。
 */
export interface TitleBarProps {
  /** 侧栏折叠状态。桌面端折叠按钮搬到这里了 */
  collapsed: boolean
  onToggleCollapsed: () => void
  /** 窄屏下折叠由视口决定，开关点了不会有变化——那时不渲染它 */
  showToggle: boolean
}

export function TitleBar({ collapsed, onToggleCollapsed, showToggle }: TitleBarProps) {
  const { styles } = useStyles()
  const { styles: navStyles } = useNavStyles()

  // 读一次就够：preload 在首帧之前注入，平台不会变（见 desktop-shell.ts）
  const platform = desktopBridge?.window.platform
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
  if (!api) return null

  return (
    <div className={styles.bar} data-platform={platform}>
      {/*
        左侧：品牌 + 折叠开关。**只放这两样**——「当前在哪个页面」由页面
        自己的头部负责，标题栏里再显示一遍是重复（而且它要知道文档标题，
        那是一次额外的请求）。
      */}
      <span className={`${navStyles.brandLockup} ${styles.brand}`}>
        <BrandMark size={18} title={null} />
        <b>mimir</b>
      </span>

      {showToggle ? (
        <Tooltip title={collapsed ? '展开侧边栏' : '折叠侧边栏'} placement="bottomLeft">
          <button
            type="button"
            className={`${styles.toggle} me-no-drag`}
            aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
            aria-expanded={!collapsed}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </Tooltip>
      ) : null}

      {/* 中间整块是拖动区（没有内容，正好用来拖窗口） */}
      <span className={styles.spacer} />

      {/*
        右侧控件：**只有 Windows / Linux 渲染**。macOS 的红绿灯由系统画在
        左上角，右边再来三枚就是两套控件（那正是 mac 上不该出现的东西）。
      */}
      {platform === 'darwin' ? null : (
        <WindowControls
          maximized={maximized}
          onMinimize={() => api.minimize()}
          onToggleMaximize={() => api.toggleMaximize()}
          onClose={() => api.close()}
        />
      )}
    </div>
  )
}

/**
 * 三枚窗口控件（Windows / Linux）。
 *
 * 尺寸（46×44）与 Windows 11 一致：46 是那个平台上「三枚控件挤在右上角」
 * 的通行宽度，44 与标题栏等高（命中区铺满整条，不是一个小方块）。
 *
 * **关闭按钮的 hover 是红底白字**——那是 Windows 的约定，也是唯一一处
 * 用危险色而**不需要**确认的地方：它是系统级动作，用户按下之前就已经知道
 * 会发生什么（而且系统菜单里还有「关闭窗口」同一个动作）。
 */
function WindowControls({
  maximized,
  onMinimize,
  onToggleMaximize,
  onClose,
}: {
  maximized: boolean
  onMinimize: () => void
  onToggleMaximize: () => void
  onClose: () => void
}) {
  const { styles } = useStyles()

  return (
    <div className={styles.controls}>
      <button
        type="button"
        className={`${styles.ctl} me-no-drag`}
        aria-label="最小化"
        title="最小化"
        onClick={onMinimize}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        type="button"
        className={`${styles.ctl} me-no-drag`}
        aria-label={maximized ? '向下还原' : '最大化'}
        title={maximized ? '向下还原' : '最大化'}
        onClick={onToggleMaximize}
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
      <button
        type="button"
        className={`${styles.ctl} ${styles.ctlClose} me-no-drag`}
        aria-label="关闭"
        title="关闭"
        onClick={onClose}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  )
}
