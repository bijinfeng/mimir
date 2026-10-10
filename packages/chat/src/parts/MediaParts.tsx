import type {
  FileMessagePartProps,
  ImageMessagePartProps,
  SourceMessagePartProps,
} from '@assistant-ui/react'
import { createStyles } from 'antd-style'
import {
  Download,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
} from 'lucide-react'

/**
 * **来源**（`source` part）与**文件 / 图片**（`file` / `image` part）——
 * 官方 `sources.tsx`、`file.tsx`、`image.tsx` 的换算（用户点名「AG-UI 的
 * 消息体类型每一种都按 assistant-ui 还原」；这三类此前同样静默丢弃——
 * 引擎的默认组件在 react 平台上是 `() => null`）。
 *
 * ## 它们什么时候出现
 *
 *  - `source`：`MESSAGES_SNAPSHOT` 带回的引用来源（未来接网页检索 /
 *    外部工具时是主路径；mimir 自己的引用走 `mimir.citations` data part，
 *    两者并存不冲突）
 *  - `file` / `image`：用户带附件或工具产物（M0 无附件上传，同样为
 *    「引擎会聚、界面要认」的一类）
 *
 * ## 形态（官方逐条）
 *
 * - **source pill**：域名首字母徽标（`size-4 rounded text-[8px]`、
 *   `foreground/8` 底）+ 标题；点击经安全 href 新开
 * - **file chip**：`inline-flex items-center gap-3 rounded-lg border
 *   px-3 py-2`，左侧按 mime 取图标（image / pdf / text / json / audio /
 *   video / 默认），右侧文件名与**下载钮**（官方 DownloadIcon）
 * - **image**：圆角缩略图（最大 320px 宽），点击原图新开
 */
const useStyles = createStyles(({ css, token }) => ({
  /* —— source pill —— */
  source: css`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 4px 6px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 9999px;
    background: none;
    color: ${token.colorTextSecondary};
    font-size: var(--mimir-chat-font-badge, 11.5px);
    text-decoration: none;
    cursor: pointer;
    transition:
      color 0.12s ease-out,
      border-color 0.12s ease-out;

    &:hover,
    &:focus-visible {
      color: ${token.colorText};
      border-color: ${token.colorBorder};
    }
    &:focus-visible {
      outline: 1px solid ${token.colorPrimaryBorder};
      outline-offset: 2px;
    }
  `,
  badge: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: ${token.borderRadiusSM}px;
    background: ${token.colorFillQuaternary};
    color: ${token.colorTextQuaternary};
    /* 官方这里是 text-[9px]，低于本仓 DESIGN §4.2 的可读底线（10.5px）
       ——字号阶梯是唯一来源（design.test.ts 守着），取最小的一档 badge。
       角色一致（底色衬托的微型标签），偏差 2.5px，记录在案 */
    font-size: var(--mimir-chat-font-badge, 11.5px);
    font-weight: 500;
  `,
  /* —— file chip —— */
  file: css`
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    font-size: var(--mimir-chat-font-note, 12.5px);
    color: ${token.colorTextSecondary};
    transition: background-color 0.12s ease-out;

    &:hover {
      background: ${token.colorFillQuaternary};
    }
  `,
  fileIcon: css`
    flex: none;
    width: 16px;
    height: 16px;
    color: ${token.colorTextQuaternary};
  `,
  fileName: css`
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 320px;
  `,
  download: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex: none;
    border: none;
    background: none;
    border-radius: ${token.borderRadiusSM}px;
    color: ${token.colorTextQuaternary};
    cursor: pointer;
    transition:
      color 0.12s ease-out,
      background-color 0.12s ease-out;

    &:hover,
    &:focus-visible {
      color: ${token.colorText};
      background: ${token.colorFillTertiary};
    }
    &:focus-visible {
      outline: 1px solid ${token.colorPrimaryBorder};
      outline-offset: 2px;
    }
  `,
  image: css`
    display: block;
    max-width: 320px;
    border-radius: ${token.borderRadiusLG}px;
    border: 1px solid ${token.colorBorderSecondary};
  `,
  /* 只给读屏的文案（"在新标签页打开"）。clip-path 而不是 display:none
     ——后者会把它从无障碍树上摘掉 */
  srOnly: css`
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  `,
}))

