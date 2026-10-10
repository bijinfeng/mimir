import { useMutation, useQuery } from '@tanstack/react-query'
import { App, Button, Skeleton } from 'antd'
import { Download, RefreshCw } from 'lucide-react'
import type { DatabaseInfo } from '@mimir/shared'
import { api } from '../../lib/api'
import { LoadError } from '../LoadError'
import { Block, BlockDesc, Panel, Row, Stats } from './parts'
import { useStyles } from './settings.style'

/**
 * 数据与备份。
 *
 * 笔记与上传件以文件为真相，但抓取件、对话与设置仍依赖数据库。
 * 先说明各类数据的位置，再展示重建索引与迁出动作；两者都不是实例备份。
 *
 * ## 「数据库」那一行按服务端回传的驱动渲染
 *
 * 它一度是写死的 `Postgres`，而驱动是**部署事实**：服务器是 Postgres，
 * 本地开发与桌面端是 SQLite（D-045）。写死的那一半在另一套部署里
 * 说了一个可被当场证伪的假话——而这一页最该守的恰恰是
 * 「界面上说的每个事实都能验证」（同一行下面的「文档 17」就是可对照的）。
 * 所以厂商名从 `/api/config` 的 `database` 来，SQLite 下再带上库文件——
 * 那是用户能真的去看一眼的东西。
 */
export function DataSection() {
  const { styles } = useStyles()
  const { message } = App.useApp()

  const statsQuery = useQuery({ queryKey: ['export-stats'], queryFn: api.export.stats })
  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })

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
  const database = configQuery.data?.database

  return (
    <>
      <Panel title="真相在哪">
        <Row label="笔记目录">
          <span className={styles.mono}>data/vault/</span>
        </Row>
        <Row label="原始快照">
          <span className={styles.mono}>data/raw/</span>
        </Row>
        <Row label="数据库">
          {database ? (
            <>
              <span className={styles.mono}>{DATABASE_NAMES[database.driver]}</span>
              {database.file ? <span className={styles.mono}> · {database.file}</span> : null}
              <span> · 抓取件、对话和设置需备份数据库</span>
            </>
          ) : configQuery.isError ? (
            <LoadError compact message="读取失败" onRetry={() => void configQuery.refetch()} />
          ) : (
            <Skeleton.Button active size="small" />
          )}
        </Row>
      </Panel>

      <Panel title="维护">
        <Block>
          <div className={styles.actions} style={{ marginBottom: 8 }}>
            <Button
              icon={<RefreshCw size={16} />}
              loading={reindex.isPending}
              onClick={() => reindex.mutate()}
            >
              立即重建索引
            </Button>
          </div>
          <BlockDesc>
            扫描 vault 与 uploads 并同步文件类文档的索引；不会恢复抓取件、对话和设置。
          </BlockDesc>
        </Block>
      </Panel>

      <Panel title="导出">
        <Block>
          <BlockDesc>
            Markdown 包可用 Obsidian / Typora 打开；JSON 不含上传原件，也不能直接恢复实例。
            完整备份需同时保存数据库、内容文件与密钥。
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
        ) : statsQuery.isError ? (
          <LoadError compact message="统计读取失败" onRetry={() => void statsQuery.refetch()} />
        ) : (
          <Block>
            <Skeleton active paragraph={{ rows: 1 }} title={false} />
          </Block>
        )}

        <Block>
          <div className={styles.actions}>
            <Button
              icon={<Download size={16} />}
              onClick={() => {
                // 走浏览器的原生下载而不是 fetch+blob：导出可能有几十 MB，
                // 原生下载能进下载管理器、可续传
                window.location.href = '/api/export/markdown'
              }}
            >
              Markdown + 附件（zip）
            </Button>
            <Button
              icon={<Download size={16} />}
              onClick={() => {
                window.location.href = '/api/export/json'
              }}
            >
              JSON（含元数据与对话）
            </Button>
          </div>
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

/**
 * 驱动标识 → 用户认得的名字。
 *
 * 提到模块作用域的映射而不是在 JSX 里写三元：契约里的值是 `postgres` /
 * `sqlite`（小写标识），界面上要说的是厂商名，两者必须只在一处对应。
 * 写成内联三元时，加第三种驱动会在不动声色间落到 `else` 分支上。
 */
const DATABASE_NAMES: Record<DatabaseInfo['driver'], string> = {
  postgres: 'Postgres',
  sqlite: 'SQLite',
}
