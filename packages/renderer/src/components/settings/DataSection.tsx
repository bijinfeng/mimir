import { useMutation, useQuery } from '@tanstack/react-query'
import { App, Button, Skeleton } from 'antd'
import { Download, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api'
import { LoadError } from '../LoadError'
import { Block, BlockDesc, Note, Panel, Stats } from './parts'
import { useStyles } from './settings.style'

/** 数据导出和可操作的修复入口，不展示部署路径与数据库实现。 */
export function DataSection() {
  const { styles } = useStyles()
  const { message } = App.useApp()

  const statsQuery = useQuery({ queryKey: ['export-stats'], queryFn: api.export.stats })

  const reindex = useMutation({
    mutationFn: api.maintenance.reindex,
    onSuccess: (result) => {
      message.success(`扫描完成，已处理 ${result.scanned} 个文件`)
    },
    onError: (error: unknown) =>
      message.error(error instanceof Error ? error.message : '重新扫描失败'),
  })

  const stats = statsQuery.data

  return (
    <>
      <Panel title="维护">
        <Block>
          <div className={styles.actions} style={{ marginBottom: 8 }}>
            <Button
              icon={<RefreshCw size={16} />}
              loading={reindex.isPending}
              onClick={() => reindex.mutate()}
            >
              重新扫描本地文件
            </Button>
          </div>
          <BlockDesc>仅找回已有的笔记和上传件，无法找回网页文章、对话和设置。</BlockDesc>
        </Block>
      </Panel>

      <Panel title="导出">
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
              导出文档与附件
            </Button>
            <Button
              icon={<Download size={16} />}
              onClick={() => {
                window.location.href = '/api/export/json'
              }}
            >
              导出完整记录
            </Button>
          </div>
          <BlockDesc>完整记录不含上传原件，不能单独用于恢复全部内容。</BlockDesc>
        </Block>
      </Panel>

      <Note>导出文件不能代替完整备份。请同时备份应用数据与密钥。</Note>
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
