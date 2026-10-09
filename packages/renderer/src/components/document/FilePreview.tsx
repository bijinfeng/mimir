import { Button, Empty, Typography } from 'antd'
import { createStyles } from 'antd-style'
import { File, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import {
  formatBytes,
  formatLabel,
  parseSupport,
  viewerFor,
  type DocumentDetail,
} from '@mimir/shared'
import { MarkdownBody } from './MarkdownBody'
import { OfficeSourceEditor } from './OfficeSourceEditor'
import { useContentStyles } from '../ContentTypography.style'
import { api } from '../../lib/api'
import { FONT_SIZE } from '../../theme/tokens'

/**
 * 文件类文档的预览区（`docs/DESIGN.md` §8.16）。
 *
 * ## 直接看原件，没有层切换（D-054）
 *
 * 这里原先有一个「正文 / 原件」分段控件：正文是从原件提取出的文本（回答
 * 「它讲了什么」），原件是上传的文件（回答「它原样长什么样」）。用户反馈
 * 那个切换**不伦不类**——多数时候两个都要看，而切来切去只是让「我现在看的
 * 是哪一层」变成一个需要记的问题。现在只有一层：**原件**。
 *
 * 三层判断，按「能不能真的看到东西」排序：
 *
 * | 情况 | 显示 | 为什么 |
 * |---|---|---|
 * | 有专用查看器（PDF / 图片 / 音视频 / Office） | 原件 | 那是文件本身的样子，也是编辑入口 |
 * | 没有查看器但提取出了正文（txt / csv / json / 旧版 doc） | 正文 | 文本文件的正文**就是**它的原样，别处看不到 |
 * | 两个都没有 | 说明卡片 + 下载 | 空白在那里等于说「这个文件是空的」 |
 *
 * **提取结果仍然可搜、可被 AI 引用**——那一层没有消失，只是不再占一个页签：
 * 它活在检索索引里，这也是它真正的用途（`docs/PRD.md` §2.2）。
 *
 * ## 每种格式族的原件查看器都用浏览器自带能力
 *
 * | 格式 | 用什么 | 代价 |
 * |---|---|---|
 * | PDF | `<iframe>` 指向下载端点 | 观感随浏览器（都是原生阅读器，带翻页缩放） |
 * | 图片 | `<img>` | 无 |
 * | 音频 / 视频 | `<audio>` / `<video>` | 需要 Range，服务端已实现单段 |
 * | Office | `OfficeSourceEditor`（可编辑） | 见 `packages/office` |
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
export function FilePreview({
  doc,
  onDirtyChange,
}: {
  doc: DocumentDetail
  /** 原件编辑器有未保存改动时上报（宿主用它拦截离开） */
  onDirtyChange?: ((dirty: boolean) => void) | undefined
}) {
  const { styles } = useStyles()
  const { styles: contentStyles } = useContentStyles()

  const support = parseSupport(doc.mime, doc.title)
  const viewer = viewerFor(doc.mime)
  const hasBody = doc.body.trim() !== ''
  const hasSource = doc.sourceKey !== null

  /**
   * 这一份能不能看到东西，以及看的是什么。**由一个判据导出**，不是三个
   * 并列的布尔——并列的话「有没有原件」与「有没有查看器」的组合会退化成
   * 四五个分支，而其中一半是空态。
   */
  const showsSource = hasSource && viewer !== 'none'
  const showsBody = !showsSource && hasBody

  // 查看器加载失败（浏览器不支持这个格式）。按 `doc.id` 记住失败，
  // 换一篇文档时重置——否则「上一篇看不了」会跟着显示到下一篇上
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const viewerFailed = failedFor === doc.id

  /**
   * 提取失败/没提取到时要说明原因。**这是这一块最要紧的一句话**：
   * 「还没有提取实现」与「提取失败」对用户的含义完全不同（前者等支持、
   * 后者可能文件坏了），而留白或统一说「暂无正文」会让两种都变成
   * 「不知道出了什么事」。
   *
   * 它不挡路——原件照常显示，说明挂在它上面。
   */
  const extractNote =
    doc.parseError !== null
      ? `正文提取失败：${doc.parseError}`
      : hasBody
        ? null
        : support === 'planned'
          ? '这种格式的正文提取将在后续版本支持，所以它暂时搜不到——原件可以正常查看'
          : '这个文件里没有可提取的文字，所以它暂时搜不到'

  return (
    <div className={styles.wrap}>
      {extractNote !== null && !showsBody && <div className={styles.note}>{extractNote}</div>}

      {showsSource ? (
        renderSource()
      ) : showsBody ? (
        <>
          {/*
            文本类文件的正文是**原样文本**，不是 Markdown。
            csv / json 里有大量换行与井号，走 Markdown 渲染会把换行折叠、
            把 `#` 当标题——那是主动把内容显示错。所以按 mime 分派：
            只有从 HTML / markdown / Office 提取出来的才走 Markdown 渲染
          */}
          {extractNote !== null && <div className={styles.note}>{extractNote}</div>}
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
            不说的话用户会拿它跟 Word 比对，然后以为渲染坏了。

            只有**看不到原件**时才会走到这里（如旧版 .doc 没有浏览器内
            查看器）：能看到原件时，那个原件本身就是答案
          */}
          {isExtracted(doc.mime) && (
            <div className={styles.note}>
              以上文字是从原件里提取的，版式与原件不同（不含字体、页眉页脚与图片位置）。
            </div>
          )}
        </>
      ) : hasSource ? (
        /*
          「有原件、但没有查看器也没有正文」的降级态（`归档资料.zip` 就是）。

          **它必须带一个主按钮。** DESIGN §8.16 给这一档的规定是「图标 +
          「{格式} 没有在线预览」+ 主按钮『下载原件』」，而第一版只有一个
          antd `Empty`：整屏（x 204–1440、y 80–866）没有第二个可点元素，
          唯一的出口是 44px 头部最右端那个「下载」——而提示语正说着
          「可以下载查看」（实测整页可点的只有侧栏 9 项加头部四个按钮）。
          说得出下一步却不给入口，比不说更让人以为坏了。

          形状与 `renderSource()` 里那张降级卡片**同一张**：两处说的是
          同一件事（这个格式没有在线预览），按钮文案也必须是同一句
          ——两处各写一套的话，同一件事在界面上会有两种说法。
        */
        <div className={styles.card}>
          <File className={styles.cardIcon} size={22} />
          <div className={styles.cardText}>
            <Typography.Text strong>
              {doc.parseError !== null
                ? `提取正文失败：${doc.parseError}`
                : `${formatLabel(doc.mime, doc.title)} 没有在线预览`}
            </Typography.Text>
            <div className={styles.cardHint}>原件已经保存，可以下载查看</div>
          </div>
          <Button type="primary" href={api.documents.sourceUrl(doc.id, { download: true })}>
            下载原件
          </Button>
        </div>
      ) : (
        /* 没有原件的记录：**不给下载按钮**——没有东西可下，点了只会得到
           一个 404，那正是 DESIGN §7.4 说的假动作 */
        <Empty
          image={<File className={styles.bigIcon} size={34} />}
          description={
            <span>
              {doc.parseError !== null
                ? `提取正文失败：${doc.parseError}`
                : `${formatLabel(doc.mime, doc.title)} 没有在线预览`}
            </span>
          }
        />
      )}
    </div>
  )

  function renderSource() {
    if (!hasSource) return null

    if (viewerFailed || viewer === 'none') {
      return (
        <div className={styles.card}>
          <TriangleAlert className={styles.cardIcon} size={22} />
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

    /*
      Office 族的原件层 = **可编辑**（`packages/office`，vendored 自 GenOffice）。

      三种格式走同一个组件：差别在包内部（解析与保存路径），宿主这一层只负责
      「取字节 / 写回字节」。所以这里不需要按格式分三个分支——分出来的话每个
      分支都要各自记得传 `onDirtyChange`，漏一个就是丢改动的路径。

      改动保存回原件后，服务端会重算正文与哈希（TECH §13.9），所以编辑完
      立刻可检索。
    */
    if (viewer === 'office' || viewer === 'sheet' || viewer === 'deck' || viewer === 'html') {
      const kind =
        viewer === 'office'
          ? 'docx'
          : viewer === 'sheet'
            ? 'xlsx'
            : viewer === 'deck'
              ? 'pptx'
              : 'html'
      return <OfficeSourceEditor key={doc.id} doc={doc} kind={kind} onDirtyChange={onDirtyChange} />
    }

    /*
      PDF 现在也走编辑器（`packages/office` 的 PdfEditor，D-056）：pdf.js 渲染
      每页到 canvas，pdf-lib 做页面级操作（旋转、删除、重排）。

      它不再用 `<iframe>` 指向下载端点——浏览器内置阅读器我们控制不了，
      也就没法在它上面做编辑。
    */
    if (viewer === 'pdf') {
      return <OfficeSourceEditor key={doc.id} doc={doc} kind="pdf" onDirtyChange={onDirtyChange} />
    }

    if (viewer === 'image') {
      /*
        图片**只封顶、不放大**（DESIGN §8.16：「`<img>`，`max-width: 100%`，
        圆角 8px」）。

        `.imageLink` 上的 `align-self: flex-start` 是这句话的落点：内容列是
        flex 列、默认 `align-items: stretch`，于是 `max-width` 只挡住放大、
        挡不住**拉伸**——实测 880×520 的原件在 1240px 的列里被画成 1240×734
        （放大 1.41 倍后插值，图比原件糊）。`align-self` 让它按自己的尺寸
        排，`max-width` 仍在窄窗口下把它收进列宽。
      */
      return (
        <a
          className={styles.imageLink}
          href={url}
          target="_blank"
          rel="noreferrer"
          title="在新标签打开原件（实际大小）"
        >
          <img
            className={styles.image}
            src={url}
            alt={doc.title}
            onError={() => setFailedFor(doc.id)}
          />
        </a>
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
    /* 撑满内容列：原件（纸张、表格、幻灯片）是「越宽越好看清」的东西 */
    flex: 1;
    min-width: 0;
    /*
     * **min-height: 0 是高度链里必需的一环。**
     *
     * 这一层夹在内容列（innerWide）与主题变量层（editor-theme-bridge
     * 的 vars）之间，两边都写了 min-height: 0，只有它默认 auto
     * ——于是 flex 子项的自动最小尺寸又把外壳撑到内容高（实测 pptx：
     * 容器 856px、外壳 888px），超出视口的那一截正是附属面板与状态行
     * 所在的位置。链上少一环不会报错，只让底部那一格「消失」（DESIGN §7.7）。
     */
    min-height: 0;
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
  /*
    图片这一格。**它是链接**——「看真实大小」需要一个出口，而原注释声称
    「点击查看实际大小由浏览器原生行为提供（图片在新标签打开）」，实测
    `img.closest('a') === null`、`cursor: auto`、点一下 location 不变：
    那个行为不存在（这类「注释说得像已经做了」的地方只有对着界面点一次
    才发现）。所以要么把注释删掉，要么把链接补上——补上更省事，也把
    「原件到底多大」这条信息还给用户。
  */
  imageLink: css`
    /* 只封顶、不拉伸：见上面调用处的说明 */
    align-self: flex-start;
    max-width: 100%;
    display: block;
    border-radius: 8px;
    transition: opacity 0.12s ease-out;

    &:hover {
      opacity: 0.88;
    }
  `,
  image: css`
    max-width: 100%;
    /* 宽高按原件比例，不放大——列比图宽时它保持自己的像素尺寸 */
    height: auto;
    /* 圆角与外框在链接这一层，图片自己不再画，避免两层边线 */
    border-radius: 8px;
    border: 1px solid ${token.colorBorderSecondary};
    display: block;
  `,
  media: css`
    width: 100%;
    max-height: 70vh;
    border-radius: 8px;
    background: ${token.colorFillQuaternary};
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
}))
