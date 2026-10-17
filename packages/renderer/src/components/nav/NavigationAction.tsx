import { Button, Tooltip } from 'antd'
import type { ReactNode, Ref } from 'react'
import { useStyles } from '../NavSidebar.style'

/** Module-level component: event callbacks must not be called by render helpers. */
export function NavigationAction({
  label,
  icon,
  onClick,
  active = false,
  compact = false,
  buttonRef,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
  active?: boolean
  compact?: boolean
  buttonRef?: Ref<HTMLButtonElement>
}) {
  const { styles } = useStyles()
  const control = (
    <Button
      type="text"
      className={`${compact ? styles.railButton : styles.primaryButton} ${active ? styles.railActive : ''}`}
      icon={icon}
      aria-label={compact ? label : undefined}
      aria-current={active ? 'page' : undefined}
      ref={buttonRef}
      onClick={(event) => {
        event.currentTarget.focus()
        onClick()
      }}
    >
      {compact ? undefined : label}
    </Button>
  )
  return compact ? (
    <Tooltip title={label} placement="right">
      {control}
    </Tooltip>
  ) : (
    control
  )
}
