import { inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tags } from '../db/schema.js'
import { tokenize } from '../lib/segment.js'

/**
 * 建议标签。
 *
 * 整理条把这几个词直接摆成按钮（`docs/PRD.md` §5.10）。关键点是
 * **后端早就该算它**——界面上没地方显示等于白算。
 *
 * 用 jieba 而不是正则：原型里的正则 `/[\u4e00-\u9fa5]{2,4}/g` 只能切出
 * 连续汉字块，「React 组件性能优化」会被切成「组件性能优化」这种整体，
 * 或者更糟——它没有词边界概念。既然后端已经有真正的分词器，就该用它。
 *
 * 这是**统计**不是**模型调用**：没有延迟、不花钱，所以可以随文档打开就请求，
 * 也不需要缓存。
 */

/**
 * 停用词。目标不是语言学上的完整，而是**把「切出来但做标签毫无意义」的词挡掉**。
 *
 * 两类：
 *  1. 通用虚词与助词——「这个」「然后」「可以」，任何中文文本里都高频
 *  2. 技术文档里的通用动词——「使用」「实现」「需要」，它们出现在每篇文章里，
 *     区分度为零。这类词漏掉会让建议标签全是废话，比没有建议更糟
 */
const STOP_WORDS = new Set([
  // 虚词、代词、连词
  '这个',
  '那个',
  '什么',
  '怎么',
  '这些',
  '那些',
  '这里',
  '那里',
  '自己',
  '因为',
  '所以',
  '但是',
  '不过',
  '而且',
  '或者',
  '如果',
  '虽然',
  '然后',
  '可以',
  '应该',
  '需要',
  '必须',
  '可能',
  '已经',
  '还是',
  '就是',
  '只是',
  '我们',
  '你们',
  '他们',
  '它们',
  '一个',
  '一种',
  '一些',
  '一样',
  '这样',
  '那样',
  '现在',
  '时候',
  '地方',
  '东西',
  '问题',
  '方法',
  '情况',
  '内容',
  // 技术文档通用动词 / 形容词
  '使用',
  '实现',
  '进行',
  '通过',
  '得到',
  '导致',
  '产生',
  '增加',
  '减少',
  '提供',
  '支持',
  '包含',
  '包括',
  '属于',
  '等于',
  '变成',
  '成为',
  '作为',
  '重要',
  '简单',
  '复杂',
  '明显',
  '直接',
  '真正',
  '实际',
  '具体',
  '基本',
  '例如',
  '比如',
  '以及',
  '并且',
  '反而',
  '其实',
  '当然',
  '总之',
  '因此',
  '不会',
  '不能',
  '没有',
  '不是',
  '就是',
  '还有',
  '只能',
  '不要',
  '好处',
  '坏处',
  '优点',
  '缺点',
  '结果',
  '原因',
  '方式',
  '方案',
  '首先',
  '其次',
  '最后',
  '另外',
  '此外',
  '同时',
  '之后',
  '之前',
  '以及',
])

/** 单字无意义（「的」「了」），过长的串通常是切分事故（英文长单词除外） */
function isCandidate(token: string): boolean {
  if (STOP_WORDS.has(token)) return false
  // 纯数字没有区分度
  if (/^\d+$/.test(token)) return false
  // 单个汉字：中文里单字极少能当标签
  if (/^[\u4e00-\u9fff]$/.test(token)) return false
  // 纯标点
  if (/^[^\p{L}\p{N}]+$/u.test(token)) return false
  // 拉丁词短于 3 个字母的通常是冠词/介词/noise
  if (/^[a-z]{1,2}$/i.test(token)) return false
  return true
}

export interface SuggestOptions {
  /** 已经挂上的标签，不再重复建议 */
  exclude?: string[]
  limit?: number
}

/**
 * 从标题与正文里提取建议标签。
 *
 * 排序规则按优先级依次是：
 *  1. **标题里出现过的词优先** —— 标题是作者自己认定的主题
 *  2. 出现次数多的优先
 *  3. 已经有人用过的标签优先 —— 复用既有标签比造新词更有价值，
 *     否则标签会退化成「每个人自己的一套同义词」
 */
export async function suggestTags(
  title: string,
  body: string,
  options: SuggestOptions = {},
): Promise<string[]> {
  const limit = options.limit ?? 3
  const exclude = new Set(options.exclude ?? [])

  const counts = new Map<string, number>()
  const inTitle = new Set<string>()

  const add = (text: string, isTitle: boolean) => {
    for (const token of tokenize(text)) {
      const word = token.toLowerCase()
      if (!isCandidate(word) || exclude.has(word)) continue
      counts.set(word, (counts.get(word) ?? 0) + 1)
      if (isTitle) inTitle.add(word)
    }
  }

  add(title, true)
  add(body, false)

  if (counts.size === 0) return []

  // 只出现一次的词不建议：一篇正常长度的文章里，主题词不会只出现一次。
  // 这条规则比阈值调参有效得多，也让结果稳定（不会因正文长度而飘）
  const repeated = [...counts.entries()].filter(([, count]) => count > 1)

  // 长文里没有重复词时退一步：至少在标题里出现过
  const candidates =
    repeated.length > 0 ? repeated : [...counts.entries()].filter(([word]) => inTitle.has(word))

  if (candidates.length === 0) return []

  // 查一下现有标签表，给「已经在用的标签」加权
  const known = await loadKnownTags(candidates.map(([word]) => word))

  candidates.sort((a, b) => {
    const knownDiff = Number(known.has(b[0])) - Number(known.has(a[0]))
    if (knownDiff !== 0) return knownDiff

    const titleDiff = Number(inTitle.has(b[0])) - Number(inTitle.has(a[0]))
    if (titleDiff !== 0) return titleDiff

    // 次数相同时长的优先：「组件性能」比「组件」更具体
    if (b[1] !== a[1]) return b[1] - a[1]
    return b[0].length - a[0].length
  })

  return candidates.slice(0, limit).map(([word]) => word)
}

async function loadKnownTags(candidates: string[]): Promise<Set<string>> {
  if (candidates.length === 0) return new Set()
  const rows = await db.select({ name: tags.name }).from(tags).where(inArray(tags.name, candidates))
  return new Set(rows.map((row) => row.name))
}
