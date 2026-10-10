import type { Citation, Trace } from '@mimir/shared'
import { SEARCH_ONLY_RESULT_TEXT } from '@mimir/shared'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TraceDisclosure } from './TraceActivity.js'
import { CitationList } from './CitationList.js'
import { copyAnswerText } from './AnswerActions.js'
import { FailureCard } from './FailureNotice.js'
import { MarkdownPart } from './MarkdownPart.js'
import { FilePart, ImagePart, SourcePart } from './MediaParts.js'
import { ReasoningPart } from './ReasoningPart.js'
import { ToolCallPart } from './ToolCallPart.js'

/**
 * 展示件的形状（不挂引擎，直接渲染）。
 *
 * 这一层测的是**渲染规则**，与「数据从哪来」分开（后者由
 * `data-parts.ts` / `ChatPanel.test.tsx` 管）。分开的理由是它们各自会变
 * 而原因不同：形状变是因为设计变了，数据路径变是因为架构变了。
 */
describe('TraceDisclosure', () => {
  const trace: Trace = {
    rounds: 2,
    tools: 3,
    tookMs: 4210,
    steps: [
      { icon: 'think', text: '先把问题拿去知识库里找相关内容' },
      { icon: 'search', text: '通道召回结果', keywords: ['组件'], meta: '词级召回 3 段' },
      { icon: 'check', text: '确认没有遗漏，生成回答' },
    ],
  }

  it('没有 trace 且不 live 时什么都不渲染', () => {
    const html = renderToString(createElement(TraceDisclosure, { trace: null }))
    expect(html).toBe('')
  })

  it('live 且还没有 trace 时是「正在检索知识库」', () => {
    const html = renderToString(createElement(TraceDisclosure, { trace: null, live: true }))
    expect(html).toContain('正在检索知识库')
  })

  it('有 trace 时摘要给服务端的真实数字', () => {
    const html = renderToString(createElement(TraceDisclosure, { trace, live: false }))
    expect(html).toContain('思考')
    expect(html).toContain('4.2s')
    /* 步骤明细在折叠内容里（antd 默认不渲染收起的内容，但 Collapse 的
       activeKey 由 expanded 驱动——这里只要摘要对得上） */
    expect(html).toContain('2')
    expect(html).toContain('3')
  })

  it('live 时摘要里是客户端的秒数而不是服务端的毫秒', () => {
    const html = renderToString(createElement(TraceDisclosure, { trace, live: true }))
    /* 0s 起算的客户端钟：服务端那个 4210ms 在这时不该出现 */
    expect(html).toContain('0s')
    expect(html).not.toContain('4.2s')
  })
})

describe('CitationList', () => {
  const citations: Citation[] = [
    {
      documentId: 'd1',
      kind: 'note',
      title: '组件性能优化',
      snippet: '片段一',
      start: 0,
      end: 3,
      matchedBy: ['keyword', 'vector'],
    },
    {
      documentId: 'd2',
      kind: 'file',
      title: '另一篇',
      snippet: '片段二',
      start: 10,
      end: 13,
      matchedBy: ['unknown-channel'],
    },
  ]

  it('空数组什么都不渲染（不占位）', () => {
    expect(renderToString(createElement(CitationList, { citations: [], onOpen: () => {} }))).toBe(
      '',
    )
  })

  it('命中通道翻成中文，未知的原样显示', () => {
    const html = renderToString(createElement(CitationList, { citations, onOpen: () => {} }))
    expect(html).toContain('词级召回 + 向量')
    /* 注册表里将来多出来的通道没有对应词就原样显示 id——
       那比编一个名字诚实 */
    expect(html).toContain('unknown-channel')
    expect(html).toContain('组件性能优化')
  })

  it('引用摘要展示 Markdown 内容，保留原文卡的跳转入口', () => {
    const formatted: Citation = {
      ...citations[0]!,
      snippet: '# 标题\n**关键结论**与 `代码`。',
    }
    const html = renderToString(
      createElement(CitationList, { citations: [formatted], onOpen: () => {} }),
    )
    expect(html).toContain('标题 关键结论与 代码')
    expect(html).not.toContain('**关键结论**')
    expect(html).toContain('<button')
  })
})

describe('复制回答', () => {
  const citation: Citation = {
    documentId: 'doc-1',
    kind: 'note',
    title: '来源笔记',
    snippet: '这是可复制的原文。',
    start: 0,
    end: 10,
    matchedBy: ['keyword'],
  }

  it('只检索结果复制原文与来源链接', () => {
    const copied = copyAnswerText(SEARCH_ONLY_RESULT_TEXT, [citation])
    expect(copied).toContain(citation.snippet)
    expect(copied).toContain('[来源笔记](/doc/doc-1)')
    expect(copied).not.toContain(SEARCH_ONLY_RESULT_TEXT)
  })

  it('普通模型回答和旧历史文本按原样复制', () => {
    expect(copyAnswerText('模型回答 [1]', [citation])).toBe('模型回答 [1]')
    expect(copyAnswerText('旧版检索回答', [citation])).toBe('旧版检索回答')
  })
})

