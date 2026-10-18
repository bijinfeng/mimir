import { beforeAll, describe, expect, it } from 'vitest'
import { createNote, updateNote } from '../services/documents.js'
import { createFolder, deleteFolder } from '../services/folders.js'
import { searchChunks } from '../search/index.js'
import { prepareRetrieval } from '../services/retrieval-preparation.js'
import { normalizeRetrievalScope } from '../services/retrieval-scope.js'
import {
  appendMessage,
  createConversation,
  ensureConversationScope,
  saveMessageAsNote,
} from '../services/conversations.js'
import { getAuthCookie } from './helpers.js'

beforeAll(async () => {
  await getAuthCookie()
})

describe('小程序范围与引用边界', () => {
  it('按字面目录段过滤，在 limit 前排除相似路径和通配路径', async () => {
    const path = 'miniapp-scope-100%_'
    const wanted = await createNote({
      title: '范围',
      body: '蓝鲸迁徙标记',
      tags: [],
      folder: `${path}/child`,
    })
    await createNote({ title: '相似目录', body: '蓝鲸迁徙标记', tags: [], folder: `${path}other` })
    await createNote({
      title: '通配相似目录',
      body: '蓝鲸迁徙标记',
      tags: [],
      folder: 'miniapp-scope-100xx',
    })
    const result = await searchChunks({
      q: '蓝鲸迁徙标记',
      limit: 1,
      mode: 'keyword',
      retrievalScope: { type: 'folder', path },
    })
    expect(result.hits).toHaveLength(1)
    expect(result.hits[0]?.documentId).toBe(wanted.id)
  })

  it('单篇长文检索能引用末尾，并与真实阅读源文偏移一致', async () => {
    const body = `${'普通背景内容。\n\n'.repeat(1000)}\n# 尾部\n\n深海灯塔部署密钥轮换周期是三十天。`
    const note = await createNote({ title: '长文尾部', body, tags: [] })
    const result = await prepareRetrieval('深海灯塔部署密钥轮换周期', {
      type: 'document',
      documentId: note.id,
    })
    expect(result.citations.length).toBeGreaterThan(0)
    expect(result.citations.every((citation) => citation.documentId === note.id)).toBe(true)
    expect(
      result.citations.some(
        (citation) => citation.start > 1200 && citation.snippet.includes('三十天'),
      ),
    ).toBe(true)
  })

  it('范围删除不会回落全库，会话不能切换范围', async () => {
    const path = await createFolder({ path: 'miniapp-deleted-scope' })
    const conversation = await createConversation('', { type: 'folder', path })
    await expect(ensureConversationScope(conversation.id, { type: 'all' })).rejects.toMatchObject({
      code: 'CONVERSATION_SCOPE_MISMATCH',
    })
    await deleteFolder(path)
    await expect(normalizeRetrievalScope({ type: 'folder', path })).rejects.toMatchObject({
      code: 'SCOPE_NOT_FOUND',
    })
  })

  it('回答并发沉淀返回同一笔记；用户消息不能沉淀', async () => {
    const conversation = await createConversation('', { type: 'all' })
    const user = await appendMessage({
      conversationId: conversation.id,
      role: 'user',
      text: '提问',
    })
    await expect(saveMessageAsNote(user.id)).rejects.toMatchObject({ code: 'MESSAGE_NOT_SAVEABLE' })
    const assistant = await appendMessage({
      conversationId: conversation.id,
      role: 'assistant',
      text: '已完成的回答',
    })
    const [first, second] = await Promise.all([
      saveMessageAsNote(assistant.id),
      saveMessageAsNote(assistant.id),
    ])
    expect(first?.noteId).toBeTruthy()
    expect(second?.noteId).toBe(first?.noteId)
    if (first) await updateNote(first.noteId, { body: '保存后可以正常编辑' })
  })
})
