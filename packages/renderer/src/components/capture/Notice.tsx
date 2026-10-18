import type { ReactNode } from 'react'
import { CircleCheck, CircleHelp, CircleX } from 'lucide-react'
import { useCaptureStyles } from './styles'

export function CaptureNotice({
  children,
  tone = 'info',
}: {
  children: ReactNode
  tone?: 'info' | 'success' | 'warning' | 'error'
}) {
  const { styles } = useCaptureStyles()
  const Icon = tone === 'success' ? CircleCheck : tone === 'error' ? CircleX : CircleHelp
  return (
    <div className={styles.notice} data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={16} aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}
