/**
 * @vitest-environment happy-dom
 *
 * xlsx 工具条的**行为契约**。
 *
 * 这些断言守的是这个仓库最在意的一类错：**按钮接了一个不存在的命令**。
 * 那种按钮点了没反应、也不报错，看代码看不出来（链式调用照样返回成功）。
 * 所以这里不测「长什么样」，只测**每个按钮真的落到了内核上**——
 * 逐项走完「点它 → 模型/文件真的变了」：
 *
 * | 按钮 | 断言的落点 |
 * |---|---|
 * | 清空 | 保存出来的 `sheet1.xml` 里那一格变成空的内联字符串格，`sharedStrings.xml` 一字节没动 |
 * | 复制 | `navigator.clipboard.writeText` 收到了那一格的文字 |
 * | 查找上一个 / 下一个 | 选中的格子真的换成了命中 / 前一个命中 |
 * | 公式格跳转 | 选中的格子是夹具里那一格公式（C3） |
 * | 十字高亮 | 渲染出来的行与列真的带上了 `--cross` |
 *
 * 另有一组**控件契约**（`没有绕过点` 那一段）：这个格式的控件现在全走
 * `EditorShell` 的 antd 原语，而没有断言的「已经换好了」会在下一次改动里
 * 静默退回去——多一个裸 `<input>` 就是「同一排两种高度、两种焦点环」的起点。
 *
 * 夹具是 vendored 的 `xlsx-fixture.xlsx`（与 `xlsx-edit.test.ts` 同一份）：
 * A2「姓名」、B2「部门」、C2「工号」、C3 是公式格（缓存值 1001）、
 * B5「市场部 & <测试>」、C5 数字 88.5。
 */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { XlsxEditor } from './XlsxEditor.js'
import type { EditorIo, SaveTarget } from './types.js'

/**
 * 夹具路径用 `import.meta.dirname` 拼，**不用 `new URL(..., import.meta.url)`**。
 *
 * happy-dom 会替换全局 `URL`，于是 `readFileSync(new URL(…))` 抛
 * 「The URL must be of scheme file」——`.trellis/spec/office/engine/index.md` 记着这条
 * （实测过：解析类测试整片挂掉）。这个文件要 DOM，所以必须绕开那个全局。
 */
const FIXTURE = join(
  import.meta.dirname,
  '../../vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
)

/* ── 挂载工具（与 EditorShell.test.tsx 同一套手法） ────────────── */

const mounted: { unmount: () => void }[] = []

afterEach(() => {
  for (const item of mounted) item.unmount()
  mounted.length = 0
})

function mount(node: Parameters<typeof createRoot>[1] extends never ? never : React.ReactNode) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  act(() => root.render(node))
  let live = true
  const unmount = () => {
    if (!live) return
    live = false
    act(() => root.unmount())
    host.remove()
  }
  mounted.push({ unmount })
  return host
}

/**
 * 等异步的「读字节 → 解析」跑完。
 *
 * 解析是 promise 链（`useSource` 读 → `useParsed` 解析），一次宏任务不够，
 * 所以循环到表格出现或超时——**超时要报错**，不然断言会在一个空白页上通过。
 */
async function waitForTable(host: HTMLElement): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    if (host.querySelector('.mimir-xlsx') !== null) return
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  throw new Error(`表格没渲染出来。界面现在是：${host.textContent ?? ''}`)
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

