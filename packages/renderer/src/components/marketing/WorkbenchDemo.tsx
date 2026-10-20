import { BookOpen, FolderClosed, MessageSquare, Search } from 'lucide-react'
import { BrandLockup } from '../BrandMark'
import { StatusBadge } from '../DocumentBadges'
import { MarkdownBody } from '../document/MarkdownBody'
import { FileFormatIcon } from '../library/FileFormatIcon'
import { useWorkbenchStyles } from './WorkbenchDemo.style'

const documents = [
  { title: '知识管理方法', kind: 'note', mime: null, fileExtension: 'md' },
  { title: '产品访谈.pdf', kind: 'file', mime: 'application/pdf', fileExtension: 'pdf' },
  { title: '关于长期写作的几个想法', kind: 'web', mime: null, fileExtension: null },
] as const
const body = `我们收集资料，是为了在需要的时候，重新找到它。\n\n## 给未来的自己留一条线索\n\n保存一篇文章时，顺手记下「为什么值得留下」。一个具体的问题，往往比一串分类更容易唤起当时的思考。\n\n- 把自己的笔记和参考资料放在一起\n- 用目录和标签整理，而不必一次想好结构\n- 先问一个问题，再回到原文核对\n\n## 让思考继续发生\n\n答案是下一次阅读的起点。保留来源，也是在为未来的判断保留余地。`

/** Real product primitives, rendered with neutral, fixed samples and no data hooks. */
export function WorkbenchDemo() {
  const { styles } = useWorkbenchStyles()
  return (
    <div className={styles.frame} role="group" aria-label="知识工作台示例">
      <aside className={styles.sidebar} aria-label="示例知识库">
        <div className={styles.brand}>
          <BrandLockup markSize={20} />
        </div>
        <div className={styles.navItem}>
          <Search size={16} aria-hidden="true" />
          搜索
        </div>
        <div className={styles.navItem}>
          <MessageSquare size={16} aria-hidden="true" />问 AI
        </div>
        <div className={styles.groupLabel}>知识库</div>
        <div className={styles.selected}>
          <BookOpen size={16} aria-hidden="true" />
          产品研究
        </div>
        <div className={styles.navItem}>
          <BookOpen size={16} aria-hidden="true" />
          阅读与摘录
        </div>
        <div className={styles.navItem}>
          <BookOpen size={16} aria-hidden="true" />
          写作素材
        </div>
        <div className={styles.groupLabel}>产品研究</div>
        <div className={styles.navItem}>
          <FolderClosed size={16} aria-hidden="true" />
          访谈与观察
        </div>
        <div className={styles.documents}>
          {documents.map((doc, index) => (
            <div
              key={doc.title}
              className={index === 0 ? styles.documentSelected : styles.document}
            >
              <FileFormatIcon doc={doc} size={18} />
              <span>{doc.title}</span>
            </div>
          ))}
        </div>
        <div className={styles.sidebarFoot}>资料、笔记，在同一个地方。</div>
      </aside>
      <div className={styles.reading}>
        <div className={styles.toolbar}>
          <span>产品研究 / 知识管理方法</span>
          <StatusBadge status="ready" showReady quiet />
        </div>
        <article className={styles.paper}>
          <h2>知识管理方法</h2>
          <p className={styles.meta}>示例笔记 · Markdown 正文</p>
          <MarkdownBody body={body} headings={[]} />
        </article>
      </div>
      <aside className={styles.assistant} aria-label="问答节选示例">
        <div className={styles.toolbar}>
          <MessageSquare size={16} aria-hidden="true" />问 AI · 回答节选
        </div>
        <div className={styles.conversation}>
          <p className={styles.prompt}>怎样让收集的资料真正用起来？</p>
          <p>
            试着从一个具体问题开始。自己的笔记能提供思考线索，收集的资料补充依据；找到答案之后，再读一遍它的来源。
          </p>
          <div className={styles.quote}>
            <span>[1] 知识管理方法</span>
            <blockquote>一个具体的问题，往往比一串分类更容易唤起当时的思考。</blockquote>
          </div>
          <p className={styles.meta}>此处为静态节选，引用交互见上方演示。</p>
        </div>
      </aside>
    </div>
  )
}
