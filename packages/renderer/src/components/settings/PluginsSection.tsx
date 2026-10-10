import { useQuery } from '@tanstack/react-query'
import { Skeleton } from 'antd'
import type { PluginSeam, PluginStatus } from '@mimir/shared'
import { api } from '../../lib/api'
import { LoadError } from '../LoadError'
import {
  Block,
  BlockDesc,
  BlockTitle,
  FilePath,
  Panel,
  SeamTag,
  StatusBadge,
  TechnicalDetails,
} from './parts'
import { useStyles } from './settings.style'

/**
 * 插件注册表 = 接缝的人类可读视图。
 *
 * ## 这一页以前是**手写的数组**，现在读服务端
 *
 * 改动之前，这里的清单是前端写死的，与 `plugins/leg/index.ts` 的真实注册表
 * 没有连接：加一个通道要改两处，而「待开发」条目连文件路径都是手写的。
 * 那正是「设置里有开关但代码里没有对应逻辑」的镜像——
 * 代码里有实现，界面里有一份会漂移的抄本（`.trellis/spec/project/decisions.md` D-030）。
 *
 * 现在 `GET /api/config` 的 `plugins` 直接来自注册表，
 * `structure.test.ts` 有一条断言验证每个 `file` 路径真实存在。
 *
 * ## 为什么这一页没有开关
 *
 * 注册表是**代码里的注册**，启停走提交而不是点击。早期版本在每个条目右侧
 * 挂了一个 `disabled` 的 `Switch`：它长得像能打开的开关，实际永远打不开，
 * 也没有任何说明。那比没有更糟——用户会以为是自己没找到开启的方式。
 *
 * 现在只陈述事实：这个实现**能不能干活**（四态徽标），
 * 以及它写在哪个文件里。「规划中」与「不可用」在界面上必须可区分：
 * 前者是「将来会有」，后者是「现在缺个东西，补上就能用」。
 */

const SEAM_LABELS: Record<PluginSeam, string> = {
  capturer: '抓取器',
  parser: '解析器',
  leg: '检索通道',
  provider: '模型提供方',
  storage: '文件存储',
}

/**
 * 接缝的展示顺序。与装配顺序无关，纯粹是阅读顺序（输入 → 处理 → 输出）。
 *
 * `storage` 放最后：它不参与数据处理链路，而是所有链路的结果落点。
 * 放在中间会让人以为它是流水线上的一环。
 */
const SEAM_ORDER: PluginSeam[] = ['capturer', 'parser', 'leg', 'provider', 'storage']

export function PluginsSection() {
  const { styles } = useStyles()
  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })
  const plugins = configQuery.data?.plugins
  const selectedStorage = String(
    configQuery.data?.settings.find((entry) => entry.key === 'storage.backend')?.value ?? 'local',
  )

  if (configQuery.isError) {
    return <LoadError message="插件注册表读取失败" onRetry={() => void configQuery.refetch()} />
  }

  if (!plugins) {
    return (
      <div className={styles.block}>
        <Skeleton active paragraph={{ rows: 4 }} title={false} />
      </div>
    )
  }

  return (
    <>
      {SEAM_ORDER.map((seam) => {
        const items = plugins.filter((plugin) => plugin.seam === seam)
        if (items.length === 0) return null

        return (
          <Panel key={seam} title={SEAM_LABELS[seam]}>
            {items.map((plugin) => (
              <Block key={plugin.id}>
                <BlockTitle
                  badge={
                    <StatusLabel
                      status={plugin.status}
                      inactiveStorage={plugin.seam === 'storage' && plugin.id !== selectedStorage}
                    />
                  }
                >
                  {plugin.name}
                </BlockTitle>
                <StatusReason status={plugin.status} />
              </Block>
            ))}
            <TechnicalDetails>
              <SeamTag>seam: {seam}</SeamTag>
              {items.map((plugin) => (
                <Block key={plugin.id}>
                  <BlockTitle>{plugin.name}</BlockTitle>
                  <BlockDesc>{plugin.description}</BlockDesc>
                  {plugin.status.kind === 'planned' ? (
                    <BlockDesc>{plugin.status.note}</BlockDesc>
                  ) : null}
                  <FilePath>{plugin.file}</FilePath>
                </Block>
              ))}
            </TechnicalDetails>
          </Panel>
        )
      })}
    </>
  )
}

/**
 * 状态徽标。**四态**，不是「已注册 / 待开发」两态。
 *
 * `planned`（代码还没有）与 `unavailable`（代码在但干不了活）对用户的含义
 * 完全不同：前者是「将来会有」，后者是「现在缺个东西，补上就能用」。
 * 用布尔会把「待开发」显示成红色的「不可用」——那是在说它坏了。
 */
function StatusLabel({
  status,
  inactiveStorage,
}: {
  status: PluginStatus
  inactiveStorage: boolean
}) {
  if (status.kind === 'active') return <StatusBadge on>可用</StatusBadge>
  if (status.kind === 'needs-config') return <StatusBadge on={false}>待配置</StatusBadge>
  if (status.kind === 'unavailable' && inactiveStorage)
    return <StatusBadge on={false}>未选中</StatusBadge>
  if (status.kind === 'unavailable') return <StatusBadge on={false}>不可用</StatusBadge>
  return <StatusBadge on={false}>待开发</StatusBadge>
}

/** 状态的原因。只在该说的时候说——`active` 没有原因可讲 */
function StatusReason({ status }: { status: PluginStatus }) {
  if (status.kind === 'needs-config' || status.kind === 'unavailable') {
    return <BlockDesc>{status.reason}</BlockDesc>
  }
  return null
}
