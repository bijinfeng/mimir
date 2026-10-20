import { Button, Modal } from 'antd'
import { useRef, type ReactNode } from 'react'
import { FileText, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useCaptureStyles } from './capture/styles'
import { CaptureNotice } from './capture/Notice'
import { createStyles } from 'antd-style'
import { useUnsaved } from '../lib/unsaved'
import { useDocumentDialogStyles, DOCUMENT_DIALOG_TYPE } from './document/DocumentDialog.style'

/**
 * 未保存内容的拦截框。
 *
 * 根据编辑器能力提供继续、丢弃与保存。自动保存不能撤销已落库版本，
 * Office 原件未暴露保存句柄，须回实际工具栏保存。
 *
 * 用 antd 的 Modal（声明式）而不是 Modal.confirm（命令式）：这里的状态由
 * UnsavedProvider 持有，声明式渲染才能让「保存中」这类中间态真实反映出来，
 * 也才能让「保存失败时不放行」这个分支自然表达出来。
 */

/**
 * 说明文字。
 *
 * 副标题那一行原先写在 JSX 的内联 style 里：颜色是字面量 `#68707c`，
 * 字号写成一个裸数字。两处都绕开了守卫——字号阶梯的扫描器只认
 * CSS 里的像素写法，而 JSX 里的颜色也躲过了「页面里不写字面量颜色」。
 * 深色下这处漏网就露出来了：`#68707c` 压在深底上几乎看不见。
 *
 * 顺带把 `className="ant-btn"` 换成 antd 的 `Button`：手写前缀在
 * antd 换 prefixCls 时会整组失效（`.trellis/spec/renderer/frontend/conventions.md` 样式第 7 条），
 * 而这里是在 JSX 里，`${prefixCls}` 根本拿不到。
 */
const useStyles = createStyles(({ css, token }) => ({
  document: css`
    display: flex;
    align-items: flex-start;
    gap: 9px;
    margin: 0 0 12px;
    color: ${token.colorText};
    font-size: ${DOCUMENT_DIALOG_TYPE.body}px;
    line-height: 1.75;
    overflow-wrap: anywhere;
    font-weight: 500;
    > svg {
      margin-top: 2px;
    }
  `,
  body: css`
    margin: 0;
    font-size: ${DOCUMENT_DIALOG_TYPE.body}px;
    line-height: 1.75;
    color: ${token.colorText};
  `,
  notice: css`
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 12px 0 0;
    padding: 10px 12px;
    background: ${token.colorFillQuaternary};
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 6px;
    font-size: ${DOCUMENT_DIALOG_TYPE.body}px;
    line-height: 1.75;
    overflow-wrap: anywhere;
    > svg {
      margin-top: 3px;
    }
  `,
  error: css`
    color: ${token.colorErrorText};
    background: ${token.colorErrorBg};
  `,
}))

