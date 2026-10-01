import {
  Atom,
  BookOpen,
  Briefcase,
  Cpu,
  FlaskConical,
  FolderOpen,
  GraduationCap,
  Landmark,
  Languages,
  Palette,
  Scale,
  Terminal,
  Users,
  Wrench,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { FolderIconKey } from '@mimir/shared'

/**
 * 知识库图标（D-078）。
 *
 * 键落库（`folders.icon`，shared 的 `FOLDER_ICONS`），**渲染函数的映射在
 * 界面层**：服务端只存键、不认识图标库，将来换图标库（或用 morphicons 的
 * 动态画法）不用动数据库。
 *
 * 映射的值是**模块级渲染函数**而不是组件对象，原因有二：
 *
 *  1. lucide-react 的图标是 forwardRef 对象，**不能当普通函数调用**——
 *     `folderIconOf(key)({ size })` 直接调它实测抛
 *     `TypeError: ... is not a function`（整个页面白屏成「连不上服务端」）。
 *  2. `const Icon = map[key]; <Icon/>` 的写法会被
 *     `react(no-unstable-nested-components)` 判成「渲染期定义组件」，
 *     React Compiler 随即跳过整个组件（铁律 1 的静默退化）。
 *
 * 渲染期直接调用这些模块级函数（`FolderGlyph`），既不创建组件也不调用
 * forwardRef 对象。`satisfies` 保证键集合与 shared 的清单一一对应。
 */
const RENDERERS: Record<FolderIconKey, (props: { size?: number }) => ReactNode> = {
  humanities: ({ size }) => <BookOpen size={size} />,
  history: ({ size }) => <Landmark size={size} />,
  social: ({ size }) => <Users size={size} />,
  law: ({ size }) => <Scale size={size} />,
  science: ({ size }) => <FlaskConical size={size} />,
  natural: ({ size }) => <Atom size={size} />,
  tech: ({ size }) => <Wrench size={size} />,
  computer: ({ size }) => <Cpu size={size} />,
  engineering: ({ size }) => <Terminal size={size} />,
  education: ({ size }) => <GraduationCap size={size} />,
  business: ({ size }) => <Briefcase size={size} />,
  art: ({ size }) => <Palette size={size} />,
  language: ({ size }) => <Languages size={size} />,
}

const FALLBACK: (props: { size?: number }) => ReactNode = ({ size }) => <FolderOpen size={size} />

/** 图标键 → 渲染函数。未知/为空回退到文件夹图标（行、图标网格都用它） */
export function folderIconOf(
  iconKey: string | null | undefined,
): (props: { size?: number }) => ReactNode {
  return iconKey && iconKey in RENDERERS ? RENDERERS[iconKey as FolderIconKey] : FALLBACK
}

/**
 * 知识库图标（渲染入口）。
 *
 * **渲染时不要把组件赋给局部变量**（`const Icon = ...; <Icon/>`）：
 * `react(no-unstable-nested-components)` 会判成「渲染期定义组件」，
 * React Compiler 随即跳过这个组件（铁律 1 的静默退化）。这里直接调用
 * 模块级的渲染函数，两个问题一起绕开（见文件头的说明）。
 */
export function FolderGlyph({
  iconKey,
  size = 15,
}: {
  iconKey: string | null | undefined
  size?: number
}): ReactNode {
  return <>{folderIconOf(iconKey)({ size })}</>
}
