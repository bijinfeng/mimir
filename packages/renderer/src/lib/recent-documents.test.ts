import type { DocumentDetail } from '@mimir/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadRecentDocuments, readRecentIds, recordRecentDocument } from './recent-documents'
import { api, ApiRequestError } from './api'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())
const note = (id: string) => ({ id, title: id, kind: 'note' }) as DocumentDetail

describe('最近打开的文档', () => {
  it('按账号隔离，并把再次打开的文档移到最前', () => {
    recordRecentDocument('alice', 'one')
    recordRecentDocument('alice', 'two')
    recordRecentDocument('bob', 'other')
    recordRecentDocument('alice', 'one')

    expect(readRecentIds('alice')).toEqual(['one', 'two'])
    expect(readRecentIds('bob')).toEqual(['other'])
  })

  it('限制容量，损坏的浏览器存储不阻断导航', () => {
    for (let index = 0; index < 20; index += 1) recordRecentDocument('alice', String(index))
    expect(readRecentIds('alice')).toHaveLength(12)
    expect(readRecentIds('alice')[0]).toBe('19')

    localStorage.setItem('mimir.recent-documents.alice', 'invalid-json')
    expect(readRecentIds('alice')).toEqual([])
  })
})

describe('最近记录的授权与暂时读取失败', () => {
  it('保留获准项的顺序，权限与404剔除，网络/5xx计为可重试失败', async () => {
    const ids = ['one', 'forbidden', 'missing', 'offline', 'server', 'two']
    localStorage.setItem('mimir.recent-documents.admin', JSON.stringify(ids))
    vi.spyOn(api.documents, 'get').mockImplementation(async (id) => {
      if (id === 'forbidden') throw new ApiRequestError(403, 'FORBIDDEN', '不可显示')
      if (id === 'missing') throw new ApiRequestError(404, 'NOT_FOUND', '已删除')
      if (id === 'offline') throw new TypeError('Failed to fetch')
      if (id === 'server') throw new ApiRequestError(503, 'UNAVAILABLE', '暂时不可用')
      return note(id)
    })
    const result = await loadRecentDocuments('admin')
    expect(result.items.map((item) => item.id)).toEqual(['one', 'two'])
    expect(result.retryableFailureCount).toBe(2)
    expect(readRecentIds('admin')).toEqual(ids)
  })

  it('401不伪装为空或部分成功；暂时失败重试后重新取服务端真相', async () => {
    recordRecentDocument('admin', 'one')
    const get = vi.spyOn(api.documents, 'get')
    const authError = new ApiRequestError(401, 'UNAUTHORIZED', '请重新登录')
    get.mockRejectedValueOnce(authError)
    await expect(loadRecentDocuments('admin')).rejects.toBe(authError)
    get.mockRejectedValueOnce(new Error('offline'))
    expect(await loadRecentDocuments('admin')).toEqual({
      items: [],
      retryableFailureCount: 1,
      storageUnavailable: false,
    })
    get.mockResolvedValueOnce(note('one'))
    expect(await loadRecentDocuments('admin')).toEqual({
      items: [note('one')],
      retryableFailureCount: 0,
      storageUnavailable: false,
    })
  })
})

it('本机记录读取异常与损坏不冒充真实空列表，恢复后仍按授权读取原ID', async () => {
  const get = vi.spyOn(api.documents, 'get').mockResolvedValue(note('one'))
  localStorage.setItem('mimir.recent-documents.admin', '{bad-json')
  expect(await loadRecentDocuments('admin')).toEqual({
    items: [],
    retryableFailureCount: 0,
    storageUnavailable: true,
  })
  expect(get).not.toHaveBeenCalled()
  localStorage.setItem('mimir.recent-documents.admin', JSON.stringify(['one']))
  expect(await loadRecentDocuments('admin')).toEqual({
    items: [note('one')],
    retryableFailureCount: 0,
    storageUnavailable: false,
  })
  const storageRead = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
    throw new DOMException('disabled', 'SecurityError')
  })
  expect(await loadRecentDocuments('admin')).toEqual({
    items: [],
    retryableFailureCount: 0,
    storageUnavailable: true,
  })
  storageRead.mockRestore()
})
