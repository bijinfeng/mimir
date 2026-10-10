/** 编辑器操作图标：通用动作使用 Lucide，格式专用语义保留原有图形。 */
import type { ReactNode } from 'react'
import {
  AArrowDown,
  AArrowUp,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Bold,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Crop,
  Eraser,
  Eye,
  FileInput,
  FilePlus2,
  Heading,
  Highlighter,
  Image,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Monitor,
  Paintbrush,
  PanelsLeftRight,
  PencilLine,
  Quote,
  Redo2,
  RemoveFormatting,
  RotateCcw,
  RotateCw,
  Save,
  Search,
  Smartphone,
  SpellCheck,
  SquareCode,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  Tablet,
  Trash2,
  TriangleAlert,
  Underline,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

function officeIcon(Icon: LucideIcon) {
  return function OfficeIcon() {
    return <Icon size="1em" strokeWidth={2} aria-hidden="true" focusable="false" />
  }
}

export const BoldIcon = officeIcon(Bold)
export const ItalicIcon = officeIcon(Italic)
export const UnderlineIcon = officeIcon(Underline)
export const StrikeIcon = officeIcon(Strikethrough)
export const BulletListIcon = officeIcon(List)
export const OrderedListIcon = officeIcon(ListOrdered)
export const SaveIcon = officeIcon(Save)
export const CheckIcon = officeIcon(Check)
export const ChevronLeftIcon = officeIcon(ChevronLeft)
export const ChevronRightIcon = officeIcon(ChevronRight)
export const UndoIcon = officeIcon(Undo2)
export const RedoIcon = officeIcon(Redo2)
export const AlertIcon = officeIcon(TriangleAlert)
export const LinkIcon = officeIcon(Link2)
export const TableIcon = officeIcon(Table2)
export const ImageIcon = officeIcon(Image)
export const TaskListIcon = officeIcon(ListTodo)
export const QuoteIcon = officeIcon(Quote)
export const CodeBlockIcon = officeIcon(SquareCode)
export const CodeIcon = officeIcon(Code2)
export const HeadingIcon = officeIcon(Heading)
export const SuperscriptIcon = officeIcon(Superscript)
export const SubscriptIcon = officeIcon(Subscript)
export const HighlightIcon = officeIcon(Highlighter)
export const ClearFormatIcon = officeIcon(RemoveFormatting)
export const PaintFormatIcon = officeIcon(Paintbrush)
export const AlignLeftIcon = officeIcon(AlignLeft)
export const AlignCenterIcon = officeIcon(AlignCenter)
export const AlignRightIcon = officeIcon(AlignRight)
export const AlignJustifyIcon = officeIcon(AlignJustify)
export const IndentIcon = officeIcon(IndentIncrease)
export const OutdentIcon = officeIcon(IndentDecrease)
export const HorizontalRuleIcon = officeIcon(Minus)
export const SearchIcon = officeIcon(Search)
export const TrackChangesIcon = officeIcon(PencilLine)
export const SpellCheckIcon = officeIcon(SpellCheck)
export const RotateCcwIcon = officeIcon(RotateCcw)
export const RotateCwIcon = officeIcon(RotateCw)
export const ZoomInIcon = officeIcon(ZoomIn)
export const ZoomOutIcon = officeIcon(ZoomOut)
export const TrashIcon = officeIcon(Trash2)
export const FileImportIcon = officeIcon(FileInput)
export const SplitViewIcon = officeIcon(PanelsLeftRight)
export const EyeIcon = officeIcon(Eye)
export const DeviceDesktopIcon = officeIcon(Monitor)
export const DeviceTabletIcon = officeIcon(Tablet)
export const DevicePhoneIcon = officeIcon(Smartphone)
export const CopyIcon = officeIcon(Copy)
export const EraserIcon = officeIcon(Eraser)
export const ChevronDownIcon = officeIcon(ChevronDown)
export const CloseIcon = officeIcon(X)
export const CropIcon = officeIcon(Crop)
export const BlankPageIcon = officeIcon(FilePlus2)
export const ReverseOrderIcon = officeIcon(ArrowDownUp)
export const ArrowUpIcon = officeIcon(ArrowUp)
export const ArrowDownIcon = officeIcon(ArrowDown)
export const FontGrowIcon = officeIcon(AArrowUp)
export const FontShrinkIcon = officeIcon(AArrowDown)

/** 专用图形沿用原来的坐标，保持与 Lucide 一致的尺寸与线宽。 */
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

export function PageBreakIcon() {
  return (
    <Svg>
      <rect x="6" y="3" width="12" height="7" rx="1" />
      <rect x="6" y="14" width="12" height="7" rx="1" />
      <path d="M3 12h18" strokeDasharray="2.5 2.5" />
    </Svg>
  )
}

export function TextColorIcon() {
  return (
    <Svg>
      <path d="M6 15.5 12 4l6 11.5" />
      <path d="M8.6 11.5h6.8" />
      <path d="M3.5 20.5h17" />
    </Svg>
  )
}

export function ListOpsIcon() {
  return (
    <Svg>
      <path d="M10 6.5h10M10 12h10M10 17.5h10" />
      <path d="M4 4.5 6.5 7 4 9.5M4 14.5 6.5 17 4 19.5" />
    </Svg>
  )
}

export function FindIcon() {
  return (
    <Svg>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
      <path d="M7.6 10.5h5.8" />
    </Svg>
  )
}

export function CrossHighlightIcon() {
  return (
    <Svg>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 11h17M11 4.5v15" />
    </Svg>
  )
}

export function LtrIcon() {
  return (
    <Svg>
      <path d="M3.5 7h13M3.5 12h17M3.5 17h9" />
      <path d="M18 4.5 21.5 7 18 9.5" />
    </Svg>
  )
}

export function RtlIcon() {
  return (
    <Svg>
      <path d="M7.5 7h13M3.5 12h17M11.5 17h9" />
      <path d="M6 4.5 2.5 7 6 9.5" />
    </Svg>
  )
}

export function ParaShadingIcon() {
  return (
    <Svg>
      <path d="M4.5 4.5h15M4.5 19.5h15" />
      <rect x="4.5" y="8" width="15" height="8" rx="1" />
      <path d="M7.5 12h9" />
    </Svg>
  )
}
