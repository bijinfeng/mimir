import { AttachmentPrimitive, useAuiState } from '@assistant-ui/react'
import { Button } from 'antd'
import { createStyles } from 'antd-style'
import { X } from 'lucide-react'
import { snapshotFilename } from '../runtime/pptx-snapshot.js'
import { useMimirChatApi } from '../runtime/chat-context.js'

const useStyles = createStyles(({ css, token }) => ({
  attachment: css`
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 6px;
    margin-bottom: 6px;
    border-radius: ${token.borderRadiusSM}px;
    background: ${token.colorFillQuaternary};
    color: ${token.colorText};
    font-size: var(--mimir-chat-font-note, 12.5px);
  `,
  image: css`
    display: block;
    flex: none;
    width: auto;
    height: auto;
    max-width: 96px;
    max-height: 64px;
    object-fit: contain;
    border-radius: ${token.borderRadiusSM}px;
    background: ${token.colorBgContainer};
  `,
  description: css`
    flex: 1;
    min-width: 0;
    line-height: 1.5;
    span {
      display: block;
      color: ${token.colorTextSecondary};
    }
  `,
}))
function SnapshotAttachment({ removable }: { removable: boolean }) {
  const { styles } = useStyles()
  const api = useMimirChatApi()
  const attachment = useAuiState((state) => state.attachment)
  if (!snapshotFilename(attachment.name)) return <AttachmentPrimitive.Name />
  const page = attachment.name.match(/^第([1-9]\d*)页/)![1]
  const label = `第${page}页截图`
  const image = attachment.content?.find((part) => part.type === 'image')
  return (
    <AttachmentPrimitive.Root className={styles.attachment}>
      {image?.type === 'image' && <img className={styles.image} src={image.image} alt={label} />}
      <div className={styles.description}>
        {label}
        <span>{removable ? '准备时的页面 · 发送后用于美化' : '准备时的页面'}</span>
      </div>
      {removable && (
        <AttachmentPrimitive.Remove
          onClick={() => api.clearSnapshotAttachmentError?.()}
          render={
            <Button type="text" size="small" icon={<X size={14} />} aria-label={`移除${label}`} />
          }
        />
      )}
    </AttachmentPrimitive.Root>
  )
}
function ComposerSnapshot() {
  return <SnapshotAttachment removable />
}
function MessageSnapshot() {
  return <SnapshotAttachment removable={false} />
}
export const COMPOSER_ATTACHMENT_COMPONENTS = { Attachment: ComposerSnapshot }
export const MESSAGE_ATTACHMENT_COMPONENTS = { Attachment: MessageSnapshot }