/**
 * mime → 图标（官方 getMimeTypeIcon 的换算）。
 *
 * 返回 **JSX 而不是组件**：lucide 的图标是 forwardRef 对象，不能当普通
 * 函数调用；而「先 `const Icon = …` 再 `<Icon/>`」会被
 * `react(static-components)` 判成「渲染期创建组件」并让 React Compiler
 * 静默跳过整个组件（铁律 1 的同类，.trellis/spec/project/rules.md 记过）。返回 JSX、
 * 就地调用是唯一两头都不踩的写法。
 */
function renderMimeIcon(mimeType: string, className: string) {
  const type = mimeType.toLowerCase()
  if (type.startsWith('image/')) return <ImageIcon className={className} aria-hidden />
  if (type === 'application/pdf' || type.startsWith('text/'))
    return <FileText className={className} aria-hidden />
  if (type.startsWith('audio/')) return <Music className={className} aria-hidden />
  if (type.startsWith('video/')) return <Video className={className} aria-hidden />
  return <FileIcon className={className} aria-hidden />
}

/** 安全 href：只放行 data: / http(s) / blob（官方同款白名单） */
function safeFileHref(data: string, mimeType: string): string | null {
  if (/^data:/i.test(data) || /^https?:\/\//i.test(data) || /^blob:/i.test(data)) return data
  if (/^[a-z][a-z\d+.-]*:/i.test(data)) return null
  return `data:${mimeType};base64,${data}`
}

/** 官方 hostOf：URL → 域名（给 pill 的徽标与文案） */
function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

export function SourcePart(props: SourceMessagePartProps) {
  const { styles } = useStyles()
  const href = props.sourceType === 'url' ? (props.url ?? null) : null
  const domain = hostOf(href ?? undefined)
  const fallbackName = props.sourceType === 'document' ? props.filename : undefined
  const label = props.title ?? fallbackName ?? domain ?? '来源'
  const initial = (domain ?? label).charAt(0).toUpperCase()

  if (href === null) {
    return (
      <span className={styles.source}>
        <span className={styles.badge}>{initial}</span>
        {label}
      </span>
    )
  }

  return (
    <a className={styles.source} href={href} target="_blank" rel="noopener noreferrer">
      <span className={styles.badge}>{initial}</span>
      {label}
      <span className={styles.srOnly}>（在新标签页打开）</span>
    </a>
  )
}

/** file chip 的本体。FilePart 与 AudioPart 的字段形状不同，
    共用这一件（两处各写一份必然漂移） */
function FileChip({
  data,
  mimeType,
  filename,
}: {
  data: string
  mimeType: string
  filename?: string | undefined
}) {
  const { styles } = useStyles()
  const href = safeFileHref(data, mimeType)

  return (
    <span className={styles.file}>
      {renderMimeIcon(mimeType, styles.fileIcon)}
      <span className={styles.fileName}>{filename ?? mimeType}</span>
      {href !== null && (
        <a
          className={styles.download}
          href={href}
          download={filename}
          aria-label={`下载 ${filename ?? '文件'}`}
        >
          <Download size={14} />
        </a>
      )}
    </span>
  )
}

export function FilePart({ data, mimeType, filename }: FileMessagePartProps) {
  return <FileChip data={data} mimeType={mimeType} filename={filename} />
}

/**
 * `audio` part（引擎里已废弃的类型，提示改经 File 槽渲染 audio/*）。
 * AG-UI 今天没有音频事件，但类型在、就不许静默丢弃：换算成 FilePart
 * 同款的 chip（music 图标由 mime 决定）。
 */
export function AudioPart({ audio }: { audio: { data: string; format: 'mp3' | 'wav' } }) {
  return <FileChip data={audio.data} mimeType={`audio/${audio.format}`} />
}

export function ImagePart({ image }: ImageMessagePartProps) {
  const { styles } = useStyles()

  return (
    <a href={image} target="_blank" rel="noopener noreferrer" aria-label="查看原图">
      <img className={styles.image} src={image} alt="" />
    </a>
  )
}
