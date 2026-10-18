import { useEffect, useState, type ReactNode } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { protectedDownload } from '../lib/files'
import { origin } from '../lib/storage'
import { openReader } from '../lib/navigation'
import { errorMessage } from '../lib/api'

interface LinkTarget {
  id: string
  title: string
}
export interface MarkdownBlock {
  kind: 'heading' | 'paragraph' | 'code' | 'quote' | 'list' | 'table' | 'image' | 'rule'
  text: string
  start: number
  end: number
  level?: number
  source?: string
}
/** The original Markdown is never rewritten; display nodes are disposable derived data. */
export function markdownBlocks(body: string): MarkdownBlock[] {
  const lines = body.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)?.filter(Boolean) || []
  const blocks: MarkdownBlock[] = []
  let offset = 0
  let index = 0
  while (index < lines.length) {
    const raw = lines[index]!
    const line = raw.replace(/[\r\n]+$/, '')
    if (!line.trim()) {
      offset += raw.length
      index++
      continue
    }
    const start = offset
    let text = line
    let kind: MarkdownBlock['kind'] = 'paragraph'
    let level: number | undefined
    let source: string | undefined
    const fence = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence) {
      kind = 'code'
      const marker = fence[1]![0]!
      const size = fence[1]!.length
      index++
      offset += raw.length
      const content: string[] = []
      while (index < lines.length) {
        const next = lines[index]!
        const bare = next.replace(/[\r\n]+$/, '')
        index++
        offset += next.length
        if (new RegExp(`^\\s*${marker}{${size},}\\s*$`).test(bare)) break
        content.push(bare)
      }
      blocks.push({ kind, text: content.join('\n'), start, end: offset })
      continue
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    const image = /^!\[([^\]]*)\]\(([^\s)]+)(?:\s+[^)]*)?\)\s*$/.exec(line)
    if (heading) {
      kind = 'heading'
      level = heading[1]!.length
      text = heading[2]!
    } else if (image) {
      kind = 'image'
      text = image[1] || '资料图片'
      source = image[2]
    } else if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) kind = 'rule'
    else if (/^\s*>/.test(line)) {
      kind = 'quote'
      text = line.replace(/^\s*>\s?/, '')
    } else if (/^\s*(?:[-*+] |\d+[.)] )/.test(line)) kind = 'list'
    else if (
      line.includes('|') &&
      index + 1 < lines.length &&
      /^\s*\|?\s*:?-{3,}/.test(lines[index + 1]!)
    ) {
      kind = 'table'
      index++
      offset += raw.length
      const rows = [line]
      offset += lines[index]!.length
      index++
      while (index < lines.length && lines[index]!.includes('|') && lines[index]!.trim()) {
        rows.push(lines[index]!.replace(/[\r\n]+$/, ''))
        offset += lines[index]!.length
        index++
      }
      blocks.push({ kind, text: rows.join('\n'), start, end: offset })
      continue
    }
    index++
    offset += raw.length
    if (kind === 'paragraph') {
      while (
        index < lines.length &&
        lines[index]!.trim() &&
        !/^\s*(?:#{1,6}\s|>|[-*+] |\d+[.)] |```|~~~|!\[)/.test(lines[index]!)
      ) {
        text += '\n' + lines[index]!.replace(/[\r\n]+$/, '')
        offset += lines[index]!.length
        index++
      }
    }
    blocks.push({ kind, text, start, end: offset, level, source })
  }
  return blocks
}
async function externalLink(url: string) {
  const local = origin && url.startsWith(origin + '/') ? url.slice(origin.length) : url
  const documentLink = /^\/doc\/([^/?#]+)(?:[?#].*)?$/.exec(local)
  if (documentLink) {
    try {
      await openReader(decodeURIComponent(documentLink[1]!))
    } catch {
      await Taro.showToast({ title: '资料链接无效或无法打开', icon: 'none' })
    }
    return
  }
  if (!/^https?:\/\//i.test(url)) {
    await Taro.showModal({
      title: '无法打开此链接',
      content: '仅支持 HTTP/HTTPS 来源链接。',
      showCancel: false,
    })
    return
  }
  const result = await Taro.showModal({
    title: '外部链接',
    content: url,
    confirmText: '复制链接',
    cancelText: '返回',
  })
  if (result.confirm) await Taro.setClipboardData({ data: url })
}
function inline(
  text: string,
  links: LinkTarget[],
  citation?: (index: number) => void,
): ReactNode[] {
  const pattern =
    /\[\[([^\]]+)\]\]|\[([^\]]+)\]\(([^\s)]+)(?:\s+[^)]*)?\)|`([^`]+)`|\*\*([^*]+)\*\*|\[(\d+)\]/g
  const result: ReactNode[] = []
  let previous = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    if (match.index > previous) result.push(text.slice(previous, match.index))
    const key = match.index
    if (match[1]) {
      const parts = match[1].split('|')
      const target = links.find((item) => item.id === parts[0] || item.title === parts[0])
      result.push(
        <Text
          key={key}
          className="md-link"
          onClick={() => {
            if (target) void openReader(target.id)
            else void Taro.showToast({ title: '此内链暂无可用目标', icon: 'none' })
          }}
        >
          {parts[1] || parts[0]}
        </Text>,
      )
    } else if (match[2] && match[3]) {
      const url = match[3]
      result.push(
        <Text
          key={key}
          className="md-link"
          onClick={() => {
            void externalLink(url)
          }}
        >
          {match[2]}
        </Text>,
      )
    } else if (match[4])
      result.push(
        <Text key={key} className="inline-code">
          {match[4]}
        </Text>,
      )
    else if (match[5])
      result.push(
        <Text key={key} className="strong">
          {match[5]}
        </Text>,
      )
    else if (match[6] && citation) {
      const number = Number(match[6])
      result.push(
        <Text key={key} className="citation-number" onClick={() => citation(number - 1)}>
          [{number}]
        </Text>,
      )
    } else result.push(match[0])
    previous = pattern.lastIndex
  }
  result.push(text.slice(previous))
  return result
}
function MarkdownImage({ source, alt }: { source: string; alt: string }) {
  const [src, setSrc] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    setSrc('')
    setError('')
    const relative =
      origin && source.startsWith(origin + '/') ? source.slice(origin.length) : source
    const protectedPath = /^\/api\/miniapp\/documents\/[^/]+\/file$/.test(relative)
      ? relative.slice('/api/miniapp'.length)
      : null
    if (protectedPath)
      protectedDownload(protectedPath)
        .then((path) => {
          if (live) setSrc(path)
        })
        .catch((error) => {
          if (live) setError(errorMessage(error))
        })
    else if (/^https:\/\//i.test(source) && !relative.startsWith('/api/')) setSrc(source)
    else setError('图片地址暂不支持在微信中显示。')
    return () => {
      live = false
    }
  }, [source])
  if (error)
    return (
      <View className="image-fallback">
        <Text>{alt} · 图片不可用</Text>
        <Text className="block muted">{error}</Text>
        <Text
          className="md-link"
          onClick={() => {
            void Taro.setClipboardData({ data: source })
          }}
        >
          复制图片来源
        </Text>
      </View>
    )
  return (
    <View className="md-image-wrap">
      {src ? (
        <Image
          src={src}
          mode="widthFix"
          className="md-image"
          onError={() => setError('可能是来源防盗链、微信域名限制或链接失效。')}
        />
      ) : (
        <Text className="muted">正在读取图片…</Text>
      )}
      {alt && <Text className="image-caption">{alt}</Text>}
    </View>
  )
}
export function Markdown({
  body,
  links = [],
  highlight,
  onCitation,
}: {
  body: string
  links?: LinkTarget[]
  highlight?: { start: number; end: number }
  onCitation?: (index: number) => void
}) {
  return (
    <View className="markdown">
      {markdownBlocks(body).map((block, index) => {
        const active = highlight && block.start < highlight.end && block.end > highlight.start
        return (
          <View
            key={`${index}:${block.start}`}
            id={`md-block-${index}`}
            className={`md-block md-${block.kind}${active ? ' source-highlight' : ''}`}
          >
            {block.kind === 'rule' ? (
              <View className="md-rule-line" />
            ) : block.kind === 'image' ? (
              <MarkdownImage source={block.source || ''} alt={block.text} />
            ) : block.kind === 'table' ? (
              <ScrollView scrollX>
                <View className="md-table">
                  {block.text.split('\n').map((row, rowIndex) => (
                    <View
                      className={`md-table-row${rowIndex === 0 ? ' strong' : ''}`}
                      key={rowIndex}
                    >
                      {row
                        .replace(/^\s*\||\|\s*$/g, '')
                        .split('|')
                        .map((cell, cellIndex) => (
                          <Text selectable className="md-table-cell" key={cellIndex}>
                            {cell.trim()}
                          </Text>
                        ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <Text
                selectable
                className={
                  block.kind === 'heading'
                    ? `md-heading md-h${block.level}`
                    : block.kind === 'code'
                      ? 'code-text'
                      : ''
                }
              >
                {block.kind === 'code' ? block.text : inline(block.text, links, onCitation)}
              </Text>
            )}
          </View>
        )
      })}
    </View>
  )
}
