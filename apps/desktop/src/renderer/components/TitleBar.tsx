import type { TitleBarSlotProps } from '@mimir/renderer'
import { BrandMark } from '@mimir/renderer/titlebar-kit'
import { Tooltip } from 'antd'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useStyles } from '@/components/TitleBar.style'
import { WindowControls } from '@/components/WindowControls'
import { desktopBridge } from '@/lib/desktop-bridge'

/**
 * 自绘窗口标题栏（D-094，方案 A）。
 *
 * ## 它为什么住在桌面端而不是渲染层（D-103）
 *
 * 它是**载体**的一部分：整条是 `-webkit-app-region: drag`、三枚控件走
 * `window.mimirDesktop.window`，这些在浏览器里一件都不存在。放在渲染层
 * 就等于让共享代码里住着一块只有一个平台能用的东西，而「浏览器里它返回
 * null」这种判断散在共享代码里，下一个读的人不会知道它永远走哪一支。
 *
 * 现在它由桌面端注入渲染层的标题栏插槽（`renderTitleBar`），浏览器那侧
 * 的插槽直接给 null——界面上没有这一条，也不需要知道为什么。
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
 * 侧栏那条顶栏在桌面端**整块不再渲染**（`NavSidebar` 的 `hideTopBar`，
 * 由渲染层按插槽的 `isDesktopShell()` 决定）。
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
 *
 * ## props 由插槽契约给（`TitleBarSlotProps`）
 *
 * 三项都是必填，缺省由渲染层那边的调用点决定：登录页传
 * `showToggle: false`（那里没有侧栏可折叠，但窗口仍然需要拖动区与关闭
 * 按钮——`frame: false` 下没有它用户连窗口都关不掉）。
 */
export function TitleBar({ collapsed, onToggleCollapsed, showToggle }: TitleBarSlotProps) {
  const { styles } = useStyles()

  // 读一次就够：preload 在首帧之前注入，平台不会变（见 desktop-bridge.ts）
  const platform = desktopBridge?.window.platform
  if (!platform) return null

  return (
    <div className={styles.bar} data-platform={platform}>
      {/*
        左侧：品牌 + 折叠开关。**只放这两样**——「当前在哪个页面」由页面
        自己的头部负责，标题栏里再显示一遍是重复（而且它要知道文档标题，
        那是一次额外的请求）。
      */}
      <span className={styles.brand}>
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
        右侧控件。**macOS 下整组不渲染**（系统红绿灯在左上角）——那一判断
        在组件内部，这里不需要条件。选择页用的是同一个组件（D-103）。
      */}
      <WindowControls />
    </div>
  )
}
