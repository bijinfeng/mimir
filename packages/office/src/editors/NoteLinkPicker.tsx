import { Button } from 'antd'
import type { Editor } from '@tiptap/core'
import { MarkdownSuggestionPanel } from './MarkdownSuggestionPanel.js'

interface Props {
  editor: Editor
  anchor: number
  items: Array<{ id: string; title: string }>
  selected: number
  pending: boolean
  error: string | null
  onPick: (item: { id: string; title: string }) => void
}

interface NoteLinkOptionProps {
  title: string
  selected?: boolean
  onClick: () => void
}

/** 两处笔记候选共用同一控件，并保留正文中的选区。 */
export function NoteLinkOption({ title, selected, onClick }: NoteLinkOptionProps) {
  return (
    <Button
      type="text"
      block
      {...(selected === undefined ? {} : { role: 'option', 'aria-selected': selected })}
      className="me-note-link-picker__item"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <span className="me-note-link-picker__title" title={title}>
        {title}
      </span>
    </Button>
  )
}

/** `[[` 候选面板；命令输入仍留在正文编辑器里。 */
export function NoteLinkPicker({ editor, anchor, items, selected, pending, error, onPick }: Props) {
  return (
    <MarkdownSuggestionPanel
      editor={editor}
      anchor={anchor}
      width={280}
      maxHeight={180}
      selected={selected}
      className="me-note-link-picker"
      role="listbox"
      label="链接到笔记"
    >
      {pending ? (
        <div className="me-note-link-picker__hint">正在查找笔记…</div>
      ) : error ? (
        <div className="me-note-link-picker__hint" role="alert">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="me-note-link-picker__hint">没有匹配的笔记</div>
      ) : (
        items.map((item, index) => (
          <NoteLinkOption
            key={item.id}
            title={item.title}
            selected={index === selected}
            onClick={() => onPick(item)}
          />
        ))
      )}
    </MarkdownSuggestionPanel>
  )
}
