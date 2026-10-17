import type { XlsxPasteMode } from '@mimir/shared'
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5'
import {
  parseRange,
  formatAddress,
} from '../vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import type { XlsxSheet } from './xlsx.js'
import type { XlsxAgentHandle } from './agent/xlsx-agent.js'
import { parseXlsxDelimited } from './xlsx-delimited.js'

export type ClipboardPayload = { plain: string; html: string; delimiter?: ',' | '\t' }
export type ClipboardContext = {
  documentId: string
  handle: XlsxAgentHandle
  sheet: XlsxSheet
  range: string
  version: number
  blocked?: string
}
export type RangeCapture = ClipboardPayload & {
  id: string
  documentId: string
  handle: XlsxAgentHandle
  version: number
  bytes: Uint8Array
  sheetId: string
  sheetName: string
  range: string
  kind: 'copy' | 'cut'
}
export type ClipboardState = {
  capture: RangeCapture | null
  payload: ClipboardPayload | null
  stale: boolean
  busy: boolean
  message: string
  error: string
  mode: XlsxPasteMode
}
const LIMIT = 1024 * 1024
const MARKER = 'data-mimir-xlsx-copy-id'
const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
const quote = (value: string) =>
  /[\t\r\n"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
function bounded(value: string) {
  if (new TextEncoder().encode(value).length > LIMIT) throw new Error('剪贴板内容超过1MiB')
}
export function clipboardBounds(range: string) {
  if (!range) throw new Error('先选择范围')
  const b = parseRange(range)
  if (
    (b.endRow - b.startRow + 1) * (b.endColumn - b.startColumn + 1) > 2000 ||
    b.endRow >= 1048576 ||
    b.endColumn >= 16384
  )
    throw new Error('范围超出2000格或工作表边界')
  return b
}
/** Display interoperability only. Native cells are always read by the raw-XML host. */
export function serializeRange(sheet: XlsxSheet, range: string, id: string): ClipboardPayload {
  const b = clipboardBounds(range),
    plainRows: string[] = [],
    htmlRows: string[] = []
  for (let r = b.startRow; r <= b.endRow; r++) {
    const row = sheet.rows.find((item) => item.number === r + 1),
      plain: string[] = [],
      html: string[] = []
    for (let c = b.startColumn; c <= b.endColumn; c++) {
      const cell = row?.cells.find((item) => item.col === c),
        text = cell?.boolean
          ? cell.text.toLowerCase() === 'false'
            ? 'FALSE'
            : 'TRUE'
          : (cell?.text ?? '')
      const f = cell?.format,
        css: string[] = []
      if (f?.bold) css.push('font-weight:bold')
      if (f?.italic) css.push('font-style:italic')
      if (f?.underline) css.push('text-decoration:underline')
      if (f?.fontSize) css.push(`font-size:${f.fontSize}pt`)
      if (f?.fontColor) css.push(`color:${f.fontColor}`)
      if (f?.fillColor) css.push(`background-color:${f.fillColor}`)
      if (f?.horizontalAlign) css.push(`text-align:${f.horizontalAlign}`)
      if (f?.verticalAlign)
        css.push(`vertical-align:${f.verticalAlign === 'center' ? 'middle' : f.verticalAlign}`)
      if (f?.wrapText) css.push('white-space:pre-wrap')
      plain.push(quote(text))
      html.push(
        `<td${css.length ? ` style="${escape(css.join(';'))}"` : ''}>${escape(text).replace(/\r\n|\r|\n/g, '<br>')}</td>`,
      )
    }
    plainRows.push(plain.join('\t'))
    htmlRows.push(`<tr>${html.join('')}</tr>`)
  }
  const payload = {
    plain: plainRows.join('\r\n'),
    html: `<table ${MARKER}="${escape(id)}" data-mimir-xlsx-version="1"><tbody>${htmlRows.join('')}</tbody></table>`,
  }
  bounded(payload.plain)
  bounded(payload.html)
  return payload
}

type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']
const children = (node: Node): Node[] => ('childNodes' in node ? node.childNodes : [])
const tag = (node: Node) => ('tagName' in node ? node.tagName : '')
const attr = (node: Element, key: string) => node.attrs.find((a) => a.name === key)?.value
function walk(node: Node, depth = 0, count = { n: 0 }): Node[] {
  if (depth > 24 || ++count.n > 15000) throw new Error('HTML表格结构超过预算')
  return [node, ...children(node).flatMap((child) => walk(child, depth + 1, count))]
}
export function clipboardMarker(html: string): string | null {
  bounded(html)
  if (!html) return null
  const nodes = walk(parseFragment(html))
  const markers = nodes.filter((n) => 'attrs' in n && attr(n, MARKER) !== undefined) as Element[]
  if (markers.length > 1) throw new Error('剪贴板含多个内部范围标记，请重新复制')
  if (markers.length && !attr(markers[0]!, MARKER)) throw new Error('内部范围标记无效，请重新复制')
  return markers.length ? attr(markers[0]!, MARKER)! : null
}
function htmlTable(html: string, valuesOnly: boolean) {
  bounded(html)
  const nodes = walk(parseFragment(html)),
    tables = nodes.filter((n) => tag(n) === 'table')
  if (tables.length !== 1) throw new Error('只支持一个普通HTML表格；可选择仅粘贴显示值')
  if (
    !valuesOnly &&
    nodes.some(
      (node) =>
        'attrs' in node &&
        !['td', 'th'].includes(tag(node)) &&
        node.attrs.some((a) => ![MARKER, 'data-mimir-xlsx-version'].includes(a.name)),
    )
  )
    throw new Error('HTML含行列或样式表格式，尚不支持；可选择仅粘贴显示值')
  if (!valuesOnly && nodes.some((node) => ['style', 'script'].includes(tag(node))))
    throw new Error('HTML含样式表或脚本，尚不支持；可选择仅粘贴显示值')
  const rows = walk(tables[0]!).filter((n) => tag(n) === 'tr')
  if (!rows.length || rows.length > 500) throw new Error('HTML表格行数无效或超过500行')
  const values: string[][] = [],
    formats: Record<string, unknown>[][] = []
  for (const row of rows) {
    const cells = children(row).filter((n) => ['td', 'th'].includes(tag(n))) as Element[]
    if (!cells.length || cells.length > 100) throw new Error('HTML表格列数无效或超过100列')
    const rowValues: string[] = [],
      rowFormats: Record<string, unknown>[] = []
    for (const cell of cells) {
      if (Number(attr(cell, 'rowspan') ?? 1) !== 1 || Number(attr(cell, 'colspan') ?? 1) !== 1)
        throw new Error('合并单元格HTML尚不支持，请复制普通矩形范围')
      const descendants = walk(cell)
      if (
        descendants.some((n) =>
          ['table', 'script', 'style', 'img', 'svg', 'iframe', 'object', 'a'].includes(tag(n)),
        )
      )
        throw new Error('HTML含链接、图片或嵌套内容，请使用纯文本粘贴')
      if (!valuesOnly && descendants.some((n) => tag(n) && !['td', 'th', 'br'].includes(tag(n))))
        throw new Error('HTML富文本尚不支持；可选择仅粘贴显示值')
      const format: Record<string, unknown> = {}
      if (!valuesOnly) {
        if (cell.attrs.some((a) => !['style', 'rowspan', 'colspan'].includes(a.name)))
          throw new Error('HTML含尚不支持的格式属性；可选择仅粘贴显示值')
        for (const declaration of (attr(cell, 'style') ?? '').split(';').filter((s) => s.trim())) {
          const colon = declaration.indexOf(':'),
            key = declaration.slice(0, colon).trim().toLowerCase(),
            value = declaration.slice(colon + 1).trim()
          if (key === 'font-weight' && /^(bold|normal|[1-9]00)$/.test(value))
            format.bold = value === 'bold' || Number(value) >= 600
          else if (key === 'font-style' && /^(italic|normal)$/.test(value))
            format.italic = value === 'italic'
          else if (key === 'text-decoration' && /^(underline|none)$/.test(value))
            format.underline = value === 'underline'
          else if (key === 'font-size' && /^(\d+(?:\.\d+)?)(pt|px)$/.test(value)) {
            const size = Number.parseFloat(value) * (value.endsWith('px') ? 0.75 : 1)
            if (size < 1 || size > 409) throw new Error('HTML字号超出范围')
            format.fontSize = size
          } else if (['color', 'background-color'].includes(key) && /^#[\da-f]{6}$/i.test(value))
            format[key === 'color' ? 'fontColor' : 'fillColor'] = value
          else if (key === 'text-align' && ['left', 'center', 'right'].includes(value))
            format.horizontalAlign = value
          else if (key === 'vertical-align' && ['top', 'middle', 'bottom'].includes(value))
            format.verticalAlign = value === 'middle' ? 'center' : value
          else if (key === 'white-space' && ['normal', 'pre-wrap'].includes(value))
            format.wrapText = value === 'pre-wrap'
          else throw new Error(`HTML格式“${key || declaration}”尚不支持；可选择仅粘贴显示值`)
        }
      }
      const text = (node: Node): string =>
        node.nodeName === '#text'
          ? 'value' in node
            ? node.value
            : ''
          : tag(node) === 'br'
            ? '\n'
            : children(node).map(text).join('')
      rowValues.push(text(cell))
      rowFormats.push(format)
    }
    values.push(rowValues)
    formats.push(rowFormats)
  }
  const width = Math.max(...values.map((row) => row.length))
  if (width * values.length > 2000) throw new Error('HTML表格超过2000格')
  return {
    values: values.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? '')),
    formats,
  }
}
/** HTML text is literal, including leading '=', numbers and leading zeroes. */
export function externalClipboardOperations(
  payload: ClipboardPayload,
  sheetId: string,
  target: string,
  valuesOnly = false,
): Record<string, unknown>[] {
  const b = clipboardBounds(target),
    anchor = formatAddress(b.startRow, b.startColumn)
  const html = payload.html ? htmlTable(payload.html, valuesOnly) : null
  const values = html?.values ?? parseXlsxDelimited(payload.plain, payload.delimiter)
  if (b.startRow + values.length > 1048576 || b.startColumn + (values[0]?.length ?? 0) > 16384)
    throw new Error('粘贴目标超出工作表边界')
  const ops: Record<string, unknown>[] = [
    {
      op: 'set_range',
      sheetId,
      start: anchor,
      values: values.map((row) =>
        row.map((value) =>
          html && typeof value === 'string' && value.startsWith('=') ? null : value,
        ),
      ),
    },
  ]
  if (html)
    for (let r = 0; r < values.length; r++)
      for (let c = 0; c < values[r]!.length; c++) {
        const address = formatAddress(b.startRow + r, b.startColumn + c),
          value = values[r]![c]
        if (typeof value === 'string' && value.startsWith('='))
          ops.push({ op: 'set_cell', sheetId, address, value })
        const format = html.formats[r]?.[c]
        if (format && Object.keys(format).length)
          ops.push({ op: 'format_range', sheetId, range: address, format })
      }
  if (ops.length > 50) throw new Error('HTML格式超过单次50项预算；请缩小范围或选择仅粘贴显示值')
  return ops
}
export async function writeSystemClipboard(payload: ClipboardPayload) {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([payload.plain], { type: 'text/plain' }),
        'text/html': new Blob([payload.html], { type: 'text/html' }),
      }),
    ])
    return true
  }
  if (!navigator.clipboard?.writeText)
    throw new Error('当前环境不能写系统剪贴板，可使用工作簿内粘贴')
  await navigator.clipboard.writeText(payload.plain)
  return false
}
export async function readSystemClipboard(): Promise<ClipboardPayload> {
  if (navigator.clipboard?.read) {
    const items = await navigator.clipboard.read()
    const item = items.find((i) => i.types.includes('text/html') || i.types.includes('text/plain'))
    if (!item) throw new Error('系统剪贴板没有表格或文本')
    return {
      plain: item.types.includes('text/plain')
        ? await (await item.getType('text/plain')).text()
        : '',
      html: item.types.includes('text/html') ? await (await item.getType('text/html')).text() : '',
    }
  }
  if (!navigator.clipboard?.readText)
    throw new Error('当前环境不能读取系统剪贴板，请在网格按Ctrl/Cmd+V或粘贴到文本框')
  return { plain: await navigator.clipboard.readText(), html: '' }
}
function validateContext(context: ClipboardContext, writing = false) {
  if (context.blocked) throw new Error(context.blocked)
  if (
    context.handle.documentId !== context.documentId ||
    context.handle.getVersion() !== context.version
  )
    throw new Error('工作簿已更新，请重新选择范围')
  clipboardBounds(context.range)
  if (writing && context.sheet.extras?.protected) throw new Error('目标工作表已保护')
}