/** 敲一个键（回车 / Esc 的语义全在 `keydown` 上） */
function press(element: Element, key: string) {
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

/**
 * 往受控输入里真的输入（走原型上的 setter，见 EditorShell.test.tsx 的说明）。
 *
 * 参数是 `Element`（`byLabelPrefix` 返回的就是它）——这里显式判一下它是不是
 * `<input>`，不然一个查错元素的选择器会让测试在一句难懂的报错上停住。
 */
function type(element: Element, value: string) {
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`这不是一个输入框，是 <${element.tagName.toLowerCase()}>`)
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(element, value)
  act(() => {
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** 按 aria-label 找一个控件（按钮的 label 就是这个仓库的可访问名称） */
function byLabel(host: HTMLElement, label: string): HTMLElement {
  const found = host.querySelector<HTMLElement>(`[aria-label="${label}"]`)
  if (found === null)
    throw new Error(`界面上没有「${label}」。现有控件：${labels(host).join('、')}`)
  return found
}

function labels(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>('[aria-label]')].map(
    (el) => el.getAttribute('aria-label') ?? '',
  )
}

/** 「清空」按钮的 label 里带代价说明（tooltip 即无障碍名称），所以取前缀匹配 */
function byLabelPrefix(host: HTMLElement, prefix: string): HTMLElement {
  const found = [...host.querySelectorAll<HTMLElement>('[aria-label]')].find((el) =>
    (el.getAttribute('aria-label') ?? '').startsWith(prefix),
  )
  if (found === undefined) throw new Error(`界面上没有以「${prefix}」开头的控件`)
  return found
}

/**
 * 第 `rowNumber` 行、第 `col` 列的那个 `<td>`。
 *
 * **不能按下标取**：合并覆盖的格不渲染（夹具的 A1 跨了 3 列，B1/C1 就没有
 * `<td>`），而列号是文件里的列号。所以按 `colSpan` 累加着找。
 */
function cellAt(host: HTMLElement, rowNumber: number, col: number): HTMLTableCellElement {
  const row = [...host.querySelectorAll('tr')].find(
    (tr) => tr.querySelector('th')?.textContent === String(rowNumber),
  )
  if (row === undefined) throw new Error(`表格里没有第 ${rowNumber} 行`)
  let cursor = 0
  for (const td of row.querySelectorAll<HTMLTableCellElement>('td')) {
    if (cursor === col) return td
    cursor += Number(td.getAttribute('colspan') ?? 1)
  }
  throw new Error(`第 ${rowNumber} 行没有第 ${col} 列`)
}

/** 现在选中的那个格（`--on` 是选中态的唯一真相，见 shell.css） */
function selectedCell(host: HTMLElement): HTMLTableCellElement | null {
  return host.querySelector<HTMLTableCellElement>('.mimir-xlsx__cell--on')
}

/** 假的宿主：读夹具，存下来供断言 */
function fakeIo(bytes?: Uint8Array): { io: EditorIo; saved: () => Uint8Array | null } {
  let saved: Uint8Array | null = null
  return {
    io: {
      load: async () => bytes ?? new Uint8Array(readFileSync(FIXTURE)),
      save: async (next: Uint8Array, _target: SaveTarget) => {
        saved = next
      },
    },
    saved: () => saved,
  }
}

/**
 * 给夹具接一张空工作表，做出**多表**的工作簿（第二张叫「第二张」）。
 *
 * 为什么需要它：页签（`.me-tab`）只在 `view.sheets.length > 1` 时渲染，
 * 而原来的夹具只有一张表——于是「多工作表时页签仍是裸 button」这条现状
 * 没有任何断言在守，`SHELL_NON_ANTD` 那条白名单里的 `.me-tab` 也在空转
 * （它声明「排除了 4 类」，实际只验证了「这 4 类都不存在」）。
 *
 * 手工拼这几条 XML 就够了（夹具本身是极简结构）：新条目进 zip、workbook 加
 * 一行 `<sheet>`、rels 加一条关系。**不动 sheet1**，所以其余断言的前提不变。
 */
async function withSecondSheet(): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(new Uint8Array(readFileSync(FIXTURE)))
  zip.file(
    'xl/worksheets/sheet2.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>第二张</t></is></c></row></sheetData>' +
      '</worksheet>',
  )
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string')
  zip.file(
    'xl/_rels/workbook.xml.rels',
    rels.replace(
      '</Relationships>',
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    ),
  )
  const workbook = await zip.file('xl/workbook.xml')!.async('string')
  zip.file(
    'xl/workbook.xml',
    workbook.replace(
      '</sheets>',
      '<sheet name="第二张" sheetId="2" r:id="rId3" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets>',
    ),
  )
  return zip.generateAsync({ type: 'uint8array' })
}

async function openEditor() {
  const handle = fakeIo()
  const host = mount(<XlsxEditor documentId="doc-1" io={handle.io} />)
  await waitForTable(host)
  return { host, saved: handle.saved }
}

/** 挂一棵多表的工作簿 */
async function openMultiSheetEditor() {
  const handle = fakeIo(await withSecondSheet())
  const host = mount(<XlsxEditor documentId="multi" io={handle.io} />)
  await waitForTable(host)
  return { host, saved: handle.saved }
}

/** 把存下来的字节里某个条目读成文本 */
async function entryOf(bytes: Uint8Array, name: string): Promise<string | null> {
  const zip = await JSZip.loadAsync(bytes)
  const file = zip.file(name)
  return file === null ? null : file.async('string')
}

/**
 * 点「保存到库」并等它写完。
 *
 * 保存要过两道异步（`session.save()` 打包 zip → `source.save()` 交给宿主），
 * 一次宏任务不够——**等到宿主真的收到字节**或超时，而不是等固定次数：
 * 等固定次数会在慢机器上变成偶发失败，而偶发失败最后总是被当成噪音忽略。
 */
async function save(host: HTMLElement, saved: () => Uint8Array | null): Promise<void> {
  click(byLabel(host, '保存到库'))
  for (let i = 0; i < 50; i += 1) {
    if (saved() !== null) return
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  throw new Error(
    `保存没写出字节。状态行现在说：${host.querySelector('.mimir-editor__status')?.textContent ?? ''}`,
  )
}

/* ── 断言 ─────────────────────────────────────────────────────── */

describe('xlsx 工具条：清空这个格', () => {
  it('清空 A2 之后文件里是空的内联字符串格，共享字符串一字节没动', async () => {
    const { host, saved } = await openEditor()
    click(cellAt(host, 2, 0))
    expect(selectedCell(host)?.textContent).toBe('姓名')

    click(byLabelPrefix(host, '清空这个格'))
    await save(host, saved)

    const bytes = saved()
    expect(bytes, '保存按钮点了但宿主没收到字节').not.toBeNull()
    const sheet = await entryOf(bytes!, 'xl/worksheets/sheet1.xml')
    // 这一格被换成空的内联字符串格（`setCell(ref, '')` 的既定语义）
    expect(sheet).toContain('<c r="A2" t="inlineStr"><is><t></t></is></c>')
    /*
     * 共享字符串必须原样：改它会让所有引用同一项的格子一起空掉。
     * 夹具里 A1 与 A2 都指向第 0 项（「姓名」）。
     */
    expect(await entryOf(bytes!, 'xl/sharedStrings.xml')).toBe(
      await entryOf(new Uint8Array(readFileSync(FIXTURE)), 'xl/sharedStrings.xml'),
    )
  })

  it('没选中格子时它是 disabled，并给出原因（不是「点了没反应」）', async () => {
    const { host } = await openEditor()
    const button = byLabelPrefix(host, '清空这个格')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(button.getAttribute('title')).toBe('先点一个格子')
    // 无障碍名称仍是 label，不因为禁用而变成原因
    expect(button.getAttribute('aria-label')).toContain('清空这个格')
  })

  it('格子被清空之后按钮也禁用，原因说的是这个格的实情', async () => {
    const { host, saved } = await openEditor()
    click(cellAt(host, 2, 0))

    // 清空是「这一格写进去就是空串」——界面上它随即变成空
    click(byLabelPrefix(host, '清空这个格'))
    await save(host, saved)

    const button = byLabelPrefix(host, '清空这个格')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(button.getAttribute('title')).toBe('这个格已经是空的')
  })
})

describe('xlsx 工具条：复制这个格的文字', () => {
  it('复制的是界面上那一格的文字', async () => {
    const { host } = await openEditor()
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    click(cellAt(host, 5, 1))
    click(byLabelPrefix(host, '复制这个格'))

    await act(async () => {
      await Promise.resolve()
    })
    expect(writeText).toHaveBeenCalledWith('市场部 & <测试>')
  })

  it('复制的是**草稿**（界面上显示什么就复制什么），不是模型里的旧值', async () => {
    const { host } = await openEditor()
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    click(cellAt(host, 2, 0))
    type(byLabel(host, '单元格 A2'), '张三丰')
    click(byLabelPrefix(host, '复制这个格'))

    await act(async () => {
      await Promise.resolve()
    })
    expect(writeText).toHaveBeenCalledWith('张三丰')
  })

  it('写剪贴板失败时如实说，不假装成功', async () => {
    const { host } = await openEditor()
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('拒绝访问')
        },
      },
      configurable: true,
    })

    click(cellAt(host, 2, 2))
    click(byLabelPrefix(host, '复制这个格'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('复制失败：拒绝访问')
  })

  it('没有剪贴板 API（非安全上下文）时按钮禁用并说明原因', async () => {
    const { host } = await openEditor()
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    // 重挂一次：`clipboardAvailable` 在渲染期读全局，换掉之后要重新渲染
    const { host: host2 } = await openEditor()
    click(cellAt(host2, 2, 0))
    const button = byLabelPrefix(host2, '复制这个格')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(button.getAttribute('title')).toContain('https')

    // 点不进去（事件被禁用态拦住）：状态行不冒出任何「复制失败」——
    // 「做不到」的说明只由 tooltip 承担，复制动作里没有第二个判断
    click(button)
    await act(async () => {
      await Promise.resolve()
    })
    expect(host2.querySelector('.mimir-editor__status')?.textContent).not.toContain('复制失败')
    void host
  })

  /**
   * 非安全上下文的「做不到」由禁用态独自说明——`copyCell` 里不允许再有第二个
   * 剪贴板判断：按钮禁用时点击事件到不了 handler，那里的分支永远走不到，
   * 写了也从不生效。运行时行为与删掉它完全相同、测试观察不出来，所以照
   * `editors.css` 宽度覆写那条的先例做**静态守护**：那条只有死分支才用的
   * 失败措辞不许再出现在源码里（回来一次红一次）。
   */
  it('复制动作里没有第二条剪贴板判断（不可达的失败分支不许回来）', () => {
    const source = readFileSync(join(import.meta.dirname, 'XlsxEditor.tsx'), 'utf8')
    expect(source).not.toContain('没有写进剪贴板')
  })
})

