import { MimirProvider } from '@mimir/renderer/titlebar-kit'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { normalizeReleaseNotes } from '../../main/release-notes'
import { makeUpdateBridge } from './test-bridge'
import { UpdatePage } from './UpdatePage'

const cleanups: (() => Promise<void>)[] = []
async function render(node: ReactNode) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => root.render(<MimirProvider>{node}</MimirProvider>))
  cleanups.push(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  return host
}
function button(host: HTMLElement, text: string) {
  const result = [...host.querySelectorAll('button')].find(
    (item) => item.textContent?.replace(/\s/g, '') === text.replace(/\s/g, ''),
  )
  if (!result) throw new Error(`Missing button: ${text}`)
  return result
}
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

describe('更新详情交互', () => {
  it('规范化说明保持可读文本，不产生 HTML、远程图片或可点击外链', async () => {
    const { api, calls } = makeUpdateBridge({
      status: 'available',
      releaseNotes: normalizeReleaseNotes(
        '<!-- mimir-desktop-build:abc123 -->\n## 改进\n- **保存**更可靠\n[查看说明](javascript:alert(1))\n<script>alert(1)</script><img src="https://example.com/tracker.png" onerror="alert(1)">',
      ),
    })
    const host = await render(<UpdatePage api={api} />)
    const notes = host.querySelector('[aria-label="更新说明"]')
    expect(notes?.textContent).toBe('更新说明改进\n• 保存更可靠\n查看说明')
    expect(notes?.querySelector('a, img, script, iframe')).toBeNull()
    expect(host.textContent).not.toContain('mimir-desktop-build')
    expect(calls).toEqual([])
  })
  it('只有隐藏注释或空白时不显示空更新说明区块', async () => {
    const { api } = makeUpdateBridge({
      status: 'available',
      releaseNotes: normalizeReleaseNotes(' \n<!-- hidden -->'),
    })
    const host = await render(<UpdatePage api={api} />)
    expect(host.querySelector('[aria-label="更新说明"]')).toBeNull()
    expect(button(host, '下载更新')).toBeDefined()
  })
  it('新版手动下载、稍后关闭、重新打开后仍显示主进程状态', async () => {
    const { api, calls, emit } = makeUpdateBridge({
      status: 'available',
      version: '0.2.0',
      autoDownload: false,
    })
    const host = await render(<UpdatePage api={api} />)
    await act(async () => button(host, '下载更新').click())
    expect(calls).toEqual(['download'])
    await act(async () => emit({ status: 'downloaded' }))
    await act(async () => button(host, '稍后').click())
    expect(calls).toEqual(['download', 'close'])
    const reopened = await render(<UpdatePage api={api} />)
    expect(reopened.textContent).toContain('新版本已准备好')
    await act(async () => button(reopened, '重启并安装').click())
    expect(calls.at(-1)).toBe('install')
  })
  it('未知总量仅显示下载量，100% 下载后准备阶段不能安装', async () => {
    const { api, emit } = makeUpdateBridge({
      status: 'downloading',
      version: '0.2.0',
      progress: { transferred: 1048576 },
    })
    const host = await render(<UpdatePage api={api} />)
    expect(host.textContent).toContain('1.0 MB 已下载')
    expect(host.textContent).not.toContain('%')
    expect(host.querySelector('[role="progressbar"]')).toBeNull()
    await act(async () => emit({ progress: { transferred: 1048576, total: 1048576 } }))
    expect(host.textContent).toContain('100%')
    expect(
      [...host.querySelectorAll('button')].some((item) => item.textContent === '重启并安装'),
    ).toBe(false)
    await act(async () => emit({ status: 'preparing' }))
    expect(button(host, '准备中…').disabled).toBe(true)
  })
  it('macOS 测试包仅打开官方下载入口，不声称下载完成或允许安装', async () => {
    const { api, calls } = makeUpdateBridge({
      status: 'available',
      platform: 'darwin',
      capability: 'manual',
      version: '0.2.0',
    })
    const host = await render(<UpdatePage api={api} />)
    await act(async () => button(host, '下载 macOS 版').click())
    expect(calls).toEqual(['release'])
    expect(host.textContent).toContain('此测试版需要手动更新')
    expect(host.textContent).not.toContain('新版本已准备好')
    expect(host.querySelector('[role="switch"]')).toBeNull()
  })
  it('保存被阻止时返回文档，未知云端必须明确声明已保存才重启', async () => {
    const { api, calls, emit } = makeUpdateBridge({ status: 'blocked' })
    const host = await render(<UpdatePage api={api} />)
    await act(async () => button(host, '返回文档').click())
    expect(calls).toEqual(['document'])
    expect(host.textContent).not.toContain('保存并重启')
    await act(async () => emit({ requiresSaveConfirmation: true }))
    await act(async () => button(host, '已保存，重启并安装').click())
    expect(calls.at(-1)).toBe('install-confirmed')
  })
  it('同帧重复操作只发出一次请求，失败后可再次尝试', async () => {
    const { api } = makeUpdateBridge()
    let attempts = 0
    let reject!: (reason: Error) => void
    api.check = () => {
      attempts++
      return new Promise((_, fail) => {
        reject = fail
      })
    }
    const host = await render(<UpdatePage api={api} />)
    await act(async () => {
      button(host, '检查更新').click()
      button(host, '检查更新').click()
    })
    expect(attempts).toBe(1)
    await act(async () => reject(new Error('offline')))
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('操作没有完成，请重试。')
    await act(async () => button(host, '检查更新').click())
    expect(attempts).toBe(2)
    await act(async () => reject(new Error('offline')))
  })
  it('偏好来自主进程，关闭自动下载说明本次下载仍继续', async () => {
    const { api, calls, emit } = makeUpdateBridge({ status: 'downloading' })
    const host = await render(<UpdatePage api={api} />)
    expect(host.textContent).toContain('本次下载会继续')
    await act(async () => host.querySelector<HTMLButtonElement>('[role="switch"]')?.click())
    expect(calls).toEqual(['autoDownload:false'])
    await act(async () => emit({ autoDownload: false }))
    expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false')
  })
  it('先收到状态推送时忽略迟到初始响应，卸载后清理订阅', async () => {
    const { api, emit } = makeUpdateBridge()
    const old = await api.getState()
    let resolve!: (value: typeof old) => void
    api.getState = () =>
      new Promise((done) => {
        resolve = done
      })
    const host = await render(<UpdatePage api={api} />)
    await act(async () => emit({ status: 'downloaded', version: '0.2.0' }))
    await act(async () => resolve(old))
    expect(host.textContent).toContain('新版本已准备好')
  })
  it('发布说明作为文本展示，开发态不提供安装，Esc 关闭窗口', async () => {
    const { api, calls } = makeUpdateBridge({
      status: 'disabled',
      capability: 'disabled',
      releaseNotes: '<img src=x onerror="alert(1)">',
    })
    const host = await render(<UpdatePage api={api} />)
    expect(document.activeElement).toBe(host.querySelector('h1'))
    expect(host.querySelector('img')).toBeNull()
    expect(host.textContent).toContain('<img')
    expect(
      [...host.querySelectorAll('button')].some((item) => item.textContent === '重启并安装'),
    ).toBe(false)
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(calls).toEqual(['close'])
  })
  it('关闭工作区失败后只给出恢复说明，不提供失效文档或安装入口', async () => {
    const { api } = makeUpdateBridge({
      status: 'blocked',
      recoveryRequired: true,
      message: '请重新启动客户端恢复使用。',
    })
    const host = await render(<UpdatePage api={api} />)
    expect(host.textContent).toContain('请从应用菜单退出 mimir')
    expect(host.textContent).not.toContain('返回文档')
    expect(host.textContent).not.toContain('重试重启')
    expect(button(host, '关闭更新窗口')).toBeDefined()
  })
  it('初始状态读取失败可重试，不把失败当成已是最新', async () => {
    const { api } = makeUpdateBridge()
    const read = api.getState
    api.getState = async () => {
      throw new Error('IPC failed')
    }
    const host = await render(<UpdatePage api={api} />)
    expect(host.textContent).toContain('暂时无法读取更新状态')
    api.getState = read
    await act(async () => button(host, '重试').click())
    expect(host.textContent).toContain('检查是否有新版本')
  })
})
