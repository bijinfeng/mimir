import type { PmDocJson } from './docx.js'
import JSZip from 'jszip'
import { BoundedZip } from './zip-bounds.js'

export const FORCED_TRACKING_REASON =
  '强制修订已开启：支持段内文字插入、删除和替换；请先停止编辑限制，再修改结构、格式或接受/拒绝修订'

const revisionKey = (mark: PmDocJson) =>
  JSON.stringify([mark.attrs?.author ?? '', mark.attrs?.date ?? null])

/** Only native top-level plain paragraphs whose complete run syntax is modeled. */
export function nativeTrackedTextParagraph(xml: string | null): boolean {
  if (!xml || !xml.startsWith('<w:p>') || !xml.endsWith('</w:p>')) return false
  const allowed: Record<string, Set<string>> = {
    p: new Set(),
    r: new Set(),
    t: new Set(['xml:space']),
    delText: new Set(['xml:space']),
    ins: new Set(['w:id', 'w:author', 'w:date']),
    del: new Set(['w:id', 'w:author', 'w:date']),
    rPr: new Set(),
    b: new Set(['w:val']),
    bCs: new Set(['w:val']),
    i: new Set(['w:val']),
    iCs: new Set(['w:val']),
    u: new Set(['w:val']),
    strike: new Set(['w:val']),
    color: new Set(['w:val']),
    sz: new Set(['w:val']),
    szCs: new Set(['w:val']),
  }
  if (/<!--|<!\[CDATA|<\?|<!DOCTYPE|<!ENTITY/.test(xml)) return false
  const parents: Record<string, readonly string[]> = {
    p: ['r', 'ins', 'del'],
    ins: ['r'],
    del: ['r'],
    r: ['rPr', 't', 'delText'],
    rPr: ['b', 'bCs', 'i', 'iCs', 'u', 'strike', 'color', 'sz', 'szCs'],
  }
  const stack: { name: string; children: Map<string, string> }[] = []
  let cursor = 0
  for (const match of xml.matchAll(/<\/?([^\s/>]+)([^<>]*)>/g)) {
    const name = match[1]!,
      attrs = match[2]!,
      tag = name.slice(2)
    if (
      xml.slice(cursor, match.index).trim() &&
      !['t', 'delText'].includes(stack.at(-1)?.name ?? '')
    )
      return false
    cursor = match.index! + match[0].length
    if (!name.startsWith('w:') || !allowed[name.slice(2)]) return false
    if (match[0].startsWith('</')) {
      const closing = stack.pop()
      if (closing?.name !== tag) return false
      if (tag === 'rPr')
        for (const [base, twin] of [
          ['b', 'bCs'],
          ['i', 'iCs'],
          ['sz', 'szCs'],
        ] as const)
          if (
            closing.children.has(twin) &&
            closing.children.get(twin) !== closing.children.get(base)
          )
            return false
      continue
    }
    const parent = stack.at(-1)
    if (parent && !parents[parent.name]?.includes(tag)) return false
    if (tag === 'delText' && !stack.some((entry) => entry.name === 'del')) return false
    if (tag === 't' && stack.some((entry) => entry.name === 'del')) return false
    if (parent?.name === 'rPr' && parent.children.has(tag)) return false
    if (parent?.name === 'r' && tag === 'rPr' && parent.children.size) return false
    const residue = attrs
      .replace(/\/?\s*$/, '')
      .replace(/([^\s=]+)\s*=\s*("[^"]*"|'[^']*')/g, (_all, key: string) =>
        allowed[name.slice(2)]!.has(key) ? '' : 'unsupported',
      )
    if (residue.trim()) return false
    const val = /\bw:val\s*=\s*(["'])(.*?)\1/.exec(attrs)?.[2]
    if (['color', 'sz', 'szCs'].includes(tag) && val === undefined) return false
    if (
      ['ins', 'del'].includes(tag) &&
      (!/\bw:id\s*=\s*["']\d+["']/.test(attrs) || !/\bw:author\s*=/.test(attrs))
    )
      return false
    if (
      ['t', 'delText'].includes(tag) &&
      /\bxml:space\s*=/.test(attrs) &&
      !/\bxml:space\s*=\s*(["'])(?:default|preserve)\1/.test(attrs)
    )
      return false
    if (val !== undefined) {
      if (
        ['b', 'bCs', 'i', 'iCs', 'strike'].includes(tag) &&
        !['0', '1', 'true', 'false', 'on', 'off'].includes(val)
      )
        return false
      if (tag === 'u' && !['single', 'none'].includes(val)) return false
      if (tag === 'color' && !/^[\da-f]{6}$/i.test(val)) return false
      if (
        ['sz', 'szCs'].includes(tag) &&
        (!/^\d+$/.test(val) || Number(val) < 1 || Number(val) > 3276)
      )
        return false
    }
    parent?.children.set(
      tag,
      ['b', 'bCs', 'i', 'iCs', 'strike'].includes(tag)
        ? ['0', 'false', 'off'].includes(val ?? '')
          ? '0'
          : '1'
        : ['sz', 'szCs'].includes(tag)
          ? String(Number(val))
          : (val ?? ''),
    )
    if (!match[0].endsWith('/>')) stack.push({ name: tag, children: new Map() })
  }
  return !stack.length && !xml.slice(cursor).trim()
}

/** Text revisions never need the general writer's relationship/media cleanup. */
export async function preserveForcedTrackingParts(original: Uint8Array, saved: Uint8Array) {
  const generated = await BoundedZip.open(saved)
  const document = await generated.readText('word/document.xml')
  if (document === null) throw new Error('强制修订保存缺少原生正文')
  const zip = await JSZip.loadAsync(original)
  if ((await zip.file('word/document.xml')!.async('string')) === document) return original.slice()
  zip.file('word/document.xml', document)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

/** Private revision identities distinguish new edits from every pre-existing revision. */
export function createForcedTrackingPolicy(
  baseline: PmDocJson,
  fingerprint: (doc: PmDocJson) => string,
  nativeTargets: ReadonlySet<number>,
  nativeRevisionIds: ReadonlySet<string> = new Set(),
) {
  const original = fingerprint(baseline)
  const accepted = new Set([original])
  let historyBytes = original.length * 2
  let restoring: string | null = null
  const identities = new Set<string>()
  const existing = new Set<string>()
  const reservedIds = new Set(nativeRevisionIds)
  let nextId = 1
  const collect = (node: PmDocJson) => {
    for (const mark of (node.marks ?? []) as PmDocJson[])
      if (mark.type === 'ins' || mark.type === 'del') {
        existing.add(revisionKey(mark))
        if (mark.attrs?.id !== null && mark.attrs?.id !== undefined)
          reservedIds.add(String(mark.attrs.id))
      }
    node.content?.forEach(collect)
  }
  collect(baseline)
  const own = (mark: PmDocJson) => identities.has(revisionKey(mark))
  const project = (node: PmDocJson): PmDocJson | null => {
    const marks = (node.marks ?? []) as PmDocJson[]
    if (node.type === 'text' && marks.some((mark) => mark.type === 'ins' && own(mark))) return null
    return {
      ...node,
      marks: marks.filter((mark) => !(mark.type === 'del' && own(mark))),
      ...(node.content
        ? { content: node.content.map(project).filter((child): child is PmDocJson => !!child) }
        : {}),
    }
  }
  return {
    isBaseline: (doc: PmDocJson) => fingerprint(doc) === original,
    canEditParagraph(node: PmDocJson) {
      return typeof node.attrs?.docxIndex === 'number' && nativeTargets.has(node.attrs.docxIndex)
    },
    remember(doc: PmDocJson) {
      const value = fingerprint(doc)
      if (!accepted.has(value)) {
        if (accepted.size >= 10_000 || historyBytes + value.length * 2 > 16 * 1024 * 1024)
          throw new Error('修订历史已达本次会话上限，请保存并重新打开')
        accepted.add(value)
        historyBytes += value.length * 2
      }
    },
    known: (doc: PmDocJson) => accepted.has(fingerprint(doc)),
    isRestoring: (doc: PmDocJson) => restoring === fingerprint(doc),
    restore(doc: PmDocJson, publish: () => boolean) {
      const value = fingerprint(doc)
      if (!accepted.has(value) || restoring !== null) return false
      restoring = value
      try {
        return publish()
      } finally {
        restoring = null
      }
    },
    revision(author: string) {
      if (identities.size >= 10_000) throw new Error('修订数量已达本次会话上限，请保存并重新打开')
      let time = Date.now()
      let attrs: Record<string, unknown>
      do {
        attrs = { author: author.slice(0, 256) || '当前用户', date: new Date(time++).toISOString() }
      } while (
        existing.has(revisionKey({ type: 'ins', attrs })) ||
        identities.has(revisionKey({ type: 'ins', attrs }))
      )
      while (reservedIds.has(String(nextId))) nextId++
      attrs.id = String(nextId++)
      reservedIds.add(String(attrs.id))
      identities.add(revisionKey({ type: 'ins', attrs }))
      return attrs
    },
    ownInsertion: (node: PmDocJson) =>
      ((node.marks ?? []) as PmDocJson[]).some((mark) => mark.type === 'ins' && own(mark)),
    assertNativeDocument(native: PmDocJson, edited: PmDocJson) {
      if (fingerprint(native) !== fingerprint(edited))
        throw new Error('原生修订保存读回与当前文字或修订不一致，未保存')
    },
    assertDocument(doc: PmDocJson) {
      if (fingerprint(project(doc)!) !== original)
        throw new Error('强制修订校验失败：原文、已有修订、结构与格式必须完整保留')
      for (const [index, node] of (doc.content ?? []).entries()) {
        if (
          fingerprint(node) !== fingerprint(baseline.content![index]!) &&
          !(typeof node.attrs?.docxIndex === 'number' && nativeTargets.has(node.attrs.docxIndex))
        )
          throw new Error(
            '此原生段落含未支持的格式、对象或扩展；强制修订下只读保留，请先停止编辑限制',
          )
      }
    },
  }
}
