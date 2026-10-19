import { Markdown } from '@tanstack/markdown/react'
import { streamingMarkdownExtension } from '@tanstack/markdown/extensions/streaming'
import type { MarkdownComponents } from '@tanstack/markdown/react'
import { CodeBlock } from './CodeBlock.js'

/**
 * 消息正文的 Markdown。
 *
 * TanStack Markdown 负责真实流式语法；排版消费 Mimir 主题。
 *
 * ## 组件表必须在模块级
 *
 * `Markdown` 的 `components` 是**普通对象**，每次渲染新建一个会让它
 * 内部的重建判断失效（等于每次消息更新都重挂整棵子树）。提到模块级常量，
 * 身份稳定。
 *
 * ## 流式那一份 extension 不能省
 *
 * `streamingMarkdownExtension()` 让「还没写完的 markdown」也能渲染——
 * 少了它，一个刚写到一半的 `**加粗` 会在界面上闪出星号。这是流的常态，
 * 不是边界情况。
 */
const STREAMING = [streamingMarkdownExtension()]

const COMPONENTS: MarkdownComponents = {
  pre: CodeBlock,
}

export function MarkdownPart({ text }: { text: string }) {
  return (
    <Markdown frontmatter={false} headingIds={false} extensions={STREAMING} components={COMPONENTS}>
      {text}
    </Markdown>
  )
}
