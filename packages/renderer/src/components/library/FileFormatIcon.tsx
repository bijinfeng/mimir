import { parseTargetFor, type DocumentSummary } from '@mimir/shared'
import { useAppearance } from '../../theme/appearance'
import { FILE_FORMAT_COLORS, useFileFormatIconStyles } from './FileFormatIcon.style'
import { FILE_FORMAT_GLYPHS, type FileFormat } from './phosphor-file-icons/glyphs'

type IconDocument = Pick<DocumentSummary, 'kind' | 'mime' | 'fileExtension' | 'title'>

/** Sources take precedence over file-looking titles or MIME values. */
export function fileFormatOf(doc: IconDocument): FileFormat {
  if (doc.kind !== 'file') {
    switch (doc.kind) {
      case 'note':
      case 'web':
      case 'wechat':
      case 'github':
        return doc.kind
      default:
        return 'unknown'
    }
  }

  const extension = doc.fileExtension?.toLowerCase() ?? ''
  const mime = (doc.mime ?? '').toLowerCase()
  const suffix = extension ? `.${extension}` : ''
  const filename =
    suffix && !doc.title.toLowerCase().endsWith(suffix) ? doc.title + suffix : doc.title
  const target = parseTargetFor(doc.mime, filename)
  if (extension === 'pdf' || mime === 'application/pdf') return 'pdf'
  if (['doc', 'docx', 'odt', 'rtf'].includes(extension) || target === 'docx') return 'word'
  if (['xls', 'xlsx', 'ods', 'csv'].includes(extension) || target === 'xlsx') return 'excel'
  if (['ppt', 'pptx', 'odp'].includes(extension) || target === 'pptx') return 'powerpoint'
  if (['html', 'htm'].includes(extension) || target === 'html') return 'html'
  if (['md', 'markdown'].includes(extension) || target === 'markdown') return 'note'
  if (extension === 'txt' || (!extension && mime === 'text/plain')) return 'text'
  if (
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(extension) ||
    mime.startsWith('image/')
  )
    return 'image'
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(extension) || mime.startsWith('audio/'))
    return 'audio'
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(extension) || mime.startsWith('video/'))
    return 'video'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension) || mime === 'application/zip')
    return 'archive'
  if (
    [
      'js',
      'ts',
      'tsx',
      'jsx',
      'py',
      'go',
      'rs',
      'java',
      'c',
      'cpp',
      'sh',
      'sql',
      'css',
      'json',
      'xml',
    ].includes(extension)
  )
    return 'code'
  return 'unknown'
}

/** Decorative format hint; the adjacent filename/source remains the accessible label. */
export function FileFormatIcon({
  doc,
  size = 22,
  className,
}: {
  doc: IconDocument
  size?: number
  className?: string
}) {
  const format = fileFormatOf(doc)
  const appearance = useAppearance()
  const { styles, cx } = useFileFormatIconStyles({
    color: FILE_FORMAT_COLORS[appearance][format],
    size,
  })
  return (
    <span className={cx(styles.icon, className)} data-format={format} aria-hidden="true">
      <svg viewBox="0 0 256 256" fill="currentColor" focusable="false" aria-hidden="true">
        {FILE_FORMAT_GLYPHS[format]}
      </svg>
    </span>
  )
}
