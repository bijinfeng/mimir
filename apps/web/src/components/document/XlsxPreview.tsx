import { useEffect, useState } from 'react'
import { Empty, Segmented, Skeleton, Typography } from 'antd'
import { createStyles } from 'antd-style'
import { readXlsx, type XlsxWorkbook } from '@mimir/office'
import { api } from '@/lib/api'

/**
 * xlsx 的**网格预览**（`packages/office/src/xlsx.ts` 解析）。
 *
 * ## 为什么不用上游的 xlsx 编辑器
 *
 * 那是「可编辑的电子表格」——读取依赖 13.7K 行 Rust 侧车（会话式读表 +
 * 公式重算）+ Univer（其 import/export 是付费项）。mimir 要的是**把表画出来**，
 * 两者成本差一个数量级（`docs/TECH.md` §15.7）。
 *
 * ## 空行号会跳号（那是事实，不是 bug）
 *
 * 整行空白被丢掉了，所以行号栏会出现 3 跳到 5 这种断口。**显示真实行号**
 * 就是为了让这事可见：否则用户拿预览对原件时，会以为预览少了内容。
 *
 * ## 只读的三个如实标注
 *
 * 与 `plugins/parser/src/xlsx.ts` 同一条规矩——**不猜**：
 *   - 日期不还原（xlsx 里是序列号 + 样式）。猜错会把普通数字显示成日期
 *   - 公式显示 Excel 存好的**缓存值**，格上标注它是公式（我们不重算）
 *   - 条件格式、图表、数据透视不画（画不出来就留空，而不是画错的示意）
 */
export function XlsxPreview({ documentId }: { documentId: string }) {
  const { styles, cx } = useStyles()
  const [workbook, setWorkbook] = useState<XlsxWorkbook | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(api.documents.sourceUrl(documentId), { credentials: 'include' })
        if (!res.ok) throw new Error(`读取原件失败：HTTP ${res.status}`)
        const parsed = await readXlsx(new Uint8Array(await res.arrayBuffer()))
        if (!cancelled) setWorkbook(parsed)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [documentId])

  if (error) {
    return (
      <Empty
        className={styles.state}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<Typography.Text type="danger">{error}</Typography.Text>}
      />
    )
  }
  if (!workbook) {
    return (
      <div className={styles.state}>
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    )
  }

  const sheet = workbook.sheets[active] ?? workbook.sheets[0]
  if (!sheet) return null

  const hidden = workbook.sheets.filter((s) => s.hidden).length

  return (
    <div className={styles.wrap}>
      {/*
        多表给页签；单表给一行标题。两者都写**文件里的真名**（workbook.xml 的
        `<sheet name>`），不是「工作表 N」——预览上的名字必须能在 Excel 里找到，
        否则用户对不上页签。
      */}
      {workbook.sheets.length > 1 ? (
        <Segmented
          className={styles.tabs}
          size="small"
          value={active}
          onChange={(value) => setActive(Number(value))}
          options={workbook.sheets.map((s, i) => ({
            // 隐藏的工作表 Excel 不显示页签，这里照实标出来（不静默）
            label: s.hidden ? `${s.name}（隐藏）` : s.name,
            value: i,
          }))}
        />
      ) : (
        <div className={styles.sheetName}>
          {sheet.hidden ? `${sheet.name}（隐藏）` : sheet.name}
        </div>
      )}

      <div className={styles.scroll}>
        {/*
          渲染的 key 用**文件里的行列号**（格子的 `col`、行的 `number`）——
          由解析器给出，不是 `map` 的下标。表格的位置就是身份，而 Excel 会
          跳过空格的 `<c>`、丢掉空的 `<row>`：用下标当身份会让行整体上移、
          列整体左移，画出来却看着正常（`packages/office/src/xlsx.ts` 顶部）。
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
                      className={cx(styles.cell, cell.numeric ? styles.numeric : undefined)}
                      title={cell.formula ? '公式（显示 Excel 算好的缓存值）' : undefined}
                    >
                      {cell.text}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.note}>
        只读预览：日期显示为原始序列号，公式显示缓存值，不含图表与条件格式。行号跳号说明那几行是空的。
        {hidden > 0 && `共 ${hidden} 张隐藏工作表（Excel 里默认不显示，这里列出来）。`}
        要看原样请下载原件。
      </div>
    </div>
  )
}

const useStyles = createStyles(({ css, token }) => ({
  wrap: css`
    display: flex;
    flex-direction: column;
    min-height: 0;
  `,
  tabs: css`
    align-self: flex-start;
    margin-bottom: 10px;
  `,
  /* 单表时替代页签的一行标题：告诉用户在看哪张表，而不是把名字藏起来 */
  sheetName: css`
    margin-bottom: 6px;
    font-size: ${token.fontSizeSM}px;
    color: ${token.colorTextSecondary};
  `,
  scroll: css`
    overflow: auto;
    max-height: 70vh;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 6px;
  `,
  /* 表格用 Excel 的外观：网格线 + 行号栏。字号比正文小一档
     （表格是扫读的，不是连续阅读） */
  table: css`
    border-collapse: collapse;
    font-size: ${token.fontSizeSM}px;
    font-variant-numeric: tabular-nums;
  `,
  /* 行号栏是坐标，不是数据：底色压一档、不参与选中、窄且居中 */
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
  `,
  /* 数字右对齐（Excel 的默认），文本左对齐 */
  numeric: css`
    text-align: right;
  `,
  state: css`
    padding: 40px 0;
  `,
  note: css`
    margin-top: 8px;
    font-size: ${token.fontSizeSM}px;
    color: ${token.colorTextTertiary};
  `,
}))
