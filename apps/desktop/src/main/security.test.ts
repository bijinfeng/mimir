import { describe, expect, it } from 'vitest'
import { navigationDecision, partitionFor } from './security.js'

describe('桌面 Session 隔离', () => {
  it('本地令牌与云端 localhost、不同云端端口不共用 cookie jar', () => {
    const local = partitionFor('local', 'http://127.0.0.1:43123')
    const cloudA = partitionFor('cloud', 'http://127.0.0.1:3000')
    const cloudB = partitionFor('cloud', 'http://127.0.0.1:4000')
    expect(new Set([local, cloudA, cloudB, partitionFor('setup', 'file:///setup.html')]).size).toBe(
      4,
    )
    expect(partitionFor('cloud', 'http://127.0.0.1:3000')).toBe(cloudA)
  })
})

describe('桌面导航边界', () => {
  const appUrl = 'http://127.0.0.1:43123/docs'

  it('站内路由和文件预览仍可打开', () => {
    expect(navigationDecision(appUrl, 'http://127.0.0.1:43123/settings')).toBe('allow')
    expect(navigationDecision(appUrl, 'http://127.0.0.1:43123/api/documents/1/file')).toBe('allow')
  })

  it('另一 localhost 端口不能接管当前窗口', () => {
    expect(navigationDecision(appUrl, 'http://127.0.0.1:4000/')).toBe('external')
    expect(navigationDecision(appUrl, 'https://example.com/article')).toBe('external')
  })

  it('拒绝 file、javascript 与其他非 web 协议', () => {
    expect(navigationDecision(appUrl, 'file:///etc/passwd')).toBe('block')
    expect(navigationDecision(appUrl, 'javascript:alert(1)')).toBe('block')
    expect(navigationDecision(appUrl, 'mailto:someone@example.com')).toBe('block')
    expect(navigationDecision(appUrl, 'not a url')).toBe('block')
  })

  it('选择页只允许留在自己的 file 地址', () => {
    expect(navigationDecision('file:///app/setup.html', 'file:///app/setup.html#help')).toBe(
      'allow',
    )
    expect(navigationDecision('file:///app/setup.html', 'file:///app/other.html')).toBe('block')
    expect(navigationDecision('file:///app/setup.html', 'file://remote/app/setup.html')).toBe(
      'block',
    )
    expect(navigationDecision('file:///app/setup.html', 'https://example.com')).toBe('block')
  })
})
