import { Avatar, type AvatarProps } from 'antd'
import type { AriaAttributes } from 'react'
import defaultAvatar from '../../../../assets/avatar/default-avatar.svg'

type UserAvatarProps = Pick<AvatarProps, 'size' | 'className' | 'alt'> &
  Pick<AriaAttributes, 'aria-hidden'> & {
    src?: string | null
  }

/** One identity-neutral fallback; antd restores it when a custom image fails to load. */
export function UserAvatar({ src, ...props }: UserAvatarProps) {
  return (
    <Avatar
      {...props}
      src={src?.trim() || undefined}
      icon={<img src={defaultAvatar} alt="" aria-hidden="true" draggable={false} />}
    />
  )
}
