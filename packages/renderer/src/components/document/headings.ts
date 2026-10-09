/**
 * 文档大纲：从 Markdown 正文里抽出标题。
 *
 * 抽出来的 id 要**同时**给两处用：右侧大纲的锚点跳转，与只读正文挂载后
 * 补的 `id` 属性。两处的序号规则必须完全一致，否则点击大纲会跳错位置——
 * 所以规则只有这一份。
 */
export interface Heading {
  id: string
  level: number
  text: string
}

/** 抽取标题，用于右侧大纲。序号规则必须与行内高亮一致，否则点击会跳错位置。 */
export function extractHeadings(markdown: string): Heading[] {
  const out: Heading[] = []
  const pattern = /^(#{1,6})\s+(.+)$/gm
  let match: RegExpExecArray | null

  while ((match = pattern.exec(markdown)) !== null) {
    const hashes = match[1] ?? ''
    out.push({
      id: `h-${out.length}`,
      // 一二级统一按二级渲染（原型既有规则）：h1 已经是页面标题，
      // 正文里再出现 h1 属于 Markdown 作者的层级混乱，压平更好读
      level: hashes.length <= 2 ? 2 : 3,
      text: (match[2] ?? '').trim(),
    })
  }

  return out
}
