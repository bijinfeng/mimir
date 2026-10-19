import { useEffect, useState } from 'react'
import type { StyleInfo } from '../../vendor/packages/docx-engine/src/types.js'
import { liveDocxStyleState } from '../docx-styles.js'
import {
  DocxControlForm,
  selectedDocxBlock,
  useDocxAction,
  type DocxAdvancedContext,
} from './DocxAdvancedControls.js'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTextField,
} from '../shell/EditorShell.js'

type StyleType = 'paragraph' | 'character' | 'table'
const NONE = '__none__'
export function DocxStyleControls({ context }: { context: DocxAdvancedContext }) {
  const [styles, setStyles] = useState(() => [...context.session.footnotes.parsed.styles.values()])
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string>(() => {
    const node = context.editor.state.doc.child(selectedDocxBlock(context.editor))
    return (node.attrs.styleId ?? node.attrs.tblStyleId ?? 'Normal') as string
  })
  useEffect(() => {
    let active = true
    liveDocxStyleState(context.session, context.options)
      .then((parsed) => {
        if (active) {
          setStyles([...parsed.styles.values()])
          setError('')
        }
      })
      .catch((cause) => {
        if (active) setError(String(cause))
      })
    return () => {
      active = false
    }
  }, [context.session, context.options])
  const action = useDocxAction(context)
  const current = styles.find((style) => style.styleId === selected)
  return (
    <div className="mimir-docx-style-panel">
      <div className="mimir-docx-style-panel__selector">
        <ToolbarPropertyForm columns={1}>
          <ToolbarSelect
            label="选择文档样式"
            disabled={action.busy}
            disabledReason="正在应用修改"
            value={selected}
            options={[
              { value: '__new__', label: '新建样式' },
              ...styles
                .filter((style) => !style.linkedCharShell)
                .map((style) => ({
                  value: style.styleId,
                  label: `${style.name} · ${{ paragraph: '段落', character: '字符', table: '表格' }[style.type]}`,
                })),
            ]}
            onChange={setSelected}
          />
          {error && <p role="alert">无法读取当前样式：{error}</p>}
        </ToolbarPropertyForm>
      </div>
      <StyleForm
        key={`${selected}:${JSON.stringify(current)}`}
        context={context}
        current={current}
        styles={styles}
        onDefined={setSelected}
        action={action}
      />
    </div>
  )
}
function StyleForm({
  context,
  current,
  styles,
  onDefined,
  action,
}: {
  action: ReturnType<typeof useDocxAction>
  onDefined: (styleId: string) => void
  context: DocxAdvancedContext
  current?: StyleInfo
  styles: StyleInfo[]
}) {
  const display = current?.display
  const [styleId, setStyleId] = useState(current?.styleId ?? '')
  const [name, setName] = useState(current?.name ?? '')
  const [type, setType] = useState<StyleType>(current?.type ?? 'paragraph')
  const [basedOn, setBasedOn] = useState(current?.basedOn ?? NONE)
  const [selection] = useState(() => ({
    from: context.editor.state.selection.from,
    to: context.editor.state.selection.to,
    fromBlockIndex: selectedDocxBlock(context.editor),
    toBlockIndex: Math.min(
      context.editor.state.selection.$to.index(0),
      context.editor.state.doc.childCount - 1,
    ),
  }))
  const initial = {
    fontFamily: display?.fontAscii ?? display?.font ?? '',
    eastAsiaFontFamily: display?.eastAsiaFont ?? '',
    fontSize: (display?.sizeHalfPoints ?? 22) / 2,
    color: display?.color && display.color !== 'auto' ? display.color : '',
    bold: !!display?.bold,
    italic: !!display?.italic,
    underline: !!display?.underline,
    strike: !!display?.strike,
    caps: display?.caps === 'all',
    smallCaps: display?.caps === 'small',
    align: display?.align ?? 'left',
    spaceBefore: (display?.spaceBeforeTwips ?? 0) / 20,
    spaceAfter: (display?.spaceAfterTwips ?? 0) / 20,
    lineSpacing: display?.lineSpacing ?? 1,
    indentLeft: (display?.indentLeftTwips ?? 0) / 20,
    indentRight: (display?.indentRightTwips ?? 0) / 20,
    firstLineIndent: (display?.indentFirstLineTwips ?? 0) / 20,
    keepNext: !!display?.keepNext,
    keepLines: !!display?.keepLines,
    pageBreakBefore: !!display?.pageBreakBefore,
    outlineLevel: String(current?.headingLevel ?? NONE),
  }
  const [fields, setFields] = useState(initial)
  const [message, setMessage] = useState('')
  const { busy, run } = action
  const changed =
    !current ||
    name !== current.name ||
    basedOn !== (current.basedOn ?? NONE) ||
    JSON.stringify(fields) !== JSON.stringify(initial)
  const valid =
    name.trim() &&
    /^[A-Za-z0-9_-]{1,64}$/.test(styleId) &&
    (!fields.color || /^[0-9A-Fa-f]{6}$/.test(fields.color))
  const edit = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((previous) => ({ ...previous, [key]: value }))
  const toggle = (
    key:
      | 'bold'
      | 'italic'
      | 'underline'
      | 'strike'
      | 'caps'
      | 'smallCaps'
      | 'keepNext'
      | 'keepLines'
      | 'pageBreakBefore',
    label: string,
  ) => (
    <ToolbarSelect
      key={key}
      disabled={busy}
      disabledReason="正在应用修改"
      label={label}
      value={String(fields[key])}
      options={[
        { value: 'false', label: '关闭' },
        { value: 'true', label: '开启' },
      ]}
      onChange={(value) => edit(key, value === 'true')}
    />
  )
  const number = (
    key:
      | 'fontSize'
      | 'spaceBefore'
      | 'spaceAfter'
      | 'lineSpacing'
      | 'indentLeft'
      | 'indentRight'
      | 'firstLineIndent',
    label: string,
    min = 0,
  ) => (
    <ToolbarNumberField
      key={key}
      label={label}
      value={fields[key]}
      min={min}
      max={key === 'fontSize' ? 400 : 1000}
      step={key === 'lineSpacing' ? 0.1 : 0.5}
      onCommit={(value) => edit(key, value)}
    />
  )
  const define = async () => {
    const runPatch: Record<string, unknown> = {},
      paragraph: Record<string, unknown> = {}
    for (const key of [
      'fontFamily',
      'eastAsiaFontFamily',
      'fontSize',
      'color',
      'bold',
      'italic',
      'underline',
      'strike',
      'caps',
      'smallCaps',
    ] as const) {
      if (!current || fields[key] !== initial[key])
        runPatch[key] = fields[key] === '' ? null : fields[key]
    }
    if (type === 'paragraph')
      for (const key of [
        'align',
        'spaceBefore',
        'spaceAfter',
        'lineSpacing',
        'indentLeft',
        'indentRight',
        'firstLineIndent',
        'keepNext',
        'keepLines',
        'pageBreakBefore',
        'outlineLevel',
      ] as const) {
        if (!current || fields[key] !== initial[key])
          paragraph[key] =
            key === 'outlineLevel'
              ? fields[key] === NONE
                ? null
                : Number(fields[key])
              : fields[key]
      }
    const ok = await run('define_style', {
      styleId,
      name: name.trim(),
      ...(!current ? { type } : {}),
      ...(basedOn !== (current?.basedOn ?? NONE)
        ? { basedOn: basedOn === NONE ? null : basedOn }
        : {}),
      ...(Object.keys(runPatch).length ? { run: runPatch } : {}),
      ...(Object.keys(paragraph).length ? { paragraph } : {}),
    })
    if (ok) onDefined(styleId)
    setMessage(
      ok ? '样式已更新，可应用到选区；保存后写入原件。' : '样式未应用，请查看下方提示并重试。',
    )
  }
  return (
    <DocxControlForm
      busy={busy}
      actions={
        <>
          {message && <p role="status">{message}</p>}
          <ToolbarButton
            primary={!current || !!changed}
            label={current ? '更新样式定义' : '创建样式定义'}
            disabled={busy || !valid || !changed}
            disabledReason={!valid ? '请填写名称、有效标识和六位颜色' : '样式定义未变化'}
            onClick={() => void define()}
          >
            {current && !changed ? '更新样式定义' : undefined}
          </ToolbarButton>
          {current && (
            <ToolbarButton
              label="应用样式到选区"
              primary={!changed}
              disabled={
                busy || !!changed || (type === 'character' && selection.from === selection.to)
              }
              disabledReason={changed ? '请先更新样式定义' : '请先在正文选中文字'}
              onClick={() =>
                void run('apply_style', { styleId, ...selection }).then((ok) =>
                  setMessage(
                    ok ? '已应用到打开面板时的选区。' : '未应用，请重新选择内容后打开面板。',
                  ),
                )
              }
            >
              {changed ? '应用到选区' : undefined}
            </ToolbarButton>
          )}
        </>
      }
    >
      <ToolbarMenuFields label={current ? '样式定义' : '新建样式'}>
        {!current && (
          <ToolbarTextField
            label="样式标识"
            placeholder="例如 MimirQuote"
            value={styleId}
            onChange={setStyleId}
          />
        )}
        <ToolbarTextField label="样式名称" value={name} onChange={setName} />
        {!current && (
          <ToolbarSelect
            label="样式类型"
            disabled={busy}
            disabledReason="正在应用修改"
            value={type}
            options={[
              { value: 'paragraph', label: '段落' },
              { value: 'character', label: '字符' },
              { value: 'table', label: '表格' },
            ]}
            onChange={setType}
          />
        )}
        <ToolbarSelect
          label="基于样式"
          disabled={busy}
          disabledReason="正在应用修改"
          value={basedOn}
          options={[
            { value: NONE, label: '不继承其他样式' },
            ...styles
              .filter((style) => style.type === type && style.styleId !== styleId)
              .map((style) => ({ value: style.styleId, label: style.name })),
          ]}
          onChange={setBasedOn}
        />
      </ToolbarMenuFields>
      <ToolbarMenuFields label="文字">
        <ToolbarTextField
          label="西文字体"
          value={fields.fontFamily}
          placeholder="继承文档字体"
          onChange={(value) => edit('fontFamily', value)}
        />
        <ToolbarTextField
          label="中文字体"
          value={fields.eastAsiaFontFamily}
          placeholder="继承文档字体"
          onChange={(value) => edit('eastAsiaFontFamily', value)}
        />
        {number('fontSize', '字号（磅）', 0.5)}
        <ToolbarTextField
          label="文字颜色"
          value={fields.color}
          placeholder="如 123456，留空自动"
          onChange={(value) => edit('color', value.replace(/^#/, ''))}
        />
        {toggle('bold', '加粗')}
        {toggle('italic', '斜体')}
        {toggle('underline', '下划线')}
        {toggle('strike', '删除线')}
        {toggle('caps', '全部大写')}
        {toggle('smallCaps', '小型大写')}
      </ToolbarMenuFields>
      {type === 'paragraph' && (
        <>
          <ToolbarMenuFields label="段落">
            <ToolbarSelect
              label="段落对齐"
              disabled={busy}
              disabledReason="正在应用修改"
              value={fields.align}
              options={['left', 'center', 'right', 'justify'].map((value, i) => ({
                value,
                label: ['左对齐', '居中', '右对齐', '两端对齐'][i]!,
              }))}
              onChange={(value) => edit('align', value as typeof fields.align)}
            />
            {number('spaceBefore', '段前（磅）')}
            {number('spaceAfter', '段后（磅）')}
            {number('lineSpacing', '行距（倍）', 0.1)}
            {number('indentLeft', '左缩进（磅）', -1000)}
            {number('indentRight', '右缩进（磅）', -1000)}
            {number('firstLineIndent', '首行缩进（磅）', -1000)}
            <ToolbarSelect
              label="大纲级别"
              disabled={busy}
              disabledReason="正在应用修改"
              value={fields.outlineLevel}
              options={[
                { value: NONE, label: '正文' },
                ...Array.from({ length: 9 }, (_, i) => ({
                  value: String(i + 1),
                  label: `级别 ${i + 1}`,
                })),
              ]}
              onChange={(value) => edit('outlineLevel', value)}
            />
          </ToolbarMenuFields>
          <ToolbarMenuFields label="分页">
            {toggle('keepNext', '与下段同页')}
            {toggle('keepLines', '段中不分页')}
            {toggle('pageBreakBefore', '段前分页')}
          </ToolbarMenuFields>
        </>
      )}
      {!message && (
        <ToolbarMenuNote>
          修改定义会更新使用此样式的内容；直接设置的局部格式优先。应用操作使用打开面板时的选区。
        </ToolbarMenuNote>
      )}
    </DocxControlForm>
  )
}
