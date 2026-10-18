import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import Button from '@nutui/nutui-react-taro/dist/es/packages/button'
import '@nutui/nutui-react-taro/dist/es/packages/button/style'

export default function ChatPage() {
  return (
    <View className="page">
      <View className="page-heading">
        <Text className="page-title">向知识库提问</Text>
      </View>
      <View className="status-block">
        <Text className="status-title">问答尚未接入</Text>
        <Text className="muted">连接账号后，才能检索资料和继续会话。</Text>
      </View>
      <Button
        type="primary"
        shape="square"
        fill="solid"
        onClick={() => Taro.switchTab({ url: '/pages/account/index' })}
      >
        查看连接状态
      </Button>
    </View>
  )
}
