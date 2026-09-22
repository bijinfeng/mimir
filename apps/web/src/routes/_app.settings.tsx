import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Divider,
  Input,
  Switch,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { createStyles } from 'antd-style'
import { useState } from 'react'
import { api } from '@/lib/api'
import { CONTENT_WIDTH, FONT_SIZE } from '@/theme/tokens'

/**
 * 设置页。
 *
 * 它不是一堆散落的表单，而是**插件注册表的人类可读视图**（`docs/TECH.md` §7.4）：
 * 每一行「可配置的东西」都对应一个注册进接缝的实现。这样「可配置的东西」
 * 和「代码里的实现」永远一一对应，不会出现设置里有开关但代码里没有对应逻辑。
 *
 * M0 阶段真正能生效的只有几处：导出、重建索引、检索自检。
 * 其余分区**如实标注「现在改不了」**，而不是画一个存不进去的假表单——
 * 那种表单比没有更糟：用户改了、以为生效了，实际什么都没发生。
 */

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
})

const useStyles = createStyles(({ css, token }) => ({
  /*
   * 设置页现在独占右栏（没有中栏了），但内容仍然限宽 ——
   * 表单行太长会让人读串行。CONTENT_WIDTH 与文档正文共用同一个 measure。
   */
  page: css`
    height: 100%;
    overflow-y: auto;
    padding: 28px 40px 120px;
  `,
  inner: css`
    max-width: ${CONTENT_WIDTH}px;
    margin: 0 auto;
  `,
  desc: css`
    font-size: ${FONT_SIZE.excerpt}px;
    line-height: 1.75;
  `,
  card: css`
    margin-bottom: 14px;
  `,
  mono: css`
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.meta}px;
  `,
  pluginRow: css`
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 9px 0;
  `,
  muted: css`
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.75;
    color: ${token.colorTextSecondary};
  `,
}))

const SECTIONS = [
  { key: 'models', label: '模型' },
  { key: 'retrieval', label: '检索' },
  { key: 'capture', label: '抓取' },
  { key: 'plugins', label: '插件' },
  { key: 'data', label: '数据与备份' },
  { key: 'account', label: '账号' },
]

function SettingsPage() {
  const { styles } = useStyles()

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          设置
        </Typography.Title>

        <Tabs
          tabPosition="left"
          items={SECTIONS.map((section) => ({
            key: section.key,
            label: section.label,
            children: <SectionBody section={section.key} />,
          }))}
        />
      </div>
    </div>
  )
}

function SectionBody({ section }: { section: string }) {
  if (section === 'data') return <DataSection />
  if (section === 'plugins') return <PluginsSection />
  if (section === 'models') return <ModelsSection />
  if (section === 'capture') return <CaptureSection />
  if (section === 'account') return <AccountSection />
  return <RetrievalSection />
}

