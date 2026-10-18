import Taro from '@tarojs/taro'
import type { Citation, RetrievalScope } from '@mimir/shared/miniapp'
import { getSession } from './session'
import { localKey, writeStorage } from './storage'
export function openReader(id: string, citation?: Citation) {
  const owner = getSession()?.user.id
  if (citation && owner) writeStorage(localKey(owner, `citation:${id}`), citation)
  return Taro.navigateTo({
    url: `/pages/reader/index?id=${encodeURIComponent(id)}${citation ? '&citation=1' : ''}`,
  })
}
export async function askScope(scope: RetrievalScope, label: string) {
  const owner = getSession()?.user.id
  if (owner) writeStorage(localKey(owner, 'nextScope'), { scope, label })
  await Taro.switchTab({ url: '/pages/chat/index' })
}
export function editorUrl(mode: 'new' | 'edit' | 'append' | 'metadata', id = '', folder = '') {
  return `/pages/editor/index?mode=${mode}&id=${encodeURIComponent(id)}&folder=${encodeURIComponent(folder)}`
}
export function scopeLabel(scope?: RetrievalScope) {
  if (!scope || scope.type === 'all') return '全库'
  return scope.type === 'folder' ? scope.path : '当前文档'
}
