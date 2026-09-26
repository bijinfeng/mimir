/**
 * 工具条的图标。
 *
 * ## 为什么自己画 SVG，而不是从宿主要
 *
 * 图标是**编辑器的一部分**：加粗按钮长什么样，属于「这类编辑器怎么用」，
 * 而不是「mimir 的界面长什么样」。放在这里，四种编辑器自动一致，
 * 而这个包也不依赖任何图标库。
 *
 * 宿主仍然可以往工具条里塞自己的东西（比如「⋯」菜单、下载按钮）——
 * 那些是应用动作，不是编辑动作。
 *
 * ## 规格
 *
 * 24 的 viewBox、`currentColor` 描边、`stroke-width: 2`、无固定宽高
 * （由 `.me-btn__icon` 的字号决定大小）。这样它们在按钮里与文字基线对齐，
 * 并且跟着按钮的 `color` 走——按下态变主色时图标一起变，不需要第二处样式。
 */

import type { ReactNode } from 'react'

/** 所有图标的共同外壳。`aria-hidden`：按钮自己有 label，念两遍是噪音 */
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function BoldIcon() {
  return (
    <Svg>
      <path d="M7 5h6.5a3.5 3.5 0 0 1 0 7H7z" />
      <path d="M7 12h7.5a3.5 3.5 0 0 1 0 7H7z" />
    </Svg>
  )
}

export function ItalicIcon() {
  return (
    <Svg>
      <path d="M15 5h-5M14 19H9M14.5 5 9.5 19" />
    </Svg>
  )
}

export function UnderlineIcon() {
  return (
    <Svg>
      <path d="M7 4v6.5a5 5 0 0 0 10 0V4M5 20h14" />
    </Svg>
  )
}

export function StrikeIcon() {
  return (
    <Svg>
      <path d="M4 12h16" />
      <path d="M17 7.5C16.3 5.9 14.4 5 12 5 9 5 7 6.4 7 8.4c0 1.3.8 2.4 2.4 3.1" />
      <path d="M8.5 16.2c.7 1.7 2.2 2.8 4.3 2.8 2.6 0 4.4-1.4 4.4-3.4 0-1.1-.5-2-1.5-2.6" />
    </Svg>
  )
}

export function BulletListIcon() {
  return (
    <Svg>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function OrderedListIcon() {
  return (
    <Svg>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="M4 5.5 5.5 5v4M4 10.7h1.6a1 1 0 0 1 0 2.1H4l2 2.2" />
    </Svg>
  )
}

export function SaveIcon() {
  return (
    <Svg>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M9 4v5h6V4M8 20v-6h8v6" />
    </Svg>
  )
}

export function CheckIcon() {
  return (
    <Svg>
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </Svg>
  )
}

export function ChevronLeftIcon() {
  return (
    <Svg>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </Svg>
  )
}

export function ChevronRightIcon() {
  return (
    <Svg>
      <path d="M9.5 5.5 16 12l-6.5 6.5" />
    </Svg>
  )
}

export function UndoIcon() {
  return (
    <Svg>
      <path d="M4 9h9a5.5 5.5 0 0 1 0 11H8" />
      <path d="M7.5 5.5 4 9l3.5 3.5" />
    </Svg>
  )
}

/** 警告（读取失败、公式会被清掉这类就地提示） */
export function AlertIcon() {
  return (
    <Svg>
      <path d="M12 4.5 21 20H3z" />
      <path d="M12 10v4.5M12 17.4v.1" />
    </Svg>
  )
}
