import { createHash } from 'node:crypto'
import { tokenize } from '@mimir/tokenizer'

/** 正文哈希。用于判断内容是否变化，决定要不要重新解析/重新嵌入。 */
export function contentHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 32)
}

/**
 * 列表与搜索结果用的纯文本摘要。
 * 去掉 Markdown 语法标记，让预览读起来是「内容」而不是「源码」。
 */
export function toExcerpt(markdown: string, maxLength = 200): string {
  const plain = markdown
    // 围栏代码块整体丢掉
    .replace(/```[\s\S]*?```/g, ' ')
    // 行内代码保留内容
    .replace(/`([^`]*)`/g, '$1')
    // 图片整体丢掉，链接只留文字
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (plain.length <= maxLength) return plain
  return `${plain.slice(0, maxLength).trimEnd()}…`
}

/**
 * 把用户输入变成安全的文件名片段。
 * 保留中文——文件系统支持，而且可读性远好于音译。
 */
export function slugify(title: string, maxLength = 60): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[\s/\\:*?"<>|]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')

  return slug.slice(0, maxLength) || 'untitled'
}

/**
 * 正文里出现次数最多的关键词。M0 用它做标签建议，不调用模型。
 *
 * 必须复用 jieba 分词，不能用一个贪婪正则去抓「连续汉字」——
 * 后者会把整句「组件很重要」当成一个词，得到的建议完全没法用。
 */
export function topTerms(markdown: string, limit = 8): string[] {
  const stop = new Set([
    '的',
    '了',
    '和',
    '是',
    '在',
    '我',
    '有',
    '就',
    '不',
    '也',
    '都',
    '而',
    '及',
    '与',
    '这',
    '那',
    '你',
    '他',
    '它',
    '们',
    '上',
    '下',
    '中',
    '为',
    '以',
    '对',
    'the',
    'a',
    'an',
    'and',
    'or',
    'of',
    'to',
    'in',
    'is',
    'it',
    'for',
    'on',
    'this',
    'that',
    'with',
    'as',
    'be',
    'are',
    'was',
    'by',
    'at',
    'from',
  ])

  // 只统计正文，不统计代码块——代码里的标识符不是「主题词」
  const prose = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ')
  const counts = new Map<string, number>()

  for (const token of tokenize(prose)) {
    const term = token.toLowerCase()
    if (stop.has(term)) continue
    if (/^[\p{Script=Han}]+$/u.test(term)) {
      // 单个汉字信息量太低，不做建议
      if (term.length < 2) continue
    } else if (!/^[a-z][a-z0-9+#.-]{1,}$/.test(term)) {
      continue
    }
    counts.set(term, (counts.get(term) ?? 0) + 1)
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term]) => term)
}
