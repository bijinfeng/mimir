import { ChatHostVars } from '@mimir/chat'
import type { ReactNode } from 'react'
import { FONT_SIZE } from '../../theme/tokens'

/**
 * 把宿主的字号阶梯与栏宽比例填给对话包（`--mimir-chat-*`）。
 *
 * ## 为什么需要一个桥
 *
 * 对话包里的 `createStyles` 是**静态字符串**，读不到 React context，
 * 也读不到这个模块——CSS 自定义属性是唯一能跨包流动的通道。
 * 这与 `editor-theme-bridge.ts` 是同一件事（那边是 `--me-*`），
 * 只是这次值更少、只有两组：
 *
 *  - **字号八档**：`theme/tokens.ts` 的 `FONT_SIZE` 是**唯一**的字号来源，
 *    包里写死数字会让「同一角色在不同页面用不同值」重新长出来（那正是
 *    阶梯要消灭的，D-017）
 *  - **`--mimir-chat-gutter`**：窄栏传 16px，主视图默认 24px
 *
 * ## 只挂这一处
 *
 * 两个宿主都走这个组件（主视图与文档侧栏），值只有 `gutter` 一个差异
 * ——各挂一份必然会漂移，而漂移的表现是**静默**的（字号差半个像素）。
 *
 * 变量只在声明它的元素及其子树上生效，所以这个组件必须在面板的**祖先**上
 * （它同时也是一条布局链，见 `ChatHostVars` 的实现说明）。
 */
export function ChatThemeBridge({
  children,
  gutter = '24px',
}: {
  children: ReactNode
  /** 文档侧栏那种窄栏传 '16px'；主视图不传 */
  gutter?: string
}) {
  return (
    <ChatHostVars
      gutter={gutter}
      fontSize={{
        display: FONT_SIZE.display,
        body: FONT_SIZE.body,
        reading: FONT_SIZE.reading,
        item: FONT_SIZE.item,
        excerpt: FONT_SIZE.excerpt,
        note: FONT_SIZE.note,
        meta: FONT_SIZE.meta,
        badge: FONT_SIZE.badge,
        pageTitle: FONT_SIZE.pageTitle,
        section: FONT_SIZE.section,
      }}
    >
      {children}
    </ChatHostVars>
  )
}
