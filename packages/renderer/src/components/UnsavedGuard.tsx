import { Button, Modal } from 'antd'
import { useRef } from 'react'
import { FileText, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useCaptureStyles } from './capture/styles'
import { CaptureNotice } from './capture/Notice'
import { createStyles } from 'antd-style'
import { useUnsaved } from '../lib/unsaved'

/**
 * 未保存内容的拦截框。
 *
 * `.trellis/spec/project/product.md` §5.9：给**三个**选项，而不是两个。
 * 「继续编辑 / 丢弃改动 / 保存并离开」——两选项（留下 / 丢弃）把这个场景
 * 变成二选一的拷问，而用户真正想要的往往是第三种。
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
  body: css`
    margin: 0;
    line-height: 1.75;
    color: ${token.colorText};
  `,
}))

export function UnsavedGuard({
  captureContext,
}: {
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
  const { styles: captureStyles } = useCaptureStyles()
  const auto = saveMode === 'auto'
  const captureButton = captureContext ? captureStyles.button : undefined
  function continueEditing() {
    if (saving) return
    resolve('cancel')
    captureContext?.onContinue?.()
  }
  return (
    <Modal
      open={Boolean(pending)}
      title={
        captureContext
          ? '打开文档前保存改动'
          : auto && !isDirty
            ? '改动已自动保存'
            : '有改动还没保存'
      }
      closable={false}
      classNames={{ footer: captureContext ? captureStyles.footer : undefined }}
      width={captureContext ? 480 : undefined}
      className={captureContext ? captureStyles.modal : undefined}
      mask={{ closable: false }}
      keyboard={Boolean(captureContext) && !saving}
      afterOpenChange={(visible) => {
        if (visible && captureContext) cancelRef.current?.focus()
      }}
      onCancel={continueEditing}
      footer={[
        <Button
          ref={cancelRef}
          key="cancel"
          autoInsertSpace={captureContext ? false : undefined}
          className={captureButton}
          disabled={saving}
          onClick={continueEditing}
        >
          继续编辑
        </Button>,
        ...(!auto && (!captureContext || canSave)
          ? [
              <Button
                key="discard"
                danger={!captureContext}
                className={captureButton}
                disabled={saving}
                onClick={() => resolve('discard')}
              >
                丢弃改动
              </Button>,
            ]
          : []),
        ...(!captureContext || canSave
          ? [
              <Button
                key="save"
                type="primary"
                className={captureButton}
                disabled={Boolean(captureContext) && saving}
                loading={!captureContext && saving}
                onClick={() => resolve('save')}
              >
                {captureContext &&
                  (saving ? (
                    <LoaderCircle size={15} className={captureStyles.spin} aria-hidden="true" />
                  ) : (
                    <ShieldCheck size={15} aria-hidden="true" />
                  ))}
                <span>
                  {captureContext && saving ? '保存中…' : auto && !isDirty ? '离开' : '保存并离开'}
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
          <p className={styles.body}>
            {auto
              ? isDirty
                ? '笔记正在自动保存。保存完成后才能离开。'
                : '这次改动已经写入笔记，可以离开。'
              : '离开前保存改动，或丢弃改动。'}
          </p>
          {saveError && (
            <p role="alert" className={styles.body}>
              {saveError}
            </p>
          )}
        </>
      )}
    </Modal>
  )
}
