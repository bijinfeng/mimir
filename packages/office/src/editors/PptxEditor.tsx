/**
 * pptx 的幻灯片编辑器（渲染 + 改文字 + 改 run 级格式 + 查找替换）。
 *
 * ## 只有这一个组件（原 `PptxPreview` 已被它取代）
 *
 * 只读预览与编辑渲染的是**同一份模型**（`pptx-render.ts` 的 `renderSlide`）。
 * 分开两个组件的话，只读那个不加载 archive（保存要用），界面会变成
 * 「预览看一遍、想改一个字要切到另一个模式」——而 pptx 的原件层本来
 * 就是给人看和改的地方。
 *
 * ## 渲染是 SVG，不是 canvas
 *
 * 上游的 `render-tree.ts` 顶部写着「Konva is just a thin adapter」——保真逻辑
 * （坐标、换行、继承）全在纯数据层，换适配器是它的设计允许的。
 * **为什么换**：canvas 里的文字选不中、搜不到、读屏读不到，而对着幻灯片
 * 复制一句话是很自然的动作。SVG 的 `<text>` 三者都有。
 *
 * ## 编辑的粒度是**段落**；格式的粒度是**整段**（不是半句话）
 *
 * 实测（真实 pptx）：一个段落里通常只有**一个 run**，文本是整段。所以
 * 「编辑一个文本框」在界面层就是「每段一个输入框」，模型层由 vendored 的
 * `applyEditParagraphs` 做映射（未被编辑的字号/字体/颜色/项目符号从原 run
 * 继承）。
 *
 * 界面里**没有 run 级选区**（能选的是画布上的元素与段落输入框），所以工具条
 * 上的加粗/字号/颜色只能表达「这一整段」。标签因此都写着「（整段）」，状态行
 * 也把这条边界说清楚——不写的话，用户会以为能只加粗半句话。
 *
 * ## run 的结构**一条都不压平**（改文字与改格式两条路都要守）
 *
 * 最直觉的写法是「每段回传一条 run，文本是整段拼起来的」——那是
 * `EditParagraph` 允许的形状。**但在这个界面上是错的**：实测一份「加粗标签 +
 * 普通正文」的段落（两个 run：`sz=3600 b=1` 与 `sz=2400` 红字），那样回传之后
 * 段落被压成**一条** run，取的是 `dominantRun`（文字最多的那条）的格式——
 * 标签的加粗与字号被静默丢掉（那一版写出的 XML 里只剩 `sz="2400"`）。而保存
 * 成功、文件能打开、文字也对，只有格式悄悄错了。
 *
 * 两条路都是同一件事：
 *
 * | 动作 | 怎么保住其余 run |
 * |---|---|
 * | 工具条改格式（`applyFormat`） | 逐 run 回传：每条带自己的 `srcRun` 与原文，格式项**追加**上去 |
 * | 段落输入框改文字（`editParagraphRuns`） | 取新旧文本的公共前后缀，**只改真正变动的那条 run**；跨多条时才整段重写 |
 *
 * 于是 `applyEditParagraphs` 按 run 对齐，`pptx-engine/src/generate.ts` 的
 * `patchRunProps` 只给该改的那几项写字节，兄弟 run 的字号、颜色、字体一个都不
 * 动。段落级的东西（项目符号、行距、对齐）由 `srcPara` 继承，同一条路。
 *
 * ## 哪些格式能改、哪些不能（如实写在界面上）
 *
 * | 能改（本版） | 做不到（本版） |
 * |---|---|
 * | 加粗 / 倾斜 / 下划线 / 删除线（整段） | 元素位置与大小（拖动改框） |
 * | 上标 / 下标（整段） | 项目符号、行距、对齐（一律沿用原件） |
 * | 字号 / 字体 / 字体颜色（整段） | 动画、SmartArt、OLE 的编辑 |
 * | 清除这五项字形 | **字号/字体/颜色没有「回到继承」的表达**，所以「清除字形」不碰它们 |
 *
 * ## 查找和替换的作用域是**整份演示文稿**
 *
 * 匹配按「幻灯片 + 元素 + 段落」三级算（`editableElements` → `textOfElement`
 * → `paragraphs`），命中的元素被**整体描边**（琥珀色）并把那一页带出来——
 * 高亮画在渲染出的 SVG 上，而一次只画一页，所以跨页的命中要跟着翻页。替换
 * 回传的每一段都带 `srcPara`、每条 run 都带 `srcRun`，否则那一段的格式会被
 * 冲掉（见 `applyEditParagraphs` 的开头）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { editableElements, openPptxForEdit, textOfElement } from '../pptx.js'
import { renderSlide, type PptxRenderable, type RenderedSlide } from '../pptx-render.js'
import {
  EditorShell,
  EditorState,
  FindReplaceBar,
  ToolbarButton,
  ToolbarColorPicker,
  ToolbarDivider,
  ToolbarGroup,
  ToolbarLabel,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarSpacer,
  ToolbarTabs,
  ToolbarTextArea,
  type FindReplaceAdapter,
  type ToolbarColorOption,
  type ToolbarSelectOption,
} from '../shell/EditorShell.js'
import {
  BoldIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClearFormatIcon,
  EyeIcon,
  FindIcon,
  ItalicIcon,
  SaveIcon,
  StrikeIcon,
  SubscriptIcon,
  SuperscriptIcon,
  UnderlineIcon,
} from '../shell/icons.js'
import type { FindOptions } from '../shims/ui.js'
import type { EditParagraph, EditRun } from '../../vendor/packages/pptx-ops/src/types.js'
import type { Paragraph, TextRun } from '../../vendor/packages/pptx-engine/src/types.js'
import { statusText, useParsed, useSource } from './use-source.js'
import { OFFICE_MIME, type EditorProps } from './types.js'
import '../shell/shell.css'
import './editors.css'

/**
 * 画布宽度（px）。渲染器按这个宽度算缩放，所以它决定文字大小与换行位置。
 * 960 是「宽屏下不缩得太小、窄屏下还能看」的折中。
 */
const FIT_WIDTH_PX = 960

/**
 * 上标 / 下标的 baseline 百分比。
 *
 * **只有三个状态表达得了**：`applyEditParagraphs` 按**符号**判断变化
 * （`edit-text.ts`：`Math.sign(r.baseline) !== Math.sign(oldRun.baseline ?? 0)`），
 * 所以原件里一个 40% 的上标点「上标」不会被打成 30%——同号即不动，那个精确值
 * 保住。取消（0）才写 `baseline="0"`。
 */
const SUPERSCRIPT_BASELINE = 30
const SUBSCRIPT_BASELINE = -25

/** 增大/减小字号的步长（pt） */
const SIZE_STEP_PT = 2
/** 字号区间。`generate.ts` 的 `szAttr` 上限是 4000pt，界面给一个合理的区间 */
const MIN_FONT_SIZE_PT = 1
const MAX_FONT_SIZE_PT = 400

/** 查找命中的描边颜色。**不是**品牌蓝——「选中的」与「找到的那个」要看得出是两件事 */
const FIND_MARK_COLOR = '#d48806'

/** 画布上描边的元素用的类（`editors.css` 里那条 `[data-element-id]` 规则） */
const MARKED_CLASS = 'mimir-pptx-selected'

