import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readXlsx, type XlsxSheet } from './xlsx.js'

/**
 * xlsx 网格解析的正确性（`src/xlsx.ts`）。
 *
 * 夹具是一份**刻意构造得棘手**的表：合并单元格、稀疏行（缺第 4 行）、
 * 公式格、数字与文本混排、内联字符串、XML 实体。这些都是「看起来解析成功
 * 但内容错位/丢失」的高发处——而那种错误不报错，只是画出来的表不对。
 */
const FIXTURE = new URL(
  '../vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
  import.meta.url,
)

async function loadSheet(): Promise<XlsxSheet> {
  const wb = await readXlsx(new Uint8Array(readFileSync(FIXTURE)))
  return wb.sheets[0]!
}

/** 一个格：`cell(sheet, 行序, 列)`——行序是**渲染序**（跳过空行之后） */
function cell(sheet: XlsxSheet, row: number, col: number) {
  return sheet.rows[row]?.cells[col]
}

describe('readXlsx', () => {
  it('共享字符串查表（下标从 0 开始）', async () => {
    const sheet = await loadSheet()
    // A2 是 t="s" v="0" → 第一个共享字符串「姓名」
    expect(cell(sheet, 1, 0)?.text).toBe('姓名')
    expect(cell(sheet, 1, 1)?.text).toBe('部门')
  })

  it('内联字符串直读', async () => {
    const sheet = await loadSheet()
    // C2 是 <is><t>工号</t></is>
    expect(cell(sheet, 1, 2)?.text).toBe('工号')
  })

  it('XML 实体被解码（不是显示 &amp; 字面量）', async () => {
    const sheet = await loadSheet()
    const found = sheet.rows.flatMap((row) => row.cells).find((c) => c.text.includes('市场部'))
    expect(found?.text).toBe('市场部 & <测试>')
  })

  it('合并单元格：左上角跨距 + 其余格标记 covered（不删格以免错位）', async () => {
    const sheet = await loadSheet()
    expect(cell(sheet, 0, 0)?.colSpan).toBe(3)
    expect(cell(sheet, 0, 0)?.mergeRef).toBe('A1:C1')
    expect(cell(sheet, 0, 1)?.covered).toBe(true)
    expect(cell(sheet, 0, 2)?.covered).toBe(true)
  })

  it('行号取文件里的 r（空行被丢掉时跳号，而不是让整表上移）', async () => {
    const sheet = await loadSheet()
    // 夹具只有 r=1,2,3,5 四行（第 4 行整空）
    expect(sheet.rows.map((row) => row.number)).toEqual([1, 2, 3, 5])
    // 第 5 行仍然是第 5 行——它**没有**被压到第 4 行的位置
    expect(cell(sheet, 3, 0)?.text).toBe('李四')
  })

  it('每个格带列号，与它在行里的位置一致', async () => {
    const sheet = await loadSheet()
    expect(sheet.rows.map((row) => row.cells.map((c) => c.col))).toEqual([
      [0, 1, 2],
      [0, 1, 2],
      [0, 1, 2],
      [0, 1, 2],
    ])
  })

  it('数字与公式：数字标记 numeric、公式标记 formula', async () => {
    const sheet = await loadSheet()
    const numericCell = sheet.rows.flatMap((row) => row.cells).find((c) => c.text === '88.5')
    expect(numericCell?.numeric).toBe(true)
    const formulaCell = sheet.rows.flatMap((row) => row.cells).find((c) => c.text === '1001')
    expect(formulaCell?.formula).toBe(true)
    expect(formulaCell?.formulaCache).toBe('cached')
  })

  it('列宽与行高按 xlsx 单位近似换算', async () => {
    const sheet = await loadSheet()
    // 夹具声明 A 列 width=14.5 → 14.5 * 7 + 5 ≈ 107
    expect(sheet.columns[0]?.width).toBe(107)
    // 第 1 行 ht=24pt → 24 * 4/3 = 32
    expect(sheet.rows[0]?.height).toBe(32)
  })
})

