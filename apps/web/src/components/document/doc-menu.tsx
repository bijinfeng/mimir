import type { DocumentDetail } from '@mimir/shared'
import type { MenuProps } from 'antd'

/**
 * 文档工具条上的「⋯」菜单。
 *
 * ## 它接的是整理条退役后的那几项能力（D-054）
 *
 * 原先「建议标签 / 归入目录 / 完成整理 / 归档」摆在文档顶部的橙色横幅里，
 * 占一整行、长期存在。问题是**它们都是低频动作**：读一篇文章时并不想被
 * 一整行横幅把标题与正文往下挤。
 *
 * 收进菜单之后能力不占版面。代价是多一次点击——这笔账划算，因为
 * 「加标签」不是阅读时会连续做的动作。归档不在其列：它已随归档交互
 * 整体退役（D-065），文档不再有第二个状态位。
 *
 * ## 为什么在这里写成纯函数
 *
 * 菜单项的 key 与它的动作是「点了会发生什么」的唯一真相，而**串错不会报错**
 * ——只是点了没反应。这类问题只能靠断言覆盖（与 `nav/menu-items.tsx` 同一条
 * 理由），所以构造在这里，组件只负责把 `items` 交给 antd。
 *
 * ## 三条容易做错的实现细节
 *
 * 1. **不留空子菜单**：一个展开后什么都没有的子菜单会让人以为功能坏了。
 *    所以每一种「没有可选项」的情况都给一条禁用的说明项
 *   （「还没有其它目录」「还没有标签」），而不是给空数组
 * 2. **当前值要禁用**：已经在这个目录里时，那个目录项要不可点——
 *    可点而无事发生是最坏的一种（`docs/DESIGN.md` §7.4）
 * 3. **危险动作不进这个菜单**。删除不可撤销，而它在工具条上离「问 AI」
 *    只有一步——误点代价太大。它留在库视图（列表项上，与「打开」隔着
 *    一段距离，且有自己的确认框）
 *
 * **改名也不在这个菜单里**（虽然它一度在这）。标题自带就地编辑
 * （`Typography.Title editable`，悬停出现铅笔），那里才是它唯一该在的位置：
 * 菜单里再放一个会变成两条路径。而菜单要「跳到标题去改」就必须读 DOM ref
 * 才能找到那个元素——渲染期传一个读 ref 的闭包会让 React Compiler
 * **静默跳过整个 DocumentPanel**（`react(refs)`），代价远大于那一条便利。
 */

export interface DocMenuOptions {
  doc: DocumentDetail
  onSetTags: (tags: string[]) => void
  onSetFolder: (folder: string) => void
  /** 已有目录路径，由调用方从目录查询里取 */
  folders?: readonly string[]
  /** 建议标签（后端按正文高频词算的）。没有就不显示这一组 */
  suggestedTags?: readonly string[]
}

export function buildDocMenu(options: DocMenuOptions): MenuProps['items'] {
  const { doc, folders = [], suggestedTags = [] } = options

  /** 还没加过的建议标签——已经是标签的不再出现（点了也没变化） */
  const fresh = suggestedTags.filter((tag) => !doc.tags.includes(tag))
  const items: MenuProps['items'] = []

  /* ── 标签 ───────────────────────────────────────────────────── */

  const tagChildren: MenuProps['items'] = []
  if (fresh.length > 0) {
    tagChildren.push({
      type: 'group',
      label: '建议',
      children: fresh.map((tag) => ({
        key: `tag-add:${tag}`,
        label: `＋ ${tag}`,
        onClick: () => options.onSetTags([...doc.tags, tag]),
      })),
    })
  }
  if (doc.tags.length > 0) {
    tagChildren.push({
      type: 'group',
      label: '已有',
      children: doc.tags.map((tag) => ({
        key: `tag-del:${tag}`,
        label: `－ ${tag}`,
        onClick: () => options.onSetTags(doc.tags.filter((item) => item !== tag)),
      })),
    })
    tagChildren.push({ type: 'divider' })
    tagChildren.push({
      key: 'tag-clear',
      label: '清除全部标签',
      onClick: () => options.onSetTags([]),
    })
  }
  if (tagChildren.length === 0) {
    tagChildren.push({ key: 'tag-empty', label: '还没有标签', disabled: true })
  }

  items.push({
    key: 'tags',
    label: doc.tags.length > 0 ? `标签（${doc.tags.length}）` : '标签',
    children: tagChildren,
  })

  /* ── 目录 ───────────────────────────────────────────────────── */

  const folderChildren: MenuProps['items'] =
    folders.length > 0
      ? [
          ...folders.map((path) =>
            path === doc.folder
              ? { key: `folder:${path}`, label: `${path}（当前）`, disabled: true }
              : {
                  key: `folder:${path}`,
                  label: path,
                  onClick: () => options.onSetFolder(path),
                },
          ),
          ...(doc.folder
            ? [
                { type: 'divider' as const },
                {
                  key: 'folder-none',
                  label: '移出目录',
                  onClick: () => options.onSetFolder(''),
                },
              ]
            : []),
        ]
      : [{ key: 'folder-empty', label: '还没有其它目录', disabled: true }]

  items.push({
    key: 'folder',
    label: doc.folder ? `目录（${doc.folder}）` : '归入目录',
    children: folderChildren,
  })

  return items
}
