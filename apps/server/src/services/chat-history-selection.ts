/** A local branch references stored messages; never trust client-supplied historical content. */
export function selectedConversationMessages<T extends { id: string }>(
  messages: T[],
  ids: string[] | undefined,
): T[] {
  if (ids === undefined) return messages
  const positions = new Map(messages.map((message, index) => [message.id, { message, index }]))
  const selected: T[] = []
  let previous = -1
  for (const id of ids) {
    const entry = positions.get(id)
    if (!entry || entry.index <= previous) throw new Error('所选对话历史已失效，请刷新会话后重试')
    selected.push(entry.message)
    previous = entry.index
  }
  return selected
}
