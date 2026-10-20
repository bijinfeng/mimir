import { Link } from '@tanstack/react-router'
import { Collapse } from 'antd'
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  FolderInput,
  Laptop,
  Search,
  Server,
} from 'lucide-react'
import { lazy, Suspense } from 'react'
import { BrandLockup } from '../BrandMark'
import { CitationDemo } from './CitationDemo'
import { useSiteStyles } from './OfficialSite.style'
// Keep the public hero independent of the product editor's loading cost.
const WorkbenchDemo = lazy(() =>
  import('./WorkbenchDemo').then((module) => ({ default: module.WorkbenchDemo })),
)

const REPOSITORY = 'https://github.com/bijinfeng/mimir'
const QUICK_START = `${REPOSITORY}#快速开始`
const FAQ = [
  {
    key: 'account',
    label: '这是一个在线注册就能用的服务吗？',
    children:
      'Mimir 是单用户的个人知识库。你可以在桌面端使用本机数据，也可以部署自己的服务器，再通过浏览器或桌面端连接。这里的“开始使用”会进入当前实例的工作区，未登录时先进入登录页。',
  },
  {
    key: 'ai',
    label: '使用 AI 需要准备什么？',
    children:
      '在设置中配置模型供应商与相应模型后，即可使用问答等 AI 能力；模型服务可能产生费用。未配置模型时，仍可写笔记、收集资料和进行全文搜索。桌面端离线使用本机资料，不代表 AI 一定能离线运行。',
  },
  {
    key: 'files',
    label: '文件收进去之后，原件还在吗？',
    children:
      '上传文件会保留原件，并在支持的格式中提取正文，用于搜索和引用。你可以预览、下载、替换原件，也可以随知识库导出。扫描件或图片中的文字不会自动进入知识库检索。',
  },
  {
    key: 'sync',
    label: '本机和服务器之间会自动同步吗？',
    children:
      '不会。本机数据与服务器数据各自独立。桌面端连接服务器，是在使用服务器上的知识库，不会自动同步或迁移本机内容。',
  },
]