describe('FailureCard', () => {
  it('每类失败的出路不同，且未实现的按钮真的 disabled', () => {
    const quota = renderToString(
      createElement(FailureCard, {
        failure: 'quota',
        onSearchOnly: () => {},
        onRetry: () => {},
      }),
    )
    expect(quota).toContain('模型请求受限')
    expect(quota).toContain('只检索，不调模型')
    /* 「换一个模型」「去充值」没有实现——按钮保留（PRD §5.8 要求说清
       「还能做什么」），但真的禁用 */
    expect(quota).toContain('disabled')
  })

  it('历史轮的说明那一行只在 deepReasoningKnown 为假时出现', () => {
    const known = renderToString(
      createElement(FailureCard, {
        failure: 'timeout',
        deepReasoningKnown: true,
        onSearchOnly: () => {},
        onRetry: () => {},
      }),
    )
    const unknown = renderToString(
      createElement(FailureCard, {
        failure: 'timeout',
        deepReasoningKnown: false,
        onSearchOnly: () => {},
        onRetry: () => {},
      }),
    )
    expect(known).not.toContain('历史记录')
    expect(unknown).toContain('历史记录')
  })
})

describe('MarkdownPart', () => {
  it('渲染 markdown，代码块带上语言与复制按钮', () => {
    const html = renderToString(
      createElement(MarkdownPart, { text: '正文\n\n```ts\nconst a = 1\n```\n' }),
    )
    expect(html).toContain('正文')
    expect(html).toContain('const a = 1')
    expect(html).toContain('复制代码')
    expect(html).toContain('ts')
  })

  it('流式半截的标题/列表项不留空壳', () => {
    /**
     * 这是 `streamingMarkdownExtension` 的作用（实测它对「末尾占位」的处理）：
     * 半截的 `## ` 会被解析成一个空 h2、半截的 `- ` 会变成一个空 li——
     * 两者都会在回答还在写的时候闪出空行。那个 extension 把它们裁掉。
     *
     * 断言盯的是「没有空壳」，不是「星号不显示」——半截的 `**加粗`
     * 两种情况下都原样显示（实测），那是 markdown 的正常行为。
     */
    const html = renderToString(createElement(MarkdownPart, { text: '一\n\n- 第一点\n- ' }))
    expect(html).toContain('第一点')
    expect(html).not.toContain('<li></li>')
    expect(html).not.toContain('<h2></h2>')
  })

  it('半截的代码块也照常渲染（语言名与复制都在）', () => {
    const html = renderToString(createElement(MarkdownPart, { text: '```ts\nconst a = 1' }))
    expect(html).toContain('复制代码')
    expect(html).toContain('const a = 1')
  })
})

/**
 * 把一棵 React 树渲染成 HTML 字符串。
 *
 * 用 `react-dom/server` 而不是挂到 DOM 上：这些用例只看**形状**
 * （文案、数字、属性），不需要交互——交互那条路在 `ChatPanel.test.tsx`
 * 里用真的 root 走（那里有 act 与卸载）。静态渲染不需要 act、
 * 用例之间也不互相影响。
 */
const renderToString = (element: ReturnType<typeof createElement>): string =>
  renderToStaticMarkup(element)

/**
 * AG-UI 的每一种消息体类型都要有渲染 —— 「不静默消失」的守卫。
 *
 * 引擎平台默认组件是 `() => null`：`MessageItem` 的 parts 组件表漏掉哪一
 * 种，那一种就在界面上消失（不报错）。这一组按「渲染出什么」钉住每一类，
 * 防止将来换皮时又把某一种接丢了（D-099 收尾的交付物之一）。
 */
describe('AG-UI part 类型（每一种都渲染）', () => {
  it('reasoning：模型思考按官方 Reasoning 形态渲染（折叠标签 + live 展开）', () => {
    /* complete 时默认折叠（官方 defaultOpen=false）——只出标签 */
    const collapsed = renderToString(
      createElement(ReasoningPart, {
        type: 'reasoning',
        text: '先看检索到的段落，再决定怎么答。',
        status: { type: 'complete', reason: 'stop' },
        index: 0,
      } as never),
    )
    expect(collapsed).toContain('模型思考')
    expect(collapsed).not.toContain('先看检索到的段落')

    /* 还在流时默认展开（live）——标签带秒数、正文可读 */
    const live = renderToString(
      createElement(ReasoningPart, {
        type: 'reasoning',
        text: '先看检索到的段落，再决定怎么答。',
        status: { type: 'running' },
        index: 0,
      } as never),
    )
    expect(live).toContain('模型思考')
    expect(live).toContain('0s')
    expect(live).toContain('先看检索到的段落')
  })

  it('tool-call：官方 ToolFallback 形态（Used tool: 名字 + 可展开的 Args/Result）', () => {
    const html = renderToString(
      createElement(ToolCallPart, {
        type: 'tool-call',
        toolCallId: 't1',
        toolName: 'search_docs',
        args: { query: '组件' },
        argsText: '{"query":"组件"}',
        result: { hits: 3 },
        status: { type: 'complete' },
        index: 0,
      } as never),
    )
    expect(html).toContain('Used tool')
    expect(html).toContain('search_docs')
  })

  it('source：官方 Sources pill 形态（徽标 + 标题）', () => {
    const html = renderToString(
      createElement(SourcePart, {
        type: 'source',
        sourceType: 'url',
        id: 's1',
        url: 'https://example.com/a',
        title: '示例来源',
        index: 0,
      } as never),
    )
    expect(html).toContain('示例来源')
    expect(html).toContain('E')
  })

  it('file：官方 file chip 形态（文件名 + 下载钮）', () => {
    const html = renderToString(
      createElement(FilePart, {
        type: 'file',
        mimeType: 'application/pdf',
        filename: '报告.pdf',
        data: 'aGVsbG8=',
        index: 0,
      } as never),
    )
    expect(html).toContain('报告.pdf')
    expect(html).toContain('下载')
  })

  it('image：图片块渲染出 img', () => {
    const html = renderToString(
      createElement(ImagePart, {
        type: 'image',
        image: 'data:image/png;base64,aGVsbG8=',
        index: 0,
      } as never),
    )
    expect(html).toContain('<img')
  })
})
