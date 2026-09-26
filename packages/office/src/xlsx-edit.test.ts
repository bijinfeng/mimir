import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { openXlsxForEdit } from './xlsx-edit.js'
import { readXlsx } from './xlsx.js'

/**
 * xlsx 单元格编辑（`src/xlsx-edit.ts`）。
 *
 * 守的三条都是**静默失效**类——出错时不报错，只是文件里别的东西被改掉：
 *
 *  1. **共享字符串被就地改写**。`t="s"` 的格子指向 `sharedStrings.xml` 的
 *     一项，而多项共用一项。改那一项会让**所有**引用它的格子一起变——
 *     用户改 A1，D7 也变了，没有任何提示。所以新文本一律写内联字符串
 *  2. **公式没被清掉**。只换 `<v>` 而留着 `<f>`，Excel 打开会按公式重算，
 *     用户输入的值被丢掉
 *  3. **别的条目被重排**。zip 里其余条目必须逐字节写回
 *
 * 夹具是上游的 xlsx-fixture（vendored 在 `packages/office/vendor/...`）：
 * 它刻意含共享字符串、内联字符串、公式格、合并单元格、稀疏行。
 */
const FIXTURE = new URL(
  '../vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
  import.meta.url,
)

function load(): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURE))
}

/** 取一个 zip 条目的文本 */
async function entry(bytes: Uint8Array, name: string): Promise<string | null> {
  const zip = await JSZip.loadAsync(bytes)
  const file = zip.file(name)
  return file ? file.async('string') : null
}

/** 逐个条目比较两份字节 */
async function changedEntries(
  before: Uint8Array,
  after: Uint8Array,
): Promise<{ changed: string[]; added: string[]; removed: string[] }> {
  const [a, b] = await Promise.all([JSZip.loadAsync(before), JSZip.loadAsync(after)])
  const names = new Set([
    ...Object.keys(a.files).filter((n) => !a.files[n]!.dir),
    ...Object.keys(b.files).filter((n) => !b.files[n]!.dir),
  ])
  const changed: string[] = []
  const added: string[] = []
  const removed: string[] = []

  for (const name of [...names].toSorted()) {
    const fa = a.files[name]
    const fb = b.files[name]
    if (!fa) {
      added.push(name)
      continue
    }
    if (!fb) {
      removed.push(name)
      continue
    }
    const [da, db] = await Promise.all([fa.async('uint8array'), fb.async('uint8array')])
    if (da.byteLength !== db.byteLength) {
      changed.push(name)
      continue
    }
    for (let i = 0; i < da.byteLength; i += 1) {
      if (da[i] !== db[i]) {
        changed.push(name)
        break
      }
    }
  }
  return { changed, added, removed }
}

describe('xlsx 编辑：无改动时逐字节相同', () => {
  it('打开后直接保存，每个条目字节一致', async () => {
    const bytes = load()
    const session = await openXlsxForEdit(bytes)
    expect(session.isDirty()).toBe(false)

    const diff = await changedEntries(bytes, await session.save())
    expect(diff.changed).toEqual([])
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
  })
})

