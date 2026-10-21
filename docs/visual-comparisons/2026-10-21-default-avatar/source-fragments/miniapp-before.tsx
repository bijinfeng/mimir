// Exact profile JSX from current HEAD c06f843 / current avatar-only working tree.
import { View, Text } from '@tarojs/components'
const session = { user: { name: 'admin', email: 'admin@example.com' } }
const status = '尚未检测'
const initial = (session.user.name || session.user.email || '?').trim().slice(0, 1).toUpperCase()
export function Profile() {
  return (
    <View className="profile-card">
      <View className="profile-avatar" aria-hidden="true">
        {initial}
      </View>
      <View className="profile-text">
        <Text className="profile-name">{session.user.name}</Text>
        <Text className="profile-email">{session.user.email}</Text>
      </View>
      <Text className="profile-status">{status}</Text>
    </View>
  )
}
