import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type {
  Citation,
  ConversationDetail,
  ConversationSummary,
  FailureKind,
  Message,
  Trace,
} from '@mimir/shared'
import { db } from '../db/client.js'
import { conversationRefs, conversations, documents, messages } from '../db/schema.js'
import { createNote } from './documents.js'

/**
 * 对话持久化。
 *
 * 会话优先的导航（`docs/PRD.md` §5.2）意味着会话必须能跨刷新存在——
 * 只放内存里的话，「会话历史」按日期分组就是假的，中栏的「本次引用」
 * 也会在刷新后空掉。
 */

type ConversationRow = typeof conversations.$inferSelect
type MessageRow = typeof messages.$inferSelect

function toSummary(row: ConversationRow, refs: string[]): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    refs,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * jsonb 列取回来是 unknown（驱动不做运行时校验），这里显式收敛成契约类型。
 * 写入路径生成的形状由我们自己控制，所以转换只需保证「老数据缺字段时不炸」。
 */
function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    role: row.role === 'user' ? 'user' : 'assistant',
    text: row.text,
    trace: (row.trace as Trace | null) ?? null,
    citations: (row.citations as Citation[] | null) ?? [],
    failure: (row.failure as FailureKind | null) ?? null,
    savedNoteId: row.savedNoteId,
    createdAt: row.createdAt.toISOString(),
  }
}

async function loadRefs(conversationIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  if (conversationIds.length === 0) return result

  const rows = await db
    .select({
      conversationId: conversationRefs.conversationId,
      documentId: conversationRefs.documentId,
    })
    .from(conversationRefs)
    .where(inArray(conversationRefs.conversationId, conversationIds))

  for (const row of rows) {
    const list = result.get(row.conversationId) ?? []
    list.push(row.documentId)
    result.set(row.conversationId, list)
  }
  return result
}

/** 会话列表。左导航按日期分组由前端做，这里只按更新时间倒序给出全量。 */
export async function listConversations(limit = 50): Promise<ConversationSummary[]> {
  const rows = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(limit)

  const refs = await loadRefs(rows.map((row) => row.id))
  return rows.map((row) => toSummary(row, refs.get(row.id) ?? []))
}

export async function getConversation(id: string): Promise<ConversationDetail | null> {
  const [row] = await db.select().from(conversations).where(eq(conversations.id, id))
  if (!row) return null

  const messageRows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt))

  // 同一次插入的多条消息 createdAt 可能落在同一毫秒，稳定的次序靠 id 兜底
  messageRows.sort((a, b) => {
    const diff = a.createdAt.getTime() - b.createdAt.getTime()
    return diff !== 0 ? diff : a.id.localeCompare(b.id)
  })

  const refs = await loadRefs([id])
  return { ...toSummary(row, refs.get(id) ?? []), messages: messageRows.map(toMessage) }
}

/** 新建会话。标题留空，第一次提问时由问题内容生成。 */
export async function createConversation(title = ''): Promise<ConversationSummary> {
  const [row] = await db
    .insert(conversations)
    .values({ id: nanoid(16), title })
    .returning()

  if (!row) throw new Error('创建会话失败：数据库未返回记录')
  return toSummary(row, [])
}

/** 标题由第一个问题生成：截断到一眼能认出的长度 */
export function titleFromQuestion(question: string): string {
  const clean = question.replace(/\s+/g, ' ').trim()
  return clean.length > 40 ? `${clean.slice(0, 40)}…` : clean
}

export interface AppendMessageInput {
  conversationId: string
  role: 'user' | 'assistant'
  text: string
  trace?: Trace | null
  citations?: Citation[]
  failure?: FailureKind | null
}

/**
 * 追加一条消息，并把引用涉及的文档登记进 conversation_refs。
 *
 * 后者是「中栏显示本次引用了什么」的数据来源（见 schema.ts 里该表的注释）。
 * 登记为幂等（onConflictDoNothing）：同一次会话里引用同一篇两次是正常的。
 */
export async function appendMessage(input: AppendMessageInput): Promise<Message> {
  const [row] = await db
    .insert(messages)
    .values({
      id: nanoid(16),
      conversationId: input.conversationId,
      role: input.role,
      text: input.text,
      trace: input.trace ?? null,
      citations: input.citations ?? [],
      failure: input.failure ?? null,
    })
    .returning()

  if (!row) throw new Error('写入消息失败：数据库未返回记录')

  const documentIds = [...new Set((input.citations ?? []).map((item) => item.documentId))]
  if (documentIds.length > 0) {
    // 引用可能指向已被软删的文档（会话是历史记录，不该因为文档删了就写不进去）
    const alive = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(inArray(documents.id, documentIds), isNull(documents.deletedAt)))

    if (alive.length > 0) {
      await db
        .insert(conversationRefs)
        .values(alive.map((doc) => ({ conversationId: input.conversationId, documentId: doc.id })))
        .onConflictDoNothing()
    }
  }

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, input.conversationId))

  return toMessage(row)
}

/** 首问之后补上标题。已经是自定义标题的不覆盖。 */
export async function ensureTitle(conversationId: string, question: string): Promise<void> {
  await db
    .update(conversations)
    .set({
      title: sql`case when ${conversations.title} = '' then ${titleFromQuestion(question)} else ${conversations.title} end`,
    })
    .where(eq(conversations.id, conversationId))
}

export async function deleteConversation(id: string): Promise<boolean> {
  const rows = await db
    .delete(conversations)
    .where(eq(conversations.id, id))
    .returning({ id: conversations.id })
  return rows.length > 0
}

/**
 * 「存成笔记」——闭环的最后一环（`docs/PRD.md` §5.7）。
 *
 * 关键在于**保留引用来源**：存下来的不是孤零零一段话。做法是把引用写成
 * 站内链接（`[标题](/doc/<id>)`），这样它会自动进入双链系统——
 * 笔记底部的「来源」列出这些文档，而对方底部的「被引用」会反过来指回来。
 * 若只是把标题当纯文本写进去，双链就断了。
 */
export async function saveMessageAsNote(
  messageId: string,
): Promise<{ noteId: string; conversationId: string } | null> {
  const [row] = await db.select().from(messages).where(eq(messages.id, messageId))
  if (!row) return null
  if (row.savedNoteId) return { noteId: row.savedNoteId, conversationId: row.conversationId }

  const citations = (row.citations as Citation[] | null) ?? []

  const body = [
    row.text,
    '',
    ...(citations.length > 0
      ? [
          '## 引用来源',
          '',
          ...citations.map((cite) => `- [${cite.title}](/doc/${cite.documentId})`),
        ]
      : []),
  ].join('\n')

  const note = await createNote({ title: noteTitleFrom(row.text), body, tags: ['对话沉淀'] })

  await db.update(messages).set({ savedNoteId: note.id }).where(eq(messages.id, messageId))

  return { noteId: note.id, conversationId: row.conversationId }
}

/** 从回答里取一个像标题的开头。取不到就用兜底名，不生成空标题。 */
function noteTitleFrom(text: string): string {
  const firstLine = text.split(/\n/).find((line) => line.trim().length > 0) ?? ''
  const clean = firstLine
    .replace(/[#*`>]/g, '')
    .replace(/[，。：；？！,.:;?!]/g, ' ')
    .trim()
  if (!clean) return '对话结论'
  return clean.length > 24 ? `${clean.slice(0, 24)}…` : clean
}
