import Taro from '@tarojs/taro'
import type { MiniappDocument } from '@mimir/shared/miniapp'
import { authHeaders, requireOrigin, handleUnauthorized, ApiError } from './api'
import { getSession } from './session'
import { localKey, readStorage, writeStorage } from './storage'
const temporary = new Map<string, Set<string>>()
export async function protectedDownload(path: string) {
  const ownerId = getSession()?.user.id
  if (!ownerId) throw new Error('请先登录。')
  if (!path.startsWith('/')) throw new Error('资源地址无效。')
  const header = authHeaders()
  const result = await Taro.downloadFile({ url: requireOrigin() + path, header, timeout: 60000 })
  if (result.statusCode !== 200) {
    if (result.tempFilePath) removeFile(result.tempFilePath)
    handleUnauthorized(result.statusCode, header.Authorization)
    throw new ApiError(
      result.statusCode,
      'DOWNLOAD_FAILED',
      `原件下载失败（${result.statusCode}），请重新登录或稍后重试。`,
    )
  }
  if (getSession()?.user.id !== ownerId) {
    removeFile(result.tempFilePath)
    throw new Error('账号已变化，请重新打开资料。')
  }
  const paths =
    temporary.get(ownerId) ||
    new Set<string>(readStorage<string[]>(localKey(ownerId, 'temporary-files')) || [])
  paths.add(result.tempFilePath)
  temporary.set(ownerId, paths)
  try {
    writeStorage(localKey(ownerId, 'temporary-files'), [...paths])
  } catch (error) {
    paths.delete(result.tempFilePath)
    removeFile(result.tempFilePath)
    throw error
  }
  return result.tempFilePath
}
function removeFile(filePath: string) {
  Taro.getFileSystemManager().unlink({ filePath, fail: () => undefined })
}
export function clearTemporary(ownerId: string) {
  const paths = new Set([
    ...(temporary.get(ownerId) || []),
    ...(readStorage<string[]>(localKey(ownerId, 'temporary-files')) || []),
  ])
  paths.forEach(removeFile)
  temporary.delete(ownerId)
  Taro.removeStorageSync(localKey(ownerId, 'temporary-files'))
}
export async function openOriginal(document: MiniappDocument) {
  if (!document.hasOriginal) throw new Error('该资料没有可查看的原件。')
  const extension = (document.fileExtension || '').toLowerCase()
  const supported = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf'] as const
  const fileType = supported.find((item) => item === extension)
  if (!fileType) throw new Error('微信原件查看器暂不支持此格式，可在电脑端打开。')
  const path = await protectedDownload(`/documents/${encodeURIComponent(document.id)}/file`)
  try {
    await Taro.openDocument({ filePath: path, fileType, showMenu: false })
  } catch {
    throw new Error('微信未能打开此原件，请重试或到电脑端查看。')
  }
}
