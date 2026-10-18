import { FileText } from 'lucide-react'
import type { Doc } from './fixtures'
import glyph0 from './assets/description.svg'
import glyph1 from './assets/table_chart.svg'
import glyph2 from './assets/slideshow.svg'
import glyph3 from './assets/picture_as_pdf.svg'
import glyph4 from './assets/code.svg'
import glyph5 from './assets/notes.svg'
import glyph6 from './assets/image.svg'
import glyph7 from './assets/audio_file.svg'
import glyph8 from './assets/video_file.svg'
import glyph9 from './assets/folder_zip.svg'
import glyph10 from './assets/draft.svg'
import glyph11 from './assets/article.svg'
const glyphs: Record<string, string> = {
  Word: glyph0,
  Excel: glyph1,
  PowerPoint: glyph2,
  PDF: glyph3,
  HTML: glyph4,
  代码: glyph4,
  笔记: glyph5,
  图片: glyph6,
  音频: glyph7,
  视频: glyph8,
  压缩包: glyph9,
  未知文件: glyph10,
  文本: glyph11,
}
export function OriginalFormatIcon({ doc, size }: { doc: Doc; size?: number }) {
  if (['网页', '公众号', 'GitHub'].includes(doc.kind))
    return <FileText size={size ?? 19} strokeWidth={1.7} aria-hidden />
  const url = `url("${glyphs[doc.kind] ?? glyph10}")`
  return (
    <span
      className="format-glyph"
      aria-hidden
      style={{ width: size, height: size, maskImage: url, WebkitMaskImage: url }}
    />
  )
}