function GuardKeyBoundary({ children }: { children: ReactNode }) {
  const composing = useRef(false)
  return (
    <div
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={() => {
        composing.current = false
      }}
      onKeyDownCapture={(event) => {
        if (
          (event.key === 'Enter' || event.key === 'Escape') &&
          (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)
        ) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      {children}
    </div>
  )
}

function renderGuardModal(node: ReactNode) {
  return <GuardKeyBoundary>{node}</GuardKeyBoundary>
}

export function UnsavedGuard({
  captureContext,
  documentTitle,
}: {
  documentTitle?: string
  captureContext?: {
    description: string
    resultHint: string
    documentTitle?: string
    onContinue?: () => void
  }
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const { pending, isDirty, saveMode, canSave, saving, saveError, resolve } = useUnsaved()
  const { styles } = useStyles()
  const { styles: hostStyles, cx } = useDocumentDialogStyles()
  const { styles: captureStyles } = useCaptureStyles()
  const auto = saveMode === 'auto'
  const updating = pending?.reason === 'update'
  const buttonClass = captureContext ? captureStyles.button : hostStyles.button
  function continueEditing() {
    if (saving) return
    resolve('cancel')
    captureContext?.onContinue?.()
  }
  return (
    <Modal
      open={Boolean(pending)}
      title={
        updating
          ? '重启更新前保存改动'
          : captureContext
            ? '打开文档前保存改动'
            : auto && !isDirty
              ? '改动已自动保存'
              : '有改动还没保存'
      }
      closable={false}
      classNames={{ footer: captureContext ? captureStyles.footer : undefined }}
      width={480}
      style={captureContext ? undefined : { top: 52 }}
      className={captureContext ? captureStyles.modal : hostStyles.modal}
      mask={{ closable: false }}
      keyboard={!saving}
      afterOpenChange={(visible) => {
        if (visible) {
          cancelRef.current?.focus()
        }
      }}
      modalRender={renderGuardModal}
      onCancel={continueEditing}
      footer={[
        <Button
          ref={cancelRef}
          key="cancel"
          autoInsertSpace={false}
          className={buttonClass}
          disabled={saving}
          onClick={continueEditing}
        >
          继续编辑
        </Button>,
        ...(!auto && (!captureContext || canSave)
          ? [
              <Button
                key="discard"
                autoInsertSpace={false}
                className={buttonClass}
                disabled={saving}
                onClick={() => resolve('discard')}
              >
                {updating ? '丢弃并重启' : '丢弃改动'}
              </Button>,
            ]
          : []),
        ...(canSave || !isDirty
          ? [
              <Button
                key="save"
                type="primary"
                autoInsertSpace={false}
                className={captureContext ? buttonClass : cx(buttonClass, hostStyles.primary)}
                disabled={saving}
                onClick={() => resolve('save')}
              >
                {captureContext &&
                  (saving ? (
                    <LoaderCircle size={15} className={captureStyles.spin} aria-hidden="true" />
                  ) : (
                    <ShieldCheck size={15} aria-hidden="true" />
                  ))}
                <span>
                  {saving
                    ? '保存中…'
                    : updating
                      ? !isDirty
                        ? '重启并安装'
                        : '保存并重启'
                      : !isDirty
                        ? '离开'
                        : '保存并离开'}
                </span>
              </Button>,
            ]
          : []),
      ]}
    >
      {captureContext ? (
        <div className={captureStyles.body}>
          <div className={captureStyles.guardContext}>
            <FileText size={18} aria-hidden="true" />
            <div>
              <strong>{captureContext.documentTitle || '当前文档'}</strong>
              <p>{isDirty ? '还有未保存的改动' : '改动已保存'}</p>
            </div>
          </div>
          <p className={captureStyles.guardDescription}>{captureContext.description}</p>
          <p className={captureStyles.guardHint}>{captureContext.resultHint}</p>
          {!canSave && (
            <CaptureNotice tone="warning">
              当前编辑器无法代为保存，请继续编辑并在工具栏中保存。
            </CaptureNotice>
          )}
          {saveError && (
            <CaptureNotice tone="error">
              <strong>{saveError}</strong>
              <p>仍停留在原文档，导入结果保留。</p>
            </CaptureNotice>
          )}
          {saving && (
            <div className={captureStyles.wait} role="status">
              <LoaderCircle size={16} className={captureStyles.spin} aria-hidden="true" />
              <span>正在保存当前改动…</span>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className={styles.document}>
            <FileText size={18} aria-hidden />
            {documentTitle || '当前文档'}
          </p>
          <p className={styles.body}>
            {!canSave && isDirty
              ? '当前编辑器无法代为保存，请继续编辑并在工具栏中保存。'
              : auto
                ? isDirty
                  ? '笔记正在自动保存。保存完成后才能离开。'
                  : '这次改动已经写入笔记，可以离开。'
                : updating
                  ? '保存当前改动后重启安装，或丢弃改动并重启。'
                  : '离开前保存改动，或丢弃改动。'}
          </p>
          {saving && (
            <p role="status" className={styles.notice}>
              <LoaderCircle size={15} className={captureStyles.spin} aria-hidden />
              正在保存当前改动…
            </p>
          )}
          {saveError && (
            <p role="alert" className={cx(styles.notice, styles.error)}>
              {saveError}
            </p>
          )}
        </>
      )}
    </Modal>
  )
}
