/**
 * 目录树 → 扁平路径列表，供「归入目录」的下拉候选。
 *
 * 用全角空格做缩进而不是嵌套结构：antd 的 Dropdown 菜单项是扁平的，
 * 用空格前缀能在不引入子菜单的前提下表达层级——子菜单在这里反而更难用
 * （要悬停展开，而归入目录这个动作通常是「我已经知道要归哪」）。
 */
export function flattenFolders(
  nodes: { path: string; name: string; children: unknown[] }[],
  depth = 0,
): { path: string; label: string }[] {
  return nodes.flatMap((node) => [
    { path: node.path, label: `${'　'.repeat(depth)}${node.name}` },
    ...flattenFolders(node.children as typeof nodes, depth + 1),
  ])
}