describe('xlsx 编辑：改一个格子', () => {
  it('只有那一张 sheet 的 XML 变化，sharedStrings 一个字节都不动', async () => {
    const bytes = load()
    const session = await openXlsxForEdit(bytes)

    // 夹具 A2 是共享字符串（t="s"）
    const sheet = session.view().sheets[0]!
    const row = sheet.rows.find((r) => r.number === 2)!
    expect(row.cells[0]?.text).toBe('姓名')

    const ok = session.setCell({ sheet: 0, row: 2, col: 0 }, '改过的姓名')
    expect(ok).toBe(true)
    expect(session.isDirty()).toBe(true)

    const out = await session.save()
    const diff = await changedEntries(bytes, out)

    /**
     * **这条是本次改动的核心断言**：共享字符串表必须原样。改它会让所有
     * 引用同一项的格子一起变——而那个失效没有任何提示。
     */
    expect(diff.changed).toEqual(['xl/worksheets/sheet1.xml'])
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])

    const sharedBefore = await entry(bytes, 'xl/sharedStrings.xml')
    const sharedAfter = await entry(out, 'xl/sharedStrings.xml')
    expect(sharedAfter).toBe(sharedBefore)
  })

  it('新文字能读回来，且原文字在别处不受影响', async () => {
    const bytes = load()
    const session = await openXlsxForEdit(bytes)
    session.setCell({ sheet: 0, row: 2, col: 0 }, '改过的姓名')
    const out = await session.save()

    const reopened = await readXlsx(out)
    const sheet = reopened.sheets[0]!
    expect(sheet.rows.find((r) => r.number === 2)?.cells[0]?.text).toBe('改过的姓名')

    // 夹具里 A2 与 A1 都指向共享字符串第 0 项（"姓名"）。改 A2 之后
    // A1 必须还是「姓名」——不这样做的话就是共享字符串被就地改了
    expect(sheet.rows.find((r) => r.number === 1)?.cells[0]?.text).toBe('姓名')
  })

  it('公式格被覆盖时公式一起清掉（只换 <v> 会让 Excel 重算回旧值）', async () => {
    const bytes = load()
    const session = await openXlsxForEdit(bytes)
    // 夹具 C3 是 <f>SUM(1,2)</f> + 缓存值 1001
    expect(session.isFormula({ sheet: 0, row: 3, col: 2 })).toBe(true)

    session.setCell({ sheet: 0, row: 3, col: 2 }, '手动输入')
    const after = await entry(await session.save(), 'xl/worksheets/sheet1.xml')

    expect(after).not.toBeNull()
    // 该格的新内容
    expect(after).toContain('<c r="C3" t="inlineStr"><is><t>手动输入</t></is></c>')
    /*
     * `<f>SUM(1,2)</f>` 必须**连同它的缓存值一起消失**。留着 `<f>` 的话
     * Excel 打开时会重算成 3，用户输入的「手动输入」被静默丢掉。
     */
    expect(after).not.toContain('SUM(1,2)')
  })

  it('数字格改成文字后不再是数字（右对齐会跟着变）', async () => {
    const bytes = load()
    const session = await openXlsxForEdit(bytes)
    // 夹具 C5 是数字 88.5
    expect(session.view().sheets[0]!.rows.find((r) => r.number === 5)?.cells[2]?.numeric).toBe(true)

    session.setCell({ sheet: 0, row: 5, col: 2 }, '八十八点五')
    const reopened = await readXlsx(await session.save())
    const cell = reopened.sheets[0]!.rows.find((r) => r.number === 5)?.cells[2]
    expect(cell?.text).toBe('八十八点五')
    expect(cell?.numeric).toBeUndefined()
  })

  it('行里没有的格可以写进去（按列号插到正确位置）', async () => {
    const bytes = load()
    const session = await openXlsxForEdit(bytes)
    /*
     * 夹具这一行只有 A、B、C 三个 `<c>`，所以「行里不存在这个格」要往
     * 已有的格**之后**写（D 列）。这与「Excel 跳过了中间的空格、用户去填
     * 那个空」是**同一条插入代码路径**（都走按列号找插入点那段）——
     * 真实文件里跳过空格很常见（`xlsx.ts` 顶部记着这个坑）。
     */
    expect(session.cellText({ sheet: 0, row: 5, col: 3 })).toBe('')

    const ok = session.setCell({ sheet: 0, row: 5, col: 3 }, '补上的第四格')
    expect(ok).toBe(true)

    const reopened = await readXlsx(await session.save())
    const row = reopened.sheets[0]!.rows.find((r) => r.number === 5)!
    expect(row.cells.map((c) => c.text)).toEqual([
      '李四',
      '市场部 & <测试>',
      '88.5',
      '补上的第四格',
    ])
  })

  it('插入的格落在正确的列位（实测踩过：列号算错会让它跑到行首）', async () => {
    /*
     * 守一个**实测踩过的坑**：`columnOf` 要的是列字母（`A`），不是整个引用
     * （`A5`）——传错的话算出的列号荒谬地大，于是「后一个格的列号 > 本格」
     * 在**第一个格**就成立，新格被插到**行首**。
     *
     * 症状完全是静默的：`<c r="D5">` 出现在 A5 前面，我们的预览按 `r` 属性
     * 定位所以照常显示，而 Excel 对 `<c>` 顺序有要求（必须按列升序）。
     */
    const bytes = load()
    const session = await openXlsxForEdit(bytes)
    session.setCell({ sheet: 0, row: 5, col: 3 }, 'D5 的内容')
    const after = await entry(await session.save(), 'xl/worksheets/sheet1.xml')

    const row = /<row r="5"[\s\S]*?<\/row>/.exec(after ?? '')?.[0] ?? ''
    const refs = [...row.matchAll(/<c r="([A-Z]+)\d+"/g)].map((m) => m[1]!)
    expect(refs, 'D 列必须排在 C 之后').toEqual(['A', 'B', 'C', 'D'])
  })

  it('列顺序被保持（插入的 <c> 必须在正确的列位，顺序错 Excel 会拒开）', async () => {
    const bytes = load()
    const session = await openXlsxForEdit(bytes)
    session.setCell({ sheet: 0, row: 5, col: 1 }, 'B5')
    const after = await entry(await session.save(), 'xl/worksheets/sheet1.xml')

    // 第 5 行里 <c> 的 r 引用必须按列号升序（A → B → C）
    const row = /<row r="5"[\s\S]*?<\/row>/.exec(after ?? '')?.[0] ?? ''
    const refs = [...row.matchAll(/<c r="([A-Z]+)/g)].map((m) => m[1]!)
    expect(refs).toEqual(['A', 'B', 'C'])
  })

  it('特殊字符被转义（& < > 不会破坏 XML）', async () => {
    const bytes = load()
    const session = await openXlsxForEdit(bytes)
    session.setCell({ sheet: 0, row: 2, col: 0 }, 'A & B <tag> "q"')
    const after = await entry(await session.save(), 'xl/worksheets/sheet1.xml')

    expect(after).toContain('A &amp; B &lt;tag&gt; "q"')
    // 未转义的话这里会有裸的 <tag>，整份 XML 就不是良构的了
    expect(after).not.toContain('<tag>')

    // 而且读得回来（转义是可逆的）
    const reopened = await readXlsx(await session.save())
    expect(reopened.sheets[0]!.rows.find((r) => r.number === 2)?.cells[0]?.text).toBe(
      'A & B <tag> "q"',
    )
  })

  it('前后空格被保住（xml:space="preserve"）', async () => {
    const bytes = load()
    const session = await openXlsxForEdit(bytes)
    session.setCell({ sheet: 0, row: 2, col: 0 }, '  两侧有空格  ')
    const out = await session.save()

    const after = await entry(out, 'xl/worksheets/sheet1.xml')
    expect(after).toContain('xml:space="preserve"')

    const reopened = await readXlsx(out)
    expect(reopened.sheets[0]!.rows.find((r) => r.number === 2)?.cells[0]?.text).toBe(
      '  两侧有空格  ',
    )
  })

  it('两次保存都保留各自的改动（commit 之后状态已对齐）', async () => {
    const bytes = load()
    const session = await openXlsxForEdit(bytes)

    session.setCell({ sheet: 0, row: 2, col: 0 }, '第一次改')
    await session.save()
    session.commit()

    session.setCell({ sheet: 0, row: 3, col: 0 }, '第二次改')
    const out = await session.save()
    session.commit()

    const reopened = await readXlsx(out)
    const rows = reopened.sheets[0]!.rows
    expect(rows.find((r) => r.number === 2)?.cells[0]?.text).toBe('第一次改')
    expect(rows.find((r) => r.number === 3)?.cells[0]?.text).toBe('第二次改')
  })

  it('不存在的行如实返回失败（不静默什么都不做）', async () => {
    const session = await openXlsxForEdit(load())
    expect(session.setCell({ sheet: 0, row: 999, col: 0 }, 'x')).toBe(false)
  })

  it('不存在的工作表如实返回失败', async () => {
    const session = await openXlsxForEdit(load())
    expect(session.setCell({ sheet: 99, row: 1, col: 0 }, 'x')).toBe(false)
  })
})

describe('xlsx 编辑：清空一个格子', () => {
  it('写空串把这个格清空，但格子还在（样式与列位保留）', async () => {
    const bytes = load()
    const session = await openXlsxForEdit(bytes)
    session.setCell({ sheet: 0, row: 2, col: 0 }, '')

    const after = await entry(await session.save(), 'xl/worksheets/sheet1.xml')
    expect(after).toContain('<c r="A2" t="inlineStr"><is><t></t></is></c>')

    const reopened = await readXlsx(await session.save())
    expect(reopened.sheets[0]!.rows.find((r) => r.number === 2)?.cells[0]?.text).toBe('')
  })
})
