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
 *    可点而无事发生是最坏的一种（`.trellis/spec/project/design.md` §7.4）
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
  /**
   * AI 标签建议（M1-D）。**与上面那条并存、不合并**：
   * 统计版零成本、随开随算；AI 版要花钱、要用户点一下。
   * 后者单独一条菜单项，文案里写明「AI」——一次付费调用不该藏在
   * 一个用户以为是本地计算的动作里。
   */
  onAiTags?: () => void
  /** 生成 AI 摘要（M1-D）。同样要花钱，所以文案里写明 */
  onSummary?: () => void
  /** 正在生成（按钮转 loading，防连点） */
  aiBusy?: boolean
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

  /* ── AI（M1-D）────────────────────────────────────────────────
   *
   * 「AI 建议标签」与「AI 摘要」放在菜单底部一个独立的组里，
   * 与上面那些**零成本**的整理动作分开。分组的理由不是好看：
   * 它们是这个菜单里仅有的**会花钱**的两项（`.trellis/spec/project/product.md` §5.8 要求
   * 用户随时知道「这次花钱了吗」），而混在标签、目录之间会让这一点不可见。
   *
   * 没有正文时禁用（AI 读不到东西）：一条「点了没反应」的菜单项
   * 是最坏的一种（DESIGN §7.4），所以给禁用态而不是让它去失败。
   */
  if (options.onAiTags || options.onSummary) {
    const hasBody = doc.body.trim().length > 0
    const aiChildren: MenuProps['items'] = []

    if (options.onAiTags) {
      aiChildren.push({
        key: 'ai-tags',
        label: options.aiBusy ? 'AI 正在读…' : 'AI 建议标签',
        disabled: !hasBody || options.aiBusy === true,
        onClick: options.onAiTags,
      })
    }
    if (options.onSummary) {
      aiChildren.push({
        key: 'ai-summary',
        label: options.aiBusy ? 'AI 正在读…' : 'AI 摘要',
        disabled: !hasBody || options.aiBusy === true,
        onClick: options.onSummary,
      })
    }

    if (aiChildren.length > 0) {
      items.push({ type: 'divider' })
      items.push({ type: 'group', label: 'AI（会产生用量）', children: aiChildren })
    }
  }

  return items
}
