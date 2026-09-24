import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Radio, Skeleton } from 'antd'
import { ApiRequestError, api } from '@/lib/api'
import {
  Block,
  BlockDesc,
  BlockTitle,
  Note,
  Panel,
  Row,
  StatusBadge,
} from '@/components/settings/parts'
import { SettingControl } from '@/components/settings/SettingControl'
import { useStyles } from '@/components/settings/settings.style'

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
 * （`docs/RESEARCH.md` §10.6）。只显示选中的那个会让用户以为配置丢了。
 */
export function StorageSection() {
  const { styles } = useStyles()
  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })

  const config = configQuery.data
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
  })

  if (!config) {
    return (
      <div className={styles.block}>
        <Skeleton active paragraph={{ rows: 4 }} title={false} />
      </div>
    )
  }

  return (
    <>
      <Panel title="用哪个后端">
        <Block>
          <Radio.Group
            value={selected}
            onChange={(event) => switchBackend.mutate(String(event.target.value))}
            disabled={switchBackend.isPending}
          >
            {backends.map((backend) => (
              <Radio key={backend.id} value={backend.id}>
                {backend.name}
              </Radio>
            ))}
          </Radio.Group>
        </Block>

        {backends.map((backend) => (
          <Block key={backend.id}>
            <BlockTitle
              badge={
                <StatusBadge on={backend.status.kind === 'active'}>
                  {backend.status.kind === 'active'
                    ? '正在用'
                    : backend.status.kind === 'needs-config'
                      ? '待配置'
                      : '未选中'}
                </StatusBadge>
              }
            >
              {backend.name}
            </BlockTitle>
            <BlockDesc>{backend.description}</BlockDesc>
            {backend.status.kind === 'unavailable' || backend.status.kind === 'needs-config' ? (
              <BlockDesc>{backend.status.reason}</BlockDesc>
            ) : null}
          </Block>
        ))}
      </Panel>

      {selected === 's3' ? (
        <Panel title="S3 配置">
          {s3Entries.map((entry) => (
            <Row key={entry.key} label={entry.label}>
              <SettingControl
                entry={entry}
                secret={entry.type === 'secret'}
                width={entry.type === 'boolean' ? undefined : 320}
              />
              <BlockDesc>{entry.description}</BlockDesc>
              {entry.problem ? <BlockDesc>{entry.problem}</BlockDesc> : null}
            </Row>
          ))}
        </Panel>
      ) : null}

      <Panel title="当前生效">
        <Row label="后端">{backends.find((b) => b.status.kind === 'active')?.name ?? selected}</Row>
        <Row label="数据在哪">
          {selected === 's3' ? (
            <span className={styles.mono}>
              {String(settings.find((entry) => entry.key === 'storage.s3.bucket')?.value ?? '') ||
                '（未配置桶名）'}
            </span>
          ) : (
            <span className={styles.mono}>data/（DATA_DIR 环境变量）</span>
          )}
        </Row>
        <Row label="三类文件">
          <span className={styles.mono}>vault/ · raw/ · avatars/</span>
        </Row>
      </Panel>

      {/**
       * `key` 让切换后端时**丢掉上一次的探测结果**。
       *
       * 那个结果是「某一个后端刚才通不通」的观测，切到另一个后端之后它就不成立了——
       * 实测踩到过：从 S3 切回本地，面板上仍然挂着「不可用：还没配齐」（那是 S3
       * 的结论），而本地明明是好的。留着过期结论比没有结论更糟，它会让用户以为
       * 当前后端坏了。
       */}
      <StorageProbe key={selected} />

      {selected === 'local' ? (
        <Note>
          <strong className={styles.strong}>本地 data/ 里是普通文件</strong>
          ，可以直接用 Typora / Obsidian 打开，也可以交给 git 管理。换成 S3
          之后本地就没有文件可开了。
        </Note>
      ) : (
        <Note>
          切换
          <strong className={styles.strong}>不会搬运已有数据</strong>
          ：本地 data/ 里的笔记不会自动上传到桶里，反之亦然。换之前请先自己迁移，
          否则界面上的索引会指向找不到的文件。
        </Note>
      )}
    </>
  )
}

/**
 * 「测试连接」。
 *
 * 与模型那边的探测同一条规则（`docs/TECH.md` §7.8）：**真实动作、显式触发**。
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
    <Panel title="验证">
      <Block>
        <div className={styles.actions}>
          <Button loading={probe.isPending} onClick={() => probe.mutate()}>
            测试连接
          </Button>
          {result ? (
            <StatusBadge on={result.ok}>{result.ok ? '可用' : '不可用'}</StatusBadge>
          ) : null}
        </div>
        {result ? <BlockDesc>{result.message}</BlockDesc> : null}
        <BlockDesc>
          只测<strong className={styles.strong}>当前选中的后端</strong>
          ——想验证 S3 就先切过去再点。
        </BlockDesc>
      </Block>
    </Panel>
  )
}
