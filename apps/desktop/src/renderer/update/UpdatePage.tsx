import type { DesktopUpdateState, MimirUpdaterBridge } from '@mimir/shared/desktop'
import { Button, Progress, Switch } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { updaterBridge } from '@/lib/updater-bridge'
import { useUpdateState } from '@/lib/use-update-state'
import { useStyles } from './UpdatePage.style'
import { formatBytes, updateCopy } from './update-copy'

export function UpdatePage({ api = updaterBridge }: { api?: MimirUpdaterBridge }) {
  const { state, readError, reload } = useUpdateState(api)
  const { styles } = useStyles()
  const heading = useRef<HTMLHeadingElement>(null)
  const gate = useRef(false)
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState('')
  const [preferencePending, setPreferencePending] = useState(false)
  const preferenceGate = useRef(false)

  useEffect(() => {
    heading.current?.focus()
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && state?.status !== 'restarting') api?.close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [api, state?.status])

  async function run(action: () => Promise<void>) {
    if (gate.current) return
    gate.current = true
    setPending(true)
    setActionError('')
    try {
      await action()
    } catch {
      setActionError('操作没有完成，请重试。')
    } finally {
      gate.current = false
      setPending(false)
    }
  }
  async function setAutoDownload(enabled: boolean) {
    if (!api || preferenceGate.current) return
    preferenceGate.current = true
    setPreferencePending(true)
    setActionError('')
    try {
      await api.setAutoDownload(enabled)
    } catch {
      setActionError('偏好未能保存，请重试。')
    } finally {
      preferenceGate.current = false
      setPreferencePending(false)
    }
  }

  const copy = state
    ? updateCopy(state)
    : {
        title: readError || !api ? '暂时无法读取更新状态' : '正在读取更新状态…',
        description: readError || !api ? '请重试，或关闭窗口后重新打开软件更新。' : '',
      }
  const busy =
    pending ||
    state?.status === 'checking' ||
    state?.status === 'downloading' ||
    state?.status === 'preparing' ||
    state?.status === 'restarting'
  function primaryAction(value: DesktopUpdateState) {
    if (!api) return null
    if (value.status === 'blocked') {
      if (value.recoveryRequired)
        return (
          <Button type="primary" onClick={() => api.close()}>
            关闭更新窗口
          </Button>
        )
      return value.requiresSaveConfirmation ? (
        <Button type="primary" loading={pending} onClick={() => void run(() => api.install(true))}>
          已保存，重启并安装
        </Button>
      ) : (
        <Button type="primary" onClick={() => api.returnToDocument()}>
          返回文档
        </Button>
      )
    }
    if (value.capability === 'disabled')
      return (
        <Button type="primary" loading={pending} onClick={() => void run(() => api.openRelease())}>
          查看发布记录
        </Button>
      )
    if (value.status === 'downloaded' || (value.status === 'error' && value.retry === 'install'))
      return (
        <Button type="primary" loading={pending} onClick={() => void run(() => api.install())}>
          {value.status === 'error' ? '重试重启' : '重启并安装'}
        </Button>
      )
    if (value.status === 'available' && value.capability === 'manual')
      return (
        <Button type="primary" loading={pending} onClick={() => void run(() => api.openRelease())}>
          {value.platform === 'darwin' ? '下载 macOS 版' : '打开官方下载页'}
        </Button>
      )
    if (value.status === 'available' || (value.status === 'error' && value.retry === 'download'))
      return (
        <Button type="primary" loading={pending} onClick={() => void run(() => api.download())}>
          {value.status === 'error' ? '重新下载' : '下载更新'}
        </Button>
      )
    if (busy)
      return (
        <Button type="primary" disabled>
          {value.status === 'checking'
            ? '检查中…'
            : value.status === 'downloading'
              ? '下载中…'
              : '准备中…'}
        </Button>
      )
    return (
      <Button type="primary" loading={pending} onClick={() => void run(() => api.check())}>
        {value.status === 'idle' ? '检查更新' : value.status === 'error' ? '重试' : '再次检查'}
      </Button>
    )
  }
  const progress = state?.progress
  const knownTotal = progress && progress.total !== undefined && progress.total > 0
  const percent = knownTotal
    ? Math.min(100, Math.max(0, (progress.transferred / progress.total!) * 100))
    : undefined
  const checkedAt = state?.checkedAt ? new Date(state.checkedAt) : null

  return (
    <main className={styles.page}>
      <div className={styles.body}>
        <div className={styles.content}>
          <h1 className={styles.heading} tabIndex={-1} ref={heading}>
            软件更新
          </h1>
          {state && <p className={styles.meta}>当前版本 {state.currentVersion}</p>}
          <section className={styles.status} aria-label="更新状态">
            <h2 role="status" aria-live="polite" aria-atomic="true">
              {copy.title}
            </h2>
            <p>{copy.description}</p>
            {state?.status === 'downloading' && progress && (
              <div className={styles.progress}>
                {percent !== undefined && (
                  <Progress
                    percent={Math.floor(percent)}
                    showInfo={false}
                    aria-label="更新下载进度"
                  />
                )}
                <p className={styles.meta}>
                  {percent !== undefined ? `${Math.floor(percent)}% · ` : ''}
                  {formatBytes(progress.transferred)}
                  {knownTotal ? ` / ${formatBytes(progress.total!)}` : ' 已下载'}
                </p>
              </div>
            )}
            {state?.message && (
              <div
                className={
                  state.status === 'error' || state.status === 'blocked'
                    ? styles.error
                    : styles.meta
                }
              >
                {state.message}
              </div>
            )}
            {actionError && (
              <div className={styles.error} role="alert">
                {actionError}
              </div>
            )}
          </section>
          {state?.releaseNotes && (
            <section className={styles.notes} aria-label="更新说明">
              <h3>更新说明</h3>
              <div className={styles.releaseText}>{state.releaseNotes}</div>
            </section>
          )}
          {state?.capability === 'automatic' && (
            <section className={styles.preference} aria-label="下载偏好">
              <div>
                <label htmlFor="automatic-download">自动下载更新</label>
                <p className={styles.meta}>
                  {state.status === 'downloading'
                    ? '关闭后对后续更新生效，本次下载会继续。'
                    : '后台下载，准备好后提醒；重启安装由你决定。'}
                </p>
              </div>
              <Switch
                id="automatic-download"
                aria-label="自动下载更新"
                checked={state.autoDownload}
                loading={preferencePending}
                disabled={state.status === 'restarting'}
                onChange={(enabled) => void setAutoDownload(enabled)}
              />
            </section>
          )}
          {checkedAt && !Number.isNaN(checkedAt.getTime()) && (
            <p className={styles.meta} style={{ marginTop: 16 }}>
              上次检查 {checkedAt.toLocaleString()}
            </p>
          )}
        </div>
      </div>
      <footer className={styles.footer}>
        <div>
          {api && state?.capability !== 'disabled' && (
            <Button type="link" onClick={() => void run(() => api.openRelease())}>
              查看发布记录
            </Button>
          )}
        </div>
        <div>
          {api && !state?.recoveryRequired && (
            <Button disabled={state?.status === 'restarting'} onClick={() => api.close()}>
              {state?.status === 'downloaded' || state?.status === 'available' ? '稍后' : '关闭'}
            </Button>
          )}
          {api &&
            state?.status === 'blocked' &&
            state.retry === 'install' &&
            !state.recoveryRequired &&
            !state.requiresSaveConfirmation && (
              <Button loading={pending} onClick={() => void run(() => api.install())}>
                重试重启
              </Button>
            )}
          {api &&
            state?.status === 'blocked' &&
            !state.recoveryRequired &&
            state.requiresSaveConfirmation && (
              <Button onClick={() => api.returnToDocument()}>返回文档</Button>
            )}
          {state ? (
            primaryAction(state)
          ) : api && readError ? (
            <Button type="primary" onClick={reload}>
              重试
            </Button>
          ) : null}
        </div>
      </footer>
    </main>
  )
}
