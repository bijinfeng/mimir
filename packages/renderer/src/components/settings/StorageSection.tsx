import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { App, Button, Radio, Skeleton } from 'antd'
import { ApiRequestError, api } from '../../lib/api'
import { LoadError } from '../LoadError'
import { Block, BlockDesc, Panel, Row, StatusBadge } from './parts'
import { SettingControl } from './SettingControl'
import { useStyles } from './settings.style'

/**
 * 存储分区。
 *
 * ## 为什么「选哪个后端」用单选框而不是设置键的文本框
 *
 * `storage.backend` 在服务端的键表里是一个 `string` 类型（core 不认识插件，
 * 没法把它做成枚举）。但界面知道有哪些后端——它们来自 `plugins` 里
 * `seam === 'storage'` 的条目。所以这里用单选框渲染，**选项就是注册表里的实现**：
 * 加一个后端插件，这个选择器自动多一项，不需要回来改这一页。
 *
 * 这也顺带挡掉了「手打一个不存在的后端名」——那种值装配层会抛错
 * （不静默回落到 local，见 host.ts 的注释）。
 *
 * ## 未选中的后端为什么要显示出来
 *
 * 存储接缝是**单数**的：同一时刻只有一个在承接写入。把未选中的也列出来
 * 是为了让「我配过另一个」这件事可见，同时如实说明它当前没在干活
 * （`.trellis/spec/project/research.md` §10.6）。只显示选中的那个会让用户以为配置丢了。
 */
export function StorageSection() {
  const { styles } = useStyles()
  const { message } = App.useApp()
  const [showS3Config, setShowS3Config] = useState(false)
  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: api.auth.session })

  const config = configQuery.data
  const accountId = sessionQuery.data?.user.id
  const backends = (config?.plugins ?? []).filter((plugin) => plugin.seam === 'storage')
  const settings = config?.settings ?? []

  const backendEntry = settings.find((entry) => entry.key === 'storage.backend')
  const selected = String(backendEntry?.value ?? 'local')

  /** S3 那组键。**只按前缀筛，不写死列表**——加键时这一页自动跟着变 */
  const s3Entries = settings.filter((entry) => entry.key.startsWith('storage.s3.'))

  const switchBackend = useMutation({
    mutationFn: (id: string) => api.updateSettings({ 'storage.backend': id }),
    onSuccess: () => {
      void configQuery.refetch()
    },
    onError: (error: unknown) =>
      message.error(error instanceof Error ? error.message : '切换存储失败'),
  })

  if (configQuery.isError || sessionQuery.isError) {
    return (
      <LoadError
        message="配置读取失败"
        onRetry={() => {
          void configQuery.refetch()
          void sessionQuery.refetch()
        }}
      />
    )
  }

  if (!config || !accountId) {
    return (
      <div className={styles.block}>
        <Skeleton active paragraph={{ rows: 4 }} title={false} />
      </div>
    )
  }

  return (
    <>
      <Panel title="文件存储">
        <Radio.Group
          className={styles.storageOptions}
          aria-label="文件存储方式"
          value={selected}
          onChange={(event) => switchBackend.mutate(String(event.target.value))}
          disabled={switchBackend.isPending}
        >
          {backends.map((backend) => (
            <Radio className={styles.storageOption} key={backend.id} value={backend.id}>
              <span className={styles.storageOptionHead}>
                <span>{backend.name}</span>
                <StatusBadge on={backend.status.kind === 'active'}>
                  {backend.status.kind === 'active'
                    ? '正在用'
                    : backend.status.kind === 'needs-config'
                      ? '待配置'
                      : backend.status.kind === 'planned'
                        ? '待开发'
                        : backend.id === selected
                          ? '不可用'
                          : '未选中'}
                </StatusBadge>
              </span>
              {backend.status.kind === 'needs-config' ? (
                <span className={styles.storageOptionReason}>请完成下方存储配置。</span>
              ) : null}
            </Radio>
          ))}
        </Radio.Group>
        <Block>
          <BlockDesc>切换存储不会迁移已有文件；如需继续使用，请先自行迁移。</BlockDesc>
        </Block>

        {/* 切换时丢弃上一种后端的探测结果，避免展示过期状态。 */}
        <StorageProbe key={selected} />
      </Panel>

      {s3Entries.length > 0 ? (
        <Panel
          title="S3 配置"
          extra={
            selected === 's3' ? null : (
              <Button size="small" onClick={() => setShowS3Config((open) => !open)}>
                {showS3Config ? '收起' : '预先配置'}
              </Button>
            )
          }
        >
          {selected === 's3' || showS3Config
            ? s3Entries.map((entry) => (
                <Row key={entry.key} label={entry.label}>
                  <SettingControl
                    entry={entry}
                    draftScope={`account:${accountId}`}
                    secret={entry.type === 'secret'}
                    width={entry.type === 'boolean' ? undefined : 320}
                  />
                  <BlockDesc>{entry.description}</BlockDesc>
                  {entry.problem ? <BlockDesc>{entry.problem}</BlockDesc> : null}
                </Row>
              ))
            : null}
        </Panel>
      ) : null}
    </>
  )
}

/**
 * 「测试连接」。
 *
 * 与模型那边的探测同一条规则（`.trellis/spec/project/architecture.md` §7.8）：**真实动作、显式触发**。
 * 它写一个探针对象到当前选中的后端，读回、再删掉——所以探通即代表
 * 真的能写能读，而不是「配置项填全了」。
 *
 * 结果只留在组件里，不落库：它是「刚才通不通」的观测，重启即回到未测试，
 * 比留一个可能过期的「可用」诚实。
 */
function StorageProbe() {
  const { styles } = useStyles()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const probe = useMutation({
    mutationFn: api.probeStorage,
    onSuccess: setResult,
    onError: (error) => {
      const detail = error instanceof ApiRequestError ? error.message : String(error)
      setResult({ ok: false, message: detail })
    },
  })

  return (
    <Block>
      <div className={styles.actions}>
        <Button loading={probe.isPending} onClick={() => probe.mutate()}>
          测试连接
        </Button>
        {result ? <StatusBadge on={result.ok}>{result.ok ? '可用' : '不可用'}</StatusBadge> : null}
      </div>
      {result ? <BlockDesc>{result.message}</BlockDesc> : null}
    </Block>
  )
}
