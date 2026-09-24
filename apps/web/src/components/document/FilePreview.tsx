import { FileOutlined, WarningOutlined } from '@ant-design/icons'
import { Button, Empty, Segmented, Typography } from 'antd'
import { useState } from 'react'
import { createStyles } from 'antd-style'
import {
  formatBytes,
  formatLabel,
  parseSupport,
  viewerFor,
  type DocumentDetail,
} from '@mimir/shared'
import { MarkdownBody } from '@/components/document/MarkdownBody'
import { useContentStyles } from '@/components/ContentTypography.style'
import { api } from '@/lib/api'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 文件类文档的预览区（`docs/DESIGN.md` §8.16）。
 *
 * ## 两层：正文与原件
 *
 * 一份文件有两个可看的东西，它们回答不同的问题：
 *
 * | 层 | 是什么 | 回答 |
 * |---|---|---|
 * | 正文 | 从原件提取出的文本 | 「它讲了什么」（可选中、可被 AI 引用） |
 * | 原件 | 上传的原始文件 | 「它原样长什么样」（PDF 的表格、Word 的版式） |
 *
 * `Segmented` **只在两层都有东西时才出现**。这比「永远显示两个页签」好：
 * 一个点了没反应的页签是假的选择（`docs/DESIGN.md` §7.4 的同一条判断），
 * 而多数文件只有一层——PDF 只有原件、txt 只有正文、图片只有原件。
 *
 * ## 每种格式族的原件查看器都用浏览器自带能力
 *
 * | 格式 | 用什么 | 代价 |
 * |---|---|---|
 * | PDF | `<iframe>` 指向下载端点 | 观感随浏览器（都是原生阅读器，带翻页缩放） |
 * | 图片 | `<img>` | 无 |
 * | 音频 / 视频 | `<audio>` / `<video>` | 需要 Range，服务端已实现单段 |
 * | 其他 | 一张说明卡片 + 下载按钮 | 无 |
 *
 * 一分钱依赖都不花。pdf.js 那 1MB 换来的是一致的外观与可控的工具栏——
 * 那要等到「PDF 批注」这个需求真出现时再算（`docs/PRD.md` §4 M2）。
 *
 * ## 查看器报错要降级，不留白
 *
 * HEIC 这类格式能通过 MIME 判断，但不是所有浏览器都渲染得了 `<img>`。
 * 加载失败时**降级成「下载原件」卡片**——空白在那里等于说「这个文件是空的」，
 * 而它只是这个浏览器看不了。与热力图把「用量未上报」画成斜纹同一条规矩。
 */
