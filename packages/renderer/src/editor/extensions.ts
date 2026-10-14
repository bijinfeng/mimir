import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { common, createLowlight } from 'lowlight'
import { MarkdownSearchHighlight } from '@mimir/office'

const lowlight = createLowlight(common)

/**
 * 编辑器的扩展集合。
 *
 * 单独抽成模块的原因：Markdown 往返保真度取决于**这一整套**扩展，
 * 而不是单个扩展。测试必须针对真实配置，否则测的是另一个编辑器。
 */
export function createExtensions(options: { placeholder?: string } = {}) {
  return [
    // codeBlock 交给 lowlight 做语法高亮，所以关掉 StarterKit 自带的那个；
    // link 用 StarterKit 内置的并在此处配置，不要再单独 import——
    // 两边都加会触发 "Duplicate extension names found: ['link']"，
    // 症状是链接的配置被覆盖，且很难查。
    StarterKit.configure({
      codeBlock: false,
      link: {
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      },
    }),
    CodeBlockLowlight.configure({ lowlight }),
    Image,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({
      placeholder: options.placeholder ?? '开始写点什么…',
    }),
    Markdown,
    MarkdownSearchHighlight,
  ]
}