/**
 * 字体颜色的一档。
 *
 * `value` 就是写进 XML 的 `srgbClr`（`patchRunColor` 取前 6 位），`swatch` 是
 * 界面上画出来的颜色——docx 那边这两个必须分开（它存 OOXML 色名），这里恰好
 * 是同一个字符串，但接口分开的规矩照旧，免得哪天变成第二种格式时被当成一个
 * 东西用。
 */
const TEXT_COLORS: readonly ToolbarColorOption[] = [
  { value: '#000000', label: '黑', swatch: '#000000' },
  { value: '#404040', label: '深灰', swatch: '#404040' },
  { value: '#7F7F7F', label: '中灰', swatch: '#7F7F7F' },
  { value: '#BFBFBF', label: '浅灰', swatch: '#BFBFBF' },
  { value: '#D9D9D9', label: '更浅灰', swatch: '#D9D9D9' },
  { value: '#F2F2F2', label: '极浅灰', swatch: '#F2F2F2' },
  { value: '#FFFFFF', label: '白', swatch: '#FFFFFF' },
  { value: '#C00000', label: '深红', swatch: '#C00000' },
  { value: '#FF0000', label: '红', swatch: '#FF0000' },
  { value: '#ED7D31', label: '橙', swatch: '#ED7D31' },
  { value: '#C55A11', label: '赭', swatch: '#C55A11' },
  { value: '#FFC000', label: '金', swatch: '#FFC000' },
  { value: '#FFD966', label: '浅金', swatch: '#FFD966' },
  { value: '#A64D79', label: '紫红', swatch: '#A64D79' },
  { value: '#7030A0', label: '紫', swatch: '#7030A0' },
  { value: '#FF66CC', label: '粉', swatch: '#FF66CC' },
  { value: '#375623', label: '深绿', swatch: '#375623' },
  { value: '#548235', label: '绿', swatch: '#548235' },
  { value: '#70AD47', label: '亮绿', swatch: '#70AD47' },
  { value: '#A9D08E', label: '浅绿', swatch: '#A9D08E' },
  { value: '#00B050', label: '翠绿', swatch: '#00B050' },
  { value: '#00B0B0', label: '青', swatch: '#00B0B0' },
  { value: '#1F4E79', label: '深蓝', swatch: '#1F4E79' },
  { value: '#2E75B6', label: '蓝', swatch: '#2E75B6' },
  { value: '#0070C0', label: '亮蓝', swatch: '#0070C0' },
  { value: '#4472C4', label: '靛蓝', swatch: '#4472C4' },
  { value: '#8FAADC', label: '浅蓝', swatch: '#8FAADC' },
  { value: '#9DC3E6', label: '淡蓝', swatch: '#9DC3E6' },
  { value: '#00B0F0', label: '天蓝', swatch: '#00B0F0' },
]

/**
 * 常见字体。排在文档里出现过的字体**之后**（那些才是这份文件真正在用的）。
 *
 * 中英文一起换：`patchRunFont` 把 `<a:latin>` / `<a:ea>` / `<a:cs>` 三个槽位
 * 写成同一个值，所以中文名（微软雅黑/苹方）与西文名（Calibri）走同一条路。
 */
const COMMON_FONTS: readonly string[] = [
  'Calibri',
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Verdana',
  'Courier New',
  '微软雅黑',
  '等线',
  '宋体',
  '黑体',
  '楷体',
  '仿宋',
  '苹方',
]

/**
 * 写进 run 的格式项（`EditRun` 里界面能表达的那几项）。
 *
 * **是「要写哪几项」而不是「完整的取值」**：`applyEditParagraphs` 的契约就是
 * 「`undefined` = 保持原值」，只传改动的那一项，其余 run 属性一个字节都不动。
 */
type RunFormat = Partial<
  Pick<
    EditRun,
    'bold' | 'italic' | 'underline' | 'strike' | 'baseline' | 'fontSize' | 'fontFamily' | 'color'
  >
>

/** 一处查找命中：哪一页、哪个元素、第几段、段内偏移 */
interface PptxMatch {
  slideIndex: number
  elementId: string
  paraIndex: number
  start: number
  end: number
}

/* ── 纯函数：文本与匹配 ─────────────────────────────────────────── */

/**
 * 软换行哨兵：解析把 `<a:br/>` 变成一条 `text === '\n'` 的 run（`parse.ts`）。
 *
 * 它**必须原样回传**：`patchTextElementXml` 按「位置对齐」判断能不能走外科式
 * 补丁，哨兵被改掉就退化成整段重建。
 */
function isSoftBreak(run: TextRun): boolean {
  return run.text === '\n' && run.field === undefined
}

/** 一段的纯文本。查找与「当前值」都按它算 */
function paragraphText(paragraph: Paragraph): string {
  return paragraph.runs.map((run) => run.text).join('')
}

/**
 * 所有 run 的同一个属性是否**完全一致**。
 *
 * 返回 `null` 有三种情形，界面上一律显示「多档…」：空集合、有 run 缺这个属性、
 * 取值不一致。**不拿第一条 run 冒充**——显示的值得是文档里的值。
 */
function uniformOf<T>(runs: readonly TextRun[], pick: (run: TextRun) => T | undefined): T | null {
  let value: T | null = null
  let seen = false
  for (const run of runs) {
    const next = pick(run)
    if (next === undefined) return null
    if (!seen) {
      value = next
      seen = true
      continue
    }
    if (next !== value) return null
  }
  return seen ? value : null
}

