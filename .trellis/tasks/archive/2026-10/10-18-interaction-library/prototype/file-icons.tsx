import type { Doc } from './fixtures'
import { OriginalFormatIcon } from './original-icons'
import a_word from './assets/phosphor/file-doc-duotone.svg?raw'
import a_excel from './assets/phosphor/file-xls-duotone.svg?raw'
import a_powerpoint from './assets/phosphor/file-ppt-duotone.svg?raw'
import a_pdf from './assets/phosphor/file-pdf-duotone.svg?raw'
import a_note from './assets/phosphor/file-md-duotone.svg?raw'
import a_html from './assets/phosphor/file-html-duotone.svg?raw'
import a_image from './assets/phosphor/file-image-duotone.svg?raw'
import a_audio from './assets/phosphor/file-audio-duotone.svg?raw'
import a_video from './assets/phosphor/file-video-duotone.svg?raw'
import a_archive from './assets/phosphor/file-zip-duotone.svg?raw'
import a_code from './assets/phosphor/file-code-duotone.svg?raw'
import a_text from './assets/phosphor/file-text-duotone.svg?raw'
import a_unknown from './assets/phosphor/file-duotone.svg?raw'
import a_web from './assets/phosphor/globe-hemisphere-west-duotone.svg?raw'
import a_wechat from './assets/phosphor/wechat-logo-duotone.svg?raw'
import a_github from './assets/phosphor/github-logo-duotone.svg?raw'
import b_word from './assets/material/word.svg?raw'
import b_excel from './assets/material/table.svg?raw'
import b_powerpoint from './assets/material/powerpoint.svg?raw'
import b_pdf from './assets/material/pdf.svg?raw'
import b_note from './assets/material/markdown.svg?raw'
import b_html from './assets/material/html.svg?raw'
import b_image from './assets/material/image.svg?raw'
import b_audio from './assets/material/audio.svg?raw'
import b_video from './assets/material/video.svg?raw'
import b_archive from './assets/material/zip.svg?raw'
import b_code from './assets/material/xml.svg?raw'
import b_text from './assets/material/document.svg?raw'
import b_unknown from './assets/material/document.svg?raw'
import b_web from './assets/material/http.svg?raw'

export type IconScheme = 'A' | 'B' | 'original'
export const schemeNames: Record<IconScheme, string> = {
  A: 'A · 统一双色',
  B: 'B · 鲜明格式',
  original: '原稿',
}
export const formatTypes = [
  { id: 'word', kind: 'Word', ext: '.docx', label: 'Word', sample: '交互设计规范' },
  { id: 'excel', kind: 'Excel', ext: '.xlsx', label: 'Excel', sample: '组件验收清单' },
  {
    id: 'powerpoint',
    kind: 'PowerPoint',
    ext: '.pptx',
    label: 'PowerPoint',
    sample: '秋季产品分享',
  },
  { id: 'pdf', kind: 'PDF', ext: '.pdf', label: 'PDF', sample: '知识管理研究' },
  { id: 'audio', kind: '音频', ext: '.mp3', label: '音频', sample: '访谈录音' },
  { id: 'video', kind: '视频', ext: '.mp4', label: '视频', sample: '产品演示' },
  { id: 'note', kind: '笔记', ext: '', label: '笔记', sample: '产品设计原则' },
  { id: 'image', kind: '图片', ext: '.png', label: '图片', sample: '界面截图' },
  { id: 'web', kind: '网页', ext: '', label: '网页资料', sample: '把零散的想法连接起来' },
  { id: 'wechat', kind: '公众号', ext: '', label: '公众号资料', sample: '让阅读成为日常' },
  { id: 'github', kind: 'GitHub', ext: '', label: 'GitHub 资料', sample: 'WeKnora' },
  { id: 'html', kind: 'HTML', ext: '.html', label: 'HTML', sample: '研究页面' },
  { id: 'text', kind: '文本', ext: '.txt', label: '纯文本', sample: '会议记录' },
  { id: 'archive', kind: '压缩包', ext: '.zip', label: '压缩包', sample: '项目资料归档' },
  { id: 'code', kind: '代码', ext: '.ts', label: '代码', sample: '状态处理' },
  { id: 'unknown', kind: '未知文件', ext: '.bin', label: '未知文件', sample: '未识别资料' },
] as const
const aIcons: Record<string, string> = {
  word: a_word,
  excel: a_excel,
  powerpoint: a_powerpoint,
  pdf: a_pdf,
  note: a_note,
  html: a_html,
  image: a_image,
  audio: a_audio,
  video: a_video,
  archive: a_archive,
  code: a_code,
  text: a_text,
  unknown: a_unknown,
  web: a_web,
  wechat: a_wechat,
  github: a_github,
}
const bIcons: Record<string, string> = {
  word: b_word,
  excel: b_excel,
  powerpoint: b_powerpoint,
  pdf: b_pdf,
  note: b_note,
  html: b_html,
  image: b_image,
  audio: b_audio,
  video: b_video,
  archive: b_archive,
  code: b_code,
  text: b_text,
  unknown: b_unknown,
  web: b_web,
  wechat: a_wechat,
  github: a_github,
}
export function FormatIcon({
  doc,
  scheme = 'original',
  size,
}: {
  doc: Doc
  scheme?: IconScheme
  size?: number
}) {
  if (scheme === 'original') return <OriginalFormatIcon doc={doc} size={size} />
  const format = formatTypes.find((item) => item.kind === doc.kind)
  const key = format?.id ?? 'unknown'
  const svg = (scheme === 'A' ? aIcons : bIcons)[key]!
  return (
    <span
      className={`candidate-icon candidate-${scheme}`}
      data-format={key}
      data-icon-scheme={scheme}
      aria-hidden="true"
      style={{ width: size ?? 22, height: size ?? 22 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
export function IconSchemePicker({
  value,
  onChange,
}: {
  value: IconScheme
  onChange: (value: IconScheme) => void
}) {
  return (
    <label>
      图标方案
      <select
        aria-label="图标方案"
        value={value}
        onChange={(event) => onChange(event.target.value as IconScheme)}
      >
        <option value="A">A · 统一双色（推荐候选）</option>
        <option value="B">B · 鲜明格式</option>
        <option value="original">原稿</option>
      </select>
    </label>
  )
}
