import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { openDocx } from './docx.js'

/**
 * 适配层的「读 → 改 → 存」冒烟。
 *
 * 守的是两件事：
 *  1. 补丁式保存**真的保真**——未改动的 zip 条目必须逐字节相同
 *  2. 适配层没有把上游的参数传丢——改一段后改动确实落到 document.xml
 *
 * 夹具是 vendored 进来的真实文档（含标题/列表/表格/图片/公式/分节符），
 * 不是构造的最小样例：保真这件事只有在「有一堆没建模的东西」的文档上
 * 才测得出来。
 */
const FIXTURE = new URL(
  '../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
  import.meta.url,
)

describe('openDocx', () => {
  it('能打开真实文档并产出 ProseMirror 文档', async () => {
    const session = await openDocx(new Uint8Array(readFileSync(FIXTURE)))
    expect(session.content).toBeDefined()
    // blocksToPmDoc 产出的是 ProseMirror **JSON**（`{ type, content }`），
    // 不是 Node 实例——挂到 Tiptap 时由它自己 parse。夹具含标题/段落/表格/
    // 图片/公式，块数应当明显多于 1
    const doc = session.content as unknown as { content?: unknown[] }
    expect(Array.isArray(doc.content)).toBe(true)
    expect(doc.content!.length).toBeGreaterThan(5)
  })

  it('改一段文字：只有 document.xml 变化，其余条目字节不变', async () => {
    const bytes = new Uint8Array(readFileSync(FIXTURE))
    const session = await openDocx(bytes)
    const doc = structuredClone(session.content) as unknown as {
      content: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>
    }

    // 找第一个有文字的段落，改掉它的文本（模拟用户编辑）
    let edited = false
    for (const block of doc.content) {
      const textNode = block.content?.find((n) => n.type === 'text' && n.text)
      if (textNode?.text) {
        textNode.text = `${textNode.text}!`
        edited = true
        break
      }
    }
    expect(edited, '夹具里应当有可编辑的文本节点').toBe(true)

    const saved = await session.save(doc as never)

    const JSZip = (await import('jszip')).default
    const [before, after] = await Promise.all([JSZip.loadAsync(bytes), JSZip.loadAsync(saved)])
    const changed: string[] = []
    for (const name of Object.keys(before.files).toSorted()) {
      const [a, b] = await Promise.all([
        before.files[name]!.async('uint8array'),
        after.files[name]!.async('uint8array'),
      ])
      if (a.length !== b.length || !a.every((v, i) => v === b[i])) changed.push(name)
    }

    /**
     * **只允许 document.xml 变化。** 这是补丁式保存的核心承诺：没被碰过的
     * 部件（样式表、编号、图片、页眉…）逐字节原样复制。一旦这里多出别的
     * 条目，说明保存退回了「整篇重建」——那样会丢掉我们没建模的东西
     * （域代码、修订标记、OLE 对象）。
     */
    expect(changed).toEqual(['word/document.xml'])
  })

  it('原样保存：zip 每个条目逐字节相同', async () => {
    const bytes = new Uint8Array(readFileSync(FIXTURE))
    const session = await openDocx(bytes)
    // 把解析出来的文档原样存回（编辑器没做任何改动）
    const saved = await session.save(session.content)
    expect(saved.length).toBe(bytes.length)

    const JSZip = (await import('jszip')).default
    const [before, after] = await Promise.all([JSZip.loadAsync(bytes), JSZip.loadAsync(saved)])
    const names = Object.keys(before.files).toSorted()
    expect(Object.keys(after.files).toSorted()).toEqual(names)

    for (const name of names) {
      const [a, b] = await Promise.all([
        before.files[name]!.async('uint8array'),
        after.files[name]!.async('uint8array'),
      ])
      expect(b, `zip 条目「${name}」被改动了——补丁式保存应当原样复制未改动的部分`).toEqual(a)
    }
  })
})
