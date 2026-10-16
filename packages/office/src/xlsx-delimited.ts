import { parseXlsxInput } from './xlsx-input.js'
/** Quoted CSV/TSV parser shared by import and clipboard, with bounded rectangular output. */
export function parseXlsxDelimited(
  source: string,
  delimiter: ',' | '\t' = '\t',
): (string | number | boolean)[][] {
  if (new TextEncoder().encode(source).length > 1024 * 1024) throw new Error('导入内容超过1MiB')
  const text = source.replace(/^\uFEFF/, ''),
    rows: string[][] = [],
    row: string[] = []
  let value = '',
    quoted = false,
    closed = false
  const field = () => {
    row.push(value)
    value = ''
    closed = false
    if (row.length > 100) throw new Error('导入最多100列')
  }
  const line = () => {
    field()
    rows.push([...row])
    row.length = 0
    if (rows.length > 500) throw new Error('导入最多500行')
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          value += '"'
          i++
        } else {
          quoted = false
          closed = true
        }
      } else value += ch
      continue
    }
    if (ch === '"' && !value && !closed) quoted = true
    else if (ch === delimiter) field()
    else if (ch === '\r' || ch === '\n') {
      line()
      if (ch === '\r' && text[i + 1] === '\n') i++
    } else {
      if (closed && ch.trim()) throw new Error('引号结束后应为分隔符或换行')
      if (!closed) value += ch
    }
  }
  if (quoted) throw new Error('导入内容中的引号没有闭合')
  if (value || closed || row.length || !rows.length) line()
  const width = Math.max(0, ...rows.map((r) => r.length))
  if (rows.length * width > 2000) throw new Error('单次导入最多2000格')
  return rows.map((r) => Array.from({ length: width }, (_, c) => parseXlsxInput(r[c] ?? '')))
}
