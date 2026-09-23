import { useQuery } from '@tanstack/react-query'
import { Skeleton, Typography } from 'antd'
import { api } from '@/lib/api'
import { useStyles } from '@/components/settings/settings.style'
import { Note, Panel, Row } from '@/components/settings/parts'

/**
 * 模型分区。
 *
 * **取值全部来自 `GET /api/config`，不在前端硬编码。** 早期版本把
 * `deepseek-chat` 写死在这里，而它其实是 `MODEL_CHAT_MODEL` 的默认值——
 * 用户改了环境变量之后，这一页会继续显示旧名字。它自己函数注释里那句
 * 「画一个存不进去的假表单比没有更糟」说的是同一件事：界面不能拿一个
 * 它无法保证的值让用户做判断。
 */
export function ModelsSection() {
  const { styles } = useStyles()
  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })
  const models = configQuery.data?.models

  return (
    <>
      <Typography.Paragraph className={styles.sectionDesc}>
        给不同任务分配不同的模型：便宜模型做摘要、强模型做推理。这是最直接的成本控制手段。
      </Typography.Paragraph>

      <Note>
        模型通过<span className={styles.strong}>环境变量</span>
        配置，不在界面上配置。密钥只存在服务端，绝不下发浏览器——所以它不该由界面管理，这一页只负责如实反映服务端当前生效的值。
      </Note>

      <Panel title="任务分配">
        {models ? (
          <>
            <Row label="对话与推理">
              <span className={styles.mono}>{models.chat}</span>
            </Row>
            <Row label="深度思考">
              <span className={styles.mono}>{models.reasoning}</span>
            </Row>
            <Row label="自动摘要" pending>
              未启用（M1）
            </Row>
            <Row label="向量化" pending>
              未启用（M1）
            </Row>
          </>
        ) : (
          <div className={styles.block}>
            <Skeleton active paragraph={{ rows: 2 }} title={false} />
          </div>
        )}
      </Panel>

      <Panel title="连接">
        {models ? (
          <>
            <Row label="服务商">
              <span className={styles.mono}>{models.provider}</span>
            </Row>
            <Row label="接口地址">
              <span className={styles.mono}>{models.baseUrl}</span>
            </Row>
            <Row label="API 密钥">{models.configured ? '已配置（不下发浏览器）' : '未配置'}</Row>
          </>
        ) : (
          <div className={styles.block}>
            <Skeleton active paragraph={{ rows: 2 }} title={false} />
          </div>
        )}
      </Panel>

      <Typography.Paragraph className={styles.muted} style={{ marginTop: 14 }}>
        {models && !models.configured ? (
          <>
            没有配模型也能用：问答会走「只检索」路径，把命中的原文原样列出来，并且不花钱。在{' '}
            <span className={styles.mono}>.env</span> 里设置{' '}
            <span className={styles.mono}>MODEL_API_KEY</span> 与{' '}
            <span className={styles.mono}>MODEL_BASE_URL</span> 即可启用问答。
          </>
        ) : (
          <>
            四个变量：<span className={styles.mono}>MODEL_API_KEY</span> ·{' '}
            <span className={styles.mono}>MODEL_BASE_URL</span> ·{' '}
            <span className={styles.mono}>MODEL_CHAT_MODEL</span> ·{' '}
            <span className={styles.mono}>MODEL_REASONING_MODEL</span>。改完需要重启服务。
          </>
        )}
      </Typography.Paragraph>
    </>
  )
}
