import { Text, View } from '@tarojs/components'

export default function AccountPage() {
  return (
    <View className="page">
      <View className="page-heading">
        <Text className="page-title">我的</Text>
      </View>
      <View className="detail-row">
        <Text>服务端</Text>
        <Text className="detail-value">{MIMIR_SERVER_ORIGIN || '尚未配置'}</Text>
      </View>
      <View className="detail-row">
        <Text>账号</Text>
        <Text className="muted">尚未接入登录</Text>
      </View>
      <Text className="connection-note muted">
        {MIMIR_SERVER_ORIGIN ? '已配置服务端地址，尚未验证连接。' : '服务端地址将在部署时配置。'}
      </Text>
    </View>
  )
}