describe('xlsx 工具条：查找上一个 / 下一个', () => {
  it('敲进查找串就跳到第一个命中', async () => {
    const { host } = await openEditor()
    type(byLabelPrefix(host, '查找内容'), '部')
    expect(selectedCell(host)?.textContent).toBe('部门')
  })

  it('「下一个命中」按行主序走，走到底回绕到第一个', async () => {
    const { host } = await openEditor()
    type(byLabelPrefix(host, '查找内容'), '部')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    click(byLabel(host, '下一个命中'))
    expect(selectedCell(host)?.textContent).toBe('技术部')
    click(byLabel(host, '下一个命中'))
    expect(selectedCell(host)?.textContent).toBe('市场部 & <测试>')
    // 回绕
    click(byLabel(host, '下一个命中'))
    expect(selectedCell(host)?.textContent).toBe('部门')
  })

  it('「上一个命中」反着走', async () => {
    const { host } = await openEditor()
    type(byLabelPrefix(host, '查找内容'), '部')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    click(byLabel(host, '上一个命中'))
    // 从第一个往前 = 回绕到最后一个
    expect(selectedCell(host)?.textContent).toBe('市场部 & <测试>')
  })

  it('命中数与查找栏同一套措辞（`1 / 3`、`无匹配`）', async () => {
    const { host } = await openEditor()
    type(byLabelPrefix(host, '查找内容'), '部')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(host.querySelector('.me-find__count')?.textContent).toBe('1 / 3')

    type(byLabelPrefix(host, '查找内容'), '找不到的东西')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(host.querySelector('.me-find__count')?.textContent).toBe('无匹配')
  })

  it('没有查询串 / 没有命中时两个按钮都禁用，并说明原因', async () => {
    const { host } = await openEditor()
    expect((byLabel(host, '下一个命中') as HTMLButtonElement).disabled).toBe(true)
    expect(byLabel(host, '下一个命中').getAttribute('title')).toBe('先输入要查找的内容')

    type(byLabelPrefix(host, '查找内容'), '找不到的东西')
    expect((byLabel(host, '上一个命中') as HTMLButtonElement).disabled).toBe(true)
    expect(byLabel(host, '上一个命中').getAttribute('title')).toBe('这张表里没有匹配的格子')
  })
})

