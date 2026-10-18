import { eq } from 'drizzle-orm'
import type { MiniappOperationResult } from '@mimir/shared/miniapp'
import { db } from '../db/client.js'
import { messages } from '../db/schema.js'
import { HttpError } from '../lib/http.js'
import { getConversation, saveMessageAsNote } from './conversations.js'
import { getDocument } from './documents.js'

export async function saveMiniappAnswer(
  messageId: string,
  folder: string,
): Promise<MiniappOperationResult> {
  const [message] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1)
  if (!message) throw new HttpError(404, 'MESSAGE_NOT_FOUND', '回答不存在')
  const conversation = await getConversation(message.conversationId)
  const visible = conversation?.messages.find((item) => item.id === messageId)
  if (!visible || visible.agent)
    throw new HttpError(403, 'MESSAGE_NOT_SAVEABLE', '小程序只能保存已完成的只读问答结果')
  if (visible.failure || visible.role !== 'assistant' || !visible.text.trim())
    throw new HttpError(400, 'MESSAGE_NOT_SAVEABLE', '只能保存已完成的助手回答')
  const saved = await saveMessageAsNote(messageId, { folder })
  if (!saved) throw new HttpError(404, 'MESSAGE_NOT_FOUND', '回答不存在')
  const note = await getDocument(saved.noteId)
  if (!note)
    throw new HttpError(409, 'SAVED_NOTE_MISSING', '这条回答保存过的笔记已不存在，请先在电脑端确认')
  return {
    type: 'saved-answer',
    noteId: saved.noteId,
    folder: note.folder,
    alreadySaved: Boolean(message.savedNoteId) || note.folder !== folder,
  }
}
