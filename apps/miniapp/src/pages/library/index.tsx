import { Text, View } from '@tarojs/components'

export default function LibraryPage() {
  return (
    <View className="page">
      <View className="page-heading">
        <Text className="page-title">知识库</Text>
      </View>
      <View className="status-block">
        <Text className="status-title">尚未读取资料</Text>
        <Text className="muted">账号连接完成后，这里会显示已有知识库和文档。</Text>
      </View>
    </View>
  )
}
