import { Typography } from 'antd'
import { Panel, Row } from '@/components/settings/parts'

/**
 * 抓取分区。
 *
 * 只列**各来源的现状**，不做成配置表——抓取行为没有可调参数，
 * 每个来源用哪条路径是代码决定的（见 `services/capture.ts`）。
 */
export function CaptureSection() {
  return (
    <>
      <Panel title="各来源现状">
        <Row label="网页">Readability 提取正文，转 Markdown</Row>
        <Row label="微信公众号">图片保留原链接、不下载（下载需带 Referer），全文快照可离线读</Row>
        <Row label="GitHub">
          取 README 与元数据，不克隆仓库。配 <Typography.Text code>GITHUB_TOKEN</Typography.Text>{' '}
          可把限额从 60 次/小时提到 5000 次
        </Row>
        <Row label="RSS 订阅" pending>
          未实现（M1）
        </Row>
        <Row label="浏览器扩展" pending>
          未实现（M2）
        </Row>
      </Panel>
    </>
  )
}
