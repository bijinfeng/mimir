import { Extension, type Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import type { Node as PmNode } from '@tiptap/pm/model'
import { sectionFromSectPr } from '../../vendor/packages/docx-engine/src/section.js'
import type {
  SectionInfo,
  ThemeColors,
  ThemeFonts,
} from '../../vendor/packages/docx-engine/src/types.js'
import {
  DESIGN_ATTR,
  PAGE_BORDER_ATTR,
  designEdits,
  patchPageBorder,
  type DocxDesignEdits,
} from '../docx-design-save.js'

export const DocxDesignExtension = Extension.create({
  name: 'mimirDesign',
  addGlobalAttributes() {
    return [
      { types: ['doc'], attributes: { [DESIGN_ATTR]: { default: null, rendered: false } } },
      {
        types: ['docParagraph', 'docHeading', 'docListItem', 'docProtected'],
        attributes: { [PAGE_BORDER_ATTR]: { default: null, rendered: false } },
      },
    ]
  },
})
export function docxDesignSections(doc: PmNode, sections: SectionInfo[]): SectionInfo[] {
  return sections.map((section, i) => {
    const border =
      i === sections.length - 1
        ? designEdits(doc).trailingBorder
        : doc.child(section.lastBlockIndex)?.attrs[PAGE_BORDER_ATTR]
    if (typeof border !== 'boolean') return section
    const xml = patchPageBorder(section.sectPrXml, border)
    const patched = sectionFromSectPr(xml, section.firstBlockIndex, section.lastBlockIndex)
    return {
      ...section,
      sectPrXml: xml,
      settings: {
        ...section.settings,
        pageBorder: patched.settings.pageBorder,
        pageBorderProps: patched.settings.pageBorderProps,
      },
    }
  })
}
export interface DocxDesignTarget {
  doc: PmNode
  section: number
  positions: (number | null)[]
  sectionXml: string[]
}
export function docxDesignTarget(editor: Editor, sections: SectionInfo[]): DocxDesignTarget {
  const block = Math.min(editor.state.selection.$from.index(0), editor.state.doc.childCount - 1)
  let pos = 0
  const offsets: number[] = []
  editor.state.doc.forEach((node) => {
    offsets.push(pos)
    pos += node.nodeSize
  })
  return {
    doc: editor.state.doc,
    section: Math.max(
      0,
      sections.findIndex((section) => block <= section.lastBlockIndex),
    ),
    positions: sections.map((section, i) =>
      i === sections.length - 1 ? null : (offsets[section.lastBlockIndex] ?? null),
    ),
    sectionXml: sections.map((section) => section.sectPrXml),
  }
}
export function applyDocxDesign(
  editor: Editor,
  target: DocxDesignTarget,
  patch: DocxDesignEdits,
  border?: { enabled: boolean; scope: 'section' | 'document' },
): DocxDesignTarget {
  if (editor.isDestroyed || editor.state.doc !== target.doc)
    throw new Error('文档已变化，请重新打开设计设置')
  const edits = { ...designEdits(target.doc), ...patch }
  const tr = closeHistory(editor.state.tr)
  if (border) {
    target.positions.forEach((pos, i) => {
      if (border.scope === 'section' && i !== target.section) return
      patchPageBorder(target.sectionXml[i]!, border.enabled)
      if (pos === null) edits.trailingBorder = border.enabled
      else {
        const node = tr.doc.nodeAt(pos)
        if (!node || !(PAGE_BORDER_ATTR in node.attrs))
          throw new Error('当前节不能安全设置页面边框')
        if (node.attrs[PAGE_BORDER_ATTR] !== border.enabled)
          tr.setNodeAttribute(pos, PAGE_BORDER_ATTR, border.enabled)
      }
    })
  }
  if (JSON.stringify(edits) !== JSON.stringify(designEdits(target.doc)))
    tr.setDocAttribute(DESIGN_ATTR, edits)
  if (tr.docChanged) {
    editor.view.dispatch(tr)
    // Keep later manual typing outside this single native history action.
    editor.view.dispatch(closeHistory(editor.state.tr))
  }
  return { ...target, doc: editor.state.doc }
}

const palette = (name: string, dk2: string, lt2: string, accents: string): ThemeColors => {
  const a = accents.split(' ')
  return { name, dk2, lt2, ...Object.fromEntries(a.map((color, i) => [`accent${i + 1}`, color])) }
}
export const DESIGN_COLOR_PRESETS = [
  {
    name: 'Office',
    colors: palette('Office', '44546A', 'E7E6E6', '4472C4 ED7D31 A5A5A5 FFC000 5B9BD5 70AD47'),
  },
  {
    name: '灰阶',
    colors: palette('Grayscale', '3F3F3F', 'B3B3B3', '5B5B5B 8C8C8C A6A6A6 737373 404040 D9D9D9'),
  },
  {
    name: '蓝色',
    colors: palette('Blue', '17406D', 'DBEFF9', '0F6FC6 009DD9 0BD0D9 10CF9B 7CCA62 A5C249'),
  },
  {
    name: '绿色',
    colors: palette('Green', '455F51', 'E3DED1', '549E39 8AB833 C0CF3A 029676 4AB5C4 0989B1'),
  },
  {
    name: '红紫',
    colors: palette('Red Violet', '5F5F5F', 'FFFDF7', 'A83D4C D2554B E1734C 8D3B4B 54387F 7A99AC'),
  },
  {
    name: '橙色',
    colors: palette('Orange', '637052', 'CCDDEA', 'E48312 BD582C 865640 9B8357 C2BC80 94A088'),
  },
]
export const DESIGN_FONT_PRESETS: { name: string; fonts: ThemeFonts }[] = [
  { name: 'Office', fonts: { major: 'Calibri Light', minor: 'Calibri', eastAsia: '等线' } },
  { name: '黑体 / 宋体', fonts: { major: '黑体', minor: '宋体', eastAsia: '宋体' } },
  { name: '微软雅黑', fonts: { major: '微软雅黑', minor: '微软雅黑', eastAsia: '微软雅黑' } },
  { name: '楷体', fonts: { major: '楷体', minor: '楷体', eastAsia: '楷体' } },
  {
    name: 'Times New Roman',
    fonts: { major: 'Times New Roman', minor: 'Times New Roman', eastAsia: '宋体' },
  },
  { name: 'Arial', fonts: { major: 'Arial', minor: 'Arial', eastAsia: '黑体' } },
]
export const DESIGN_THEMES = [
  { name: 'Office', fonts: DESIGN_FONT_PRESETS[0]!.fonts, colors: DESIGN_COLOR_PRESETS[0]!.colors },
  {
    name: 'Facet',
    fonts: { major: 'Trebuchet MS', minor: 'Trebuchet MS', eastAsia: '微软雅黑' },
    colors: palette('Facet', '3E3D2D', 'E1DFDD', '90C226 54A021 E6B91E E76618 C42F1A 918655'),
  },
  {
    name: 'Ion',
    fonts: { major: 'Century Gothic', minor: 'Century Gothic', eastAsia: '黑体' },
    colors: palette('Ion', '1B587C', 'E8ECEE', '4E8542 604878 C19859 CA7B4F 415D6B 8EA5AF'),
  },
  {
    name: 'Retrospect',
    fonts: { major: 'Calibri Light', minor: 'Calibri', eastAsia: '仿宋' },
    colors: DESIGN_COLOR_PRESETS[5]!.colors,
  },
]
