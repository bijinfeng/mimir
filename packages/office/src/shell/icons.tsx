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
 *
 * ## 图标是这一层的公共词汇
 *
 * 六种编辑器都从这里取图标。**不要用字形当图标**（`↶`、`❝`、`＋` 那种）：
 * 字形的宽度与粗细由字体决定，两种编辑器里的大小对不上；而且它在字体缺失时
 * 会退成方框，键盘用户看到的 `title` 是对的、眼睛看到的是错的。
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

/* ── 内联格式（工具条的第二排之外，六种编辑器共用） ────────────── */

export function LinkIcon() {
  return (
    <Svg>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3" />
    </Svg>
  )
}

export function TableIcon() {
  return (
    <Svg>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15M15.5 4.5v15" />
    </Svg>
  )
}

export function ImageIcon() {
  return (
    <Svg>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <circle cx="8.5" cy="9.5" r="1.4" fill="currentColor" stroke="none" />
      <path d="M4.5 17.5 9 13l3 3 3-3 4.5 4.5" />
    </Svg>
  )
}

export function PageBreakIcon() {
  return (
    <Svg>
      <rect x="6" y="3" width="12" height="7" rx="1" />
      <rect x="6" y="14" width="12" height="7" rx="1" />
      <path d="M3 12h18" strokeDasharray="2.5 2.5" />
    </Svg>
  )
}

export function TaskListIcon() {
  return (
    <Svg>
      <path d="M3.5 6.5 5 8l2.5-2.5" />
      <path d="M3.5 15.5 5 17l2.5-2.5" />
      <path d="M10.5 7h10M10.5 16h10" />
    </Svg>
  )
}

export function QuoteIcon() {
  return (
    <Svg>
      <path d="M10 7H6.5v4.5H10V15c0 1.5-1 2.5-2.5 2.5" />
      <path d="M19 7h-3.5v4.5H19V15c0 1.5-1 2.5-2.5 2.5" />
    </Svg>
  )
}

export function CodeBlockIcon() {
  return (
    <Svg>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M10 10.5 8 12.5l2 2M14 10.5l2 2-2 2" />
    </Svg>
  )
}

/** 行内代码（`</>`）。与 CodeBlockIcon 分开：一个是行内标记，一个是块节点 */
export function CodeIcon() {
  return (
    <Svg>
      <path d="M9 7.5 3.5 12 9 16.5M15 7.5 20.5 12 15 16.5" />
    </Svg>
  )
}

/** 标题样式。H1/H2/H3 三个按钮用它（`A` 系的字号下拉同理） */
export function HeadingIcon() {
  return (
    <Svg>
      <path d="M6 5v14M15 5v14M6 12h9" />
    </Svg>
  )
}

export function SuperscriptIcon() {
  return (
    <Svg>
      <path d="M4 11.5 11.5 20M11.5 11.5 4 20" />
      <path d="M15.5 8.5h3l-3 3.5h3" />
    </Svg>
  )
}

export function SubscriptIcon() {
  return (
    <Svg>
      <path d="M4 4 11.5 12.5M11.5 4 4 12.5" />
      <path d="M15.5 15.5h3l-3 3.5h3" />
    </Svg>
  )
}

/** 字体颜色。下方那条实线代表「颜色落在文字上」 */
export function TextColorIcon() {
  return (
    <Svg>
      <path d="M6 15.5 12 4l6 11.5" />
      <path d="M8.6 11.5h6.8" />
      <path d="M3.5 20.5h17" />
    </Svg>
  )
}

/** 突出显示：一支记号笔 + 它留下的那道粗线 */
export function HighlightIcon() {
  return (
    <Svg>
      <path d="M13.5 4.5 19.5 10.5 11 19H5.5v-5.5z" />
      <path d="M3.5 21.5h17" />
    </Svg>
  )
}

/** 清除格式 */
export function ClearFormatIcon() {
  return (
    <Svg>
      <path d="M7 17 12.5 5.5 18 17" />
      <path d="M9 13h7" />
      <path d="M4 20.5 20 4.5" />
    </Svg>
  )
}

