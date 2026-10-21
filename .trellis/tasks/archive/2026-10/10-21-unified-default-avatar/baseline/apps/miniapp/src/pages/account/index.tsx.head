import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { Action, ErrorNotice } from '../../components/ui'
import { api, errorMessage } from '../../lib/api'
import { useSession, getSession, setSession, sessionReason } from '../../lib/session'
import { origin, clearOwner, ownerDraftCount, ownerDrafts, type NoteDraft } from '../../lib/storage'
import { clearTemporary } from '../../lib/files'
export default function AccountPage() {
  const session = useSession()
  const [status, setStatus] = useState('尚未检测')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<NoteDraft[]>([])
  useDidShow(() => {
    setDrafts(session ? ownerDrafts(session.user.id) : [])
  })
  async function check() {
    if (busy || !session) return
    const owner = session.user.id
    setBusy(true)
    setError('')
    try {
      const current = await api.session()
      if (getSession()?.user.id === owner) {
        setSession({ ...session, ...current })
        setStatus('已连接')
      }
    } catch (error) {
      setStatus('连接未确认')
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  async function logout() {
    if (!session || busy) return
    const count = ownerDraftCount(session.user.id)
    const confirmation = await Taro.showModal({
      title: '退出当前账号？',
      content: count
        ? `本机有 ${count} 份草稿。退出将删除此账号的草稿、操作记录和临时文件，请先保存或复制需要的内容。`
        : '退出会清除当前账号的本机内容、操作记录和临时文件。',
      confirmText: count ? '放弃并退出' : '退出',
      cancelText: '返回',
    })
    if (!confirmation.confirm) return
    setBusy(true)
    setError('')
    try {
      try {
        await api.logout()
      } catch (error) {
        const result = await Taro.showModal({
          title: '服务端撤销未确认',
          content: `${errorMessage(error)} 仍可清除本机凭证并退出；服务端凭证会在有效期结束时失效。`,
          confirmText: '本机退出',
          cancelText: '返回',
        })
        if (!result.confirm) return
      }
      clearTemporary(session.user.id)
      clearOwner(session.user.id)
      setSession(null)
      setStatus('尚未检测')
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <View className="page">
      <Text className="page-title">我的</Text>
      <View className="section">
        <View className="detail-row">
          <Text>服务端</Text>
          <Text className="detail-value" selectable>
            {origin || '未配置'}
          </Text>
        </View>
        <View className="detail-row">
          <Text>连接状态</Text>
          <Text>{session ? status : '未登录'}</Text>
        </View>
        {session && (
          <>
            <View className="detail-row">
              <Text>账号</Text>
              <Text>{session.user.name}</Text>
            </View>
            <View className="detail-row">
              <Text>邮箱</Text>
              <Text className="detail-value">{session.user.email}</Text>
            </View>
            <View className="detail-row">
              <Text>凭证到期</Text>
              <Text>{new Date(session.expiresAt).toLocaleDateString()}</Text>
            </View>
          </>
        )}
      </View>
      <ErrorNotice error={error || (!session ? sessionReason() : '')} />
      <View className="action-row section">
        {session ? (
          <>
            <Action
              disabled={busy}
              onClick={() => {
                void check()
              }}
            >
              {busy ? '处理中…' : '检测连接'}
            </Action>
            <Action
              disabled={busy}
              onClick={() => {
                void logout()
              }}
            >
              退出账号
            </Action>
          </>
        ) : (
          <Action
            primary
            disabled={!origin}
            onClick={() => {
              void Taro.navigateTo({ url: '/pages/login/index' })
            }}
          >
            登录
          </Action>
        )}
      </View>
      {session && drafts.length > 0 && (
        <View className="section">
          <Text className="section-title">本机草稿</Text>
          {drafts.map((draft) => (
            <View
              className="document-row"
              key={draft.identity}
              onClick={() => {
                void Taro.navigateTo({
                  url: `/pages/editor/index?mode=${draft.mode}&id=${encodeURIComponent(draft.documentId || '')}&draft=${encodeURIComponent(draft.identity)}`,
                })
              }}
            >
              <Text className="row-title">
                {draft.title || '未命名笔记'}
                {draft.mode === 'append' ? ' · 追加' : ''}
              </Text>
              <Text className="row-meta">
                {new Date(draft.updatedAt).toLocaleString()}
                {draft.pendingRequestId ? ' · 结果待确认' : ' · 未提交'}
              </Text>
            </View>
          ))}
        </View>
      )}
      <Text className="block muted section">仅支持当前固定实例。配置地址并不代表网络已连通。</Text>
    </View>
  )
}
