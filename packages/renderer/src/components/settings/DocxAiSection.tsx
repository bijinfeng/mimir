import { useQuery } from '@tanstack/react-query'
import { Button, Skeleton } from 'antd'
import { useNavigate } from '@tanstack/react-router'
import type { SettingEntry } from '@mimir/shared'
import { api } from '../../lib/api'
import { LoadError } from '../LoadError'
import { Block, BlockDesc, Panel, Row } from './parts'
import { SettingControl } from './SettingControl'
import { useStyles } from './settings.style'

function rows(entries: SettingEntry[]) {
  return entries.map((entry) => (
    <Row key={entry.key} label={entry.label}>
      <SettingControl entry={entry} secret={entry.type === 'secret'} width={320} />
      <BlockDesc>{entry.description}</BlockDesc>
    </Row>
  ))
}

/** Only configured services appear here; secrets remain on the server. */
export function DocxAiSection() {
  const { styles } = useStyles()
  const navigate = useNavigate()
  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })

  if (configQuery.isError) {
    return <LoadError message="DOCX AI 配置读取失败" onRetry={() => void configQuery.refetch()} />
  }

  if (!configQuery.data) {
    return (
      <div className={styles.block}>
        <Skeleton active paragraph={{ rows: 3 }} title={false} />
      </div>
    )
  }

  const settings = configQuery.data.settings
  const brave = settings.filter((entry) => entry.key.startsWith('docx.brave.'))
  const image = settings.filter((entry) => entry.key.startsWith('docx.image.'))
  const media = settings.filter((entry) => entry.key.startsWith('docx.media.'))

  return (
    <>
      <Panel
        title="聊天模型"
        extra={
          <Button
            size="small"
            onClick={() =>
              void navigate({ to: '/settings', search: { scope: 'all', section: 'models' } })
            }
          >
            前往模型设置
          </Button>
        }
      >
        <Block>
          <BlockDesc>DOCX 对话编辑使用已配置的聊天模型。模型需支持工具调用。</BlockDesc>
        </Block>
      </Panel>
      <Panel title="网页与图片搜索">
        {brave.length > 0 ? (
          rows(brave)
        ) : (
          <Block>
            <BlockDesc>当前服务未注册 Brave Search 配置。</BlockDesc>
          </Block>
        )}
      </Panel>
      {image.length > 0 ? <Panel title="图片生成">{rows(image)}</Panel> : null}
      {media.length > 0 ? <Panel title="媒体分析">{rows(media)}</Panel> : null}
      <Panel title="能力说明">
        <Block>
          <BlockDesc>打开 DOCX 文档后，可在“问 AI”侧栏查看该文档实际可用的工具与原因。</BlockDesc>
        </Block>
      </Panel>
    </>
  )
}
