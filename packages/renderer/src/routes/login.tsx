import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Alert, App, Button, Form, Input, Skeleton, Typography } from 'antd'
import type { Rule } from 'antd/es/form'
import { createStyles } from 'antd-style'
import { useState } from 'react'
import loginNotebookLines from '../assets/login-notebook-lines-fade.png'
import { BrandMark } from '../components/BrandMark'
import { useDesktopBridge, useTitleBar } from '../platform'
import { FONT_SIZE } from '../theme/tokens'
import { api, ApiRequestError } from '../lib/api'

/**
 * 登录页。
 *
 * ## 两种形态，由服务端决定，不靠猜
 *
 * | 形态 | 何时 | 表单 |
 * |---|---|---|
 * | 首次注册 | 库里一个账号都没有 | 邮箱 + 用户名（可选）+ 密码 + **确认密码** |
 * | 登录 | 已有账号 | 用户名或邮箱 + 密码 |
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
  identifier: string
  password: string
}

interface SignUpValues {
  email: string
  name?: string
  password: string
  confirm: string
}

/** 这一页没有侧栏，标题栏的折叠回调是个空动作 */
const noop = () => {}

const useStyles = createStyles(({ css, token }) => ({
  /*
    外壳：标题栏 + 页面。**登录页也需要那条标题栏**（D-100 / D-103）——
    桌面壳是 `frame: false`，没有它就没有拖动区与关闭按钮；
    而云端模式落地的第一个界面恰恰就是远端的登录页。
    浏览器里标题栏插槽返回 null，所以这层多出来的只是一个 flex 列。
  */
  shell: css`
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  `,
  page: css`
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(320px, 2fr) minmax(0, 3fr);
    background: ${token.colorBgLayout};
    overflow: auto;
    @media (max-width: 760px) {
      grid-template-columns: minmax(0, 1fr);
      align-content: start;
    }
  `,
  brandPane: css`
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-width: 0;
    overflow: hidden;
    padding: clamp(32px, 5vw, 72px);
    background: ${token.tintNav};
    border-right: 1px solid ${token.colorBorderSecondary};
    @media (max-width: 760px) {
      padding: 28px 28px 20px;
      border-right: 0;
      border-bottom: 1px solid ${token.colorBorderSecondary};
    }
  `,
  brand: css`
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    color: ${token.colorLink};
  `,
  brandName: css`
    margin: 0 !important;
    color: ${token.colorText} !important;
    font-weight: 700 !important;
    letter-spacing: 0.06em;
  `,
  brandPosition: css`
    position: relative;
    z-index: 1;
    margin: 0;
    color: ${token.colorTextSecondary};
    font-size: ${FONT_SIZE.body}px;
    @media (max-width: 760px) {
      display: none;
    }
  `,
  brandIllustration: css`
    position: absolute;
    top: 23%;
    left: 9%;
    width: min(720px, 155%);
    height: auto;
    pointer-events: none;
    user-select: none;
    @media (max-width: 760px) {
      display: none;
    }
  `,
  formPane: css`
    min-width: 0;
    display: grid;
    place-items: center;
    padding: 48px 28px;
    background: ${token.colorBgContainer};
    @media (max-width: 760px) {
      display: block;
      padding: 40px 28px 56px;
    }
  `,
  formContent: css`
    width: min(100%, 400px);
    min-width: 0;
  `,
  heading: css`
    margin: 0 0 28px !important;
    font-size: ${FONT_SIZE.display}px !important;
    line-height: 1.25 !important;
  `,
  hint: css`
    margin-bottom: 18px;
  `,
  /**
   * 失败提示条。它常驻到下一次提交，而不是只活一条 toast。
   *
   * `.trellis/spec/project/design.md` §0.2：状态必须能被看见，**且必须带得走**。3 秒的
   * `message.error` 两半都不满足——用户去看一眼密码管理器、切个窗口再回来，
   * 页面上就只剩一个填好的表单，没有任何「刚才失败了」的线索。
   *
   * 与 toast 并存是因为两者的职责不同：toast 是「这次点击的结果」（立刻，
   * 不看表单也知道），这一条是「上次为什么没进去」（回来时还在）。
   */
  formError: css`
    margin-bottom: 16px;
  `,
  auxiliaryNote: css`
    margin-top: 18px;
    margin-bottom: 0;
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextTertiary};
    line-height: 1.7;
  `,
}))

