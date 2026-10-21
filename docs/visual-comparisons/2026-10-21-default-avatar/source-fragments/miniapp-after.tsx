// Exact profile JSX from current HEAD c06f843 / current avatar-only working tree.
import { View, Text } from '@tarojs/components'
import { UserAvatar } from '../../../../apps/miniapp/src/components/user-avatar'
const session = { user: { name: 'admin', email: 'admin@example.com' } }
const status = '尚未检测'
export function Profile() {
  return (
    <View className="profile-card">
      <View className="profile-avatar" aria-hidden="true">
        <UserAvatar />
      </View>
      <View className="profile-text">
        <Text className="profile-name">{session.user.name}</Text>
        <Text className="profile-email">{session.user.email}</Text>
      </View>
      <Text className="profile-status">{status}</Text>
    </View>
  )
}
