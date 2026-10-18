import { useEffect, useState, type PropsWithChildren } from 'react'
import { View, Text, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import Button from '@nutui/nutui-react-taro/dist/es/packages/button'
import '@nutui/nutui-react-taro/dist/es/packages/button/style'
import type { FolderNode } from '@mimir/shared/miniapp'
import { useSession, sessionReason } from '../lib/session'
import { origin } from '../lib/storage'
import { api, errorMessage } from '../lib/api'
import { useOnline } from '../lib/network'
export { Button }
export function Action({
  children,
  onClick,
  disabled = false,
  primary = false,
}: PropsWithChildren<{ onClick: () => void; disabled?: boolean; primary?: boolean }>) {
  return (
    <Button
      type={primary ? 'primary' : 'default'}
      shape="square"
      fill={primary ? 'solid' : 'outline'}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
export function ErrorNotice({ error, onRetry }: { error: string; onRetry?: () => void }) {
  if (!error) return null
  return (
    <View className="notice error" role="alert">
      <Text selectable>{error}</Text>
      {onRetry && (
        <View>
          <Action onClick={onRetry}>重试</Action>
        </View>
      )}
    </View>
  )
}
export function Empty({ children }: PropsWithChildren) {
  return (
    <View className="empty">
      <Text>{children}</Text>
    </View>
  )
}
export function Gate({ children }: PropsWithChildren) {
  const session = useSession()
  const online = useOnline()
  if (!origin)
    return (
      <View className="page">
        <Text className="page-title">尚未配置服务端</Text>
        <Text className="block muted">请在构建时配置固定 HTTPS 域名后重新编译。</Text>
      </View>
    )
  if (!session)
    return (
      <View className="page">
        <Text className="page-title">连接你的知识库</Text>
        <Text className="block muted">{sessionReason() || '使用服务端现有账号登录。'}</Text>
        <View className="section">
          <Action primary onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}>
            登录
          </Action>
        </View>
      </View>
    )
  return (
    <>
      {!online && (
        <View className="network-banner">网络已断开。输入会保留，写入请先查询结果。</View>
      )}
      {children}
    </>
  )
}
export function flattenFolders(items: FolderNode[]): FolderNode[] {
  return items.flatMap((item) => [item, ...flattenFolders(item.children)])
}
export function FolderPicker({
  value,
  onChange,
  folders,
  label = '存入位置',
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  folders: FolderNode[]
  label?: string
  disabled?: boolean
}) {
  const flat = flattenFolders(folders)
  return (
    <Picker
      mode="selector"
      range={flat.map((item) => item.path)}
      value={Math.max(
        0,
        flat.findIndex((item) => item.path === value),
      )}
      disabled={disabled || flat.length === 0}
      onChange={(event) => {
        const item = flat[Number(event.detail.value)]
        if (item) onChange(item.path)
      }}
    >
      <View className="picker-row">
        <Text className="muted">{label}</Text>
        <Text>{value || (flat.length ? '选择已有目录' : '尚无目录，请先在电脑端创建')}</Text>
      </View>
    </Picker>
  )
}
export function useFolders(enabled = true) {
  const session = useSession()
  const owner = session?.user.id
  const [folders, setFolders] = useState<FolderNode[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    if (enabled && owner)
      api
        .folders()
        .then((result) => {
          if (live) {
            setFolders(result.items)
            setError('')
          }
        })
        .catch((error) => {
          if (live) setError(errorMessage(error))
        })
    return () => {
      live = false
    }
  }, [enabled, owner])
  return { folders, error }
}
