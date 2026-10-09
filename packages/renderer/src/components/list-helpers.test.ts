import { describe, expect, it } from 'vitest'
import type { DocumentSummary } from '@mimir/shared'
import {
  excerptText,
  formatMeta,
  readLibraryLayout,
  scopeParams,
  writeLibraryLayout,
} from './list-helpers'

/**
 * 库卡片的渲染规则（`docs/DESIGN.md` §8.2、§8.3，`docs/TECH.md` §13）。
 *
 * 这些是纯函数，但它们守的是**界面上说不说实话**：
 * 一份还没解析出正文的文件，列表里那第二行写什么。
 * 写成空白等于说「这篇没有内容」，而它其实有内容、只是还没提取——
 * 与热力图把「用量未上报」画成空底是同一类错误（PRD §5.11 的规矩）。
 */

function doc(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id: 'doc1',
    kind: 'file',
    status: 'ready',
    title: '报告.pdf',
    excerpt: '',
    tags: [],
    path: null,
    url: null,
    mime: 'application/pdf',
    size: 1024 * 1024 * 2.4,
    folder: null,
    createdAt: '2026-09-24T00:00:00.000Z',
    updatedAt: '2026-09-24T00:00:00.000Z',
    ...overrides,
  }
}

describe('列表项的第二行（摘要）', () => {
  it('有正文时用正文摘要', () => {
    expect(excerptText(doc({ excerpt: '本报告回顾了 2025 财年…' }))).toBe('本报告回顾了 2025 财年…')
  })

  /**
   * M1-E 之前 PDF 是「还没有实现」（`planned`），列表里说「将在后续支持」。
   * 它现在**有实现**了（`plugins/parser/src/pdf.ts`），所以同一个输入走
   * `now` 那条分支——空正文的原因变成「文件里没有可提取的文字」，
   * 而 `parseSupport` 的三态结构仍在（`planned` 那一档现在是空集，
   * `none` 由下面的未知格式覆盖）。
   *
   * 断言改成了**新的真相**，而用例守的东西没变：**第二行永远不能留白**。
   *
   * 这里**不测 `parse_error` 的具体文案**：列表拿到的是 `DocumentSummary`，
   * 而它没有这个字段（那是 `DocumentDetail` 的）。具体失败原因显示在
   * 文档详情里（`FilePreview` 上方那一行）——列表只回答「有没有正文」。
   */
  it('PDF 提取不出正文时，如实说是「没有可提取的文字」而不是留空', () => {
    const text = excerptText(doc({ mime: 'application/pdf' }))
    expect(text).not.toBe('')
    expect(text).not.toContain('后续版本支持')
    expect(text).toContain('没有可提取的文字')
  })

  it('未知格式说「可下载查看」，不假装它有正文', () => {
    const text = excerptText(doc({ mime: 'application/zip', title: '归档.zip' }))
    expect(text).toContain('下载')
  })

  it('空文件单独说「空文件」——它与「还没解析」是两回事', () => {
    expect(excerptText(doc({ mime: 'text/plain', size: 0, title: '空.txt' }))).toBe('空文件')
  })

  it('提取得出正文但内容为空时，说清楚是文件里没有文字', () => {
    const text = excerptText(doc({ mime: 'text/plain', title: '只有空格.txt', size: 12 }))
    expect(text).toContain('没有可提取的文字')
  })

  it('笔记与抓取的资料为空时如实说「还没有内容」——那是真的出了问题', () => {
    expect(excerptText(doc({ kind: 'note', mime: null, size: null }))).toBe('（还没有内容）')
    expect(excerptText(doc({ kind: 'web', mime: null, size: null }))).toBe('（还没有内容）')
  })
})

describe('元信息行的格式与大小', () => {
  it('上传件显示「格式 · 大小」', () => {
    expect(formatMeta(doc())).toBe('PDF · 2.4 MB')
  })

  it('Word / Excel / PPT 用能念的名字，不显示 MIME 原文', () => {
    expect(
      formatMeta(
        doc({ mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      ),
    ).toBe('Word · 2.4 MB')
    expect(
      formatMeta(
        doc({ mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      ),
    ).toBe('Excel · 2.4 MB')
  })

  it('笔记与抓取的资料没有这一项（返回 null，不显示空括号）', () => {
    expect(formatMeta(doc({ kind: 'note', mime: null, size: null }))).toBeNull()
    expect(formatMeta(doc({ kind: 'web', mime: null, size: null }))).toBeNull()
  })

  it('认不出的类型回落到扩展名大写', () => {
    expect(formatMeta(doc({ mime: 'application/octet-stream', title: '数据.dat' }))).toBe(
      'DAT · 2.4 MB',
    )
  })
})

describe('scope 与筛选条件', () => {
  /**
   * 状态维度已整体退役（收件箱随 D-054、归档随 D-065），scope 只剩
   * 目录与标签两条独立条件。
   * **认不出的 scope 必须回落到「全部」**（空条件）而不是报错或什么都不返回
   * ——URL 里带着旧链接（`scope=inbox`、`scope=archived`）进来时要看到
   * 全部文档，而不是一片空白。
   */
  it('目录与标签各是一条独立条件', () => {
    expect(scopeParams('folder:技术/前端')).toEqual({ folder: '技术/前端' })
    expect(scopeParams('tag:react')).toEqual({ tag: 'react' })
  })

  it('全部文档不带任何条件', () => {
    expect(scopeParams('all')).toEqual({})
  })

  it('认不出的 scope（含已退役的 inbox / archived）回落到全部', () => {
    expect(scopeParams('inbox')).toEqual({})
    expect(scopeParams('archived')).toEqual({})
    expect(scopeParams('nonsense')).toEqual({})
  })
})

describe('库视图的布局偏好', () => {
  /**
   * 布局是纯客户端偏好（D-067），存 localStorage。守三条：
   * 值要能往返、**非法值必须回落卡片**（手改或旧版本的值不能炸掉页面）、
   * 存储被禁时（抛错）同样回落而不是崩。
   */
  it('默认是卡片，读写能往返', () => {
    expect(readLibraryLayout()).toBe('card')
    writeLibraryLayout('list')
    expect(readLibraryLayout()).toBe('list')
    writeLibraryLayout('card')
    expect(readLibraryLayout()).toBe('card')
  })

  it('非法值回落卡片', () => {
    localStorage.setItem('mimir.library-layout', 'table')
    expect(readLibraryLayout()).toBe('card')
  })
})
