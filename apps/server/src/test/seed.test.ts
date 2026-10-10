import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { documents, folders } from '../db/schema.js'
import { readNote } from '../lib/vault.js'
import { assemble } from '../plugins/host.js'
import { deleteFolder } from '../services/folders.js'
import { deleteDocument } from '../services/documents.js'
import { PRODUCT_DOC_BODY, seedDefaultLibrary } from '../services/seed.js'

/**
 * 默认内容播种（一个知识库 + 一份产品说明）。
 *
 * ## 这一组守的是三条**不会报错**的性质
 *
 * | 断言 | 违反它的后果 |
 * |---|---|
 * | 只播一次 | 每次重启多一个「开始使用」、多一份说明——用户会以为系统坏了 |
 * | 删掉之后不再回来 | 用户删默认内容是明确的意思表示，播回来等于无视它（而且删不干净） |
 * | 内容真的走完整写入链路 | 直接插表会绕过 vault 文件与分块——得到的是一份「看着在、搜不到」的说明 |
 *
 * 测试直接调服务，**不经过** `boot.ts` / `auth.ts` 的测试跳过——
 * 那两处跳过是给「自动触发」用的，服务本身必须可测。
 *
 * 注意这一组会**真的写入测试 vault**（`data/.test/`，globalSetup 每次清空），
 * 所以它对「文件是真相」那条规则也一样有效：断言读回的是磁盘上的笔记。
 */

beforeAll(async () => {
  // 清掉可能被别的用例写下的标记，让这一组从「从没播过」的真实起点开始
  const { settings } = assemble()
  await settings.update({ 'seed.defaultContent': null })
})

/**
 * 收尾：把这一组造出来的东西清掉（含重置标记）。
 *
 * 测试库是**文件级共享**的（`vitest.config.ts` 关掉并行，globalSetup 只清一次），
 * 所以留下的行会被后面跑的文件看见。这一组留下的是一条目录 + 一篇笔记，
 * 今天没有哪个用例做「目录总数」这类断言，但**依赖「没有别人留下东西」的
 * 断言迟早会被写出来**——那时它会以一个看起来毫不相关的方式失败
 * （`.trellis/spec/project/architecture.md` §9.2 记过 144 个残留文件那次的同一种味道）。
 *
 * 用真正的删除路径（`deleteFolder` / `deleteDocument`）而不是直接删行：
 * 它们会一并清掉 vault 文件与相关索引，与用户点删除时留下的状态一致。
 */
afterAll(async () => {
  const rows = await db.select({ id: documents.id }).from(documents)
  for (const row of rows) await deleteDocument(row.id)

  const libraries = await db.select({ path: folders.path }).from(folders)
  for (const library of libraries) {
    if (library.path === '开始使用') await deleteFolder(library.path)
  }

  const { settings } = assemble()
  await settings.update({ 'seed.defaultContent': null })
})

describe('默认内容播种', () => {
  it('建出一个知识库与一份产品说明，说明真的落成 vault 文件', async () => {
    const result = await seedDefaultLibrary()
    expect(result.skipped).toBe(false)
    expect(result.libraryCreated).toBe(true)
    expect(result.documentCreated).toBe(true)

    // 知识库（folders 表是树的唯一真相）
    const [library] = await db.select().from(folders).where(eq(folders.path, '开始使用'))
    expect(library).toBeDefined()
    expect(library!.description).not.toBe('')
    expect(library!.icon).toBe('computer')
    expect(library!.code).not.toBe('')

    // 说明文档：一条 note，归属那个知识库
    const [doc] = await db.select().from(documents).where(eq(documents.title, 'mimir 产品说明'))
    expect(doc).toBeDefined()
    expect(doc!.kind).toBe('note')
    expect(doc!.folder).toBe('开始使用')
    // 正文是那份说明（不是空壳）
    expect(doc!.body).toContain('从这里开始')
    // 摘要与检索文本都建了——「能被搜到」是这份说明的意义之一
    expect(doc!.excerpt).not.toBe('')
    expect(doc!.searchText).not.toBe('')

    /**
     * **正文完整**（从入门到备份、以结尾句收尾）。
     *
     * 这条是实测教训：维护脚本曾用正则从 seed.ts 源码里现抽正文，
     * 在第一个代码围栏（反引号 + 换行）处截断，库里存了半篇说明——
     * 而那不会报错，是用户在界面上看到「文档有中断」才发现的。
     * 所以这里断言「库里存的 = 常量本身」，任何截断当场暴露。
     */
    expect(doc!.body).toBe(PRODUCT_DOC_BODY)
    expect(PRODUCT_DOC_BODY).toContain('## 数据与备份')
    expect(PRODUCT_DOC_BODY).not.toContain('RRF')
    expect(
      PRODUCT_DOC_BODY.trimEnd().endsWith(
        '这篇说明也是一篇普通笔记。熟悉之后，可以编辑、移动或删除它。',
      ),
    ).toBe(true)

    /**
     * **文件是真相**（铁律 2）：`createNote` 先写文件再写库，
     * 所以磁盘上必须有它，且内容与库里一致。这一条同时验证了
     * 播种走的是真实写入路径，而不是绕过 vault 直接插表。
     */
    const note = await readNote(doc!.path!)
    expect(note.title).toBe('mimir 产品说明')
    expect(note.folder).toBe('开始使用')
    expect(note.body).toContain('从这里开始')
  })

  it('再播一次什么都不做（标记挡住了）', async () => {
    const before = {
      folders: (await db.select().from(folders)).length,
      documents: (await db.select().from(documents)).length,
    }

    const result = await seedDefaultLibrary()
    expect(result.skipped).toBe(true)
    expect(result.libraryCreated).toBe(false)
    expect(result.documentCreated).toBe(false)

    expect((await db.select().from(folders)).length).toBe(before.folders)
    expect((await db.select().from(documents)).length).toBe(before.documents)
  })

  it('把知识库删掉、再播一次，它**不会回来**（删除是明确的意思表示）', async () => {
    /**
     * 这一条是标记存在的全部理由。判据若是「库是不是空的」，
     * 用户删掉默认知识库之后每次重启它都会长回来——那是删不掉的，
     * 而用户不会想到「有个标记说该播」。
     */
    await deleteFolder('开始使用')
    await deleteDocument((await db.select({ id: documents.id }).from(documents))[0]!.id)

    const result = await seedDefaultLibrary()
    expect(result.skipped).toBe(true)

    const [library] = await db.select().from(folders).where(eq(folders.path, '开始使用'))
    expect(library).toBeUndefined()
  })

  it('播种后的说明能被检索到（分块与索引一起生效）', async () => {
    // 把标记清掉、内容也清干净，完整重播一次
    const { settings } = assemble()
    await settings.update({ 'seed.defaultContent': null })
    await seedDefaultLibrary()

    const { search } = await import('../search/index.js')
    // 「语义向量」是说明里出现的词，且不是通用词
    const found = await search({ q: '语义向量', limit: 5 })
    expect(found.hits.length).toBeGreaterThan(0)
    expect(found.hits.some((hit) => hit.title === 'mimir 产品说明')).toBe(true)
  })
})
