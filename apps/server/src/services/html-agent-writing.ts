import { getDocument } from './documents.js'
import { documentAgentFormatOf } from './document-agent-format.js'
import { callChat, modelReady, streamChat } from './model.js'

export interface HtmlPageBrief {
  title: string
  tone: string
  audience: string
  sections: Array<{ title: string; purpose: string }>
}

export interface HtmlPagePlanInput {
  documentId: string
  mode: 'new' | 'redesign' | 'restyle' | 'extract'
  instruction: string
  notes?: string
  currentSource?: string
  signal?: AbortSignal
}

export interface HtmlPageWriteInput {
  documentId: string
  kind: 'design' | 'content'
  instruction: string
  brief?: HtmlPageBrief
  title?: string
  plan?: string
  context?: string
  signal?: AbortSignal
}

const PAGE_LIMIT = 200_000

async function requireHtml(documentId: string): Promise<void> {
  const document = await getDocument(documentId)
  if (!document || documentAgentFormatOf(document) !== 'html')
    throw new Error('当前文档不是可编辑的 HTML 原件')
  if (!(await modelReady('chat'))) throw new Error('请先配置可用的聊天模型')
}

/** Draft only. The client must show this to the user and wait for a confirmed brief. */
export async function planHtmlPage(input: HtmlPagePlanInput): Promise<HtmlPageBrief> {
  await requireHtml(input.documentId)
  const response = await callChat({
    role: 'chat',
    source: 'chat',
    refId: input.documentId,
    stream: false,
    messages: [{ role: 'user', content: input.instruction.slice(0, 4000) }],
    systemPrompts: [
      '为 HTML 页面拟定简短设计提纲。只输出 JSON 对象：title、tone、audience、sections 数组（每项 title、purpose）。根据用户要求和提供的现有源码，不得编造事实。',
      `模式：${input.mode}。补充说明：${(input.notes ?? '').slice(0, 2000)}。现有源码：${(input.currentSource ?? '').slice(0, 8000)}`,
    ],
    ...(input.signal ? { abortSignal: input.signal } : {}),
  })
  const json = response.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('页面规划结果不是有效 JSON，请重试')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('页面规划缺少设计提纲')
  const value = parsed as Record<string, unknown>
  if (
    typeof value.title !== 'string' ||
    typeof value.tone !== 'string' ||
    typeof value.audience !== 'string' ||
    !Array.isArray(value.sections) ||
    value.sections.length < 1 ||
    value.sections.length > 20 ||
    !value.sections.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof item.title === 'string' &&
        typeof item.purpose === 'string',
    )
  )
    throw new Error('页面规划字段无效，请重试')
  return {
    title: value.title.slice(0, 200),
    tone: value.tone.slice(0, 400),
    audience: value.audience.slice(0, 400),
    sections: value.sections.map((item: { title: string; purpose: string }) => ({
      title: item.title.slice(0, 200),
      purpose: item.purpose.slice(0, 1000),
    })),
  }
}

/** Generate a complete HTML document. The editor applies it only after version and user confirmation checks. */
export async function writeHtmlDocument(
  input: HtmlPageWriteInput,
): Promise<{ html: string; complete: true }> {
  await requireHtml(input.documentId)
  if (input.kind === 'design' && !input.brief) throw new Error('设计页面需要已确认的提纲')
  if (input.kind === 'content' && !input.plan?.trim()) throw new Error('长文写作需要写作计划')
  const system =
    input.kind === 'design'
      ? '你是 HTML 页面设计写作者。根据已确认提纲创建完整、响应式的单文件页面。使用语义元素、统一色彩与字体变量、恰当留白和完整内容。不要编造事实。'
      : '你是 HTML 文档写作者。根据计划撰写完整单栏文章或指南。使用语义标题、段落、列表和必要的表格，不要编造事实。'
  const chunks = await streamChat({
    role: 'chat',
    source: 'chat',
    refId: input.documentId,
    stream: true,
    messages: [{ role: 'user', content: input.instruction.slice(0, 4000) }],
    systemPrompts: [
      system,
      '只输出完整 HTML；从 <!doctype html> 开始到 </html> 结束。包含 html lang、head 的 charset、viewport、title 与一个 style，不能输出 Markdown 围栏、外部脚本或未经提供的远程资源。',
      input.kind === 'design'
        ? `已确认提纲：${JSON.stringify(input.brief)}`
        : `标题：${input.title ?? ''}\n计划：${input.plan?.slice(0, 4000) ?? ''}\n参考材料：${(input.context ?? '').slice(0, 8000)}`,
    ],
    ...(input.signal ? { abortSignal: input.signal } : {}),
  })
  let html = ''
  for await (const chunk of chunks) {
    if (input.signal?.aborted) throw new Error('页面写作已取消')
    if (chunk.type === 'RUN_ERROR') throw new Error(chunk.message)
    if (chunk.type !== 'TEXT_MESSAGE_CONTENT') continue
    html += chunk.delta
    if (html.length > PAGE_LIMIT) throw new Error('页面超出 200000 字符限制，未写入画布')
  }
  const start = html.search(/<!doctype\s|<html[\s>]/i)
  if (start > 0) html = html.slice(start)
  const end = html.toLowerCase().lastIndexOf('</html>')
  if (end < 0) throw new Error('页面生成未完成，画布未修改；可缩短计划重试')
  html = html.slice(0, end + 7).trim()
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html))
    throw new Error('页面生成结果不是完整 HTML，画布未修改')
  return { html, complete: true }
}
