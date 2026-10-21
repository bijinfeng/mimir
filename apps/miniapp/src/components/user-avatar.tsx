import { Image } from '@tarojs/components'
import defaultAvatar from '../assets/avatar/default-avatar.png'

/** Native Image uses the raster generated from assets/avatar/default-avatar.svg. */
export function UserAvatar({ size = 48 }: { size?: number }) {
  return (
    <Image
      src={defaultAvatar}
      mode="aspectFit"
      ariaHidden
      style={{ width: `${size}px`, height: `${size}px`, display: 'block', flexShrink: 0 }}
    />
  )
}