export function FilePreview({ doc }: { doc: DocumentDetail }) {
  const { styles } = useStyles()
  const { styles: contentStyles } = useContentStyles()

  const support = parseSupport(doc.mime, doc.title)
  const viewer = viewerFor(doc.mime)
  const hasBody = doc.body.trim() !== ''
  const hasSource = doc.sourceKey !== null

  const [layer, setLayer] = useState<'body' | 'source'>('body')
  // 查看器加载失败（浏览器不支持这个格式）。按 `doc.id` 记住失败，
  // 换一篇文档时重置——否则「上一篇看不了」会跟着显示到下一篇上
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const viewerFailed = failedFor === doc.id

  const showTabs = hasBody && hasSource
  const active = showTabs ? layer : hasBody ? 'body' : 'source'

  return (
    <div className={styles.wrap}>
      {showTabs && (
        <div className={styles.tabs}>
          <Segmented
            size="small"
            value={active}
            onChange={(value) => setLayer(value as 'body' | 'source')}
            options={[
              { label: '正文', value: 'body' },
              { label: '原件', value: 'source' },
            ]}
          />
        </div>
      )}

      {/*
        正文为空时说明原因。**这是这块界面最要紧的一句话**：
        「还没有提取实现」与「提取失败」对用户的含义完全不同，
        而留白或统一说「暂无正文」会让两种都变成「不知道出了什么事」
      */}
      {!hasBody && !hasSource && (
        <Empty
          image={<FileOutlined className={styles.bigIcon} />}
          description={
            <span>
              {doc.parseError !== null
                ? `提取正文失败：${doc.parseError}`
                : support === 'planned'
                  ? '这种格式的正文提取将在后续版本支持'
                  : '文件里没有可提取的文字'}
              <span className={styles.hint}>原件已经保存，可以下载查看</span>
            </span>
          }
        />
      )}

      {!hasBody && hasSource && (
        <div className={styles.sourceOnly}>
          <div className={styles.note}>
            {doc.parseError !== null
              ? `提取正文失败：${doc.parseError}`
              : support === 'planned'
                ? '这种格式的正文提取将在后续版本支持——原件可以正常打开'
                : '这个文件没有可提取的文字'}
          </div>
          {renderSource()}
        </div>
      )}

      {hasBody && active === 'body' && (
        <>
          {/*
            文本类文件的正文是**原样文本**，不是 Markdown。
            csv / json 里有大量换行与井号，走 Markdown 渲染会把换行折叠、
            把 `#` 当标题——那是主动把内容显示错。所以按 mime 分派：
            只有从 HTML / markdown / Office 提取出来的才走 Markdown 渲染
          */}
          {isPlainText(doc.mime) ? (
            <pre className={styles.plain}>{doc.body}</pre>
          ) : (
            /* 正文排版与编辑器共用同一个类——两个视图都渲染同一份 Markdown，
               排版必须同源（见 components/ContentTypography.style.ts 的说明） */
            <div className={contentStyles.content}>
              <MarkdownBody body={doc.body} headings={[]} />
            </div>
          )}

          {/*
            从 Office 提取的正文要说明「这是提取的结果」——
            版式与原件不同（表格线、字体、页眉页脚都不还原），
            不说的话用户会拿它跟 Word 比对，然后以为渲染坏了
          */}
          {isExtracted(doc.mime) && (
            <div className={styles.note}>
              以上文字是从原件里提取的，版式与原件不同（不含字体、页眉页脚与图片位置）。
              要看原样请切换「原件」。
            </div>
          )}
        </>
      )}

      {hasBody && active === 'source' && renderSource()}
    </div>
  )

  function renderSource() {
    if (!hasSource) return null

    if (viewerFailed || viewer === 'none') {
      return (
        <div className={styles.card}>
          <WarningOutlined className={styles.cardIcon} />
          <div className={styles.cardText}>
            <Typography.Text strong>
              {viewerFailed
                ? '这个浏览器打不开这种格式'
                : `${formatLabel(doc.mime, doc.title)} 没有在线预览`}
            </Typography.Text>
            <div className={styles.cardHint}>
              {doc.mime ? `${doc.mime} · ${formatBytes(doc.size ?? 0)}` : null}
            </div>
          </div>
          <Button type="primary" href={api.documents.sourceUrl(doc.id, { download: true })}>
            下载原件
          </Button>
        </div>
      )
    }

    const url = api.documents.sourceUrl(doc.id)

    if (viewer === 'pdf') {
      return (
        /*
         * **不加 `sandbox`，这是有意的。** Chrome 与 Edge 的内置 PDF 阅读器
         * 在 sandbox 化的 frame 里**根本不渲染**（Firefox 对本地 PDF 的处理也不
         * 一致）——加上它等于把这一层唯一的功能去掉。而它换来的防护是空的：
         * 内容是 PDF（由 MIME 判定），服务端发的是 `application/pdf` +
         * `X-Content-Type-Options: nosniff`，跨源脚本进不来（同源是真的，
         * 但同源不等于能执行任意脚本——PDF 阅读器是浏览器自己的沙箱）。
         *
         * 参考：`<img>` / `<video>` 那两个也一样，它们本来就没有脚本执行环境。
         */
        // oxlint-disable-next-line react/iframe-missing-sandbox -- 见上：sandbox 会让 PDF 阅读器整块失效
        <iframe
          className={styles.frame}
          src={url}
          title={doc.title}
          onError={() => setFailedFor(doc.id)}
        />
      )
    }

    if (viewer === 'image') {
      return (
        <img
          className={styles.image}
          src={url}
          alt={doc.title}
          onError={() => setFailedFor(doc.id)}
        />
      )
    }

    if (viewer === 'audio') {
      return (
        <audio className={styles.media} src={url} controls onError={() => setFailedFor(doc.id)} />
      )
    }

    return (
      <video className={styles.media} src={url} controls onError={() => setFailedFor(doc.id)} />
    )
  }
}

/** 原样文本：`.txt` / `.csv` / `.json` / 代码……按 UTF-8 读出来就是它的内容 */
function isPlainText(mime: string | null): boolean {
  const lower = (mime ?? '').toLowerCase()
  if (lower === 'text/markdown' || lower === 'text/html') return false
  return lower.startsWith('text/') || lower === 'application/json'
}

/** 从 Office 原件提取来的正文（标记「版式不同」的那一句） */
function isExtracted(mime: string | null): boolean {
  const lower = (mime ?? '').toLowerCase()
  return (
    lower.includes('wordprocessingml') ||
    lower.includes('spreadsheetml') ||
    lower.includes('presentationml')
  )
}

const useStyles = createStyles(({ css, token }) => ({
  wrap: css`
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  tabs: css`
    display: flex;
    justify-content: flex-start;
  `,
  plain: css`
    margin: 0;
    padding: 14px 16px;
    background: ${token.colorFillQuaternary};
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 8px;
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.excerpt}px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 70vh;
    overflow: auto;
  `,
  frame: css`
    width: 100%;
    /* 用视口高度而不是固定 px：右栏宽度随折叠左栏变化，高度则跟着窗口 */
    height: 78vh;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 8px;
    background: ${token.colorFillQuaternary};
  `,
  image: css`
    max-width: 100%;
    /* 自适应到内容列宽度。点击查看实际大小由浏览器原生行为提供
       （图片在新标签打开）——不做自己的缩放控件 */
    border-radius: 8px;
    border: 1px solid ${token.colorBorderSecondary};
  `,
  media: css`
    width: 100%;
    max-height: 70vh;
    border-radius: 8px;
    background: ${token.colorFillQuaternary};
  `,
  sourceOnly: css`
    display: flex;
    flex-direction: column;
    gap: 10px;
  `,
  card: css`
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 20px;
    background: ${token.colorFillQuaternary};
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 10px;
  `,
  cardIcon: css`
    font-size: 22px; /* 图标字形，非文本 */
    color: ${token.colorTextTertiary};
  `,
  cardText: css`
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
    min-width: 0;
  `,
  cardHint: css`
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextTertiary};
    word-break: break-all;
  `,
  bigIcon: css`
    font-size: 34px; /* 图标字形，非文本 */
    color: ${token.colorTextQuaternary};
  `,
  note: css`
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextTertiary};
    line-height: 1.7;
  `,
  hint: css`
    display: block;
    margin-top: 6px;
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextQuaternary};
  `,
}))
