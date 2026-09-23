import { Typography } from 'antd'
import { Note, Panel, Row } from '@/components/settings/parts'
import { useStyles } from '@/components/settings/settings.style'

/**
 * 抓取分区。
 *
 * 只列**各来源的现状**，不做成配置表——抓取行为没有可调参数，
 * 每个来源用哪条路径是代码决定的（见 `services/capture.ts`）。
 */
export function CaptureSection() {
  const { styles } = useStyles()

  return (
    <>
      <Typography.Paragraph className={styles.sectionDesc}>
        把外部来源变成统一的 Markdown
        进收件箱。收集入口的摩擦必须低于「先在浏览器收藏，之后再说」——否则知识库会死于收集摩擦。
      </Typography.Paragraph>

      <Panel title="各来源现状">
        <Row label="网页">服务端 Readability 提取正文，turndown 转 Markdown</Row>
        <Row label="微信公众号">
          服务端低频抓取（#js_content）。图片保留原链接——下载需要带
          Referer，且这类文章常被删除，完整的图片本地化在 M2 的浏览器扩展里做
        </Row>
        <Row label="GitHub">
          走 API 取 README 与元数据，不克隆仓库。配 GITHUB_TOKEN 可把限额从 60 次/小时提到 5000 次
        </Row>
        <Row label="RSS 订阅" pending>
          未实现（M1）
        </Row>
        <Row label="浏览器扩展" pending>
          未实现（M2）
        </Row>
      </Panel>

      <Note>
        所有来源入库后都是同一条 documents 记录加同一套 Markdown
        正文——不为新来源引入新的存储形状，所以这里增加一行不会影响检索、引用与导出。
      </Note>
    </>
  )
}