describe('xlsx 工具条：跳到上一个 / 下一个公式格', () => {
  it('下一个公式格选中夹具里那一格公式（C3）', async () => {
    const { host } = await openEditor()
    click(byLabel(host, '跳到下一个公式格'))
    const cell = selectedCell(host)
    expect(cell?.getAttribute('title')).toBe('公式（显示 Excel 算好的缓存值）')
    // 单元格编辑行里的引用证明它是 C3
    expect(host.querySelector('.mimir-cell-editor__ref')?.textContent).toBe('C3')
  })

  it('上一个公式格从还没选中时落到最后一个公式（同一个格）', async () => {
    const { host } = await openEditor()
    click(byLabel(host, '跳到上一个公式格'))
    expect(host.querySelector('.mimir-cell-editor__ref')?.textContent).toBe('C3')
  })

  it('选中了非公式格时，下一个公式格仍然找得到那一格', async () => {
    const { host } = await openEditor()
    click(cellAt(host, 5, 0))
    expect(host.querySelector('.mimir-cell-editor__ref')?.textContent).toBe('A5')
    click(byLabel(host, '跳到下一个公式格'))
    expect(host.querySelector('.mimir-cell-editor__ref')?.textContent).toBe('C3')
  })
})

/**
 * 编辑是就地改模型的，而查找命中与公式格列表是从快照派生的 `useMemo`。
 *
 * 这两条守的是同一种**静默失效**：派生列表 keyed 在一个「编辑后引用不变」
 * 的对象上。`view()` 在改动后换新对象，但如果派生列表依赖的是
 * `view.sheets[active]` 这个**切片**的引用，而引擎改动后没有把切片一起换掉，
 * 依赖判定相等、派生列表就停在编辑前——查找计数说旧数字、公式跳转按钮
 * 在该禁用时仍可点。界面说的必须是真实模型（界面说了假话比报错更糟）。
 */