/** 颜色归一化到 `#RRGGBB`。模型里可能是小写、也可能带 alpha（8 位） */
function hex6(color: string | undefined): string | null {
  if (color === undefined) return null
  const digits = color.replace(/^#/, '').slice(0, 6).toUpperCase()
  return /^[0-9A-F]{6}$/.test(digits) ? `#${digits}` : null
}

/** 把一段文本变成正则用的字面量（用户敲的 `.` `(` 之类不该当元字符） */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 段内的一处匹配（半开区间） */
interface MatchRange {
  start: number
  end: number
}

/**
 * 两侧都不是「词字符」才算一个词。
 *
 * 用字符类别（`\p{L}`/`\p{N}`）而不是空格：中文没有词边界，「组件」两侧是
 * 标点或行首/行尾照样算一个词，而英文的 `optimize` 不会在 `optimization`
 * 里被算成命中。
 */
function isWholeWord(text: string, start: number, end: number): boolean {
  const wordChar = /[\p{L}\p{N}_]/u
  const before = start > 0 ? text[start - 1]! : ''
  const after = end < text.length ? text[end]! : ''
  return !wordChar.test(before) && !wordChar.test(after)
}

/** 一段文本里的全部匹配。偏移是**原文的**（正则带 `i` 时也要对得上） */
function matchRanges(text: string, query: string, options: FindOptions): MatchRange[] {
  if (query === '') return []
  let pattern: RegExp
  try {
    pattern = new RegExp(escapeRegExp(query), options.matchCase ? 'gu' : 'giu')
  } catch {
    // 查询串构造不出正则（正常输入不会走到这里）：当作没有匹配，不抛
    return []
  }
  const out: MatchRange[] = []
  for (const found of text.matchAll(pattern)) {
    const start = found.index ?? 0
    const end = start + found[0].length
    if (options.wholeWord && !isWholeWord(text, start, end)) continue
    out.push({ start, end })
  }
  return out
}

/**
 * 在**一组 run 的文本**里替换掉若干处匹配，返回新的文本数组。
 *
 * ## 为什么按偏移落到 run 上，而不是拼成一条
 *
 * 替换只该改被替换掉的那几个字，其余 run 的格式一个都不能动。所以找出每处
 * 匹配与哪些 run 相交，只改相交的部分：第一个相交的 run 拿到替换文本，其余
 * 相交的 run 去掉被匹配的部分。**run 的条数不变**——`patchTextElementXml` 的
 * 「位置对齐」前提因此保住（哨兵与 `<a:br/>` 的字节也不用重排）。
 *
 * 多处匹配**从后往前**套用：前面的偏移不会被后面的替换挪动。
 */
function replaceRanges(
  runTexts: readonly string[],
  ranges: readonly MatchRange[],
  replacement: string,
): string[] {
  const out = [...runTexts]
  for (const range of ranges.toSorted((a, b) => b.start - a.start)) {
    let offset = 0
    let inserted = false
    for (let index = 0; index < out.length; index += 1) {
      const text = out[index]!
      const start = offset
      offset += text.length
      const end = offset
      if (end <= range.start || start >= range.end) continue
      const head = text.slice(0, Math.max(0, range.start - start))
      const tail = text.slice(Math.max(0, range.end - start))
      out[index] = head + (inserted ? '' : replacement) + tail
      inserted = true
    }
  }
  return out
}

/**
 * 纯插入（只加字、不删字）落到哪条 run 的哪个位置。
 *
 * 插入没有「被改掉的原文」，按「与几条 run 相交」找不到归属——零宽区间与
 * **0 条** run 相交。规则取**插入点前一个字符所在的 run**：段尾追加落在最后
 * 一条（在段尾打字，延续的就是最后一条 run 的格式）、run 边界落在前一条
 * （紧跟在加粗文字后面打字，新字也是加粗的）、段首落在第一条；插入点在某条
 * run 内部时就地插进那个位置。
 *
 * **软换行哨兵不是文字**，新字符不该混进去——混进去哨兵就不再是 `'\n'`，
 * `patchTextElementXml` 的逐 run 对齐随之失效，明明只加一个字却退化成整段
 * 重建。所以落点是哨兵的**右边缘**（换行之后 = 下一行行首）且下一条是普通
 * 文字时，改落到下一条的开头。哨兵与哨兵之间（连续换行的空行）没有普通 run
 * 可落，仍进哨兵：文本是对的，只是这个元素这一次走 `rebuildTxBody` 的重建
 * 分支（`generateRunXml` 会把带 `\n` 的 run 重新拆成 run + `<a:br/>`）。
 */
function insertIntoRuns(runTexts: readonly string[], at: number, insertion: string): string[] {
  let target = 0
  let local = 0
  let offset = 0
  for (let index = 0; index < runTexts.length; index += 1) {
    const start = offset
    offset += runTexts[index]!.length
    if (at > 0 && start < at && offset >= at) {
      target = index
      local = at - start
      break
    }
  }
  const here = runTexts[target]
  const next = runTexts[target + 1]
  if (here === '\n' && local === here.length && next !== undefined && next !== '\n') {
    target += 1
    local = 0
  }
  return runTexts.map((text, index) =>
    index === target ? text.slice(0, local) + insertion + text.slice(local) : text,
  )
}

/**
 * 段落的文字被改之后怎么回传（返回 `null` = 走「整段重写」那条路）。
 *
 * ## 为什么不是「一律压成一条 run」
 *
 * 段落输入框回传的是整段的纯文本，所以最直觉的写法是「每段一条 run」。但那是
 * **破坏性**的：同段其余 run 的格式会被顶掉——实测一份「加粗标签 + 普通正文」
 * 的段落（`b="1" sz="3600"` + `sz="2400"`），在正文里改一个字之后标签的加粗与
 * 字号就没了，而保存成功、文字也对。
 *
 * ## 所以：只改真正变动的那一部分
 *
 * 取新旧文本的**公共前缀与公共后缀**，中间那段就是用户实际改动的范围。
 *
 *  - 改动**落在一条 run 内** → 只改那一条（其余 run 原样回传、带自己的 `srcRun`）
 *  - 区间是**零宽**（纯插入：段尾追加、段首补字、run 边界塞字）→ 它与 0 条 run
 *    「相交」，不能按相交数判断——插入落进 `insertIntoRuns` 算出的那一条，其余
 *    run 原样
 *  - 跨了多条 run（整段删了重打、粘一大段进来）→ **这确实是一次整段重写**，
 *    交给上游按 `dominantRun` 处理——那是 `applyEditParagraphs` 里写明的行为
 *    （「a rewrite of the whole paragraph is not a rewrite of its label」）
 *
 * 返回 `null` 的情形：改动跨了多条 run（或段落没有 run 可落）。文本没变时返回
 * 原样的一组文本——提交它们与「未编辑的段落」走同一条路，一个字节都不会变。
 */
function editParagraphRuns(runTexts: readonly string[], next: string): { texts: string[] } | null {
  const joined = runTexts.join('')
  if (next === joined) return { texts: [...runTexts] }
  const limit = Math.min(joined.length, next.length)
  let head = 0
  while (head < limit && joined[head] === next[head]) head += 1
  let tail = 0
  while (tail < limit - head && joined[joined.length - 1 - tail] === next[next.length - 1 - tail]) {
    tail += 1
  }
  const range: MatchRange = { start: head, end: joined.length - tail }
  const replacement = next.slice(head, next.length - tail)
  if (range.start === range.end) {
    // 纯插入：零宽区间与任何 run 都不相交，落点单独算（见 `insertIntoRuns`）
    if (runTexts.length === 0) return null
    return { texts: insertIntoRuns(runTexts, range.start, replacement) }
  }
  /** 这个范围与几条 run 相交。跨多条 = 这是一次整段重写，交给上游 */
  let touched = 0
  let offset = 0
  for (const text of runTexts) {
    const start = offset
    offset += text.length
    if (offset <= range.start || start >= range.end) continue
    touched += 1
  }
  if (touched !== 1) return null
  return { texts: replaceRanges(runTexts, [range], replacement) }
}

/**
 * 画布上某个元素对应的 SVG 节点。
 *
 * **按属性比而不是拼选择器**：`data-element-id` 的值是我们自己生成的
 * （`sp_`/`pic_` 一类），拼进 `querySelector` 也能用，但那要求「值里永远没有
 * 引号」——这条约定没有人守。逐个比一遍，元素数量本来就小。
 */
function elementNode(root: HTMLElement, id: string): Element | null {
  for (const node of root.querySelectorAll('[data-element-id]')) {
    if (node.getAttribute('data-element-id') === id) return node
  }
  return null
}

/**
 * 上一次 `search` 命中的那些位置。查找栏的接口是「先 `search`（拿数量、记下
 * 位置）再 `activate` / `replaceOne(index)`」，所以这份结果必须活过两次调用。
 *
 * ## 为什么不写 `let matches = []` 在 `useMemo` 里
 *
 * 那会被 `react-hooks(immutability)` 判违规：**渲染结束后重新赋值一个渲染期
 * 声明的变量**（编译器会因此跳过整个组件，而这个仓库把它当铁律）。
 * `useState(createMatchStore)` 是同一个手法在本仓的既有写法
 * （`EditorShell.tsx` 的 `createFindStore`）：把可变状态藏进模块级工厂返回的
 * 闭包里，编译器看到的是一个不透明对象，事件里改它的内容不构成渲染期副作用。
 */
function createMatchStore() {
  let list: PptxMatch[] = []
  return {
    all: (): readonly PptxMatch[] => list,
    put: (next: PptxMatch[]): void => {
      list = next
    },
  }
}

/**
 * 文档变化事件的转发（查找栏订阅它）。
 *
 * 查找栏的接口里只有 `onDocChanged(listener)`，而**改文档的有两处**：段落输入框
 * 与查找替换自己。两处都走 `afterEdit` → 这里，于是匹配数不会停在编辑之前
 * （那是「替换了但计数没变」那种看着像坏了的状态）。
 */
function createFindEvents() {
  const listeners = new Set<() => void>()
  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    notify(): void {
      for (const listener of listeners) listener()
    },
  }
}

