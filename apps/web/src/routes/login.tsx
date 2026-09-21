import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { App, Button, Card, Form, Input, Typography } from 'antd'
import { createStyles } from 'antd-style'
import { api, ApiRequestError } from '@/lib/api'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: LoginPage,
})

interface FormValues {
  email: string
  password: string
  name?: string
}

const useStyles = createStyles(({ css, token }) => ({
  page: css`
    height: 100%;
    display: grid;
    place-items: center;
    background: ${token.colorBgLayout};
    padding: 24px;
  `,
  card: css`
    width: 380px;
  `,
  title: css`
    margin-top: 0;
    margin-bottom: 4px;
  `,
  hint: css`
    margin-bottom: 20px;
  `,
}))

function LoginPage() {
  const { styles } = useStyles()
  const { message } = App.useApp()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { redirect: redirectTo } = Route.useSearch()

  /**
   * 登录页同时承担注册。
   *
   * 服务端的规则是「首个用户注册后，注册接口自动关闭」，
   * 所以不需要在前端做一个「允许注册」的开关——直接重试即可，
   * 失败时把服务端的提示原样显示出来。
   */
  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      try {
        return await api.auth.signIn({ email: values.email, password: values.password })
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) {
          return api.auth.signUp({
            email: values.email,
            password: values.password,
            name: values.name?.trim() || values.email.split('@')[0] || 'me',
          })
        }
        throw error
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      message.success('已登录')
      if (redirectTo) {
        window.location.href = redirectTo
      } else {
        await router.navigate({ to: '/' })
      }
    },
    onError: (error: unknown) => {
      message.error(error instanceof Error ? error.message : '登录失败')
    },
  })

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <Typography.Title level={4} className={styles.title}>
          mimir
        </Typography.Title>
        <Typography.Paragraph type="secondary" className={styles.hint}>
          首次登录会自动创建唯一账号，之后注册入口自动关闭。
        </Typography.Paragraph>

        <Form<FormValues>
          layout="vertical"
          onFinish={(values) => mutation.mutate(values)}
          requiredMark={false}
        >
          <Form.Item
            name="email"
            label="邮箱"
            rules={[{ required: true, type: 'email', message: '请输入邮箱' }]}
          >
            <Input autoComplete="username" placeholder="me@example.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, min: 8, message: '密码至少 8 位' }]}
          >
            <Input.Password autoComplete="current-password" placeholder="至少 8 位" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={mutation.isPending}>
            登录 / 首次注册
          </Button>
        </Form>
      </Card>
    </div>
  )
}
