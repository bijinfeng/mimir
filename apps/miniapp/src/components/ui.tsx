import { useEffect, useState, type PropsWithChildren } from 'react'
import { View, Text } from '@tarojs/components'
import Picker from '@nutui/nutui-react-taro/dist/es/packages/picker'
import EmptyView from '@nutui/nutui-react-taro/dist/es/packages/empty'
import LoadingView from '@nutui/nutui-react-taro/dist/es/packages/loading'
import '@nutui/nutui-react-taro/dist/es/packages/picker/style'
import '@nutui/nutui-react-taro/dist/es/packages/empty/style'
import '@nutui/nutui-react-taro/dist/es/packages/loading/style'
import Taro from '@tarojs/taro'
import Button from '@nutui/nutui-react-taro/dist/es/packages/button'
import '@nutui/nutui-react-taro/dist/es/packages/button/style'
import type { FolderNode } from '@mimir/shared/miniapp'
import { useSession, sessionReason } from '../lib/session'
import { origin } from '../lib/storage'
import { api, errorMessage } from '../lib/api'
import { useOnline } from '../lib/network'
import { MiniappBrandMark } from './BrandMark'
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
  return <EmptyView className="empty" image={null} description={<Text>{children}</Text>} />
}
export function Loading({ children }: PropsWithChildren) {
  return (
    <View className="loading">
      <LoadingView>{children}</LoadingView>
    </View>
  )
}
export function Gate({ children }: PropsWithChildren) {
  const session = useSession()
  const online = useOnline()
  if (!origin)
    return (
      <View className="page gate-page">
        <View className="gate-brand">
          <MiniappBrandMark />
          <Text className="brand-word">mimir</Text>
        </View>
        <View className="gate-main">
          <Text className="gate-title">尚未配置服务端</Text>
          <Text className="gate-desc">请在构建时配置固定 HTTPS 域名后重新编译。</Text>
        </View>
      </View>
    )
  if (!session)
    return (
      <View className="page gate-page">
        <View className="gate-brand">
          <MiniappBrandMark />
          <Text className="brand-word">mimir</Text>
        </View>
        <View className="gate-main">
          <Text className="gate-title">连接你的知识库</Text>
          <Text className="gate-desc">{sessionReason() || '使用服务端现有账号登录。'}</Text>
          <View className="gate-card">
            <Text className="gate-label">服务端</Text>
            <Text selectable className="gate-origin">
              {origin}
            </Text>
            <View className="gate-action">
              <Action primary onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}>
                登录
              </Action>
            </View>
            <Text className="gate-hint">登录后，笔记、资料和对话都来自这个服务器。</Text>
          </View>
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
export function SelectField({
  title,
  value,
  options,
  onChange,
  disabled = false,
  children,
}: {
  title: string
  value: string
  options: { label: string; value: string }[]
  onChange: (value: string) => void
  disabled?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <View onClick={() => !disabled && setOpen(true)}>{children}</View>
      <Picker
        visible={open}
        title={title}
        options={[options]}
        value={[value]}
        closeOnOverlayClick
        onConfirm={(_selected, values) => {
          onChange(String(values[0] ?? ''))
          setOpen(false)
        }}
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
      />
    </>
  )
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
    <SelectField
      title={label}
      value={value}
      options={[
        { label: flat.length ? '选择已有目录' : '尚无目录，请先在电脑端创建', value: '' },
        ...flat.map((item) => ({ label: item.path, value: item.path })),
      ]}
      disabled={disabled || flat.length === 0}
      onChange={onChange}
    >
      <View className="picker-row">
        <Text className="muted">{label}</Text>
        <Text>{value || (flat.length ? '选择已有目录' : '尚无目录，请先在电脑端创建')}</Text>
      </View>
    </SelectField>
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
