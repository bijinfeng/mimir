/**
 * xlsx 的网格编辑器（预览 + 改单元格）。
 *
 * ## 编辑的语义是「覆盖」
 *
 * 在格子里输入内容就是**覆盖**原来那个格（电子表格的语义）。三条推论：
 *
 *   - **公式格会被清掉公式**：只换 `<v>` 而留着 `<f>` 的话，Excel 打开会按
 *     公式重算、用户输入的值被悄悄丢掉。所以覆盖时把整段 `<c>` 换掉
 *   - **样式引用须保留**：手动编辑与 Agent 共用固定版 GenOffice 网关，
 *     `patchCellKeepingStyle` 保留原单元格的 `s` 索引。
 *   - **新文本写成内联字符串**，绝不改 `sharedStrings.xml`——那里的一项被
 *     多个格子共用，改它会让所有引用它的格子一起变（**静默的**）
 *
 * ## 原件与预览的边界
 *
 *   - **不重算公式**：改了被别的公式引用的格子，那些公式的缓存值就旧了。
 *     Excel 打开会重算，我们显示的仍是旧值
 *   - 样式索引按原件保留；格式画布目前仍只显示基础网格
 *   - 日期显示为序列号（`xlsx.ts` 的老规矩）
 *   - 图表、条件格式、透视表不画（读不出来），但**保存不会动它们**
 *
 * ## 工具条上每一项落到哪
 *
 * | 按钮 | 落到哪 |
 * |---|---|
 * | 工作表页签 | `active`；换表时选中与草稿一起清掉 |
 * | 查找上一个 / 下一个 | 遍历 `view().rows[].cells[].text` → `selectCell` |
 * | 上一个 / 下一个公式格 | 遍历 `cell.formula` → `selectCell` |
 * | 复制这个格的文字 | 界面上显示的那串（`shown`，见 `copyCell`）→ 剪贴板（**失败如实报**） |
 * | 清空这个格 | `set_cell` 覆盖为空文本 |
 * | 填充与格式 | 与 Agent 共用 `propose_operations`，写回后重开会话 |
 * | 行列操作 | 与 Agent 共用 `propose_operations`，写回后重开会话 |
 * | 十字高亮 | 纯界面开关，不改文档 |
 * | 保存到库 | `session.save()` 成功后 `commit()` |
 *
 * **每一项都落在内核里真有的函数上**（`xlsx-edit.ts` 的会话 + `xlsx.ts` 的
 * 模型），没有一个按钮是「先画上、以后再接」——那种按钮点了没反应也不报错，
 * 是这个仓库最讨厌的一类。尚未接入的操作（公式重算等）
 * 不画成一个按不动的按钮。
 *
 * ## 没选中格子时它就是一个预览
 *
 * 只有这一个组件（原 `XlsxPreview` 已被它取代）：只读预览与编辑读的是同一份
 * 模型、画的是同一张表。分开两个的话，界面会变成「预览看一遍、想改一个字要
 * 切到另一个模式」——而原件层本来就是给人看和改的地方。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createXlsxAgentHandle,
  type XlsxAgentHandle,
  type XlsxHostApply,
} from '../agent/xlsx-agent.js'
import { openXlsxForEdit } from '../xlsx-edit.js'
import { findXlsxCells } from '../xlsx-find.js'
import type { XlsxSheet, XlsxWorkbook } from '../xlsx.js'
import {
  EditorShell,
  EditorState,
  ToolbarButton,
  ToolbarGroup,
  ToolbarLabel,
  ToolbarTabs,
  ToolbarMenu,
  ToolbarTextField,
  useFindHotkey,
} from '../shell/EditorShell.js'
import {
  AlertIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  CrossHighlightIcon,
  EraserIcon,
  RedoIcon,
  SaveIcon,
  UndoIcon,
} from '../shell/icons.js'
import { CompactToolbar } from './CompactToolbar.js'
import { statusText, useParsed, useSource } from './use-source.js'
import { OFFICE_MIME, type EditorProps } from './types.js'
import '../shell/shell.css'
import './editors.css'
import './compact-toolbar.css'

export function XlsxEditor({
  documentId,
  io,
  onDirtyChange,
  flush = false,
  onAgentHandleChange,
  hostApply,
}: EditorProps & {
  onAgentHandleChange?: (handle: XlsxAgentHandle | null) => void
  hostApply?: XlsxHostApply
}) {
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
  /** 写不进去的原因。就地在编辑行里说，不用弹窗打断 */
  const [applyError, setApplyError] = useState<string | null>(null)
  /** 查找串。**只在当前这张表里找**，不区分大小写（见 `findCells`） */
  const [query, setQuery] = useState('')
  const [toolbarTab, setToolbarTab] = useState('home')
  /** 十字高亮开关（纯界面状态，文档一个字节都不动） */
  const [cross, setCross] = useState(false)
  /**
   * 「刚做完一件事」的提示（复制成功/失败）。下一个动作就清掉。
   *
   * 与 `applyError` 同一个位置、同一个理由：写在状态行上，不弹窗打断。
   * 复制是**没有可见结果**的动作（文字进了剪贴板），不说一声就等于静默。
   */
  const [note, setNote] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const agentHandleRef = useRef<XlsxAgentHandle | null>(null)
  const selectionRef = useRef<{ sheet: number; row: number; col: number } | null>(null)
  const hostApplyRef = useRef(hostApply)
  const onAgentHandleChangeRef = useRef(onAgentHandleChange)
  const onDirtyChangeRef = useRef(onDirtyChange)
  useEffect(() => {
    selectionRef.current = selected ? { sheet: active, ...selected } : null
    hostApplyRef.current = hostApply
    onAgentHandleChangeRef.current = onAgentHandleChange
    onDirtyChangeRef.current = onDirtyChange
  })
  useEffect(() => {
    if (!session || !source.bytes || !hostApplyRef.current) return
    const handle = createXlsxAgentHandle(
      documentId,
      source.bytes,
      session,
      () => selectionRef.current,
      (nextSession, isDirty) => {
        setEdited({ source: source.bytes!, view: nextSession.view() })
        setDirty(isDirty)
        onDirtyChangeRef.current?.(isDirty)
      },
      (request) => {
        if (!hostApplyRef.current) throw new Error('XLSX 宿主执行器未配置')
        return hostApplyRef.current(request)
      },
    )
    agentHandleRef.current = handle
    onAgentHandleChangeRef.current?.(handle)
    return () => {
      handle.dispose()
      if (agentHandleRef.current === handle) agentHandleRef.current = null
      onAgentHandleChangeRef.current?.(null)
    }
  }, [session, source.bytes, documentId])

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

  /** 这一张表里所有公式格（行主序）。「上一个 / 下一个公式格」按它走 */
  const formulas = useMemo(() => formulaCells(sheet), [sheet])
  /** 查找命中（行主序）。`query` 为空时是空表——那时按钮禁用 */
  const matches = useMemo(() => findCells(sheet, query), [sheet, query])
  /**
   * 选中的格恰好是命中之一时，它在命中表里的下标（否则 -1）。
   *
   * **从选中反推**而不是另存一个「当前第几个」：存一份就要处理「换表 /
   * 换个格 / 改查询串」时的夹取，三处漏一处就会出现「3 / 5 但高亮在别处」
   * 这种界面说假话的状态。
   */
  const activeMatch = useMemo(
    () => matches.findIndex((c) => c.row === selected?.row && c.col === selected?.col),
    [matches, selected],
  )

  /**
   * 剪贴板能不能用。
   *
   * `navigator.clipboard` **只在安全上下文里存在**（https / localhost）。
   * mimir 是自托管的，局域网里常常是 `http://192.168.…`——那时它是
   * `undefined`，直接调 `writeText` 会抛 TypeError。所以先把按钮禁用并把
   * 原因写在 tooltip 上，而不是让人点了才知道。
   *
   * 这个判断**只有这一处**（`copyDisabledReason`）。`copyCell` 里不再判
   * 第二遍——按钮禁用时点击事件根本到不了 handler，那里的分支是永远走不到
   * 的死代码（写了却从不生效，比不写更糟）。
   *
   * 渲染期读这个全局是安全的：它一次会话里不会变（安全上下文由地址决定），
   * 而这个包只在浏览器里跑（宿主是 Vite 的 SPA，没有服务端渲染）。
   */
  const clipboardAvailable = typeof navigator !== 'undefined' && navigator.clipboard !== undefined

  /**
   * 点一个格子 → 选中它（编辑框的值由 `selectedCell` 从模型推导）。
   *
   * 顺带把上一条提示（复制成功之类）清掉：它是**上一步动作**的回执，换了
   * 一个格还挂着会让人以为刚做的事与这个格有关。
   */
  const selectCell = useCallback(
    (row: number, col: number) => {
      if (!sheet) return
      // 合并覆盖的格不选（它的内容属于左上角那个格）
      const cell = sheet.rows.find((r) => r.number === row)?.cells[col]
      if (cell?.covered) return
      setSelected({ row, col })
      // 换了一个格 → 草稿回到「没改过」，编辑框显示新格的模型值
      setDraft(null)
      setNote(null)
    },
    [sheet],
  )

  /**
   * 把一串文字写进选中的格，并把「界面状态」一起推到位。
   *
   * 「应用草稿」与「清空」是**同一件事的两种输入**（都是覆盖一个格），所以
   * 只有这一处写入路径——两处各写一遍的话，`setEdited` /
   * `onDirtyChange` 迟早有一处漏（而漏了的表现是「文件改了、界面说没改」）。
   */
  const executeOps = useCallback(
    async (operations: unknown[], successNote?: string): Promise<boolean> => {
      const handle = agentHandleRef.current
      if (!handle) return false
      try {
        await handle.execute(
          'propose_operations',
          { operations },
          // The handle serializes local commands. A second fast click can queue
          // before the first has advanced its version; manual actions use FIFO
          // rather than capturing a stale version at click time.
          {},
        )
        setApplyError(null)
        setNote(successNote ?? null)
        setDraft(null)
        return true
      } catch (error) {
        setApplyError(error instanceof Error ? error.message : '这个格写不进去')
        return false
      }
    },
    [],
  )

  const commitCell = useCallback(
    async (text: string): Promise<void> => {
      if (!selected || !view) return
      const sheetId = view.sheets[active]?.id
      if (!sheetId) return
      const address = `${columnLetters(selected.col)}${selected.row}`
      await executeOps([
        text.startsWith('=')
          ? { op: 'set_formula', sheetId, address, formula: text }
          : { op: 'set_cell', sheetId, address, value: text },
      ])
    },
    [selected, active, view, executeOps],
  )

  const structuralEdit = async (op: Record<string, unknown>) => {
    if (!selected || !view) return
    const sheetId = view.sheets[active]?.id
    if (!sheetId) return
    if (await executeOps([{ ...op, sheetId }])) setSelected(null)
  }

  const selectedEdit = async (op: Record<string, unknown>, successNote?: string) => {
    if (!selected || !view) return
    const sheetId = view.sheets[active]?.id
    if (!sheetId) return
    await executeOps([{ ...op, sheetId }], successNote)
  }

  /** 提交草稿到模型（按回车或点「应用」） */
  const apply = () => {
    if (draft === null) return
    void commitCell(draft)
  }

  /** 清空选中的格：写空串（`setCell` 的既定语义，见 `xlsx-edit.ts`） */
  const clearCell = () => {
    void commitCell('')
  }

  /**
   * 复制选中格的文字。
   *
   * 复制的是**界面上显示的那串**（`shown`，有草稿就用草稿）：格子此刻显示
   * 「张三丰」而剪贴板里进了模型里的旧值「张三」，是最难查的那种不一致——
   * 用户只会觉得「复制错了」。有草稿时它与「应用后会长什么样」也完全一致。
   */
  const copyCell = async () => {
    if (selected === null) return
    const ref = `${columnLetters(selected.col)}${selected.row}`
    try {
      await navigator.clipboard.writeText(shown)
      setNote(`已复制 ${ref} 的文字（${shown.length} 字符）`)
    } catch (cause) {
      setNote(`复制失败：${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  const save = async () => {
    const handle = agentHandleRef.current
    if (!handle) return
    const bytes = await handle.flush()
    const ok = await source.save(bytes, { name: 'workbook.xlsx', mime: OFFICE_MIME.xlsx })
    if (!ok) return
    handle.markSaved()
    setDirty(false)
    setEdited({ source: source.bytes!, view: handle.currentSession().view() })
    setDraft(null)
    onDirtyChange?.(false)
  }

  /** 「上一个 / 下一个」都走同一个动作：按行主序挪到相邻的那一个 */
  const stepTo = (list: readonly CellPos[], step: 1 | -1) => {
    const next = stepPosition(list, selected, step)
    if (next !== null) selectCell(next.row, next.col)
  }

  /**
   * 查找串变了。
   *
   * **敲字就跳**（增量查找，编辑器里的一致行为）：不跳的话敲完一个字什么都
   * 没发生，看不出找没找到。已经选中的格本身是命中时不动它——否则在同一个
   * 格上接着敲下一个字会来回跳。
   *
   * 这里重新算一遍命中而**不用 `matches`**：那一个还是**上一次渲染**的值
   * （setState 是异步的），拿它判「有没有命中」会永远慢一个字——症状是敲完
   * 最后一个字时不跳。
   */
  const onQueryChange = (value: string) => {
    setQuery(value)
    setNote(null)
    if (!sheet) return
    const found = findCells(sheet, value)
    if (found.length === 0) return
    if (selected !== null && found.some((c) => c.row === selected.row && c.col === selected.col)) {
      return
    }
    const first = found[0]
    if (first !== undefined) selectCell(first.row, first.col)
  }

  /**
   * 选中的格子**滚进视野**。
   *
   * 查找与公式跳转都只改「选中」，格子可能在滚动区外——不滚的话点了「下一个」
   * 看起来什么都没发生（高亮在屏幕外）。用 callback ref 而不是 effect 里
   * `querySelector`：挂上/换元素时 React 自己调它，不必给表格容器一个 ref、
   * 也不必知道那个格在第几行。
   *
   * `useCallback`（空依赖）= 身份稳定。不稳的话每次渲染 React 都会把它卸下
   * 再挂上，于是**每次渲染都滚一次**——在下面的编辑框里打字会把表格拽回去。
   * `block: 'nearest'` 让已经在视野里的格子纹丝不动（每次点击都居中会晕）。
   */
  const scrollIntoView = useCallback((node: HTMLTableCellElement | null) => {
    node?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [])

  /**
   * Ctrl/Cmd+F 切回包含查找框的「开始」分类，再由共享 hook 送焦点。
   */
  useFindHotkey(() => setToolbarTab('home'))

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

  const switchSheet = (value: number) => {
    setActive(value)
    // A selection and draft belong to the previous sheet.
    setSelected(null)
    setDraft(null)
    setApplyError(null)
    setNote(null)
  }

  const status = statusText({
    handle: source,
    dirty,
    idle: `${view.sheets.length} 张表`,
  })

  /**
   * 按钮禁用时显示的原因。**三个来源各不相同**，所以在这里算一次：
   * 没选中格、选中的格是空的、剪贴板在这个地址上不可用。
   */
  const clearDisabledReason =
    selected === null ? '先点一个格子' : modelText === '' ? '这个格已经是空的' : undefined
  const copyDisabledReason =
    selected === null
      ? '先点一个格子'
      : !clipboardAvailable
        ? '这个地址不允许写剪贴板（要 https 或 localhost）'
        : shown === ''
          ? '这个格没有内容'
          : undefined
  const findDisabledReason =
    query === ''
      ? '先输入要查找的内容'
      : matches.length === 0
        ? '这张表里没有匹配的格子'
        : undefined
  const formulaDisabledReason = formulas.length === 0 ? '这张表里没有公式格' : undefined

  /**
   * 命中计数。与 `FindReplaceBar` 的措辞一致（`3 / 12`、`无匹配`）。
   *
   * 选中格不在命中里（改动后模型变了、或用户点到了别处）时显示**总数**而不是
   * `0 / 12`：我们不知道「当前是第几个」，如实说共有几个。
   */
  const matchLabel =
    query === ''
      ? '—'
      : matches.length === 0
        ? '无匹配'
        : activeMatch >= 0
          ? `${activeMatch + 1} / ${matches.length}`
          : `共 ${matches.length} 个`

  return (
    <EditorShell
      flush={flush}
      toolbar={
        <CompactToolbar
          activeTab={toolbarTab}
          onTabChange={setToolbarTab}
          quickAccess={
            <>
              <ToolbarButton
                label={source.saving ? '保存中…' : '保存到库'}
                disabled={!dirty || source.saving}
                disabledReason={source.saving ? '正在保存…' : '没有未保存的改动'}
                onClick={() => void save()}
              >
                <SaveIcon />
              </ToolbarButton>
              <ToolbarButton label="撤销" disabled disabledReason="表格编辑尚不支持完整撤销历史">
                <UndoIcon />
              </ToolbarButton>
              <ToolbarButton label="重做" disabled disabledReason="表格编辑尚不支持完整重做历史">
                <RedoIcon />
              </ToolbarButton>
            </>
          }
          tabs={[
            { key: 'home', label: '开始' },
            { key: 'formulas', label: '公式' },
            { key: 'view', label: '视图' },
          ]}
          sections={[
            ...(view.sheets.length > 1
              ? [
                  {
                    key: 'sheets',
                    label: '工作表',
                    minWidth: 0,
                    tab: 'home',
                    content: (
                      <>
                        <span className="mimir-compact-toolbar__sheet-tabs">
                          <ToolbarTabs
                            label="工作表"
                            value={active}
                            onChange={switchSheet}
                            items={view.sheets.map((s, index) => ({
                              value: index,
                              label: s.hidden ? `${s.name}（隐藏）` : s.name,
                            }))}
                          />
                        </span>
                        <span className="mimir-compact-toolbar__sheet-menu">
                          <ToolbarMenu
                            label="选择工作表"
                            text={view.sheets[active]?.name ?? '工作表'}
                            items={view.sheets.map((s, index) => ({
                              key: String(index),
                              label: s.hidden ? `${s.name}（隐藏）` : s.name,
                              active: index === active,
                              onSelect: () => switchSheet(index),
                            }))}
                          />
                        </span>
                      </>
                    ),
                  },
                ]
              : []),
            {
              key: 'find',
              label: '查找',
              minWidth: 0,
              tab: 'home',
              content: (
                <ToolbarGroup label="在当前工作表里查找">
                  <ToolbarTextField
                    label="查找内容（只在当前这张工作表里找，不区分大小写）"
                    value={query}
                    onChange={onQueryChange}
                    onSubmit={() => stepTo(matches, 1)}
                    onCancel={() => setQuery('')}
                    placeholder="查找"
                    findInput
                  />
                </ToolbarGroup>
              ),
            },
            {
              key: 'matches',
              label: '查找结果',
              minWidth: 580,
              tab: 'home',
              content: (
                <ToolbarGroup label="查找结果">
                  <span className="me-label me-find__count" aria-live="polite">
                    {matchLabel}
                  </span>
                  <ToolbarButton
                    label="上一个命中"
                    disabled={findDisabledReason !== undefined}
                    disabledReason={findDisabledReason}
                    onClick={() => stepTo(matches, -1)}
                  >
                    上一个
                  </ToolbarButton>
                  <ToolbarButton
                    label="下一个命中"
                    disabled={findDisabledReason !== undefined}
                    disabledReason={findDisabledReason}
                    onClick={() => stepTo(matches, 1)}
                  >
                    下一个
                  </ToolbarButton>
                </ToolbarGroup>
              ),
            },
            {
              key: 'formulas',
              label: '公式格',
              minWidth: 850,
              tab: 'formulas',
              content: (
                <ToolbarGroup label="公式格">
                  <ToolbarButton
                    label="跳到上一个公式格"
                    disabled={formulaDisabledReason !== undefined}
                    disabledReason={formulaDisabledReason}
                    onClick={() => stepTo(formulas, -1)}
                  >
                    <ChevronLeftIcon />
                  </ToolbarButton>
                  <ToolbarButton
                    label="跳到下一个公式格"
                    disabled={formulaDisabledReason !== undefined}
                    disabledReason={formulaDisabledReason}
                    onClick={() => stepTo(formulas, 1)}
                  >
                    <ChevronRightIcon />
                  </ToolbarButton>
                </ToolbarGroup>
              ),
            },
            {
              key: 'cell',
              label: '单元格',
              minWidth: 940,
              tab: 'home',
              content: (
                <ToolbarGroup label="单元格">
                  <ToolbarButton
                    label="复制这个格的文字"
                    disabled={copyDisabledReason !== undefined}
                    disabledReason={copyDisabledReason}
                    onClick={() => void copyCell()}
                  >
                    <CopyIcon />
                  </ToolbarButton>
                  <ToolbarButton
                    label="清空这个格（保留原有格式）"
                    disabled={clearDisabledReason !== undefined}
                    disabledReason={clearDisabledReason}
                    onClick={clearCell}
                  >
                    <EraserIcon />
                  </ToolbarButton>
                  <ToolbarMenu
                    label="单元格操作"
                    text="填充与格式"
                    items={[
                      {
                        key: 'copy-right',
                        label: '复制到右侧一格',
                        disabled: !selected || selected.col >= 16_383,
                        disabledReason: '先选中一个可向右复制的格子',
                        onSelect: () =>
                          void selectedEdit({
                            op: 'copy_range',
                            source: `${columnLetters(selected!.col)}${selected!.row}`,
                            target: `${columnLetters(selected!.col + 1)}${selected!.row}`,
                          }),
                      },
                      {
                        key: 'fill-down',
                        label: '向下填充三格',
                        disabled: !selected || selected.row > 1_048_574,
                        disabledReason: '先选中一个可向下填充的格子',
                        onSelect: () =>
                          void selectedEdit({
                            op: 'fill_range',
                            source: `${columnLetters(selected!.col)}${selected!.row}`,
                            target: `${columnLetters(selected!.col)}${selected!.row}:${columnLetters(selected!.col)}${selected!.row + 2}`,
                          }),
                      },
                      {
                        key: 'bold',
                        label: '当前格加粗',
                        disabled: !selected,
                        disabledReason: '先选中一个格子',
                        onSelect: () =>
                          void selectedEdit(
                            {
                              op: 'format_range',
                              range: `${columnLetters(selected!.col)}${selected!.row}`,
                              format: { bold: true },
                            },
                            '已写入加粗格式；基础网格暂不显示字形',
                          ),
                      },
                    ]}
                  />
                </ToolbarGroup>
              ),
            },
            {
              key: 'structure',
              label: '行列',
              minWidth: 1010,
              tab: 'home',
              content: (
                <ToolbarMenu
                  label="行列操作"
                  text="行列"
                  items={[
                    {
                      key: 'insert-row',
                      label: '在上方插入一行',
                      disabled: !selected,
                      disabledReason: '先选中一个格子',
                      onSelect: () =>
                        void structuralEdit({ op: 'insert_rows', row: selected!.row, count: 1 }),
                    },
                    {
                      key: 'delete-row',
                      label: '删除当前行',
                      disabled: !selected,
                      disabledReason: '先选中一个格子',
                      onSelect: () =>
                        void structuralEdit({ op: 'delete_rows', row: selected!.row, count: 1 }),
                    },
                    {
                      key: 'insert-col',
                      label: '在左侧插入一列',
                      disabled: !selected,
                      disabledReason: '先选中一个格子',
                      onSelect: () =>
                        void structuralEdit({
                          op: 'insert_cols',
                          column: columnLetters(selected!.col),
                          count: 1,
                        }),
                    },
                    {
                      key: 'delete-col',
                      label: '删除当前列',
                      disabled: !selected,
                      disabledReason: '先选中一个格子',
                      onSelect: () =>
                        void structuralEdit({
                          op: 'delete_cols',
                          column: columnLetters(selected!.col),
                          count: 1,
                        }),
                    },
                    {
                      key: 'col-width',
                      label: '当前列设为 180 像素宽',
                      disabled: !selected,
                      disabledReason: '先选中一个格子',
                      onSelect: () =>
                        void selectedEdit(
                          {
                            op: 'set_col_width',
                            column: columnLetters(selected!.col),
                            widthPx: 180,
                          },
                          '已写入列宽；基础网格暂不显示列宽',
                        ),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'view',
              label: '视图',
              minWidth: 1050,
              tab: 'view',
              content: (
                <ToolbarGroup label="视图">
                  <ToolbarButton
                    label="十字高亮：选中格所在的行与列"
                    active={cross}
                    onClick={() => setCross((on) => !on)}
                  >
                    <CrossHighlightIcon />
                  </ToolbarButton>
                </ToolbarGroup>
              ),
            },
          ]}
        />
      }
      footer={
        selected ? (
          <div className="mimir-cell-editor">
            <span className="mimir-cell-editor__ref">
              {columnLetters(selected.col)}
              {selected.row}
            </span>
            {/*
              格内容编辑框走 `ToolbarTextField`（antd `Input`）。

              **这里原来是一个裸 `<input className="me-input">`**，Enter → `apply()`、
              Esc → 丢弃草稿，是同一套事件语义自己又写了一遍——而它与
              `ToolbarTextField` 的 `onSubmit` / `onCancel` **完全同形**。两处各写
              一遍就会漂移（同一个外壳里出现两种高度、两种焦点环、两种 Esc 行为），
              而那正是 D-064 要消掉的东西。

              宽度由 `.mimir-cell-editor .me-input--text` 覆写成「吃掉这一行的
              剩余宽度」（`editors.css`）：原语给的 180px 是工具条上那一排的尺寸，
              这一行在内容区下方、宽度随窗口，不覆写会缩成一小段。

              `onCancel` 比原语多收一件事：编辑行上方还有一条「这个格写不进去」
              的提示（`applyError`）。Esc 是「放弃这次输入」，那条提示也得一起
              收掉——否则换一个格它还挂在屏幕上说着上一个格的事。
            */}
            <ToolbarTextField
              label={`单元格 ${columnLetters(selected.col)}${selected.row}`}
              value={shown}
              onChange={(value) => setDraft(value)}
              onSubmit={apply}
              onCancel={() => {
                setDraft(null)
                setApplyError(null)
              }}
              placeholder="值或公式"
            />
            <ToolbarButton
              label="应用"
              disabled={draft === null}
              // 禁用必须给原因（DESIGN §8.4）：`draft === null` 是「格里的字还没被
              // 改过」，正是最需要解释的一档——按钮刚出现就是灰的，用户会以为坏了
              disabledReason="没有改动，不用应用"
              onClick={apply}
            >
              应用
            </ToolbarButton>
            {wasFormula && (
              <span className="me-label mimir-cell-editor__warn">
                <AlertIcon />
                原来是公式；输入普通值会覆盖它，输入 = 开头可更新公式
              </span>
            )}
          </div>
        ) : undefined
      }
      status={
        <>
          <ToolbarLabel>{status}</ToolbarLabel>
          {(applyError ?? note) && <ToolbarLabel>{applyError ?? note}</ToolbarLabel>}
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
          {/*
            ## 列字母行

            没有它，「C3」这个引用**在屏幕上找不到落点**：附属面板与工具条
            说的是 Excel 记法，而网格里只有一竖列行号——用户只能用蓝色选中框
            反推。跳到上一个/下一个公式格时文字变了、位置也变了，反而更难对。

            数据就是同一份 `sheet.columns`（列头与列宽本就是一件事的两面），
            样式与行号栏共用一套（`.mimir-xlsx__gutter` 那套 sticky 的 chrome）：
            横向滚动时它跟着表走，纵向滚动时钉在顶端。

            选中列的高亮与行号栏**对称**：行号栏亮的是「我在看哪一行」，列头亮
            的是「我在看哪一列」——十字高亮本来就是这两条线上的判断。
          */}
          <thead>
            <tr>
              {/*
                左上角那个交角格：行号栏与列头都是 sticky，它们的交叉点必须
                自己占一格，否则第一条列字母会被行号栏压住。空内容 + 无表头
                语义（它是装饰，不是数据）
              */}
              <th className="mimir-xlsx__gutter mimir-xlsx__corner" aria-hidden="true" />
              {sheet.columns.map((column) => (
                <th
                  key={`colhead-${column.col}`}
                  scope="col"
                  className={
                    cross && selected?.col === column.col
                      ? 'mimir-xlsx__colhead mimir-xlsx__colhead--cross'
                      : 'mimir-xlsx__colhead'
                  }
                >
                  {columnLetters(column.col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row) => {
              /** 十字高亮：选中格所在的整行（连行号格） */
              const rowOn = cross && selected?.row === row.number
              return (
                <tr key={`row-${row.number}`} style={{ height: `${row.height}px` }}>
                  <th
                    className={
                      rowOn ? 'mimir-xlsx__gutter mimir-xlsx__gutter--cross' : 'mimir-xlsx__gutter'
                    }
                  >
                    {row.number}
                  </th>
                  {row.cells.map((cell) => {
                    if (cell.covered) return null
                    const isSelected = selected?.row === row.number && selected?.col === cell.col
                    /**
                     * 十字高亮：选中格所在的**整行或整列**。
                     *
                     * 两个条件都要——只判列的话看起来像「高亮了一竖条」，
                     * 与「我在看哪一行」这个目的一半都没达成（行号格亮着、
                     * 行里的内容不亮，反而更乱）。
                     */
                    const crossOn = cross && (rowOn || selected?.col === cell.col)
                    return (
                      <td
                        key={`cell-${cell.col}`}
                        colSpan={cell.colSpan}
                        rowSpan={cell.rowSpan}
                        /*
                          选中的格把 ref 让给 `scrollIntoView`：查找与公式跳转
                          都只改选中，而格子可能在滚动区外（理由见那个函数）。
                        */
                        ref={isSelected ? scrollIntoView : undefined}
                        className={[
                          'mimir-xlsx__cell',
                          cell.numeric === true ? 'mimir-xlsx__cell--num' : '',
                          crossOn ? 'mimir-xlsx__cell--cross' : '',
                          isSelected ? 'mimir-xlsx__cell--on' : '',
                        ]
                          .filter((name) => name !== '')
                          .join(' ')}
                        title={cell.formula ? '公式（显示 Excel 算好的缓存值）' : undefined}
                        /*
                         * **白名单：这个格子是画布，不是控件。**
                         *
                         * 它有 `onClick` 但不是按钮——它是表格网格本身（每一格
                         * 都要能点着选中，用 `ToolbarButton` 会变成「一个格子里
                         * 嵌一个按钮」，行列的对齐、合并单元格的 `colSpan` 与
                         * 十字高亮全都建立在 `<td>` 上）。全仓库「交互元素不走
                         * 原语」的合法例外只有两处：这里是 xlsx 的网格，另一处
                         * 是 pptx 那片 SVG 画布（`PptxEditor.tsx` 的
                         * `.mimir-pptx-slide`）。
                         *
                         * 代价照实记：它不是键盘可达的（网格没有 roving tabindex，
                         * 键盘用户走工具条的「上一个 / 下一个命中」「公式格跳转」
                         * 那两组按钮换选中格）。这是**有意接受**的边界，不是漏了
                         * ——真要做完整键盘导航得给网格一套 2D 焦点模型，那是另一件
                         * 事；而现在**已经有**键盘路径，只是不在网格上。
                         *
                         * 别的地方新增这种写法之前先问：它是不是画布？不是就说明
                         * 它该走原语。
                         */
                        onClick={() => selectCell(row.number, cell.col)}
                      >
                        {/* 选中的格子显示草稿（实时预览），其余显示模型里的值 */}
                        {isSelected ? shown : cell.text}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </EditorShell>
  )
}

/**
 * 一个格子的位置：行号 1 开始、列号 0 开始（与 `XlsxCellRef` 同一套坐标系）。
 *
 * **不是数组下标**：`xlsx.ts` 的模型里行号会跳号（整行空白的行被丢掉了）、
 * 列号来自 `r="C3"`。用下标的话「下一个」会跳到肉眼看上去不挨着的格。
 */
interface CellPos {
  row: number
  col: number
}

/**
 * 行主序比较：先比行号，再比列号。
 *
 * 「前一个 / 后一个」就是**眼睛看着的那个顺序**（先上下、再左右）。按列优先
 * 或者按解析顺序都会让跳转看起来是乱跳——而那种乱跳只能靠数格子才发现。
 */
function isAfter(a: CellPos, b: CellPos): boolean {
  return a.row > b.row || (a.row === b.row && a.col > b.col)
}

/**
 * 「上一个 / 下一个」落在哪一个。`list` 必须已按行主序排好。
 *
 * 三种情形各有道理：
 *
 *   - **还没选中任何格** → 从表的开头（下一个）或结尾（上一个）进
 *   - **选中格在表里** → 走相邻那一个，两端**回绕**（与查找框的习惯一致）
 *   - **选中格不在表里** → 取它之后 / 之前最近的一个；没有了就回绕到另一头
 *
 * 返回 `null` **只在 `list` 为空时**——调用方据此把按钮禁用，而不是让一个
 * 点了没反应的按钮留在工具条上。
 */
function stepPosition(
  list: readonly CellPos[],
  current: CellPos | null,
  step: 1 | -1,
): CellPos | null {
  if (list.length === 0) return null
  const first = list[0]
  const last = list[list.length - 1]
  if (current === null) return step > 0 ? (first ?? null) : (last ?? null)

  const at = list.findIndex((c) => c.row === current.row && c.col === current.col)
  if (at >= 0) return list[(at + step + list.length) % list.length] ?? null

  if (step > 0) return list.find((c) => isAfter(c, current)) ?? first ?? null
  return list.findLast((c) => isAfter(current, c)) ?? last ?? null
}

/** 一张表里的公式格（行主序）。`covered` 的格选不中，所以不算 */
function formulaCells(sheet: XlsxSheet | null): CellPos[] {
  if (sheet === null) return []
  const out: CellPos[] = []
  for (const row of sheet.rows) {
    for (const cell of row.cells) {
      if (cell.formula === true && cell.covered !== true)
        out.push({ row: row.number, col: cell.col })
    }
  }
  return out
}

/**
 * 查找命中（行主序）。
 *
 * **只找当前这一张表**：跨表查找要连页签一起跳，而用户看不到别的表里命中了
 * 什么——「跳过去了但不知道跳到了哪」比不跳更让人困惑。状态行与按钮 tooltip
 * 都写着这条边界。
 *
 * 不区分大小写（`toLowerCase`）：这是查找框的常规行为。中文没有大小写，
 * 这里管的是英文与公式里的函数名。
 */
function findCells(sheet: XlsxSheet | null, query: string): CellPos[] {
  if (sheet === null || query === '') return []
  return findXlsxCells({ sheets: [sheet] }, { query, sheetId: sheet.id }).matches.map(
    ({ address }) => {
      const match = /^([A-Z]+)(\d+)$/.exec(address)!
      return {
        row: Number(match[2]),
        col: [...match[1]!].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0) - 1,
      }
    },
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
