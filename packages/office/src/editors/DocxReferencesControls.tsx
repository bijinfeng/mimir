import { useEffect, useState } from 'react'
import type { SourceInfo } from '../../vendor/packages/docx-engine/src/types.js'
import { bibliographyLine, citationText } from '../../vendor/packages/docx-engine/src/sources.js'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import { ArrowUpIcon, BlankPageIcon, TrackChangesIcon } from '../shell/icons.js'
import type { DocxAdvancedContext } from './DocxAdvancedControls.js'
import {
  applyReference,
  nextCaptionNumber,
  referenceHeadings,
  referenceSources,
  referenceTarget,
  referenceTerms,
  referenceTocs,
  SOURCE_TYPES,
  type ReferenceAction,
} from './docx-references.js'
import './docx-references.css'

type Mode = 'toc' | 'caption' | 'citation' | 'source' | 'bibliography' | 'mark' | 'index' | 'field'
const MODES: { value: Mode; label: string }[] = [
  { value: 'toc', label: '目录与更新' },
  { value: 'caption', label: '题注' },
  { value: 'citation', label: '插入引文' },
  { value: 'source', label: '管理来源' },
  { value: 'bibliography', label: '参考文献' },
  { value: 'mark', label: '标记索引项' },
  { value: 'index', label: '插入索引' },
  { value: 'field', label: '插入域' },
]
const FIELD_OPTIONS = [
  { value: 'DATE', label: '日期 DATE' },
  { value: 'TIME', label: '时间 TIME' },
  { value: 'PAGE', label: '页码 PAGE' },
  { value: 'NUMPAGES', label: '总页数 NUMPAGES' },
  { value: 'FILENAME', label: '文件名 FILENAME' },
  { value: 'AUTHOR', label: '作者 AUTHOR' },
  { value: 'TITLE', label: '标题 TITLE' },
  { value: 'SEQ', label: '序号 SEQ' },
  { value: 'REF', label: '书签引用 REF' },
  { value: 'PAGEREF', label: '书签页码 PAGEREF' },
  { value: 'STYLEREF', label: '样式引用 STYLEREF' },
]
const emptySource = (): SourceInfo => ({
  tag: '',
  type: 'Book',
  author: '',
  title: '',
  year: '',
  publisher: '',
  url: '',
})
const fieldCache = (name: string) =>
  name === 'DATE'
    ? new Date().toLocaleDateString('zh-CN')
    : name === 'TIME'
      ? new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      : ''