const initial: ClipboardState = {
  capture: null,
  payload: null,
  stale: false,
  busy: false,
  message: '',
  error: '',
  mode: 'all',
}
export function createXlsxClipboard() {
  let state = initial,
    scope = '',
    documentKey = '',
    lastVersion = 0,
    sourceKey: unknown,
    pendingWriting = false,
    pending: AbortController | null = null
  const listeners = new Set<() => void>()
  const update = (next: Partial<ClipboardState>) => {
    state = { ...state, ...next }
    listeners.forEach((listener) => listener())
  }
  const perform = async (
    context: ClipboardContext,
    operation: (signal: AbortSignal) => Promise<void>,
    writing = false,
  ) => {
    if (pending) return
    const controller = new AbortController()
    pending = controller
    pendingWriting = writing
    update({ busy: true, error: '' })
    try {
      validateContext(context)
      await operation(controller.signal)
    } catch (error) {
      if (!controller.signal.aborted)
        update({ error: error instanceof Error ? error.message : '剪贴板操作失败' })
    } finally {
      if (pending === controller) {
        pending = null
        update({ busy: false })
      }
    }
  }
  const arm = (context: ClipboardContext, kind: 'copy' | 'cut') => {
    validateContext(context)
    if (kind === 'cut' && context.sheet.extras?.protected) throw new Error('剪切源工作表已保护')
    const id = crypto.randomUUID(),
      payload = serializeRange(context.sheet, context.range, id)
    update({
      capture: {
        ...payload,
        id,
        documentId: context.documentId,
        handle: context.handle,
        version: context.version,
        bytes: context.handle.currentBytes(),
        sheetId: context.sheet.id,
        sheetName: context.sheet.name,
        range: context.range,
        kind,
      },
      stale: false,
      payload: null,
      error: '',
      message:
        kind === 'cut'
          ? '已记下剪切源；粘贴成功后才移动。系统HTML仅含网格已解析的基础格式'
          : '已记下复制源；选择目标后粘贴。系统HTML仅含网格已解析的基础格式',
    })
    return payload
  }
  const apply = async (
    context: ClipboardContext,
    payload: ClipboardPayload | null,
    valuesOnly = false,
  ) =>
    perform(
      context,
      async (signal) => {
        validateContext(context, true)
        if (payload) update({ payload })
        const marker = payload?.html ? clipboardMarker(payload.html) : null
        const capture = state.capture
        let operations: Record<string, unknown>[]
        if (!payload || marker) {
          if (valuesOnly) {
            if (!payload) throw new Error('没有可粘贴的显示值')
            operations = externalClipboardOperations(payload, context.sheet.id, context.range, true)
          } else {
            if (
              !capture ||
              state.stale ||
              capture.documentId !== context.documentId ||
              capture.handle !== context.handle ||
              capture.version !== context.version ||
              (marker && marker !== capture.id)
            )
              throw new Error('内部复制范围已失效，请重新复制')
            const target = clipboardBounds(context.range),
              source = clipboardBounds(capture.range)
            const height = source.endRow - source.startRow + 1,
              width = source.endColumn - source.startColumn + 1
            const single =
              target.startRow === target.endRow && target.startColumn === target.endColumn
            const targetHeight = single ? height : target.endRow - target.startRow + 1,
              targetWidth = single ? width : target.endColumn - target.startColumn + 1
            if (targetHeight % height || targetWidth % width)
              throw new Error('目标行列数须分别为源范围的整数倍')
            if (
              target.startRow + targetHeight > 1048576 ||
              target.startColumn + targetWidth > 16384 ||
              targetHeight * targetWidth > 2000
            )
              throw new Error('展开后的目标超出2000格或工作表边界')
            if (capture.kind === 'cut' && (targetHeight !== height || targetWidth !== width))
              throw new Error('剪切目标须为单格或与源相同大小')
            if (capture.kind === 'cut' && state.mode !== 'all')
              throw new Error('剪切内容只支持全部粘贴；请先复制以使用选择性粘贴')
            operations = [
              {
                op: 'paste_range',
                sheetId: context.sheet.id,
                sourceSheetId: capture.sheetId,
                source: capture.range,
                target: context.range,
                kind: capture.kind,
                mode: state.mode,
              },
            ]
          }
        } else {
          if (!['all', 'value'].includes(state.mode))
            throw new Error('此粘贴方式需要工作簿内原生范围，请先复制')
          operations = externalClipboardOperations(
            payload,
            context.sheet.id,
            context.range,
            valuesOnly || state.mode === 'value',
          )
        }
        await context.handle.execute(
          'propose_operations',
          { operations },
          { expectedVersion: context.version, signal },
        )
        if (signal.aborted) return
        update({
          capture: null,
          stale: false,
          payload: null,
          error: '',
          message: '已粘贴；如需再次粘贴原范围，请重新复制',
        })
      },
      true,
    )
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => state,
    selectInternal: () => {
      if (!state.busy) update({ payload: null, error: '' })
    },
    setMode: (mode: XlsxPasteMode) => {
      if (state.busy) return
      if (!['all', 'value', 'formula', 'format', 'column-width', 'besides-border'].includes(mode)) {
        update({ error: '未知粘贴方式' })
        return
      }
      update({ mode, error: '' })
    },
    sync: (nextScope: string, nextDocument: string, version: number, nextSource?: unknown) => {
      const changedVersion = lastVersion !== version
      const changedSource = documentKey !== nextDocument || sourceKey !== nextSource
      if (
        changedSource ||
        scope !== nextScope ||
        (changedVersion && (!pending || !pendingWriting))
      ) {
        pending?.abort()
        pending = null
        update({ busy: false, payload: null, message: '', error: '' })
      }
      scope = nextScope
      lastVersion = version
      if (changedSource) {
        sourceKey = nextSource
        documentKey = nextDocument
        update({ ...initial })
      } else if (state.capture && state.capture.version !== version && !state.stale)
        update({ stale: true, message: '工作簿已更新，请重新复制或剪切' })
    },
    cancel: () => {
      pending?.abort()
      pending = null
      update({ ...initial })
    },
    stop: () => {
      pending?.abort()
      pending = null
      update({ busy: false })
    },
    arm,
    copy: async (context: ClipboardContext, kind: 'copy' | 'cut', transfer?: DataTransfer) => {
      if (pending) return
      let payload: ClipboardPayload
      try {
        payload = arm(context, kind)
      } catch (error) {
        update({ error: error instanceof Error ? error.message : '无法复制' })
        return
      }
      if (transfer) {
        try {
          transfer.setData('text/plain', payload.plain)
          transfer.setData('text/html', payload.html)
        } catch (error) {
          update({
            error:
              error instanceof Error ? error.message : '系统剪贴板写入失败；工作簿内范围仍可粘贴',
          })
        }
        return
      }
      await perform(context, async (signal) => {
        const rich = await writeSystemClipboard(payload)
        if (!signal.aborted)
          update({
            message: rich
              ? '已复制HTML基础格式子集与显示值；工作簿内粘贴保留原生内容'
              : '已复制显示值；此环境的系统剪贴板不保留格式，工作簿内粘贴保留原生内容',
          })
      })
    },
    apply,
    read: async (context: ClipboardContext, reader = readSystemClipboard) =>
      perform(context, async (signal) => {
        const payload = await reader()
        bounded(payload.plain)
        bounded(payload.html)
        if (!signal.aborted) update({ payload, message: '已读取系统剪贴板，确认目标后粘贴' })
      }),
    stage: (payload: ClipboardPayload) => {
      // Typing replaces the pending import; late reads or applies must not erase the new draft.
      pending?.abort()
      pending = null
      update({ payload, busy: false, error: '', message: '内容已载入，确认目标后粘贴' })
    },
    error: (error: string) => update({ error }),
  }
}
export type XlsxClipboardController = ReturnType<typeof createXlsxClipboard>