/** 格式刷 */
export function PaintFormatIcon() {
  return (
    <Svg>
      <rect x="3.5" y="5" width="12" height="4.5" rx="1" />
      <path d="M15.5 7.2h4v3.8h-7.5v2.5" />
      <rect x="10.5" y="13.5" width="3" height="6.5" rx="1" />
    </Svg>
  )
}

/* ── 段落与列表 ───────────────────────────────────────────────── */

export function AlignLeftIcon() {
  return (
    <Svg>
      <path d="M4 6h16M4 10.5h10M4 15h16M4 19.5h10" />
    </Svg>
  )
}

export function AlignCenterIcon() {
  return (
    <Svg>
      <path d="M4 6h16M7 10.5h10M4 15h16M7 19.5h10" />
    </Svg>
  )
}

export function AlignRightIcon() {
  return (
    <Svg>
      <path d="M4 6h16M10 10.5h10M4 15h16M10 19.5h10" />
    </Svg>
  )
}

export function AlignJustifyIcon() {
  return (
    <Svg>
      <path d="M4 6h16M4 10.5h16M4 15h16M4 19.5h16" />
    </Svg>
  )
}

export function IndentIcon() {
  return (
    <Svg>
      <path d="M4 5.5h16M10 10.5h10M10 14.5h10M4 19.5h16" />
      <path d="M4 10l3 2.5-3 2.5" />
    </Svg>
  )
}

export function OutdentIcon() {
  return (
    <Svg>
      <path d="M4 5.5h16M10 10.5h10M10 14.5h10M4 19.5h16" />
      <path d="M7 10 4 12.5 7 15" />
    </Svg>
  )
}

/** 分隔线（正文里的一条水平线）。与 PageBreakIcon 分开：一个是内容，一个是分页 */
export function HorizontalRuleIcon() {
  return (
    <Svg>
      <path d="M3.5 12h17" />
      <path d="M6.5 7.5h11M6.5 16.5h11" opacity="0.45" />
    </Svg>
  )
}

/** 列表操作（提升/降低层级、改编号） */
export function ListOpsIcon() {
  return (
    <Svg>
      <path d="M10 6.5h10M10 12h10M10 17.5h10" />
      <path d="M4 4.5 6.5 7 4 9.5M4 14.5 6.5 17 4 19.5" />
    </Svg>
  )
}

/** 重做。与 UndoIcon 镜像——两个必须成对出现，否则分不清方向 */
export function RedoIcon() {
  return (
    <Svg>
      <path d="M20 9h-9a5.5 5.5 0 0 0 0 11h5" />
      <path d="M16.5 5.5 20 9l-3.5 3.5" />
    </Svg>
  )
}

/* ── 查找、修订、校对 ─────────────────────────────────────────── */

/** 在文档里查找（放大镜 + 一条文本线）。与 SearchIcon 的区别见那个函数 */
export function FindIcon() {
  return (
    <Svg>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
      <path d="M7.6 10.5h5.8" />
    </Svg>
  )
}

/** 站内/全局搜索。没有那条文本线：它搜的不是当前文档 */
export function SearchIcon() {
  return (
    <Svg>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
    </Svg>
  )
}

/** 修订：一支笔。Word 的修订图标也是这个形状 */
export function TrackChangesIcon() {
  return (
    <Svg>
      <path d="M4 19.5h4.5L18 9a2.8 2.8 0 0 0-4-4L4.5 14.5z" />
      <path d="M15 6.5 17.5 9" />
    </Svg>
  )
}

/** 拼写检查 */
export function SpellCheckIcon() {
  return (
    <Svg>
      <path d="M3.5 16.5 8 5l4.5 11.5" />
      <path d="M5.3 12.5h5.4" />
      <path d="M13.5 14.5 16 17l4.5-5.5" />
    </Svg>
  )
}

/* ── 视图与页面操作 ───────────────────────────────────────────── */

/** 逆时针旋转 */
export function RotateCcwIcon() {
  return (
    <Svg>
      <path d="M3.5 12a8.5 8.5 0 1 0 8.5-8.5 9.2 9.2 0 0 0-6.4 2.6L3.5 8.3" />
      <path d="M3.5 3.5v5h5" />
    </Svg>
  )
}