describe('readXlsx 的边界', () => {
  it.each([
    [undefined, '1900-01-01'],
    ['0', '1900-01-01'],
    ['false', '1900-01-01'],
    ['1', '1904-01-02'],
    ['true', '1904-01-02'],
  ])('同一日期序列按 workbookPr date1904=%s 显示为 %s，保留原值', async (date1904, text) => {
    const sheet = (
      await readXlsx(
        buildXlsx({
          sheetData: [],
          date1904,
          sheets: [
            {
              name: '日期',
              sheetData: ['<row r="1"><c r="A1" s="1"><v>1</v></c><c r="B1"><v>1</v></c></row>'],
            },
          ],
          styles:
            '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>',
        }),
      )
    ).sheets[0]!
    expect(sheet.rows[0]?.cells[0]).toMatchObject({ text, rawText: '1' })
    expect(sheet.rows[0]?.cells[1]).toMatchObject({ text: '1', rawText: '1' })
  })

  it('中间空格的 <c> 被 Excel 省略时，列不左移', async () => {
    const wb = await readXlsx(
      buildXlsx({
        sheetData: [
          '<row r="1"><c r="A1" t="inlineStr"><is><t>左</t></is></c><c r="C1" t="inlineStr"><is><t>右</t></is></c></row>',
        ],
      }),
    )
    const cells = wb.sheets[0]?.rows[0]?.cells ?? []
    expect(cells.map((c) => c.text)).toEqual(['左', '', '右'])
    expect(cells.map((c) => c.col)).toEqual([0, 1, 2])
  })

  it('合并区域决定表宽（跨过的空格子 Excel 不写 <c>）', async () => {
    // 只有一行、且合并把表撑到 3 列：只看行宽会把 C 列整个丢掉
    const wb = await readXlsx(
      buildXlsx({
        sheetData: ['<row r="1"><c r="A1" t="inlineStr"><is><t>标题</t></is></c></row>'],
        mergeCells: ['A1:C1'],
      }),
    )
    const sheet = wb.sheets[0]!
    expect(sheet.rows[0]?.cells[0]?.colSpan).toBe(3)
    expect(sheet.columns).toHaveLength(3)
  })

  it('跨过空行的合并：rowSpan 按渲染出来的行算（不是行号相减）', async () => {
    const wb = await readXlsx(
      buildXlsx({
        sheetData: [
          '<row r="1"><c r="A1" t="inlineStr"><is><t>分</t></is></c><c r="B1" t="inlineStr"><is><t>甲</t></is></c></row>',
          '<row r="4"><c r="B4" t="inlineStr"><is><t>乙</t></is></c></row>',
        ],
        mergeCells: ['A1:A9'],
      }),
    )
    const sheet = wb.sheets[0]!
    // 文件里跨到第 9 行，而渲染出来的只有 2 行——rowSpan 必须是 2，否则表格散架
    expect(sheet.rows[0]?.cells[0]?.rowSpan).toBe(2)
  })

  it('空工作表仍显示可编辑的 A1，且不把它计作已用内容', async () => {
    const bytes = buildXlsx({ sheetData: ['<row r="1"><c r="A1"><v></v></c></row>'] })
    const sheet = (await readXlsx(bytes)).sheets[0]
    expect(sheet?.empty).toBe(true)
    expect(sheet?.rows[0]?.cells[0]?.text).toBe('')
    expect(sheet?.columns).toHaveLength(1)
  })

  it('没有缓存值的公式行仍可见', async () => {
    const bytes = buildXlsx({ sheetData: ['<row r="2"><c r="A2"><f>1+2</f></c></row>'] })
    const sheet = (await readXlsx(bytes)).sheets[0]
    expect(sheet?.rows[0]?.number).toBe(2)
    expect(sheet?.rows[0]?.cells[0]?.formulaText).toBe('=1+2')
    expect(sheet?.rows[0]?.cells[0]?.formulaCache).toBe('missing')
  })

  it('does not invent FALSE for a boolean formula whose cache is missing', async () => {
    const bytes = buildXlsx({ sheetData: ['<row r="1"><c r="A1" t="b"><f>TRUE()</f></c></row>'] })
    const entry = (await readXlsx(bytes)).sheets[0]!.rows[0]!.cells[0]!
    expect(entry.formulaCache).toBe('missing')
    expect(entry.text).toBe('')
    expect(entry.boolean).toBeUndefined()
  })

  it('distinguishes typed empty and whitespace text caches from missing numeric caches', async () => {
    const sheet = (
      await readXlsx(
        buildXlsx({
          sheetData: [
            '<row r="1"><c r="A1" t="str"><f>""</f><v></v></c><c r="B1" t="str"><f>""</f><v/></c><c r="C1" t="str"><f>" "</f><v> </v></c><c r="D1"><f>1+2</f><v/></c><c r="E1" t="str"><f>""</f></c></row>',
          ],
        }),
      )
    ).sheets[0]!
    expect(sheet.rows[0]!.cells.map((entry) => entry.formulaCache)).toEqual([
      'cached',
      'cached',
      'cached',
      'missing',
      'missing',
    ])
    expect(sheet.rows[0]!.cells[0]!.text).toBe('')
    expect(sheet.rows[0]!.cells[2]!.text).toBe(' ')
  })

  it('cellXfs 的样式索引通过 fontId 显示加粗，不把 s 当成字体索引', async () => {
    const sheet = (
      await readXlsx(
        buildXlsx({
          sheetData: [
            '<row r="1"><c r="A1" s="2" t="inlineStr"><is><t>粗体</t></is></c><c r="B1" s="1" t="inlineStr"><is><t>常规</t></is></c></row>',
          ],
          styles:
            '<styleSheet><fonts count="2"><font/><font><b/></font></fonts>' +
            '<cellXfs count="3"><xf fontId="0"/><xf fontId="0"/><xf fontId="1"/></cellXfs></styleSheet>',
        }),
      )
    ).sheets[0]
    expect(sheet?.rows[0]?.cells[0]?.bold).toBe(true)
    expect(sheet?.rows[0]?.cells[1]?.bold).toBeUndefined()
  })
})