function LoginPage() {
  const { styles } = useStyles()
  const { message } = App.useApp()
  const bridge = useDesktopBridge()
  /* 桌面 renderer 意外落到登录页时仍要有标题栏；云端模式现在由远端 Web 构建
     与系统窗口边框负责（D-105）。这里没有侧栏可折叠，三项都给静默值。 */
  const titleBar = useTitleBar({ collapsed: false, showToggle: false, onToggleCollapsed: noop })
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
  /**
   * 本地模式（D-100）：这个宿主由桌面客户端启动，凭据由客户端持有
   * （宿主注入的本机令牌），**密码登录不会成功**。
   *
   * 什么时候会走到这一页？只有一种情况：客户端注入的令牌丢了（cookie
   * 被清掉、或从普通浏览器直接打开了 `127.0.0.1:<port>`）。所以文案不说
   * 「本地模式不需要登录」——那对此刻的用户没有用——而是说清**该去哪儿**。
   */
  const localMode = stateQuery.data?.localMode ?? false

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
   * 上一次提交为什么失败。**常驻**到下一次提交，而不是只活一条 toast。
   *
   * 假密码打错一次、恰好去看了一眼密码管理器或切了窗口再回来，页面上就只剩
   * 一个填好的表单、没有任何「刚才失败了」的线索——`.trellis/spec/project/design.md` §0.2
   * 要求状态必须能被看见**且必须带得走**，3 秒的 toast 两半都不满足。
   *
   * 清空的时机是**下一次提交**，不是「用户开始打字」：那条提示回答的是
   * 「上一次为什么没进去」，改了哪个框并不改变它，而边打字边消失会让
   * 「我刚才看的是什么」来不及读完。
   */
  const [formError, setFormError] = useState<string | null>(null)

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
      // 不该暗示是密码错（那样用户会一直改密码而没发现是用户名/邮箱打错了）
      const isCredentialError = error instanceof ApiRequestError && error.status === 401
      const text = isCredentialError ? '用户名/邮箱或密码不正确' : describeError(error)
      // 两处都有意保留：toast 是「这次点击的结果」，提示条是「上次为什么没进去」
      setFormError(text)
      message.error(text)
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
    onError: (error: unknown) => {
      const text = describeError(error)
      setFormError(text)
      message.error(text)
    },
  })

  /** 表单提交的统一入口：先清掉上一次的失败提示，再发这一次 */
  const submit = <T,>(run: (values: T) => void) => {
    return (values: T) => {
      setFormError(null)
      run(values)
    }
  }

  return (
    <div className={styles.shell}>
      {/* 桌面端是拖动区与窗口控件，浏览器里是 null */}
      {titleBar}
      <div className={styles.page}>
        <div className={styles.brandPane}>
          <div className={styles.brand}>
            <BrandMark size={28} title={null} />
            <Typography.Title className={styles.brandName} level={4}>
              mimir
            </Typography.Title>
          </div>
          <img
            className={styles.brandIllustration}
            src={loginNotebookLines}
            alt=""
            aria-hidden="true"
          />
          <p className={styles.brandPosition}>笔记与资料，随时可查可问</p>
        </div>

        <main className={styles.formPane}>
          <div className={styles.formContent}>
            <Typography.Title className={styles.heading} level={1}>
              {stateQuery.isLoading
                ? '请稍候'
                : stateQuery.isError
                  ? '暂时无法登录'
                  : localMode
                    ? '返回客户端'
                    : needsSetup
                      ? '创建账号'
                      : '登录'}
            </Typography.Title>

            {/* 失败提示条放在表单**上方**：它在说「上一次提交的结果」，
            而按钮在表单底部——放下面会被键盘与滚动推走。
            `title` 而不是 `message`：后者在 antd v6 已废弃、会打一条警告
            （同类迁移见 .trellis/spec/project/design.md §7.5） */}
            {formError !== null && (
              <Alert className={styles.formError} type="error" showIcon title={formError} />
            )}

            {/* 状态还没回来时不要先渲染登录表单——那会让首次使用的用户
            先看到一个「登录」，半秒后又被换成「注册」 */}
            {stateQuery.isLoading ? (
              <Skeleton active paragraph={{ rows: 4 }} title={false} />
            ) : stateQuery.isError ? (
              <>
                <Alert
                  className={styles.formError}
                  type="error"
                  showIcon
                  title="无法连接服务"
                  description="请检查网络连接后重试。如果仍无法连接，请确认服务地址是否正确。"
                />
                <Button type="primary" onClick={() => void stateQuery.refetch()}>
                  重试
                </Button>
              </>
            ) : localMode ? (
              /* 本地模式（D-100）：这里没有可填的东西——凭据由桌面客户端持有。
             给出路（回客户端），而不是给一个填了也不会成功的表单 */
              <>
                <Typography.Paragraph type="secondary" className={styles.hint}>
                  请在桌面客户端继续使用。
                </Typography.Paragraph>
              </>
            ) : needsSetup ? (
              <>
                <SignUpForm
                  onSubmit={submit((values) => signUp.mutate(values))}
                  pending={signUp.isPending}
                />
              </>
            ) : (
              <>
                <LoginForm
                  initialIdentifier={prefill?.email ?? ''}
                  initialPassword={prefill?.password ?? ''}
                  onSubmit={submit((values) => signIn.mutate(values))}
                  pending={signIn.isPending}
                />
              </>
            )}

            {/* 桌面壳里给一条**不依赖远端可用性**的出路（D-100 / D-103）：选错服务器
            （或想改用本地使用）时，设置页进不去——它也在远端——而选择页
            由客户端自己提供，是此刻唯一还活着的入口 */}
            {bridge ? (
              <Typography.Paragraph className={styles.auxiliaryNote}>
                <Button type="link" size="small" onClick={() => bridge.mode.openSetup()}>
                  更换使用方式…
                </Button>
              </Typography.Paragraph>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  )
}

/**
 * 共享的「标识类」输入框——登录用的「用户名或邮箱」、注册用的「邮箱」都走它。
 *
 * 统一封装 `Form.Item` + `Input`，两个表单的视觉、自动填充、校验时机完全一致。
 * `rules` 不传时默认必填；注册的可选用户名字段传自己的规则即可覆盖。
 * `extra` 用于注册时给字段加说明文案。
 */
function IdentifierField({
  name,
  label,
  placeholder,
  autoComplete,
  rules,
  extra,
}: {
  name: string
  label: string
  placeholder: string
  autoComplete: string
  rules?: Rule[]
  extra?: string
}) {
  return (
    <Form.Item
      name={name}
      label={label}
      extra={extra}
      rules={rules ?? [{ required: true, message: `请输入${label}` }]}
    >
      <Input autoComplete={autoComplete} placeholder={placeholder} />
    </Form.Item>
  )
}

/**
 * 共享的密码输入框——登录、注册、确认密码都走它。
 *
 * 默认必填，注册场景传入 `min` 或自定义 `rules` 覆盖。
 * `dependencies` 用于「确认密码」随密码变化重新校验。
 */
function PasswordField({
  name,
  label,
  placeholder,
  autoComplete,
  rules,
  dependencies,
}: {
  name: string
  label: string
  placeholder: string
  autoComplete: string
  rules?: Rule[]
  dependencies?: string[]
}) {
  return (
    <Form.Item
      name={name}
      label={label}
      dependencies={dependencies}
      rules={rules ?? [{ required: true, message: '请输入密码' }]}
    >
      <Input.Password autoComplete={autoComplete} placeholder={placeholder} />
    </Form.Item>
  )
}

/** 日常登录：用户名或邮箱 + 密码 */
function LoginForm({
  initialIdentifier,
  initialPassword,
  onSubmit,
  pending,
}: {
  initialIdentifier: string
  initialPassword: string
  onSubmit: (values: LoginValues) => void
  pending: boolean
}) {
  return (
    <Form<LoginValues>
      layout="vertical"
      requiredMark={false}
      initialValues={{ identifier: initialIdentifier, password: initialPassword }}
      onFinish={onSubmit}
    >
      <IdentifierField
        name="identifier"
        label="用户名或邮箱"
        placeholder="用户名或邮箱"
        autoComplete="username"
      />
      <PasswordField
        name="password"
        label="密码"
        placeholder="密码"
        autoComplete="current-password"
      />
      <Button type="primary" htmlType="submit" block loading={pending} size="large">
        登录
      </Button>
    </Form>
  )
}

/**
 * 首次注册：邮箱 + 用户名（可选）+ 密码 + 确认密码。
 *
 * 用户名留空时由服务端按邮箱前缀推导（见 login.tsx 的 signUp mutation）。
 * 它是登录时除邮箱外的另一种凭证——单人工具里记邮箱不如记一个自己取的名字。
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
      <IdentifierField
        name="email"
        label="邮箱"
        placeholder="admin@example.com"
        autoComplete="email"
        rules={[{ required: true, type: 'email', message: '请输入邮箱' }]}
      />
      <IdentifierField
        name="name"
        label="用户名（可选）"
        placeholder="便于登录的名字"
        autoComplete="username"
        extra="留空将使用邮箱前缀，登录时可用用户名或邮箱"
        rules={[{ max: 32, message: '用户名最多 32 个字符' }]}
      />
      <PasswordField
        name="password"
        label="密码"
        placeholder="至少 8 位"
        autoComplete="new-password"
        rules={[{ required: true, min: 8, message: '密码至少 8 位' }]}
      />
      <PasswordField
        name="confirm"
        label="确认密码"
        placeholder="再输入一次"
        autoComplete="new-password"
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
      />
      <Button type="primary" htmlType="submit" block loading={pending} size="large">
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
