import { useState } from 'react'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarSelect,
} from '../shell/EditorShell.js'
import {
  DocxControlForm,
  selectedDocxBlock,
  useDocxAction,
  type DocxAdvancedContext,
} from './DocxAdvancedControls.js'
import './docx-picture-controls.css'

/** Same executable insertToc operation as Agent, including its version guard. */
export function DocxTocControls({ context }: { context: DocxAdvancedContext }) {
  const [blockIndex] = useState(() => selectedDocxBlock(context.editor))
  const [lastBlock] = useState(() => context.editor.state.doc.childCount - 1)
  const [position, setPosition] = useState('before')
  const [headings] = useState(() => {
    const result: { level: number; text: string; pos: number }[] = []
    context.editor.state.doc.forEach((node, pos) => {
      if (node.type.name === 'docHeading' && node.textContent.trim())
        result.push({ level: Number(node.attrs.level) || 1, text: node.textContent, pos })
    })
    return result
  })
  const [status, setStatus] = useState('')
  const [inserted, setInserted] = useState(false)
  const { busy, run } = useDocxAction(context)
  const submit = async () => {
    const afterBlockIndex =
      position === 'start'
        ? -1
        : position === 'end'
          ? lastBlock
          : position === 'before'
            ? blockIndex - 1
            : blockIndex
    if (await run('apply_ops', { ops: [{ op: 'insertToc', afterBlockIndex }] })) {
      setInserted(true)
      setStatus('已插入目录字段，可撤销或保存到库。')
    } else setStatus('未能插入目录。请查看文档提示；若正文已变化，请重新打开此面板。')
  }
  return (
    <div className="mimir-docx-toc-tools" aria-busy={busy}>
      <div className="mimir-docx-toc-tools__scroll">
        <DocxControlForm busy={busy}>
          <ToolbarMenuFields label="插入目录">
            <ToolbarSelect
              label="目录位置"
              value={position}
              disabled={busy || inserted}
              options={[
                { value: 'before', label: '当前段落之前' },
                { value: 'after', label: '当前段落之后' },
                { value: 'start', label: '文档开头' },
                { value: 'end', label: '文档末尾' },
              ]}
              onChange={setPosition}
            />
            <ToolbarMenuNote>
              {headings.length
                ? `包含当前文档的 ${headings.length} 个标题。保存为可更新的 Word 目录字段；页码由 Word 更新。`
                : '请先将正文段落设置为标题，再插入目录。'}
            </ToolbarMenuNote>
            {!!headings.length && (
              <ol className="mimir-docx-toc-preview" aria-label="目录标题预览">
                {headings.map((item) => (
                  <li
                    key={item.pos}
                    style={{ paddingInlineStart: `${(Math.min(9, item.level) - 1) * 10}px` }}
                  >
                    {item.text}
                  </li>
                ))}
              </ol>
            )}
          </ToolbarMenuFields>
        </DocxControlForm>
      </div>
      <div className="mimir-docx-toc-tools__actions">
        {status && <p role="status">{status}</p>}
        <ToolbarButton
          label="插入目录到文档"
          primary
          disabled={busy || inserted || !headings.length}
          disabledReason={inserted ? '目录已插入；如需再次插入，请重新打开面板' : '文档中没有标题'}
          onClick={() => void submit()}
        />
      </div>
    </div>
  )
}
