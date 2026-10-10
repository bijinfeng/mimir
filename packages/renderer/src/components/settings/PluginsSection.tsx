import { useQuery } from '@tanstack/react-query'
import { Skeleton } from 'antd'
import type { PluginSeam, PluginStatus } from '@mimir/shared'
import { api } from '../../lib/api'
import { LoadError } from '../LoadError'
import { Block, BlockDesc, BlockTitle, Panel, StatusBadge } from './parts'
import { useStyles } from './settings.style'

/** 从服务端读取能力状态，只呈现用户可理解的支持情况。 */

const SEAM_LABELS: Partial<Record<PluginSeam, string>> = {
  capturer: '支持的来源',
  parser: '支持的文件',
  leg: '搜索方式',
}

const SEAM_ORDER: PluginSeam[] = ['capturer', 'parser', 'leg']

const DISPLAY_NAMES: Record<string, string> = {
  'capturer:web': '网页',
  'parser:markdown': 'Markdown',
  'parser:html': 'HTML',
  'parser:text': '纯文本',
  'parser:docx': 'Word',
  'parser:xlsx': 'Excel',
  'parser:pptx': 'PowerPoint',
  'parser:pdf': 'PDF',
}

const DESCRIPTION: Record<string, string> = {
  'capturer:wechat': '收集文章正文；图片需联网查看。',
  'capturer:github': '收集仓库介绍和 README。',
  'capturer:web': '收集网页正文。',
  'leg:keyword': '查找明确的名称或词语。',
  'leg:substring': '查找包含这段文字的内容。',
  'leg:vector': '查找意思相近的内容，需先配置语义搜索模型。',
}

export function PluginsSection() {
  const { styles } = useStyles()
  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })
  const plugins = configQuery.data?.plugins

  if (configQuery.isError) {
    return <LoadError message="功能状态读取失败" onRetry={() => void configQuery.refetch()} />
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
        const items = plugins.filter(
          (plugin) => plugin.seam === seam && plugin.id !== 'html-fragment',
        )
        if (items.length === 0) return null

        return (
          <Panel key={seam} title={SEAM_LABELS[seam] ?? ''}>
            {seam === 'parser' ? (
              <div className={styles.capabilityGrid}>
                {items.map((plugin) => (
                  <div className={styles.capabilityItem} key={plugin.id}>
                    <span>{DISPLAY_NAMES[`${plugin.seam}:${plugin.id}`] ?? plugin.name}</span>
                    {plugin.status.kind !== 'active' && <StatusLabel status={plugin.status} />}
                  </div>
                ))}
              </div>
            ) : (
              items.map((plugin) => (
                <Block key={plugin.id}>
                  <BlockTitle badge={<StatusLabel status={plugin.status} />}>
                    {DISPLAY_NAMES[`${plugin.seam}:${plugin.id}`] ?? plugin.name}
                  </BlockTitle>
                  <BlockDesc>
                    {DESCRIPTION[`${plugin.seam}:${plugin.id}`] ?? plugin.description}
                  </BlockDesc>
                  <StatusReason
                    status={plugin.status}
                    isSemanticSearch={plugin.seam === 'leg' && plugin.id === 'vector'}
                  />
                </Block>
              ))
            )}
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
function StatusLabel({ status }: { status: PluginStatus }) {
  if (status.kind === 'active') return <StatusBadge on>可用</StatusBadge>
  if (status.kind === 'needs-config') return <StatusBadge on={false}>待配置</StatusBadge>
  if (status.kind === 'unavailable') return <StatusBadge on={false}>不可用</StatusBadge>
  return <StatusBadge on={false}>尚未支持</StatusBadge>
}

/** 服务端原因可能包含内部字段名，面向用户只给下一步动作。 */
function StatusReason({
  status,
  isSemanticSearch,
}: {
  status: PluginStatus
  isSemanticSearch: boolean
}) {
  if (status.kind === 'active' || status.kind === 'planned') return null
  if (isSemanticSearch) return null
  if (status.kind === 'needs-config') return <BlockDesc>请完成相关设置后再使用。</BlockDesc>
  return null
}
