/**
 * 目录路径的纯函数运算。
 *
 * 抽出来的理由与 `nav/menu-items.tsx` 相同：这些函数是「拖拽落点算成哪个
 * 路径」的唯一真相，而算错**不会报错**——只是目录被搬去错误的位置。
 * 这类问题只能靠断言覆盖。
 */

/** 完整路径的末段名：`技术/前端/React` → `React` */
export function nameOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? path : path.slice(index + 1)
}

/** 完整路径的父路径：`技术/前端/React` → `技术/前端`；顶层 → `''` */
export function parentOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

/** 拼路径。parent 为空串表示顶层 */
export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

/** `path` 是否在 `ancestor` 的子树里（不含 ancestor 本身） */
export function isDescendantOf(path: string, ancestor: string): boolean {
  return path.startsWith(`${ancestor}/`)
}

/**
 * 拖拽落点 → 目标父路径。本项目的移动语义是**重挂父级**（不排序兄弟），
 * 所以拖到某个节点上 = 把 drag 搬进 drop 的子树。
 *
 * 返回 null 表示这次拖放无效，调用方静默忽略：
 *  - 拖进自己的子树（服务端也会拒，但前端先拦避免一次必败请求）
 *  - 原地放手（父路径没变，无事发生）
 */
export function dropTargetPath(dragPath: string, dropPath: string): string | null {
  if (dragPath === dropPath || isDescendantOf(dropPath, dragPath)) return null
  const target = dropPath
  if (parentOf(dragPath) === target) return null
  return target
}
