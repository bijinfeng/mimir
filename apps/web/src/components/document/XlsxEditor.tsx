import { useCallback, useEffect, useMemo, useState } from 'react'
import { App, Button, Empty, Input, Segmented, Skeleton, Space, Tag, Typography } from 'antd'
import { createStyles } from 'antd-style'
import { openXlsxForEdit, type XlsxEditSession, type XlsxWorkbook } from '@mimir/office'
import { api } from '@/lib/api'

/**
 * xlsx 的**网格预览 + 单元格编辑**。
 *
 * ## 为什么只有一个组件（原 `XlsxPreview` 被它取代）
 *
 * 只读预览与编辑读的是同一份模型、画的是同一张表。分开两个组件的话，
 * 界面会变成「预览看一遍、想改一个字要切到另一个模式」——而原件层本来
 * 就是给人看和改的地方。没选中格子时它就是一个预览。
 *
 * ## 编辑的语义是「覆盖」
 *
 * 在格子里输入内容就是**覆盖**原来那个格（电子表格的语义）。所以：
 *
 *   - **公式格会被清掉公式**（`xlsx-edit.ts` 的规矩）：只换 `<v>` 而留着
 *     `<f>` 的话，Excel 打开会按公式重算、用户输入的值被悄悄丢掉
 *   - 样式**保留**（`s="…"` 不动），所以改文字不会掉颜色与边框
 *   - **新文本写成内联字符串**，绝不改 `sharedStrings.xml`——那里的一项
 *     被多个格子共用，改它会让所有引用它的格子一起变（静默的）
 *
 * ## 如实标注三件事
 *
 *   - **不重算公式**：改了一个被别的公式引用的格子，那些公式的缓存值就旧了。
 *     Excel 打开会重算，我们显示的仍是旧值——底部说明写明
 *   - 日期显示为序列号（`xlsx.ts` 的老规矩），输入的文字原样存进去
 *   - 图表、条件格式、透视表不画（读不出来），但**保存不会动它们**
 */
