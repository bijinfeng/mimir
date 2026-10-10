import { describe, expect, it } from 'vitest'
import { markdownShortcutLabel } from './shortcut-label.js'

describe('Markdown 工具栏快捷键提示', () => {
  it('macOS 显示 Command 与 Shift 图形符号', () => {
    expect(markdownShortcutLabel('undo', 'MacIntel')).toBe('⌘Z')
    expect(markdownShortcutLabel('redo', 'MacIntel')).toBe('⌘⇧Z')
    expect(markdownShortcutLabel('bold', 'MacIntel')).toBe('⌘B')
  })

  it('Windows/Linux 显示 Ctrl 组合', () => {
    expect(markdownShortcutLabel('redo', 'Win32')).toBe('Ctrl+Shift+Z')
    expect(markdownShortcutLabel('italic', 'Linux x86_64')).toBe('Ctrl+I')
    expect(markdownShortcutLabel('underline', 'Linux x86_64')).toBe('Ctrl+U')
  })
})
