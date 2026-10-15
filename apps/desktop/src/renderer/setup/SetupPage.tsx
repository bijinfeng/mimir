import { BrandMark } from '@mimir/renderer/titlebar-kit'
import type { DesktopModeState } from '@mimir/shared/desktop'
import { Alert, Button, Input, Typography } from 'antd'
import type { InputRef } from 'antd'
import { Cloud, Laptop } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { WindowControls } from '@/components/WindowControls'
import { desktopBridge } from '@/lib/desktop-bridge'
import { useStyles } from '@/setup/SetupPage.style'

/**
 * 首启的使用方式选择页（D-100）。
 *
 * ## 三个入口形态
 *
 * | 形态 | 怎么进来 | 标题 | 能否取消 |
 * |---|---|---|---|
 * | 首次启动 | `mode.get()` 返回 null | 选择使用方式 | 不能（还没有可回去的模式） |
 * | 设置里更换 | 设置 › 客户端的按钮 | 切换使用方式 | 能（「返回，不改」） |
 * | 云端连不上的兜底 | 远端加载失败 | 同上 | 同上 |
 *
 * ## 它为什么仍然是独立的 HTML 入口（D-103）
 *
 * 这一页**必须在没有任何宿主时也能打开**：首次启动时本地宿主还没起，
 * 云端连不上时远端也没有。所以它由 `file://` 加载，是 renderer 段的第二个
 * HTML 入口，不走主应用的路由（后者是 history 模式，`file://` 下不工作）。
 *
 * 但它不再自己抄一套设计系统：主题、品牌件、窗口控件、antd 控件全部与主界面
 * 同源。原先那份 553 行的静态 HTML 里手写了 `--bg` / `--text` / `--border`
 * 与一份深色媒体查询，还另存了一份 BrandMark 的 path——那些都是会静默漂移的
 * 第二份实现。
 *
 * ## 不做探活的展示细节
 *
 * 地址能不能连上由主进程校验（只有它知道失败原因：域名解析不了 / 没人监听 /
 * 证书不信任，三件的下一步完全不同，见 `main/cloud.ts` 的 `describeFetchError`）。
 * 这里只把结果如实显示出来。
 */
