import { useMutation, useQuery } from '@tanstack/react-query'
import type { SettingEntry } from '@mimir/shared'
import { Button, Skeleton } from 'antd'
import { api, ApiRequestError } from '../../lib/api'
import { LoadError } from '../LoadError'
import { Block, BlockDesc, Panel, Row, StatusBadge } from './parts'
import { SettingControl } from './SettingControl'
import { useStyles } from './settings.style'

const BRAVE_KEY = 'search.web.brave.apiKey'

function BraveSettings({ entry }: { entry: SettingEntry }) {
  const test = useMutation({ mutationFn: api.testNetworkSearch })
  const configured = entry.configured && !entry.problem

  return (
    <Panel
      title="Brave Search"
      desc="配置 Brave Search API 密钥，启用网络搜索"
      extra={<StatusBadge on={configured}>{configured ? '已配置' : '未配置'}</StatusBadge>}
    >
      <Row label={entry.label}>
        <SettingControl entry={entry} secret width={320} />
        {entry.description ? <BlockDesc>{entry.description}</BlockDesc> : null}
      </Row>
      <Block>
        <Button
          size="small"
          loading={test.isPending}
          disabled={!configured}
          onClick={() => test.mutate()}
        >
          测试连接
        </Button>
        {test.isSuccess ? (
          <div role="status">
            <BlockDesc>连接成功，返回 {test.data.results} 条结果。</BlockDesc>
          </div>
        ) : null}
        {test.isError ? (
          <div role="alert">
            <BlockDesc>
              连接失败：
              {test.error instanceof ApiRequestError ? test.error.message : String(test.error)}
            </BlockDesc>
          </div>
        ) : null}
      </Block>
    </Panel>
  )
}

export function NetworkSearchSection() {
  const { styles } = useStyles()
  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })

  if (configQuery.isError) {
    return <LoadError message="网络搜索配置读取失败" onRetry={() => void configQuery.refetch()} />
  }

  if (!configQuery.data) {
    return (
      <div className={styles.block}>
        <Skeleton active paragraph={{ rows: 3 }} title={false} />
      </div>
    )
  }

  const brave = configQuery.data.settings.find((entry) => entry.key === BRAVE_KEY)
  if (!brave) {
    return (
      <Panel title="网络搜索" desc="让 Mimir 搜索互联网以获取最新信息">
        <Block>
          <BlockDesc>当前服务未注册网络搜索提供方。</BlockDesc>
        </Block>
      </Panel>
    )
  }

  return <BraveSettings entry={brave} />
}
