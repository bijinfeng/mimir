import { useQuery } from '@tanstack/react-query'
import { App, Button, Typography } from 'antd'
import { api } from '@/lib/api'
import { Panel, Row } from '@/components/settings/parts'
import { useStyles } from '@/components/settings/settings.style'

/**
 * 账号。
 *
 * 单用户自托管，这里只做登出。刻意**不做**邮箱修改与改密表单：
 * 前者是单用户规则的锚点（`docs/DECISIONS.md` D-020），后者还没有对应的接口——
 * 做一个存不进去的表单比不做更糟，用户会以为改了密码。
 */
export function AccountSection() {
  const { styles } = useStyles()
  const { message } = App.useApp()

  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: api.auth.session })

  return (
    <>
      <Typography.Paragraph className={styles.sectionDesc}>
        单用户自托管。第一个注册的人是唯一用户，之后注册自动关闭。
      </Typography.Paragraph>

      <Panel title="登录">
        <Row label="邮箱">{sessionQuery.data?.user.email ?? '—'}</Row>
        <Row label="名称">{sessionQuery.data?.user.name ?? '—'}</Row>
      </Panel>

      <Typography.Paragraph className={styles.muted} style={{ marginTop: 14 }}>
        改密码还没有对应的接口，所以这里不提供表单——一个存不进去的表单会让你以为密码改了。以服务端接口为准，等它做出来再接。
      </Typography.Paragraph>

      <div className={styles.actions} style={{ marginTop: 14 }}>
        <Button
          danger
          onClick={() => {
            void api.auth.signOut().then(() => {
              message.success('已登出')
              window.location.href = '/login'
            })
          }}
        >
          登出
        </Button>
      </div>
    </>
  )
}