function DataSection() {
  const { styles } = useStyles()
  const { message } = App.useApp()

  const statsQuery = useQuery({ queryKey: ['export-stats'], queryFn: api.export.stats })
  const tagsQuery = useQuery({ queryKey: ['tags'], queryFn: api.tags.list })

  const reindex = useMutation({
    mutationFn: api.maintenance.reindex,
    onSuccess: (result) => {
      message.success(
        `重建完成：扫描 ${result.scanned} 个文件，新增 ${result.created}、更新 ${result.updated}、标记删除 ${result.removed}`,
      )
    },
    onError: (error: unknown) =>
      message.error(error instanceof Error ? error.message : '重建索引失败'),
  })

  const stats = statsQuery.data

  return (
    <>
      <Typography.Paragraph type="secondary" className={styles.desc}>
        这个项目的规则是：**Markdown 文件是真相，数据库只是可重建的索引**。
        所以任何时候都能把全部内容拿走，不依赖这个应用。
      </Typography.Paragraph>

      <Card title="真相在哪" className={styles.card} size="small">
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="笔记目录">
            <span className={styles.mono}>data/vault/</span>
          </Descriptions.Item>
          <Descriptions.Item label="原始快照">
            <span className={styles.mono}>data/raw/</span>
          </Descriptions.Item>
          <Descriptions.Item label="数据库">Postgres · 前两者可以完整重建它</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="维护" className={styles.card} size="small">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Button
            icon={<ReloadOutlined />}
            loading={reindex.isPending}
            onClick={() => reindex.mutate()}
          >
            立即重建索引
          </Button>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            扫描 vault 并同步数据库。用外部编辑器改过文件之后需要跑一次。
          </Typography.Text>
        </div>
      </Card>

      <Card title="导出" className={styles.card} size="small">
        <Typography.Paragraph type="secondary" style={{ fontSize: 12.5, lineHeight: 1.75 }}>
          任何时候都能把全部内容拿走。Markdown 包可以直接用 Obsidian / Typora 打开； JSON
          含元数据与对话，用于备份。
        </Typography.Paragraph>

        <Descriptions column={1} size="small" style={{ marginBottom: 14 }}>
          <Descriptions.Item label="文档">{stats?.documents ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="其中笔记">{stats?.notes ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="对话">{stats?.conversations ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="正文体积">{formatBytes(stats?.bytes)}</Descriptions.Item>
        </Descriptions>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            icon={<DownloadOutlined />}
            onClick={() => {
              // 走浏览器的原生下载而不是 fetch+blob：导出可能有几十 MB，
              // 原生下载能进下载管理器、可续传
              window.location.href = '/api/export/markdown'
            }}
          >
            Markdown + 附件（zip）
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={() => {
              window.location.href = '/api/export/json'
            }}
          >
            JSON（含元数据与对话）
          </Button>
        </div>
      </Card>

      <Card title="标签" className={styles.card} size="small">
        {tagsQuery.data?.items.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tagsQuery.data.items.map((tag) => (
              <Tag key={tag.name} variant="filled">
                #{tag.name} · {tag.count}
              </Tag>
            ))}
          </div>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
            还没有标签。整理收件箱时会自动建议。
          </Typography.Text>
        )}
      </Card>
    </>
  )
}

/** 体积的人类可读形式。提到模块作用域：它不依赖任何组件状态 */
function formatBytes(bytes: number | undefined): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 检索分区的**相关性自检**。
 *
 * 原型里这个功能是写死的演示数据，这里接真实检索：输入一句话，
 * 看两个通道各命中多少。
 *
 * 它的价值在于**区分「没存过」和「分词没切对」**——如果词级召回 0 段、
 * 但子串兜底命中了，那就是分词问题（`docs/PRD.md` §5.6 的同一个理由）。
 */
function RetrievalSection() {
  const { styles } = useStyles()
  const [probe, setProbe] = useState('')

  const probeQuery = useQuery({
    queryKey: ['retrieval-probe', probe],
    queryFn: () => api.search({ q: probe, limit: 5 }),
    enabled: probe.trim().length > 0,
  })

  const result = probeQuery.data
  const keywordHits = result?.hits.filter((hit) => hit.matchedBy.includes('keyword')).length ?? 0
  const substringHits =
    result?.hits.filter((hit) => hit.matchedBy.includes('substring')).length ?? 0

  return (
    <>
      <Typography.Paragraph type="secondary" className={styles.desc}>
        检索是**核心功能**，不是附属特性——搜不到等于没存。下面两个通道的权重写在
        服务端常量里（`plugins/leg/`），这里用来验证它们是否正常工作。
      </Typography.Paragraph>

      <Card title="融合参数（当前值）" size="small" className={styles.card}>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="RRF k">
            60 · 原论文取值，作用是压低头部名次的绝对优势
          </Descriptions.Item>
          <Descriptions.Item label="关键词权重">1.0</Descriptions.Item>
          <Descriptions.Item label="子串权重">0.6</Descriptions.Item>
          <Descriptions.Item label="每通道候选数">50</Descriptions.Item>
          <Descriptions.Item label="分词器">
            jieba（@node-rs/jieba）· 写入时预分词
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="相关性自检" size="small" className={styles.card}>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12.5, lineHeight: 1.75 }}>
          改完分词词典或权重后，直接在这里试一句，不用回主界面。
        </Typography.Paragraph>

        <Input.Search
          placeholder="比如：向量检索"
          value={probe}
          onChange={(event) => setProbe(event.target.value)}
          loading={probeQuery.isFetching}
          enterButton="试一下"
        />

        {result && (
          <div style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.9 }}>
            <div>
              命中 <b>{result.total}</b> 段 · 词级召回 <b>{keywordHits}</b> 段 · 子串兜底{' '}
              <b>{substringHits}</b> 段 · 耗时 {result.tookMs}ms
            </div>

            {result.total === 0 && (
              <Typography.Text type="secondary">
                没有命中。若确认内容存在，多半是分词没切对——词级通道靠写入时的 jieba
                分词，切错了就永远命中不了（子串通道是它的兜底）。
              </Typography.Text>
            )}

            {keywordHits === 0 && substringHits > 0 && (
              <Typography.Text type="warning">
                词级召回 0 段、子串兜底命中：分词没切对，但兜底通道救回来了。
              </Typography.Text>
            )}

            <div style={{ marginTop: 8 }}>
              {result.hits.map((hit) => (
                <div key={hit.documentId} style={{ color: '#68707c' }}>
                  · {hit.title}（{hit.matchedBy.join(' + ')}）
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </>
  )
}

/** 插件注册表 = 接缝的人类可读视图。加一个实现就多一行。 */
function PluginsSection() {
  const { styles } = useStyles()

  const seams = [
    {
      key: 'capturer',
      name: '抓取器',
      note: '把一份外部来源变成统一的 Markdown + 元数据',
      plugins: [
        {
          name: '粘贴链接（网页）',
          desc: 'Readability 提取正文',
          file: 'services/capture.ts',
          on: true,
        },
        {
          name: '公众号文章',
          desc: '正文在 #js_content，图片需带 Referer',
          file: 'services/capture.ts',
          on: true,
        },
        {
          name: 'GitHub 仓库',
          desc: 'API 取 README 与元数据',
          file: 'services/capture.ts',
          on: true,
        },
        { name: 'RSS / Atom 订阅', desc: '定时轮询，新文章自动进收件箱', file: '—', on: false },
        {
          name: '浏览器扩展',
          desc: '在用户会话里抓取，绕开反爬',
          file: 'apps/extension/',
          on: false,
        },
      ],
    },
    {
      key: 'leg',
      name: '检索通道',
      note: '每个通道独立召回一批结果，再由融合层合并',
      plugins: [
        {
          name: '关键词（jieba 分词）',
          desc: '词级召回，权重 1.0',
          file: 'plugins/leg/keyword.ts',
          on: true,
        },
        {
          name: '子串兜底（pg_trgm）',
          desc: '分词切错时仍能命中，权重 0.6',
          file: 'plugins/leg/substring.ts',
          on: true,
        },
        {
          name: '向量（pgvector）',
          desc: '语义召回，M1 上线',
          file: 'plugins/leg/vector.ts',
          on: false,
        },
      ],
    },
    {
      key: 'provider',
      name: '模型提供方',
      note: '一套 OpenAI 兼容适配器即可接住绝大多数国产模型',
      plugins: [
        {
          name: 'DeepSeek / 通义 / 智谱',
          desc: '同一套适配器换个 baseURL 即可',
          file: '@tanstack/ai-openai/compatible',
          on: true,
        },
      ],
    },
    {
      key: 'parser',
      name: '解析器',
      note: '把抓到的原文转成结构化文本，并保留页码/偏移以便回溯',
      plugins: [
        { name: 'Markdown', desc: '原生支持，文件本身就是真相', file: 'lib/vault.ts', on: true },
        {
          name: 'HTML 正文提取',
          desc: '去掉导航与广告，保留代码块与表格',
          file: 'services/capture.ts',
          on: true,
        },
        { name: 'PDF / Word', desc: '保留页码；扫描版需要 OCR', file: '—', on: false },
      ],
    },
  ]

  return (
    <>
      <Typography.Paragraph type="secondary" className={styles.desc}>
        按接缝分组。每一行是一个独立实现，注册进注册表即可生效——加一个新来源
        不需要改动检索、存储或界面代码。设置页里其它分区，本质上是这份注册表的筛选视图。
      </Typography.Paragraph>

      {seams.map((seam) => (
        <Card
          key={seam.key}
          size="small"
          className={styles.card}
          title={
            <span>
              {seam.name}
              <span className={styles.mono} style={{ marginLeft: 10, color: '#68707c' }}>
                seam: {seam.key}
              </span>
            </span>
          }
        >
          <Typography.Paragraph type="secondary" style={{ fontSize: 12.5, marginBottom: 4 }}>
            {seam.note}
          </Typography.Paragraph>
          <Divider style={{ margin: '8px 0' }} />
          {seam.plugins.map((plugin) => (
            <div key={plugin.name} className={styles.pluginRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>
                  {plugin.name}{' '}
                  {plugin.on ? (
                    <Tag variant="filled" color="green">
                      已注册
                    </Tag>
                  ) : (
                    <Tag variant="filled">待开发</Tag>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#5c6570', lineHeight: 1.7 }}>{plugin.desc}</div>
                <div className={styles.mono} style={{ color: '#68707c' }}>
                  {plugin.file}
                </div>
              </div>
              <Switch size="small" checked={plugin.on} disabled />
            </div>
          ))}
        </Card>
      ))}
    </>
  )
}

function ModelsSection() {
  const { styles } = useStyles()

  return (
    <>
      <Typography.Paragraph type="secondary" className={styles.desc}>
        给不同任务分配不同的模型：便宜模型做摘要、强模型做推理。 这是最直接的成本控制手段。
      </Typography.Paragraph>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 14 }}
        message="模型通过环境变量配置，不在界面上配置"
        description={
          <div style={{ fontSize: 12.5, lineHeight: 1.95 }}>
            密钥只存在服务端，绝不下发浏览器——所以它不该由界面管理。 在{' '}
            <span className={styles.mono}>.env</span> 里设置：
            <br />
            <span className={styles.mono}>MODEL_API_KEY</span>
            {' · '}
            <span className={styles.mono}>MODEL_BASE_URL</span>
            {' · '}
            <span className={styles.mono}>MODEL_CHAT_MODEL</span>
            {' · '}
            <span className={styles.mono}>MODEL_REASONING_MODEL</span>
            <br />
            不配置也能用：问答会走「只检索」路径，把命中的原文原样列出来，并且不花钱。
          </div>
        }
      />

      <Card title="任务分配" size="small" className={styles.card}>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="对话与推理">
            <span className={styles.mono}>deepseek-chat</span>
          </Descriptions.Item>
          <Descriptions.Item label="深度思考">
            <span className={styles.mono}>deepseek-reasoner</span>
          </Descriptions.Item>
          <Descriptions.Item label="自动摘要">
            <span className={styles.mono}>未启用（M1）</span>
          </Descriptions.Item>
          <Descriptions.Item label="向量化">
            <span className={styles.mono}>未启用（M1）</span>
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </>
  )
}

function CaptureSection() {
  const { styles } = useStyles()

  return (
    <>
      <Typography.Paragraph type="secondary" className={styles.desc}>
        把外部来源变成统一的 Markdown 进收件箱。收集入口的摩擦必须低于
        「先在浏览器收藏，之后再说」——否则知识库会死于收集摩擦。
      </Typography.Paragraph>

      <Card title="各来源现状" size="small" className={styles.card}>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="网页">
            服务端 Readability 提取正文，turndown 转 Markdown
          </Descriptions.Item>
          <Descriptions.Item label="微信公众号">
            服务端低频抓取（#js_content）。图片保留原链接——下载需要带 Referer，
            且这类文章常被删除，完整的图片本地化在 M2 的浏览器扩展里做
          </Descriptions.Item>
          <Descriptions.Item label="GitHub">
            走 API 取 README 与元数据，不克隆仓库。配 GITHUB_TOKEN 可把限额 从 60 次/小时提到 5000
            次
          </Descriptions.Item>
          <Descriptions.Item label="RSS 订阅">
            <span style={{ color: '#68707c' }}>未实现（M1）</span>
          </Descriptions.Item>
          <Descriptions.Item label="浏览器扩展">
            <span style={{ color: '#68707c' }}>未实现（M2）</span>
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </>
  )
}

/**
 * 账号。
 *
 * 单用户自托管，这里只做登出。刻意**不做**邮箱修改与改密表单：
 * 前者是单用户规则的锚点，后者还没有对应的接口——
 * 做一个存不进去的表单比不做更糟，用户会以为改了密码。
 */
function AccountSection() {
  const { styles } = useStyles()
  const { message } = App.useApp()

  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: api.auth.session })

  return (
    <>
      <Typography.Paragraph type="secondary" className={styles.desc}>
        单用户自托管。第一个注册的人是唯一用户，之后注册自动关闭。
      </Typography.Paragraph>

      <Card title="登录" size="small" className={styles.card}>
        <Descriptions column={1} size="small" bordered style={{ marginBottom: 12 }}>
          <Descriptions.Item label="邮箱">{sessionQuery.data?.user.email ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="名称">{sessionQuery.data?.user.name ?? '—'}</Descriptions.Item>
        </Descriptions>

        <Button
          danger
          onClick={() => {
            void api.auth.signOut().then(() => {
              message.success('已登出')
              window.location.href = '/login'
            })
          }}
        >
          登出
        </Button>
      </Card>

      <Typography.Paragraph className={styles.muted}>
        改密码还没有对应的接口，所以这里不提供表单——一个存不进去的表单会让你
        以为密码改了。以服务端接口为准，等它做出来再接。
      </Typography.Paragraph>
    </>
  )
}