/** 顺时针旋转 */
export function RotateCwIcon() {
  return (
    <Svg>
      <path d="M20.5 12a8.5 8.5 0 1 1-8.5-8.5 9.2 9.2 0 0 1 6.4 2.6l2.1 2.2" />
      <path d="M20.5 3.5v5h-5" />
    </Svg>
  )
}

export function ZoomInIcon() {
  return (
    <Svg>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
      <path d="M10.5 7.5v6M7.5 10.5h6" />
    </Svg>
  )
}

export function ZoomOutIcon() {
  return (
    <Svg>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
      <path d="M7.5 10.5h6" />
    </Svg>
  )
}

/** 删除（页面、幻灯片、图片）。**危险动作**：调用方要给二次确认 */
export function TrashIcon() {
  return (
    <Svg>
      <path d="M4.5 6.5h15" />
      <path d="M9.5 6.5v-2h5v2" />
      <path d="M6.8 6.5 7.8 20h8.4l1-13.5" />
      <path d="M10.2 10.5v6M13.8 10.5v6" />
    </Svg>
  )
}

/** 导入文件（pdf 的「插入页面」、docx 的插图都走它） */
export function FileImportIcon() {
  return (
    <Svg>
      <path d="M13.5 3.5h-7v17h11V7.5z" />
      <path d="M13.5 3.5v4h4" />
      <path d="M12 11v5.5M9.5 14 12 16.5 14.5 14" />
    </Svg>
  )
}

/** 左右分栏（html 的源码 + 预览） */
export function SplitViewIcon() {
  return (
    <Svg>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M12 4.5v15" />
    </Svg>
  )
}

export function EyeIcon() {
  return (
    <Svg>
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </Svg>
  )
}

export function DeviceDesktopIcon() {
  return (
    <Svg>
      <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
      <path d="M9 20h6M12 16.5V20" />
    </Svg>
  )
}

export function DeviceTabletIcon() {
  return (
    <Svg>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M11 18h2" />
    </Svg>
  )
}

export function DevicePhoneIcon() {
  return (
    <Svg>
      <rect x="7.5" y="3" width="9" height="18" rx="2" />
      <path d="M11 18h2" />
    </Svg>
  )
}

/* ── 剪贴板与表格（xlsx 的工具条） ────────────────────────────── */

/** 复制。两个叠起来的框——与系统里那个复制图标同一个形状，不用再学一遍 */
export function CopyIcon() {
  return (
    <Svg>
      <rect x="8.5" y="8.5" width="12" height="12" rx="1.5" />
      <path d="M15.5 5.5h-11v11" />
    </Svg>
  )
}

/**
 * 清空（橡皮擦）。
 *
 * **与 TrashIcon 分开**：那个是「把这个格子/这一页删掉」，这个是「把里面的
 * 内容擦掉，格子还在」。两者在表格里是不同的动作（清空保留行列结构），
 * 用同一个图标会让人以为清空会把格子也删掉。
 */
export function EraserIcon() {
  return (
    <Svg>
      <path d="M9.5 4.5 19 14a1.5 1.5 0 0 1 0 2.1l-3.4 3.4H9.5l-5-5z" />
      <path d="M6.5 10.5 13 17" />
      <path d="M4 21.5h16" />
    </Svg>
  )
}

/** 十字高亮：表格里选中格所在的**行与列**（一个十字） */
export function CrossHighlightIcon() {
  return (
    <Svg>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 11h17M11 4.5v15" />
    </Svg>
  )
}

export function ChevronDownIcon() {
  return (
    <Svg>
      <path d="M5.5 9.5 12 16l6.5-6.5" />
    </Svg>
  )
}

export function CloseIcon() {
  return (
    <Svg>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  )
}

/* ── pdf 的页面操作 ───────────────────────────────────────────── */

/**
 * 裁剪：一个取景框 + 里面那一块。四条 L 形角标就是「往内裁」的视觉语言。
 *
 * **不用剪刀**：剪刀在办公软件里指「剪切到剪贴板」，而 PDF 的裁剪是**只改
 * 可视区**（TECH §15.12），两者完全不是一件事。
 */
export function CropIcon() {
  return (
    <Svg>
      <path d="M7 3v14h14" />
      <path d="M3 7h14v14" />
    </Svg>
  )
}