describe('xlsx 工具条：编辑之后派生列表跟着模型走', () => {
  it('把一个格改成含查找串之后，命中数跟着变（1 / 3 → 1 / 4）', async () => {
    const { host } = await openEditor()
    type(byLabelPrefix(host, '查找内容'), '部')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(host.querySelector('.me-find__count')?.textContent).toBe('1 / 3')

    // 把 A2（「姓名」）改成「姓名部」：模型里含「部」的格子从 3 个变 4 个
    click(cellAt(host, 2, 0))
    type(byLabel(host, '单元格 A2'), '姓名部')
    press(byLabel(host, '单元格 A2'), 'Enter')

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    // A2 是第 2 行第 0 列，行主序里排在最前 → 选中它就是第 1 个命中
    expect(host.querySelector('.me-find__count')?.textContent).toBe('1 / 4')
  })

  it('唯一的公式格被清空之后，公式跳转按钮禁用并说明原因', async () => {
    const { host } = await openEditor()
    click(byLabel(host, '跳到下一个公式格'))
    expect(host.querySelector('.mimir-cell-editor__ref')?.textContent).toBe('C3')

    // 覆盖的语义是连公式一起清（xlsx-edit.ts 的规矩）：模型里从此没有公式格
    click(byLabelPrefix(host, '清空这个格'))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    for (const label of ['跳到上一个公式格', '跳到下一个公式格']) {
      const button = byLabel(host, label) as HTMLButtonElement
      expect(button.disabled, `${label} 该禁用了`).toBe(true)
      expect(button.getAttribute('title')).toBe('这张表里没有公式格')
    }
  })
})

describe('xlsx 工具条：十字高亮', () => {
  it('打开之后选中格所在的行与列都带上 cross 类，关掉就没了', async () => {
    const { host } = await openEditor()
    click(cellAt(host, 5, 1))

    // 关着的时候一个都没有
    expect(host.querySelectorAll('.mimir-xlsx__cell--cross').length).toBe(0)

    const toggle = byLabel(host, '十字高亮：选中格所在的行与列')
    click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')

    /** 这一行：A5、B5、C5（表宽 3 列——夹具的 A1:C1 合并定了表宽） */
    for (const col of [0, 1, 2]) {
      expect(
        cellAt(host, 5, col).classList.contains('mimir-xlsx__cell--cross'),
        `第 5 行第 ${col} 列没有高亮`,
      ).toBe(true)
    }
    /** 这一列：B2、B3 也亮（B1 被合并覆盖，不渲染） */
    expect(cellAt(host, 2, 1).classList.contains('mimir-xlsx__cell--cross')).toBe(true)
    expect(cellAt(host, 3, 1).classList.contains('mimir-xlsx__cell--cross')).toBe(true)
    /** 行号格一起亮——不然看不出亮的是哪一行（行号会跳号，所以按行号找而不是数第几个） */
    const row5 = [...host.querySelectorAll('tr')].find(
      (tr) => tr.querySelector('th')?.textContent === '5',
    )
    expect(row5?.querySelector('th')?.classList.contains('mimir-xlsx__gutter--cross')).toBe(true)
    /** 别的行不受影响 */
    expect(cellAt(host, 3, 0).classList.contains('mimir-xlsx__cell--cross')).toBe(false)

    click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(host.querySelectorAll('.mimir-xlsx__cell--cross').length).toBe(0)
  })
})

describe('xlsx 工具条：状态行如实交代代价', () => {
  it('「清空会丢掉格式」这句常驻在状态行上，且清空按钮的 tooltip 也写着', async () => {
    const { host } = await openEditor()
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain(
      '清空会丢掉该格原有的颜色/边框/数字格式',
    )
    click(cellAt(host, 2, 0))
    expect(byLabelPrefix(host, '清空这个格').getAttribute('title')).toContain(
      '颜色、边框与数字格式',
    )
  })
})

