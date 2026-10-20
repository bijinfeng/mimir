import type { MimirDesktopBridge } from '@mimir/shared/desktop'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import {
  PlatformProvider,
  useDesktopBridge,
  useIsDesktop,
  usePlatform,
  type Platform,
} from './platform'

/**
 * 平台契约（D-104）。
 *
 * ## 这几条测的是什么
 *
 * 上一版是模块级单例（`setPlatformSlots` / `getPlatformSlots`），它的 6 个
 * 消费点**一个测试都没有**——换桩要 `vi.resetModules()` 加动态 import，
 * 而且消费组件也得一起重导入（它的闭包持有自己那份模块），成本高到没人写。
 *
 * 改成 Context 之后换桩就是传一个值，所以这些性质第一次变得可测：
 *
 *  1. 两个平台各自读到自己的能力（桌面有桥、浏览器没有）
 *  2. 忘了 Provider 时**响亮地失败**，而不是读到一个 null 继续跑
 *  3. 浏览器端不渲染标题栏
 */

const noop = () => {}

const bridge: MimirDesktopBridge = {
  boot: async () => null,
  quit: noop,
  mode: {
    get: async () => null,
    choose: async () => ({ ok: true as const }),
    activate: noop,
    openSetup: noop,
  },
  update: {
    getState: async () => ({
      status: 'disabled',
      currentVersion: '0.1.0',
      releaseUrl: '',
      platform: 'linux',
      arch: 'x64',
      capability: 'disabled',
      autoDownload: false,
    }),
    open: noop,
    setAppearance: noop,
    onState: () => noop,
    onPrepare: () => noop,
    respondPrepare: noop,
    onPrepareCancelled: () => noop,
  },
  window: {
    platform: 'linux',
    minimize: noop,
    toggleMaximize: noop,
    close: noop,
    isMaximized: async () => false,
    onMaximizeChange: () => noop,
  },
}

/** 渲染一个只负责把 hook 结果写出来的探针 */
async function probe(platform: Platform | null, read: () => ReactNode) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  const Probe = () => <output>{read()}</output>
  const tree =
    platform === null ? (
      <Probe />
    ) : (
      <PlatformProvider platform={platform}>
        <Probe />
      </PlatformProvider>
    )

  await act(async () => root.render(tree))

  const text = host.textContent ?? ''
  await act(async () => root.unmount())
  host.remove()
  return text
}

describe('平台契约', () => {
  it('桌面端读到桥；浏览器端读到 undefined', async () => {
    const onDesktop = await probe(
      { kind: 'desktop', bridge, renderTitleBar: () => null, openAbout: noop },
      () => (useDesktopBridge() === undefined ? '无桥' : '有桥'),
    )
    expect(onDesktop).toBe('有桥')

    const onBrowser = await probe({ kind: 'browser' }, () =>
      useDesktopBridge() === undefined ? '无桥' : '有桥',
    )
    expect(onBrowser).toBe('无桥')
  })

  it('isDesktop 按平台回答（它决定侧栏要不要画自己的顶栏）', async () => {
    expect(
      await probe({ kind: 'desktop', bridge, renderTitleBar: () => null, openAbout: noop }, () =>
        String(useIsDesktop()),
      ),
    ).toBe('true')

    expect(await probe({ kind: 'browser' }, () => String(useIsDesktop()))).toBe('false')
  })

  /**
   * 忘了 Provider 必须**响亮地失败**。
   *
   * 这正是模块级单例那一版做不到的地方：它的 getter 也抛，但抛在首帧 render
   * 里会被路由的 error boundary 吞成一张「出错了」卡片——指不回入口。
   * 这里抛出的消息直接写明该去哪儿改。
   */
  it('没有 Provider 时抛，且消息指向平台入口', async () => {
    await expect(probe(null, () => String(usePlatform().kind))).rejects.toThrow(
      /createApp\(root, platform\)/,
    )
  })
})