export function XlsxEditor({ documentId }: { documentId: string }) {
  const { styles, cx } = useStyles()
  const { message } = App.useApp()
  const [session, setSession] = useState<XlsxEditSession | null>(null)
  const [view, setView] = useState<XlsxWorkbook | null>(null)
  const [status, setStatus] = useState('读取原件…')
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [saving, setSaving] = useState(false)
  /** 选中的格子（行号 + 列号） */
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null)
  /**
   * 编辑框里的草稿。
   *
   * `null` 表示「还没改过这个格」——那时草稿就是模型里的值，在渲染时算出来
   * （而不是用 effect 同步进 state：那会多一次渲染，而且保存/换表之后
   * 要记得重置，属于自己制造的状态同步问题）。
   *
   * 敲字时它变成字符串，提交后回到 `null`。
   */
  const [draft, setDraft] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(api.documents.sourceUrl(documentId), { credentials: 'include' })
        if (!res.ok) throw new Error(`读取原件失败：HTTP ${res.status}`)
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (cancelled) return
        setStatus(`已读取 ${bytes.length} 字节，解析中…`)
        const opened = await openXlsxForEdit(bytes)
        if (cancelled) return
        setSession(opened)
        setView(opened.view())
        setStatus(`${opened.view().sheets.length} 张表`)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [documentId])

  const sheet = useMemo(() => view?.sheets[active] ?? null, [view, active])

  /**
   * 选中的格子在**当前模型**里的那个对象。
   *
   * 从 `view`（不可变快照）里读，而不是问 `session`：快照的身份会随改动变化，
   * 于是这里的依赖是**真实**的——保存后 / 换表后重算，编辑框不会停在旧文字上。
   * （问 `session` 的话依赖就只能是 `session` 本身，而它在整个会话里不变，
   * lint 会正确地指出那是假依赖。）
   */
  const selectedCell = useMemo(() => {
    if (!selected || !sheet) return null
    const row = sheet.rows.find((r) => r.number === selected.row)
    return row?.cells[selected.col] ?? null
  }, [sheet, selected])

  /** 编辑框在「没改过」时显示的值 */
  const modelText = selectedCell?.text ?? ''

  /** 这个格子原来是公式吗（界面上提示「改后公式会被清掉」） */
  const wasFormula = selectedCell?.formula === true

  /** 编辑框里显示什么：改过看草稿，没改过看模型 */
  const shown = draft ?? modelText

  /** 点一个格子 → 选中它（编辑框的值由 `selectedCell` 从模型推导） */
  const selectCell = useCallback(
    (row: number, col: number) => {
      // `sheet` 为空说明表还没解析出来（组件此时渲染的是骨架屏，点不到）
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

  /** 提交草稿到模型（点「应用」或按回车） */
  const apply = useCallback(() => {
    if (!session || !selected || draft === null) return
    const ref = { sheet: active, row: selected.row, col: selected.col }
    if (!session.setCell(ref, draft)) {
      message.error('写不进去：这个格所在的行或表不在可编辑范围内')
      return
    }
    setView(session.view())
    // 回到「没改过」：编辑框改成显示模型（此时就是刚写进去的值）
    setDraft(null)
  }, [session, selected, draft, active, message])

  const save = async () => {
    if (!session) return
    setSaving(true)
    try {
      const bytes = await session.save()
      const file = new File([bytes as BlobPart], 'edited.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      await api.documents.replaceSource(documentId, file)
      /**
       * **保存成功后必须 commit**：把改过的 XML 烧回 entries、重解析模型。
       * 不做的话第二次编辑会拿旧 XML 拼字节，第一次的改动静默回滚
       * （两次保存都报成功）——与 pptx 同一个坑。
       */
      session.commit()
      setView(session.view())
      // 已保存 → 编辑框回到显示模型（草稿本来在 apply 时就清过了）
      setDraft(null)
      message.success(`已保存（${bytes.length} 字节）`)
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <Empty
        className={styles.state}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<Typography.Text type="danger">{error}</Typography.Text>}
      />
    )
  }
  if (!session || !sheet) {
    return (
      <div className={styles.state}>
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    )
  }

  const dirty = session.isDirty()

  return (
    <div className={styles.wrap}>
      <Space className={styles.bar} size={8} wrap>
        <span className={styles.status}>{status}</span>
        <Button
          size="small"
          type="primary"
          loading={saving}
          disabled={!dirty}
          onClick={() => void save()}
        >
          {dirty ? '保存到库' : '没有改动'}
        </Button>
        {dirty && <Tag color="processing">未保存</Tag>}
      </Space>

      {/* 多表时给页签。表名用文件里的真名（`xlsx.ts` 的老规矩） */}
      {view!.sheets.length > 1 && (
        <Segmented
          className={styles.tabs}
          size="small"
          value={active}
          onChange={(value) => {
            setActive(Number(value))
            // 换表清掉选中：那个格不在这一张表了（草稿也跟着失效）
            setSelected(null)
            setDraft(null)
          }}
          options={view!.sheets.map((s, i) => ({
            label: s.hidden ? `${s.name}（隐藏）` : s.name,
            value: i,
          }))}
        />
      )}

      {/* 选中的格子：编辑框 + 应用。表单放在表上方，避免它随滚动跑出视野 */}
      {selected && (
        <div className={styles.editor}>
          <span className={styles.cellRef}>
            {columnLetters(selected.col)}
            {selected.row}
          </span>
          <Input
            className={styles.input}
            size="small"
            value={shown}
            onChange={(event) => setDraft(event.target.value)}
            onPressEnter={apply}
            placeholder="输入内容后回车"
          />
          <Button size="small" onClick={apply}>
            应用
          </Button>
          {wasFormula && <Tag color="warning">原来是公式，改后公式会被清掉</Tag>}
        </div>
      )}

      <div className={styles.scroll}>
        {/*
          渲染的 key 用**文件里的行列号**（格子的 `col`、行的 `number`）——
          由解析器给出，不是 `map` 的下标（`xlsx.ts` 顶部讲了为什么）。
        */}
        <table className={styles.table}>
          <colgroup>
            {sheet.columns.map((column) => (
              <col key={`col-${column.col}`} style={{ width: `${column.width}px` }} />
            ))}
          </colgroup>
          <tbody>
            {sheet.rows.map((row) => (
              <tr key={`row-${row.number}`} style={{ height: `${row.height}px` }}>
                <th className={styles.gutter}>{row.number}</th>
                {row.cells.map((cell) =>
                  cell.covered ? null : (
                    <td
                      key={`cell-${cell.col}`}
                      colSpan={cell.colSpan}
                      rowSpan={cell.rowSpan}
                      className={cx(
                        styles.cell,
                        cell.numeric ? styles.numeric : undefined,
                        selected?.row === row.number && selected?.col === cell.col
                          ? styles.selected
                          : undefined,
                      )}
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

      <div className={styles.note}>
        点格子改文字，改完按回车或「应用」，再点「保存到库」。
        只改内容，样式与其余格子不受影响；**公式不重算**——改了被别的公式引用的格子，
        那边的显示值要等 Excel 打开时才更新。日期显示为序列号，图表与条件格式不显示但也不会被改动。
      </div>
    </div>
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

const useStyles = createStyles(({ css, token }) => ({
  wrap: css`
    display: flex;
    flex-direction: column;
    min-height: 0;
  `,
  bar: css`
    margin-bottom: 10px;
  `,
  status: css`
    font-family: ${token.fontFamilyCode};
    font-size: ${token.fontSizeSM}px;
    color: ${token.colorTextTertiary};
  `,
  tabs: css`
    align-self: flex-start;
    margin-bottom: 8px;
  `,
  editor: css`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  `,
  cellRef: css`
    font-family: ${token.fontFamilyCode};
    font-size: ${token.fontSizeSM}px;
    color: ${token.colorTextSecondary};
    min-width: 44px;
  `,
  input: css`
    max-width: 320px;
  `,
  scroll: css`
    overflow: auto;
    max-height: 70vh;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 6px;
  `,
  table: css`
    border-collapse: collapse;
    font-size: ${token.fontSizeSM}px;
    font-variant-numeric: tabular-nums;
  `,
  gutter: css`
    position: sticky;
    left: 0;
    min-width: 34px;
    padding: 2px 6px;
    border: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorFillQuaternary};
    color: ${token.colorTextTertiary};
    font-weight: normal;
    text-align: center;
    user-select: none;
  `,
  cell: css`
    border: 1px solid ${token.colorBorderSecondary};
    padding: 2px 6px;
    vertical-align: top;
    white-space: pre-wrap;
    max-width: 320px;
    color: ${token.colorText};
    background: ${token.colorBgContainer};
    cursor: pointer;

    &:hover {
      background: ${token.colorFillTertiary};
    }
  `,
  numeric: css`
    text-align: right;
  `,
  /* 选中的格子给主色描边——它是编辑的目标，要一眼看到在哪 */
  selected: css`
    outline: 2px solid ${token.colorPrimary};
    outline-offset: -2px;
    background: ${token.colorPrimaryBg};
  `,
  state: css`
    padding: 40px 0;
  `,
  note: css`
    margin-top: 8px;
    font-size: ${token.fontSizeSM}px;
    color: ${token.colorTextTertiary};
    line-height: 1.6;
  `,
}))