describe('xlsx 的列字母行', () => {
  /**
   * 附属面板与状态行用的是 **Excel 记法**（`C3`），而网格里原来只有一竖列
   * 行号——那个引用在屏幕上找不到落点，用户只能用蓝色选中框反推列号。这一组
   * 守「列头真的在，而且与格子对齐」。
   */
  it('表头有一行列字母，与行号栏同一套 chrome', async () => {
    const { host } = await openEditor()
    const head = host.querySelector('table.mimir-xlsx thead')
    expect(head, '网格没有列字母行').not.toBeNull()

    const letters = [...head!.querySelectorAll<HTMLTableCellElement>('.mimir-xlsx__colhead')]
    expect(letters.length).toBeGreaterThan(0)
    // 夹具是 A/B/C…：第一格是 A，且都是大写字母
    expect(letters.map((cell) => cell.textContent)).toEqual(
      letters.map((_, index) => String.fromCharCode(65 + index)),
    )
    for (const cell of letters) {
      expect(cell.tagName).toBe('TH')
      // 列头是表头（读屏按「第 C 列」念），不是普通格子
      expect(cell.getAttribute('scope')).toBe('col')
    }

    // 左上角交角格：两个 sticky 的交叉点，不给它会压住第一个列字母
    expect(head!.querySelector('.mimir-xlsx__gutter.mimir-xlsx__corner')).not.toBeNull()
  })

  it('列头数 = 行里的数据格数（列头不许多、也不许少）', async () => {
    const { host } = await openEditor()
    const firstRow = [...host.querySelectorAll('tr')].find((tr) => tr.querySelector('td') !== null)
    if (firstRow === undefined) throw new Error('表里没有数据行')
    // 行号格 + 数据格（合并覆盖的不渲染，所以用 colSpan 累加）
    let span = 0
    for (const td of firstRow.querySelectorAll<HTMLTableCellElement>('td')) {
      span += Number(td.getAttribute('colspan') ?? 1)
    }
    const letters = host.querySelectorAll('.mimir-xlsx__colhead')
    expect(letters.length).toBe(span)
  })

  it('附属面板上的引用真的能对到列头（C3 的 C 在列头上）', async () => {
    const { host } = await openEditor()
    // 夹具的公式格在 C3（见文件头那张表）
    click(cellAt(host, 3, 2))
    expect(host.querySelector('.mimir-cell-editor__ref')?.textContent).toBe('C3')

    const letters = [...host.querySelectorAll<HTMLTableCellElement>('.mimir-xlsx__colhead')].map(
      (cell) => cell.textContent,
    )
    expect(letters).toContain('C')
  })
})

/* ── 控件契约：这个格式的控件全走外壳的 antd 原语 ───────────────── */

/**
 * 允许**不经 antd** 的控件：白名单，逐条给理由。
 *
 * 这几样是外壳里有意保留的手写控件（`EditorShell.tsx` 头注释那张表）。它们
 * 与本次迁移无关，但会出现在这棵子树里——不排除的话，这个扫法在「有多个
 * 工作表」的文档上会因为 `.me-tab` 变红，而红的理由与绕过原语无关（假阳性
 * 会让人把断言删掉，那才是真的损失）。
 */
const SHELL_NON_ANTD = [
  '.me-tab', // ToolbarTabs：antd 的 Tabs 把页签渲染成 div，还多一个隐藏的 nav-more
  '.me-btn', // ToolbarMenu / ToolbarColorPicker 的就地弹层触发器（要 aria-haspopup/expanded）
  '.me-menu__item', // 弹层面板里的菜单项
  '.me-color__cell', // 颜色面板里的色块
] as const

/**
 * 允许「**可点但不是控件**」的元素：白名单，xlsx 只有这一处。
 *
 * 表格网格本身。它不该换成 `ToolbarButton`（理由写在 `XlsxEditor.tsx` 那个
 * `<td>` 的注释里），但它确实是「交互元素不走原语」——所以在这里**显式列出**：
 * 不列的话它要么被下一个人误改，要么成为「每处 `onClick` 挂 div」的先例。
 */
const CANVAS_CLICKABLE = '.mimir-xlsx__cell'

