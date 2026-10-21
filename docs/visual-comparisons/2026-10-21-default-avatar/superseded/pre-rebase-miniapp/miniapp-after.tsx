// Exact account JSX fragments extracted from the two source baselines; only data is fixed.
import { View, Text } from '@tarojs/components'
import Avatar from '@nutui/nutui-react-taro/dist/es/packages/avatar'
import { UserAvatar } from '../../../../apps/miniapp/src/components/user-avatar'
const session = { user: { name: 'admin', email: 'admin@example.com' } }
const status = '尚未检测'
export function Profile() {
  return (
    <View className="profile-card">
      <Avatar className="profile-avatar" size="48">
        <UserAvatar />
      </Avatar>
      <View className="profile-text">
        <Text className="profile-name">{session.user.name}</Text>
        <Text className="profile-email">{session.user.email}</Text>
      </View>
      <Text className="profile-status">{status}</Text>
    </View>
  )
}
export function HeadAccountRow() {
  return (
    <View className="detail-row">
      <Text>账号</Text>
      <View style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <UserAvatar size={32} />
        <Text>{session.user.name}</Text>
      </View>
    </View>
  )
}
