import { Typography } from 'antd'
import {
  Block,
  BlockDesc,
  BlockTitle,
  FilePath,
  Note,
  Panel,
  SeamTag,
  StatusBadge,
} from '@/components/settings/parts'
import { useStyles } from '@/components/settings/settings.style'

/**
 * 插件注册表 = 接缝的人类可读视图。加一个实现就多一行。
 *
 * ## 为什么这一页没有开关
 *
 * 注册表是**代码里的数组**（`plugins/leg/index.ts`），启停走提交而不是点击。
 * 早期版本在每个条目右侧挂了一个 `disabled` 的 `Switch`：它长得像能打开的
 * 开关，实际永远打不开，也没有任何说明。那比没有更糟——用户会以为自己
 * 没找到正确的开启方式，然后反复点它。
 *
 * 现在只陈述事实：这个实现**在不在**（徽标），以及它写在哪个文件里。
 * 「待开发」的条目说明它属于哪条接缝、计划什么时候做。
 */
export function PluginsSection() {
  const { styles } = useStyles()

  const seams = [
    {
      key: 'capturer',
      name: '抓取器',
      note: '把一份外部来源变成统一的 Markdown + 元数据',
      plugins: [
        {
          name: '粘贴链接（网页）',
          desc: 'Readability 提取正文',
          file: 'services/capture.ts',
          on: true,
        },
        {
          name: '公众号文章',
          desc: '正文在 #js_content，图片需带 Referer',
          file: 'services/capture.ts',
          on: true,
        },
        {
          name: 'GitHub 仓库',
          desc: 'API 取 README 与元数据',
          file: 'services/capture.ts',
          on: true,
        },
        { name: 'RSS / Atom 订阅', desc: '定时轮询，新文章自动进收件箱', file: '—', on: false },
        {
          name: '浏览器扩展',
          desc: '在用户会话里抓取，绕开反爬',
          file: 'apps/extension/',
          on: false,
        },
      ],
    },
    {
      key: 'leg',
      name: '检索通道',
      note: '每个通道独立召回一批结果，再由融合层合并',
      plugins: [
        {
          name: '关键词（jieba 分词）',
          desc: '词级召回，权重 1.0',
          file: 'plugins/leg/keyword.ts',
          on: true,
        },
        {
          name: '子串兜底（pg_trgm）',
          desc: '分词切错时仍能命中，权重 0.6',
          file: 'plugins/leg/substring.ts',
          on: true,
        },
        {
          name: '向量（pgvector）',
          desc: '语义召回，M1 上线',
          file: 'plugins/leg/vector.ts',
          on: false,
        },
      ],
    },
    {
      key: 'provider',
      name: '模型提供方',
      note: '一套 OpenAI 兼容适配器即可接住绝大多数国产模型',
      plugins: [
        {
          name: 'DeepSeek / 通义 / 智谱',
          desc: '同一套适配器换个 baseURL 即可',
          file: '@tanstack/ai-openai/compatible',
          on: true,
        },
      ],
    },
    {
      key: 'parser',
      name: '解析器',
      note: '把抓到的原文转成结构化文本，并保留页码/偏移以便回溯',
      plugins: [
        { name: 'Markdown', desc: '原生支持，文件本身就是真相', file: 'lib/vault.ts', on: true },
        {
          name: 'HTML 正文提取',
          desc: '去掉导航与广告，保留代码块与表格',
          file: 'services/capture.ts',
          on: true,
        },
        { name: 'PDF / Word', desc: '保留页码；扫描版需要 OCR', file: '—', on: false },
      ],
    },
  ]

  return (
    <>
      <Typography.Paragraph className={styles.sectionDesc}>
        按接缝分组。每一行是一个独立实现，注册进注册表即可生效——加一个新来源不需要改动检索、存储或界面代码。设置页里其它分区，本质上是这份注册表的筛选视图。
      </Typography.Paragraph>

      {seams.map((seam) => (
        <Panel
          key={seam.key}
          title={
            <>
              {seam.name}
              <SeamTag>seam: {seam.key}</SeamTag>
            </>
          }
        >
          <Block>
            <BlockDesc>{seam.note}</BlockDesc>
          </Block>
          {seam.plugins.map((plugin) => (
            <Block key={plugin.name}>
              <BlockTitle
                badge={<StatusBadge on={plugin.on}>{plugin.on ? '已注册' : '待开发'}</StatusBadge>}
              >
                {plugin.name}
              </BlockTitle>
              <BlockDesc>{plugin.desc}</BlockDesc>
              <FilePath>{plugin.file}</FilePath>
            </Block>
          ))}
        </Panel>
      ))}

      <Note>
        面板标题里的 seam 标识是代码里的接缝名。它出现在界面上是有用的——报问题时说「leg
        这条接缝」比说「检索那个」准确得多。要停掉某个实现，改注册表再重新部署。
      </Note>
    </>
  )
}