describe('xlsx 的控件契约', () => {
  it('没有绕过点：每个原生控件都来自 antd', async () => {
    const { host } = await openEditor()
    const all = [
      ...host.querySelectorAll<HTMLElement>(
        '.mimir-editor button, .mimir-editor input, .mimir-editor select, .mimir-editor textarea',
      ),
    ]
    // 非空前提：一棵空树上「零个绕过点」是句废话
    expect(all.length).toBeGreaterThan(6)
    const bypass = all
      .filter(
        (element) =>
          ![...element.classList].some((name) => name.startsWith('ant-')) &&
          !SHELL_NON_ANTD.some((selector) => element.closest(selector) !== null),
      )
      .map((element) => `<${element.tagName.toLowerCase()} class="${element.className}">`)
    expect(bypass, `这些控件绕过了外壳的原语：${JSON.stringify(bypass)}`).toEqual([])
  })

  it('没有「可点但不是控件」的第二处：画布是 <td>，且没有手写的 role="button"', async () => {
    const { host } = await openEditor()
    const canvas = [...host.querySelectorAll<HTMLElement>(CANVAS_CLICKABLE)]
    expect(canvas.length).toBeGreaterThan(5)
    for (const cell of canvas) expect(cell.tagName).toBe('TD')
    /*
     * 反过来说：子树里不该有第二个「假装是按钮」的元素。antd 的按钮是**真
     * `<button>`**，所以这里为 0；将来谁把一个 div 写成可点的（`role="button"`
     * 是那种写法最常见的补丁），这一条会红。
     */
    expect(host.querySelectorAll('.mimir-editor [role="button"]').length).toBe(0)
  })

  it('禁用的按钮必须说明原因（灰着不说为什么等于让人猜）', async () => {
    const { host } = await openEditor()
    /*
     * 「保存到库」（没改动 / 正在保存）与 footer 的「应用」（格里的字还没被改过）
     * 都有一段灰着的时间，而那正是最需要解释的一档——不给原因时 `title` 落回
     * 按钮名字，用户只能猜。其余五种格式都有这条断言，只有 xlsx 原来没有。
     */
    click(cellAt(host, 2, 0))
    let disabledCount = 0
    for (const button of host.querySelectorAll<HTMLButtonElement>('button')) {
      if (!button.disabled) continue
      disabledCount += 1
      const title = button.getAttribute('title') ?? ''
      const label = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? ''
      expect(title, `禁用的按钮没有说明原因：${label}`).not.toBe('')
      expect(title, `禁用的按钮把原因与名字混成一件事：${label}`).not.toBe(label)
    }
    // 选中一个格之后「应用」是禁用的（还没打字）、「保存到库」也是——不该是空循环
    expect((byLabel(host, '保存到库') as HTMLButtonElement).disabled).toBe(true)
    expect((byLabel(host, '应用') as HTMLButtonElement).disabled).toBe(true)
    expect(disabledCount).toBeGreaterThan(1)
  })

  it('尺寸统一在 small 档（`EditorShell` 那层 ConfigProvider 盖到了每个控件）', async () => {
    const { host } = await openEditor()
    /*
     * 判据是 **antd 自己的尺寸档类**，不是计算高度：happy-dom 下
     * `Input` / `Select` / `InputNumber` / `Segmented` 的 `getComputedStyle().height`
     * 返回空串（同「跨元素自定义属性/边框不解析」那一类限制），所以
     * 「一行同高」只能靠高度的来源（small 档）来判——真正的同高要在浏览器里量。
     */
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.mimir-editor button.ant-btn')]
    expect(buttons.length).toBeGreaterThan(5)
    const wrong = buttons.filter((button) => !button.classList.contains('ant-btn-sm'))
    expect(
      wrong.map((button) => button.getAttribute('aria-label')),
      '这些按钮不在 small 档',
    ).toEqual([])

    // 格内容编辑框（footer 里那条）也在 small 档
    click(cellAt(host, 2, 0))
    const field = byLabel(host, '单元格 A2')
    expect(field.classList.contains('ant-input-sm')).toBe(true)

    /*
     * `.me-btn` 不许挂在 antd 的按钮上（它的 `height` 与 antd 的
     * `:where(…).ant-btn-sm` 特异性相同而在 head 里更靠后，会把 small 档拉回去）。
     * 上面那条 small 档断言正是它在盯着——挂上就红。
     */
    expect(host.querySelectorAll('.ant-btn.me-btn').length).toBe(0)
  })

  it('格内容编辑框走原语：回车应用、Esc 丢弃草稿（界面显示的回到模型值）', async () => {
    const { host, saved } = await openEditor()
    click(cellAt(host, 2, 0))
    const field = byLabel(host, '单元格 A2')
    // 它是 antd 的 Input（原语），不是我们手写外观的裸 input
    expect(field.classList.contains('ant-input')).toBe(true)

    type(field, '张三丰')
    expect((field as HTMLInputElement).value).toBe('张三丰')

    // Esc = 放弃这次输入：草稿丢掉、回到模型里的值，模型一个字节都没动
    press(field, 'Escape')
    expect((field as HTMLInputElement).value).toBe('姓名')
    expect((byLabel(host, '保存到库') as HTMLButtonElement).disabled).toBe(true)

    // 再输入、这次按回车：落进模型，保存按钮随之可用
    type(field, '张三丰')
    press(field, 'Enter')
    expect(cellAt(host, 2, 0).textContent).toBe('张三丰')
    await save(host, saved)
    expect(await entryOf(saved()!, 'xl/worksheets/sheet1.xml')).toContain('张三丰')
  })

  /**
   * 宽度覆写必须留在 `editors.css` 里。
   *
   * 这是**当初绕过原语的唯一理由**（原语硬编码 180px + `flex: none`，而这条
   * 编辑行要占满内容区宽度）。走 `ToolbarTextField` 之后这个覆写就是整个迁移
   * 里唯一的配套 CSS——删掉它，输入框立刻缩回 180px，而**界面不报错、测试也
   * 不红**（`test.css` 是关的，样式在 vitest 里根本不注入；见 D-064 记的
   * 「计算样式断言在这套配置下做不到」）。所以只能读 CSS 文本做静态守护。
   */
  it('宽度覆写还在 editors.css 里（删了就缩回 180px，且没有任何测试会红）', () => {
    const css = readFileSync(join(import.meta.dirname, 'editors.css'), 'utf8')
    expect(css).toContain('.mimir-cell-editor .me-input--text')
    // 那一条必须同时压掉原语的 `width: 180px` 与 `flex: none`
    const rule = css.slice(css.indexOf('.mimir-cell-editor .me-input--text'))
    const body = rule.slice(rule.indexOf('{') + 1, rule.indexOf('}'))
    expect(body).toMatch(/flex:\s*1/)
    expect(body).toMatch(/width:\s*auto/)
  })

  /**
   * 白名单**真的被验证过**：多表工作簿里页签在，且它仍是裸 `<button>`。
   *
   * 单表夹具下 `.me-tab` 根本不渲染——`SHELL_NON_ANTD` 声明「排除了 4 类」，
   * 实际只验证了「这 4 类恰好都不存在」，白名单的每一条理由都没被检验。
   * 这一条用第二张表把 `.me-tab` 逼出来：它证明①多表时页签确实渲染、
   * ②它确实是绕过 antd 的那一类（所以白名单该留它）、③上面的扫法在它存在
   * 时仍然全绿（白名单真的在起作用，而不是靠「碰巧没有」）。
   */
  it('多表工作簿：页签是裸 button（白名单里那一类的现状被真的守住）', async () => {
    const { host } = await openMultiSheetEditor()
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('.me-tab')]
    expect(tabs.length, '第二张表没渲染出页签（这条断言会失去意义）').toBe(2)
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(['数据', '第二张'])
    // 它不在 antd 的档里——这正是它在白名单里的原因（ToolbarTabs 不迁，见 D-064）
    for (const tab of tabs) {
      expect(tab.classList.contains('ant-btn')).toBe(false)
      expect(tab.tagName).toBe('BUTTON')
    }
    // 切到第二张：表体换成新表的内容（页签不是装饰）
    click(tabs[1]!)
    expect(host.querySelector('.mimir-xlsx')?.textContent).toContain('第二张')

    // 扫法在页签存在时仍然全绿：白名单真的在过滤，而不是「碰巧没有」
    const all = [
      ...host.querySelectorAll<HTMLElement>(
        '.mimir-editor button, .mimir-editor input, .mimir-editor select, .mimir-editor textarea',
      ),
    ]
    const bypass = all
      .filter(
        (element) =>
          ![...element.classList].some((name) => name.startsWith('ant-')) &&
          !SHELL_NON_ANTD.some((selector) => element.closest(selector) !== null),
      )
      .map((element) => `<${element.tagName.toLowerCase()} class="${element.className}">`)
    expect(bypass, `这些控件绕过了外壳的原语：${JSON.stringify(bypass)}`).toEqual([])
  })
})