export function DocxReferencesControls({
  context,
  initialMode = 'toc',
}: {
  context: DocxAdvancedContext
  initialMode?: Mode
}) {
  const [binding] = useState(() => ({
    editor: context.editor,
    session: context.session,
    options: JSON.stringify(context.options),
  }))
  const [target, setTarget] = useState(() => referenceTarget(context.editor))
  const [mode, setMode] = useState<Mode>(initialMode)
  const sources = referenceSources(target.doc, binding.session, context.options.sources)
  const [sourceTag, setSourceTag] = useState(sources[0]?.tag ?? '')
  const [sourceDraft, setSourceDraft] = useState<SourceInfo>(() =>
    structuredClone(sources[0] ?? emptySource()),
  )
  const [creating, setCreating] = useState(!sources.length)
  const [editing, setEditing] = useState(false)
  const [captionLabel, setCaptionLabel] = useState('图')
  const [captionText, setCaptionText] = useState('')
  const tocs = referenceTocs(target.doc, binding.session)
  const [tocIndex, setTocIndex] = useState(tocs.length ? '0' : 'new')
  const [term, setTerm] = useState(() => target.doc.textBetween(target.from, target.to, ' ').trim())
  const [fieldName, setFieldName] = useState('DATE')
  const [instruction, setInstruction] = useState('DATE')
  const [result, setResult] = useState(() => fieldCache('DATE'))
  const [stale, setStale] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  useEffect(() => {
    const check = () => {
      if (binding.editor.state.doc !== target.doc) setStale(true)
    }
    binding.editor.on('transaction', check)
    return () => {
      binding.editor.off('transaction', check)
    }
  }, [binding.editor, target.doc])
  const locked =
    stale ||
    binding.editor.isDestroyed ||
    binding.editor !== context.editor ||
    binding.session !== context.session ||
    binding.options !== JSON.stringify(context.options)
  const headings = referenceHeadings(target.doc)
  const terms = referenceTerms(target.doc)
  const selectedSource = sources.find((source) => source.tag === sourceTag)
  const showSourceForm = mode === 'source' || (mode === 'citation' && (creating || editing))
  const patchSource = (key: keyof SourceInfo, value: string) =>
    setSourceDraft({ ...sourceDraft, [key]: value })
  const selectSource = (tag: string) => {
    setSourceTag(tag)
    setCreating(false)
    setEditing(false)
    setSourceDraft(structuredClone(sources.find((source) => source.tag === tag) ?? emptySource()))
    setError('')
    setStatus('')
  }
  const createSource = () => {
    setCreating(true)
    setEditing(false)
    setSourceTag('')
    setSourceDraft(emptySource())
    setError('')
    setStatus('')
  }
  const labels: Record<Mode, string> = {
    toc: tocIndex === 'new' ? '插入目录' : '更新选中目录',
    caption: '插入题注',
    citation: showSourceForm ? '保存来源并插入引文' : '插入引文',
    source: '保存来源',
    bibliography: '插入参考文献',
    mark: '标记索引项',
    index: '插入索引',
    field: '插入原生域',
  }
  const unavailable =
    mode === 'toc'
      ? !headings.length
      : mode === 'index'
        ? !terms.length
        : mode === 'bibliography'
          ? !sources.length
          : mode === 'citation' && !showSourceForm
            ? !selectedSource
            : false
  const submit = () => {
    try {
      if (locked) throw new Error('文档已变化，请重新打开引用面板')
      let action: ReferenceAction
      if (mode === 'toc')
        action = { kind: 'toc', region: tocIndex === 'new' ? undefined : tocs[Number(tocIndex)] }
      else if (mode === 'caption')
        action = { kind: 'caption', label: captionLabel, text: captionText }
      else if (mode === 'source' || (mode === 'citation' && showSourceForm)) {
        if (creating && sources.some((source) => source.tag === sourceDraft.tag))
          throw new Error('标签已存在，请换一个唯一标签')
        action = { kind: 'source', source: sourceDraft, insertCitation: mode === 'citation' }
      } else if (mode === 'citation') action = { kind: 'citation', tag: sourceTag }
      else if (mode === 'mark') action = { kind: 'mark', term }
      else if (mode === 'field') action = { kind: 'field', instruction, result }
      else action = { kind: mode }
      const next = applyReference(
        binding.editor,
        binding.session,
        target,
        action,
        context.options.sources,
      )
      setTarget(next)
      setStale(false)
      setError('')
      setStatus(`${labels[mode]}完成，可撤销或保存到库。`)
      if (action.kind === 'source') {
        setSourceTag(sourceDraft.tag)
        setCreating(false)
        setEditing(false)
      }
      if (mode === 'toc' && tocIndex === 'new')
        setTocIndex(String(referenceTocs(next.doc, binding.session).length - 1))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('')
    }
  }
  return (
    <div className="mimir-docx-references">
      <div className="mimir-docx-references__scroll">
        <fieldset disabled={locked} className="mimir-docx-references__fields">
          <ToolbarPropertyForm>
            <ToolbarSelect
              label="引用工具"
              value={mode}
              options={MODES}
              disabled={locked}
              onChange={(value) => {
                setMode(value)
                setError('')
                setStatus('')
              }}
            />
            {mode === 'toc' && (
              <ToolbarMenuFields label="目录内容">
                <ToolbarSelect
                  label="目录目标"
                  value={tocIndex}
                  disabled={locked}
                  options={[
                    ...tocs.map((toc, i) => ({
                      value: String(i),
                      label: `${i + 1}. ${toc.label.slice(0, 35)}`,
                    })),
                    { value: 'new', label: '在当前段落后新建' },
                  ]}
                  onChange={setTocIndex}
                />
                <ToolbarMenuNote>
                  {headings.length
                    ? `使用当前 ${headings.length} 个标题。页码由 Word 更新。`
                    : '文档没有标题。请先在“开始”中设置标题样式。'}
                  {!tocs.length &&
                    ' 未找到可安全更新的完整目录；混有其他正文的字段需在 Word 中更新。'}
                </ToolbarMenuNote>
                <ol className="mimir-docx-references__preview" aria-label="目录预览">
                  {headings.map((heading) => (
                    <li
                      key={heading.pos}
                      style={{ paddingInlineStart: `${(heading.level - 1) * 10}px` }}
                    >
                      {heading.text}
                    </li>
                  ))}
                </ol>
              </ToolbarMenuFields>
            )}
            {mode === 'caption' && (
              <ToolbarMenuFields label="题注内容">
                <ToolbarSelect
                  label="标签"
                  value={captionLabel}
                  disabled={locked}
                  options={['图', '表', '公式'].map((value) => ({ value, label: value }))}
                  onChange={setCaptionLabel}
                />
                <ToolbarTextField label="题注说明" value={captionText} onChange={setCaptionText} />
                <p className="mimir-docx-references__sample">
                  {captionLabel} {nextCaptionNumber(target.doc, binding.session, captionLabel)}
                  {captionText && ` ${captionText}`}
                </p>
                <ToolbarMenuNote>
                  插入到打开面板时所在段落之后，编号使用可更新的 SEQ 域。
                </ToolbarMenuNote>
              </ToolbarMenuFields>
            )}
            {(mode === 'source' || mode === 'citation') && (
              <ToolbarMenuFields label="文献来源">
                <div className="mimir-docx-references__source-tools">
                  {!!sources.length && (
                    <ToolbarSelect
                      label="当前来源"
                      value={creating ? '' : sourceTag}
                      disabled={locked}
                      options={[
                        ...(creating ? [{ value: '', label: '新建来源' }] : []),
                        ...sources.map((source) => ({
                          value: source.tag,
                          label: `${source.author || source.tag} · ${source.title}`,
                        })),
                      ]}
                      onChange={selectSource}
                    />
                  )}
                  <div className="mimir-docx-references__row">
                    <ToolbarButton label="新建来源" disabled={locked} onClick={createSource}>
                      <BlankPageIcon />
                      新建来源
                    </ToolbarButton>
                    {mode === 'citation' && selectedSource && !creating && (
                      <ToolbarButton
                        label={editing ? '收起来源编辑' : '编辑当前来源'}
                        disabled={locked}
                        onClick={() => setEditing(!editing)}
                      >
                        {editing ? <ArrowUpIcon /> : <TrackChangesIcon />}
                        {editing ? '收起编辑' : '编辑来源'}
                      </ToolbarButton>
                    )}
                  </div>
                </div>
                {showSourceForm ? (
                  <>
                    {creating ? (
                      <ToolbarTextField
                        label="唯一标签"
                        value={sourceDraft.tag}
                        onChange={(value) => patchSource('tag', value)}
                      />
                    ) : (
                      <ToolbarMenuNote>唯一标签：{sourceDraft.tag}（保持引文关联）</ToolbarMenuNote>
                    )}
                    <ToolbarSelect
                      label="来源类型"
                      value={sourceDraft.type}
                      disabled={locked}
                      options={
                        SOURCE_TYPES.some((item) => item.value === sourceDraft.type)
                          ? SOURCE_TYPES
                          : [...SOURCE_TYPES, { value: sourceDraft.type, label: sourceDraft.type }]
                      }
                      onChange={(value) => patchSource('type', value)}
                    />
                    {(
                      [
                        ['author', '作者'],
                        ['title', '标题'],
                        ['year', '年份'],
                        ['publisher', '出版者 / 期刊 / 网站'],
                        ['url', '网址'],
                      ] as const
                    ).map(([key, label]) => (
                      <ToolbarTextField
                        key={key}
                        label={label}
                        value={sourceDraft[key] ?? ''}
                        onChange={(value) => patchSource(key, value)}
                      />
                    ))}
                    <ToolbarMenuNote>
                      标签用于 Word 的引文关联。修改现有来源会保留未编辑的原生扩展信息。
                    </ToolbarMenuNote>
                  </>
                ) : (
                  selectedSource && (
                    <p className="mimir-docx-references__sample">
                      {bibliographyLine(selectedSource)}
                    </p>
                  )
                )}
                {mode === 'citation' && (
                  <ToolbarMenuNote>
                    引文显示为{' '}
                    {showSourceForm
                      ? citationText(sourceDraft)
                      : selectedSource
                        ? citationText(selectedSource)
                        : '所选来源的作者与年份'}
                    ；原生 CITATION 域插入在冻结选区末尾，不覆盖选中文字。
                  </ToolbarMenuNote>
                )}
              </ToolbarMenuFields>
            )}
            {mode === 'bibliography' && (
              <ToolbarMenuFields label={`参考文献 · ${sources.length} 个来源`}>
                <ToolbarMenuNote>
                  在当前段落后插入 BIBLIOGRAPHY 域及全部来源的文字缓存。样式与最新结果由 Word 更新。
                </ToolbarMenuNote>
                <ol className="mimir-docx-references__preview">
                  {sources.map((source) => (
                    <li key={source.tag}>{bibliographyLine(source)}</li>
                  ))}
                </ol>
              </ToolbarMenuFields>
            )}
            {mode === 'mark' && (
              <ToolbarMenuFields label="索引标记">
                <ToolbarTextField label="索引词" value={term} onChange={setTerm} />
                <ToolbarMenuNote>
                  在冻结选区末尾插入隐藏 XE 标记，保留所选文字。可用冒号表示子条目。
                </ToolbarMenuNote>
              </ToolbarMenuFields>
            )}
            {mode === 'index' && (
              <ToolbarMenuFields label={`索引 · ${terms.length} 个词`}>
                <ToolbarMenuNote>
                  {terms.length
                    ? '在当前段落后插入原生 INDEX 域；页码由 Word 更新。'
                    : '请先选择正文文字并使用“标记索引项”。'}
                </ToolbarMenuNote>
                <ul className="mimir-docx-references__preview">
                  {terms.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </ToolbarMenuFields>
            )}
            {mode === 'field' && (
              <ToolbarMenuFields label="原生域">
                <ToolbarSelect
                  label="域类型"
                  value={fieldName}
                  options={FIELD_OPTIONS}
                  disabled={locked}
                  onChange={(value) => {
                    setFieldName(value)
                    setInstruction(value)
                    setResult(fieldCache(value))
                  }}
                />
                <ToolbarTextField label="域代码" value={instruction} onChange={setInstruction} />
                <ToolbarTextField label="当前显示文字" value={result} onChange={setResult} />
                <ToolbarMenuNote>
                  日期 / 时间提供当前本地值；其他域请填写显示缓存。插入后由 Word
                  更新实际结果。插入位置为冻结选区末尾。
                </ToolbarMenuNote>
              </ToolbarMenuFields>
            )}
          </ToolbarPropertyForm>
        </fieldset>
      </div>
      <div className="mimir-docx-references__actions">
        {locked && <p role="status">文档已变化，请关闭并重新打开此面板。</p>}
        {error && (
          <p role="alert" className="mimir-docx-references__error">
            {error}
          </p>
        )}
        {status && <p role="status">{status}</p>}
        <ToolbarButton
          label={labels[mode]}
          primary
          disabled={locked || unavailable}
          disabledReason={locked ? '请重新打开面板' : '请先准备此工具所需的标题、来源或索引项'}
          onClick={submit}
        />
      </div>
    </div>
  )
}
export const DocxCaptionControls = ({ context }: { context: DocxAdvancedContext }) => (
  <DocxReferencesControls context={context} initialMode="caption" />
)
export const DocxCitationControls = ({ context }: { context: DocxAdvancedContext }) => (
  <DocxReferencesControls context={context} initialMode="citation" />
)
export const DocxIndexControls = ({ context }: { context: DocxAdvancedContext }) => (
  <DocxReferencesControls context={context} initialMode="mark" />
)
export const DocxFieldControls = ({ context }: { context: DocxAdvancedContext }) => (
  <DocxReferencesControls context={context} initialMode="field" />
)
