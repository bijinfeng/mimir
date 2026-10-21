import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import defaultAvatar from '../../../../assets/avatar/default-avatar.svg'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountRow } from './nav/AccountRow'
import { AccountSection } from './settings/AccountSection'
import { MimirProvider } from '../theme/MimirProvider'
import { api } from '../lib/api'

vi.mock('./AvatarCropper', () => ({
  AvatarCropper: ({ onConfirm }: { onConfirm: (value: unknown) => void }) => (
    <button
      onClick={() => onConfirm({ blob: new Blob(['image']), previewUrl: 'blob:upload-preview' })}
    >
      确认裁切
    </button>
  ),
}))
let root: ReturnType<typeof createRoot> | undefined
let host: HTMLDivElement
let client: QueryClient
const noop = () => undefined
async function mount(name: string, image: string | null = null) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  client.setQueryData(['session'], {
    user: { id: 'admin', name, email: 'admin@example.com', image },
  })
  client.setQueryData(['config'], { localMode: false })
  await act(async () =>
    root!.render(
      <MimirProvider>
        <QueryClientProvider client={client}>
          <AccountRow
            collapsed={false}
            narrowViewport={false}
            settingsActive={false}
            signingOut={false}
            signoutError={false}
            onSignOut={noop}
            onOpenAccount={noop}
            onOpenSettings={noop}
            onOpenStats={noop}
          />
          <AccountSection />
        </QueryClientProvider>
      </MimirProvider>,
    ),
  )
}
async function waitFor(assertion: () => void) {
  await act(async () => {
    await vi.waitFor(assertion)
  })
}
afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  client?.clear()
  vi.restoreAllMocks()
})

describe('account avatar entry points', () => {
  it.each(['admin', '张三', 'Zoë'])(
    'shows the same graphic for display name %s in sidebar, menu and settings',
    async (name) => {
      await mount(name)
      await act(async () =>
        host.querySelector<HTMLButtonElement>(`button[aria-label="${name}，账号菜单"]`)!.click(),
      )
      await waitFor(() => expect(document.querySelectorAll('.ant-avatar')).toHaveLength(3))
      const avatars = [...document.querySelectorAll('.ant-avatar')]
      expect(avatars).toHaveLength(3)
      for (const avatar of avatars) {
        expect(avatar.textContent).toBe('')
        expect(avatar.querySelector('img')!.getAttribute('src')).toBe(defaultAvatar)
      }
      expect(host.querySelector('[aria-label="更换头像"]')!.getAttribute('tabindex')).toBe('0')
    },
  )

  it('keeps the selected crop preview while its upload is pending and releases it after failure', async () => {
    let rejectUpload!: (error: Error) => void
    const upload = new Promise<never>((_resolve, reject) => {
      rejectUpload = reject
    })
    vi.spyOn(api.avatar, 'upload').mockReturnValue(upload)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    await mount('admin', '/api/avatar?v=1')
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', {
      value: [new File(['image'], 'avatar.png', { type: 'image/png' })],
    })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    await waitFor(() => expect(host.textContent).toContain('确认裁切'))
    const confirm = [...host.querySelectorAll('button')].find(
      (node) => node.textContent === '确认裁切',
    )!
    await act(async () => confirm.click())
    await waitFor(() => expect(api.avatar.upload).toHaveBeenCalledOnce())
    expect(host.querySelector('[aria-label="更换头像"] img')!.getAttribute('src')).toBe(
      'blob:upload-preview',
    )
    await act(async () => rejectUpload(new Error('上传失败')))
    await waitFor(() =>
      expect(host.querySelector('[aria-label="更换头像"] img')!.getAttribute('src')).toBe(
        '/api/avatar?v=1',
      ),
    )
    expect(revoke).toHaveBeenCalledWith('blob:upload-preview')
  })
})
