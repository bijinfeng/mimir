import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { App, Button, Card, Form, Input, Skeleton, Typography } from 'antd'
import { createStyles } from 'antd-style'
import { BrandMark } from '@/components/BrandMark'
import { FONT_SIZE } from '@/theme/tokens'
import { api, ApiRequestError } from '@/lib/api'

/**
 * 登录页。
 *
 * ## 两种形态，由服务端决定，不靠猜
 *
 * | 形态 | 何时 | 表单 |
 * |---|---|---|
 * | 首次注册 | 库里一个账号都没有 | 邮箱 + 密码 + **确认密码** |
 * | 登录 | 已有账号 | 邮箱 + 密码 |
 *
 * 「要不要注册」这件事**由服务端告知**（`/api/auth/setup/state`）。
 * 早期版本是「先试登录，401 就改试注册」，它的代价很具体：
 *
 * ```
 * 用户输错密码
 *   → 登录返回 401（Invalid email or password）
 *   → 前端当成「还没有账号」，改去注册
 *   → 注册返回 400（User already exists）
 *   → 界面上显示「该邮箱已被使用」
 * ```
 *
 * 用户看到的是「邮箱已被使用」，而他真正的问题是「密码打错了」。
 * 两个错误叠在一起，没有任何一句话说到点子上。
 *
 * ## 为什么注册要二次确认
 *
 * 它是**唯一一次**设置密码的机会——单用户规则下没有「忘记密码」的界面路径
 * （找回方式是改 `OWNER_PASSWORD` 后重启，见 services/bootstrap.ts）。
 * 一个打错的密码此刻没有任何反馈，直到下次登录才发现，而那时已经晚了。
 * 登录不需要确认：输错了重输一次的成本远低于每次登录多打一遍。
 */

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: LoginPage,
})

interface LoginValues {
  email: string
  password: string
}

interface SignUpValues extends LoginValues {
  name?: string
  confirm: string
}

const useStyles = createStyles(({ css, token, prefixCls }) => ({
  page: css`
    height: 100%;
    display: grid;
    place-items: center;
    background: ${token.colorBgLayout};
    padding: 24px;
  `,
  card: css`
    width: 400px;
  `,
  /* 标记与标题同排。标题自己带 antd 的 h4 上下边距，这里要清掉，
     否则标记会被顶到偏下 */
  brand: css`
    display: flex;
    align-items: center;
    gap: 9px;
    margin-bottom: 4px;
    color: ${token.colorPrimary};

    .${prefixCls}-typography {
      margin: 0;
      letter-spacing: 0.02em;
    }
  `,
  hint: css`
    margin-bottom: 18px;
  `,
  /* 开发环境预填的提示条。刻意做得低调：它是给开发者的便利，
     不是产品功能的一部分 */
  prefillNote: css`
    margin-top: -6px;
    margin-bottom: 14px;
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextTertiary};
    line-height: 1.7;
  `,
}))