/** 插入空白页：一张空纸 + 加号 */
export function BlankPageIcon() {
  return (
    <Svg>
      <path d="M6 3.5h8L18.5 8v12.5H6z" />
      <path d="M14 3.5V8h4.5" />
      <path d="M9.5 13h5M12 10.5v5" />
    </Svg>
  )
}

/**
 * 倒序：两个箭头首尾互换。
 *
 * 与 `RotateCwIcon`（一个圆环）分开——那一个是「转这一页」，这一个是「把整份
 * 的顺序反过来」，两者作用的东西完全不同。
 */
export function ReverseOrderIcon() {
  return (
    <Svg>
      <path d="M4 8h11a4 4 0 0 1 0 8H9" />
      <path d="M7 4.5 3.5 8 7 11.5" />
      <path d="M12 12.5 15.5 16 12 19.5" />
    </Svg>
  )
}

/* ── 段落移动与字号增减（docx 的工具条） ──────────────────────── */

/**
 * 上移一位。**实心三角 + 横线**，不画成箭头加尾巴——那个形状在这个尺寸下
 * 与 ChevronLeftIcon 太像，而它们一个是「换一行」、一个是「换一段」。
 */
export function ArrowUpIcon() {
  return (
    <Svg>
      <path d="M12 19.5V6" />
      <path d="M6 12 12 6l6 6" />
    </Svg>
  )
}

/** 下移一位。与 ArrowUpIcon 严格镜像——方向相反的一对必须成对出现 */
export function ArrowDownIcon() {
  return (
    <Svg>
      <path d="M12 4.5V18" />
      <path d="M6 12l6 6 6-6" />
    </Svg>
  )
}

/**
 * 从左到右 / 从右到左。
 *
 * **两条镜像的短横线 + 一个箭头**，不是「LTR」「RTL」三个字母：工具条上那三个
 * 字母要占掉半个下拉的宽度，而这个按钮永远与它的镜像挨着——方向一眼就看得出来。
 * 长横线在右边（LTR）还是左边（RTL）是这一对里唯一变的东西。
 */
export function LtrIcon() {
  return (
    <Svg>
      <path d="M3.5 7h13M3.5 12h17M3.5 17h9" />
      <path d="M18 4.5 21.5 7 18 9.5" />
    </Svg>
  )
}

/** 从右到左。与 LtrIcon 严格镜像——方向相反的一对必须成对出现 */
export function RtlIcon() {
  return (
    <Svg>
      <path d="M7.5 7h13M3.5 12h17M11.5 17h9" />
      <path d="M6 4.5 2.5 7 6 9.5" />
    </Svg>
  )
}

/**
 * 段落底纹：一个段落块，里面填了一道底色。
 *
 * **不能用一个色块当图标。** 试过：直接放一个 `#DEEAF6` 的小方块，在浅色主题
 * 下它与工具条底色几乎同色，渲染出来像一个空按钮——正是这个仓库最不接受的
 * 「看不出这是什么」。这个形状表达了「底色落在整段上」而不是落在字上
 * （后者是 HighlightIcon 的记号笔）。
 */
export function ParaShadingIcon() {
  return (
    <Svg>
      <path d="M4.5 4.5h15M4.5 19.5h15" />
      <rect x="4.5" y="8" width="15" height="8" rx="1" />
      <path d="M7.5 12h9" />
    </Svg>
  )
}

/**
 * 增大字号：一个 `A` + 上箭头。
 *
 * **不用 `A+` / `A-` 这种字形**：加号在两种字体里的位置不同，字号变了它
 * 还会重新对齐一次；而这里的两个按钮永远挨着，用镜像的箭头一眼就能分出方向。
 */
export function FontGrowIcon() {
  return (
    <Svg>
      <path d="M3.5 19 8.8 5.5 14 19" />
      <path d="M5.4 15h6.8" />
      <path d="M18.5 11.5V19M16 14l2.5-2.5L21 14" />
    </Svg>
  )
}

/** 减小字号。与 FontGrowIcon 镜像 */
export function FontShrinkIcon() {
  return (
    <Svg>
      <path d="M3.5 19 8.8 5.5 14 19" />
      <path d="M5.4 15h6.8" />
      <path d="M18.5 19v-7.5M16 16l2.5 2.5L21 16" />
    </Svg>
  )
}
