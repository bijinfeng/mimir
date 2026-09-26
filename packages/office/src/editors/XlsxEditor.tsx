/**
 * xlsx 的网格编辑器（预览 + 改单元格）。
 *
 * ## 编辑的语义是「覆盖」
 *
 * 在格子里输入内容就是**覆盖**原来那个格（电子表格的语义）。三条推论：
 *
 *   - **公式格会被清掉公式**：只换 `<v>` 而留着 `<f>` 的话，Excel 打开会按
 *     公式重算、用户输入的值被悄悄丢掉。所以覆盖时把整段 `<c>` 换掉
 *   - **样式保留**（`s="…"` 不动），所以改文字不会掉颜色与边框
 *   - **新文本写成内联字符串**，绝不改 `sharedStrings.xml`——那里的一项被
 *     多个格子共用，改它会让所有引用它的格子一起变（**静默的**）
 *
 * ## 如实标注三件事
 *
 *   - **不重算公式**：改了被别的公式引用的格子，那些公式的缓存值就旧了。
 *     Excel 打开会重算，我们显示的仍是旧值——状态行里写明
 *   - 日期显示为序列号（`xlsx.ts` 的老规矩）
 *   - 图表、条件格式、透视表不画（读不出来），但**保存不会动它们**
 *
 * ## 没选中格子时它就是一个预览
 *
 * 只有这一个组件（原 `XlsxPreview` 已被它取代）：只读预览与编辑读的是同一份
 * 模型、画的是同一张表。分开两个的话，界面会变成「预览看一遍、想改一个字要
 * 切到另一个模式」——而原件层本来就是给人看和改的地方。
 */

import { useCallback, useMemo, useState } from 'react'
import { openXlsxForEdit } from '../xlsx-edit.js'
import type { XlsxWorkbook } from '../xlsx.js'
import {
  EditorShell,
  EditorState,
  ToolbarButton,
  ToolbarLabel,
  ToolbarSpacer,
  ToolbarTabs,
} from '../shell/EditorShell.js'
import { AlertIcon, SaveIcon } from '../shell/icons.js'
import { statusText, useParsed, useSource } from './use-source.js'
import { OFFICE_MIME, type EditorProps } from './types.js'
import '../shell/shell.css'
import './editors.css'

