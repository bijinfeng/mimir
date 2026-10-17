import { useEffect } from 'react'
import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PmNode } from '@tiptap/pm/model'
import type {
  ThemeColors,
  ThemeFonts,
  SectionInfo,
} from '../../vendor/packages/docx-engine/src/types.js'
import type { SaveOptions } from '../../vendor/packages/docx-engine/src/patch.js'
import {
  attrsOf,
  findChild,
  xmlParser,
  type XNode,
} from '../../vendor/packages/docx-engine/src/xml-utils.js'
import { themedRFonts } from '../../vendor/packages/docx-engine/src/parse-props.js'
import { resolveThemeColor } from '../../vendor/packages/docx-engine/src/theme.js'
import { cssRunFontFamily } from '../../vendor/apps/docs/src/renderer/line-metrics.js'
import {
  darkPageColor,
  dkColor,
  setDkBorder,
} from '../../vendor/apps/docs/src/renderer/editor/dark-page.js'
import {
  pageBorderArtStripStyle,
  pageBorderStyleOf,
  pageFramesFromGaps,
} from '../../vendor/apps/docs/src/renderer/editor/pagination-gaps.js'
import type { DocxSession } from '../docx.js'
import { liveDocxTheme } from '../docx-design-save.js'

interface Theme {
  fonts?: ThemeFonts | null
  colors?: ThemeColors | null
}
interface ThemeState {
  theme: Theme
  decorations: DecorationSet
}
const themeKey = new PluginKey<ThemeState>('mimirThemePreview')
/** Theme display follows raw references only while the run retains its parsed value. */
export function docxThemeDecorations(doc: PmNode, theme: Theme): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) return
    const attrs = node.marks.find((m) => m.type.name === 'docTextStyle')?.attrs
    if (!attrs?.rawRPr) return
    const root = (xmlParser.parse(String(attrs.rawRPr)) as XNode[])[0]
    if (!root) return
    const declarations: string[] = []
    if (theme.colors && attrs.themeColor && attrs.color === attrs.themeColor) {
      const raw = attrsOf(findChild(root, 'w:color') ?? {})
      const color = resolveThemeColor(
        raw['w:themeColor'] ?? '',
        theme.colors,
        raw['w:themeTint'],
        raw['w:themeShade'],
      )
      if (color) declarations.push(`color:#${color}`, dkColor(color))
    }
    if (theme.fonts && attrs.themeRFonts) {
      let previous: { font?: string; fontAscii?: string } = {}
      try {
        previous = JSON.parse(String(attrs.themeRFonts))
      } catch {
        return
      }
      const raw = attrsOf(findChild(root, 'w:rFonts') ?? {})
      const next = themedRFonts(raw, theme.fonts)
      const latin = next.ascii ?? next.hAnsi
      const font = next.eastAsia ?? latin
      const ascii =
        previous.fontAscii && attrs.fontAscii === previous.fontAscii && latin
          ? latin
          : attrs.fontAscii
      const ea = previous.font && attrs.font === previous.font && font ? font : attrs.font
      if (ascii !== attrs.fontAscii || ea !== attrs.font)
        declarations.push(`font-family:${cssRunFontFamily(ascii, ea)} !important`)
    }
    if (declarations.length)
      decorations.push(
        Decoration.inline(pos, pos + node.nodeSize, {
          class: 'mimir-docx-theme-run',
          style: declarations.join(';'),
        }),
      )
  })
  return DecorationSet.create(doc, decorations)
}
export const DocxThemePreviewExtension = Extension.create({
  name: 'mimirThemePreview',
  addProseMirrorPlugins() {
    return [
      new Plugin<ThemeState>({
        key: themeKey,
        state: {
          init: () => ({ theme: {}, decorations: DecorationSet.empty }),
          apply: (tr, value) => {
            const theme = tr.getMeta(themeKey) as Theme | undefined
            return theme || tr.docChanged
              ? {
                  theme: theme ?? value.theme,
                  decorations: docxThemeDecorations(tr.doc, theme ?? value.theme),
                }
              : value
          },
        },
        props: {
          decorations: (state) => themeKey.getState(state)?.decorations ?? DecorationSet.empty,
        },
      }),
    ]
  },
})
export function DocxDesignPreview({
  editor,
  session,
  options,
  sections,
  fonts,
  colors,
  dark,
  onError,
}: {
  editor: Editor
  session: DocxSession
  options: SaveOptions
  sections: SectionInfo[]
  fonts?: ThemeFonts | null
  colors?: ThemeColors | null
  dark: boolean
  onError: (message: string) => void
}) {
  useEffect(() => {
    if (editor.isDestroyed) return
    editor.view.dispatch(
      editor.state.tr.setMeta(themeKey, { fonts, colors }).setMeta('addToHistory', false),
    )
  }, [editor, fonts, colors])
  useEffect(() => {
    if (editor.isDestroyed) return
    const wrap = editor.view.dom.closest('.page-wrap') as HTMLElement | null
    if (!wrap) return
    let active = true
    liveDocxTheme(session, options)
      .then(({ pageColor }) => {
        if (!active) return
        if (pageColor)
          wrap.style.setProperty('--page-bg', dark ? darkPageColor(pageColor) : `#${pageColor}`)
        else wrap.style.removeProperty('--page-bg')
      })
      .catch((cause) => {
        if (active) onError(`设计预览失败：${String(cause)}`)
      })
    return () => {
      active = false
    }
  }, [editor, session, options, dark, onError])
  useEffect(() => {
    if (editor.isDestroyed) return
    const wrap = editor.view.dom.closest('.page-wrap') as HTMLElement | null
    if (!wrap) return
    const layer = document.createElement('div')
    layer.className = 'mimir-docx-page-borders'
    layer.setAttribute('aria-hidden', 'true')
    wrap.appendChild(layer)
    let frame = 0
    const render = () => {
      frame = 0
      if (editor.isDestroyed) return
      const wr = wrap.getBoundingClientRect()
      const zoom = wrap.offsetWidth ? wr.width / wrap.offsetWidth : 1
      const blocks: { index: number; top: number; bottom: number }[] = []
      editor.state.doc.forEach((_node, pos, index) => {
        const dom = editor.view.nodeDOM(pos)
        if (!(dom instanceof HTMLElement)) return
        const rect = dom.getBoundingClientRect()
        blocks.push({
          index,
          top: (rect.top - wr.top) / zoom,
          bottom: (rect.bottom - wr.top) / zoom,
        })
      })
      const seen = new Map<number, number>()
      const overlays: HTMLElement[] = []
      for (const paper of pageFramesFromGaps(wrap, zoom)) {
        if (paper.bottom - paper.top <= 10) continue
        const first = blocks.find(
          (block) => block.bottom > paper.top + 1 && block.top < paper.bottom - 1,
        )
        const sectionIndex = first
          ? Math.max(
              0,
              sections.findIndex((s) => first.index <= s.lastBlockIndex),
            )
          : 0
        const section = sections[sectionIndex]
        if (!section) continue
        const page = seen.get(sectionIndex) ?? 0
        seen.set(sectionIndex, page + 1)
        const style = pageBorderStyleOf(section.settings)
        if (
          !style ||
          (style.display === 'firstPage' && page > 0) ||
          (style.display === 'notFirstPage' && page === 0)
        )
          continue
        const sides = style.sides
        const el = document.createElement('div')
        el.className = 'mimir-docx-page-border'
        el.dataset.section = String(sectionIndex + 1)
        const top = sides.top?.insetPx ?? 0,
          right = sides.right?.insetPx ?? 0
        const bottom = sides.bottom?.insetPx ?? 0,
          left = sides.left?.insetPx ?? 0
        Object.assign(el.style, {
          top: `${paper.top + top}px`,
          left: `${paper.left + left}px`,
          width: `${Math.max(0, paper.width - left - right)}px`,
          height: `${Math.max(0, paper.bottom - paper.top - top - bottom)}px`,
        })
        if (style.zOrder === 'back') el.classList.add('page-border-overlays-back')
        for (const name of ['top', 'right', 'bottom', 'left'] as const) {
          const side = sides[name]
          if (side?.css) {
            el.style.setProperty(`border-${name}`, side.css)
            setDkBorder(
              el,
              { top: 't', right: 'r', bottom: 'b', left: 'l' }[name] as 't' | 'r' | 'b' | 'l',
              side.css,
            )
          }
          if (side?.art) {
            const strip = document.createElement('div')
            strip.className = 'page-border-art'
            Object.assign(strip.style, pageBorderArtStripStyle(name, side.art))
            el.appendChild(strip)
          }
        }
        overlays.push(el)
      }
      layer.replaceChildren(...overlays)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(editor.view.dom, { childList: true, subtree: true, attributes: true })
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    resize?.observe(wrap)
    editor.on('transaction', schedule)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      resize?.disconnect()
      editor.off('transaction', schedule)
      layer.remove()
    }
  }, [editor, sections])
  return null
}
