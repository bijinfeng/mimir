import { useEffect, useRef, useState } from 'react'
import { closeHistory } from '@tiptap/pm/history'
import { ChevronLeft, ChevronRight, Pencil, X } from 'lucide-react'
import {
  ToolbarButton,
  ToolbarLabel,
  ToolbarNumberField,
  ToolbarSelect,
} from '../shell/EditorShell.js'
import type { DocxHeading } from './docx-view.js'
import {
  assertDocxOutlineTarget,
  captureDocxOutlineTarget,
  docxOutlineLevelReason,
  docxOutlineStaleReason,
  type DocxOutlineContext,
  type DocxOutlineTarget,
} from './docx-outline.js'
export function DocxViewPanel({
  headings,
  page,
  pages,
  paginated,
  onPage,
  onHeading,
  onClose,
  context,
  onEditHeading,
}: {
  headings: DocxHeading[]
  page: number
  pages: number
  paginated: boolean
  onPage: (page: number) => void
  onHeading: (position: number) => void
  onClose: () => void
  context: DocxOutlineContext
  onEditHeading: (position: number) => void
}) {
  const ref = useRef<HTMLElement>(null)
  const [target, setTarget] = useState<DocxOutlineTarget | null>(null)
  const [level, setLevel] = useState('1')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const lifetime = useRef(0)
  useEffect(() => {
    ref.current?.focus()
    return () => {
      lifetime.current += 1
    }
  }, [])
  const stale = target ? docxOutlineStaleReason(target, context) : null
  const access = context.session.protection.getAccess()
  const levelReason = target ? docxOutlineLevelReason(target) : null
  const reason = stale ?? access.reason ?? levelReason
  const choose = (heading: DocxHeading) => {
    try {
      setTarget(captureDocxOutlineTarget(context, heading))
      setLevel(String(heading.level))
      setNotice('')
      onHeading(heading.position)
      const body = ref.current?.querySelector('.mimir-docx-inspector__body')
      if (body) body.scrollTop = 0
    } catch (error) {
      setNotice((error as Error).message)
    }
  }
  const apply = async () => {
    if (!target || busy) return
    const request = lifetime.current
    try {
      assertDocxOutlineTarget(target, context)
      if (levelReason) throw new Error(levelReason)
      const next = Number(level)
      if (next === target.heading.level) return
      setBusy(true)
      context.editor.view.dispatch(closeHistory(context.editor.state.tr))
      const result = await context.handle!.execute(
        'apply_ops',
        {
          ops: [
            {
              op: target.heading.kind === 'outline' ? 'setOutlineLevel' : 'setHeadingLevel',
              target: { blockIndexes: [target.heading.blockIndex] },
              level: next,
            },
          ],
        },
        { expectedVersion: target.version },
      )
      if (lifetime.current !== request) return
      context.editor.view.dispatch(closeHistory(context.editor.state.tr))
      if (result.changed) {
        if (next === 0) setTarget(null)
        else {
          const current = context.editor.state.doc.nodeAt(target.heading.position)!
          setTarget(
            captureDocxOutlineTarget(context, {
              ...target.heading,
              level: next,
              styleName:
                context.session.footnotes.parsed.styles.get(current.attrs.styleId)?.name ?? null,
            }),
          )
        }
      }
      setNotice(result.changed ? '层级已更新，可在正文中撤销。' : '标题层级未变化')
    } catch (error) {
      if (lifetime.current === request) setNotice((error as Error).message)
    } finally {
      if (lifetime.current === request) setBusy(false)
    }
  }
  return (
    <aside
      ref={ref}
      className="mimir-docx-inspector mimir-docx-navigation"
      tabIndex={-1}
      aria-label="文档导航面板"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="mimir-docx-inspector__head">
        <h2>文档导航</h2>
        <ToolbarButton label="关闭文档导航" onClick={onClose}>
          <X size={14} />
        </ToolbarButton>
      </div>
      <div className="mimir-docx-inspector__body">
        {paginated && (
          <div className="mimir-docx-page-navigation" role="group" aria-label="页面导航">
            <ToolbarButton label="上一页" disabled={page <= 1} onClick={() => onPage(page - 1)}>
              <ChevronLeft size={14} />
            </ToolbarButton>
            <ToolbarNumberField
              label="跳转到页"
              min={1}
              max={pages}
              value={page}
              onCommit={onPage}
            />
            <ToolbarLabel>/ {pages}</ToolbarLabel>
            <ToolbarButton label="下一页" disabled={page >= pages} onClick={() => onPage(page + 1)}>
              <ChevronRight size={14} />
            </ToolbarButton>
          </div>
        )}
        {notice && (
          <p className="mimir-docx-navigation__empty" role="status">
            {notice}
          </p>
        )}
        {target && (
          <section className="mimir-docx-outline__target" aria-label="当前标题">
            <h3>当前标题</h3>
            <p className="mimir-docx-outline__title">{target.heading.label}</p>
            <p className="mimir-docx-outline__meta">
              第 {target.heading.blockIndex + 1} 段 · 当前 {target.heading.level} 级
              {target.heading.styleName ? ` · ${target.heading.styleName}` : ''}
            </p>
            <ToolbarButton
              label="编辑标题"
              disabled={!!stale || !access.writable || busy}
              disabledReason={stale ?? access.reason ?? undefined}
              onClick={() => {
                try {
                  assertDocxOutlineTarget(target, context)
                  onEditHeading(target.heading.position)
                } catch (error) {
                  setNotice((error as Error).message)
                }
              }}
            >
              <Pencil size={14} />
              编辑标题
            </ToolbarButton>
            <ToolbarSelect
              label="标题层级"
              value={level}
              disabled={!!reason || busy}
              disabledReason={reason ?? undefined}
              options={Array.from({ length: 10 }, (_, value) => ({
                value: String(value),
                label: value ? `${value} 级` : '正文',
                disabled:
                  value > 0 &&
                  target.heading.kind !== 'outline' &&
                  !context.session.headingLevels.includes(value),
              }))}
              onChange={setLevel}
            />
            {reason && (
              <p className="mimir-docx-navigation__empty" role="status">
                {reason}
              </p>
            )}
          </section>
        )}
        <h3>标题大纲</h3>
        {headings.length ? (
          <nav aria-label="标题大纲">
            <ol>
              {headings.map((heading) => (
                <li
                  key={heading.position}
                  aria-current={
                    !stale && target?.heading.position === heading.position ? 'location' : undefined
                  }
                  data-current={
                    !stale && target?.heading.position === heading.position ? 'true' : undefined
                  }
                  style={{ paddingInlineStart: Math.min(heading.level - 1, 3) * 8 }}
                >
                  <ToolbarButton
                    label={`转到标题：${heading.label}`}
                    disabled={busy}
                    onClick={() => choose(heading)}
                  >
                    <span className="mimir-docx-outline__level">{heading.level}</span>
                    <span>
                      {heading.label}
                      <small>
                        第 {heading.blockIndex + 1} 段
                        {heading.kind === 'numbered' ? ' · 编号标题' : ''}
                      </small>
                    </span>
                  </ToolbarButton>
                </li>
              ))}
            </ol>
          </nav>
        ) : (
          <p className="mimir-docx-navigation__empty">文档尚无标题。应用标题样式后可在此导航。</p>
        )}
        <p className="mimir-docx-outline__meta">
          仅列正文直属标题。标题文字在原位置编辑，正文始终完整显示。
        </p>
      </div>
      <div className="mimir-docx-outline__actions">
        <ToolbarButton
          label="应用标题层级"
          primary
          disabled={!target || !!reason || busy || Number(level) === target.heading.level}
          disabledReason={
            reason ??
            (!target
              ? '请先选择一个标题'
              : Number(level) === target.heading.level
                ? '层级未变化'
                : undefined)
          }
          onClick={() => {
            void apply()
          }}
        />
      </div>
    </aside>
  )
}
