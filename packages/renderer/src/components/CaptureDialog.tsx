import { Button, Input, Modal } from 'antd'
import type { InputRef } from 'antd'
import { ArrowRight, Folder, LoaderCircle, X } from 'lucide-react'
import { useContext, useRef, useState } from 'react'
import { UploadPanel } from './UploadPanel'
import { AppShellContext } from '../lib/app-shell-context'
import { CaptureNotice } from './capture/Notice'
import { CaptureStages } from './capture/CaptureStages'
import { validCaptureSource } from './capture/helpers'
import { useCaptureStyles } from './capture/styles'
import { useCaptureRequest } from './capture/use-capture-request'

export interface CaptureDialogProps {
  open: boolean
  onClose: () => void
  onAfterClose?: () => void
  onCaptured: (documentId: string) => void
  initialTab?: 'url' | 'upload'
  directory?: boolean
  folder?: string | null
  /** Hide only the layer while the existing unsaved guard owns keyboard focus. */
  interactionSuspended?: boolean
}

export function CaptureDialog({
  open,
  onClose,
  onAfterClose,
  onCaptured,
  initialTab,
  directory,
  folder,
  interactionSuspended = false,
}: CaptureDialogProps) {
  const { styles, cx } = useCaptureStyles()
  const shell = useContext(AppShellContext)
  const [url, setUrl] = useState('')
  const [tab, setTab] = useState<'url' | 'upload'>(initialTab ?? 'url')
  const [uploadBusy, setUploadBusy] = useState(false)
  const uploadLock = useRef(false)
  const composing = useRef(false)
  const inputRef = useRef<InputRef>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const returnToResult = useRef(false)
  const {
    result,
    failure,
    running,
    settling,
    submitLock,
    submit: capture,
    refresh,
  } = useCaptureRequest(folder, handoff)
  const detected = validCaptureSource(url)
  const invalid = Boolean(url.trim()) && !detected
  const busy = running || settling || uploadBusy

  function handoff(id: string) {
    returnToResult.current = true
    // Keep successful results mounted until the host actually navigates away.
    onCaptured(id)
  }
  async function submit() {
    if (
      !detected ||
      composing.current ||
      submitLock.current ||
      uploadLock.current ||
      interactionSuspended
    )
      return
    const value = url.trim()
    setUrl(value)
    await capture(value)
  }

  function close() {
    if (submitLock.current || uploadLock.current || interactionSuspended) return
    onClose()
  }
  function switchTab(next: 'url' | 'upload') {
    if (submitLock.current || uploadLock.current || interactionSuspended) return
    setTab(next)
  }
  const partial = result?.stages.some((stage) => stage.status === 'failed')
  return (
    <Modal
      open={open && !interactionSuspended}
      onCancel={close}
      afterClose={() => {
        if (!open) onAfterClose?.()
      }}
      afterOpenChange={(visible) => {
        if (!visible) return
        if (returnToResult.current) {
          contentRef.current
            ?.querySelector<HTMLElement>('[data-capture-result-open]')
            ?.focus({ preventScroll: true })
          returnToResult.current = false
        } else if (tab === 'url') inputRef.current?.focus()
        else
          contentRef.current
            ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
            ?.focus()
      }}
      focusable={{ focusTriggerAfterClose: false }}
      closable={busy ? false : { 'aria-label': '关闭收集弹窗' }}
      closeIcon={<X size={18} aria-hidden="true" />}
      mask={{ closable: !busy && !interactionSuspended }}
      keyboard={!busy && !interactionSuspended}
      title="收集内容"
      width={540}
      className={styles.modal}
      footer={
        <div className={styles.footer}>
          <Button autoInsertSpace={false} className={styles.button} onClick={close} disabled={busy}>
            {tab === 'upload' ? '关闭' : '取消'}
          </Button>
          {tab === 'url' && (
            <Button
              autoInsertSpace={false}
              className={styles.button}
              type="primary"
              disabled={!detected || busy}
              onClick={() => void submit()}
            >
              {running && <LoaderCircle size={15} className={styles.spin} aria-hidden="true" />}
              <span>{running ? '抓取中…' : settling ? '正在打开…' : '抓取'}</span>
            </Button>
          )}
        </div>
      }
    >
      <div ref={contentRef} className={styles.frame}>
        <div className={styles.target}>
          <Folder size={14} aria-hidden="true" />
          <span className={styles.muted}>收进</span>
          <span>{folder || '知识库根'}</span>
        </div>
        <div className={styles.tabs} role="tablist" aria-label="收集方式">
          {(['url', 'upload'] as const).map((value) => (
            <Button
              autoInsertSpace={false}
              key={value}
              role="tab"
              id={`capture-tab-${value}`}
              aria-controls="capture-panel"
              aria-selected={tab === value}
              tabIndex={tab === value ? 0 : -1}
              disabled={busy}
              onClick={() => switchTab(value)}
              onKeyDown={(event) => {
                if (busy || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
                event.preventDefault()
                const next = value === 'url' ? 'upload' : 'url'
                switchTab(next)
                document.getElementById(`capture-tab-${next}`)?.focus()
              }}
            >
              {value === 'url' ? '粘贴链接' : '上传文件'}
            </Button>
          ))}
        </div>
        <div
          className={styles.body}
          id="capture-panel"
          role="tabpanel"
          aria-labelledby={`capture-tab-${tab}`}
        >
          {tab === 'upload' ? (
            <UploadPanel
              folder={folder}
              directory={directory}
              onBusyChange={(value) => {
                uploadLock.current = value
                setUploadBusy(value)
              }}
              claimBatch={shell?.claimUploadBatch ? () => shell.claimUploadBatch!(true) : undefined}
              releaseBatch={shell?.releaseUploadBatch}
              onComplete={refresh}
              onUploaded={handoff}
            />
          ) : (
            <>
              <div className={styles.field}>
                <label htmlFor="capture-url">网页链接</label>
                <Input
                  ref={inputRef}
                  id="capture-url"
                  className={styles.input}
                  placeholder="https://example.com/article"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  disabled={running || settling}
                  aria-invalid={invalid}
                  aria-describedby="capture-url-hint"
                  data-invalid={invalid}
                  onCompositionStart={() => {
                    composing.current = true
                  }}
                  onCompositionEnd={() => {
                    composing.current = false
                  }}
                  onPressEnter={(event) => {
                    event.preventDefault()
                    if (event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat)
                      return
                    void submit()
                  }}
                  suffix={
                    url && !running && !settling ? (
                      <Button
                        autoInsertSpace={false}
                        type="text"
                        className={styles.clear}
                        aria-label="清除链接"
                        onClick={() => {
                          setUrl('')
                          inputRef.current?.focus()
                        }}
                      >
                        <X size={12} aria-hidden="true" />
                      </Button>
                    ) : (
                      <span data-capture-empty-suffix />
                    )
                  }
                />
                <div
                  id="capture-url-hint"
                  className={cx(styles.source, invalid && styles.invalid)}
                  aria-live="polite"
                >
                  {detected ? (
                    <>
                      <span>
                        识别为 <b>{detected.label}</b>
                      </span>
                      <span>· {detected.note}</span>
                    </>
                  ) : url.trim() ? (
                    <span>
                      {url.trim().length > 2000
                        ? '链接不能超过 2000 个字符，请缩短后再试。'
                        : '请输入完整的 http:// 或 https:// 链接。'}
                    </span>
                  ) : (
                    <span>支持网页、公众号文章、GitHub 仓库</span>
                  )}
                </div>
              </div>
              {running && (
                <div className={styles.wait} role="status">
                  <LoaderCircle className={styles.spin} size={17} aria-hidden="true" />
                  <div>
                    <strong>正在抓取，等待服务器返回</strong>
                    <p>完成后展示阶段结果，暂时不能切换或关闭。</p>
                  </div>
                </div>
              )}
              {!running && (result || failure?.stage) && (
                <CaptureStages stages={result?.stages ?? []} failedStage={failure?.stage} />
              )}
              {failure && (
                <CaptureNotice tone="error">
                  <strong>{failure.message}</strong>
                  <p>
                    {failure.uncertain
                      ? '未收到响应不代表没有保存。请先查看目标知识库，确认后再决定是否重新抓取。'
                      : failure.kind === 'wechat'
                        ? '公众号可能限制抓取。可稍后再试，或在浏览器扩展中收集。'
                        : failure.stage === 'fetch'
                          ? '请检查链接是否可访问，再重新抓取。'
                          : failure.stage === 'extract'
                            ? '未能提取正文，可检查页面内容后重新抓取。'
                            : '请根据原因处理后重新抓取。'}
                  </p>
                </CaptureNotice>
              )}
              {result && (
                <CaptureNotice tone={partial ? 'warning' : 'success'}>
                  <strong>{partial ? '正文已保存，部分阶段失败' : '抓取完成'}</strong>
                  <p>
                    {result.stages
                      .filter((stage) => stage.stage === 'extract' || stage.stage === 'assets')
                      .map((stage) => stage.meta)
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p>
                    {!result.documentId
                      ? '未返回文档 ID，请先查看知识库确认结果。'
                      : settling
                        ? '即将打开收集的文档…'
                        : '已收集的文档可在目标知识库中查看。'}
                  </p>
                </CaptureNotice>
              )}
              {result?.documentId && !settling && (
                <Button
                  autoInsertSpace={false}
                  type="primary"
                  className={styles.button}
                  data-capture-result-open
                  onClick={() => handoff(result.documentId!)}
                >
                  <span>打开收集的文档</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