export function PptxEditor({ documentId, io, onDirtyChange, flush = false }: EditorProps) {
  const source = useSource(io, documentId)
  const parsed = useParsed(source.bytes, openPptxForEdit)
  const session = parsed.value
  const [active, setActive] = useState(0)
  /** 选中的元素 id（选中后才能改它的文字与格式） */
  const [selected, setSelected] = useState<string | null>(null)
  /** 有改动还没保存（保存后清掉） */
  const [dirty, setDirty] = useState(false)
  /** 画布容器：SVG 里注入 `data-element-id` 后用它做事件代理与描边 */
  const canvasRef = useRef<HTMLDivElement>(null)

  /** 查找栏的显隐、查询串与两个开关（栏本身是受控的） */
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findOptions, setFindOptions] = useState<FindOptions>({
    matchCase: false,
    wholeWord: false,
  })
  /** 当前高亮的命中（跨页也记着：翻到那一页才画得出来） */
  const [findMark, setFindMark] = useState<PptxMatch | null>(null)
  /** 文档变化事件（见 `createFindEvents`）。初始化一次，之后是同一个对象 */
  const [findEvents] = useState(createFindEvents)
  /** 上一次查找命中（见 `createMatchStore`） */
  const [matchStore] = useState(createMatchStore)

  /**
   * 渲染用的**不可变快照**（见 `PptxEditSession.view()` 的说明）。
   *
   * 编辑是就地改模型的，所以不能拿 `slides()` 当依赖（引用不变，重算不触发）。
   * 快照的身份随改动变化：**没改动时 `view()` 返回同一个对象**，改动后是新
   * 对象——于是 `useMemo` 的依赖是诚实的，不需要外面数版本号。
   *
   * `edited` 只是给「改过之后的快照」一个落脚处，同样绑着「哪一份字节」，
   * 所以换文件时它自然作废。没改过时直接用 `session.view()`（同一个对象，
   * 不会让下游重算）。
   */
  const [edited, setEdited] = useState<{ source: Uint8Array; view: PptxRenderable } | null>(null)
  const view = edited?.source === source.bytes ? edited.view : (session?.view() ?? null)

  /**
   * 段落输入框的稳定 key。
   *
   * **不用下标**（React 规则禁止，而且段落增删后会复用错位的输入框状态），
   * **也不用内容**（每敲一个字 key 就变 → React 卸载重建 textarea → 光标跳走）。
   * 所以给每段造一个**在编辑期间稳定**的 id：选中元素时按当时的段数生成。
   */
  const [paragraphKeys, setParagraphKeys] = useState<string[]>([])

  /** 当前页的可编辑元素 */
  const editable = useMemo(() => {
    const slide = view?.slides()[active]
    return slide ? editableElements(slide) : []
  }, [view, active])

  const rendered = useMemo<RenderedSlide | null>(() => {
    if (!view) return null
    return renderSlide(view, active, { fitWidthPx: FIT_WIDTH_PX })
  }, [view, active])

  const slideCount = view?.slides().length ?? 0

  /**
   * 模型变了之后的**React 侧跟进**：刷新渲染快照、标脏、通知查找栏重扫。
   *
   * 放进 ref 里给查找适配器用：适配器要保持**同一个对象**（它一变，查找栏的
   * effect 就重扫一遍），而它调用的那个回调又要读到最新一轮的 `dirty` /
   * `onDirtyChange`。仓里另外三处（`useSource` 的 `io`、`MarkdownEditor` 的
   * `saveNow`、`PdfCanvas` 的 `onError`）是同一个手法：ref 承接最新闭包，
   * 注册的 effect 只依赖真正是输入的东西。ref 的更新 effect 声明在渲染
   * **之前**——顺序反了 React Compiler 会判违规。
   */
  const afterEdit = () => {
    if (session === null || source.bytes === null) return
    setEdited({ source: source.bytes, view: session.view() })
    if (!dirty) {
      setDirty(true)
      onDirtyChange?.(true)
    }
    findEvents.notify()
  }
  const afterEditRef = useRef(afterEdit)
  useEffect(() => {
    afterEditRef.current = afterEdit
  })

  /**
   * 当前页的**最新值**，给查找适配器的 `activate` 用。
   *
   * 它要在事件里判断「命中的那一页是不是当前页」——是的话**不调 `goTo`**：
   * `goTo` 会清掉选中与段落 key（换页时那是对的），而「同一个元素里按下一个
   * 匹配」不该把用户刚选中的文本框取消掉。`active` 直接进适配器的依赖会让
   * 适配器每翻一页换一次身份（查找栏于是重扫并重订阅），所以走 ref。
   *
   * 读它的地方是事件（`activate`），不是渲染期——渲染期读 ref 会被 React
   * Compiler 判违规。
   */
  const activeRef = useRef(active)
  useEffect(() => {
    activeRef.current = active
  })

  /**
   * 换到某一页。
   *
   * 稳定引用（只碰 state setter）：查找适配器要用它把跨页的命中带出来，而
   * 适配器的依赖一变就会让查找栏重扫，所以它必须稳定。
   */
  const goTo = useCallback((index: number) => {
    setActive(index)
    // 换页要清掉选中：那个元素不在这一页了
    setSelected(null)
    setParagraphKeys([])
  }, [])

  /**
   * 选中元素的**文字模型**。
   *
   * 不缓存（不用 `useMemo`）：返回的 `el.text` 是模型里的同一个对象，而编辑是
   * **就地**改它的（`setText` 把 `text.paragraphs` 换成新数组）。按元素的身份
   * 缓存就会踩「对象没变、里面的东西变了」——那类缓存失效是静默的。这里每次
   * 渲染重新读一遍，代价是几十次属性访问。
   */
  const selectedElement =
    selected === null ? null : (editable.find((element) => element.id === selected) ?? null)
  /**
   * 选中元素的文字。`null` 与 `undefined` 都收成 `null`：`TextElement['text']` 是
   * 可选的，而这个组件对「没有文字」只有一种处理——按钮禁用 + 一句原因。
   */
  const selectedText = (selectedElement === null ? null : textOfElement(selectedElement)) ?? null

  /** 选中的元素现在有哪些段落（每段把它的 run 拼起来——界面按段落编辑） */
  const paragraphs = selectedText?.paragraphs.map((paragraph) => paragraphText(paragraph)) ?? null

  /**
   * 格式工具条要看的那些 run。
   *
   * **排除软换行哨兵**：它是排版用的记号，不是可见文字——把它算进「当前值」
   * 会让一个正常的文本框因为换行处的取值不同而显示「多档」。
   */
  const formatRuns =
    selectedText?.paragraphs.flatMap((paragraph) =>
      paragraph.runs.filter((run) => !isSoftBreak(run)),
    ) ?? []

  /**
   * 改一段文字。
   *
   * 两条都要做对：
   *
   *  1. **没被改的那些段落原样回传**（每条 run 带自己的 `srcRun`）。原先的写法
   *     是「所有段落都压成一条 run」——于是改第 1 段会顺手把第 2 段的 run 结构
   *     也压平，同段其它 run 的格式被静默顶掉（理由见 `editParagraphRuns`）
   *  2. 被改的那一段**优先只改真正变动的那条 run**（`editParagraphRuns`），
   *     跨多条时才整段重写
   *
   * `srcPara` 把这段指回**原始段落**——`applyEditParagraphs` 靠它继承那一段
   * 未被编辑的属性（项目符号、行距、run 的字号与字体）。不给的话按位置匹配，
   * 段落增删时就会串味。
   */
  const setParagraph = (index: number, value: string) => {
    if (!session || !selected || !paragraphs || selectedText === null) return
    const next: EditParagraph[] = selectedText.paragraphs.map((paragraph, paraIndex) => {
      const runs: EditRun[] = paragraph.runs.map((run, runIndex) => ({
        text: run.text,
        srcRun: runIndex,
      }))
      if (paraIndex !== index) return { runs, srcPara: paraIndex }
      const narrowed = editParagraphRuns(
        runs.map((run) => run.text),
        value,
      )
      /*
       * 只改动了一条 run（含纯插入）→ 那条换新文本、其余原样（格式都保住）；
       * 跨了多条 → 回传整段一条 run。**不带 srcRun**：`applyEditParagraphs` 对
       * 「未带 srcRun 的单 run 替换多 run 段落」取 `dominantRun`（正文那条）的
       * 格式，重写的新文字跟着正文走——这是上游写明的语义（「a rewrite of the
       * whole paragraph is not a rewrite of its label」）。带 srcRun 会绕开它、
       * 钉死在第一条上，还会把域 run 的身份（幻灯片编号那种）摊到新文字上。
       */
      if (narrowed === null) return { runs: [{ text: value }], srcPara: paraIndex }
      return {
        runs: narrowed.texts.map((text, runIndex) => ({ text, srcRun: runIndex })),
        srcPara: paraIndex,
      }
    })
    if (!session.setText(active, selected, next)) return
    afterEditRef.current()
  }

  /**
   * 把一份格式写到**选中元素的每一条 run**上。
   *
   * 逐 run 回传（每条带自己的 `srcRun` 与原文）——理由见文件头：压成「每段一条
   * run」会把同段其它 run 的字号/颜色静默丢掉。格式项是**追加**上去的，而
   * `applyEditParagraphs` 里写着「传与当前相同的值什么都不写」，所以点一个已经
   * 生效的按钮不会改字节。
   *
   * `format` 给函数时按 run 现算（增大/减小字号要读每条 run 自己的值）。
   */
  const applyFormat = (format: RunFormat | ((run: TextRun) => RunFormat)) => {
    if (!session || !selected || selectedText === null) return
    const resolve = typeof format === 'function' ? format : () => format
    const next: EditParagraph[] = selectedText.paragraphs.map((paragraph, paraIndex) => ({
      runs: paragraph.runs.map((run, runIndex) => ({
        text: run.text,
        srcRun: runIndex,
        ...resolve(run),
      })),
      srcPara: paraIndex,
    }))
    if (!session.setText(active, selected, next)) return
    afterEditRef.current()
  }

  /**
   * 查找/替换的适配器。
   *
   * 扫描走 `session.slides()`（**当前模型**，编辑后立刻是新的），所以不必把
   * `view` 放进依赖——适配器在整个文档期间是同一个对象，查找栏不会因为一次
   * 编辑就重挂。匹配按「页 + 元素 + 段」记，`replaceOne` 用上一次 `search`
   * 的结果定位。
   */
  const findAdapter = useMemo<FindReplaceAdapter>(() => {
    const collect = (query: string, options: FindOptions): PptxMatch[] => {
      const out: PptxMatch[] = []
      if (query === '' || session === null) return out
      session.slides().forEach((slide, slideIndex) => {
        for (const element of editableElements(slide)) {
          const text = textOfElement(element) ?? null
          if (text === null) continue
          text.paragraphs.forEach((paragraph, paraIndex) => {
            for (const range of matchRanges(paragraphText(paragraph), query, options)) {
              out.push({
                slideIndex,
                elementId: element.id,
                paraIndex,
                start: range.start,
                end: range.end,
              })
            }
          })
        }
      })
      return out
    }

    /**
     * 把若干处命中写回模型。
     *
     * 按「页 + 元素」分组，一个元素只调一次 `setText`（它一次改完整个元素）。
     * 每段都带 `srcPara`、每条 run 都带 `srcRun`——不带的话那一段的格式会被
     * 冲掉。
     */
    const applyReplacements = (list: readonly PptxMatch[], replacement: string): void => {
      if (session === null) return
      const byElement = new Map<string, PptxMatch[]>()
      for (const match of list) {
        const key = `${match.slideIndex}:${match.elementId}`
        const bucket = byElement.get(key)
        if (bucket === undefined) byElement.set(key, [match])
        else bucket.push(match)
      }
      let changed = false
      for (const group of byElement.values()) {
        const head = group[0]
        if (head === undefined) continue
        const slide = session.slides()[head.slideIndex]
        const element = slide
          ? editableElements(slide).find((item) => item.id === head.elementId)
          : undefined
        const text = (element ? textOfElement(element) : null) ?? null
        if (text === null) continue

        const byParagraph = new Map<number, MatchRange[]>()
        for (const match of group) {
          const bucket = byParagraph.get(match.paraIndex)
          if (bucket === undefined) byParagraph.set(match.paraIndex, [match])
          else bucket.push(match)
        }

        const next: EditParagraph[] = text.paragraphs.map((paragraph, paraIndex) => ({
          runs: paragraph.runs.map((run, runIndex) => ({ text: run.text, srcRun: runIndex })),
          srcPara: paraIndex,
        }))
        for (const [paraIndex, ranges] of byParagraph) {
          const target = next[paraIndex]
          if (target === undefined) continue
          const texts = replaceRanges(
            target.runs.map((run) => run.text),
            ranges,
            replacement,
          )
          target.runs = texts.map((value, runIndex) => ({ text: value, srcRun: runIndex }))
        }
        if (session.setText(head.slideIndex, head.elementId, next)) changed = true
      }
      if (changed) afterEditRef.current()
    }

    return {
      search(query, options) {
        const found = collect(query, options)
        matchStore.put(found)
        // 没有命中就把高亮撤掉：留着一条描边配「无匹配」是界面在说假话
        if (found.length === 0) setFindMark(null)
        return found.length
      },

      activate(index) {
        const match = matchStore.all()[index]
        if (match === undefined) return
        setFindMark(match)
        // 命中在别的页上才翻页（理由见 `activeRef`：同页翻页会白清一次选中）
        if (match.slideIndex !== activeRef.current) goTo(match.slideIndex)
      },

      clear() {
        setFindMark(null)
      },

      replaceOne(index, replacement) {
        const match = matchStore.all()[index]
        if (match === undefined) return
        applyReplacements([match], replacement)
      },

      replaceAll(replacement) {
        const found = matchStore.all()
        if (found.length === 0) return
        applyReplacements(found, replacement)
      },

      onDocChanged(listener) {
        return findEvents.subscribe(listener)
      },
    }
  }, [session, findEvents, goTo, matchStore])

  /**
   * 画布上的点击 → 选中元素。
   *
   * 用**事件代理**而不是给每个元素绑：SVG 是 `dangerouslySetInnerHTML` 注入的
   * 字符串，每次编辑后整体换掉，逐个绑会全部失效。代理挂在容器上，由
   * `closest('[data-element-id]')` 找最近的元素——渲染器给每个节点写了这个属性。
   */
  const onClickCanvas = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as Element | null
      const hit = target?.closest('[data-element-id]')
      const id = hit?.getAttribute('data-element-id') ?? null
      setSelected(id)
      /**
       * 段落的稳定 key 在这里生成（而不是在 effect 里跟着段落数变）：点选是
       * 一个**动作**，动作里改 state 是正常的数据流；用 effect 同步派生 state
       * 反而会多一次渲染，并且要处理「该不该重置」的边界。
       */
      const slide = view?.slides()[active]
      const el = slide ? editableElements(slide).find((e) => e.id === id) : undefined
      const count = el ? (textOfElement(el)?.paragraphs.length ?? 0) : 0
      setParagraphKeys(Array.from({ length: count }, () => crypto.randomUUID()))
    },
    [view, active],
  )

  /** 当前 SVG（空串 = 还没渲染出来）。用它当 effect 的依赖，见下面的描边 */
  const svg = rendered?.svg ?? ''

  /**
   * 把选中与查找命中画出来。
   *
   * 直接改 DOM：SVG 是字符串注入的（React 拿不到那些节点的引用），而
   * `editors.css` 里那条 `[data-element-id]` 规则本就是给这件事准备的
   * （在此之前它一直是死代码——选中了画布上没有任何反馈）。
   *
   * 两个来源两种颜色：选中是品牌蓝（CSS 里那个 `--me-accent`），查找命中是
   * 琥珀色（内联覆盖颜色）。同一个元素既是选中又是命中时琥珀色赢——那正是
   * 「刚跳过来的那一个」。依赖里有 `svg`：SVG 一换，React 会把整段 innerHTML
   * 换掉，描边要重画（不然一次编辑之后高亮就没了）。
   */
  useEffect(() => {
    const root = canvasRef.current
    if (root === null || svg === '') return
    const marked: SVGElement[] = []
    const mark = (id: string | null, color: string | null) => {
      if (id === null) return
      const node = elementNode(root, id)
      if (node === null) return
      node.classList.add(MARKED_CLASS)
      const styled = node as SVGElement
      if (color !== null) styled.style.outlineColor = color
      marked.push(styled)
    }
    mark(selected, null)
    if (findMark !== null && findMark.slideIndex === active)
      mark(findMark.elementId, FIND_MARK_COLOR)
    return () => {
      for (const node of marked) {
        node.classList.remove(MARKED_CLASS)
        node.style.outlineColor = ''
      }
    }
  }, [svg, selected, findMark, active])

  /**
   * 把当前命中的元素滚进视野。
   *
   * 依赖里**没有** `svg`：跟着渲染走的话，在段落输入框里敲一个字就会把画布滚
   * 回命中处——编辑时的滚动位置是用户的。换页会改 `active`，所以翻过去之后
   * 照样滚得到。
   */
  useEffect(() => {
    if (findMark === null || findMark.slideIndex !== active) return
    const root = canvasRef.current
    if (root === null) return
    const node = elementNode(root, findMark.elementId)
    // scrollIntoView 是 Element 的方法；测试用的 DOM 环境里可能没有
    if (node !== null && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'center' })
    }
  }, [findMark, active])

  const save = async () => {
    if (!session) return
    const bytes = await session.save()
    const ok = await source.save(bytes, { name: 'slides.pptx', mime: OFFICE_MIME.pptx })
    if (!ok) return
    /**
     * **保存成功后必须 commit**：把新 XML 烧回元素锚点。不做的话第二次编辑
     * 会拿旧锚点拼字节，第一次的改动被静默回滚（保存本身还是成功）。
     */
    session.commit()
    // commit 之后模型与刚写出的字节对齐了，取一份新快照（同时丢掉 edited）
    setEdited({ source: source.bytes!, view: session.view() })
    setDirty(false)
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

  if (!session || !view || !rendered) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>读取中…</ToolbarLabel>}>
        <EditorState>正在解析幻灯片…</EditorState>
      </EditorShell>
    )
  }

  const status = statusText({
    handle: source,
    dirty,
    idle: `第 ${active + 1} / ${slideCount} 页`,
  })

  /* ── 格式工具条要读的当前值（都在 `editable` / `view` 上现算，不缓存） ── */

  /** 这个元素里有没有可改格式的文字（软换行哨兵不算） */
  const hasRuns = formatRuns.length > 0
  const everyRun = (test: (run: TextRun) => boolean) => hasRuns && formatRuns.every(test)

  const boldOn = everyRun((run) => run.bold === true)
  const italicOn = everyRun((run) => run.italic === true)
  const underlineOn = everyRun((run) => run.underline === true)
  const strikeOn = everyRun((run) => run.strike === true)
  const superscriptOn = everyRun((run) => (run.baseline ?? 0) > 0)
  const subscriptOn = everyRun((run) => (run.baseline ?? 0) < 0)

  /** 字号/字体/颜色：所有 run 一致时才是「当前值」，否则 null（不冒充第一档） */
  const uniformSize = uniformOf(formatRuns, (run) => run.fontSize)
  const uniformFont = uniformOf(formatRuns, (run) => run.fontFamily)
  const uniformColor = uniformOf(formatRuns, (run) => hex6(run.color) ?? undefined)
  /** 当前色不在调色板里时把它摆在第一档：否则触发器会画成「没设置」（那是假话） */
  const colorOptions: readonly ToolbarColorOption[] =
    uniformColor === null || TEXT_COLORS.some((option) => option.value === uniformColor)
      ? TEXT_COLORS
      : [
          { value: uniformColor, label: `当前颜色 ${uniformColor}`, swatch: uniformColor },
          ...TEXT_COLORS,
        ]

  /** 字体下拉的选项：这份文稿真正用过的字体在前，常见字体兜底 */
  const fontOptions: readonly ToolbarSelectOption<string>[] = (() => {
    const used = new Set<string>()
    for (const slide of view.slides()) {
      for (const element of editableElements(slide)) {
        for (const paragraph of textOfElement(element)?.paragraphs ?? []) {
          for (const run of paragraph.runs) {
            if (run.fontFamily) used.add(run.fontFamily)
          }
        }
      }
    }
    const inDeck = [...used].toSorted((a, b) => a.localeCompare(b))
    return [...inDeck, ...COMMON_FONTS.filter((name) => !used.has(name))].map((name) => ({
      value: name,
      label: name,
    }))
  })()

  /**
   * 禁用原因。**两个原因各不相同，不能合成一句「不可用」**——一个灰着的按钮
   * 加一句含糊的原因是让人猜。
   */
  const formatReason =
    selected === null ? '先在画布上点一个文字框或形状' : hasRuns ? undefined : '这个元素里没有文字'

  /** 增大/减小字号要**每条 run** 都读得到具体值（继承来的也算解析得出；读不到就禁用） */
  const canStepSize = hasRuns && formatRuns.every((run) => Number.isFinite(run.fontSize))
  const sizeStepReason =
    formatReason ?? (canStepSize ? undefined : '有文字的字号取不到具体值，只能先用字号框设一个')

  const stepSize = (delta: number) => {
    applyFormat((run) => ({
      fontSize: Math.max(MIN_FONT_SIZE_PT, (run.fontSize ?? MIN_FONT_SIZE_PT) + delta),
    }))
  }

  /** 打开/关掉查找栏。关的时候连高亮一起撤——留一条描边配「没有在查找」是假话 */
  const toggleFind = () => {
    if (findOpen) {
      setFindOpen(false)
      setFindMark(null)
      return
    }
    setFindOpen(true)
  }

  return (
    <EditorShell
      flush={flush}
      toolbar={
        <>
          {/*
            格式按钮**常驻**（禁用而不是消失）：工具条的样子固定下来，「现在为什么
            不能点」由 disabledReason 说。下拉与输入框做不到禁用（`ToolbarSelect` /
            `ToolbarNumberField` 的契约里没有 disabled），所以没有目标时它们换成一行
            说明——那是一句为什么，不是一个假控件。
          */}
          <ToolbarGroup label="整段字形">
            <ToolbarButton
              label="加粗（整段）"
              active={boldOn}
              disabled={formatReason !== undefined}
              disabledReason={formatReason}
              onClick={() => applyFormat({ bold: !boldOn })}
            >
              <BoldIcon />
            </ToolbarButton>
            <ToolbarButton
              label="倾斜（整段）"
              active={italicOn}
              disabled={formatReason !== undefined}
              disabledReason={formatReason}
              onClick={() => applyFormat({ italic: !italicOn })}
            >
              <ItalicIcon />
            </ToolbarButton>
            <ToolbarButton
              label="下划线（整段）"
              active={underlineOn}
              disabled={formatReason !== undefined}
              disabledReason={formatReason}
              onClick={() => applyFormat({ underline: !underlineOn })}
            >
              <UnderlineIcon />
            </ToolbarButton>
            <ToolbarButton
              label="删除线（整段）"
              active={strikeOn}
              disabled={formatReason !== undefined}
              disabledReason={formatReason}
              onClick={() => applyFormat({ strike: !strikeOn })}
            >
              <StrikeIcon />
            </ToolbarButton>
          </ToolbarGroup>

          <ToolbarGroup label="上标与下标">
            <ToolbarButton
              label="上标（整段）"
              active={superscriptOn}
              disabled={formatReason !== undefined}
              disabledReason={formatReason}
              onClick={() => applyFormat({ baseline: superscriptOn ? 0 : SUPERSCRIPT_BASELINE })}
            >
              <SuperscriptIcon />
            </ToolbarButton>
            <ToolbarButton
              label="下标（整段）"
              active={subscriptOn}
              disabled={formatReason !== undefined}
              disabledReason={formatReason}
              onClick={() => applyFormat({ baseline: subscriptOn ? 0 : SUBSCRIPT_BASELINE })}
            >
              <SubscriptIcon />
            </ToolbarButton>
          </ToolbarGroup>

          {/*
            清除字形。**不叫「清除所有格式」**：字号、字体、颜色没有「回到继承」
            这个表达（把 sz/solidFill 删掉又要保住主题链接，本版做不到），所以它
            只清这五项。名字里就把这五项列出来，免得点的人和写的人理解不同。
          */}
          <ToolbarButton
            label="清除字形（加粗、倾斜、下划线、删除线、上下标；不动字号、字体与颜色）"
            disabled={formatReason !== undefined}
            disabledReason={formatReason}
            onClick={() =>
              applyFormat({
                bold: false,
                italic: false,
                underline: false,
                strike: false,
                baseline: 0,
              })
            }
          >
            <ClearFormatIcon />
          </ToolbarButton>

          <ToolbarDivider />

          {hasRuns ? (
            <>
              <ToolbarGroup label="字号">
                {uniformSize !== null ? (
                  <ToolbarNumberField
                    label="字号（pt，整段）"
                    value={uniformSize}
                    min={MIN_FONT_SIZE_PT}
                    max={MAX_FONT_SIZE_PT}
                    suffix="pt"
                    /*
                      与当前值相同时一个字节都不写：工具条自己先比一次（值没变就不
                      提交），`applyEditParagraphs` 里还会再比一次（`edit-text.ts`
                      的 `r.fontSize !== oldRun.fontSize` 才清继承标记）。
                    */
                    onCommit={(next) => applyFormat({ fontSize: next })}
                  />
                ) : (
                  // 多档字号时不显示一个数字：那个数字不是文档里的值
                  <ToolbarLabel>多档字号</ToolbarLabel>
                )}
                {/*
                  增大 / 减小字号用 **A+ / A− 这两个文字标签**，不画 SVG 图标：
                  这一对按钮的意思就是「比现在大一号的字」，字母 A 正是那个意思，
                  而 icons.tsx 里没有、也不该为此造一个形状含义更弱的图标。
                  这两个字的字号**不来自 antd 的按钮字号 token**：`children` 被
                  `ToolbarButton` 包进 `.me-btn__icon`（那是图标字号槽，
                  `--me-icon-size` = 13.5px），所以渲染出来略小于相邻按钮的文字
                  （antd small 档是 14px）。视觉上无害，但机制是这一条——别按
                  「它走 antd 字号」去推别的控件。
                */}
                <ToolbarButton
                  label={`增大字号 ${SIZE_STEP_PT}pt（整段）`}
                  disabled={!canStepSize}
                  disabledReason={sizeStepReason}
                  onClick={() => stepSize(SIZE_STEP_PT)}
                >
                  A+
                </ToolbarButton>
                <ToolbarButton
                  label={`减小字号 ${SIZE_STEP_PT}pt（整段）`}
                  disabled={!canStepSize}
                  disabledReason={sizeStepReason}
                  onClick={() => stepSize(-SIZE_STEP_PT)}
                >
                  A-
                </ToolbarButton>
              </ToolbarGroup>

              <ToolbarSelect
                label="字体（整段，中英文一起换）"
                value={uniformFont}
                options={fontOptions}
                fallbackLabel="多档字体"
                onChange={(family) => applyFormat({ fontFamily: family })}
              />
              {/*
                字体颜色。**不给 onClear**：pptx 的 run 颜色没有「回到继承」的写法
                （写 srgbClr 就断了主题链接），给一个「清除颜色」按钮等于承诺一件
                做不到的事。要恢复原色就改回原来那个颜色——传同一个值不写字节。
              */}
              <ToolbarColorPicker
                label="字体颜色（整段）"
                value={uniformColor}
                options={colorOptions}
                onPick={(color) => applyFormat({ color })}
              />
            </>
          ) : (
            <ToolbarLabel>{formatReason ?? '字号、字体与颜色只作用于选中的文本框'}</ToolbarLabel>
          )}

          <ToolbarDivider />

          <ToolbarButton label="查找和替换" active={findOpen} onClick={toggleFind}>
            <FindIcon />
          </ToolbarButton>
        </>
      }
      toolbarActions={
        <ToolbarButton
          label={source.saving ? '保存中…' : '保存到库'}
          primary
          disabled={!dirty || source.saving}
          /*
              禁用必须给原因（DESIGN §8.4）。`disabled` 的判据是两件事（没改动 /
              正在保存），它们各有各的说法：不区分的话「保存」灰着时用户只能猜
              是没改还是正在写。不给这一条时 `ToolbarButton` 把 `title` 留在
              按钮名上（`title === aria-label === "保存到库"`），等于什么都没说。
            */
          disabledReason={source.saving ? '正在保存…' : '没有未保存的改动'}
          onClick={() => void save()}
        >
          <SaveIcon />
        </ToolbarButton>
      }
      /*
        次工具条：幻灯片导航 + 查找栏。

        **导航挪到这里**（原先在工具条上）：页签的数量跟着页数长，30 页的演示
        文稿会把工具条挤成好几行；而次工具条是真正吸顶的那一层，`.me-tabs` 自己
        横滚（`overflow-x: auto` 让它的自动最小宽度是 0），窄窗口下也不会撑破外壳。
      */
      subbar={
        <>
          <ToolbarGroup label="翻页">
            <ToolbarButton
              label="上一页"
              disabled={active === 0}
              disabledReason="已经是第一页"
              onClick={() => goTo(active - 1)}
            >
              <ChevronLeftIcon />
            </ToolbarButton>
            <ToolbarButton
              label="下一页"
              disabled={active >= slideCount - 1}
              disabledReason="已经是最后一页"
              onClick={() => goTo(active + 1)}
            >
              <ChevronRightIcon />
            </ToolbarButton>
            {/* 跳到第 N 页：取值是 1..页数，页数打开文件才知道，所以是输入框不是下拉 */}
            <ToolbarNumberField
              label="跳到第几页"
              value={active + 1}
              min={1}
              max={slideCount}
              suffix="页"
              onCommit={(next) => goTo(next - 1)}
            />
          </ToolbarGroup>

          {slideCount > 1 && (
            <ToolbarTabs
              label="幻灯片"
              value={active}
              onChange={goTo}
              items={Array.from({ length: slideCount }, (_, i) => ({
                value: i,
                label: `${i + 1}`,
              }))}
            />
          )}

          {/*
            隐藏标记：`<p:sld show="0">` 的页面在放映时被跳过（`renderSlide` 的
            `hidden`）。**只显示不切换**——隐藏与否是这份文件在放映时的行为，
            改它要写幻灯片自己的 show 属性，而我们的保存只打补丁、不改结构。
          */}
          {rendered.hidden && (
            <ToolbarLabel>
              <EyeIcon /> 这一页在放映时隐藏（只读标记）
            </ToolbarLabel>
          )}

          {findOpen && (
            <FindReplaceBar
              adapter={findAdapter}
              query={findQuery}
              onQueryChange={setFindQuery}
              options={findOptions}
              onOptionsChange={setFindOptions}
              onClose={toggleFind}
            />
          )}
        </>
      }
      footer={
        selected && paragraphs ? (
          <div className="mimir-paras">
            <div className="mimir-paras__head">
              <ToolbarLabel>编辑这一段文字（每行一段）</ToolbarLabel>
              <ToolbarSpacer />
              <ToolbarLabel>
                项目符号与行距沿用原来的；工具条上的格式作用在整个文本框（按段生效）
              </ToolbarLabel>
            </div>
            <div className="mimir-paras__list">
              {paragraphs.map((text, index) => (
                /*
                  走外壳的 `ToolbarTextArea`（antd `Input.TextArea`），不再自绘：
                  上一版这里是裸 `<textarea className="mimir-paras__item">`，那一套
                  自写的高度（26px，比工具条控件矮一档）、字号（正文档 13px 而非
                  工具条控件的 12px）与焦点环就是「同一排三种高度 / 三种焦点环」
                  的来源，只是它一个人占了三种。**必须仍是 textarea**：段落里可能
                  有软换行（`<a:br/>` 在模型里是一条 `text === '\n'` 的 run），
                  单行 `Input` 会在值消毒时把 `\n` 静默删掉。
                */
                <ToolbarTextArea
                  key={paragraphKeys[index] ?? `pending-${index}`}
                  label={`第 ${index + 1} 段`}
                  rows={1}
                  value={text}
                  placeholder={`第 ${index + 1} 段`}
                  onChange={(next) => setParagraph(index, next)}
                />
              ))}
            </div>
          </div>
        ) : (
          <ToolbarLabel>
            点画布上的文字框或形状来改它的字
            {editable.length === 0 && '——这一页没有可编辑的文字'}
          </ToolbarLabel>
        )
      }
      status={
        <>
          <ToolbarLabel>{status}</ToolbarLabel>
          {/*
            缺几何的文本框如实说明（DESIGN §0.2）。**这一条不是可选的**：那些
            框是按幻灯片比例补出来的（`pptx-render.ts` 的 `withFallbackGeometry`），
            用户看到的版式不是文件里的版式——不说的话他会以为这就是原件的样子，
            然后在 PowerPoint 里发现位置完全不同。短句，理由与下面那条相同。
          */}
          {rendered.geometryFilled > 0 && (
            <ToolbarLabel>
              {rendered.geometryFilled} 个文本框在文件里没有几何，按默认框渲染
            </ToolbarLabel>
          )}
          {/*
            这条文字**必须短**：`.me-label` 是 `white-space: nowrap`，而状态行
            虽然 `flex-wrap`，一个不换行的 label 自身就是宽度下限——太长会把整
            个外壳的 min-content 撑过窄窗口（实测 560px 下 598px 的文字让
            `.mimir-editor` 变成 620 宽、页面出现横向滚动）。所以这里只说最该说
            的一句，「动画与 SmartArt 不显示」是能力边界，格式的粒度写在工具条
            的 label 与附属面板上。
          */}
          <ToolbarLabel>
            格式按整个文本框生效（按段）；字体用系统里装的，动画与 SmartArt 不显示
          </ToolbarLabel>
        </>
      }
    >
      <div className="me-scroll mimir-pptx-stage">
        {/*
          ## 白名单：本文件里**唯一**可点而不经过原语元素的元素

          工具条上的交互元素一律走外壳的 antd 原语（D-064）。这里是一个
          **显式列出来**的例外，不是漏网：

            - 它是**画布**，不是控件。被点中的目标不是这个 `div`，而是它里面
              那些 `<text>` / `<rect>`（点选靠 `closest('[data-element-id]')`
              的事件代理，见 `onClickCanvas`）
            - 那些目标是**字符串注入**的 SVG 节点（`dangerouslySetInnerHTML`，
              见下面那段注释），不是 React 元素——给它们挂 `onClick` 要先把它
              重写成 React 树，而那会让「渲染器是纯函数、产物能存成 .svg」这
              条设计作废
            - 换成 `ToolbarButton` 也没有意义：一个按钮只能有一个动作，而这里
              的动作随**点在哪**而变

          **它的代价要如实记着**：键盘用户目前没有「在画布上选一个文字框」的
          路径（`div` 不可聚焦，SVG 里的节点也没有 `tabIndex`）。所以键盘路径
          是附属面板的那排段落输入框（先用鼠标选一次元素，之后改字全在键盘上）。
          要补上键盘选元素，得给画布自己做一层「元素列表 + 方向键」，那是新
          功能，不是这次迁移的范围。
        */}
        <div
          ref={canvasRef}
          className="mimir-pptx-slide"
          onClick={onClickCanvas}
          /*
            注入渲染好的 SVG。**为什么用 dangerouslySetInnerHTML 而不是 React
            元素**：渲染器是纯函数（绘制列表 → 字符串），产物要能脱离 React
            单独用（存成 .svg、在测试里比对字符串、将来做导出）。重写成 React
            组件会让那几处各写一份。字符串来自我们自己的渲染器、内容是转义过的
            XML（`pptx-svg.ts` 有转义与可解析性测试），不是用户可控的 HTML。
            **点选靠 data-element-id 属性**——渲染器给每个元素节点写了它。
          */
          dangerouslySetInnerHTML={{ __html: rendered.svg }}
        />
      </div>
    </EditorShell>
  )
}
