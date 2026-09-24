import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { useMutation, useQuery } from '@tanstack/react-query'
import { App, Button, Skeleton, Tag } from 'antd'
import { api } from '@/lib/api'
import { Block, BlockDesc, Panel, Row, Stats } from '@/components/settings/parts'
import { useStyles } from '@/components/settings/settings.style'

/**
 * 数据与备份。
 *
 * 这一页的核心陈述是「**Markdown 文件是真相，数据库只是可重建的索引**」，
 * 所以它把「真相在哪」放在最前面，动作（重建索引、导出）放在后面——
 * 顺序本身就是解释：先知道文件在哪，重建成什么、导出的是什么才有意义。
 */
export function DataSection() {
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
      <Panel title="真相在哪">
        <Row label="笔记目录">
          <span className={styles.mono}>data/vault/</span>
        </Row>
        <Row label="原始快照">
          <span className={styles.mono}>data/raw/</span>
        </Row>
        <Row label="数据库">Postgres · 前两者可以完整重建它</Row>
      </Panel>

      <Panel title="维护">
        <Block>
          <div className={styles.actions} style={{ marginBottom: 8 }}>
            <Button
              icon={<ReloadOutlined />}
              loading={reindex.isPending}
              onClick={() => reindex.mutate()}
            >
              立即重建索引
            </Button>
          </div>
          <BlockDesc>扫描 vault 并同步数据库。用外部编辑器改过文件之后需要跑一次。</BlockDesc>
        </Block>
      </Panel>

      <Panel title="导出">
        <Block>
          <BlockDesc>
            Markdown 包可以直接用 Obsidian / Typora 打开；JSON 含元数据与对话，用于备份。
          </BlockDesc>
        </Block>

        {stats ? (
          <Stats
            items={[
              { label: '文档', value: String(stats.documents) },
              { label: '其中笔记', value: String(stats.notes) },
              { label: '对话', value: String(stats.conversations) },
              { label: '正文体积', value: formatBytes(stats.bytes) },
            ]}
          />
        ) : (
          <Block>
            <Skeleton active paragraph={{ rows: 1 }} title={false} />
          </Block>
        )}

        <Block>
          <div className={styles.actions}>
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
        </Block>
      </Panel>

      <Panel title="标签">
        <Block>
          {tagsQuery.data?.items.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tagsQuery.data.items.map((tag) => (
                <Tag key={tag.name} variant="filled">
                  #{tag.name} · {tag.count}
                </Tag>
              ))}
            </div>
          ) : (
            <BlockDesc>还没有标签。整理收件箱时会自动建议。</BlockDesc>
          )}
        </Block>
      </Panel>
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