export function OfficialSite() {
  const { styles, cx } = useSiteStyles()
  return (
    <div className={styles.page} data-scroll-restoration-id="official-site">
      <title>mimir · 记过的知识，此刻用得上</title>
      <meta
        name="description"
        content="Mimir 是自己的个人知识库。收集笔记、网页与文件，用 AI 找回线索，回到原文核对。支持桌面本机使用与自托管服务器。"
      />
      <a className={styles.skip} href="#main">
        跳至正文
      </a>
      <header className={styles.header}>
        <nav className={cx(styles.container, styles.nav)} aria-label="官网导航">
          <Link to="/" className={styles.brand} aria-label="mimir 首页">
            <BrandLockup markSize={28} />
          </Link>
          <a href="#product" data-secondary>
            产品能力
          </a>
          <a href="#deployment" data-secondary>
            数据与部署
          </a>
          <a href={REPOSITORY} target="_blank" rel="noreferrer" data-secondary>
            GitHub <ArrowUpRight size={15} aria-hidden="true" />
          </a>
          <div className={styles.actions} style={{ marginTop: 0 }}>
            <Link to="/docs" search={{ scope: 'all' }} preload={false} className={styles.primary}>
              开始使用
            </Link>
          </div>
        </nav>
      </header>
      <main id="main" className={styles.container} tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div>
            <h1 id="hero-title">
              记过的知识，
              <br />
              此刻用得上。
            </h1>
            <p>
              笔记、网页与文件，收进自己的知识库。
              <br />用 AI 找回线索，每个答案都能核对原文。
            </p>
            <div className={styles.actions}>
              <Link to="/docs" search={{ scope: 'all' }} preload={false} className={styles.primary}>
                开始使用 <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <a href="#product" className={styles.secondary}>
                看看怎么工作 <ArrowDown size={17} aria-hidden="true" />
              </a>
            </div>
          </div>
          <CitationDemo />
        </section>
        <Suspense
          fallback={
            <div className={styles.workbenchLoading} role="status">
              正在载入工作台示例…
            </div>
          }
        >
          <WorkbenchDemo />
        </Suspense>
        <div className={styles.demoCaption}>
          <span>一个工作台，连接资料与思考。</span>
          <span>真实组件渲染 · 示例资料</span>
        </div>
        <section id="product" className={styles.section} aria-labelledby="product-title">
          <div className={styles.intro}>
            <h2 id="product-title">
              不止是存下来。
              <br />
              让知识重新参与思考。
            </h2>
            <p>
              一篇笔记、一份文件、偶然读到的网页。把它们放到一起，在下次需要时，用自己的话找到它。
            </p>
          </div>
          <div className={styles.workflow}>
            <article>
              <FolderInput size={26} aria-hidden="true" />
              <h3>随手收进来</h3>
              <p>
                写 Markdown 笔记，粘贴网页、公众号或 GitHub
                链接，上传文件。用目录与标签，让资料逐渐有序。
              </p>
            </article>
            <article>
              <Search size={26} aria-hidden="true" />
              <h3>带着问题找</h3>
              <p>
                记得关键词，就直接搜索；只有一个模糊的想法，也可以向知识库提问。让分散的线索重新相遇。
              </p>
            </article>
            <article>
              <BookOpen size={26} aria-hidden="true" />
              <h3>回到原文核对</h3>
              <p>AI 回答附上来源引用，点击回到对应原文。看清出处和上下文，再形成自己的判断。</p>
            </article>
          </div>
        </section>
        <section
          id="data"
          className={cx(styles.section, styles.ownership)}
          aria-labelledby="data-title"
        >
          <div>
            <h2 id="data-title">
              知识留在
              <br />
              自己手里。
            </h2>
            <p>
              真正重要的，是多年以后仍能打开这些内容。Mimir 保留笔记与原件，也保留把它们带走的出口。
            </p>
          </div>
          <dl>
            <dt>笔记是 Markdown，文件保留原件</dt>
            <dd>
              自己的文字使用开放格式保存。上传的文件保留原件，阅读、检索与引用围绕同一份资料展开。
            </dd>
            <dt>随时导出，而非从头搬家</dt>
            <dd>
              知识库支持全量导出，包含笔记与上传的原件。备份、迁移或换一种工具，都有可带走的内容。
            </dd>
            <dt>数据归属清楚，模型选择自主</dt>
            <dd>
              本机资料存在自己的设备，服务器资料由自己的部署管理。AI
              使用你配置的模型服务；发起调用时，相关内容会发送给该服务。
            </dd>
          </dl>
        </section>
        <section id="deployment" className={styles.section} aria-labelledby="deployment-title">
          <div className={styles.intro}>
            <h2 id="deployment-title">
              放在手边，
              <br />
              或放在自己的服务器。
            </h2>
            <p>按自己的使用习惯选择。两种方式，共用熟悉的知识工作台。</p>
          </div>
          <div className={styles.deployments}>
            <article>
              <Laptop size={28} aria-hidden="true" />
              <h3>桌面本机使用</h3>
              <p>
                资料留在这台电脑，不登录也能使用本机知识库。断网时继续阅读和整理，AI
                能力取决于所配置的模型服务。
              </p>
              <a href={QUICK_START} target="_blank" rel="noreferrer">
                查看桌面运行说明 <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </article>
            <article>
              <Server size={28} aria-hidden="true" />
              <h3>自托管服务器</h3>
              <p>
                把 Mimir
                部署到自己的服务器，通过浏览器访问，也可以用桌面端连接。账号、服务与备份由自己掌控。
              </p>
              <a
                href={`${REPOSITORY}/blob/master/.trellis/spec/project/architecture.md#8-部署与安全`}
                target="_blank"
                rel="noreferrer"
              >
                查看部署说明 <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </article>
          </div>
          <p className={styles.note}>
            本机和服务器的数据各自独立。连接服务器不会自动同步或迁移本机资料。
          </p>
        </section>
        <section className={cx(styles.section, styles.faq)} aria-labelledby="faq-title">
          <h2 id="faq-title">
            开始之前，
            <br />
            你可能想知道。
          </h2>
          <Collapse ghost items={FAQ} />
        </section>
        <section className={styles.closing} aria-labelledby="start-title">
          <h2 id="start-title">
            下一次灵感，
            <br />
            从已有的知识开始。
          </h2>
          <p>给收藏的资料，一个再次被想起的机会。</p>
          <div className={styles.actions}>
            <Link to="/docs" search={{ scope: 'all' }} preload={false} className={styles.primary}>
              开始使用 mimir <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <a href={QUICK_START} target="_blank" rel="noreferrer" className={styles.secondary}>
              先看看如何部署 <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>
      <footer className={cx(styles.container, styles.footer)}>
        <Link to="/" className={styles.brand} aria-label="mimir 首页">
          <BrandLockup markSize={22} />
        </Link>
        <p>自己的知识，自己的线索。</p>
        <a href={REPOSITORY} target="_blank" rel="noreferrer">
          GitHub <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </footer>
    </div>
  )
}
