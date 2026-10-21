import { act } from 'react'
import defaultAvatar from '../../../../assets/avatar/default-avatar.svg'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { UserAvatar } from './UserAvatar'

let root: ReturnType<typeof createRoot> | undefined
let host: HTMLDivElement
async function render(src?: string | null) {
  if (!root) {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  }
  await act(async () => root!.render(<UserAvatar src={src} size={26} aria-hidden="true" />))
}
afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  root = undefined
})

describe('UserAvatar', () => {
  it.each([undefined, null, '', '   '])(
    'uses the shared decorative image for empty src %s',
    async (src) => {
      await render(src)
      const image = host.querySelector('img')!
      expect(image.getAttribute('src')).toBe(defaultAvatar)
      expect(image.alt).toBe('')
      expect(image.getAttribute('aria-hidden')).toBe('true')
      expect(host.textContent).toBe('')
    },
  )

  it('preserves custom images and restores the fallback on an actual error event', async () => {
    await render('/api/avatar?v=1')
    const image = host.querySelector('img')!
    expect(image.getAttribute('src')).toBe('/api/avatar?v=1')
    await act(async () => image.dispatchEvent(new Event('error')))
    expect(host.querySelector('img')!.getAttribute('src')).toBe(defaultAvatar)
    await render('blob:local-upload-preview')
    expect(host.querySelector('img')!.getAttribute('src')).toBe('blob:local-upload-preview')
  })
})