function LoginPage() {
  const { styles } = useStyles()
  const { message } = App.useApp()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { redirect: redirectTo } = Route.useSearch()

  /**
   * 服务端告诉我们该显示哪种形态。
   *
   * `staleTime: 0` 是刻意的：注册成功后这个状态就过期了（从 needsSetup
   * 变成已有账号），下次进登录页必须重新问一次。
   */
  const stateQuery = useQuery({
    queryKey: ['auth-setup-state'],
    queryFn: api.auth.setupState,
    staleTime: 0,
    retry: false,
  })

  const needsSetup = stateQuery.data?.needsSetup ?? false
  const prefill = stateQuery.data?.prefill ?? null

  /** 登录成功后的收尾：清缓存、跳走 */
  const onAuthenticated = async (greeting: string) => {
    await queryClient.invalidateQueries()
    message.success(greeting)
    if (redirectTo) {
      window.location.href = redirectTo
    } else {
      await router.navigate({ to: '/' })
    }
  }

  /**
   * 登录。**只做登录，不偷偷尝试注册。**
   *
   * 这正是修掉那个误导性报错的地方：失败就是失败，
   * 把服务端的原话显示出来（它是「邮箱或密码不正确」，说的是实话）。
   */
  const signIn = useMutation({
    mutationFn: (values: LoginValues) => api.auth.signIn(values),
    onSuccess: () => onAuthenticated('已登录'),
    onError: (error: unknown) => {
      // 401 的原始文案是英文的 "Invalid email or password"，
      // 换成中文并说清是「哪一个可能错」——这句里两个都可能错，
      // 不该暗示是密码错（那样用户会一直改密码而没发现是邮箱打错了）
      const isCredentialError = error instanceof ApiRequestError && error.status === 401
      message.error(isCredentialError ? '邮箱或密码不正确' : describeError(error))
    },
  })

  /** 首次注册 */
  const signUp = useMutation({
    mutationFn: (values: SignUpValues) =>
      api.auth.signUp({
        email: values.email,
        password: values.password,
        name: values.name?.trim() || values.email.split('@')[0] || 'me',
      }),
    onSuccess: () => onAuthenticated('账号已创建'),
    onError: (error: unknown) => message.error(describeError(error)),
  })

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <div className={styles.brand}>
          <BrandMark size={28} title={null} />
          <Typography.Title level={4}>mimir</Typography.Title>
        </div>

        {/* 状态还没回来时不要先渲染登录表单——那会让首次使用的用户
            先看到一个「登录」，半秒后又被换成「注册」 */}
        {stateQuery.isLoading ? (
          <Skeleton active paragraph={{ rows: 4 }} title={false} />
        ) : needsSetup ? (
          <>
            <Typography.Paragraph type="secondary" className={styles.hint}>
              这是首次启动，请创建唯一账号。创建之后注册入口会自动关闭。
            </Typography.Paragraph>
            <SignUpForm onSubmit={(values) => signUp.mutate(values)} pending={signUp.isPending} />
          </>
        ) : (
          <>
            <Typography.Paragraph type="secondary" className={styles.hint}>
              单用户自托管，请用你的账号登录。
            </Typography.Paragraph>
            {prefill && (
              <Typography.Paragraph className={styles.prefillNote}>
                开发环境：已按 <code>.env</code> 的 OWNER_EMAIL 预填，可直接登录。
              </Typography.Paragraph>
            )}
            <LoginForm
              initialEmail={prefill?.email ?? ''}
              initialPassword={prefill?.password ?? ''}
              onSubmit={(values) => signIn.mutate(values)}
              pending={signIn.isPending}
            />
          </>
        )}
      </Card>
    </div>
  )
}

/** 日常登录：邮箱 + 密码 */
function LoginForm({
  initialEmail,
  initialPassword,
  onSubmit,
  pending,
}: {
  initialEmail: string
  initialPassword: string
  onSubmit: (values: LoginValues) => void
  pending: boolean
}) {
  return (
    <Form<LoginValues>
      layout="vertical"
      requiredMark={false}
      initialValues={{ email: initialEmail, password: initialPassword }}
      onFinish={onSubmit}
    >
      <Form.Item
        name="email"
        label="邮箱"
        rules={[{ required: true, type: 'email', message: '请输入邮箱' }]}
      >
        <Input autoComplete="username" placeholder="me@example.com" />
      </Form.Item>
      <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
        <Input.Password autoComplete="current-password" placeholder="密码" />
      </Form.Item>
      <Button type="primary" htmlType="submit" block loading={pending}>
        登录
      </Button>
    </Form>
  )
}

/**
 * 首次注册：邮箱 + 密码 + 确认密码。
 *
 * 二次确认用 antd 的 `dependencies` + 自定义校验器实现——这是它处理
 * 「两个字段要相等」的标准做法，比在提交时手工比对好在**即时反馈**：
 * 第二框还没离开就已经提示不一致，而不是等到点提交。
 */
function SignUpForm({
  onSubmit,
  pending,
}: {
  onSubmit: (values: SignUpValues) => void
  pending: boolean
}) {
  return (
    <Form<SignUpValues> layout="vertical" requiredMark={false} onFinish={onSubmit}>
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
        <Input.Password autoComplete="new-password" placeholder="至少 8 位" />
      </Form.Item>
      <Form.Item
        name="confirm"
        label="确认密码"
        dependencies={['password']}
        rules={[
          { required: true, message: '请再输入一次密码' },
          ({ getFieldValue }) => ({
            validator(_rule, value) {
              if (!value || getFieldValue('password') === value) return Promise.resolve()
              return Promise.reject(new Error('两次输入的密码不一致'))
            },
          }),
        ]}
      >
        <Input.Password autoComplete="new-password" placeholder="再输入一次" />
      </Form.Item>
      <Button type="primary" htmlType="submit" block loading={pending}>
        创建账号
      </Button>
    </Form>
  )
}

/** 把服务端错误翻成一句人话。认不出来就原样透传，不吞掉信息 */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return '操作失败'
  return error.message || '操作失败'
}
