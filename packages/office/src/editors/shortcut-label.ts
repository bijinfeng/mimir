/** 工具提示与可访问名称使用真实平台修饰键；命令绑定仍由 Tiptap 处理。 */
export function markdownShortcutLabel(
  command: 'undo' | 'redo' | 'bold' | 'italic' | 'underline',
  platform = typeof navigator === 'undefined' ? '' : navigator.platform,
): string {
  const key = {
    undo: 'Z',
    redo: 'Z',
    bold: 'B',
    italic: 'I',
    underline: 'U',
  }[command]
  const mac = /Mac|iPhone|iPad/.test(platform)
  return mac
    ? `⌘${command === 'redo' ? '⇧' : ''}${key}`
    : `Ctrl+${command === 'redo' ? 'Shift+' : ''}${key}`
}
