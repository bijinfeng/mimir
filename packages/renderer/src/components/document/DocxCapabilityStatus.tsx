import type { DOCX_ALL_TOOLS, DocxAgentCapabilities } from '@mimir/shared'
import { Button, Switch } from 'antd'
import { createStyles } from 'antd-style'
import { FONT_SIZE } from '../../theme/tokens'

type DocxToolName = (typeof DOCX_ALL_TOOLS)[number]['name']

const TOOL_LABELS = {
  get_document_context: '读取当前文档',
  read_blocks: '读取段落',
  insert_content: '插入内容',
  replace_blocks: '替换段落',
  replace_selection: '替换选区',
  web_search: '网页搜索',
  image_search: '图片搜索',
  generate_image: '生成并插入图片',
  insert_image: '插入网络图片',
  insert_picture: '插入浮动图片',
  set_watermark: '设置水印',
  write_document: '撰写文档',
  analyze_media: '分析媒体',
  create_document: '创建新文档',
  apply_ops: '编辑文档结构与格式',
  read_revisions: '读取修订',
  accept_changes: '接受修订',
  reject_changes: '拒绝修订',
  read_comments: '读取批注',
  reply_comment: '回复批注',
  resolve_comment: '解决批注',
  add_comment: '添加批注',
  delete_comment: '删除批注',
  insert_footnote: '插入脚注',
  insert_endnote: '插入尾注',
  delete_note: '删除脚注或尾注',
  edit_note: '编辑脚注或尾注',
  read_notes: '读取脚注与尾注',
  insert_chart: '插入图表',
  edit_chart: '编辑图表',
  set_header_footer: '设置页眉页脚',
  set_page_setup: '设置页面版式',
  insert_section_break: '插入分节符',
  list_styles: '查看样式',
  define_style: '定义样式',
  insert_text_box: '插入文本框',
} satisfies Record<DocxToolName, string>

function toolLabel(name: string): string {
  return TOOL_LABELS[name as DocxToolName] ?? name
}

export function DocxCapabilityStatus({
  capabilities,
  loading,
  error,
  onRetry,
  onSettings,
  revisionMode,
  onRevisionModeChange,
}: {
  capabilities?: DocxAgentCapabilities
  loading: boolean
  error: boolean
  onRetry: () => void
  onSettings: () => void
  revisionMode: boolean
  onRevisionModeChange: (enabled: boolean) => void
}) {
  const { styles } = useStyles()

  return (
    <section className={styles.wrap} aria-label="DOCX AI 能力状态">
      <div className={styles.head}>
        <span>文档编辑能力</span>
        <Button type="link" size="small" onClick={onSettings}>
          配置
        </Button>
      </div>
      <div className={styles.revision}>
        <span>AI 修订</span>
        <Switch
          size="small"
          aria-label="AI 修订"
          checked={revisionMode}
          onChange={onRevisionModeChange}
        />
      </div>
      {error ? (
        <div className={styles.detail} role="alert">
          能力状态读取失败。
          <Button type="link" size="small" onClick={onRetry}>
            重试
          </Button>
        </div>
      ) : loading || !capabilities ? (
        <span className={styles.detail}>正在读取可用能力…</span>
      ) : (
        <>
          <span className={styles.detail}>
            {capabilities.modelReady
              ? `当前已开放 ${capabilities.availableTools.length} 项工具`
              : '聊天模型未就绪，暂不能使用文档工具'}
          </span>
          {capabilities.mediaKinds?.length ? (
            <span className={styles.detail}>
              媒体服务已配置；当前模型的图片、音频或视频输入能力尚未实测，调用失败时会显示原因。
            </span>
          ) : null}
          <details className={styles.details}>
            <summary>查看工具状态</summary>
            {capabilities.availableTools.length > 0 ? (
              <div className={styles.toolGroup}>
                <b>已开放</b>
                <ul>
                  {capabilities.availableTools.map((name) => (
                    <li key={name}>{toolLabel(name)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {capabilities.unavailableTools.length > 0 ? (
              <div className={styles.toolGroup}>
                <b>不可用</b>
                <ul>
                  {capabilities.unavailableTools.map(({ name, reason }) => (
                    <li key={name}>
                      {toolLabel(name)}：{reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </details>
        </>
      )}
    </section>
  )
}

const useStyles = createStyles(({ css, token }) => ({
  wrap: css`
    flex: none;
    max-height: 240px;
    overflow-y: auto;
    padding: 8px 16px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextSecondary};
  `,
  head: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 600;
    color: ${token.colorText};
  `,
  detail: css`
    display: block;
    line-height: 1.5;
  `,
  revision: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  `,
  details: css`
    margin-top: 4px;
    summary {
      cursor: pointer;
      color: ${token.colorLink};
    }
  `,
  toolGroup: css`
    margin-top: 8px;
    ul {
      margin: 4px 0 0;
      padding-left: 20px;
      line-height: 1.6;
    }
  `,
}))
