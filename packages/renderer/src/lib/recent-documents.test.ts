import { beforeEach, describe, expect, it } from 'vitest'
import { readRecentIds, recordRecentDocument } from './recent-documents'

beforeEach(() => localStorage.clear())

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