/**
 * 工作表的名字、顺序、隐藏状态都得从 `workbook.xml` 读——这三样都**不在**
 * 工作表文件里。拿文件名当名字，用户会看到一个 Excel 里根本不存在的页签名。
 */
describe('readXlsx 的工作表清单', () => {
  it('页签名取 workbook.xml 的真名（不是「工作表 N」）', async () => {
    const wb = await readXlsx(
      buildXlsx({
        sheetData: [],
        sheets: [
          {
            name: '销售数据',
            sheetData: ['<row r="1"><c r="A1" t="inlineStr"><is><t>甲</t></is></c></row>'],
          },
          {
            name: '汇总',
            sheetData: ['<row r="1"><c r="A1" t="inlineStr"><is><t>乙</t></is></c></row>'],
          },
        ],
      }),
    )
    expect(wb.sheets.map((s) => s.name)).toEqual(['销售数据', '汇总'])
  })

  it('顺序按 workbook.xml 的 <sheet> 出现顺序（不是文件序号）', async () => {
    const wb = await readXlsx(
      buildXlsx({
        sheetData: [],
        sheets: [
          // 「先」指向 sheet2.xml、「后」指向 sheet1.xml：按文件名排会把顺序弄反
          {
            name: '先',
            entry: 'xl/worksheets/sheet2.xml',
            sheetData: ['<row r="1"><c r="A1" t="inlineStr"><is><t>一</t></is></c></row>'],
          },
          {
            name: '后',
            entry: 'xl/worksheets/sheet1.xml',
            sheetData: ['<row r="1"><c r="A1" t="inlineStr"><is><t>二</t></is></c></row>'],
          },
        ],
      }),
    )
    expect(wb.sheets.map((s) => s.name)).toEqual(['先', '后'])
    expect(wb.sheets[0]?.rows[0]?.cells[0]?.text).toBe('一')
  })

  it('隐藏的工作表仍然列出并标记（Excel 不显示页签，少一张表会让人以为文件里没有）', async () => {
    const wb = await readXlsx(
      buildXlsx({
        sheetData: [],
        sheets: [
          {
            name: '显',
            sheetData: ['<row r="1"><c r="A1" t="inlineStr"><is><t>甲</t></is></c></row>'],
          },
          {
            name: '隐',
            hidden: true,
            sheetData: ['<row r="1"><c r="A1" t="inlineStr"><is><t>乙</t></is></c></row>'],
          },
        ],
      }),
    )
    expect(wb.sheets.map((s) => s.name)).toEqual(['显', '隐'])
    expect(wb.sheets[0]?.hidden).toBeUndefined()
    expect(wb.sheets[1]?.hidden).toBe(true)
  })

  it('没有 workbook.xml 时退回按文件名编号（名字是编的，不是错的）', async () => {
    const wb = await readXlsx(
      buildXlsx({ sheetData: ['<row r="1"><c r="A1" t="inlineStr"><is><t>甲</t></is></c></row>'] }),
    )
    expect(wb.sheets[0]?.name).toBe('工作表 1')
  })
})