export function XlsxEditor({ documentId, io, onDirtyChange, flush = false }: EditorProps) {
  const source = useSource(io, documentId)
  const parsed = useParsed(source.bytes, openXlsxForEdit)
  const session = parsed.value

  /**
   * 渲染用的**不可变快照**。
   *
   * 编辑是就地改模型的（`setCell` 直接改内存里的 workbook），所以「当前该画
   * 哪一份」不能靠 session 的身份判断（它从打开到关闭都是同一个对象）。
   * `session.view()` 在**没改动时返回同一个对象**，于是它可以当 `useMemo`
   * 的依赖——这正是那个方法存在的理由。
   *
   * `edited` 只是为了让「改了之后的快照」有个地方落：它同样绑着「哪一份字节」，
   * 换文件时自然作废。
   */
  const [edited, setEdited] = useState<{ source: Uint8Array; view: XlsxWorkbook } | null>(null)
  const view = edited?.source === source.bytes ? edited.view : (session?.view() ?? null)

  const [active, setActive] = useState(0)
  /** 选中的格子。列号 0 开始，行号是 Excel 的 1 开始 */
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null)
  /**
   * 编辑框里的草稿。
   *
   * `null` 表示「还没改过这个格」——那时显示模型里的值，在渲染时算出来
   * （而不是用 effect 同步进 state：那会多一次渲染，保存/换表之后还要记得
   * 重置，属于自己制造的状态同步问题）。敲字时它变成字符串，提交后回到 `null`。
   */
  const [draft, setDraft] = useState<string | null>(null)
  /** 有改过格子（保存后清掉） */
  const [touched, setTouched] = useState(false)
  /** 写不进去的原因。就地在编辑行里说，不用弹窗打断 */
  const [applyError, setApplyError] = useState<string | null>(null)

  const sheet = useMemo(() => view?.sheets[active] ?? null, [view, active])

  /**
   * 选中的格子在**当前模型**里的那个对象。
   *
   * 从 `view`（不可变快照）里读，而不是问 `session`：快照的身份会随改动变化，
   * 于是这里的依赖是**真实**的——保存后、换表后重算，编辑框不会停在旧文字上。
   * 问 `session` 的话依赖只能是 `session` 本身，而它整个会话不变，
   * lint 会正确地指出那是假依赖。
   */
  const selectedCell = useMemo(() => {
    if (!selected || !sheet) return null
    const row = sheet.rows.find((r) => r.number === selected.row)
    return row?.cells[selected.col] ?? null
  }, [sheet, selected])

  const modelText = selectedCell?.text ?? ''
  const wasFormula = selectedCell?.formula === true
  /** 编辑框显示什么：改过看草稿，没改过看模型 */
  const shown = draft ?? modelText
  const dirty = session?.isDirty() ?? false

  /** 点一个格子 → 选中它（编辑框的值由 `selectedCell` 从模型推导） */
  const selectCell = useCallback(
    (row: number, col: number) => {
      if (!sheet) return
      // 合并覆盖的格不选（它的内容属于左上角那个格）
      const cell = sheet.rows.find((r) => r.number === row)?.cells[col]
      if (cell?.covered) return
      setSelected({ row, col })
      // 换了一个格 → 草稿回到「没改过」，编辑框显示新格的模型值
      setDraft(null)
    },
    [sheet],
  )

  /** 提交草稿到模型（按回车或点「应用」） */
  const apply = useCallback(() => {
    if (!session || !selected || draft === null) return
    const ref = { sheet: active, row: selected.row, col: selected.col }
    if (!session.setCell(ref, draft)) {
      setApplyError('这个格写不进去（所在的行或表不在可编辑范围内）')
      return
    }
    setApplyError(null)
    setEdited({ source: source.bytes!, view: session.view() })
    setDraft(null)
    if (!touched) {
      setTouched(true)
      onDirtyChange?.(true)
    }
  }, [session, selected, draft, active, touched, source.bytes, onDirtyChange])

  const save = async () => {
    if (!session) return
    const bytes = await session.save()
    const ok = await source.save(bytes, { name: 'workbook.xlsx', mime: OFFICE_MIME.xlsx })
    if (!ok) return
    /**
     * **保存成功后必须 commit**：把改过的 XML 烧回 entries、重解析模型。
     * 不做的话第二次编辑会拿旧 XML 拼字节，第一次的改动静默回滚
     * （两次保存都报成功）——与 pptx 同一个坑。
     */
    session.commit()
    // commit 之后模型与刚写出的字节对齐了，取一份新快照（同时丢掉 edited）
    setEdited({ source: source.bytes!, view: session.view() })
    setDraft(null)
    setTouched(false)
    onDirtyChange?.(false)
  }

  if (source.loadError !== null) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>读取失败</ToolbarLabel>}>
        <EditorState tone="error">
          读取失败：{source.loadError}
          <div style={{ marginTop: 12 }}>
            <ToolbarButton label="重试" onClick={source.reload}>
              重试
            </ToolbarButton>
          </div>
        </EditorState>
      </EditorShell>
    )
  }

  if (parsed.error !== null) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>解析失败</ToolbarLabel>}>
        <EditorState tone="error">解析失败：{parsed.error}</EditorState>
      </EditorShell>
    )
  }

  if (!session || !sheet || !view) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>读取中…</ToolbarLabel>}>
        <EditorState>正在解析工作表…</EditorState>
      </EditorShell>
    )
  }

  const status = statusText({
    handle: source,
    dirty,
    idle: `${view.sheets.length} 张表`,
  })

  return (
    <EditorShell
      flush={flush}
      toolbar={
        <>
          {view.sheets.length > 1 && (
            <>
              <ToolbarTabs
                label="工作表"
                value={active}
                onChange={(value) => {
                  setActive(value)
                  // 换表清掉选中：那个格不在这一张表了（草稿也跟着失效）
                  setSelected(null)
                  setDraft(null)
                  setApplyError(null)
                }}
                items={view.sheets.map((s, index) => ({
                  value: index,
                  label: s.hidden ? `${s.name}（隐藏）` : s.name,
                }))}
              />
              <ToolbarSpacer />
            </>
          )}
          {view.sheets.length <= 1 && <ToolbarSpacer />}
          <ToolbarButton
            label={source.saving ? '保存中…' : '保存到库'}
            primary
            disabled={!dirty || source.saving}
            onClick={() => void save()}
          >
            <SaveIcon />
          </ToolbarButton>
        </>
      }
      footer={
        selected ? (
          <div className="mimir-cell-editor">
            <span className="mimir-cell-editor__ref">
              {columnLetters(selected.col)}
              {selected.row}
            </span>
            <input
              className="me-input"
              value={shown}
              aria-label={`单元格 ${columnLetters(selected.col)}${selected.row}`}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') apply()
                if (event.key === 'Escape') {
                  setDraft(null)
                  setApplyError(null)
                }
              }}
              placeholder="输入内容后回车"
            />
            <ToolbarButton label="应用" disabled={draft === null} onClick={apply}>
              应用
            </ToolbarButton>
            {wasFormula && (
              <span className="me-label mimir-cell-editor__warn">
                <AlertIcon />
                原来是公式，改后公式会被清掉
              </span>
            )}
          </div>
        ) : (
          <ToolbarLabel>点一个格子改它的内容；按回车应用，Esc 放弃</ToolbarLabel>
        )
      }
      status={
        <>
          <ToolbarLabel>{status}</ToolbarLabel>
          <ToolbarLabel>
            {applyError ?? '公式不重算：改了被引用的格，那边的显示值要等 Excel 打开才更新'}
          </ToolbarLabel>
        </>
      }
    >
      {applyError !== null && <div className="mimir-apply-error">{applyError}</div>}
      <div className="me-scroll mimir-xlsx-wrap">
        {/*
          渲染的 key 用**文件里的行列号**（格子的 `col`、行的 `number`）——
          由解析器给出，不是 `map` 的下标（`xlsx.ts` 顶部讲了为什么）。
        */}
        <table className="mimir-xlsx">
          <colgroup>
            {sheet.columns.map((column) => (
              <col key={`col-${column.col}`} style={{ width: `${column.width}px` }} />
            ))}
          </colgroup>
          <tbody>
            {sheet.rows.map((row) => (
              <tr key={`row-${row.number}`} style={{ height: `${row.height}px` }}>
                <th className="mimir-xlsx__gutter">{row.number}</th>
                {row.cells.map((cell) =>
                  cell.covered ? null : (
                    <td
                      key={`cell-${cell.col}`}
                      colSpan={cell.colSpan}
                      rowSpan={cell.rowSpan}
                      className={
                        selected?.row === row.number && selected?.col === cell.col
                          ? 'mimir-xlsx__cell mimir-xlsx__cell--on'
                          : cell.numeric
                            ? 'mimir-xlsx__cell mimir-xlsx__cell--num'
                            : 'mimir-xlsx__cell'
                      }
                      title={cell.formula ? '公式（显示 Excel 算好的缓存值）' : undefined}
                      onClick={() => selectCell(row.number, cell.col)}
                    >
                      {/* 选中的格子显示草稿（实时预览），其余显示模型里的值 */}
                      {selected?.row === row.number && selected?.col === cell.col
                        ? shown
                        : cell.text}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EditorShell>
  )
}

/** `0` → `A`（列号 → 列字母，格子的引用要它） */
function columnLetters(col: number): string {
  let n = col + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}
