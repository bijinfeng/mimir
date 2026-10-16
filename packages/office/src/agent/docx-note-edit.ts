import type { NoteInfo, NoteRun } from '../../vendor/packages/docx-engine/src/types.js'

/** Replace one body-text occurrence while retaining the formatting outside it. */
export function replaceNoteText(
  note: NoteInfo,
  find: string,
  replacement: string,
  matchCase: boolean,
): NoteInfo {
  const indexOf = (text: string) =>
    matchCase ? text.indexOf(find) : text.toLocaleLowerCase().indexOf(find.toLocaleLowerCase())
  if (!note.richParas?.length) {
    const at = indexOf(note.text)
    if (at < 0) throw new Error('注释中没有匹配文字')
    return {
      ...note,
      text: note.text.slice(0, at) + replacement + note.text.slice(at + find.length),
    }
  }
  const tokens: { text: string; style: NoteRun | null }[] = []
  note.richParas.forEach((para, index) => {
    if (index) tokens.push({ text: '\n', style: null })
    para.forEach((run) => tokens.push({ text: run.text, style: run }))
  })
  const plain = tokens.map((token) => token.text).join('')
  const at = indexOf(plain)
  if (at < 0) throw new Error('注释中没有匹配文字')
  const end = at + find.length
  const output: typeof tokens = []
  let offset = 0
  let inserted = false
  let preceding: NoteRun = { text: '' }
  for (const token of tokens) {
    const stop = offset + token.text.length
    if (stop <= at || offset >= end) {
      output.push(token)
    } else {
      const prefix = token.text.slice(0, Math.max(0, at - offset))
      if (prefix) output.push({ ...token, text: prefix })
      if (!inserted) {
        output.push({ text: replacement, style: token.style ?? preceding })
        inserted = true
      }
      const suffix = token.text.slice(Math.max(0, end - offset))
      if (suffix) output.push({ ...token, text: suffix })
    }
    if (token.style) preceding = token.style
    offset = stop
  }
  const richParas: NoteRun[][] = [[]]
  for (const token of output) {
    token.text.split('\n').forEach((text, index) => {
      if (index) richParas.push([])
      if (text) richParas.at(-1)!.push({ ...token.style, text })
    })
  }
  return {
    ...note,
    richParas,
    text: richParas.map((para) => para.map((run) => run.text).join('')).join('\n'),
  }
}
