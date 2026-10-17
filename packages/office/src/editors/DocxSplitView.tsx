import { createElement, useMemo, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { PmDocJson } from '../docx.js'
import type { NumberingDef } from '../../vendor/packages/docx-engine/src/types.js'
import { ToolbarButton } from '../shell/EditorShell.js'
import { keyedCompareItems } from './docx-compare.js'
import {
  docxReadonlyBody,
  type ReadonlyBlock as ReadonlyBlockModel,
  type ReadonlyParagraph,
  type ReadonlyRun,
} from './docx-readonly.js'
import './docx-compare-split.css'
/** Only the local whitelist AST reaches React; raw PM attrs and links never reach the DOM. */
function Run({ run }: { run: ReadonlyRun }) {
  let content: ReactNode = run.break ? <br /> : <span style={run.style}>{run.text}</span>
  for (const tag of run.tags.toReversed()) content = createElement(tag, null, content)
  return content
}
function Paragraph({ paragraph }: { paragraph: ReadonlyParagraph }) {
  const content = keyedCompareItems(paragraph.runs).map(({ value: run, key }) => (
    <Run key={key} run={run} />
  ))
  if (paragraph.list) {
    const Tag = paragraph.list === 'ordered' ? 'ol' : 'ul'
    return (
      <Tag
        className="mimir-docx-split__list"
        style={{ marginInlineStart: (paragraph.listLevel ?? 0) * 18 }}
      >
        <li style={paragraph.style}>
          {paragraph.marker && <span className="mimir-docx-split__marker">{paragraph.marker}</span>}
          {content.length ? content : <br />}
        </li>
      </Tag>
    )
  }
  const level = paragraph.level
  return createElement(
    level && level <= 6 ? `h${level}` : level ? 'div' : 'p',
    {
      style: paragraph.style,
      ...(level
        ? { role: 'heading', 'aria-level': level, className: 'mimir-docx-split__heading' }
        : {}),
    },
    content.length ? content : <br />,
  )
}
function ReadonlyBlock({ block }: { block: ReadonlyBlockModel }) {
  return block.kind === 'paragraph' ? (
    <Paragraph paragraph={block} />
  ) : (
    <table style={block.style}>
      <tbody>
        {keyedCompareItems(block.rows).map(({ value: row, key: rowKey }) => (
          <tr key={rowKey}>
            {keyedCompareItems(row).map(({ value: cell, key: cellKey }) => {
              const Tag = cell.header ? 'th' : 'td'
              return (
                <Tag key={cellKey} colSpan={cell.colSpan} rowSpan={cell.rowSpan} style={cell.style}>
                  {keyedCompareItems(cell.paragraphs).map(({ value: paragraph, key }) => (
                    <Paragraph key={key} paragraph={paragraph} />
                  ))}
                </Tag>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
export function DocxSplitView({
  doc,
  numbering,
  onClose,
}: {
  doc: PmDocJson | null
  numbering?: Map<string, NumberingDef>
  onClose: () => void
}) {
  const preview = useMemo(() => {
    try {
      return { body: doc ? docxReadonlyBody(doc, numbering) : null, error: '' }
    } catch (cause) {
      return { body: null, error: cause instanceof Error ? cause.message : '正文预览不可用' }
    }
  }, [doc, numbering])
  return (
    <section
      className="mimir-docx-split"
      aria-label="拆分只读副本"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <header>
        <div>
          <h2>只读副本</h2>
          <span>连续排版 · 正文格式预览</span>
        </div>
        <ToolbarButton label="关闭拆分视图" onClick={onClose}>
          <X size={14} />
        </ToolbarButton>
      </header>
      <div
        className="me-scroll mimir-docx-split__scroll"
        tabIndex={0}
        role="region"
        aria-label="只读副本正文"
      >
        {preview.error && <p role="status">{preview.error}</p>}
        {!!preview.body?.unsupportedMarkers && (
          <p className="mimir-docx-compare__note" role="status">
            {preview.body.unsupportedMarkers} 个列表标记暂未显示，原编号保留。
          </p>
        )}
        {!!preview.body?.excluded && (
          <p className="mimir-docx-compare__note">
            {preview.body.excluded} 个复杂对象或引用未显示（含嵌套表格）。
          </p>
        )}
        {keyedCompareItems(preview.body?.blocks ?? []).map(({ value: block, key }) => (
          <ReadonlyBlock key={key} block={block} />
        ))}
      </div>
    </section>
  )
}
