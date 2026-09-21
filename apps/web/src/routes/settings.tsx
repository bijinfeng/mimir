import { createFileRoute } from '@tanstack/react-router'
import { Card, Tabs, Typography } from 'antd'
import { createStyles } from 'antd-style'
import { CONTENT_WIDTH } from '@/theme/tokens'

/**
 * 设置页骨架。
 *
 * 分区与原型一致（见 docs/TECH.md §7.4）：设置页是插件注册表的人类可读视图，
 * 每一行「可配置的东西」都对应一个注册进接缝的实现。
 * 这里先立骨架，具体表单等插件注册表定下来一起做。
 */
export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

const SECTIONS = [
  { key: 'models', label: '模型', desc: '给不同任务分配不同模型：摘要用便宜的，推理用强的' },
  { key: 'retrieval', label: '检索', desc: 'RRF k、各通道权重、分词词典' },
  { key: 'capture', label: '抓取', desc: '各来源的开关与凭据' },
  { key: 'plugins', label: '插件', desc: '按接缝分组，查看注册了哪些实现' },
  { key: 'data', label: '数据与备份', desc: '导出、重建索引、回收站' },
  { key: 'account', label: '账号', desc: '改密码、登出其他设备' },
]

/**
 * 内容列宽度与文档正文共用同一个 measure（`CONTENT_WIDTH`）——
 * 同一份规范里不该有两个「内容列宽度」。见 docs/DESIGN.md §5.4。
 */
const useStyles = createStyles(({ css }) => ({
  page: css`
    max-width: ${CONTENT_WIDTH}px;
    margin: 0 auto;
    padding: 28px 40px 120px;
  `,
  title: css`
    margin-top: 0;
  `,
  pending: css`
    font-size: 12px;
  `,
}))

function SettingsPage() {
  const { styles } = useStyles()
  return (
    <div className={styles.page}>
      <Typography.Title level={4} className={styles.title}>
        设置
      </Typography.Title>
      <Tabs
        tabPosition="left"
        items={SECTIONS.map((section) => ({
          key: section.key,
          label: section.label,
          children: (
            <Card title={section.label}>
              <Typography.Paragraph type="secondary">{section.desc}</Typography.Paragraph>
              <Typography.Text type="secondary" className={styles.pending}>
                待实现
              </Typography.Text>
            </Card>
          ),
        }))}
      />
    </div>
  )
}
