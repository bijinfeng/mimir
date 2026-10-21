import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Action, ErrorNotice } from '../../components/ui'
import { api, errorMessage } from '../../lib/api'
import { setSession } from '../../lib/session'
import { origin } from '../../lib/storage'
export default function LoginPage() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function login() {
    if (busy || !identifier.trim() || !password || !origin) return
    setBusy(true)
    setError('')
    try {
      const result = await api.login({
        identifier: identifier.trim(),
        password,
        deviceName: '微信小程序',
      })
      setSession(result)
      setPassword('')
      await Taro.navigateBack().catch(() => Taro.switchTab({ url: '/pages/chat/index' }))
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <View className="page login-page">
      <View className="login-brand">
        <View className="brand-mark" aria-hidden="true">
          m
        </View>
        <Text className="brand-word">mimir</Text>
      </View>
      <Text className="page-title login-title">登录 Mimir</Text>
      <Text className="block muted section-small">连接固定服务端的现有账号</Text>
      <Text selectable className="server-address">
        {origin || '尚未配置服务端'}
      </Text>
      <View className="form-card">
        <Text className="field-label">邮箱或用户名</Text>
        <Input
          className="field"
          value={identifier}
          maxlength={254}
          disabled={busy}
          placeholder="输入邮箱或用户名"
          onInput={(event) => setIdentifier(event.detail.value)}
        />
        <Text className="field-label">密码</Text>
        <Input
          className="field"
          value={password}
          password
          disabled={busy}
          maxlength={1024}
          placeholder="输入密码"
          confirmType="go"
          onConfirm={() => {
            void login()
          }}
          onInput={(event) => setPassword(event.detail.value)}
        />
      </View>
      <ErrorNotice error={error} />
      <Action
        primary
        disabled={busy || !identifier.trim() || !password || !origin}
        onClick={() => {
          void login()
        }}
      >
        {busy ? '正在登录…' : '登录'}
      </Action>
      {!busy && (!identifier.trim() || !password) && (
        <Text className="block muted section-small login-hint">填写账号和密码后继续</Text>
      )}
      <Text className="block muted section-small">密码仅用于本次登录，不保存在本机。</Text>
    </View>
  )
}
