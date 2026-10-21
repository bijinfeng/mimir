/** Actual renderer components; session/config data are fixed capture fixtures. */
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AccountRow } from '../../../packages/renderer/src/components/nav/AccountRow'
import { AccountSection } from '../../../packages/renderer/src/components/settings/AccountSection'
import { MimirProvider } from '../../../packages/renderer/src/theme/MimirProvider'
import { UserAvatar } from '../../../packages/renderer/src/components/UserAvatar'
import { Avatar } from 'antd'
import { useTheme } from 'antd-style'
import { FONT_SIZE } from '../../../packages/renderer/src/theme/tokens'

const params = new URLSearchParams(location.search)
const state = params.get('state') ?? 'default'
const photo =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#e9d5b1"/><circle cx="32" cy="27" r="15" fill="#725748"/><path d="M4 64Q4 39 32 39T60 64" fill="#436271"/></svg>',
  )
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
})
client.setQueryData(['session'], {
  user: {
    id: 'admin',
    name: 'admin',
    email: 'admin@example.com',
    image: state === 'custom' ? photo : state === 'failed' ? '/missing-custom-avatar.png' : null,
  },
})
client.setQueryData(['config'], { localMode: false })
const noop = () => undefined
const props = {
  narrowViewport: false,
  settingsActive: false,
  signingOut: false,
  signoutError: false,
  onSignOut: noop,
  onOpenAccount: noop,
  onOpenSettings: noop,
  onOpenStats: noop,
}
function Capture() {
  const token = useTheme()
  return (
    <main
      style={{
        padding: 24,
        height: '100%',
        background: token.colorBgLayout,
        color: token.colorText,
      }}
    >
      <h1 style={{ fontSize: FONT_SIZE.pageTitle, margin: '0 0 8px' }}>账号头像 · 真实组件</h1>
      <p style={{ color: token.colorTextSecondary, margin: '0 0 28px' }}>
        admin · admin@example.com
      </p>
      <div style={{ display: 'flex', gap: 28 }}>
        <section
          style={{
            width: 256,
            background: token.tintNav,
            padding: 8,
            height: 410,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
          data-surface="expanded"
        >
          <AccountRow {...props} collapsed={false} />
        </section>
        <section
          style={{
            width: 52,
            background: token.tintNav,
            height: 410,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
          data-surface="collapsed"
        >
          <AccountRow {...props} collapsed />
        </section>
        <section style={{ flex: 1, minWidth: 0 }} data-surface="settings">
          <AccountSection />
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '36px 16px' }}>
            {[16, 20, 26, 28, 52].map((size) => (
              <div key={size} style={{ textAlign: 'center' }}>
                {params.get('stage') === 'before' ? (
                  <Avatar size={size}>A</Avatar>
                ) : (
                  <UserAvatar size={size} />
                )}
                <div
                  style={{
                    marginTop: 8,
                    fontSize: FONT_SIZE.meta,
                    color: token.colorTextSecondary,
                  }}
                >
                  {size}px
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(
  <MimirProvider>
    <QueryClientProvider client={client}>
      <Capture />
    </QueryClientProvider>
  </MimirProvider>,
)