export function SetupPage() {
  const { styles } = useStyles()

  /**
   * 桥在首帧之前就已经确定（preload 的保证），所以它**不是状态**。
   *
   * 读成状态会让「这个窗口不是桌面客户端」那句话经由一次 effect 里的
   * setState 产生——而那是 `react(set-state-in-effect)` 要拦的级联渲染，
   * 且 React Compiler 会因此跳过整个组件（.trellis/spec/project/rules.md 铁律 1）。
   */
  const modeApi = desktopBridge?.mode

  /** null = 首次启动（还没有配置）；否则是当前生效的配置 */
  const [current, setCurrent] = useState<DesktopModeState | null>(null)
  /**
   * 读配置之前不要渲染表单——否则首屏会先显示「选择使用方式」再跳成「切换」。
   * 没有桥时无需等待：那一屏只有一句话要说。
   */
  const [loaded, setLoaded] = useState(modeApi === undefined)
  const [loadFailure, setLoadFailure] = useState(false)
  const [readCurrent, setReadCurrent] = useState<
    (() => Promise<DesktopModeState | null>) | undefined
  >(() => (modeApi ? () => modeApi.get() : undefined))
  /** 用户当前选择。默认本地——它是「不需要任何准备就能开始」的那一个 */
  const [choice, setChoice] = useState<'local' | 'cloud'>('local')
  const [cloudUrl, setCloudUrl] = useState('')
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  /** antd 的 Input 是值，ref 的类型要取它的实例类型 */
  const urlRef = useRef<InputRef>(null)

  useEffect(() => {
    if (!readCurrent) return

    let alive = true
    void readCurrent()
      .then((state) => {
        if (!alive) return
        if (state) {
          setCurrent(state)
          setChoice(state.mode)
          if (state.mode === 'cloud') setCloudUrl(state.cloudUrl)
        }
        setLoaded(true)
      })
      .catch(() => {
        if (!alive) return
        setLoadFailure(true)
        setLoaded(true)
      })

    return () => {
      alive = false
    }
  }, [readCurrent])

  /** 选了「连接服务器」就把焦点送进地址框——那是此刻唯一要做的事 */
  useEffect(() => {
    if (choice === 'cloud') urlRef.current?.focus()
  }, [choice])

  /** 已经有生效中的模式 */
  const isSwitch = current !== null
  const canCancel = current !== null

  /**
   * 在普通浏览器里打开这个文件（或 preload 没跑起来）时如实说清楚，
   * 而不是让按钮点了没反应。它与「这次切换失败了」是两件事，但显示在同一处。
   */
  const error = modeApi === undefined ? '这个窗口不是桌面客户端' : failure

  const submit = async () => {
    if (!modeApi) return

    setPending(true)
    setFailure(null)
    setNote(choice === 'local' ? '正在准备本地知识库…' : '正在连接服务器…')

    const payload: DesktopModeState =
      choice === 'local' ? { mode: 'local' } : { mode: 'cloud', cloudUrl }

    /**
     * IPC 抛出的错误在渲染侧只剩一句「Error invoking remote method …」，
     * 原始消息会被前缀吞掉——所以契约用的是判别联合而不是 reject
     * （见 `packages/shared/src/desktop.ts` 的 `DesktopModeResult`）。
     * 这里的 catch 只兜「连 IPC 都没通」。
     */
    const result = await modeApi
      .choose(payload)
      .catch((cause: unknown) => ({ ok: false as const, message: String(cause) }))

    if (!result.ok) {
      setPending(false)
      setNote(null)
      setFailure(result.message || '切换失败')
      return
    }

    setNote('正在打开…')
    // 导航一定会替换掉这一页，所以这里不需要收尾
    modeApi.activate()
  }

  if (!loaded) return null

  return (
    <div className={styles.page}>
      <div className={styles.bar} data-platform={desktopBridge?.window.platform}>
        <span className={styles.spacer} />
        {/*
          这一页也需要窗口控件：壳是 `frame: false`，没有它用户连窗口都关不掉。
          **不渲染最大化**——这一页是一次性的选择，撑满屏幕没有意义。
        */}
        <WindowControls omit={['maximize']} />
      </div>

      <div className={styles.body}>
        <div className={styles.brandPane}>
          <div className={styles.brand}>
            <BrandMark size={38} title={null} />
            <Typography.Title level={2} className={styles.brandName}>
              mimir
            </Typography.Title>
          </div>
          <p className={styles.brandPosition}>知识工作区</p>
        </div>
        <div className={styles.formPane}>
          <div className={styles.formContent}>
            <Typography.Title level={2} className={styles.heading}>
              {loadFailure ? '无法读取使用方式' : isSwitch ? '切换使用方式' : '选择使用方式'}
            </Typography.Title>

            {loadFailure ? (
              <>
                <Alert
                  type="error"
                  showIcon
                  title="暂时无法读取当前配置，请重试。"
                  style={{ marginBottom: 16 }}
                />
                <Button
                  type="primary"
                  onClick={() => {
                    setLoadFailure(false)
                    setLoaded(false)
                    setReadCurrent(() => (modeApi ? () => modeApi.get() : undefined))
                  }}
                >
                  重试
                </Button>
              </>
            ) : (
              <>
                <Typography.Paragraph type="secondary" className={styles.lead}>
                  {isSwitch
                    ? '切换后可随时换回；本地数据不会被删除。'
                    : '选择资料存放的位置。之后可在设置中更改。'}
                </Typography.Paragraph>

                {error !== null && (
                  <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />
                )}

                <div className={styles.options} role="group" aria-label="使用方式">
                  <button
                    type="button"
                    className={styles.option}
                    aria-pressed={choice === 'local'}
                    disabled={pending}
                    onClick={() => {
                      setChoice('local')
                      setFailure(null)
                    }}
                  >
                    <Laptop size={20} aria-hidden="true" />
                    <span className={styles.optionText}>
                      <span className={styles.optionName}>本地使用</span>
                      <span className={styles.optionDesc}>资料保存在此设备，可离线使用。</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={styles.option}
                    aria-pressed={choice === 'cloud'}
                    disabled={pending}
                    onClick={() => {
                      setChoice('cloud')
                      setFailure(null)
                    }}
                  >
                    <Cloud size={20} aria-hidden="true" />
                    <span className={styles.optionText}>
                      <span className={styles.optionName}>连接服务器</span>
                      <span className={styles.optionDesc}>
                        连接你自己的服务器，在多台设备上使用。
                      </span>
                    </span>
                  </button>
                </div>

                {choice === 'cloud' && (
                  <div className={styles.field}>
                    <Typography.Text>
                      <label htmlFor="mimir-server-url">服务器地址</label>
                    </Typography.Text>
                    <Input
                      id="mimir-server-url"
                      ref={urlRef}
                      type="url"
                      value={cloudUrl}
                      placeholder="https://mimir.example.com"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={pending}
                      onChange={(event) => setCloudUrl(event.target.value)}
                      onPressEnter={() => void submit()}
                      style={{ marginTop: 6 }}
                    />
                    <Typography.Paragraph
                      type="secondary"
                      style={{ marginTop: 6, marginBottom: 0 }}
                    >
                      输入你的 mimir 服务器地址。
                    </Typography.Paragraph>
                  </div>
                )}

                <div className={styles.row}>
                  <Button
                    type="primary"
                    loading={pending}
                    disabled={
                      modeApi === undefined || (choice === 'cloud' && cloudUrl.trim() === '')
                    }
                    onClick={() => void submit()}
                  >
                    {isSwitch ? '切换' : '开始使用'}
                  </Button>

                  {canCancel && (
                    /**
                     * 「返回，不改」走 `activate()` 而不是自己拼地址——宿主那边会顺带
                     * 把本机令牌重新注入（本地模式下这是必须的一步），
                     * 地址归一化也只有一处。
                     */
                    <Button
                      disabled={pending}
                      onClick={() => {
                        setNote('正在返回…')
                        desktopBridge?.mode.activate()
                      }}
                    >
                      返回，不改
                    </Button>
                  )}

                  {note !== null && <Typography.Text type="secondary">{note}</Typography.Text>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
