/**
 * 目录路径的纯函数运算。
 *
 * 抽出来的理由与 `nav/menu-items.tsx` 相同：这些函数是「路径怎么拆、
 * 怎么算父子」的唯一真相，而算错**不会报错**——只是目录被搬去错误的位置
 * 或指向一个不存在的路径。这类问题只能靠断言覆盖。
 *
 * 曾经还有一个 `dropTargetPath`（拖拽落点 → 目标父路径）：目录树支持
 * 拖拽重挂父级。D-079 把侧栏改成平铺（父级只有库根一个，没有可拖的东西），
 * 它与树一起退场。
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