/**
 * 造一份最小的 xlsx。只写解析器真正会读的几处：
 * `xl/worksheets/*.xml`、可选的 `xl/workbook.xml` + rels（页签名/顺序/隐藏）、
 * `[Content_Types].xml`（JSZip 不校验，但保持文件像真的）。
 *
 * 不传 `sheets` 时按旧写法生成单张 `sheet1.xml`——`workbook.xml` 也一起省掉，
 * 这样「文件里没有 workbook.xml 时退回按文件名编号」这条退路也被覆盖到。
 */
function buildXlsx(input: {
  sheetData: string[]
  mergeCells?: string[]
  sheets?: { name: string; sheetData: string[]; hidden?: boolean; entry?: string }[]
  styles?: string
  date1904?: string
}): Uint8Array {
  const entries: { name: string; text: string }[] = [
    { name: '[Content_Types].xml', text: '<?xml version="1.0"?><Types/>' },
  ]
  if (input.styles) entries.push({ name: 'xl/styles.xml', text: input.styles })

  const list = input.sheets ?? [{ name: '工作表 1', sheetData: input.sheetData }]
  for (const [index, sheet] of list.entries()) {
    entries.push({
      name: sheet.entry ?? `xl/worksheets/sheet${index + 1}.xml`,
      text: worksheetXml(sheet.sheetData, index === 0 ? input.mergeCells : undefined),
    })
  }

  if (input.sheets) {
    entries.push({
      name: 'xl/workbook.xml',
      text: `<?xml version="1.0"?><workbook>${input.date1904 === undefined ? '' : `<workbookPr date1904="${input.date1904}"/>`}<sheets>${input.sheets
        .map((sheet, index) => {
          const state = sheet.hidden ? ' state="hidden"' : ''
          return `<sheet name="${sheet.name}" sheetId="${index + 1}" r:id="rId${index + 1}"${state}/>`
        })
        .join('')}</sheets></workbook>`,
    })
    entries.push({
      name: 'xl/_rels/workbook.xml.rels',
      text: `<?xml version="1.0"?><Relationships>${input.sheets
        .map(
          (sheet, index) =>
            `<Relationship Id="rId${index + 1}" Target="${sheet.entry ?? `worksheets/sheet${index + 1}.xml`}"/>`,
        )
        .join('')}</Relationships>`,
    })
  }

  // 不依赖 jszip 的打包器接口，直接拼一个 store 模式的 zip
  return zipStore(entries)
}

function worksheetXml(sheetData: string[], mergeCells?: string[]): string {
  const merge = mergeCells?.length
    ? `<mergeCells count="${mergeCells.length}">${mergeCells
        .map((ref) => `<mergeCell ref="${ref}"/>`)
        .join('')}</mergeCells>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetData.join(
    '',
  )}</sheetData>${merge}</worksheet>`
}

/** 极简 ZIP（store，无压缩）。解析器读的是**条目内容**，压缩方式无关紧要 */
function zipStore(entries: { name: string; text: string }[]): Uint8Array {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const data = encoder.encode(entry.text)
    const crc = crc32(data)

    const local = new Uint8Array(30 + name.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(8, 0, true) // store
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    local.set(data, 30 + name.length)
    locals.push(local)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(10, 0, true) // store
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    centrals.push(central)

    offset += local.length
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const parts = [...locals, ...centrals, end]
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let cursor = 0
  for (const part of parts) {
    out.set(part, cursor)
    cursor += part.length
  }
  return out
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
